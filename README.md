# 星语小屋 · Starling Home

灰调玻璃拟态的 AI 伴侣 PWA —— 聊天、记忆、身体涨落与心潮投影，所有数据只存在浏览器本地。

**在线地址：https://yuyuyutut.github.io/starlinghome2/**

> 纯前端项目，GitHub Pages 直接托管构建产物，无需任何服务器。

## 首次部署（一次性，约 3 分钟）

仓库需要一个 workflow 来「构建 + 发布」。手动创建一次即可：

1. 复制本仓库 `deploy/pages.yml` 的全部内容
2. 点 **Add file → Create new file**，文件名填 `.github/workflows/pages.yml`，粘贴后 Commit
3. 打开 **Settings → Pages**，Source 选择 **GitHub Actions**
4. 到 **Actions** 标签页，点 **Run workflow** 触发首次部署（构建约 1-2 分钟）

之后每次 push 到 `main` 都会自动构建 `dist/` 并部署，无需再动手。

> 注意：GitHub Pages 上必须是由 workflow 构建出的产物。`index.html` 里引用的是
> `/src/main.tsx` 源码，浏览器无法直接运行——直接把源码文件传到 Pages 会白屏，
> 这是「打不开」最常见的原因。

## 本地开发

```bash
npm install
npm run dev      # 开发
npm run build    # 构建（输出 dist/，base 为相对路径，可挂在任意子路径）
npx vite preview # 预览构建产物
```

## 功能一览

底部七个板块，单指切换：

- **聊天** — 流式回复、打字动画、思维链展示（Claude / Kimi 等 reasoning 模型）、好感度变化提示；图片识别可开关
- **角色卡** — 名字、性格、说话风格、关系设定，编译为 system prompt
- **记忆** — 自动摘要跨对话携带；显影记忆按消息检索旧事注入；事实簿一句一条；久别重逢带回「上次聊到哪 + 未了的事」
- **生理** — 身体周期与七项数值随时间与互动推进，按触发表抽取短时事件，以 `<ephemeral_state>` 隐藏状态卡注入每轮请求；支持独立模型连接（留空沿用主模型），结算与梦境系统未移植，详见 `src/modules/body/PORTING.md`
- **心潮** — 接入「心潮·念」动态心念引擎后，实时呈现 TA 的驱力潮位（11 项 + 花蕊三值）、心绪痕迹、24 小时信号、梦境余韵、混合心绪与人格锚点；面板打开时按设定间隔轮询，关闭即停
- **应用** — 山屋等内置小应用
- **设置** — API 连接（含官方/第三方预设、拉取模型、测试）、记忆系统、双方思考、思维链、备份与恢复、危险操作

## 心潮引擎接入

1. 心潮服务端 `.env` 的 `DASHBOARD_ALLOWED_ORIGINS` 加入本页来源（如
   `https://yuyuyutut.github.io`），重启引擎
2. 「设置 · 心潮引擎（动态心念）」填服务地址与 `DASHBOARD_ACCESS_TOKEN`，点测试连接
3. 回到「心潮」板块即可看到实时投影；会话令牌只保存在本机浏览器

## 数据与隐私

- 所有数据（聊天记录、角色卡、记忆、API Key、心潮令牌）只存浏览器本地（IndexedDB / localStorage），不进备份、不进仓库
- **API Key 永不上传**；纯前端直连模型服务商，公开部署请自行评估风险或加后端代理
- 心潮板块例外：数据实时来自你自托管的心潮·念 引擎（见上节），这是唯一会发出的网络请求

## 目录结构

```
├── index.html            # 入口（Pages 上由 workflow 构建，不直接引用源码）
├── src/
│   ├── modules/          # 各功能独立成目录，方便单独修改
│   │   ├── chat/         # 聊天
│   │   ├── character/    # 角色卡
│   │   ├── memory/       # 记忆系统
│   │   ├── body/         # 生理系统（含 PORTING.md 未移植清单）
│   │   ├── tide/         # 心潮（client.ts 引擎客户端 + TidePanel 面板）
│   │   ├── hut/          # 山屋
│   │   └── settings/     # 设置页各区块
│   ├── assets/           # 图片资源（base64 内联，纯文本仓库）
│   └── lib/              # IndexedDB 封装、settings、llm
├── deploy/pages.yml      # Pages 部署 workflow 模板（复制到 .github/workflows/）
└── vite.config.ts        # base: './'，可挂任意子路径
```

## 技术栈

Vite 7 · React 19 · TypeScript · Tailwind CSS · shadcn/ui · vite-plugin-pwa
