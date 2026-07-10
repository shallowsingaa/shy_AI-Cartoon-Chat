'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

// ---- 极简 .env 解析（避免引入 dotenv 依赖）----
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const DASHSCOPE_KEY = process.env.DASHSCOPE_KEY || '';
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL ||
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = process.env.MODEL || 'qwen-plus';

// ---- MiniMax 语音合成（TTS）配置 ----
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || '';
const MINIMAX_TTS_BASE_URL = process.env.MINIMAX_TTS_BASE_URL ||
  'https://api.minimax.chat/v1/t2a_v2';
const MINIMAX_TTS_MODEL = process.env.MINIMAX_TTS_MODEL || 'speech-02-turbo';
const MINIMAX_VOICE_ID = process.env.MINIMAX_VOICE_ID || 'female-tianmei';
const MINIMAX_TTS_SPEED = Number(process.env.MINIMAX_TTS_SPEED || 1.0);
const MINIMAX_TTS_PITCH = Number(process.env.MINIMAX_TTS_PITCH || 0);

const TTS_ENABLED = Boolean(MINIMAX_API_KEY);

// ---- 多模型配置：不同模型有不同的人设 / 语音音色 ----
// 前端请求 /api/chat、/api/tts 时通过 { model: 'yumi' | 'no4' } 指定当前模型。
const MODELS = {
  yumi: {
    name: 'Yumi',
    voiceId: MINIMAX_VOICE_ID,
    voiceSpeed: MINIMAX_TTS_SPEED,
    voicePitch: MINIMAX_TTS_PITCH,
    systemPrompt: [
      '你是「Yumi」，一个温柔可爱、有点害羞的少女虚拟主播，说话语气甜美、亲切，偶尔带点俏皮。',
      '请只用简体中文回答，每次回复保持自然、简短（1-4 句话）。',
      '你必须始终以 JSON 格式输出，结构严格为：',
      '{"reply": "你对用户的回复内容（纯文本，不要包含换行与引号）",',
      ' "mood": "情绪，必须是以下之一：happy(开心) / sad(难过) / angry(生气) / shy(害羞) / surprised(惊讶) / thinking(思考) / neutral(平静)",',
      ' "action": "动作，必须是以下之一：wave(挥手) / tear(流泪) / none(无)"}',
      '只输出 JSON，不要输出 JSON 以外的任何文字。',
    ].join('\n'),
  },
  no4: {
    name: '诺亚',
    // 少年正太音色（MiniMax 中文「青涩青年」男声，最贴近少年感）。可选其它少年音色：
    //   male-qn-daxuesheng-jingpin（青年大学生）/ male-qn-jingying-jingpin（精英青年）/ male-qn-badao-jingpin（霸道青年）
    // 如需替换，可在 .env 设置 MINIMAX_VOICE_ID_NO4 覆盖。
    voiceId: process.env.MINIMAX_VOICE_ID_NO4 || 'male-qn-qingse-jingpin',
    voiceSpeed: Number(process.env.MINIMAX_TTS_SPEED_NO4 || 1.05),
    voicePitch: Number(process.env.MINIMAX_TTS_PITCH_NO4 || 2),
    systemPrompt: [
      '你是「诺亚」，一个少年的虚拟主播，外表是少年感正太，说话风格又酷又有点拽，简短直接、不啰嗦，偶尔带点冷幽默。',
      '你不会撒娇卖萌，也少用感叹号；语气像青春期酷酷的男生，但内心其实并不坏。',
      '请只用简体中文回答，每次回复保持自然、简短（1-4 句话）。',
      '你必须始终以 JSON 格式输出，结构严格为：',
      '{"reply": "你对用户的回复内容（纯文本，不要包含换行与引号）",',
      ' "mood": "情绪，必须是以下之一：happy(开心) / sad(难过) / angry(生气) / shy(害羞) / surprised(惊讶) / thinking(思考) / neutral(平静)",',
      ' "action": "动作，必须是以下之一：sweat(流汗) / none(无)"}',
      '只输出 JSON，不要输出 JSON 以外的任何文字。',
    ].join('\n'),
  },
};

function getModel(model) {
  return MODELS[model] || MODELS.yumi;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.moc3': 'application/octet-stream',
  '.model3.json': 'application/json; charset=utf-8',
  '.exp3.json': 'application/json; charset=utf-8',
  '.motion3.json': 'application/json; charset=utf-8',
  '.physics3.json': 'application/json; charset=utf-8',
  '.cdi3.json': 'application/json; charset=utf-8',
  '.vtube.json': 'application/json; charset=utf-8',
};

function getMime(filePath) {
  // 先匹配带 .json 后缀的复合名
  for (const ext of ['.model3.json', '.exp3.json', '.motion3.json', '.physics3.json', '.cdi3.json']) {
    if (filePath.endsWith(ext)) return MIME[ext];
  }
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ---- 静态文件托管 ----
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': getMime(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---- 解析模型返回的 JSON（容错）----
function parseModelJson(content) {
  if (!content) return null;
  let text = content.trim();
  // 去可能的 ```json 围栏
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e) { /* ignore */ }
    }
  }
  return null;
}

function fallbackReply(rawText) {
  return {
    reply: (rawText || '抱歉，我刚才走神了～').slice(0, 500),
    mood: 'neutral',
    action: 'none',
  };
}

// ---- /api/chat 代理 ----
async function handleChat(req, res) {
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    let messages;
    let model = 'yumi';
    try {
      const parsed = JSON.parse(body);
      messages = parsed.messages;
      if (parsed && typeof parsed.model === 'string') model = parsed.model;
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '无效的请求体' }));
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'messages 不能为空' }));
      return;
    }
    // 仅保留 role/content，限制长度
    const safeMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
      .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
      .slice(-20);
    safeMessages.unshift({ role: 'system', content: getModel(model).systemPrompt });

    if (!DASHSCOPE_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '服务端未配置 DASHSCOPE_KEY' }));
      return;
    }

    try {
      const resp = await fetch(DASHSCOPE_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DASHSCOPE_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: safeMessages,
          temperature: 0.8,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        res.writeHead(resp.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '上游接口错误', detail: data }));
        return;
      }

      const content = data?.choices?.[0]?.message?.content || '';
      const parsed = parseModelJson(content);
      const result = parsed
        ? {
            reply: String(parsed.reply || '').slice(0, 1000),
            mood: String(parsed.mood || 'neutral'),
            action: String(parsed.action || 'none'),
          }
        : fallbackReply(content);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '调用上游失败', detail: String(e && e.message || e) }));
    }
  });
}

// ---- /api/tts 状态探测（前端初始化时调用）----
function handleTtsStatus(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ enabled: TTS_ENABLED, voiceId: MINIMAX_VOICE_ID }));
}

// 将 MiniMax 返回的音频字段解码为 Buffer。
// 注意：speech-02 系列返回的是 HEX 编码（非 base64），需先尝试 hex；
// 若解码结果不是媒体数据，再回退 base64。
function decodeMiniMaxAudio(s) {
  s = String(s || '');
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    const fromHex = Buffer.from(s, 'hex');
    if (looksLikeMedia(fromHex)) return fromHex;
  }
  return Buffer.from(s, 'base64');
}
function looksLikeMedia(b) {
  if (!b || b.length < 4) return false;
  const head4 = b.slice(0, 4).toString('ascii');
  if (head4 === 'RIFF') return true;                      // WAV
  if (head4 === 'fLaC') return true;                      // FLAC
  if (head4 === 'OggS') return true;                      // Ogg / Opus
  if (b.slice(0, 3).toString('ascii') === 'ID3') return true; // MP3（带 ID3 标签）
  if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return true;   // MPEG 音频帧
  return false;
}

// ---- /api/tts：文本 -> MiniMax 语音合成，返回音频二进制流 ----
async function handleTts(req, res) {
  // 未配置 key 时直接告知前端禁用
  if (!TTS_ENABLED) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ enabled: false }));
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }

    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let text = '';
      let model = 'yumi';
      try {
        const b = JSON.parse(body);
        text = (b.text || '').toString().trim();
        if (typeof b.model === 'string') model = b.model;
      } catch (e) { /* ignore */ }
    // 纯空白 / 仅 emoji 等无意义内容不朗读
    if (!text || !/\p{L}|\p{N}/u.test(text)) {
      res.writeHead(204); res.end();
      return;
    }
    // 限制长度，避免超长
    text = text.slice(0, 500);

    // 拼接 GroupId（可选，留空则不传）
    const sep = MINIMAX_TTS_BASE_URL.includes('?') ? '&' : '?';
    const url = MINIMAX_GROUP_ID
      ? `${MINIMAX_TTS_BASE_URL}${sep}GroupId=${encodeURIComponent(MINIMAX_GROUP_ID)}`
      : MINIMAX_TTS_BASE_URL;

      try {
        const cfg = getModel(model);
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MINIMAX_API_KEY}`,
          },
          body: JSON.stringify({
          model: MINIMAX_TTS_MODEL,
          text: text,
          voice_setting: {
            voice_id: cfg.voiceId,
            speed: cfg.voiceSpeed,
            pitch: cfg.voicePitch,
            vol: 1.0,
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
          },
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        res.writeHead(resp.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MiniMax TTS 调用失败', detail: data }));
        return;
      }

      // 兼容返回结构：data.audio 或顶层 audio（base64 mp3）
      const raw = data?.data?.audio || data?.audio;
      if (!raw) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MiniMax 返回中未找到音频数据', detail: data }));
        return;
      }

      const audioBuffer = decodeMiniMaxAudio(raw);
      if (!audioBuffer || !audioBuffer.length) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MiniMax 音频解码失败', detail: { head: String(raw).slice(0, 40) } }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(audioBuffer);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '调用 MiniMax 失败', detail: String(e && e.message || e) }));
    }
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/chat') {
    handleChat(req, res);
  } else if (pathname === '/api/tts') {
    handleTts(req, res);
  } else if (pathname === '/api/tts/status') {
    handleTtsStatus(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`✨ Yumi 聊天网站已启动： http://localhost:${PORT}`);
});
