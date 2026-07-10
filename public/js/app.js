'use strict';

/*
 * 聊天逻辑：渲染气泡、调用 /api/chat（带 model 字段）、依据返回 mood/action 触发表情与动作，
 * 并通过 /api/tts（带 model 字段）朗读。支持多模型切换。
 */
(function () {
  const messagesEl = document.getElementById('messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('user-input');
  const typing = document.getElementById('typing');
  const submitButton = form.querySelector('button[type="submit"]');
  const IS_MOBILE = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const HISTORY_LIMIT = 40;

  // 每个模型独立的聊天记录（按模型 id 分别存储）
  function histKey(id) { return 'chat_history_' + id; }
  const histories = {};
  let currentId = getModelId();

  function api() { return window.YumiLive2D; }
  function getModelId() { const a = api(); return (a && a.getCurrentModel) ? a.getCurrentModel() : 'yumi'; }
  function getCfg() {
    const a = api();
    if (a && a.getConfig) return a.getConfig();
    return { name: 'Yumi', welcome: '你好～', proactive: '' };
  }

  // 取得当前模型的对话数组（惰性从 sessionStorage 加载一次）
  function currentHistory() {
    if (!histories[currentId]) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(histKey(currentId)) || '[]');
        histories[currentId] = Array.isArray(stored)
          ? stored.filter(function (item) {
              return item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
            }).slice(-HISTORY_LIMIT)
          : [];
      }
      catch (e) { histories[currentId] = []; }
    }
    return histories[currentId];
  }
  function saveHistory() {
    const items = currentHistory();
    if (items.length > HISTORY_LIMIT) items.splice(0, items.length - HISTORY_LIMIT);
    try { sessionStorage.setItem(histKey(currentId), JSON.stringify(items)); } catch (e) {}
  }
  let history = currentHistory();

  // ===== 空闲主动搭话相关状态 =====
  const IDLE_TIMEOUT = 90000;
  const PROACTIVE_MAX = 1;
  let lastActive = Date.now();
  let proactiveCount = 0;
  let proactiveBusy = false;

  // ===== 语音朗读相关状态 =====
  let ttsEnabled = !IS_MOBILE;
  try {
    const savedTts = localStorage.getItem('yumi_tts_enabled');
    if (savedTts !== null) ttsEnabled = savedTts === '1';
  } catch (e) { /* 忽略存储限制 */ }
  let currentAudio = null;
  let ttsToggleBtn = null;
  let ttsAvailable = false;
  let ttsController = null;
  let chatController = null;
  let sending = false;

  function markActive() { lastActive = Date.now(); }
  function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

  function addMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (role === 'user' ? 'msg-user' : 'msg-bot');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function showTyping() { typing.classList.remove('hidden'); scrollBottom(); }
  function hideTyping() { typing.classList.add('hidden'); }

  function setSending(value) {
    sending = value;
    input.disabled = value;
    submitButton.disabled = value;
    submitButton.textContent = value ? '发送中' : '发送';
  }

  async function requestChat(payload, modelId) {
    if (chatController) chatController.abort();
    const controller = new AbortController();
    chatController = controller;
    const timer = setTimeout(function () { controller.abort(); }, 35000);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload, model: modelId }),
        signal: controller.signal,
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || ('请求失败（' + res.status + '）'));
      return data;
    } finally {
      clearTimeout(timer);
      if (chatController === controller) chatController = null;
    }
  }

  async function send(rawText) {
    const text = (rawText || '').trim();
    if (!text || sending) return;

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    saveHistory();
    proactiveCount = 0;
    input.value = '';
    showTyping();
    setSending(true);

    try {
      const data = await requestChat(history, getModelId());
      hideTyping();
      markActive();

      const reply = data.reply || '（没有回应…）';
      addMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });
      saveHistory();

      triggerExpression(data.mood, data.action, reply);
    } catch (e) {
      hideTyping();
      if (e && e.name !== 'AbortError') {
        addMessage('assistant', '哎呀，我好像和网络走散了…稍后再试试好不好？(´･_･`)');
      }
    } finally {
      setSending(false);
      input.focus();
    }
  }

  function triggerExpression(mood, action, reply) {
    const a = api();
    if (!a || !a.ready) return;
    if (mood) a.setMood(mood);
    if (action && action !== 'none') a.playAction(action);
    speak(reply);
  }

  // ===== 语音朗读：调用 /api/tts（带 model）拿到 MP3 并播放，口型随播放同步 =====
  async function speak(text) {
    if (!ttsEnabled || !text) return;
    const plain = String(text || '').trim();
    if (!plain || !/[一-龥A-Za-z0-9]/.test(plain)) return;

    if (currentAudio) {
      try { currentAudio.pause(); } catch (e) { /* ignore */ }
      currentAudio = null;
    }
    if (ttsController) ttsController.abort();
    const controller = new AbortController();
    ttsController = controller;
    const timer = setTimeout(function () { controller.abort(); }, 35000);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plain, model: getModelId() }),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') !== -1) {
        const j = await res.json().catch(function () { return {}; });
        if (j.enabled === false) setTtsEnabled(false);
        return;
      }
      const blob = await res.blob();
      if (!blob || !blob.size) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onplay = function () {
        if (api() && api().startLipSync) api().startLipSync();
      };
      function stopAndCleanup() {
        if (api() && api().stopLipSync) api().stopLipSync();
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
      }
      audio.onended = stopAndCleanup;
      audio.onerror = stopAndCleanup;
      audio.play().then(function () {
        if (api() && api().startLipSync) api().startLipSync();
      }).catch(function (err) {
        console.warn('[TTS] 播放被浏览器拦截：', err && err.name, err && err.message, '——请点击一下页面任意处以解锁语音。');
      });
    } catch (e) {
      if (api() && api().stopLipSync) api().stopLipSync();
    } finally {
      clearTimeout(timer);
      if (ttsController === controller) ttsController = null;
    }
  }

  function setTtsEnabled(on, persist) {
    ttsEnabled = on;
    if (persist !== false) {
      try { localStorage.setItem('yumi_tts_enabled', on ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    if (!on && currentAudio) {
      try { currentAudio.pause(); } catch (e) { /* ignore */ }
      currentAudio = null;
    }
    if (!on && ttsController) ttsController.abort();
    if (ttsToggleBtn) {
      ttsToggleBtn.textContent = on ? '🔊' : '🔇';
      ttsToggleBtn.title = on ? '语音朗读：开（点击关闭）' : '语音朗读：关（点击开启）';
      ttsToggleBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      ttsToggleBtn.classList.toggle('muted', !on);
    }
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });

  // ===== emoji 快捷栏 =====
  (function emojiBar() {
    const bar = document.getElementById('emoji-bar');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      const btn = e.target.closest('.emoji-btn');
      if (!btn) return;
      const emoji = btn.textContent.trim();
      if (!emoji) return;
      const start = input.selectionStart != null ? input.selectionStart : input.value.length;
      const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
      input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
      input.focus();
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
    });
  })();

  // 恢复历史或展示当前模型欢迎语
  if (history.length) {
    history.forEach(function (m) { addMessage(m.role, m.content); });
  } else {
    addMessage('assistant', getCfg().welcome);
  }

  // 模型就绪后保持默认表情
  window.addEventListener('yumi-ready', function () {
    if (api() && api().setMood) api().setMood('neutral');
  });

  // 切换模型：重置主动搭话与界面状态（对话切换在点击时已处理，这里仅刷新 UI）
  window.addEventListener('yumi-model-changed', function () {
    proactiveCount = 0;
    markActive();
    updateModelUI();
  });

  // ===== 音频自动播放解锁 =====
  var __audioUnlocked = false;
  function makeSilentWavDataUri() {
    var sr = 8000, sec = 0.15;
    var n = Math.floor(sr * sec);
    var buf = new ArrayBuffer(44 + n);
    var dv = new DataView(buf);
    function tag(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    tag(0, 'RIFF'); dv.setUint32(4, 36 + n, true); tag(8, 'WAVE');
    tag(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr, true);
    dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    tag(36, 'data'); dv.setUint32(40, n, true);
    for (var i = 0; i < n; i++) dv.setUint8(44 + i, 0x80);
    var u8 = new Uint8Array(buf), bin = '';
    for (var j = 0; j < u8.length; j++) bin += String.fromCharCode(u8[j]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function unlockAudioPlayback() {
    if (__audioUnlocked) return;
    __audioUnlocked = true;
    try {
      var silent = new Audio(makeSilentWavDataUri());
      silent.volume = 0;
      var p = silent.play();
      if (p && p.catch) p.catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
    document.removeEventListener('pointerdown', unlockAudioPlayback);
    document.removeEventListener('keydown', unlockAudioPlayback);
    document.removeEventListener('touchstart', unlockAudioPlayback);
  }
  document.addEventListener('pointerdown', unlockAudioPlayback);
  document.addEventListener('keydown', unlockAudioPlayback);
  document.addEventListener('touchstart', unlockAudioPlayback);

  // ===== 语音朗读开关 =====
  ttsToggleBtn = document.getElementById('tts-toggle');
  if (ttsToggleBtn) {
    ttsToggleBtn.addEventListener('click', function () {
      if (ttsAvailable) setTtsEnabled(!ttsEnabled);
    });
  }

  // ===== 发型切换 =====
  (function hairSwitch() {
    const hairBtn = document.getElementById('hair-toggle');
    const hairPanel = document.getElementById('hair-panel');
    if (!hairBtn || !hairPanel) return;
    const items = hairPanel.querySelectorAll('.hair-item');
    function markActive() {
      const cur = (api() && api().getHair) ? api().getHair() : 'long';
      items.forEach(function (it) {
        it.classList.toggle('active', it.getAttribute('data-hair') === cur);
      });
    }
    document.addEventListener('yumi-ready', markActive);
    document.addEventListener('yumi-model-changed', markActive);
    markActive();

    hairBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hairPanel.hidden = !hairPanel.hidden;
      if (!hairPanel.hidden) markActive();
    });
    items.forEach(function (it) {
      it.addEventListener('click', function () {
        const type = it.getAttribute('data-hair');
        if (api() && api().setHair) api().setHair(type);
        markActive();
        hairPanel.hidden = true;
      });
    });
    document.addEventListener('click', function (e) {
      if (!hairPanel.hidden && !hairPanel.contains(e.target) && e.target !== hairBtn && !hairBtn.contains(e.target)) {
        hairPanel.hidden = true;
      }
    });
  })();

  // ===== 表情切换 =====
  (function faceSwitch() {
    const faceBtn = document.getElementById('face-toggle');
    const facePanel = document.getElementById('face-panel');
    if (!faceBtn || !facePanel) return;
    const items = facePanel.querySelectorAll('.face-item');
    function markActive() {
      const face = (api() && api().getFace) ? api().getFace() : { mouth: null, eyes: null, deco: [] };
      items.forEach(function (it) {
        const cat = it.getAttribute('data-cat');
        const key = it.getAttribute('data-key');
        if (cat === 'deco') {
          it.classList.toggle('active', face.deco.indexOf(key) >= 0);
        } else {
          const cur = (cat === 'mouth') ? face.mouth : face.eyes;
          it.classList.toggle('active', key === 'null' ? (cur === null) : (cur === key));
        }
      });
    }
    document.addEventListener('yumi-ready', markActive);
    document.addEventListener('yumi-model-changed', markActive);
    markActive();

    faceBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      facePanel.hidden = !facePanel.hidden;
      if (!facePanel.hidden) markActive();
    });
    items.forEach(function (it) {
      it.addEventListener('click', function () {
        const cat = it.getAttribute('data-cat');
        const key = it.getAttribute('data-key');
        const val = (key === 'null') ? null : key;
        const a = api();
        if (!a) return;
        if (cat === 'mouth' && a.setFaceMouth) a.setFaceMouth(val);
        else if (cat === 'eyes' && a.setFaceEyes) a.setFaceEyes(val);
        else if (cat === 'deco' && a.toggleFaceDeco) a.toggleFaceDeco(val);
        markActive();
      });
    });
    document.addEventListener('click', function (e) {
      if (!facePanel.hidden && !facePanel.contains(e.target) && e.target !== faceBtn && !faceBtn.contains(e.target)) {
        facePanel.hidden = true;
      }
    });
  })();

  // ===== 动作切换 =====
  (function actSwitch() {
    const actBtn = document.getElementById('act-toggle');
    const actPanel = document.getElementById('act-panel');
    if (!actBtn || !actPanel) return;
    const items = actPanel.querySelectorAll('.act-item');
    function markActive() {
      const acts = (api() && api().getActions) ? api().getActions() : { sway: false };
      items.forEach(function (it) {
        const act = it.getAttribute('data-act');
        if (act === 'sway') it.classList.toggle('active', !!acts.sway);
      });
    }
    document.addEventListener('yumi-ready', markActive);
    document.addEventListener('yumi-model-changed', markActive);
    markActive();

    actBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      actPanel.hidden = !actPanel.hidden;
      if (!actPanel.hidden) markActive();
    });
    items.forEach(function (it) {
      it.addEventListener('click', function () {
        const act = it.getAttribute('data-act');
        const type = it.getAttribute('data-type');
        const a = api();
        if (!a) return;
        if (type === 'toggle') {
          if (act === 'sway' && a.setSway) a.setSway(!a.getActions().sway);
          markActive();
        } else if (type === 'play') {
          if (a.playAction) a.playAction(act);
        }
      });
    });
    document.addEventListener('click', function (e) {
      if (!actPanel.hidden && !actPanel.contains(e.target) && e.target !== actBtn && !actBtn.contains(e.target)) {
        actPanel.hidden = true;
      }
    });
  })();

  // ===== 模型切换 UI =====
  (function modelSwitch() {
    const sw = document.getElementById('model-switch');
    if (!sw) return;
    sw.addEventListener('click', function (e) {
      const b = e.target.closest('.model-switch-btn');
      if (!b) return;
      const id = b.getAttribute('data-model');
      if (id === getModelId()) return;
      if (chatController) chatController.abort();
      if (ttsController) ttsController.abort();
      setSending(false);
      hideTyping();
      // 切换前保存当前角色的对话（已按各自 id 存储，这里确保一次落盘）
      saveHistory();
      // 先切换底层模型配置（setModel 会同步把 currentConfig 切到目标角色并立即换主题），
      // 这样下面的欢迎语才能取到正确的角色配置，避免问候语对调（显示成另一个角色）
      if (api() && api().setModel) api().setModel(id);
      // 加载目标角色独立的对话记录
      currentId = id;
      history = currentHistory();
      messagesEl.innerHTML = '';
      if (history.length) {
        history.forEach(function (m) { addMessage(m.role, m.content); });
      } else {
        addMessage('assistant', getCfg().welcome);
      }
      // 立即同步刷新界面称谓（标题/副标题/占位/切换器高亮等），无需等待模型加载完成
      updateModelUI();
    });
    updateModelUI();
  })();

  // 依据当前模型刷新标题、切换器高亮与面板可见性
  function updateModelUI() {
    const cfg = getCfg();
    const id = getModelId();
    const titleEl = document.getElementById('chat-title');
    const subEl = document.getElementById('chat-sub');
    const bowEl = document.getElementById('header-bow');
    const inputEl = document.getElementById('user-input');
    const typingEl = document.getElementById('typing-label');
    if (titleEl) titleEl.textContent = cfg.name + ' 的小窝';
    if (subEl) subEl.textContent = cfg.subtitle || ('和' + cfg.name + '说说话吧～');
    if (bowEl) bowEl.textContent = cfg.headerIcon || '🎀';
    if (inputEl) inputEl.placeholder = cfg.listeningTip || ('说点什么吧，' + cfg.name + ' 在听哦～');
    if (typingEl) typingEl.textContent = cfg.thinkingLabel || (cfg.name + ' 正在思考…');

    // 面板标题（发型/表情/动作）按当前角色动态显示
    const label = cfg.panelLabel || cfg.name;
    const hairTitle = document.querySelector('.hair-panel-title');
    const faceTitle = document.querySelector('.face-panel-title');
    const actTitle = document.querySelector('.act-panel-title');
    if (hairTitle) hairTitle.textContent = label + ' 的发型';
    if (faceTitle) faceTitle.textContent = label + ' 的表情';
    if (actTitle) actTitle.textContent = label + ' 的动作';

    document.querySelectorAll('.model-switch-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-model') === id);
    });

    const caps = (api() && api().getCapabilities) ? api().getCapabilities() : { face: true, hair: true, actions: ['wave', 'tear'] };
    const faceBtn = document.getElementById('face-toggle');
    const facePanel = document.getElementById('face-panel');
    const hairBtn = document.getElementById('hair-toggle');
    const hairPanel = document.getElementById('hair-panel');
    if (faceBtn) faceBtn.style.display = caps.face ? '' : 'none';
    if (facePanel) facePanel.hidden = true;
    if (hairBtn) hairBtn.style.display = caps.hair ? '' : 'none';
    if (hairPanel) hairPanel.hidden = true;

    const actPanel = document.getElementById('act-panel');
    if (actPanel) {
      actPanel.querySelectorAll('.act-item').forEach(function (it) {
        const a = it.getAttribute('data-act');
        const show = (a === 'sway') || caps.actions.indexOf(a) >= 0;
        it.style.display = show ? '' : 'none';
      });
      const hint = actPanel.querySelector('.act-hint');
      if (hint) hint.style.display = caps.actions.indexOf('tear') >= 0 ? '' : 'none';
    }
  }

  // 询问后端是否配置了 MiniMax
  fetch('/api/tts/status').then(function (r) { return r.json(); }).then(function (s) {
    ttsAvailable = !!s.enabled;
    setTtsEnabled(ttsAvailable && ttsEnabled, false);
    if (ttsToggleBtn) {
      ttsToggleBtn.disabled = !ttsAvailable;
      ttsToggleBtn.classList.toggle('disabled', !ttsAvailable);
    }
  }).catch(function () { /* 忽略 */ });

  // ===== 左侧人物位置调节 =====
  (function positionControl() {
    const fab = document.getElementById('mc-fab');
    const pop = document.getElementById('mc-pop');
    const sliderX = document.getElementById('pos-x');
    const sliderY = document.getElementById('pos-y');
    const sliderScale = document.getElementById('pos-scale');
    const resetBtn = document.getElementById('pos-reset');
    if (!fab || !pop || !sliderX || !sliderY) return;

    if (api() && api().getOffset) {
      const p = api().getOffset();
      sliderX.value = p.x; sliderY.value = p.y;
    }
    if (api() && api().getScale && sliderScale) sliderScale.value = api().getScale();

    fab.addEventListener('click', function () { pop.hidden = !pop.hidden; });

    function apply() {
      const x = parseInt(sliderX.value, 10) || 0;
      const y = parseInt(sliderY.value, 10) || 0;
      if (api() && api().setOffset) api().setOffset(x, y);
    }
    sliderX.addEventListener('input', apply);
    sliderY.addEventListener('input', apply);
    if (sliderScale) {
      sliderScale.addEventListener('input', function () {
        const s = parseFloat(sliderScale.value);
        if (api() && api().setScale) api().setScale(s);
      });
    }
    resetBtn.addEventListener('click', function () {
      sliderX.value = 0; sliderY.value = 0;
      if (sliderScale) sliderScale.value = 1;
      apply();
      if (api() && api().setScale) api().setScale(1);
    });
  })();

  // ===== 空闲主动搭话 =====
  async function proactiveChat() {
    const promptMsg = getCfg().proactive || '（请主动和用户聊起来，简短自然，1-3 句话，直接输出你说的话。）';
    const payload = history.concat([{ role: 'user', content: promptMsg }]);
    showTyping();
    try {
      const data = await requestChat(payload, getModelId());
      hideTyping();
      const reply = data.reply || '诶？你还在吗～';
      addMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });
      saveHistory();
      triggerExpression(data.mood, data.action, reply);
    } catch (e) {
      hideTyping();
      addMessage('assistant', '诶？你还在吗～怎么不理我啦 (´･_･`)');
    }
  }

  ['click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, markActive);
  });
  input.addEventListener('input', markActive);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) markActive();
  });

  setInterval(function () {
    if (proactiveBusy) return;
    if (document.hidden) return;
    if (!typing.classList.contains('hidden')) return;
    if (proactiveCount >= PROACTIVE_MAX) return;
    if (Date.now() - lastActive < IDLE_TIMEOUT) return;
    proactiveBusy = true;
    proactiveCount += 1;
    markActive();
    proactiveChat().finally(function () { proactiveBusy = false; });
  }, 15000);
})();
