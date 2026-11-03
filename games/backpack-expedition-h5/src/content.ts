export type ItemDef = {
  id: string; name: string; icon: number; shape: [number, number][];
  kind: 'weapon' | 'shield' | 'heal' | 'food' | 'charm' | 'armor';
  power: number; cost: number; price: number; rarity: number;
  effect?: 'adjacent' | 'row' | 'thorns' | 'poison' | 'energy';
  description: string;
  shopOnly?: boolean;
};
const rect = (w: number, h: number): [number, number][] => Array.from({ length: w * h }, (_, i) => [i % w, Math.floor(i / w)]);
const entries: Array<[string, string, number, ItemDef['kind'], number, number, number, ItemDef['effect']?, number?, number?]> = [
  ['staff','嫩枝杖',4,'weapon',5,1,1,'adjacent',1,3],
  ['shield','橡木盾',5,'shield',7,1,1,undefined,2,2],
  ['potion','草药露',6,'heal',8,0,1], ['bread','麦香面包',7,'food',1,0,1,undefined,2,1],
  ['boots','旧皮靴',8,'armor',2,0,1,undefined,1,2], ['key','黄铜钥匙',9,'charm',1,0,1,'row',2,1],
  ['flower','雏菊护符',10,'charm',2,0,1,'adjacent'], ['dagger','林间短刀',11,'weapon',3,0,1],
  ['bow','榆木弓',12,'weapon',6,1,1,'row',2,2], ['arrows','羽箭束',13,'charm',2,0,1,'row',1,2],
  ['ring','铜叶戒',14,'charm',1,0,1,'adjacent'], ['mushroom','红伞菇',15,'weapon',3,1,1,'poison'],
  ['thornstaff','荆棘杖',4,'weapon',8,1,2,'adjacent',1,3], ['barkshield','厚树皮盾',5,'shield',11,1,2,undefined,2,2],
  ['dewpotion','晨露药剂',6,'heal',14,0,2], ['nutbread','榛果面包',7,'food',2,0,2,undefined,2,1],
  ['mossboots','苔纹靴',8,'armor',4,0,2,undefined,1,2], ['oldkey','遗迹钥匙',9,'charm',2,0,2,'row',2,1],
  ['clover','四叶草结',10,'charm',3,0,2,'adjacent'], ['hunterknife','猎人短刃',11,'weapon',5,0,2],
  ['hunterbow','白蜡猎弓',12,'weapon',10,1,2,'row',2,2], ['barbedarrows','倒刺箭束',13,'charm',3,0,2,'row',1,2],
  ['thornring','棘枝戒',14,'charm',3,0,2,'thorns'], ['spore','孢子菇',15,'weapon',6,1,2,'poison'],
  ['elderstaff','老树心杖',4,'weapon',13,1,3,'adjacent',1,3], ['wardshield','守林圆盾',5,'shield',17,1,3,undefined,2,2],
  ['goldpotion','金叶药剂',6,'heal',22,0,3], ['feast','远行干粮',7,'food',3,0,3,undefined,2,1],
  ['rangerboots','巡林长靴',8,'armor',6,0,3,undefined,1,2], ['moonkey','月纹钥匙',9,'charm',3,0,3,'row',2,1],
  ['sunflower','金瓣护符',10,'charm',4,0,3,'adjacent'], ['silverknife','银露匕首',11,'weapon',8,0,3],
  ['heartbow','树心长弓',12,'weapon',15,1,3,'row',2,2], ['silverarrows','银羽箭束',13,'charm',5,0,3,'row',1,2],
  ['oakring','橡心戒',14,'charm',5,0,3,'thorns'], ['nightspore','夜光孢子',15,'weapon',9,1,3,'poison'],
  ['springcharm','春芽结',10,'charm',1,0,2,'energy'], ['branchblade','曲枝刃',11,'weapon',9,1,2,'adjacent',2,2],
  ['thornshield','棘背盾',5,'shield',9,1,2,'thorns',2,2], ['trailmix','野果干',7,'heal',5,0,1],
];
export const ITEMS: ItemDef[] = entries.map(([id,name,icon,kind,power,cost,rarity,effect,w=1,h=1]) => ({
  id,name,icon,kind,power,cost,rarity,effect,price: 7 + rarity * 5 + power,
  shape: id === 'branchblade' ? [[0,0],[0,1],[1,1]] : rect(w,h),
  description: kind === 'weapon' ? (effect === 'poison' ? `造成 ${power} 点伤害，附加 2 层中毒。` : `造成 ${power} 点伤害。${effect === 'adjacent' ? '每件相邻护符按其数值增加伤害。' : effect === 'row' ? '同行箭束与钥匙增加伤害。' : '每回合限用一次。'}`)
    : kind === 'shield' ? `获得 ${power} 点护盾。${effect === 'thorns' ? '本回合反击伤害 +3。' : ''}`
    : kind === 'heal' ? `恢复 ${power} 点生命。使用后消耗。`
    : kind === 'food' ? `本回合能量 +${power}。使用后消耗。`
    : kind === 'armor' ? `每回合开始时获得 ${power} 点护盾。`
    : effect === 'energy' ? '每回合能量 +1；同名效果不叠加。'
    : effect === 'thorns' ? `使用盾牌后，每次受击反击 ${power} 点伤害。`
    : effect === 'row' ? `与弓占据同一行时，伤害 +${power}。`
    : `与武器边相邻时，伤害 +${power}。斜角不算。`,
}));
ITEMS.push(
  {id:'forkblade',name:'岔枝重刃',icon:11,shape:[[0,0],[0,1],[1,1]],kind:'weapon',power:13,cost:2,price:24,rarity:2,shopOnly:true,description:'造成 13 点伤害；边相邻至少一件盾牌时伤害 +5，每次使用只加一次。每回合限用一次。'},
  {id:'mossbow',name:'苔线长弓',icon:12,shape:rect(3,1),kind:'weapon',power:7,cost:1,price:24,rarity:2,effect:'row',shopOnly:true,description:'造成 7 点伤害，同行箭束与钥匙增加伤害；同行至少两件箭束时附加 2 层中毒。钥匙不计入箭束件数。每回合限用一次。'},
  {id:'sproutshield',name:'回芽盾',icon:5,shape:rect(2,2),kind:'shield',power:8,cost:1,price:24,rarity:2,shopOnly:true,description:'获得 8 点护盾；边相邻至少一件护甲时额外获得 4 点护盾，每次使用只加一次。可以触发棘枝戒等持盾反击效果。'},
);
export const ITEM_MAP = Object.fromEntries(ITEMS.map(i => [i.id,i]));

export type EnemyDef = { id: string; name: string; icon: number; hp: number; attack: number; pattern: ('attack'|'guard'|'poison')[] };
export const ENEMIES: EnemyDef[] = [
  {id:'twig',name:'荆棘幼枝',icon:1,hp:16,attack:4,pattern:['attack','guard','attack']},
  {id:'acorn',name:'橡果甲虫',icon:2,hp:20,attack:5,pattern:['guard','attack']},
  {id:'root',name:'盘根怪',icon:1,hp:24,attack:6,pattern:['attack','attack','guard']},
  {id:'briar',name:'带刺藤团',icon:1,hp:25,attack:7,pattern:['poison','attack','guard']},
  {id:'shell',name:'铁壳甲虫',icon:2,hp:30,attack:7,pattern:['guard','guard','attack']},
  {id:'sapling',name:'迷路树苗',icon:3,hp:28,attack:6,pattern:['attack','poison']},
  {id:'wither',name:'枯枝行者',icon:1,hp:35,attack:9,pattern:['attack','poison','attack']},
  {id:'amber',name:'琥珀甲虫',icon:2,hp:40,attack:9,pattern:['guard','attack','attack']},
  {id:'hollow',name:'空心树影',icon:3,hp:38,attack:10,pattern:['poison','guard','attack']},
  {id:'elite1',name:'裂壳卫兵',icon:2,hp:42,attack:7,pattern:['guard','attack']},
  {id:'elite2',name:'荆棘守望',icon:1,hp:55,attack:9,pattern:['poison','attack']},
  {id:'elite3',name:'枯木哨兵',icon:3,hp:70,attack:12,pattern:['guard','attack','poison']},
  {id:'boss1',name:'橡果巢母',icon:2,hp:60,attack:8,pattern:['guard','attack','attack']},
  {id:'boss2',name:'荆棘之心',icon:1,hp:85,attack:11,pattern:['poison','guard','attack']},
  {id:'boss3',name:'遗迹老树',icon:3,hp:120,attack:14,pattern:['guard','attack','poison','attack']},
];
export const ENEMY_MAP = Object.fromEntries(ENEMIES.map(e => [e.id,e]));
type EventDef={name:string;text:string;action:string;kind:'heal'|'gold'|'maxHp'|'trade'|'item';value:number;costGold?:number;costHp?:number;item?:string};
export const EVENTS:EventDef[] = [
  {name:'石缝里的泉水',text:'石缝间有一股清泉。你可以喝一点，也可以绕过这里。',action:'喝一口 · 恢复 8 点生命',kind:'heal',value:8},
  {name:'遗落的钱袋',text:'旧路标下压着一个钱袋，袋口已经松了。',action:'收起钱袋 · 金币 +12',kind:'gold',value:12},
  {name:'守林人的午餐',text:'树桩上留着一份干粮，旁边的纸条写着：留给赶路的人。',action:'吃点东西 · 生命上限 +3',kind:'maxHp',value:3},
  {name:'苔石药摊',text:'一位药师愿意替你包扎，收取 8 枚金币。',action:'请他包扎 · 8 金币，恢复 16 点生命',kind:'trade',value:16},
  {name:'许愿树',text:'枝头挂着许多旧布条。你在树下歇了一会儿。',action:'歇一会儿 · 恢复 6 点生命',kind:'heal',value:6},
  {name:'旧营地',text:'熄灭的篝火旁还留着几枚铜币，帐篷早已空了。',action:'拾起铜币 · 金币 +9',kind:'gold',value:9},
  {name:'挂在枝头的药包',text:'一个药包挂在低枝上，里面的草药还很新鲜。拿下来后，记得收进行囊。',action:'取下药包 · 获得晨露药剂',kind:'item',value:0,item:'dewpotion'},
  {name:'赶路人的烤炉',text:'面包师正收拾烤炉。花 6 枚金币，可以带走一份刚烤好的榛果面包。',action:'买一份 · 6 金币，获得榛果面包',kind:'item',value:0,costGold:6,item:'nutbread'},
  {name:'刺藤后的零钱',text:'几枚金币落在刺藤深处。伸手去取会划伤皮肤，损失 3 点生命；也可以留给下一位旅人。',action:'伸手取回 · 生命 -3，金币 +18',kind:'gold',value:18,costHp:3},
  {name:'守林人的练习场',text:'守林人愿意教你调整呼吸。练习需要 10 枚金币，完成后生命上限增加 5 点，同时恢复 5 点生命。',action:'留下练习 · 10 金币，生命上限 +5',kind:'maxHp',value:5,costGold:10},
  {name:'一双补好的靴子',text:'石凳上摆着一双苔纹靴，针脚细密。旁边的木牌写着：穿得上的人，请带走。',action:'收下靴子 · 获得苔纹靴',kind:'item',value:0,item:'mossboots'},
  {name:'暖石小憩',text:'阳光把石头晒得暖暖的。坐下来喝口水，肩上的酸痛也缓和了一些。',action:'卸下行囊休息 · 恢复 12 点生命',kind:'heal',value:12},
];
export const FLOOR_NAMES = ['苔光小径','荆棘回廊','古树遗庭'];
