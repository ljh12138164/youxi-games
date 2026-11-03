# 资源来源

2026-11-01 使用内置 image_gen 为本项目独立生成：

- `forest-atlas.png`：透明角色、敌人与物品图集；4×4 排列，16 个图像区域。实际尺寸 1254×1254，源文件名 `exec-8c54d66d-86f1-4e53-b8e3-b57de1ad460c.png`。
- `forest-path.png`：暖色森林遗迹背景，无角色和界面；源文件名 `exec-58996e96-bea8-4d49-8f58-da4a686c2904.png`。

生成提示词保存在本游戏文档目录 `docs/games/backpack-expedition-h5/art/`。显示裁剪写在 `Art.tsx`，没有将整张界面概念图作为可玩界面的底图。音效由本游戏 Web Audio 代码合成，字体使用系统字体；没有运行时远程字体、图片或脚本依赖。

## 2026-11-03 装备独立图像

使用内置 `imagegen` 生成，原始图集只作为风格参考，原文件保留。

- [weapons-v2.png](./weapons-v2.png)：1254×1254 RGBA，四列四行，15 件武器及回芽盾各一个区域；源文件 `exec-10002265-e179-4177-8f7d-5752c98ff35e.png`。[生成提示词](../../../../docs/games/backpack-expedition-h5/art/weapons-v2.prompt.txt)
- [equipment-v2.png](./equipment-v2.png)：948×1659 RGBA，四列七行，27 件盾牌、护甲、配件与补给，右下空白；初次源文件 `exec-6f481a33-836c-4c74-bd3a-e2348c82cbe3.png`，最终透明边缘清理版本 `exec-301c2688-cdc9-4df0-98a1-80bd3f279320.png`。[生成提示词](../../../../docs/games/backpack-expedition-h5/art/equipment-v2.prompt.txt)、[清理提示词](../../../../docs/games/backpack-expedition-h5/art/equipment-v2-cleanup.prompt.txt)

该版本为粗像素改版前的素材记录，原文件保留；当前游戏使用下列粗像素版本。L 形刃在背包与拖拽时调整图像朝向以匹配占格轮廓。

## 2026-11-03 用户确认的粗像素改版

内置 `imagegen` 以用户确认的 [pixel-study-v1.png](../../../../docs/games/backpack-expedition-h5/art/pixel-study-v1.png) 为风格参考生成。使用大色块、阶梯轮廓、简化明暗；透明图集保留生成的 RGBA 通道，没有从其他游戏提取素材。以下为实际接入资源，替换旧图集及背景引用；旧文件保留。

| 文件 | 图像区域 | 生成源文件 | 提示词 |
| --- | --- | --- | --- |
| [weapons-pixel-v1.png](./weapons-pixel-v1.png) | 1261×1247，四列四行，16 件装备 | `exec-ddbdb099-6847-47f0-8888-8a6ce83bb560.png` | [提示词](../../../../docs/games/backpack-expedition-h5/art/weapons-pixel-v1.prompt.txt) |
| [equipment-pixel-v1.png](./equipment-pixel-v1.png) | 948×1659，四列七行，27 件装备，末格空白 | `exec-64195293-6571-48dc-9411-9e3f28f9d61c.png` | [提示词](../../../../docs/games/backpack-expedition-h5/art/equipment-pixel-v1.prompt.txt) |
| [actors-pixel-v1.png](./actors-pixel-v1.png) | 1261×1247，四列四行，主角与 15 类敌人 | `exec-10031aa9-3d22-4932-839f-dac8f3d49dea.png` | [提示词](../../../../docs/games/backpack-expedition-h5/art/actors-pixel-v1.prompt.txt) |
| [forest-pixel-v2.png](./forest-pixel-v2.png) | 2172×724 RGB，3:1 森林遗迹横幅背景 | `exec-101efe7f-9692-407a-bf1c-c567a723bd62.png` | [提示词](../../../../docs/games/backpack-expedition-h5/art/forest-pixel-v2.prompt.txt) |

场景初稿 [forest-pixel-v1.png](../../../../docs/games/backpack-expedition-h5/art/forest-pixel-v1.png) 为 1536×1024 RGB，源文件 `exec-c97eb3bc-a5eb-4213-b524-a21e6926a24b.png`，[提示词](../../../../docs/games/backpack-expedition-h5/art/forest-pixel-v1.prompt.txt)。桌面战场裁切过多，故以初稿和已确认样稿为参考生成 3:1 横幅，最终游戏只引用 v2。保留初稿用于来源追溯。

物品映射见 `../item-sprites.ts`，背包、地上、拖拽、图鉴、商店与详情共用；角色映射见 `../actor-sprites.ts`，精英与 Boss 各有独立区域。SVG 使用归一化四列格裁切并限制邻格显示，背景与精灵使用像素采样。这是生成的粗像素风素材，不宣称原生 32×32 手绘、统一源像素网格或任意视口下整数放大。独立攻击／受击帧尚未制作。
