# Yumi 的小窝

面向中国大陆用户的轻量 Live2D AI 聊天网站。项目内置 Yumi 与诺亚两个角色，通过阿里云百炼 Qwen 生成对话，并可选使用 MiniMax TTS 朗读回复。

项目采用原生 HTML、CSS、JavaScript 与 Node.js 内置模块，不需要安装 npm 依赖。PixiJS、Cubism Core 和 pixi-live2d-display 已固定版本并随站点本地托管，浏览器运行时不依赖 Google Fonts、jsDelivr 等境外资源。

## 功能与优化

- 双角色 Live2D 展示、表情、动作、位置和缩放控制。
- 每个角色独立的会话历史、人设和 TTS 音色。
- 移动端上下分区布局，适配安全区、短屏、触控热区与横向表情栏。
- 移动端使用 1× 画布和最高 30 FPS，桌面端最高 1.5×/45 FPS；页面进入后台时暂停 ticker。
- 角色切换会释放旧 WebGL 纹理，避免多次切换后显存持续增长。
- Live2D 纹理由 8192×8192 优化为 4096×4096，两张纹理合计约 7 MiB。
- Node 静态服务支持 Brotli/Gzip、ETag、HEAD、分级缓存和基础安全响应头。
- 对话和 TTS 具备请求体限制、客户端/服务端超时及并发保护。
- 移动端默认关闭 TTS 以节省流量和调用费用；用户开启后会记住偏好。

## 架构

```text
浏览器 public/
  ├─ /api/chat ──> Node server.js 或 ESA esa-function.js ──> 阿里云百炼
  ├─ /api/tts  ──> Node server.js 或 ESA esa-function.js ──> MiniMax
  └─ /model/*、/vendor/* ──> 同源静态资源
```

- `server.js`：本地或普通服务器入口，负责静态文件与三个 API。
- `esa-function.js`：阿里云 ESA Pages 边缘函数入口，只处理 `/api/*`。
- `build-esa-env.cjs`：构建时把允许的 ESA 环境变量写入函数侧生成文件；生成文件不会发布到 `public/`。
- `public/js/live2d.js`：模型生命周期、渲染、表情、动作和口型。
- `public/js/app.js`：聊天、会话历史、TTS、角色切换和 UI 状态。
- `public/vendor/`：固定版本的浏览器运行库，本地托管以改善大陆网络可用性。
- `test/server.test.js`：Node 内置测试，覆盖静态服务和输入边界。

## 快速开始

要求：Node.js 20 或更高版本。

```bash
git clone <your-repo-url> shy_AI-Cartoon-Chat
cd shy_AI-Cartoon-Chat
cp .env.example .env
node server.js
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
node server.js
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。项目没有第三方 npm 依赖，因此无需执行 `npm install`。

## 环境变量

| 变量 | 必填 | 默认值 | 用途 |
| --- | :-: | --- | --- |
| `DASHSCOPE_KEY` | 是 | — | 阿里云百炼 API Key |
| `DASHSCOPE_BASE_URL` | 否 | 百炼兼容模式端点 | 自定义对话网关 |
| `MODEL` | 否 | `qwen-plus` | Qwen 模型名 |
| `PORT` | 否 | `3000` | Node HTTP 端口；ESA 忽略 |
| `UPSTREAM_TIMEOUT_MS` | 否 | `30000` | 对话和 TTS 上游超时，最小 5000 ms |
| `CHAT_MAX_CONCURRENCY` | 否 | `24` | 单个 Node 进程/边缘实例的对话并发上限 |
| `TTS_MAX_CONCURRENCY` | 否 | `6` | 单个 Node 进程/边缘实例的 TTS 并发上限 |
| `MINIMAX_API_KEY` | 否 | 空 | 留空时禁用 TTS |
| `MINIMAX_GROUP_ID` | 否 | 空 | MiniMax GroupId |
| `MINIMAX_TTS_BASE_URL` | 否 | `https://api.minimax.chat/v1/t2a_v2` | MiniMax TTS 端点 |
| `MINIMAX_TTS_MODEL` | 否 | `speech-02-turbo` | TTS 模型 |
| `MINIMAX_VOICE_ID` | 否 | `female-tianmei` | Yumi 音色 |
| `MINIMAX_TTS_SPEED` | 否 | `1.0` | Yumi 语速 |
| `MINIMAX_TTS_PITCH` | 否 | `0` | Yumi 音高 |
| `MINIMAX_VOICE_ID_NO4` | 否 | `male-qn-qingse-jingpin` | 诺亚音色 |
| `MINIMAX_TTS_SPEED_NO4` | 否 | `1.05` | 诺亚语速 |
| `MINIMAX_TTS_PITCH_NO4` | 否 | `2` | 诺亚音高 |

修改 `.env` 后需重启 Node 服务。不要把 `.env` 或真实密钥提交到仓库。

## API

### `POST /api/chat`

请求体最大 64 KiB。服务端只保留最近 20 条合法消息，单条内容最多 2000 个字符，并自动注入角色提示词。

```json
{
  "model": "yumi",
  "messages": [{ "role": "user", "content": "你好呀" }]
}
```

```json
{
  "reply": "在的哦～今天想聊什么？",
  "mood": "happy",
  "action": "wave"
}
```

`model` 支持 `yumi` 和 `no4`。模型输出无法解析时回退为 `neutral`/`none`。

### `POST /api/tts`

请求体最大 16 KiB，朗读文本最多 500 个字符。成功时返回 `audio/mpeg`；未配置 MiniMax 时返回 `{ "enabled": false }`。

### `GET /api/tts/status`

返回 TTS 是否可用，供前端初始化开关状态。

## 常用命令

```bash
npm start       # 启动 Node 服务
npm test        # 运行 Node 内置测试
npm run check   # 语法检查 + 全部测试
npm run build:esa
```

PowerShell 执行策略阻止 `npm.ps1` 时，使用 `npm.cmd test` 或 `npm.cmd run check`。

## 部署

### 阿里云 ESA Pages

仓库的 `esa.jsonc` 已配置：

- 构建命令：`node build-esa-env.cjs`
- 静态目录：`./public`
- 边缘函数：`./esa-function.js`
- Node.js：20

在 ESA 控制台至少配置 `DASHSCOPE_KEY`。需要语音时再配置 MiniMax 变量。`build-esa-env.cjs` 缺少百炼 Key 时会让构建直接失败，避免部署出无法聊天的站点。

建议在 ESA 中为 `/model/*` 与 `/vendor/*` 设置至少 7 天边缘缓存；HTML 保持协商缓存。发布前运行 `npm run check`。

### 普通 Node 服务器

建议在 Nginx、Caddy 或云负载均衡后运行 `node server.js`，启用 HTTPS，并把进程交给 systemd、PM2 或容器编排管理。Node 服务已经提供静态压缩与 ETag；反向代理若再次压缩，应避免重复压缩。

## 大陆网络与成本说明

- 首屏没有境外字体或 CDN 依赖，静态资源全部同源。
- 默认上游为阿里云百炼和 MiniMax，适合中国大陆网络；若改成境外网关，应自行评估跨境延迟与合规要求。
- 聊天历史只保存在当前标签页的 `sessionStorage`，最多 40 条，不会上传到第三方存储；调用模型时最近历史会发送给配置的模型服务。
- 主动搭话在每次页面会话中最多触发一次，移动端 TTS 默认关闭，以控制 API 调用和用户流量。
- 上线面向公众前仍应在网关层增加按 IP/账号的限流、内容安全、日志脱敏与成本告警。当前并发限制只保护单个运行实例，不等同于完整防刷系统。

## 维护约束

- `server.js` 与 `esa-function.js` 的 API 校验、超时和错误语义应保持一致。
- 不要重新引入 Google Fonts 或境外运行时 CDN；升级前端库时直接更新 `public/vendor/` 并记录固定版本。
- Live2D 纹理应保持在 4096 或更低；新增大文件前检查下载体积和解码内存。
- 新增 npm 依赖时必须提交锁文件，并更新本 README 与 `AGENTS.md`。

## 许可

本项目自有代码与文档采用 [Apache License 2.0](LICENSE)。

`public/model/` 中的 Live2D 模型及 `public/vendor/` 中的第三方运行库不因本项目许可证而改变其原有权利归属或授权条件；分发、商用或二次创作前，请分别确认模型作者、PixiJS、pixi-live2d-display 和 Live2D Cubism SDK 的适用条款。
