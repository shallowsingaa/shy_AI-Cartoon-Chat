'use strict';

/*
 * 加载 Live2D 模型（Cubism 3/4），支持多模型随时切换。
 * 每个模型在 MODEL_CONFIGS 中声明自己的：模型路径、主题 class、表情/动作参数映射、能力、欢迎语。
 * 切换模型时会销毁并重建 PIXI 实例。
 * 依赖：PIXI（pixi.js v6）、Live2DCubismCore、PIXI.live2d。
 */
(function () {
  // ===== 模型配置 =====
  const MODEL_CONFIGS = {
    yumi: {
      id: 'yumi',
      name: 'Yumi',
      modelUrl: 'model/yumi/yumi.model3.json',
      theme: 'theme-yumi',
      // 表情/发型参数映射（yumi 专属）。face 为 null 表示该模型不支持自定义表情。
      face: {
        mouth: { tongue: 'Paramshita', crooked: 'ParamMouthX', cat: 'ParamMouthShrug' },
        eyes: { star: 'Paramxingxing', mosquito: 'Paramwenxiang', heart: 'Paramheart', teary: 'Paramleiwangwang' },
        deco: { eyepatch: 'Paramyanzhao', dog: 'Paramxiaogou', tears: 'Paramtear', black: 'Paramheilian' },
        preset: {
          happy: { eyes: 'star' },
          sad: { eyes: 'teary' },
          angry: { deco: ['black'] },
          shy: { mouth: 'cat' },
          surprised: { eyes: 'heart' },
          thinking: { eyes: 'mosquito' },
          neutral: null,
        },
        hair: { param: 'Paramlonghair', param2: 'Paramlonghair2' },
      },
      actions: { wave: 0, tear: 1 },
      motionDuration: { wave: 4.5, tear: 5 },
      motionResetParams: ['ParamarmupL', 'Paramanime', 'Paramanime2', 'Paramanime3'],
      welcome: '嗨～我是 Yumi！今天过得开心吗？有什么想和我聊的呀 (｡•ᴗ•｡)',
      proactive: '（你已经有一小会儿没和用户说话了。请主动找一个有趣、轻松、可爱的话题和用户聊起来，比如问问 ta 今天的心情、最近在听什么歌、喜欢什么零食等。语气要像 Yumi 主动搭话，简短自然，1-3 句话，直接输出你说的话。）',
      posY: 0, // 该模型相对默认的向下基线偏移（像素），切换时自动应用
      // 切换后界面上动态显示的称谓文本
      headerIcon: '🎀',
      subtitle: '和软软的少女说说话吧～',
      listeningTip: '说点什么吧，Yumi 在听哦～',
      thinkingLabel: 'Yumi 正在思考…',
      panelLabel: 'Yumi',
    },
    no4: {
      id: 'no4',
      name: '诺亚',
      modelUrl: 'model/no4/no4.model3.json',
      theme: 'theme-no4',
      face: null, // 基础模型不支持自定义表情/发型
      actions: { sweat: 0 },
      motionDuration: { sweat: 4 },
      motionResetParams: [],
      welcome: '……有事？我不太爱多说话。不过你要聊，我奉陪。',
      proactive: '（你有一会儿没理用户了。用少年正太、酷酷的语气主动搭个话，简短，1-3 句，直接说，不要卖萌撒娇。）',
      posYRatio: 1 / 6, // 诺亚整体下移约 1/6 屏幕高度（按容器高度比例，随屏幕自适应）
      // 切换后界面上动态显示的称谓文本
      headerIcon: '💙',
      subtitle: '和酷酷的少年聊聊吧～',
      listeningTip: '说点什么吧，诺亚在这听着。',
      thinkingLabel: '诺亚正在思考…',
      panelLabel: '诺亚',
    },
  };

  const MODEL_KEY = 'yumi_model_select';
  const IS_MOBILE = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  let currentModelId = 'yumi';
  try { const s = localStorage.getItem(MODEL_KEY); if (s && MODEL_CONFIGS[s]) currentModelId = s; } catch (e) { /* 忽略 */ }
  let currentConfig = MODEL_CONFIGS[currentModelId];

  // ===== 通用状态（两模型共享）=====
  const SWAY_KEY = 'yumi_sway';
  let swayOn = false;
  try { if (localStorage.getItem(SWAY_KEY) === '1') swayOn = true; } catch (e) { /* 忽略 */ }

  // 左侧人物位置 / 缩放
  const POS_KEY = 'yumi_model_pos';
  let offsetX = 0, offsetY = 0, scaleFactor = 1, baseHeight = 0;

  // yumi 专属：发型
  const HAIR_KEY = 'yumi_hair';
  let hairState = 'long';
  try { const h = localStorage.getItem(HAIR_KEY); if (h) hairState = h; } catch (e) { /* 忽略 */ }

  // yumi 专属：表情
  const FACE_KEY = 'yumi_face';
  const faceState = { mouth: null, eyes: null, deco: [] };

  let app = null, model = null, lipSyncOn = false, tickerFn = null;
  let resetTimer = null, swingOn = false, swingTicker = null;
  let loadGeneration = 0;
  let resizeFrame = 0;

  // ===== 位置 / 缩放 =====
  function loadPos() {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
      if (typeof p.x === 'number') offsetX = p.x;
      if (typeof p.y === 'number') offsetY = p.y;
      if (typeof p.scale === 'number') scaleFactor = p.scale;
    } catch (e) { /* 忽略 */ }
  }
  function savePos() {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: offsetX, y: offsetY, scale: scaleFactor })); } catch (e) { /* 忽略 */ }
  }
  loadPos();

  function loadFace() {
    if (!currentConfig.face) return;
    try {
      const f = JSON.parse(localStorage.getItem(FACE_KEY) || 'null');
      if (f) {
        if ('mouth' in f) faceState.mouth = f.mouth || null;
        if ('eyes' in f) faceState.eyes = f.eyes || null;
        faceState.deco = Array.isArray(f.deco) ? f.deco.slice() : [];
      }
    } catch (e) { /* 忽略 */ }
  }
  loadFace();

  function saveFace() {
    try { localStorage.setItem(FACE_KEY, JSON.stringify(faceState)); } catch (e) { /* 忽略 */ }
  }

  function motionPriority() {
    return (PIXI.live2d && PIXI.live2d.MotionPriority) ? PIXI.live2d.MotionPriority.FORCE : 3;
  }

  function fitModel(container) {
    if (!model) return;
    if (!baseHeight) baseHeight = model.height;
    const h = container.clientHeight || 1;
    const w = container.clientWidth || 1;
    const scale = (h * 0.95) / baseHeight * scaleFactor;
    model.scale.set(scale);
    model.anchor.set(0.5, 1);
    const baseY = (currentConfig.posY || 0) + (currentConfig.posYRatio || 0) * h;
    model.x = w / 2 + offsetX;
    model.y = h * 0.99 + offsetY + baseY;
  }

  function reposition() {
    if (!model) return;
    const container = document.getElementById('live2d-canvas');
    if (!container) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const baseY = (currentConfig.posY || 0) + (currentConfig.posYRatio || 0) * h;
    model.x = w / 2 + offsetX;
    model.y = h * 0.99 + offsetY + baseY;
  }

  function setOffset(x, y) { offsetX = Number(x) || 0; offsetY = Number(y) || 0; savePos(); reposition(); }
  function getOffset() { return { x: offsetX, y: offsetY }; }
  function setScale(v) {
    scaleFactor = Math.min(3, Math.max(0.1, Number(v) || 1));
    savePos();
    if (model) { const c = document.getElementById('live2d-canvas'); if (c) fitModel(c); }
  }
  function getScale() { return scaleFactor; }

  // ===== 主题 =====
  function applyTheme() {
    const cls = (document.body.className || '').replace(/theme-\S+/g, '').trim();
    document.body.className = (cls + ' ' + currentConfig.theme).trim();
  }

  // ===== 表情（仅 face 模型）=====
  function applyFace() {
    if (!model || !currentConfig.face) return;
    const core = model.internalModel && model.internalModel.coreModel;
    if (!core) return;
    const f = currentConfig.face;
    const ALL = [].concat(Object.values(f.mouth), Object.values(f.eyes), Object.values(f.deco));
    try {
      for (let i = 0; i < ALL.length; i++) core.setParameterValueById(ALL[i], 0);
      if (faceState.mouth && f.mouth[faceState.mouth]) core.setParameterValueById(f.mouth[faceState.mouth], 1);
      if (faceState.eyes && f.eyes[faceState.eyes]) core.setParameterValueById(f.eyes[faceState.eyes], 1);
      for (let i = 0; i < faceState.deco.length; i++) {
        const k = faceState.deco[i];
        if (f.deco[k]) core.setParameterValueById(f.deco[k], 1);
      }
    } catch (e) { /* 模型无该参数则忽略 */ }
  }
  function setMood(mood) {
    const f = currentConfig.face;
    if (!f || !f.preset) return;
    const preset = f.preset[mood];
    if (!preset) return;
    if ('mouth' in preset) faceState.mouth = preset.mouth || null;
    if ('eyes' in preset) faceState.eyes = preset.eyes || null;
    if ('deco' in preset) faceState.deco = Array.isArray(preset.deco) ? preset.deco.slice() : [];
    saveFace(); applyFace();
  }
  function setFaceMouth(key) { if (!currentConfig.face) return; if (key !== null && !currentConfig.face.mouth[key]) return; faceState.mouth = key; saveFace(); applyFace(); }
  function setFaceEyes(key) { if (!currentConfig.face) return; if (key !== null && !currentConfig.face.eyes[key]) return; faceState.eyes = key; saveFace(); applyFace(); }
  function toggleFaceDeco(key) {
    if (!currentConfig.face) return;
    if (!currentConfig.face.deco[key]) return;
    const i = faceState.deco.indexOf(key);
    if (i >= 0) faceState.deco.splice(i, 1); else faceState.deco.push(key);
    saveFace(); applyFace();
  }
  function getFace() { return { mouth: faceState.mouth, eyes: faceState.eyes, deco: faceState.deco.slice() }; }

  // ===== 发型（仅 face 模型）=====
  function applyHair() {
    if (!model || !currentConfig.face || !currentConfig.face.hair) return;
    const core = model.internalModel && model.internalModel.coreModel;
    if (!core) return;
    try {
      const h = currentConfig.face.hair;
      let a = 0, b = 0;
      if (hairState === 'short1') a = 1; else if (hairState === 'short2') b = 1;
      core.setParameterValueById(h.param, a);
      if (h.param2) core.setParameterValueById(h.param2, b);
    } catch (e) { /* 忽略 */ }
  }
  function setHair(type) {
    if (!currentConfig.face || !currentConfig.face.hair) return;
    if (type !== 'long' && type !== 'short1' && type !== 'short2') return;
    hairState = type;
    try { localStorage.setItem(HAIR_KEY, type); } catch (e) { /* 忽略 */ }
    applyHair();
  }
  function getHair() { return (currentConfig.face && currentConfig.face.hair) ? hairState : null; }

  // ===== 自主动作：摇摆（两模型通用，标准身体参数）=====
  function applyActions() {
    if (!model) return;
    const core = model.internalModel && model.internalModel.coreModel;
    if (!core) return;
    try {
      if (swayOn) {
        const t = performance.now() / 1000;
        const z = Math.sin(t * 2.2) * 6;
        const y = Math.sin(t * 1.1) * 3;
        core.setParameterValueById('ParamBodyAngleZ', z);
        core.setParameterValueById('ParamAngleZ', z * 0.5);
        core.setParameterValueById('ParamBodyAngleY', y);
      } else {
        core.setParameterValueById('ParamBodyAngleZ', 0);
        core.setParameterValueById('ParamAngleZ', 0);
        core.setParameterValueById('ParamBodyAngleY', 0);
      }
    } catch (e) { /* 模型无该参数则忽略 */ }
  }
  function setSway(on) {
    swayOn = !!on;
    try { localStorage.setItem(SWAY_KEY, swayOn ? '1' : '0'); } catch (e) {}
    applyActions();
    if (app) {
      app.ticker.remove(applyPersistentState);
      if (currentConfig.face || swayOn) app.ticker.add(applyPersistentState);
    }
  }
  function getActions() { return { sway: swayOn }; }

  // ===== 动作播放（按当前模型的 actions 映射）=====
  function resetAfterMotion() {
    if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    if (!model) return;
    try {
      if (model.motionManager) model.motionManager.stopAllMotions();
      const core = model.internalModel && model.internalModel.coreModel;
      if (core) {
        const ps = currentConfig.motionResetParams || [];
        for (let i = 0; i < ps.length; i++) core.setParameterValueById(ps[i], 0);
      }
    } catch (e) { /* 忽略 */ }
  }
  function playAction(action) {
    if (!model) return;
    const idx = currentConfig.actions ? currentConfig.actions[action] : undefined;
    if (idx === undefined || idx < 0) return;
    try {
      if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
      const motion = model.motion('Action', idx, motionPriority());
      if (motion && model.motionManager) motion.onFinished = resetAfterMotion;
      const dur = (currentConfig.motionDuration && currentConfig.motionDuration[action]) || 5;
      resetTimer = setTimeout(resetAfterMotion, (dur + 0.3) * 1000);
    } catch (e) { /* 忽略 */ }
  }

  // ===== 口型同步（标准 ParamMouthOpenY）=====
  function startLipSync() {
    if (!model || lipSyncOn) return;
    lipSyncOn = true;
    if (tickerFn) return;
    tickerFn = function () {
      if (!lipSyncOn || !model) return;
      const t = performance.now() / 1000;
      const v = (Math.sin(t * 11) * 0.5 + 0.5) * 0.85;
      try { model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', v); } catch (e) { /* 无该参数则跳过 */ }
    };
    app.ticker.add(tickerFn);
  }
  function stopLipSync() {
    lipSyncOn = false;
    if (tickerFn) { app.ticker.remove(tickerFn); tickerFn = null; }
    if (model) { try { model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0); } catch (e) {} }
  }

  // ===== 唱歌时身体摇摆 =====
  function startSwing() {
    if (!model || swingOn) return;
    swingOn = true;
    if (swingTicker) return;
    swingTicker = function () {
      if (!swingOn || !model) return;
      const t = performance.now() / 1000;
      const a = Math.sin(t * 3.2) * 7, b = Math.sin(t * 1.6) * 4;
      try {
        const core = model.internalModel.coreModel;
        core.setParameterValueById('ParamBodyAngleZ', a);
        core.setParameterValueById('ParamAngleZ', a * 0.6);
        core.setParameterValueById('ParamBodyAngleX', b);
        core.setParameterValueById('ParamBodyAngleY', Math.sin(t * 2.4) * 3);
      } catch (e) { /* 忽略 */ }
    };
    app.ticker.add(swingTicker);
  }
  function stopSwing() {
    swingOn = false;
    if (swingTicker) { app.ticker.remove(swingTicker); swingTicker = null; }
    if (model) {
      try {
        const core = model.internalModel.coreModel;
        core.setParameterValueById('ParamBodyAngleZ', 0);
        core.setParameterValueById('ParamAngleZ', 0);
        core.setParameterValueById('ParamBodyAngleX', 0);
        core.setParameterValueById('ParamBodyAngleY', 0);
      } catch (e) { /* ignore */ }
    }
  }
  function startSing() { startLipSync(); startSwing(); }
  function stopSing() { stopLipSync(); stopSwing(); }

  function showFallback(msg) {
    const c = document.getElementById('live2d-canvas');
    if (!c) return;
    c.classList.remove('is-loading');
    c.replaceChildren();
    const fallback = document.createElement('div');
    fallback.className = 'model-fallback';
    fallback.textContent = msg || '模型加载失败';
    c.appendChild(fallback);
  }

  function destroyApplication(targetApp) {
    if (!targetApp) return;
    try {
      targetApp.destroy(true, { children: true, texture: true, baseTexture: true });
    } catch (e) { /* 忽略已释放的 WebGL 资源 */ }
  }

  function applyPersistentState() {
    if (!model) return;
    if (currentConfig.face && currentConfig.face.hair) applyHair();
    if (currentConfig.face) applyFace();
    if (swayOn) applyActions();
  }

  function syncTickerState() {
    if (!app) return;
    if (document.hidden) app.ticker.stop();
    else app.ticker.start();
  }

  // ===== 加载 / 切换模型 =====
  async function loadModel() {
    const container = document.getElementById('live2d-canvas');
    if (!container) return;
    const generation = ++loadGeneration;
    // 清理旧实例
    const previousApp = app;
    if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    if (previousApp && tickerFn) previousApp.ticker.remove(tickerFn);
    if (previousApp && swingTicker) previousApp.ticker.remove(swingTicker);
    tickerFn = null;
    swingTicker = null;
    lipSyncOn = false;
    swingOn = false;
    app = null;
    model = null;
    destroyApplication(previousApp);
    container.classList.add('is-loading');
    container.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'model-loading';
    loading.textContent = currentConfig.name + ' 正在登场…';
    container.appendChild(loading);

    if (typeof PIXI === 'undefined' || !PIXI.live2d) {
      showFallback('Live2D 库未加载（请检查网络后刷新）');
      loadingModel = false;
      return;
    }

    const nextApp = new PIXI.Application({
      view: document.createElement('canvas'),
      width: container.clientWidth,
      height: container.clientHeight,
      transparent: true,
      autoDensity: true,
      antialias: !IS_MOBILE,
      resolution: Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1 : 1.5),
    });
    nextApp.ticker.maxFPS = IS_MOBILE ? 30 : 45;
    container.appendChild(nextApp.view);

    let nextModel;
    try {
      nextModel = await PIXI.live2d.Live2DModel.from(currentConfig.modelUrl, { autoInteract: false });
    } catch (e) {
      destroyApplication(nextApp);
      if (generation !== loadGeneration) return;
      console.error('[Live2D] 加载失败:', e);
      showFallback('模型加载失败：' + (e && e.message ? e.message : e));
      return;
    }

    if (generation !== loadGeneration) {
      try { nextModel.destroy({ children: true, texture: true, baseTexture: true }); } catch (e) { /* ignore */ }
      destroyApplication(nextApp);
      return;
    }

    app = nextApp;
    model = nextModel;

    fitModel(container);
    app.stage.addChild(model);
    container.classList.remove('is-loading');
    const loadingEl = container.querySelector('.model-loading');
    if (loadingEl) loadingEl.remove();

    window.YumiLive2D.ready = true;
    // Cubism 动作可能覆盖自定义参数，因此用一个合并后的低频率 ticker 维持状态。
    if (currentConfig.face || swayOn) app.ticker.add(applyPersistentState);
    applyPersistentState();
    syncTickerState();

    console.log('[Live2D] 模型加载完成：' + currentConfig.name);
    document.dispatchEvent(new Event('yumi-ready'));
    document.dispatchEvent(new Event('yumi-model-changed'));
  }

  function resetPerModelState() {
    faceState.mouth = null; faceState.eyes = null; faceState.deco = [];
    hairState = 'long';
    // sway 跨模型共享，保留用户偏好
  }

  async function setModel(id) {
    if (!MODEL_CONFIGS[id]) return;
    currentModelId = id;
    currentConfig = MODEL_CONFIGS[id];
    try { localStorage.setItem(MODEL_KEY, id); } catch (e) { /* 忽略 */ }
    applyTheme();
    resetPerModelState();
    window.YumiLive2D.ready = false;
    await loadModel();
  }

  // 提前暴露接口，便于页面在模型未加载完时也能设置/读取位置与状态
  window.YumiLive2D = {
    ready: false,
    setModel,
    getCurrentModel: function () { return currentModelId; },
    getConfig: function () { return currentConfig; },
    getCapabilities: function () {
      return {
        face: !!currentConfig.face,
        hair: !!(currentConfig.face && currentConfig.face.hair),
        actions: currentConfig.actions ? Object.keys(currentConfig.actions) : [],
      };
    },
    setMood, playAction, startLipSync, stopLipSync,
    startSing, stopSing,
    setOffset, getOffset, setScale, getScale,
    setHair, getHair,
    setFaceMouth, setFaceEyes, toggleFaceDeco, getFace,
    setSway, getActions,
  };

  function onResize() {
    if (!app || !model) return;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      if (!app || !model) return;
      const container = document.getElementById('live2d-canvas');
      app.renderer.resize(container.clientWidth, container.clientHeight);
      fitModel(container);
    });
  }
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', syncTickerState);

  function scheduleInitialLoad() {
    applyTheme();
    const run = function () { loadModel(); };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 700 });
    else setTimeout(run, 80);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInitialLoad);
  } else {
    scheduleInitialLoad();
  }
})();
