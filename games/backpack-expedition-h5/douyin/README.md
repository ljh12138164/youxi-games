# 背包远征：H5 / 抖音共用游戏

**当前状态：完整迁移仍在进行，尤其是旧版界面 UI 的逐项恢复，尚未完成最终验收。** 最新暂停状态和必须完成的工作见 [迁移交接记录](../../../docs/games/backpack-expedition-h5/MIGRATION-HANDOFF.md)。下文已接入功能不等于视觉与交互全部对齐。

两端共用 `src/canvas-game.ts`（界面、输入判定、菜单、动画）、`src/engine.ts`（规则）、`src/content.ts`（内容）及图像映射。原 React 界面和早期简化版抖音界面已移除，不再分别补玩法。

平台差异仅在 `src/canvas-browser.ts` 与 `douyin/game.ts`：浏览器 Pointer Events / 抖音触摸事件、Web Storage / TT Storage、Web Audio / InnerAudioContext、网页生命周期 / `onHide` 与 `onShow`。音效频率共用 `audio.ts` 的常量。浏览器的辅助操作列表供读屏使用，调用同一批 Canvas 操作，没有第二套规则。存档文本输入在 H5 使用原生文本框，抖音使用剪贴板。

## 本地开发与构建

```powershell
pnpm dev --port 5180
pnpm run build:game -- backpack-expedition-h5
pnpm run build:backpack:douyin
pnpm run test:backpack:canvas
```

- H5：`http://localhost:5180/games/backpack-expedition-h5/`；独立包 `dist/games/backpack-expedition-h5/index.html`。
- 抖音：在官方开发者工具中导入 `dist/douyin/backpack-expedition-h5/`，项目类型选择小游戏。目录内有 `game.js`、`game.json`、`project.config.json` 和本地素材。
- 真实 AppID 可以通过 `DOUYIN_APP_ID` 环境变量传入构建。不配置时不伪造 AppID，仅用于工具本地调试；正式预览、真机与提审需要合法应用配置。
- 构建检查抖音产物无 `document`、`window`、`localStorage`、React DOM 或游隙网页适配器依赖。构建会清理本游戏专属输出目录，防止旧字体等资源混入新包。
- CI 同时构建抖音产物并执行共享界面回归；只保存构建产物，不自动上传或发布抖音小游戏。

## 已迁移范围

三档难度、全部 43 件装备、15 类敌人、12 个事件、三层路线与新局每层八站；保留旧档规则。地图、战前准备、回合战斗、战利品、商店买卖与换货、营地、事件、扩容、胜败重开、图鉴、帮助、沿途记录、存档导入导出与备份，均在共享界面实现。

电脑支持物品中心跟随拖动、右键 / R 旋转、合法交换预览、多物品整体换位、非法落点回退和地上暂放。触屏按住物品约 320ms 后可拖动，支持同一套交换、非法回退和临时放下规则；拖动到视区上下边缘会自动滚动。短按仍可点选后点格子放置，未长按就直接滑动则滚动页面，保留旋转按钮。抖音模拟器的鼠标操作按触摸处理，也需要先长按。战斗保留快捷目标、数字选敌、消耗品、道具使用动画及真实结算提示；暂停停止动画时间并阻止操作。

按用户最新反馈，字体恢复系统中文无衬线字体，最小正文 14px；像素图像、硬边面板保持原风格。背包只显示两字类别标记，完整名称通过底部选中详情查看，避免格子裁字。

H5 存档键沿用 `youxi:backpack-expedition-h5:v1`；抖音使用独立键 `youxi:backpack-expedition-h5:douyin:v1`。两端共用校验、上一份备份、旧窗口覆盖保护与 JSON 格式，可以手动导出 / 导入，不会自动跨设备同步。

## 验证与边界

共享界面回归使用真实浏览器鼠标、键盘、触屏点击与 CDP 触摸滑动；覆盖正常首战、拖放旋转、交换、地上取回、买货落地、换货确认、事件、营地、扩容、旧档、图鉴、有效 / 无效导入、难度重开、暂停、动画和 320 / 390 / 660px 竖屏与 844px 横屏。另以 TT 接口替身验证实际抖音 bundle 的触摸、独立存档、前后台暂停及静音，明确属于浏览器宿主集成测试。

官方 IDE 4.5.7 已实际导入、编译、显示并读取已有游戏进度；官方 CLI 已完成进入游戏与场景切换的截图、坐标和 console 状态取证。工具窗口在操作中由 3 变为 4，已重新锚定；用户同时试玩时，不能把所有日志增量都归因于自动操作。本记录不冒充完整官方自动验收。

实体 Android / iPhone、抖音真机预览、设备音频听测和提审尚未完成。现阶段完成的是共用代码迁移与本地兼容，不等于已上架或已通过官方审核。
