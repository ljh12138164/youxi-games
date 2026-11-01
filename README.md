# 游隙 H5 多游戏项目

本仓库采用多游戏独立入口架构，当前游戏入口为 `card-realms-h5`（卡牌领地）与 `long-night-embers-h5`（永夜余烬）。空白 `starter` 示例已移除；新增游戏的 `templates/game/` 脚手架继续保留。

游戏规划与台账：[卡牌领地产品定义与开发路线图](docs/games/card-realms-h5/ROADMAP.md) 与 [玩法基线核对表](docs/games/card-realms-h5/REFERENCE.md)。

第二款游戏规划与台账：[永夜余烬路线图](docs/games/long-night-embers-h5/ROADMAP.md) 与 [玩法基线研究和核对清单](docs/games/long-night-embers-h5/REFERENCE.md)。

技术栈：Vite 8 + TypeScript + React 19。使用 pnpm 管理依赖并提交 `pnpm-lock.yaml`；Node.js 要求 `^22.18.0 || >=24.0.0`，建议使用 Node.js 24 LTS。

## 开发

```powershell
cd D:\code\youxi-games
pnpm install
pnpm dev
```

- 开发目录页：`http://127.0.0.1:5173/`
- 卡牌领地：`http://127.0.0.1:5173/games/card-realms-h5/`
- 永夜余烬：`http://127.0.0.1:5173/games/long-night-embers-h5/`

目录页只读取各游戏的 `game.json`，不预先加载游戏代码。每个游戏通过自己的 HTML 独立启动，没有客户端路由或全局游戏状态。

## 目录约定

```text
youxi-games/
  index.html                  本地开发目录页 HTML
  src/                        目录页的 React 代码
  games/
    card-realms-h5/           卡牌领地独立入口
      index.html              每款游戏自己的 HTML 入口
      game.json               名称、简介；供开发目录页读取
      src/                    本游戏的代码和样式
      assets/                 本游戏的图片、音频等资源
    long-night-embers-h5/     永夜余烬独立入口
      index.html              每款游戏自己的 HTML 入口
      game.json               名称、简介；供开发目录页读取
      src/                    本游戏的代码和样式
      assets/                 本游戏的图片、音频等资源
  shared/
    styles/base.css           可选的公共基础样式
    README.md                 共享代码边界
  templates/game/             新游戏脚手架模板，不参与构建
  scripts/
    games.mjs                 自动发现 HTML 入口
    new-game.mjs              创建新游戏目录
    build-game.mjs            打包单款游戏为独立 HTML
  vite.config.ts              多入口构建配置
  tsconfig.json               TypeScript 严格检查
```

游戏变复杂后，再在自己的 `src/` 内按实际需求拆分规则、状态、数据、界面或场景。目前不提前创建空的引擎层、后端、存档系统或状态管理框架。

## 新增游戏

```powershell
pnpm run new:game -- stacked-village "堆叠村庄"
```

将生成 `games/stacked-village/`。脚本拒绝覆盖已有目录，slug 使用小写字母、数字和连字符。新增后重启开发服务；重新构建时自动发现入口，无需修改 Vite 配置或手写注册表。

`game.json` 示例：

```json
{
  "title": "堆叠村庄",
  "description": "项目入口已就绪，尚未实现游戏玩法。"
}
```

## React 与 Canvas

模板默认使用 React，适合卡牌、菜单和管理界面。每款游戏可独立选择实现方式：

- React：直接在自己的 `src/App.tsx` 中开发。
- React + Canvas：在 React 组件中挂载 Canvas，并在组件清理时销毁引擎、事件和动画循环。
- 纯 Canvas / PixiJS / Phaser：替换该游戏的 `src/main.tsx` 内容；如需改文件名，同时修改自己的 `index.html` 中的脚本路径。Vite 直接编译，无需让 Canvas 通过 React 渲染。

需要哪个依赖再安装，例如 `pnpm add pixi.js` 或 `pnpm add phaser`。引擎由相应游戏导入，不要从目录页或共享模块统一加载。当前没有预装 Canvas 引擎。

## 构建与校验

```powershell
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run preview
```

提交代码时会自动通过 Husky 与 lint-staged 调用 Oxlint 进行暂存区代码校验。

多入口产物位于 `dist/site/`：

```text
dist/site/
  index.html
  games/card-realms-h5/index.html
  games/long-night-embers-h5/index.html
  assets/                     Vite 按引用关系拆分和共享的资源
```

这是整站构建，需要保留完整目录，不能仅复制某个 HTML。`base: './'` 让资源使用相对路径；使用 `pnpm run preview` 通过 HTTP 检查生产产物。

若只交付某一款游戏：

```powershell
pnpm run build:game -- card-realms-h5
```

生成 `dist/games/card-realms-h5/index.html`，JS/CSS 内联，可直接打开。单游戏构建使用自己的根目录，不包含目录页和其他游戏，且不会删除其他游戏已生成的发布包。两种构建输出彼此独立。

单文件模式使用 `vite-plugin-singlefile`，每次只构建一个入口；多入口整站构建不启用此插件。游戏资源应从源代码导入，避免远程字体、远程 CDN、运行时读取相对 JSON，以及绕过构建的 `public/` 文件。SVG 可使用 `?inline` 导入。引入 Workers、WASM、大型音视频或运行时外部加载后，需要重新验证是否还能独立分发一个 HTML；必要时使用完整静态资源包。

## 后续接入游隙

### 界面样式约定

仓库通过 `@tailwindcss/vite` 统一接入 Tailwind CSS 4，开发、整站与独立游戏构建使用同一插件。新游戏模板已包含以下配置：

```css
@import '@shared/styles/tailwind.css';
@source './';
```

各游戏独立扫描自己的源码，不启用 Preflight，以保留现有 reset 和游戏视觉。布局优先静态 utility 类，重复组件可用 `@apply`；像素边框、动画、复杂背景继续保留 CSS，运行时坐标和进度使用 inline style 或 CSS 变量。不要动态拼接 utility 类名，不使用 Tailwind CDN。详见项目游戏 skill 的界面样式规范。

仓库已有 `shared/platform/` 适配器和卡牌领地接入代码。每款新游戏仍需将适配器连接到自己的运行状态与音频，并执行产物自测和平台验收：

- 固定可信来源 `https://scalia.ltd`，加载和玩法真正就绪后才发送 `ready()`。
- 手动暂停、侧栏和防 Boss 分别维护暂停原因。
- 区分用户静音与平台临时静音。
- 存档按游戏标识和 schema 版本隔离；平台身份只用于展示，不当作后端凭证。

参考文档：

- [Vite 多入口构建](https://vite.dev/guide/build.html#multi-page-app)
- [单文件构建插件](https://github.com/richardtallent/vite-plugin-singlefile)
- [游隙游戏接入](https://scalia.ltd/docs/game-integration)

## 验证基线

每次改动运行 `pnpm run typecheck` 与 `pnpm run lint`；涉及入口、依赖、资源或构建配置时，同时检查 `pnpm run build` 与受影响游戏的 `pnpm run build:game -- <slug>`。新增入口还应验证目录页链接和独立访问地址。

## GitHub 与 CI/CD

推送到 `main` 后，GitHub Actions 自动检查、构建，并由专用发布 runner 处理 `deploy/games.json`：`create` 自动创建并首次上架新游戏，`gameId` 更新已有游戏；创建后持久保存 UUID，重跑和后续更新不会重复创建。包没有变化则跳过，PR 不发布。字段、授权、运行条件和恢复方式见 [CI/CD 说明](docs/CI-CD.md)。后续 agent 从 [项目技能](.agents/skills/scalia-game-workflow/SKILL.md) 读取工作规则。

## 开源协议

本仓库代码以 [Apache License 2.0](LICENSE) 发布：宽松许可，允许商用与闭源二次分发，同时包含明确的专利授权与专利终止条款，并且不授予任何商标许可。第三方组件的归属见 [NOTICE](NOTICE)，其版权声明会内联进发布产物（构建时保留依赖的许可声明）。

仓库内各游戏的美术、音频、界面与文案均为自行创作，不含第三方素材；`docs/games/*/REFERENCE.md` 等研究文档仅用于内部玩法核对，不随发布包分发。
