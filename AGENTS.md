# AGENTS.md

本文件是本仓库的工程约束，不是变更日志。开始修改前先读 `README.md`、`package.json` 和本文件。

## 项目定位

- 面向中国大陆用户的双角色 Live2D AI 聊天网站。
- Node.js 20，原生前端，默认零 npm 依赖、零构建步骤。
- 本地/普通服务器入口是 `server.js`；阿里云 ESA 边缘入口是 `esa-function.js`。
- 浏览器运行时库固定版本并保存在 `public/vendor/`，不依赖境外 CDN。

## 修改边界

- 前端聊天状态、TTS 和角色 UI 在 `public/js/app.js`。
- Live2D 生命周期、WebGL、表情和动作在 `public/js/live2d.js`。
- Node API 与静态服务在 `server.js`。
- ESA API 在 `esa-function.js`；修改 API 校验、超时、并发、响应结构时必须同步 Node 与 ESA 两份实现。
- ESA 新增环境变量时，同时更新 `build-esa-env.cjs`、`.env.example` 和 `README.md`。
- 角色配置目前在 Node、ESA 和前端各有一份。新增角色必须同步人设、音色、前端切换器、能力映射和文档。

## 性能红线

- 不得重新引入 Google Fonts、jsDelivr 或其它境外首屏依赖。
- 不得把 8192×8192 纹理放回线上；Live2D 纹理以 4096 为上限，新增资源需记录压缩前后大小。
- 移动端保持最高 1× DPR、30 FPS；桌面端最高 1.5× DPR、45 FPS，除非有量化数据证明提高后仍满足性能目标。
- 页面隐藏时必须暂停 Pixi ticker；切换模型必须释放旧 texture/baseTexture。
- 避免在多个 ticker 中重复逐帧写模型参数。静态状态应合并处理或只在变化时写入。
- 浏览器历史最多 40 条；发给服务端的历史最多 20 条。
- 不得取消 API 请求体、超时或并发限制。公众部署还需在外部网关做按用户/IP 限流。

## 移动端与可访问性

- 至少回归 390×844 与 390×667 两个视口。
- 页面不得横向溢出；输入区需考虑 `env(safe-area-inset-*)`，文本输入字号不得低于 16px。
- 主要触控目标最小 40×40px，发送和输入控件最小高度 44px。
- 新增图标按钮必须提供中文 `aria-label`；异步状态使用 `role=status`/`aria-live`。
- 保留 `prefers-reduced-motion` 降级，不用动画承载必要信息。

## 安全与隐私

- 永远不要提交 `.env`、API Key、Token 或用户聊天数据。
- 不把上游原始错误体直接返回浏览器；服务端日志也不得记录密钥或完整聊天内容。
- 前端只允许发送 `user`/`assistant` 历史，服务端负责注入 `systemPrompt`。
- 静态路径处理、请求大小限制和模型输出容错必须有测试覆盖。
- 聊天历史使用 `sessionStorage`，不要在没有产品决策的情况下改成长期或服务端存储。

## 开发与验证

```bash
node server.js
npm test
npm run check
```

PowerShell 执行策略拦截 `npm.ps1` 时使用 `npm.cmd`。

每次改动至少执行：

1. `npm run check`（Windows 可用 `npm.cmd run check`）。
2. `git diff --check`。
3. 涉及 UI 时，用本地服务检查桌面端和上述两个移动端视口。
4. 涉及模型时，切换 Yumi/诺亚并确认控制台无错误、页面只有一个 canvas。
5. 涉及静态服务时，检查 ETag、缓存头、压缩和 HEAD。

测试使用 Node 内置 `node:test`，放在 `test/`。保持测试无网络、无真实 Key。

## 依赖与资产

- 当前无 npm 依赖。确需引入依赖时，说明收益、运行时成本和大陆可用性，提交锁文件。
- `public/vendor/` 中当前包含 PixiJS 6.5.2、pixi-live2d-display 0.4.0 和对应 Cubism Core；升级必须三者兼容并完成双角色回归。
- 图片/纹理做确定性压缩，不得用生成式图像工具重绘 UV 纹理。
- 不修改 `_tmp_unzip/`、压缩包或 `.codebuddy/plans/` 作为产品代码；它们是来源/历史材料。
- `LICENSE` 为项目自有代码与文档的 Apache-2.0 许可证；不得把该许可证误写为 Live2D 模型或第三方运行库的授权。

## 文档同步

- `README.md` 面向使用者与运维者，必须与实际命令、路径、环境变量和部署方式一致。
- 本文件只写会影响下一位 Agent 正确修改代码的稳定规则，不记录日期、单次修复或完成清单。
- 代码改变接口、部署、环境变量、依赖、性能预算或数据处理方式时，同一改动内更新 README。
