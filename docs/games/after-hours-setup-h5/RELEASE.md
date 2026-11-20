# 《装机夜班》上架准备

准备日期：2026-11-20。用户已确认生成 16:9 封面、登记首次上线配置并推送 `main` 由 GitHub Actions 自动创建发布。

## 封面

- 使用内置图像生成工具制作并重采样为 16:9 商店封面。
- 原图：[cover-v1.png](../../../games/after-hours-setup-h5/art/cover-v1.png)（1600 × 900）。
- 完整提示词：[cover-v1.prompt.txt](../../../games/after-hours-setup-h5/art/cover-v1.prompt.txt)。
- 发布图：[cover-publish.webp](../../../games/after-hours-setup-h5/art/cover-publish.webp)（1600 × 900，114,028 字节，小于平台 512,000 字节上限）。
- SHA-256：`ef555d3904fb70159fa9b64dc6b15276ab0f1db2c89a97c851bab370e8ad6bc1`。

## 首次上架配置

已加入 [deploy/games.json](../../../deploy/games.json)：

- `slug`：`after-hours-setup-h5`
- `devices`：`["desktop", "mobile"]`
- `create.coverId`：`null`（由 CI 从同一次构建产物中的 `dist/covers/after-hours-setup-h5.webp` 自动上传并绑定平台 UUID，禁止手工创建重复游戏）

## 音频与第三方许可

- `driver.js`（MIT）用于 7 步互动新手指引，构建期由仓库插件内联许可声明。
- 4 首真钢琴背景音乐 MP3 及其完整授权详情记录在 [SOURCES.md](../../../games/after-hours-setup-h5/src/assets/music/SOURCES.md)（包含 CC0 1.0 与 CC BY 3.0 署名），并在「系统设置」内展示演奏者与授权信息。

## 验收与构建记录

- 全仓 `pnpm run lint`、`pnpm run typecheck`、`pnpm test`、`pnpm run build`、`pnpm run build:game -- after-hours-setup-h5`、`gameplay.browser.mjs`（桌面 1440×900 全 16 关与 7 步指引 + 360px 移动端适配）及 `pnpm run ci:games` 均将在推送 `main` 前完成本地复核。
