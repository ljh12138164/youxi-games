import assert from 'node:assert/strict';
import test from 'node:test';
import { CardRealmsEngine, createInitialProfile, createInitialRun, getBoardCapacity, spawnCardInstance } from '../src/core/engine.ts';
import { CARD_MAP } from '../src/content/ledger.ts';
import { DIFFICULTIES, difficultyOf, type Difficulty } from '../src/core/difficulty.ts';
import { validateRunStatePayload } from '../src/persistence/storage.ts';

test('轻松档给足整理时间和第一月口粮；缺一顿先受伤，吃饱后可恢复',()=>{
  const profile=createInitialProfile(),run=createInitialRun(1,{difficulty:'easy'},profile),engine=new CardRealmsEngine(run,profile);
  assert.equal(profile.settings.pauseOnDrag,true);assert.equal(run.monthDurationTicks,200*20);
  assert.equal(getBoardCapacity(run,'mainland').max,25);
  assert.equal(Object.values(run.instances).filter(i=>i.defId==='berry').length,2);
  for(const stack of Object.values(run.boards.mainland.stacks))if(stack.cardIds.some(id=>CARD_MAP[run.instances[id].defId].foodValue>0)){
    engine.dispatch({type:'SELL_STACK',stackId:stack.stackId,startCardIndex:0});
  }
  const villager=Object.values(run.instances).find(i=>i.defId==='villager')!;
  run.monthTicksElapsed=run.monthDurationTicks-1;engine.stepTick();
  assert.ok(run.instances[villager.instanceId]);assert.ok(villager.hp>0&&villager.hp<villager.maxHp);assert.equal(run.isGameOver,false);
  for(let i=0;i<4;i++)engine.dispatch({type:'ADVANCE_MONTH_PHASE'});
  spawnCardInstance(run,profile,'apple','mainland',200,200,false);
  run.monthTicksElapsed=run.monthDurationTicks-1;engine.stepTick();
  assert.equal(villager.hp,villager.maxHp);
});

test('三档分别控制口粮、月份、袭击预警与缺粮保护，旧档继续原规则',()=>{
  assert.equal(createInitialRun().difficulty,'normal');
  for(const difficulty of ['easy','normal','hard'] as Difficulty[]){
    const profile=createInitialProfile(),run=createInitialRun(1,{difficulty},profile),settings=DIFFICULTIES[difficulty];
    assert.equal(Object.values(run.instances).filter(i=>i.defId==='berry').length,settings.berries);
    assert.equal(run.monthDurationTicks,({easy:200,normal:120,hard:90}[difficulty])*20);
    assert.equal(validateRunStatePayload(JSON.parse(JSON.stringify(run))).run?.difficulty,difficulty);
    for(const month of [settings.firstRaid-1,settings.firstRaid,settings.firstRaid+settings.raidInterval]){
      const copy=structuredClone(run);copy.month=month;copy.monthEndPhase='capacity';
      new CardRealmsEngine(copy,profile).dispatch({type:'ADVANCE_MONTH_PHASE'});
      assert.equal(Object.values(copy.instances).some(i=>i.defId==='goblin'),month>=settings.firstRaid);
      if(month<settings.firstRaid)assert.ok(copy.monthEndLog.some(t=>t.includes('准备武器')));
    }
    for(const month of [settings.graceMonths,settings.graceMonths+1]){
      const copy=structuredClone(run);copy.month=month;
      const engine=new CardRealmsEngine(copy,profile);
      for(const stack of Object.values(copy.boards.mainland.stacks))if(stack.cardIds.some(id=>CARD_MAP[copy.instances[id].defId].foodValue>0))engine.dispatch({type:'SELL_STACK',stackId:stack.stackId,startCardIndex:0});
      const villager=Object.values(copy.instances).find(i=>i.defId==='villager')!;villager.hp=1;
      copy.monthTicksElapsed=copy.monthDurationTicks-1;engine.stepTick();
      assert.equal(Boolean(copy.instances[villager.instanceId]),month<=settings.graceMonths);
    }
    const peaceful=createInitialRun(1,{difficulty,peacefulMode:true},profile);peaceful.month=settings.firstRaid;peaceful.monthEndPhase='capacity';
    new CardRealmsEngine(peaceful,profile).dispatch({type:'ADVANCE_MONTH_PHASE'});
    assert.ok(!Object.values(peaceful.instances).some(i=>i.defId==='goblin'));
  }
  const legacy=createInitialRun(1,{difficulty:'easy'});delete legacy.difficulty;
  assert.equal(validateRunStatePayload(legacy).valid,true);assert.equal(difficultyOf(legacy),DIFFICULTIES.easy);
  assert.equal(validateRunStatePayload({...legacy,difficulty:'invalid'}).valid,false);
});
test('第四月预警、第五月首次袭击，和平模式不刷袭击',()=>{
  for(const month of [3,4,5,6,7,8]){
    const profile=createInitialProfile(),run=createInitialRun(1,{difficulty:'easy'},profile);
    run.month=month;run.monthEndPhase='capacity';
    const engine=new CardRealmsEngine(run,profile);engine.dispatch({type:'ADVANCE_MONTH_PHASE'});
    const enemies=Object.values(run.instances).filter(i=>CARD_MAP[i.defId].category==='enemy');
    assert.equal(enemies.length>0,[5,8].includes(month),`month ${month}`);
    if(month===4)assert.ok(run.monthEndLog.some(t=>t.includes('准备武器')));
  }
  const profile=createInitialProfile(),run=createInitialRun(1,{peacefulMode:true},profile);
  run.month=5;run.monthEndPhase='capacity';new CardRealmsEngine(run,profile).dispatch({type:'ADVANCE_MONTH_PHASE'});
  assert.equal(Object.values(run.instances).filter(i=>CARD_MAP[i.defId].category==='enemy').length,0);
});
