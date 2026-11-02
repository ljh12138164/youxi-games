import assert from 'node:assert/strict';
import test from 'node:test';
import {act,canPlace,newRun,routes,stepsInFloor,swapPlan} from '../src/engine.ts';
import {EVENTS,ITEM_MAP} from '../src/content.ts';
import {parseSave,validateSave} from '../src/storage.ts';

test('等占格交换原子提交，支持地上换入；不同形状放不下及战斗拒绝交换',()=>{
  const run=newRun(42),potion=run.items.find(i=>i.def==='potion')!,flower=run.items.find(i=>i.def==='flower')!;
  const result=act(run,{type:'place',uid:potion.uid,x:flower.x,y:flower.y,rotation:0});
  assert.equal(result.error,undefined);assert.ok(validateSave(result.run));
  assert.deepEqual(result.run.items.find(i=>i.uid===flower.uid),{...flower,x:potion.x,y:potion.y});
  const ground=act(run,{type:'stash',uid:potion.uid}).run;
  const replaced=act(ground,{type:'place',uid:potion.uid,x:flower.x,y:flower.y,rotation:0});
  assert.equal(replaced.error,undefined);assert.equal(replaced.run.loot[0].uid,flower.uid);assert.ok(validateSave(replaced.run));
  
  // Two cells by area, but the destination's old vertical space cannot fit a horizontal item.
  const awkward=newRun(7);awkward.items=[{uid:1,def:'boots',x:0,y:0,rotation:0,used:0},{uid:2,def:'bread',x:1,y:2,rotation:0,used:0},{uid:3,def:'flower',x:1,y:0,rotation:0,used:0}];
  awkward.bag=['0,0','0,1','1,2','2,2','1,0'];assert.ok(act(awkward,{type:'place',uid:1,x:1,y:2,rotation:1}).error);
  const battle=act(act(run,{type:'node',kind:'battle'}).run,{type:'start'}).run;
  assert.equal(act(battle,{type:'place',uid:potion.uid,x:flower.x,y:flower.y,rotation:0}).run,battle);
  assert.deepEqual(run.items.find(i=>i.uid===potion.uid),potion);
});

test('商店扣款一次，满包落地可出售，最后武器不可出售，离店前可换入背包',()=>{
  const run=newRun(2);run.step=1;run.gold=500;
  let shop=act(run,{type:'node',kind:'shop'}).run;
  const def=shop.offers[0];shop=act(shop,{type:'buy',def}).run;
  assert.equal(shop.gold,500-ITEM_MAP[def].price);assert.equal(shop.loot[0].def,def);
  assert.equal(act(shop,{type:'buy',def}).run,shop);
  const sold=act(shop,{type:'sell',uid:shop.loot[0].uid});
  assert.equal(sold.run.loot.length,0);assert.equal(sold.run.gold,shop.gold+Math.floor(ITEM_MAP[def].price/2));
  shop.items=shop.items.filter(i=>i.def==='staff');shop.loot=[];
  assert.ok(act(shop,{type:'sell',uid:shop.items[0].uid}).error);
});

test('不同占格数按双方实际空间交换，回填被挡则拒绝且不修改任何物品',()=>{
  const run=newRun(42);
  run.items=[{uid:1,def:'flower',x:0,y:0,rotation:0,used:0},{uid:2,def:'bread',x:3,y:0,rotation:0,used:0}];
  assert.equal(swapPlan(run,run.items[0],3,0,0)?.[0].uid,2);
  const result=act(run,{type:'place',uid:1,x:3,y:0,rotation:0});
  assert.equal(result.error,undefined);assert.ok(validateSave(result.run));
  assert.deepEqual(result.run.items.find(i=>i.uid===2),{...run.items[1],x:0,y:0});
  run.items.push({uid:3,def:'potion',x:1,y:0,rotation:0,used:0});run.bag=['0,0','1,0','3,0','4,0'];
  assert.equal(swapPlan(run,run.items[0],3,0,0),undefined);
  assert.equal(act(run,{type:'place',uid:1,x:3,y:0,rotation:0}).run,run);
});

test('新局每层8站，旧档6站原路续玩；扩展存档严格校验',()=>{
  const run=newRun(5);assert.equal(stepsInFloor(run),8);
  run.step=5;assert.deepEqual(routes(run),['shop','rest']);
  run.step=7;assert.deepEqual(routes(run),['boss']);assert.ok(validateSave(run));
  const restored=parseSave(JSON.stringify(run));assert.deepEqual(restored,run);
  restored.phase='loot';restored.node='boss';assert.equal(act(restored,{type:'leave'}).run.floor,2);
  delete run.stepsPerFloor;delete run.seenEvents;run.step=5;assert.equal(stepsInFloor(run),6);assert.deepEqual(routes(run),['boss']);assert.ok(validateSave(run));
  assert.equal(validateSave({...run,stepsPerFloor:7}),false);assert.equal(validateSave({...run,seenEvents:[999]}),false);
  assert.equal(validateSave({...run,seenEvents:[1,1]}),false);
});

test('四格物品左移一格，单格目标回填到右侧腾出的格子',()=>{
  const run=newRun(42);run.bag=Array.from({length:6},(_,i)=>`${i%3+1},${Math.floor(i/3)}`);
  run.items=[{uid:1,def:'shield',x:2,y:0,rotation:0,used:0},{uid:2,def:'potion',x:1,y:0,rotation:0,used:0}];
  const plan=swapPlan(run,run.items[0],1,0,0)!;
  assert.equal(plan.length,1);assert.equal(plan[0].x,3);
  const result=act(run,{type:'place',uid:1,x:1,y:0,rotation:0});
  assert.equal(result.error,undefined);assert.ok(validateSave(result.run));
  assert.equal(result.run.items.find(i=>i.uid===1)!.x,1);assert.equal(result.run.items.find(i=>i.uid===2)!.x,3);
  assert.equal(run.items[0].x,2,'预览与提交都不修改输入状态');
});

test('四格目标区内的四件小物品同时回填；地上换入时全部移到地上',()=>{
  const run=newRun(42);run.bag=Array.from({length:8},(_,i)=>`${i%4},${Math.floor(i/4)}`);
  run.items=[{uid:1,def:'shield',x:2,y:0,rotation:0,used:0},...['flower','potion','ring','dagger'].map((def,i)=>({uid:i+2,def,x:i%2,y:Math.floor(i/2),rotation:0,used:0}))];
  const plan=swapPlan(run,run.items[0],0,0,0)!;
  assert.equal(plan.length,4);assert.ok(plan.every(i=>i.x>=2));
  const result=act(run,{type:'place',uid:1,x:0,y:0,rotation:0});
  assert.equal(result.error,undefined);assert.ok(validateSave(result.run));assert.equal(result.run.items.length,5);
  const ground=act(run,{type:'stash',uid:1}).run;
  const fromGround=act(ground,{type:'place',uid:1,x:0,y:0,rotation:0});
  assert.equal(fromGround.error,undefined);assert.equal(fromGround.run.loot.length,4);assert.ok(validateSave(fromGround.run));
});

test('多个目标只能放下一部分时整体拒绝，不覆盖装备或丢失物品',()=>{
  const run=newRun(42);
  // The freed horizontal pair cannot hold either vertical pair of boots.
  run.bag=['0,0','1,0','3,0','4,0','3,1','4,1'];
  run.items=[{uid:1,def:'bread',x:0,y:0,rotation:0,used:0},{uid:2,def:'boots',x:3,y:0,rotation:0,used:0},{uid:3,def:'boots',x:4,y:0,rotation:0,used:0}];
  assert.ok(validateSave(run));
  const result=act(run,{type:'place',uid:1,x:3,y:0,rotation:0});
  assert.equal(result.run,run);assert.ok(result.error);assert.equal(swapPlan(run,run.items[0],3,0,0),undefined);
});

test('事件全池不重复，代价不足不扣款不推进，奖励落地且刷新可恢复',()=>{
  let run=newRun(12);const seen=new Set<number>();
  for(let i=0;i<EVENTS.length;i++){
    run.phase='map';run.step=4;run=act(run,{type:'node',kind:'event'}).run;
    assert.ok(!seen.has(run.event));seen.add(run.event);
    const event=EVENTS[run.event];
    const poor=structuredClone(run);poor.gold=0;poor.hp=1;
    if(event.costGold||event.costHp||event.kind==='trade')assert.equal(act(poor,{type:'event',accept:true}).run,poor);
    run.gold=100;run.hp=run.maxHp;
    run=act(run,{type:'event',accept:true}).run;
    assert.equal(run.step,5);assert.equal(run.phase,'map');
    if(event.item){assert.equal(run.loot[0].def,event.item);assert.ok(validateSave(run));assert.deepEqual(parseSave(JSON.stringify(run)),run);}
    assert.ok(act(run,{type:'event',accept:true}).error);
  }
  run.phase='map';run.step=4;run=act(run,{type:'node',kind:'event'}).run;assert.equal(run.seenEvents?.length,1);
  assert.ok(run.items.every(i=>canPlace(run,i,i.x,i.y,i.rotation)));
});
