# 星语小屋 · Starling Home

AI 伴侣聊天 PWA —— 灰调玻璃拟态风格的陪伴应用。

**在线地址：https://yuyuyutut.github.io/starlinghome/**

## 部署说明（首次一次性设置，约 2 分钟）

由于授权限制，workflow 文件需要手动创建一次：

1. 打开仓库里的 **`deploy/pages.yml`**，复制全部内容
2. 点 **Add file → Create new file**，文件名填 `.github/workflows/pages.yml`，粘贴内容，Commit
3. 打开 **Settings → Pages**，Source 选择 **GitHub Actions**
4. 到 **Actions** 标签页，点 **Run workflow** 触发首次部署（约 1-2 分钟）

之后每次 push 到 main 都会自动构建并部署，无需再动手。

## 本地开发

```bash
npm install
npm run dev      # 开发
npm run build    # 构建（输出 dist/）
npx vite preview # 预览构建产物
```

## 说明

- 纯前端 PWA，所有数据（聊天记录、角色卡、记忆、API Key）只存在浏览器本地（IndexedDB / localStorage）
- **API Key 永不上传、不进备份、不进仓库**；公开部署请自行加后端代理
- 所有图片资源以内联 data URI 形式存放在 `src/assets-gen.ts`，仓库为纯文本，无需处理二进制文件

## 功能

- 聊天：流式回复、打字动画、思维链展示（Claude / Kimi K2.6 等 reasoning 模型）、好感度变化提示
- 角色卡：名字、性格、说话风格、关系设定，编译为 system prompt
- 记忆：自动摘要，跨对话携带；纪念日、按时间问候
- 设置：连接测试、自动整理开关与间隔、备份导出/导入（不含 API Key）、清空聊天
