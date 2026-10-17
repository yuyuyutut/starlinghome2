# 星语小屋 PWA（前端）

AI 伴侣聊天 PWA —— 灰调玻璃拟态风格，纯前端，所有数据只存浏览器本地。
本目录是「心潮·念」仓库里的前端 PWA 源码，独立构建、独立部署到 GitHub Pages。

## 目录说明

- `src/` — 全部源码（聊天 / 角色 / 记忆 / 生理 / 心潮 / 应用 / 设置 七大板块）
- `src/assets/` — 生成的二进制资源（base64 data URI 的 .ts 模块，76 字符折行）。
  **这些文件不进仓库**（体积大且由生成脚本产出），解压交付的 zip 后整个
  `src/assets/` 目录拷入即可；缺失时 `npm run build` 会报模块找不到
- `src/assets-gen.ts` — 资源统一出口（背景图、图标等）
- `deploy/pwa-pages.yml` — 仓库根 `.github/workflows/` 里的 Pages 部署 workflow 模板

## 部署到 GitHub Pages（仓库根已有 workflow 时）

1. 推送代码后，到 **Settings → Pages**，Source 选 **GitHub Actions**
2. Actions 里运行「Deploy PWA to GitHub Pages」，约 1-2 分钟
3. 站点地址：`https://tianyupaipai-cmd.github.io/xinchao-nian/`

之后每次 push 到 main 且改动 `pwa/**` 都会自动构建部署。

## 本地开发

```bash
npm install
npm run dev      # 开发
npm run build    # 构建（输出 dist/）
```

## 说明

- 纯前端 PWA：聊天记录、角色卡、记忆、API Key 只存 IndexedDB / localStorage
- **API Key 永不上传、不进备份、不进仓库**；公开部署请自行加后端代理
- 构建依赖 `src/assets/` 下的生成资源（见上「目录说明」）
