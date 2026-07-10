/**
 * 阿里云 ESA Pages 边缘函数入口。
 *
 * public/ 下的文件由 ESA 静态资源托管直接响应；只有未命中静态资源的
 * 请求（主要是 /api/*）才会进入这里。
 */

const DASHSCOPE_KEY = process.env.DASHSCOPE_KEY || '';
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL ||
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = process.env.MODEL || 'qwen-plus';

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || '';
const MINIMAX_TTS_BASE_URL = process.env.MINIMAX_TTS_BASE_URL ||
  'https://api.minimax.chat/v1/t2a_v2';
const MINIMAX_TTS_MODEL = process.env.MINIMAX_TTS_MODEL || 'speech-02-turbo';
const MINIMAX_VOICE_ID = process.env.MINIMAX_VOICE_ID || 'female-tianmei';
const MINIMAX_TTS_SPEED = Number(process.env.MINIMAX_TTS_SPEED || 1.0);
const MINIMAX_TTS_PITCH = Number(process.env.MINIMAX_TTS_PITCH || 0);
const TTS_ENABLED = Boolean(MINIMAX_API_KEY);

const MODELS = {
  yumi: {
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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function parseModelJson(content) {
  if (!content) return null;
  const text = content.trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function fallbackReply(rawText) {
  return {
    reply: (rawText || '抱歉，我刚才走神了～').slice(0, 500),
    mood: 'neutral',
    action: 'none',
  };
}

async function readJson(request, maxLength) {
  const text = await request.text();
  if (text.length > maxLength) {
    throw new Error('REQUEST_TOO_LARGE');
  }
  return JSON.parse(text);
}

async function handleChat(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  let body;
  try {
    body = await readJson(request, 1e6);
  } catch (error) {
    return json(
      { error: error.message === 'REQUEST_TOO_LARGE' ? '请求体过大' : '无效的请求体' },
      error.message === 'REQUEST_TOO_LARGE' ? 413 : 400,
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'messages 不能为空' }, 400);
  }
  if (!DASHSCOPE_KEY) {
    return json({ error: '服务端未配置 DASHSCOPE_KEY' }, 500);
  }

  const currentModel = typeof body.model === 'string' ? body.model : 'yumi';
  const safeMessages = body.messages
    .filter((message) => message && ['user', 'assistant', 'system'].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 2000),
    }))
    .slice(-20);
  safeMessages.unshift({ role: 'system', content: getModel(currentModel).systemPrompt });

  try {
    const response = await fetch(DASHSCOPE_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DASHSCOPE_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: safeMessages,
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ error: '上游接口错误', detail: data }, response.status);
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = parseModelJson(content);
    return json(parsed ? {
      reply: String(parsed.reply || '').slice(0, 1000),
      mood: String(parsed.mood || 'neutral'),
      action: String(parsed.action || 'none'),
    } : fallbackReply(content));
  } catch (error) {
    return json({ error: '调用上游失败', detail: String(error?.message || error) }, 502);
  }
}

function looksLikeMedia(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (['RIFF', 'fLaC', 'OggS'].includes(ascii(0, 4))) return true;
  if (ascii(0, 3) === 'ID3') return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function decodeHex(value) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeMiniMaxAudio(value) {
  const encoded = String(value || '');
  if (/^[0-9a-fA-F]+$/.test(encoded) && encoded.length % 2 === 0) {
    const bytes = decodeHex(encoded);
    if (looksLikeMedia(bytes)) return bytes;
  }
  return decodeBase64(encoded);
}

async function handleTts(request) {
  if (!TTS_ENABLED) return json({ enabled: false });
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  let body;
  try {
    body = await readJson(request, 1e5);
  } catch (error) {
    return json(
      { error: error.message === 'REQUEST_TOO_LARGE' ? '请求体过大' : '无效的请求体' },
      error.message === 'REQUEST_TOO_LARGE' ? 413 : 400,
    );
  }

  let text = String(body.text || '').trim();
  if (!text || !/\p{L}|\p{N}/u.test(text)) {
    return new Response(null, { status: 204 });
  }
  text = text.slice(0, 500);

  const separator = MINIMAX_TTS_BASE_URL.includes('?') ? '&' : '?';
  const url = MINIMAX_GROUP_ID
    ? `${MINIMAX_TTS_BASE_URL}${separator}GroupId=${encodeURIComponent(MINIMAX_GROUP_ID)}`
    : MINIMAX_TTS_BASE_URL;
  const config = getModel(typeof body.model === 'string' ? body.model : 'yumi');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: MINIMAX_TTS_MODEL,
        text,
        voice_setting: {
          voice_id: config.voiceId,
          speed: config.voiceSpeed,
          pitch: config.voicePitch,
          vol: 1.0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ error: 'MiniMax TTS 调用失败', detail: data }, response.status);
    }

    const rawAudio = data?.data?.audio || data?.audio;
    if (!rawAudio) {
      return json({ error: 'MiniMax 返回中未找到音频数据', detail: data }, 502);
    }

    const audio = decodeMiniMaxAudio(rawAudio);
    if (!audio.length) {
      return json({ error: 'MiniMax 音频解码失败' }, 502);
    }
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return json({ error: '调用 MiniMax 失败', detail: String(error?.message || error) }, 502);
  }
}

async function handleRequest(request) {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/chat') return handleChat(request);
  if (pathname === '/api/tts') return handleTts(request);
  if (pathname === '/api/tts/status') {
    return json({ enabled: TTS_ENABLED, voiceId: MINIMAX_VOICE_ID });
  }
  return new Response('Not Found', { status: 404 });
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
