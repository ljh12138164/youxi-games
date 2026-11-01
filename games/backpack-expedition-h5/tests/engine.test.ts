import assert from 'node:assert/strict';
import test from 'node:test';
import { act, adjacent, canPlace, expansionCells, key, newRun, power, shape, type Run } from '../src/engine.ts';
import { ITEMS, ENEMIES, EVENTS, ITEM_MAP } from '../src/content.ts';
import { parseSave, validateSave } from '../src/storage.ts';

test('40 件物品、15 类敌人、6 个事件：ID 唯一，形状四次旋转不变',()=>{
  assert.equal(ITEMS.length,40);assert.equal(ENEMIES.length,15);assert.equal(EVENTS.length,6);
  assert.equal(new Set(ITEMS.map(i=>i.id)).size,40);
  for(const item of ITEMS){assert.deepEqual(shape(item.id,4),shape(item.id));assert.equal(new Set(shape(item.id).map(([x,y])=>key(x,y))).size,item.shape.length);}
});
test('越界与重叠放置无副作用，移动会改变真实伤害，同一邻居不重复计数',()=>{
  const run=newRun(42),staff=run.items[0],flower=run.items[4];
  assert.equal(power(run,staff).value,7);assert.equal(adjacent(staff,flower),true);
  const rejected=act(run,{type:'place',uid:staff.uid,x:6,y:4,rotation:0});
  assert.equal(rejected.run,run);assert.ok(rejected.error);
  assert.equal(canPlace(run,flower,1,0,0),false);
  const moved=act(run,{type:'place',uid:flower.uid,x:4,y:3,rotation:0});
  assert.equal(power(moved.run,staff).value,5);assert.equal(power(run,staff).value,7);
});
test('普通战斗按能量与次数限制；护盾刷新；战斗中不能移动；奖励不可重复领取',()=>{
  let run=act(newRun(42),{type:'node',kind:'battle'}).run;
  run=act(run,{type:'start'}).run;
  const uid=run.items[0].uid,target=run.enemies[0].uid;
  assert.ok(act(run,{type:'place',uid,x:0,y:0,rotation:0}).error);
  run=act(run,{type:'use',uid,target}).run;assert.equal(run.energy,2);
  assert.ok(act(run,{type:'use',uid,target}).error);
  run=act(run,{type:'use',uid:run.items[1].uid}).run;assert.equal(run.block,7);
  run=act(run,{type:'end'}).run;assert.equal(run.block,0);assert.equal(run.energy,3);
  for(let n=0;n<15&&run.phase==='battle';n++){
    run=act(run,{type:'use',uid,target}).run;
    if(run.phase==='battle'){run=act(run,{type:'use',uid:run.items[1].uid}).run;run=act(run,{type:'end'}).run;}
  }
  assert.equal(run.phase,'loot');const gold=run.gold;
  assert.ok(act(run,{type:'end'}).error);assert.equal(run.gold,gold);
  const next=act(run,{type:'leave'}).run;assert.equal(next.step,1);assert.ok(act(next,{type:'leave'}).error);
});
test('存档恢复保留随机结果，拒绝重叠物品、未来版本和无效数值',()=>{
  const run=act(newRun(55),{type:'node',kind:'battle'}).run;
  const restored=parseSave(JSON.stringify(run));assert.deepEqual(restored,run);
  assert.deepEqual(act(run,{type:'start'}),act(restored,{type:'start'}));
  assert.equal(validateSave({...run,version:99}),false);
  const bad=structuredClone(run);bad.items[1].x=0;bad.items[1].y=0;assert.equal(validateSave(bad),false);
  assert.equal(validateSave({...run,hp:NaN}),false);
  assert.throws(()=>parseSave('not json'));
});
test('商店空间不足不扣款，扩容只能接边，事件只能选择一次',()=>{
  let run=newRun(5);run.step=1;run=act(run,{type:'node',kind:'shop'}).run;
  run.gold=500;run.bag=[];
  const result=act(run,{type:'buy',def:run.offers[0]});assert.ok(result.error);assert.equal(result.run.gold,500);
  run=newRun(5);run.phase='expand';assert.ok(expansionCells(run).includes('6,0'));
  assert.ok(act(run,{type:'expand',cell:'6,4'}).error);
  run=act(run,{type:'expand',cell:'6,0'}).run;assert.equal(run.bag.length,25);assert.equal(run.phase,'map');
  run.step=1;run=act(run,{type:'node',kind:'event'}).run;
  run=act(run,{type:'event',accept:true}).run;assert.equal(run.step,2);assert.ok(act(run,{type:'event',accept:true}).error);
});

test('同行构筑、反击构筑和中毒结算的边界',()=>{
  const run=newRun(9);
  run.items=[{uid:1,def:'bow',x:0,y:0,rotation:0,used:0},{uid:2,def:'arrows',x:3,y:0,rotation:0,used:0}];
  assert.equal(power(run,run.items[0]).value,8);
  run.items[1].y=3;assert.equal(power(run,run.items[0]).value,6);
  let battle=act(newRun(9),{type:'node',kind:'battle'}).run;
  battle=act(battle,{type:'start'}).run;
  battle.items=[{uid:1,def:'thornshield',x:0,y:0,rotation:0,used:0},{uid:2,def:'thornring',x:3,y:0,rotation:0,used:0}];
  const hp=battle.enemies[0].hp;
  // Force the existing enemy's attack turn to isolate the reflection rule.
  while(ENEMIES.find(e=>e.id===battle.enemies[0].def)!.pattern[(battle.turn-1)%ENEMIES.find(e=>e.id===battle.enemies[0].def)!.pattern.length]!=='attack')battle.turn++;
  battle=act(battle,{type:'use',uid:1}).run;battle=act(battle,{type:'end'}).run;
  assert.equal(battle.enemies[0].hp,hp-6);
  const poisoned=act(act(newRun(8),{type:'node',kind:'battle'}).run,{type:'start'}).run;
  poisoned.poison=2;poisoned.block=999;const before=poisoned.hp;
  const next=act(poisoned,{type:'end'}).run;
  assert.equal(next.hp,before-2);assert.equal(next.poison,1);
});

// Normal-play bot: only public actions, no injected HP, items, money or wins.
export function playJourney(seed:number):Run {
  let run=newRun(seed);
  const send=(a:Parameters<typeof act>[1])=>{const result=act(run,a);if(!result.error)run=result.run;return !result.error;};
  const fit=(uid:number)=>{
    for(let r=0;r<4;r++)for(let y=0;y<5;y++)for(let x=0;x<7;x++){
      const item=run.loot.find(i=>i.uid===uid);if(item&&canPlace(run,item,x,y,r))return send({type:'place',uid,x,y,rotation:r});
    }return false;
  };
  for(let n=0;n<2000&&!['won','lost'].includes(run.phase);n++){
    switch(run.phase){
      case 'map':send({type:'node',kind:run.step===1?'shop':run.step===3?'rest':run.step===5?'boss':'battle'});break;
      case 'prepare':send({type:'start'});break;
      case 'battle':{
        for(const i of run.items)if(run.phase==='battle'&&!i.used&&ITEM_MAP[i.def].kind==='heal'&&run.hp<=run.maxHp-ITEM_MAP[i.def].power)send({type:'use',uid:i.uid});
        for(const i of [...run.items].sort((a,b)=>ITEM_MAP[a.def].cost-ITEM_MAP[b.def].cost))if(run.phase==='battle'&&ITEM_MAP[i.def].kind==='weapon'){
          const target=[...run.enemies].filter(e=>e.hp>0).sort((a,b)=>a.hp-b.hp)[0];if(target)send({type:'use',uid:i.uid,target:target.uid});
        }
        for(const i of run.items)if(run.phase==='battle'&&ITEM_MAP[i.def].kind==='shield')send({type:'use',uid:i.uid});
        if(run.phase==='battle')send({type:'end'});break;
      }
      case 'loot':{
        for(const item of run.loot){
          const def=ITEM_MAP[item.def];
          const same=run.items.filter(i=>ITEM_MAP[i.def].kind===def.kind).sort((a,b)=>ITEM_MAP[a.def].power-ITEM_MAP[b.def].power);
          if(['weapon','shield','armor'].includes(def.kind)&&same.length&&ITEM_MAP[same[0].def].power<def.power){send({type:'stash',uid:same[0].uid});if(!fit(item.uid))fit(same[0].uid);}
          else fit(item.uid);
        }
        send({type:'leave'});break;
      }
      case 'shop':for(const id of run.offers)if(['weapon','shield','armor','heal'].includes(ITEM_MAP[id].kind))send({type:'buy',def:id});send({type:'leave'});break;
      case 'rest':send({type:'rest',choice:'heal'});break;
      case 'event':send({type:'event',accept:true});break;
      case 'expand':send({type:'expand',cell:expansionCells(run)[0]});break;
    }
  }
  return run;
}
test('正常新档通过三层：无调试解锁或数值注入',()=>{
  const results=Array.from({length:12},(_,i)=>playJourney(i+1));
  assert.ok(results.every(r=>['won','lost'].includes(r.phase)),'不能卡在无法推进的节点');
  assert.ok(results.some(r=>r.phase==='won'),`应有正常通关路径：${results.map(r=>`${r.phase} F${r.floor} S${r.step}`).join(', ')}`);
});

test('更宽松的初始补给、战后恢复与保底掉落，致命失误只有一次缓冲',()=>{
  let run=newRun(17,'easy');
  assert.equal(run.maxHp,40);assert.equal(run.bag.length,24);
  assert.equal(run.items.filter(i=>i.def==='potion').length,2);
  run=act(act(run,{type:'node',kind:'battle'}).run,{type:'start'}).run;
  run.hp=1;run.enemies[0].def='root';run.turn=1;
  run=act(run,{type:'end'}).run;
  assert.equal(run.rescues,1);assert.equal(run.phase,'battle');assert.equal(run.hp,20);
  run.hp=1;run.enemies[0].def='root';run.turn=1;
  assert.equal(act(run,{type:'end'}).run.phase,'lost');
  for(let seed=1;seed<=20;seed++){
    let battle=act(act(newRun(seed,'easy'),{type:'node',kind:'battle'}).run,{type:'start'}).run;
    battle.hp=20;battle.enemies.forEach(e=>e.hp=1);
    battle=act(battle,{type:'use',uid:battle.items[0].uid,target:battle.enemies[0].uid}).run;
    assert.equal(battle.phase,'loot');assert.equal(battle.hp,24);
    assert.ok(battle.loot.some(i=>ITEM_MAP[i.def].kind==='weapon'));
    assert.ok(battle.loot.some(i=>['heal','shield','food'].includes(ITEM_MAP[i.def].kind)));
    assert.equal(new Set(battle.loot.map(i=>i.def)).size,battle.loot.length);
  }
});
