import assert from 'node:assert/strict';
import test from 'node:test';
import { act, DIFFICULTIES, difficultyOf, intent, newRun, type Difficulty } from '../src/engine.ts';
import { parseSave, validateSave } from '../src/storage.ts';

test('三档难度的新局、敌人伤害、战后恢复与救援按所选规则生效',()=>{
  assert.equal(newRun(17).difficulty,'normal');
  const damage:number[]=[];
  for(const difficulty of ['easy','normal','hard'] as Difficulty[]){
    const settings=DIFFICULTIES[difficulty];
    let run=newRun(17,difficulty);
    assert.equal(run.hp,settings.hp);assert.equal(run.gold,settings.gold);
    assert.equal(run.items.filter(i=>i.def==='potion').length,difficulty==='easy'?2:1);
    assert.equal(parseSave(JSON.stringify(run)).difficulty,difficulty);
    run=act(act(run,{type:'node',kind:'battle'}).run,{type:'start'}).run;
    run.enemies[0].def='root';run.turn=1;
    damage.push(intent(run,run.enemies[0]).value);
    const fatal=structuredClone(run);fatal.hp=1;
    const afterFatal=act(fatal,{type:'end'}).run;
    assert.equal(afterFatal.phase,difficulty==='hard'?'lost':'battle');
    assert.equal(afterFatal.rescues,difficulty==='hard'?0:1);
    run.hp=10;run.enemies.forEach(e=>e.hp=1);
    const won=act(run,{type:'use',uid:run.items[0].uid,target:run.enemies[0].uid}).run;
    assert.equal(won.phase,'loot');assert.equal(won.hp,10+settings.recovery);
  }
  assert.ok(damage[0]<damage[1]&&damage[1]<damage[2]);
});

test('无难度字段的旧档保留轻松规则，无效难度不能导入',()=>{
  const legacy=newRun(42,'easy');delete legacy.difficulty;
  assert.equal(validateSave(legacy),true);
  assert.equal(difficultyOf(parseSave(JSON.stringify(legacy))),DIFFICULTIES.easy);
  assert.equal(validateSave({...legacy,difficulty:'unknown'}),false);
});

test('可以丢弃背包装备和战利品，最后一件武器及战斗阶段受保护',()=>{
  const run=newRun(42);const shield=run.items.find(i=>i.def==='shield')!;
  const discarded=act(run,{type:'discard',uid:shield.uid});
  assert.equal(discarded.error,undefined);assert.ok(!discarded.run.items.some(i=>i.uid===shield.uid));
  const stashed=act(run,{type:'stash',uid:shield.uid}).run;
  assert.equal(act(stashed,{type:'discard',uid:shield.uid}).run.loot.length,0);
  const onlyWeapon=structuredClone(run);onlyWeapon.items=onlyWeapon.items.filter(i=>i.def!=='dagger');
  assert.ok(act(onlyWeapon,{type:'discard',uid:onlyWeapon.items[0].uid}).error);
  const battle=act(act(run,{type:'node',kind:'battle'}).run,{type:'start'}).run;
  assert.equal(act(battle,{type:'discard',uid:shield.uid}).run,battle);
});
