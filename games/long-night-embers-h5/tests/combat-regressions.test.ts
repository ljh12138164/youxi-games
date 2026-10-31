import assert from 'node:assert/strict';
import test from 'node:test';
import { LongNightEmbersEngine, computeDerivedStats, createInitialProfile, createInitialRun, fireWeaponOnce, spawnEnemyInstance } from '../src/core/engine.ts';

function scenario(weaponId: string) {
  const profile = createInitialProfile();
  const run = createInitialRun(1, { seed: 42 }, profile);
  run.weapons = [{ ...run.weapons[0]!, weaponId, cooldownRemaining: 9999 }];
  run.enemies = {};
  run.pickups = {};
  const stats = computeDerivedStats(run, profile);
  const engine = new LongNightEmbersEngine(run, profile);
  function enemy(x: number, y: number) {
    spawnEnemyInstance(run, stats, 'skeleton', x, y);
    const target = Object.values(run.enemies).at(-1)!;
    target.radius = 5;
    target.hp = target.maxHp = 1000;
    target.moveSpeed = 0;
    target.freezeTicks = 9999;
    return target;
  }
  function fire() { fireWeaponOnce(run, run.weapons[0]!, stats); }
  return { run, engine, enemy, fire };
}

test('水平鞭击只命中可见横线，不伤害上方和背后敌人', () => {
  const { run, engine, enemy, fire } = scenario('whip');
  const front = enemy(100, 0);
  const above = enemy(50, 60);
  const behind = enemy(-25, 0);
  fire();
  engine.stepTick();
  assert.ok(front.hp < 1000);
  assert.equal(above.hp, 1000);
  assert.equal(behind.hp, 1000);
  assert.equal(Object.keys(run.projectiles).length, 1);
});

test('激光按施放时朝向命中前方射程，移动转身不改变既有光束', () => {
  const { run, engine, enemy, fire } = scenario('phaser');
  run.player.facingX = -1;
  const front = enemy(-230, 0);
  const behind = enemy(60, 0);
  const above = enemy(-80, 60);
  fire();
  run.player.facingX = 1;
  engine.stepTick();
  assert.ok(front.hp < 1000);
  assert.equal(behind.hp, 1000);
  assert.equal(above.hp, 1000);
});

test('环绕圣经的轨道半径不作为单本书的伤害半径', () => {
  const { engine, enemy, fire } = scenario('king_bible');
  const center = enemy(0, 0);
  const onOrbit = enemy(78, 6);
  fire();
  engine.stepTick();
  assert.equal(center.hp, 1000);
  assert.ok(onOrbit.hp < 1000);
});

test('清屏武器真正清除敌人，记录击杀且保留死神免疫', () => {
  const { run, engine, enemy, fire } = scenario('pentagram');
  const target = enemy(200, 0);
  const reaper = enemy(250, 0);
  reaper.isReaper = true;
  fire();
  engine.stepTick();
  assert.equal(run.enemies[target.instanceId], undefined);
  assert.ok(run.enemies[reaper.instanceId]);
  assert.equal(run.stats.kills, 1);
});

test('反弹弹体越界后返回屏内，不在边缘连续耗尽反弹次数', () => {
  const { run, engine, fire } = scenario('runetracer');
  fire();
  const projectile = Object.values(run.projectiles)[0]!;
  projectile.x = 470;
  projectile.y = 0;
  projectile.vx = 6;
  projectile.vy = 0;
  const bounces = projectile.bouncesRemaining;
  engine.stepTick();
  engine.stepTick();
  assert.equal(projectile.bouncesRemaining, bounces - 1);
  assert.ok(projectile.vx < 0);
  assert.ok(projectile.x < 464);
});
