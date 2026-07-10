'use strict';

const fs = require('fs');
const path = require('path');

// ESA 控制台的环境变量只在构建阶段可用。把允许的变量写入函数侧模块，
// 由 ESA 随边缘函数打包；该文件不在 public/ 中，不会作为静态资源发布。
const ALLOWED_ENV_NAMES = [
  'DASHSCOPE_KEY',
  'DASHSCOPE_BASE_URL',
  'MODEL',
  'MINIMAX_API_KEY',
  'MINIMAX_GROUP_ID',
  'MINIMAX_TTS_BASE_URL',
  'MINIMAX_TTS_MODEL',
  'MINIMAX_VOICE_ID',
  'MINIMAX_TTS_SPEED',
  'MINIMAX_TTS_PITCH',
  'MINIMAX_VOICE_ID_NO4',
  'MINIMAX_TTS_SPEED_NO4',
  'MINIMAX_TTS_PITCH_NO4',
];

const env = Object.fromEntries(
  ALLOWED_ENV_NAMES.map((name) => [name, process.env[name] || '']),
);

if (!env.DASHSCOPE_KEY.trim()) {
  throw new Error(
    '缺少 DASHSCOPE_KEY：请在 ESA Pages 的环境变量中配置后重新部署。',
  );
}

const outputPath = path.join(__dirname, 'esa-env.generated.js');
const output = [
  '// 此文件由 build-esa-env.cjs 自动生成，请勿提交到 Git。',
  `export default ${JSON.stringify(env, null, 2)};`,
  '',
].join('\n');

fs.writeFileSync(outputPath, output, 'utf8');
console.log(
  `ESA 函数环境配置已生成（DASHSCOPE：已启用，MiniMax TTS：${env.MINIMAX_API_KEY ? '已启用' : '未启用'}）。`,
);
