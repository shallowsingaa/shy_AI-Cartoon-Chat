'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function readPngSize(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

test('浏览器首屏不依赖境外字体或运行时 CDN', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/style.css'), 'utf8');
  assert.doesNotMatch(html, /(?:fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|cubism\.live2d\.com)/);
  assert.doesNotMatch(css, /@import\s+url\(\s*['"]?https?:/i);

  for (const file of ['pixi.min.js', 'live2dcubismcore.min.js', 'cubism4.min.js']) {
    assert.ok(fs.statSync(path.join(ROOT, 'public/vendor', file)).size > 0, `${file} 应本地存在`);
  }
});

test('线上 Live2D 纹理不超过 4096 与 5 MiB', () => {
  const textures = [
    'public/model/yumi/yumi.4096/texture_00.png',
    'public/model/no4/no4.4096/texture_00.png',
  ];
  for (const relativePath of textures) {
    const filePath = path.join(ROOT, relativePath);
    const size = readPngSize(filePath);
    assert.ok(size.width <= 4096 && size.height <= 4096, `${relativePath} 尺寸超标`);
    assert.ok(fs.statSync(filePath).size <= 5 * 1024 * 1024, `${relativePath} 下载体积超标`);
  }
});
