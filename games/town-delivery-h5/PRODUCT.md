# 小镇配送员 MVP

<!-- impeccable:product-schema 1 -->

## Platform
web

另提供抖音小游戏原生 Canvas 入口；两端共享玩法与绘制，不依赖 DOM 适配层。

## Product Purpose
用户确认先验证「画路规划，小车自动配送」的乐趣，制作小型可玩 MVP，并兼容抖音小游戏。

## Capabilities and Constraints
沿用仓库 TypeScript、Vite、pnpm 与游戏隔离约定。浏览器可试玩，抖音有独立构建目录。
本轮设计假设：竖屏、三分钟一局、面包房配送、逐步增加住宅、可回收道路、超时订单只扣结算。
不接入真实支付、广告、账号或服务器；本轮不发布上线。
