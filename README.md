# Yumi 的小窝 · 少女风 Live2D 聊天网站

> 一个零依赖、原生 Node.js 实现的 Live2D 虚拟主播聊天网站。
> 内置 **Yumi（温柔少女）** 与 **诺亚（酷拽少年正太）** 两个角色，
> 接入阿里云百炼 **Qwen** 大模型生成对话，并支持 **MiniMax TTS** 实时语音朗读、口型同步。

![tech](https://img.shields.io/badge/node-%E2%89%A512-339933?logo=node.js&logoColor=white)
![stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20Node%20http-ffe066)
![license](https://img.shields.io/badge/private-1.0.0-blueviolet)
![live2d](https://img.shields.io/badge/Live2D-Cubism%203-ff8fb1)

---

## ✨ 功能一览

| 模块 | 说明 |
| --- | --- |
| 🎀 Live2D 看板娘 | 二次元角色 Yumi / 诺亚，支持鼠标跟踪、点击交互、表情/动作切换 |
| 💬 智能对话 | 通过 `/api/chat` 代理到阿里云百炼 Qwen（`qwen-plus`），响应中带 `mood` + `action` |
| 🎙 语音朗读（TTS） | 可选启用 MiniMax `speech-02-turbo`，MP3 流式返回，前端 `<audio>` 播放并口型同步 |
| 😶 多情绪表达 | `happy / sad / angry / shy / surprised / thinking / neutral` 七种情绪驱动 Live2D 表情 |
| 🎬 动作触发 | `wave / tear / sweat / none` 四种动作，由模型返回 JSON 自动触发 |
| 🧠 多模型切换 | 前端可在 Yumi 与诺亚之间一键切换；每个角色独立人设与音色 |
| 💾 本地记忆 | 聊天历史自动写入 `localStorage`，刷新不丢失 |
| 🌸 装饰层 | 飘动云朵、蝴蝶结、星星；诺亚主题切到闪电 + 蓝色爱心 |
| ⏳ 主动搭话 | 长时间无对话时，角色会主动发起闲聊 |
| 🔒 零外泄 | 所有 LLM / TTS Key 仅存在于服务端 `.env`，前端不暴露任何凭证 |

---

## 📂 目录结构

```
.
├─ server.js              # Node.js 静态服务 + /api/chat、/api/tts、/api/tts/status
├─ package.json           # 仅声明启动脚本，无第三方依赖
├─ .env.example           # 环境变量样例（提交，勿填真实值）
├─ .env                   # 本地真实配置（已被 .gitignore 忽略）
├─ public/
│  ├─ index.html          # 单页应用入口
│  ├─ css/style.css       # 主题样式（少女粉 / 诺亚蓝紫）
│  ├─ js/
│  │  ├─ live2d.js        # Live2D Cubism 3 渲染封装（表情/动作/口型）
│  │  └─ app.js           # 聊天 / TTS / 历史 / 主动搭话 业务逻辑
│  └─ model/
│     ├─ yumi/            # Yumi 模型（.moc3 / .cdi3.json / .physics3.json …）
│     └─ no4/             # 诺亚模型
└─ _tmp_unzip/            # 临时解压目录（已在 .gitignore）
```

---

## 🚀 快速开始

### 环境要求

- **Node.js ≥ 12**（仅使用内置 `http / fs / path / url` 模块，无第三方依赖）
- 一个能访问公网的浏览器（用于调用 Qwen / MiniMax 接口）

### 1. 克隆与安装

```bash
git clone <your-repo-url> shy_AI-Cartoon-Chat
cd shy_AI-Cartoon-Chat
```

> 本项目**不需要** `npm install`，零依赖。

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入真实 Key：

```ini
# 阿里云百炼（Qwen）
DASHSCOPE_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
MODEL=qwen-plus
PORT=3000

# MiniMax TTS（不配则自动禁用语音朗读，文字聊天照常工作）
MINIMAX_API_KEY=eyJxxxxxxxxxxxxxxxx
MINIMAX_GROUP_ID=
MINIMAX_TTS_BASE_URL=https://api.minimax.chat/v1/t2a_v2
MINIMAX_TTS_MODEL=speech-02-turbo
MINIMAX_VOICE_ID=female-tianmei
MINIMAX_TTS_SPEED=1.0
MINIMAX_TTS_PITCH=0
```

### 3. 启动服务

```bash
node server.js
# 或
npm start
```

终端打印 `✨ Yumi 聊天网站已启动： http://localhost:3000` 后，浏览器访问 [http://localhost:3000](http://localhost:3000) 即可。

> 修改 `.env` 后需要重启服务才会生效。

### 部署到阿里云 ESA Pages

仓库根目录包含 `esa.jsonc`，从 Git 仓库创建 Pages 时会自动使用以下配置：

- 安装命令、构建命令：留空（项目零依赖且无需构建）
- 根目录：`/`
- 静态资源目录：`./public`
- 函数文件路径：`./esa-function.js`
- Node.js 版本：`20`

在 ESA 控制台配置环境变量，至少需要填写 `DASHSCOPE_KEY`。如需语音功能，再填写
`MINIMAX_API_KEY` 及相关 MiniMax 配置。ESA 不需要 `PORT`，也不会读取本地 `.env` 文件。

`server.js` 仍用于本地 Node.js 开发；`esa-function.js` 是 ESA 边缘运行时专用入口。

---

## 🔑 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
| --- | :-: | --- | --- |
| `DASHSCOPE_KEY` | ✅ | — | 阿里云百炼 API Key，对话功能必需 |
| `DASHSCOPE_BASE_URL` | ❌ | 兼容模式 Chat Completions | 自定义网关可改 |
| `MODEL` | ❌ | `qwen-plus` | 使用的 Qwen 模型名 |
| `PORT` | ❌ | `3000` | HTTP 监听端口 |
| `MINIMAX_API_KEY` | ❌ | 空 | 不填则禁用 TTS |
| `MINIMAX_GROUP_ID` | ❌ | 空 | 组织 ID，可在控制台查询 |
| `MINIMAX_TTS_BASE_URL` | ❌ | `https://api.minimax.chat/v1/t2a_v2` | TTS 端点 |
| `MINIMAX_TTS_MODEL` | ❌ | `speech-02-turbo` | TTS 模型 |
| `MINIMAX_VOICE_ID` | ❌ | `female-tianmei` | Yumi 默认音色（甜美女声） |
| `MINIMAX_VOICE_ID_NO4` | ❌ | `male-qn-qingse-jingpin` | 诺亚默认音色（青涩少年） |
| `MINIMAX_TTS_SPEED` | ❌ | `1.0` | Yumi 语速 |
| `MINIMAX_TTS_SPEED_NO4` | ❌ | `1.05` | 诺亚语速 |
| `MINIMAX_TTS_PITCH` | ❌ | `0` | Yumi 音高 |
| `MINIMAX_TTS_PITCH_NO4` | ❌ | `2` | 诺亚音高（略高以贴合少年感） |

---

## 🛰 HTTP API

服务启动后，对外暴露三个接口：

### `POST /api/chat`
请求模型生成对话，并按 JSON 解析 `reply / mood / action`。

```jsonc
// Request
{
  "model": "yumi",                  // 可选：yumi | no4，默认 yumi
  "messages": [
    { "role": "user",      "content": "你好呀" },
    { "role": "assistant", "content": "嗨～" }
  ]
}

// Response 200
{
  "reply":  "在的哦～今天有什么想聊的呀？",
  "mood":   "happy",
  "action": "wave"
}
```

服务端会自动：

- 注入角色专属 `systemPrompt`；
- 限制最多保留 **最近 20 条** 历史，单条内容截断到 **2000 字**；
- 兜底 `fallbackReply` 防止模型返回非 JSON 时前端崩。

### `POST /api/tts`
把文本转成 MP3 音频流，返回 `audio/mpeg` 二进制。

```jsonc
// Request
{ "model": "yumi", "text": "在的哦～" }
```

未配置 `MINIMAX_API_KEY` 时返回 `{ "enabled": false }`，前端会自动关闭朗读。

### `GET /api/tts/status`
供前端初始化时探测 TTS 是否启用：

```json
{ "enabled": true, "voiceId": "female-tianmei" }
```

其余路径走静态文件托管（`public/`），并对路径做了 `..` 越权检查。

---

## 🎭 角色与人设

服务端在 `MODELS` 中集中维护角色配置（`server.js`），切换角色只需在请求里指定 `model`：

| 角色 | id | 性格 | 语气 | 默认 TTS 音色 |
| --- | --- | --- | --- | --- |
| Yumi | `yumi` | 温柔可爱、有点害羞 | 甜美亲切、偶尔俏皮 | `female-tianmei` |
| 诺亚 | `no4` | 少年感正太 | 又酷又有点拽、冷幽默、不卖萌 | `male-qn-qingse-jingpin` |

> 两个角色都强制按 `json_object` 输出，结构：
> `{"reply": "...", "mood": "...", "action": "..."}`，
> 前端用这套 JSON 同时驱动气泡、表情和动作。

如需新增角色，只需在 `MODELS` 里加一项 `systemPrompt` 与 `voiceId / voiceSpeed / voicePitch`，
并在 `public/index.html` 与 `public/js/app.js` 的角色切换器里登记按钮。

---

## 🛠 常用脚本

```bash
# 启动服务
npm start

# 直接用 Node 启动（推荐用于调试）
node server.js

# 快速查看服务进程
curl http://localhost:3000/api/tts/status
```

---

## 🩺 常见问题

**Q1. 启动后访问报 404？**
确认你是访问 `/`（会自动落到 `public/index.html`），并检查 `public/` 目录完整。

**Q2. 一直提示「服务端未配置 DASHSCOPE_KEY」？**
检查 `.env` 是否存在、是否被改动过、Key 是否有效；改完 `.env` 需要重启 `node server.js`。

**Q3. TTS 没声音？**
- 浏览器需允许自动播放（建议先在页面任意点一下，再发送消息）；
- 打开控制台查看 `/api/tts` 响应，未启用时会返回 `{ "enabled": false }`；
- `MINIMAX_API_KEY` 或 `MINIMAX_GROUP_ID` 缺失会导致后端拒绝合成。

**Q4. 想换模型或音色？**
改 `.env` 中 `MODEL` / `MINIMAX_VOICE_ID*` 等字段即可；想给诺亚换男声也可以在 `.env` 里覆盖 `MINIMAX_VOICE_ID_NO4`。

**Q5. 表情/动作没触发？**
模型必须严格返回 `mood` ∈ 七种枚举、`action` ∈ `wave / tear / sweat / none`。
若解析失败，前端会回落到 `neutral / none`。

**Q6. 端口被占用？**
在 `.env` 中把 `PORT` 改成其它端口（如 `3001`）再重启。

---

## 📝 开发备忘

- 服务端对所有外部接口均设置了 **1MB / 100KB** 请求体上限，避免被刷；
- 静态托管做了一次 `path.normalize` 防越权，但仍建议反向代理层再加一道白名单；
- Live2D Cubism 3 资产请放到 `public/model/<role>/`，文件名需包含 `.model3.json`；
- 本仓库**未携带**任何 npm 依赖；如未来引入 `npm` 包，请把 `package-lock.json` 一起提交。

---

## 📜 License

仅供个人学习与娱乐使用，**禁止商用**。
Live2D 模型版权归原作者所有，请勿用于商业分发。
