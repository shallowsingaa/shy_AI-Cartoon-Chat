'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createAppServer, parseModelJson } = require('../server');

let server;
let baseUrl;

before(async () => {
  server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('首页和静态资源包含缓存、安全与压缩响应头', async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');

  const asset = await fetch(`${baseUrl}/vendor/pixi.min.js`, {
    headers: { 'Accept-Encoding': 'br' },
  });
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /max-age=604800/);
  assert.ok(asset.headers.get('etag'));

  const conditional = await fetch(`${baseUrl}/vendor/pixi.min.js`, {
    headers: { 'If-None-Match': asset.headers.get('etag') },
  });
  assert.equal(conditional.status, 304);
});

test('HEAD 不返回响应体', async () => {
  const response = await fetch(`${baseUrl}/css/style.css`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('静态服务阻止 Windows 编码路径越权', async () => {
  const response = await fetch(`${baseUrl}/%2e%2e%5cserver.js`);
  assert.equal(response.status, 403);
});

test('聊天接口拒绝无效和超大请求', async () => {
  const invalid = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(invalid.status, 400);

  const oversized = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '中'.repeat(70_000) }] }),
  });
  assert.equal(oversized.status, 413);
});

test('TTS 只接受 POST', async () => {
  const response = await fetch(`${baseUrl}/api/tts`);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
});

test('模型 JSON 解析兼容代码围栏与非法输出', () => {
  assert.deepEqual(parseModelJson('```json\n{"reply":"你好"}\n```'), { reply: '你好' });
  assert.equal(parseModelJson('not json'), null);
});
