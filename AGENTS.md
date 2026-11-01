# 项目约定

- 涉及游戏研究、开发、验收或发布时，先读取 [.agents/skills/scalia-game-workflow/SKILL.md](.agents/skills/scalia-game-workflow/SKILL.md)，按本次任务范围工作。仅规划或仅文档请求不实现玩法、不登记上线。
- 使用 pnpm 和已有 `pnpm-lock.yaml`，不要混用多个包管理器锁文件。
- 界面样式使用仓库级 Tailwind CSS 4；游戏入口导入 `shared/styles/tailwind.css` 并显式扫描本游戏源码。通用布局优先 utility，复杂游戏视觉保留 CSS；具体迁移与验证规范见项目 skill。
- 各游戏完整放在 `games/<slug>/`，拥有自己的 HTML、代码、资源和元数据。不同游戏不要互相导入业务代码。
- `shared/` 只接收确实共用的功能，不反向依赖具体游戏。避免预先搭建通用游戏引擎、抽象插件系统或后端。
- 每款游戏可以选择 React、Canvas 或两者结合。渲染引擎由该游戏导入，开发目录页只读取元数据。
- 新入口使用 `pnpm run new:game -- <slug> "名称"`；入口发现遵循 `games/*/index.html`，目录元数据遵循 `games/*/game.json`。
- 发布资源从源代码导入，禁止把平台管理凭据放入前端。平台接入时遵循官方适配器协议；具体要求见 README。
- 运行 `pnpm run typecheck`。改动构建、入口或资源时，再运行 `pnpm run build` 和受影响游戏的 `pnpm run build:game -- <slug>`。
- 每次改动保持范围明确，新增工具或依赖前先确认当前实现是否已经够用。
- 推送 main 会自动创建/发布/更新 `deploy/games.json` 中的游戏；PR 只检查。新游戏使用显式 `create` 配置，已有游戏绑定经核对的 UUID；不要登记模板、测试游戏或尚未获授权上线的项目。
- 构建和发布都使用 GitHub 托管 runner，不依赖用户电脑或 self-hosted runner。凭证和绑定仅以 AES-256-GCM 密文保存在独立 `scalia-ci-state` 分支，密钥存入 Actions Secret；禁止提交明文凭证。创建前先持久保存幂等意图，创建后复用 UUID，slug 冲突停止；不覆盖清单外的游戏，不删除重建或自动重新上架停用游戏。发布规则见 [docs/CI-CD.md](docs/CI-CD.md)。
- CI/CD 排障聚焦失败任务和发布回执；游戏未改动且已有适用验收记录时，不重复整轮玩法验收。新增测试遵循 `games/<slug>/tests/*.test.ts` 与 `scripts/tests/*.test.mjs`，`pnpm test` 自动发现。
