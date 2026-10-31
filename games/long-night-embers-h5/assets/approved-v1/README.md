# 确认稿素材 v1

2026-11-01：用户确认骑士剑盾稿及四角色/八装备预览板后授权接入。

原创素材通过内置 imagegen 生成，以用户确认的骑士稿为风格参考；透明背景由 imagegen 提取，再裁切、裁去透明边缘、nearest 缩放至 256px 人物和 128px 装备画布。没有下载或使用第三方游戏素材。

- 人物：torren / mirelle / renzo / cyra / marrow。
- 装备：staff / lantern / daggers / scepter / book / scythe / sword / shield。
- 人物地图、物品地图和加载：`src/render/approvedArt.ts`。
- 人物和头像使用同一源图；战场仍为 64px 画布，脚底保持原位置附近。
- 装备分别接入魔法杖、飞刀、火焰魔杖、国王圣经、死亡螺旋、胜利之剑和护甲。提灯保留在米蕾尔手持图中，不新建装备玩法。
- 素材不改变武器数值、角色初始装备或存档标识；骑士剑盾为人物外观。
- 移动为四相位轻微起伏，当前并非逐帧迈腿/挥剑动画。未确认的其他角色保留原图。

生成提示：以确认骑士为唯一风格参考，制作成人比例、三分之四朝右的精细像素法师/双刃游侠/余烬牧师/镰刀死神及对应装备；统一暗钢、旧黄铜、深红布料与左上方光照，保留各角色职业轮廓，禁止方块小人、Q版、模糊光效。透明提取仅去除背景和地面阴影，保持造型、颜色、姿态、位置、细节不变。

原始预览与完整提示词（本机审阅文件，未用于运行时）：`reports/knight-sword-v1-preview.png`、`reports/knight-sword-v1.prompt.txt`、`reports/characters-equipment-v1-preview.png`、`reports/characters-equipment-v1.prompt.txt`。
