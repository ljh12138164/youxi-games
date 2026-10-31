# CI 自动创建、发布和更新游戏

推送到 `main`，或在 main 手动运行 Game CI，构建与发布均由 GitHub 托管 Linux runner 完成，用户电脑无需开机。PR 只运行无凭据 CI。发布范围由 `deploy/games.json` 显式控制，发现入口不等于允许上线。

## 添加新游戏

1. 使用 `pnpm run new:game -- <slug> "名称"` 创建独立入口，完成本次授权的游戏功能。
2. 添加 `games/<slug>/tests/*.test.ts` 玩法测试，以及 `tests/platform-driver.mjs` 平台驱动。`pnpm test` 自动运行各游戏测试和发布流程测试。
3. 在 `deploy/games.json` 加入 `create` 配置。该配置表示允许 CI 在后台创建并首次发布这个游戏。
4. 推送 main。CI 构建、自测通过后，自动创建游戏、保存 UUID、上传产物、冻结候选并发布。后续提交复用 UUID 更新。

清单示例（第二项仅为文档示例，没有加入实际发布清单）：

```json
{
  "card-realms-h5": {
    "slug": "card-realms-h5",
    "create": {
      "title": "卡牌领地",
      "summary": "极简俯视桌面卡牌放置与资源建造生存游戏。",
      "description": "通过堆叠村民、资源和建筑卡牌，合成工具与防具，抵御周期性事件入侵并经营你的领地。",
      "instructions": "鼠标左键拖拽卡牌重叠堆放触发进度；空格键暂停；支持全屏模式与本地存档自动保存。",
      "devices": ["desktop"],
      "categories": [],
      "coverId": null
    }
  },
  "second-game": {
    "slug": "second-game",
    "create": {
      "title": "第二款游戏",
      "summary": "一句话介绍实际玩法。",
      "description": "游戏介绍、目标和存档说明。",
      "instructions": "填写真实操作方法。",
      "devices": ["desktop"],
      "categories": [],
      "coverId": null
    }
  }
}
```

每项必须在 `gameId` 与 `create` 中二选一，不能同时提供。清单 key、slug、`games/<slug>/` 目录须一致。

- `gameId`：绑定经核对的已有、已上架游戏，只更新文件。
- `create`：首次创建的元数据。title、summary、instructions 必须有实际内容；devices 仅声明已支持的 desktop/mobile。categories 使用平台现有分类 UUID；coverId 引用平台已存在封面，或 null。当前流程不自动上传封面或创建分类。
- `create` 内容只用于首次创建，后续不会据此改写线上资料。创建尚未完成时不要更改已保存的创建请求；需要修改时先恢复并核对对应对象。
- 不把示例、仅有 roadmap 的游戏或未获授权上线的项目加入清单。当前实际清单以 `deploy/games.json` 为准。

## CI 与发布隔离

verify 自动发现 `games/*/index.html`，逐个构建到 `dist/games/<slug>/`，保存 `games-<SHA>` artifact。deploy 只下载同一次运行、同一提交的 artifact，不重新构建。

发布前先检查整份清单及所有已登记游戏的包与报告：自动自测必须 passed、0 failed、0 blocked，文件摘要必须与报告一致。然后按清单顺序串行处理：

1. 核对 main HEAD，防止旧提交发布。
2. 新游戏：检查 slug 冲突，保存创建请求与固定幂等键，再调用 `create_game`；立即持久保存返回的 UUID。
3. 已绑定游戏：核对 UUID、slug、上架状态和后台资料。已停用游戏不会自动重新上架，未发布的资料变动会使任务停止。
4. 比较待发布文件与现网文件；未变化则跳过。首次发布不跳过上传。
5. `begin_upload` → 逐文件 PUT → `finish_upload` → `create_game_preview` → 发布这个 candidateId，核对 stateRevision。
6. 保存 `deployment-<SHA>-<attempt>` artifact，包含各游戏结果、版本和绑定状态备份。

某款发布失败会停止后续，前面成功的不会自动回滚；失败前未发布的候选保留在后台，现网仍使用原版本。整份清单的检查失败发生在任何平台写入之前。

自动化不调用删除、下架、站点配置或覆盖分类接口。普通更新只替换目标游戏文件，保留名称、封面、分类、设备、slug 和稳定游戏域名。原本未登记的游戏不在写入范围。

## 创建重试与绑定状态

独立 `scalia-ci-state` 分支中的 `release-state.enc.json` 是持久状态，使用 AES-256-GCM 加密，解密密钥仅保存在 `SCALIA_STATE_KEY` Actions Secret。其明文结构包含授权和 `releaseState`；后者保存仓库标识、slug → UUID、创建请求、创建幂等键及最近发布版本。主分支不保存该状态。

- 创建意图先写入云端密文，并等待 GitHub 保存成功，再发网络请求。创建响应丢失时，重跑会用原请求和原幂等键重放，避免重复创建。
- 已拿到 UUID 后，后续重跑直接使用该 UUID；上传或发布中断不会另建游戏。
- 状态丢失时，同 slug 已存在会直接报错，绝不根据标题或 slug 自动接管。恢复状态分支历史中的密文和对应密钥；必要时将部署回执中的 `deploymentState` 恢复到加密载荷的 `releaseState`，并保留最新授权。也可核对 UUID 后改用显式 `gameId`（该模式要求游戏已上架）。
- 不删除绑定状态来“修复”重试，不提交明文状态、凭据或密钥。runner 临时文件仅供当次运行，不能作为跨次状态；缓存与 artifact 都有淘汰/保留期限，不作唯一状态存储。
- 首发未成功且创建元数据需要改变时，先核对原对象和保存的请求，不能换随机幂等键反复创建。

## 授权与运行条件

verify 和 deploy 均使用 `ubuntu-latest`；不需要本地 runner、Windows 服务或本机路径变量。

- 管理连接使用浏览器授权，范围为 `manage:read manage:draft manage:publish`。脚本通过官方 HTTP API 执行管理操作。
- access/refresh token 在云端内存中解密。刷新后立即加密写回状态分支，即使后续发布失败，下一次仍可使用最新 refresh token；新 token 在日志中屏蔽，不进入构建或部署 artifact。
- `SCALIA_STATE_KEY` 为随机 32 字节密钥的 Base64，仅保存在 Actions Secret。公开仓库的状态分支只能包含密文。密钥丢失或泄露后应重新授权并迁移密文，不能直接换密钥丢弃原绑定。
- verify 的 GITHUB_TOKEN 为 contents:read。deploy 使用当次临时 GITHUB_TOKEN 的 contents:write、actions:read 权限，仅向固定状态分支写密文，不提交代码或改 main，不需要额外个人访问令牌。GitHub contents API 以旧文件 SHA 检查冲突；写入响应丢失时核对密文是否已保存，其他并发变动则停止。
- 同一管理连接的发布任务串行执行，不因新推送取消正在进行的发布。
- 平台连接最长 30 天，到期或撤销后需重新浏览器授权，并更新云端加密载荷中的 credential，保留 releaseState。此为平台的绝对期限，刷新短期令牌不会延长期限。

首次配置由已授权的维护者生成密钥并写入 Actions Secret，再将现有管理连接及绑定加密，创建只含密文文件的状态分支。发布任务不会自动创建空状态：缺少分支、文件、密钥或解密失败均停止，以免丢失已有游戏绑定。迁移完成后停用旧本地发布服务，避免两处同时刷新同一连接；旧本机凭据不再作为发布源。

## 故障处理与任务范围

CI/CD 故障优先检查失败步骤和部署回执，修复配置、授权、状态或 API 问题后重跑相应工作流。未改游戏且已有适用验收记录时，不因排查部署而重复整轮玩法验收。

授权过期时浏览器重新授权并更新加密状态；Secret 与状态分支必须在触发工作流前配置。平台修订冲突时停止并核对后台新改动，不盲目替换修订号覆盖。排查云端日志与回执，不再检查本机 runner 服务。

官方参考：[管理 API](https://scalia.ltd/docs/api)、[上传与发布](https://scalia.ltd/docs/publishing)、[管理连接授权](https://scalia.ltd/docs/mcp)。
