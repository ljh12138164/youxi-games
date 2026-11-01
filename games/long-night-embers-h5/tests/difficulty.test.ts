import assert from 'node:assert/strict';
import test from 'node:test';
import { LongNightEmbersEngine, computeDerivedStats, createInitialProfile, createInitialRun, spawnEnemyInstance } from '../src/core/engine.ts';
import { CHARACTER_MAP } from '../src/content/ledger.ts';
import { DIFFICULTIES, difficultyOf, type Difficulty } from '../src/core/difficulty.ts';
import { validateRunStatePayload } from '../src/persistence/storage.ts';

test('额外血量、自然恢复、拾取范围和重抽让新档更宽容',()=>{
  const profile=createInitialProfile(),run=createInitialRun(1,{seed:42,difficulty:'easy'},profile),stats=computeDerivedStats(run,profile);
  assert.equal(run.player.maxHp,Math.round(CHARACTER_MAP[run.characterId].baseHp*1.25));
  assert.ok(stats.recovery>=0.3);assert.ok(stats.revival>=1);assert.ok(stats.magnet>=96);
  assert.ok(run.player.rerollsRemaining>=2);assert.ok(run.player.skipsRemaining>=1);
  const engine=new LongNightEmbersEngine(run,profile);run.player.hp-=10;
  run.player.invulnerableTicks=9999;run.weapons.forEach(w=>w.cooldownRemaining=99999);
  for(let i=0;i<600;i++)engine.stepTick();assert.ok(run.player.hp>run.player.maxHp-10);
});

test('三档实际生命、伤害、受击保护、回血、复活和敌潮不同，旧档保留轻松规则',()=>{
  assert.equal(createInitialRun().difficulty,'normal');
  const populations:number[]=[];
  for(const difficulty of ['easy','normal','hard'] as Difficulty[]){
    const profile=createInitialProfile(),run=createInitialRun(1,{seed:42,difficulty},profile),settings=DIFFICULTIES[difficulty];
    const stats=computeDerivedStats(run,profile),engine=new LongNightEmbersEngine(run,profile);
    assert.equal(run.player.maxHp,Math.round(CHARACTER_MAP[run.characterId].baseHp*settings.hp));
    assert.equal(stats.recovery,settings.recovery);assert.equal(stats.revival,settings.revival);
    assert.equal(validateRunStatePayload(JSON.parse(JSON.stringify(run))).run?.difficulty,difficulty);
    run.weapons.forEach(w=>w.cooldownRemaining=99999);
    const enemy=spawnEnemyInstance(run,stats,'skeleton',run.player.x,run.player.y)!;
    enemy.moveSpeed=0;enemy.hp=enemy.maxHp=10000;enemy.contactDamage=20;
    const hp=run.player.hp;engine.stepTick();
    assert.equal(hp-run.player.hp,Math.max(1,Math.ceil(20*settings.damage)-stats.armor));
    assert.equal(run.player.invulnerableTicks,settings.invulnerability);
    run.player.hp=1;run.player.invulnerableTicks=0;enemy.contactDamage=1000;engine.stepTick();
    assert.equal(run.settlement?.reason,difficulty==='easy'?undefined:'defeat');
    const waves=createInitialRun(1,{seed:42,difficulty},profile),waveEngine=new LongNightEmbersEngine(waves,profile);
    waves.player.invulnerableTicks=99999;waves.weapons.forEach(w=>w.cooldownRemaining=99999);
    for(let i=0;i<300;i++)waveEngine.stepTick();
    populations.push(Object.keys(waves.enemies).length);
  }
  assert.ok(populations[0]<populations[1]&&populations[1]<=populations[2],populations.join(','));
  const legacy=createInitialRun(1,{difficulty:'easy'});delete legacy.difficulty;
  assert.equal(validateRunStatePayload(legacy).valid,true);assert.equal(difficultyOf(legacy),DIFFICULTIES.easy);
  assert.equal(validateRunStatePayload({...legacy,difficulty:'invalid'}).valid,false);
});
test('开局不会每个 tick 瞬间补满敌群；受击保护和一次复活生效',()=>{
  const profile=createInitialProfile(),run=createInitialRun(1,{seed:42,difficulty:'easy'},profile),stats=computeDerivedStats(run,profile);
  const engine=new LongNightEmbersEngine(run,profile);
  for(let i=0;i<10;i++)engine.stepTick();assert.ok(Object.keys(run.enemies).length<=2);
  run.enemies={};run.weapons.forEach(w=>w.cooldownRemaining=99999);
  const enemy=spawnEnemyInstance(run,stats,'skeleton',run.player.x,run.player.y);
  assert.ok(enemy);
  enemy.moveSpeed=0;enemy.hp=enemy.maxHp=10000;enemy.contactDamage=12;
  const before=run.player.hp;engine.stepTick();
  assert.ok(before-run.player.hp<12);assert.equal(run.player.invulnerableTicks,45);
  const protectedHp=run.player.hp;engine.stepTick();assert.equal(run.player.hp,protectedHp);
  run.player.hp=1;run.player.invulnerableTicks=0;enemy.contactDamage=1000;engine.stepTick();
  assert.equal(run.player.revivalsUsed,1);assert.equal(run.player.hp,Math.round(run.player.maxHp*.75));
  assert.equal(run.player.invulnerableTicks,180);
  enemy.x=run.player.x;enemy.y=run.player.y;run.player.hp=1;run.player.invulnerableTicks=0;engine.stepTick();
  assert.equal(run.player.hp,0);assert.equal(run.settlement?.reason,'defeat');
});
