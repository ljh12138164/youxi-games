import assert from 'node:assert/strict';
import test from 'node:test';
import {act,encounterHint,intent,newRun,poisonOnHit,power,priceOf,REFRESH_PRICE,type Item} from '../src/engine.ts';
import {ENEMIES,ENEMY_MAP,ITEMS,ITEM_MAP} from '../src/content.ts';
import {ITEM_SPRITES} from '../src/item-sprites.ts';
import {ACTOR_SPRITES} from '../src/actor-sprites.ts';
import {parseSave,validateSave} from '../src/storage.ts';

const item=(def:string,uid:number,x:number,y:number,rotation=0):Item=>({def,uid,x,y,rotation,used:0});
function fight(def:string){
  const run=newRun(42,'hard');run.phase='battle';run.node=def.startsWith('boss')?'boss':'elite';
  run.floor=Number(def.at(-1));run.enemies=[{uid:run.seq++,def,hp:ENEMY_MAP[def].hp,block:0,poison:0}];
  return run;
}

test('43 件装备各有独立图集区域，不再按旧 icon 复用',()=>{
  assert.deepEqual(Object.keys(ITEM_SPRITES).sort(),ITEMS.map(d=>d.id).sort());
  assert.equal(new Set(Object.values(ITEM_SPRITES).map(s=>`${s.sheet}:${s.index}`)).size,43);
  for(const s of Object.values(ITEM_SPRITES))assert.ok(s.index>=0&&s.index<4*s.rows);
});

test('主角与十五类敌人均有独立图集区域，覆盖普通、精英和 Boss',()=>{
  assert.deepEqual(Object.keys(ACTOR_SPRITES).sort(),['hero',...ENEMIES.map(d=>d.id)].sort());
  assert.equal(new Set(Object.values(ACTOR_SPRITES)).size,16);
  for(const index of Object.values(ACTOR_SPRITES))assert.ok(index>=0&&index<16);
});

test('新商店四种货位、可买补给、不重样，专属装备第二层起可获得',()=>{
  const seen=new Set<string>();
  for(let floor=1;floor<=3;floor++)for(let seed=1;seed<=60;seed++){
    let run=newRun(seed,'hard');run.floor=floor;run.step=1;run=act(run,{type:'node',kind:'shop'}).run;
    assert.ok(validateSave(run));assert.equal(run.offers.length,4);assert.equal(new Set(run.offers).size,4);
    assert.equal(ITEM_MAP[run.offers[0]].kind,'weapon');
    assert.ok(['charm','armor'].includes(ITEM_MAP[run.offers[1]].kind)||run.offers[1]==='sproutshield');
    assert.ok(priceOf(run,run.offers[2])<=16);
    assert.ok(act(run,{type:'buy',def:run.offers[2]}).error===undefined);
    if(floor===1)assert.ok(run.offers.every(id=>!ITEM_MAP[id].shopOnly));
    for(const id of run.offers)seen.add(id);
  }
  for(const id of ['forkblade','mossbow','sproutshield'])assert.ok(seen.has(id));
});

test('换货只扣一次钱、不补已售位、不动地上装备，重载不恢复次数',()=>{
  let run=newRun(123);run.floor=2;run.step=1;run.gold=100;run=act(run,{type:'node',kind:'shop'}).run;
  const bought=run.offers[0];run=act(run,{type:'buy',def:bought}).run;
  const before=structuredClone(run),next=act(run,{type:'refresh'});
  assert.equal(next.error,undefined);assert.equal(next.run.gold,before.gold-REFRESH_PRICE);
  assert.equal(next.run.offers.length,3);assert.ok(!next.run.offers.includes(bought));
  assert.deepEqual(next.run.loot,before.loot);assert.deepEqual(next.run.shop?.kinds,before.shop?.kinds);
  assert.deepEqual(act(parseSave(JSON.stringify(before)),{type:'refresh'}).run,next.run);
  const restored=parseSave(JSON.stringify(next.run));assert.ok(restored.shop?.refreshed);
  assert.equal(act(restored,{type:'refresh'}).run,restored);
  const poor=structuredClone(before);poor.gold=3;assert.equal(act(poor,{type:'refresh'}).run,poor);
  let empty=before;
  for(const def of empty.offers)empty=act(empty,{type:'buy',def}).run;
  assert.equal(empty.offers.length,0);assert.equal(act(empty,{type:'refresh'}).run,empty);
  // A new shop starts with four fresh slots and an unused refresh.
  let later=act(next.run,{type:'leave'}).run;later.step=5;later.phase='map';later=act(later,{type:'node',kind:'shop'}).run;
  assert.equal(later.shop?.refreshed,false);assert.equal(later.offers.length,4);
});

test('补给位商品买光后仍能换货，不会从空物品池抽取',()=>{
  let run=newRun(52);run.step=1;run.gold=100;run=act(run,{type:'node',kind:'shop'}).run;
  const supply=run.offers[2];run=act(run,{type:'buy',def:supply}).run;
  const next=act(run,{type:'refresh'});assert.equal(next.error,undefined);assert.ok(validateSave(next.run));
});

test('岔枝重刃与回芽盾按边相邻生效，多件邻居只触发一次',()=>{
  const run=newRun(5);
  run.items=[item('forkblade',1,0,0),item('shield',2,1,0),item('shield',3,0,2)];
  assert.equal(power(run,run.items[0]).value,18);
  run.items=run.items.slice(0,1);assert.equal(power(run,run.items[0]).value,13);
  run.items=[item('sproutshield',1,0,0),item('boots',2,2,0),item('mossboots',3,0,2)];
  assert.equal(power(run,run.items[0]).value,12);
  run.phase='battle';run.enemies=[{uid:99,def:'twig',hp:16,block:0,poison:0}];
  assert.equal(act(run,{type:'use',uid:1}).run.block,12);
  run.items[1].x=3;run.items[2].y=3;assert.equal(power(run,run.items[0]).value,8);
});

test('苔线长弓按独立箭束计数，钥匙、多格接触和不同行不能凑两件',()=>{
  const run=newRun(5);
  run.items=[item('mossbow',1,0,0),item('arrows',2,3,0,1),item('key',3,0,2)];
  assert.equal(poisonOnHit(run,run.items[0]),0);
  run.items.push(item('barbedarrows',4,5,0));assert.equal(poisonOnHit(run,run.items[0]),2);
  assert.equal(power(run,run.items[0]).value,12);
  run.phase='battle';run.enemies=[{uid:99,def:'twig',hp:16,block:0,poison:0}];
  assert.equal(act(run,{type:'use',uid:1,target:99}).run.enemies[0].poison,2);
  run.items[3].y=2;assert.equal(poisonOnHit(run,run.items[0]),0);
});

test('破盾后的减伤预告与实际受击一致，效果在下一次攻击后消耗',()=>{
  let run=fight('boss1');run.turn=2;run.enemies[0].block=5;
  const full=intent(run,run.enemies[0]).value;
  run=act(run,{type:'use',uid:run.items[0].uid,target:run.enemies[0].uid}).run;
  assert.equal(run.enemies[0].broken,true);assert.equal(intent(run,run.enemies[0]).value,full-4);
  const hp=run.hp;run=act(run,{type:'end'}).run;
  assert.equal(run.hp,hp-(full-4));assert.equal(run.enemies[0].broken,undefined);
  assert.equal(intent(run,run.enemies[0]).kind,'rest');
});

test('蓄力、休整不造成攻击或施毒；孢雾最多达到三层',()=>{
  let run=fight('elite3');assert.equal(intent(run,run.enemies[0]).kind,'charge');
  const forecast=intent(run,run.enemies[0]).value;
  const hp=run.hp;run=act(run,{type:'end'}).run;assert.equal(run.hp,hp);assert.equal(run.poison,0);
  assert.equal(intent(run,run.enemies[0]).kind,'attack');assert.equal(intent(run,run.enemies[0]).value,forecast);run.turn=3;
  assert.equal(intent(run,run.enemies[0]).kind,'rest');assert.equal(act(run,{type:'end'}).run.hp,hp);
  run=fight('boss2');run.poison=3;
  const next=act(run,{type:'end'}).run;assert.equal(next.hp,run.hp-3);assert.equal(next.poison,2);
});

test('老树半血不改变当前预告，下一回合进入第二阶段，读档与中毒触发一致',()=>{
  let run=fight('boss3');run.enemies[0].hp=63;run.turn=2;
  const before=intent(run,run.enemies[0]);
  run=act(run,{type:'use',uid:run.items[0].uid,target:run.enemies[0].uid}).run;
  assert.equal(run.enemies[0].stageTurn,3);assert.deepEqual(intent(run,run.enemies[0]),before);
  assert.match(encounterHint(run,run.enemies[0]),/下回合进入第二阶段/);
  assert.deepEqual(parseSave(JSON.stringify(run)),run);
  run=act(run,{type:'end'}).run;assert.equal(intent(run,run.enemies[0]).kind,'charge');
  run=act(run,{type:'end'}).run;assert.equal(intent(run,run.enemies[0]).kind,'attack');
  const poisoned=fight('boss3');poisoned.enemies[0].hp=61;poisoned.enemies[0].poison=2;
  const next=act(poisoned,{type:'end'}).run;assert.equal(next.enemies[0].stageTurn,2);
  assert.equal(intent(next,next.enemies[0]).kind,'charge');
});

test('没有无限回合增伤，轻松、标准与缺版本旧档沿用原行动',()=>{
  const run=fight('elite3');run.turn=2;const damage=intent(run,run.enemies[0]).value;
  run.turn=302;assert.equal(intent(run,run.enemies[0]).value,damage);
  for(const difficulty of ['easy','normal','hard'] as const){
    const old=fight('boss3');old.difficulty=difficulty;delete old.ruleset;
    assert.equal(intent(old,old.enemies[0]).kind,'guard');assert.equal(encounterHint(old,old.enemies[0]),'');
    if(difficulty!=='hard'){old.ruleset=2;assert.equal(intent(old,old.enemies[0]).kind,'guard');}
  }
});

test('旧档保留原商店、原补给价格和六站路线；拒绝未知规则与非法商店状态',()=>{
  const old=newRun(17);delete old.ruleset;delete old.stepsPerFloor;old.step=1;
  const shop=act(old,{type:'node',kind:'shop'}).run;
  assert.equal(shop.shop,undefined);assert.equal(act(shop,{type:'refresh'}).run,shop);
  assert.equal(priceOf(shop,'potion'),20);assert.equal(priceOf(newRun(17),'potion'),14);
  assert.deepEqual(parseSave(JSON.stringify(shop)),shop);
  assert.equal(validateSave({...shop,ruleset:3}),false);
  const current=newRun(17);current.step=1;const fresh=act(current,{type:'node',kind:'shop'}).run;
  assert.equal(validateSave({...fresh,shop:undefined}),false);
  assert.equal(validateSave({...fresh,shop:{...fresh.shop,refreshed:2}}),false);
  assert.equal(validateSave({...fresh,shop:{...fresh.shop,sold:['missing']}}),false);
  assert.equal(validateSave({...fresh,offers:[fresh.offers[0],fresh.offers[0],...fresh.offers.slice(2)]}),false);
});

test('新精英四选掉落含层级升级，免费掉落不混入商店专属装备',()=>{
  for(let floor=1;floor<=3;floor++)for(let seed=1;seed<=12;seed++){
    const run=fight(`elite${floor}`);run.seed=seed;run.enemies[0].hp=1;run.enemies[0].block=0;
    const result=act(run,{type:'use',uid:run.items[0].uid,target:run.enemies[0].uid}).run;
    assert.equal(result.phase,'loot');assert.equal(result.loot.length,4);
    assert.ok(result.loot.some(i=>ITEM_MAP[i.def].rarity>=Math.min(3,floor+1)));
    assert.ok(result.loot.every(i=>!ITEM_MAP[i.def].shopOnly));
  }
});
