# 抖音小游戏上架研究

核实日期：2026-11-03（北京时间）。本文件只研究官方的“小游戏”产品，不将普通 App 游戏站、小程序 WebView、直播小玩法或 H5 外链混作上架路径。未登录开发者后台核验本账号资格，未注册应用、提交材料或发布。

## 先给结论

当前背包远征是 React DOM／CSS／SVG 的浏览器 H5，不能将现有独立 HTML 直接作为普通抖音小游戏上传。官方普通小游戏运行环境不提供 BOM／DOM，现成引擎导出指的是已经完成该环境适配的引擎版本。需要先做小游戏运行时适配，或采用官方支持的引擎重建表现层，再走主体、资质、版本审核和备案／核准流程。[官方引擎接入说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/game-engine/cocos-laya-egret)

对当前没有人民币充值的单机游戏，研究建议是先按非内购版本验证技术和资质路径；广告属于另行开通的商业能力，不能将游戏内金币商店等同于人民币内购。若后续接入现金购买道具／游戏币，再核对版号、支付、客服和结算资格。这是本项目的路线建议，并非平台审核结论。[虚拟道具支付协议](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/agreement-and-norms/business-capacity/protocol-2/item-payment)

## 主体与资质

| 项目 | 核实结果及要准备的内容 |
| --- | --- |
| 开发者身份 | 创建小游戏前必须完成主体认证；个人与企业均有入驻路径。个人准备有效身份证材料，企业另需有效营业执照及按指引进行身份／对公验证。不要先用临时主体占位，再假定以后能无成本切换。 |
| 软件著作权 | 准备可核验、名称一致的软著材料。著作权人与平台主体不一致时，还需完整的发行／运营授权链。官方限制同一软著同时用于一款平台在线小游戏。 |
| 自审自查 | 现行资质规范写明可在后台确认自审自查报告，无需另行上传报告；应实际检查后确认。 |
| 版号 | 官方资质 FAQ 将版号明确列为开通内购能力的重要凭证，支付协议也要求相应版号、软著与授权材料。不能将软著、小游戏备案或 ICP 核准当作版号替代物。 |

主体资料依据：[注册与入驻](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/register)、[小游戏审核规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/norms/standard)。资质依据：[小游戏资质规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/norms/credential-norms-for-mini-game)、[资质 FAQ](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/contactus/endowments)。

### 广告、内购与个人主体：不要照搬旧教程

官方 2023 年公告给出的入驻口径是广告游戏提供软著、内购游戏提供版号；这支持先准备软著，但不能据此断言“广告游戏完全不用其他备案”。小游戏备案和 ICP 核准仍是另两条流程。[官方小游戏速报 No.3](https://developer.open-douyin.com/forum/mini-game/post/63dcc2da0e74ca0afa6c000e)

不能简单写成“个人只能做广告，只有企业能做内购”。2026-11-01 生效的新版支付协议将开发者定义覆盖个人；当前虚拟支付 2.0 进件指南也列出了个人、小微、企业、个体工商户等商户类型。是否能为本账号、本游戏开通，仍需结合版号、主体和收款商户审核，在后台确认。[新版支付协议](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/agreement-and-norms/business-capacity/protocol-2/item-payment)、[支付 2.0 接入指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/business-guide/virtual-payment/guaranteed-payment/guidelines)

另有一项材料边界：资质 FAQ 当前区分了可用于准入的“电子软著”和小游戏备案使用的国家版权局软著登记证书。不要把快速电子证明直接当作备案材料，也不要据此推断所有国家版权局电子证书都无效；具体证书类型和提交格式需按后台核验。[资质 FAQ](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/contactus/endowments)

## 小游戏备案与 ICP 核准是两件事

1. **小游戏备案**：没有版号批文的待上线小游戏，先让基础信息和提审版本均审核通过，平台再自动申报小游戏备案；已有相应版号批文的游戏，官方说明无需重复申请这一项备案。备案状态取决于监管处理，平台未承诺固定完成时间。[小游戏备案申报](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/game-filing-application-works)
2. **ICP 核准**：现行官方页面已将旧“ICP备案”表述改为“ICP 核准”。小游戏需取得该项核准后才能上架；无版号游戏的入口在小游戏备案通过后开放，已有版号批文的游戏入口可自动开启。这不是把自有网站的域名备案号直接填进去即可完成，也不等同于购买一张经营性 ICP 许可证。[ICP 核准指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/icp/icp-filings)

ICP 核准会涉及主体、主办负责人、小游戏负责人、联系方式、证件及属地补充材料。企业注册地址／通讯地址和负责人条件、个人通讯地址所属省份等存在地区规则；应先确定真实主体和所在地，再按页面逐项准备。提交前核实信息，官方说明申请提交后不能撤回。[ICP 核准材料与属地指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/icp/icp-filings)

## 开发完成后的提审与发布顺序

| 阶段 | 操作与完成标准 |
| --- | --- |
| 入驻／创建 | 注册账号、完成真实主体认证，创建小游戏并取得 AppID，按后台完善名称、简介、类目、联系人和资质。 |
| 形成可运行的小游戏包 | 迁移到小游戏运行环境，使用开发者工具或适用 CLI 上传版本号及更新说明，在真实宿主扫码测试。现有 Scalia HTML 包不算已完成这一步。 |
| 测试与提审 | 从测试版本提交审核；官方版本指引要求三张游戏内截图。填写完整测试路径，按驳回原因修改，保持递增版本号。 |
| 备案／核准 | 基础信息与版本过审后完成适用的小游戏备案，再完成 ICP 核准；不要把“版本审核通过”解释为所有准入手续已结束。 |
| 首发 | 满足后台发布条件后发布线上版本。灰度只适用于已经有线上版本的更新，不能承诺首发一定可灰度。 |
| 后续更新 | 可选择全量或灰度；若要灰度，不要提前勾选审核通过自动发布。当前指引说明灰度比例只能增加，满 15 天会自动全量。 |

版本步骤、三张截图、灰度限制和时间规则见[版本提审指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)。该页更新时间为 2026-06-01，并注明自 2026-04-20 起对符合条件的合作宿主进行多端回归；首次 QA 的预计 1–3 个工作日只指该审核环节，不能据此承诺总上架周期。

## 必须纳入接入计划的能力

- 所有小游戏接入侧边栏复访；涉及用户自定义输入时，按平台要求处理敏感词；内购游戏另须客服能力。平台的“必接能力”清单会随产品更新，应在准备提审时复查。[必接能力](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/essential-skills)
- 无论是否处理个人信息，都配置小游戏隐私政策。若通过非标准 API、表单或自有服务处理信息，也需披露并在处理前取得相应同意，兼容拒绝授权。[用户隐私保护](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/user-info/user-privacy)
- 实名与防沉迷不能省略。官方渠道绑定指引明确要求已有版号的在运营游戏，在中宣部系统绑定“北京抖音信息服务有限公司”，统一社会信用代码 `911101085923662400`，并给予实名与数据上报权限。无版号版本由平台如何承载实名流程及具体客户端接法，本轮没有足够当前公开证据确认，不能直接认定一个 `tt.login` 调用就完成全部要求。[渠道绑定指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/realnameauthentication)、[官方接入 FAQ](https://developer.open-douyin.com/forum/share/post/671f04dd67ccd35b42b7066f)
- 如果有网络请求、下载、上传或 Socket，配置相应 HTTPS／WSS 安全域名，不将本地开发地址或调试绕过设置作为正式方案。[版本提审指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)

## 当前项目的技术判断

以下判断来自本次本地源码检查，是本项目迁移评估，不代表平台保证兼容。普通小游戏入口是 `game.js`、`game.json`、`project.config.json`，运行于平台 JavaScript 环境；本仓库的 `games/<slug>/game.json` 只是目录元数据，不能直接当作抖音运行配置。官方已适配引擎包括 Cocos、Laya、Egret，可以评估使用其导出能力，也可以自行基于平台 Canvas 接口实现表现层；尚未选定引擎或验证任何具体迁移方案。[开发指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game)、[官方引擎接入说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/game-engine/cocos-laya-egret)

| 当前实现与源码证据 | 迁移判断 |
| --- | --- |
| [规则引擎](../games/backpack-expedition-h5/src/engine.ts)、[物品与事件](../games/backpack-expedition-h5/src/content.ts) | 规则、数值、内容和确定性随机逻辑大部分可复用；仍需检查 `structuredClone` 等 JavaScript 运行时能力并在目标环境执行规则回归。 |
| [React DOM 入口](../games/backpack-expedition-h5/src/main.tsx)、[界面](../games/backpack-expedition-h5/src/App.tsx)、[CSS](../games/backpack-expedition-h5/src/style.css) | 背包格子、菜单、商店、弹窗、响应式布局和 CSS 动画依赖 DOM，需改为 Canvas／已适配引擎的 UI。此项是主要迁移工作，不能仅替换 HTML 文件名。 |
| [SVG 图集裁切](../games/backpack-expedition-h5/src/Art.tsx) | 已有 PNG 图集和裁切映射可以保留，改为 Canvas 绘制或引擎精灵，不依赖 SVG DOM。 |
| [浏览器存档](../games/backpack-expedition-h5/src/storage.ts) | 保留存档结构、校验和备份逻辑，将 `localStorage` 访问改为平台存储接口；原浏览器存档不会自动出现在抖音容器中，迁移策略需另行设计。 |
| [Web Audio 合成音效](../games/backpack-expedition-h5/src/audio.ts) | 改为平台／引擎音频能力；现有合成音效需验证可用能力或导出为音频素材，不能保证原 `AudioContext` 代码直接运行。 |
| 字体、触控与生命周期 | 将 `@font-face`／`document.fonts`、Pointer Events、`visibilitychange` 等分别改为字体、触摸和 `tt.onShow`／`tt.onHide` 等平台能力；覆盖手机安全区和平台胶囊按钮。当前 WOFF2 能否直接加载、所需基础库和具体设备表现尚未验证。 |
| [Scalia 平台适配](../shared/platform/index.ts)、[单 HTML 构建](../scripts/build-game.mjs) | 保留已有网页发布路径；另做抖音构建与 `tt` 接口接入。当前 `window.YouxiGame` 和 Scalia 发布配置不能用于抖音，也不会因为推送现有 main 自动发布到抖音。 |

平台 API 目录可查到触摸、`tt.getStorageSync`／`tt.setStorageSync`、`tt.createInnerAudioContext`、`tt.loadFont` 及生命周期接口。这里只确认存在这些能力，不将未实测的格式、设备和基础库兼容性当成结论。[小游戏 API 概览](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/overview)

包体上限也需分情形：代码包专题当前写明不分包为 20MB；分包时主包 4MB、总量 20MB，开通虚拟支付后总量 30MB。其他启动优化页面仍可能出现 4MB 旧口径；采用代码包专题和当前 IDE 校验结果，不将浏览器单 HTML 大小直接套进小游戏主包限制。[分包加载说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)

本次检查现有独立 H5 为 8,022,763 字节（约 8.02 MB，包含内联图片和字体）。这是网页文件测量值，并非已生成的抖音代码包，不能据此宣布通过包体门槛。后续应按导出结果测量主包、分包、资源解码内存和首屏启动时间，优先让首屏必需资源尽早可用。

建议把技术验证限制在一个闭环：载入角色／道具／中文字体 → 触控选武器和目标完成首战 → 保存并重进恢复 → 切后台暂停并恢复音频／动作 → 真机检查安全区。这个闭环跑通后，再决定完整表现层迁移投入；先不迁移整款游戏，也不为技术验证擅自创建或发布正式应用。

## 动手前的材料清单

以下清单用于准备，具体提交字段仍以该小游戏后台为准：

- [ ] 最终主体：个人或具体企业；有效证件、负责人及联系方式。来源见上文主体指引。
- [ ] 正式游戏名与可核验软著；必要的发行／运营授权；内购路线另核对版号与中宣部系统资料。来源见上文资质指引。
- [ ] 正式图标、简介、实际类目、真实游戏截图和可复现的审核体验路径；具体尺寸／字段打开本游戏后台确认，不照搬 App 游戏站的宣传图规格。
- [ ] 后台隐私政策与实际数据处理清单；字体、图像、代码等第三方许可和素材来源记录。
- [ ] 小游戏备案、ICP 核准所需主体及属地材料，不能只准备网站域名备案。
- [ ] 若启用广告或支付，准备对应服务开通、收款结算材料及接入方案；没有启用的能力不为“凑流程”擅自申请。
- [ ] 在拟上线宿主完成真机、低端机、切后台／恢复、音频、存档、隐私拒绝及更新兼容测试。

## 冲突、未知与下一步

1. **个人内购资格**：不能沿用“个人绝不支持”的旧二手教程。当前支付商户类型含个人，但本账号能否开通需后台及渠道审核确认；本轮未获账号状态证据。
2. **iOS 内购**：当前《小游戏审核规范》仍写虚拟购买限制，新支付协议又列举苹果支付渠道。协议中出现渠道不等于已全量开放；创建后需向平台核对宿主、基础库及支付能力，不承诺 iOS 支付可用。[审核规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/norms/standard)、[新版支付协议](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/agreement-and-norms/business-capacity/protocol-2/item-payment)
3. **审核总时长／费用**：本轮未找到足以保证全流程周期及总费用的当前官方承诺。软著、监管备案／核准、平台 QA 和支付进件是不同环节。
4. **当前可用资料**：尚未核实用户是否有合适主体、软著、版号及各项材料；不能把本文件当成“已经满足上架条件”。

建议先确认主体与是否做人民币内购，再申请／核验软著，同时用一个最小小游戏样例验证“加载像素素材与字体 → 一次实际战斗 → 存档 → 切后台恢复”。样例跑通后再决定表现层迁移方案；这一步只做技术验证，不提前承诺上架时间或注册多个无实际用途的应用。
