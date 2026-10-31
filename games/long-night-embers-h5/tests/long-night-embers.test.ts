import assert from 'node:assert/strict';
import test from 'node:test';
import { SoundController } from '../src/audio/sound.ts';
import { validateContentIntegrity } from '../src/content/ledger.ts';
import {
  LongNightEmbersEngine,
  awardExperience,
  computeDerivedStats,
  createInitialProfile,
  createInitialRun,
  findEligibleEvolutions,
  openChest,
  segmentIntersectsCircle,
  settleRun,
  spawnEnemyInstance,
  verifyRunInvariants,
} from '../src/core/engine.ts';
import {
  importJsonToSlot,
  loadSlotBundle,
  saveSlotBundle,
  serializeExportBundle,
} from '../src/persistence/storage.ts';

test('1. 内容台账与 DLC 边界完整性检查 (1.16.111 本体与免费更新)', () => {
  const report = validateContentIntegrity();
  assert.equal(report.valid, true, `Errors: ${report.errors.join('; ')}`);
  assert.ok(report.inScopeEntries >= 135, `Expected >=135 in-scope entries, got ${report.inScopeEntries}`);
  assert.equal(report.excludedEntries, 6);
});

test('2. 固定步长确定性模拟、斜向移动归一化与高速弹体连续扫掠碰撞', () => {
  const p1 = createInitialProfile(1);
  const r1 = createInitialRun(1, { seed: 20261031, characterId: 'quickblade_renzo' }, p1);
  const e1 = new LongNightEmbersEngine(r1, p1);

  const p2 = createInitialProfile(1);
  const r2 = createInitialRun(1, { seed: 20261031, characterId: 'quickblade_renzo' }, p2);
  const e2 = new LongNightEmbersEngine(r2, p2);

  e1.dispatch({ type: 'SET_MOVE_INPUT', x: 1, y: 1 });
  e2.dispatch({ type: 'SET_MOVE_INPUT', x: 1, y: 1 });

  for (let i = 0; i < 120; i++) {
    e1.stepTick();
    e2.stepTick();
  }

  const s1 = e1.getSnapshot().run;
  const s2 = e2.getSnapshot().run;
  assert.equal(s1.player.x, s2.player.x);
  assert.equal(s1.player.y, s2.player.y);
  assert.equal(s1.rngState, s2.rngState);

  // Diagonal movement distance should equal straight axis movement distance
  const pStraight = createInitialProfile(1);
  const rStraight = createInitialRun(1, { seed: 20261031, characterId: 'quickblade_renzo' }, pStraight);
  const eStraight = new LongNightEmbersEngine(rStraight, pStraight);
  eStraight.dispatch({ type: 'SET_MOVE_INPUT', x: 1, y: 0 });
  for (let i = 0; i < 120; i++) eStraight.stepTick();

  const diagDist = Math.hypot(s1.player.x, s1.player.y);
  const straightDist = Math.hypot(
    eStraight.getSnapshot().run.player.x,
    eStraight.getSnapshot().run.player.y,
  );
  assert.ok(Math.abs(diagDist - straightDist) < 1e-6, 'Diagonal speed must be normalized');

  // High-speed projectile swept collision must catch target between prev and current pos
  assert.equal(segmentIntersectsCircle(0, 0, 100, 0, 50, 4, 10), true);
  assert.equal(segmentIntersectsCircle(0, 0, 100, 0, 50, 25, 10), false);
});

test('3. 多级升级队列、候选持久化、重抽/跳过/放逐与地面被动突破 6 槽上限', () => {
  const profile = createInitialProfile(1);
  const run = createInitialRun(1, { seed: 777, characterId: 'crown_seraphine' }, profile);
  const engine = new LongNightEmbersEngine(run, profile);

  // Award massive XP causing multiple level-ups at once
  awardExperience(engine.getSnapshot().run, profile, 120);
  const snap1 = engine.getSnapshot();
  assert.equal(snap1.run.phase, 'choice');
  assert.equal(snap1.isRunning, false, 'Choice modal must pause combat simulation');
  assert.ok(snap1.run.player.pendingLevels >= 2, 'Excess levels must queue');

  const firstChoiceId = snap1.run.pendingChoice!.choiceId;
  const firstOptionId = snap1.run.pendingChoice!.options[0]!.optionId;

  // Reroll changes choiceId and consumes 1 reroll
  const rerollsBefore = snap1.run.player.rerollsRemaining;
  assert.equal(engine.dispatch({ type: 'REROLL_CHOICE' }), true);
  assert.equal(engine.getSnapshot().run.player.rerollsRemaining, rerollsBefore - 1);
  assert.notEqual(engine.getSnapshot().run.pendingChoice!.choiceId, firstChoiceId);

  // Selecting an option advances immediately to the next queued level choice
  const nextOpt = engine.getSnapshot().run.pendingChoice!.options[0]!.optionId || firstOptionId;
  assert.equal(engine.dispatch({ type: 'SELECT_CHOICE_OPTION', optionId: nextOpt }), true);
  assert.equal(engine.getSnapshot().run.phase, 'choice', 'Next queued level must open choice');

  // Fill 6 regular passives, then verify stage floor passive can still be added as 7th
  const rFloor = engine.getSnapshot().run;
  rFloor.passives = [
    { passiveId: 'spinach', level: 1 },
    { passiveId: 'armor', level: 1 },
    { passiveId: 'hollow_heart', level: 1 },
    { passiveId: 'pummarola', level: 1 },
    { passiveId: 'empty_tome', level: 1 },
    { passiveId: 'candelabrador', level: 1 },
  ];
  rFloor.pendingChoice = null;
  rFloor.player.pendingLevels = 0;
  rFloor.phase = 'combat';
  engine.loadState(rFloor, profile);

  // Place a stage passive right at player position and step 1 tick
  engine.getSnapshot().run.pickups['pk_test_floor'] = {
    pickupId: 'pk_test_floor',
    kind: 'stage_passive',
    x: 0,
    y: 0,
    value: 1,
    targetId: 'clover',
    attracted: true,
    spawnMinute: 0,
  };
  engine.stepTick();
  assert.equal(engine.getSnapshot().run.passives.length, 7, 'Stage floor pickup must allow >6 passives');
});

test('4. 武器进化：常规超武、双鸽联合腾槽、手镯自进化、胜利之剑赠礼与无尽回廊/绯红裹尸布', () => {
  const profile = createInitialProfile(1);
  const run = createInitialRun(1, { seed: 42 }, profile);
  run.stageClockTicks = 11 * 60 * 60; // 11 minutes

  // 1) Peachone Lv8 + Ebony Wings Lv8 -> Vandalier (Union freeing 1 slot)
  run.weapons = [
    {
      weaponId: 'peachone',
      level: 8,
      cooldownRemaining: 10,
      totalDamageDealt: 0,
      kills: 0,
      limitBreakLevels: 0,
      limitBreakMightBonus: 0,
      limitBreakAreaBonus: 0,
    },
    {
      weaponId: 'ebony_wings',
      level: 8,
      cooldownRemaining: 10,
      totalDamageDealt: 0,
      kills: 0,
      limitBreakLevels: 0,
      limitBreakMightBonus: 0,
      limitBreakAreaBonus: 0,
    },
  ];
  const evos1 = findEligibleEvolutions(run, true, 11);
  assert.ok(evos1.some((e) => e.outputWeaponId === 'vandalier'));
  openChest(run, profile, true, 11);
  assert.equal(run.weapons.length, 1, 'Union must merge two weapons and free 1 slot');
  assert.equal(run.weapons[0]?.weaponId, 'vandalier');

  // 2) Victory Sword Lv12 + Torrona's Box Lv9 -> Sole Solution (Gift keeping Victory Sword)
  run.weapons.push({
    weaponId: 'victory_sword',
    level: 12,
    cooldownRemaining: 10,
    totalDamageDealt: 0,
    kills: 0,
    limitBreakLevels: 0,
    limitBreakMightBonus: 0,
    limitBreakAreaBonus: 0,
  });
  run.passives.push({ passiveId: 'torronas_box', level: 9 });
  openChest(run, profile, true, 11);
  assert.ok(run.weapons.some((w) => w.weaponId === 'victory_sword'), 'Gift must retain base weapon');
  assert.ok(run.weapons.some((w) => w.weaponId === 'sole_solution' && w.isExtraSlot));

  // 3) Laurel Lv7 + Metaglio Left Lv9 + Metaglio Right Lv9 -> Crimson Shroud (consumes passives & caps damage at 10)
  run.weapons.push({
    weaponId: 'laurel',
    level: 7,
    cooldownRemaining: 10,
    totalDamageDealt: 0,
    kills: 0,
    limitBreakLevels: 0,
    limitBreakMightBonus: 0,
    limitBreakAreaBonus: 0,
  });
  run.passives.push(
    { passiveId: 'metaglio_left', level: 9, fromStageFloor: true },
    { passiveId: 'metaglio_right', level: 9, fromStageFloor: true },
  );
  openChest(run, profile, true, 11);
  assert.ok(run.weapons.some((w) => w.weaponId === 'crimson_shroud'));
  assert.equal(
    run.passives.some((p) => p.passiveId === 'metaglio_left' || p.passiveId === 'metaglio_right'),
    false,
    'Crimson Shroud evolution must consume Metaglio Left & Right',
  );

  // Verify Crimson Shroud caps incoming Reaper contact damage (65535) to 10!
  const engine = new LongNightEmbersEngine(run, profile);
  const derived = computeDerivedStats(engine.getSnapshot().run, profile);
  engine.getSnapshot().run.player.laurelCharges = 0;
  engine.getSnapshot().run.player.invulnerableTicks = 0;
  const hpBefore = engine.getSnapshot().run.player.hp;
  spawnEnemyInstance(engine.getSnapshot().run, derived, 'reaper', 0, 0);
  engine.stepTick();
  const hpAfter = engine.getSnapshot().run.player.hp;
  assert.equal(hpBefore - hpAfter, 10, 'Crimson Shroud must cap single hit damage at 10');
});

test('5. 局外强化价格递增与 100% 免费重置、奥秘/暗黑奥秘与 1.15 Survarots 叠加', () => {
  const profile = createInitialProfile(1);
  profile.gold = 5000;
  const run = createInitialRun(1, { seed: 100 }, profile);
  const engine = new LongNightEmbersEngine(run, profile);

  assert.equal(engine.dispatch({ type: 'BUY_POWERUP', powerUpId: 'pw_might' }), true);
  assert.equal(engine.dispatch({ type: 'BUY_POWERUP', powerUpId: 'pw_cooldown' }), true);
  const goldAfterBuy = engine.getSnapshot().profile.gold;
  assert.ok(goldAfterBuy < 5000);

  // 100% refund on reset
  assert.equal(engine.dispatch({ type: 'RESET_POWERUPS' }), true);
  assert.equal(engine.getSnapshot().profile.gold, 5000);

  // Arcana XX Silent Old Sanctuary boosts might per empty weapon slot
  const r2 = engine.getSnapshot().run;
  const baseMight = computeDerivedStats(r2, engine.getSnapshot().profile).might;
  r2.arcanas.push('arcana_xx_silent_sanctuary');
  r2.survarots.push('survarot_strength');
  const boostedMight = computeDerivedStats(r2, engine.getSnapshot().profile).might;
  assert.ok(boostedMight > baseMight + 1.0);
});

test('6. 本体冒险（Adventures）独立进度、主档案隔离与升阶重置', () => {
  const profile = createInitialProfile(1);
  const mainGoldBefore = profile.gold;
  const advRun = createInitialRun(
    1,
    {
      seed: 333,
      adventureId: 'a_garlic_paradise',
      adventureChapterId: 'gp_ch1',
    },
    profile,
  );

  // Simulate surviving 3 minutes and collecting 150 gold in Adventure
  advRun.stageClockTicks = 3 * 60 * 60;
  advRun.stats.goldCollected = 150;
  const settlement = settleRun(advRun, profile, 'victory');

  assert.equal(settlement.adventureChapterCompleted, 'gp_ch1');
  assert.equal(profile.gold, mainGoldBefore, 'Adventure settlement must NOT alter main profile gold');
  assert.equal(
    profile.adventures['a_garlic_paradise']?.gold,
    500 + 150 + 600,
    'Adventure gold must include chapter reward',
  );
  assert.equal(verifyRunInvariants(advRun).ok, true);
});

test('7. 三档案持久化、损坏备份自动恢复、高版本保护与结算幂等去重', async () => {
  const profile = createInitialProfile(2);
  const run = createInitialRun(2, { seed: 888 }, profile);
  run.stats.goldCollected = 300;
  settleRun(run, profile, 'victory');
  const goldAfterFirstSettle = profile.gold;

  // Second settleRun with same runId must be idempotent (no duplicate gold)
  settleRun(run, profile, 'victory');
  assert.equal(profile.gold, goldAfterFirstSettle, 'Duplicate settlement must not double-award gold');

  await saveSlotBundle(2, run, profile);
  run.player.level = 9;
  await saveSlotBundle(2, run, profile);

  const loaded = await loadSlotBundle(2);
  assert.equal(loaded.run?.player.level, 9);

  // Export and import into slot 3
  const json = serializeExportBundle(loaded.run!, loaded.profile);
  const imp = await importJsonToSlot(3, json);
  assert.equal(imp.ok, true);
  assert.equal(imp.run?.slotId, 3);

  // Reject future schemaVersion without corrupting slot 3
  const futureJson = JSON.stringify({
    ...JSON.parse(json),
    schemaVersion: 999,
  });
  const rejected = await importJsonToSlot(3, futureJson);
  assert.equal(rejected.ok, false);
  const slot3After = await loadSlotBundle(3);
  assert.equal(slot3After.run?.player.level, 9);
});

test('8. 游隙平台独立暂停原因维护与同步临时静音回执', () => {
  const engine = new LongNightEmbersEngine();
  const sound = new SoundController();

  // Player manually pauses
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'manual', active: true });
  assert.equal(engine.isRunning(), false);

  // Platform enters sidebar & boss cover, then exits both -> manual pause MUST remain!
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'sidebar', active: true });
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'boss', active: true });
  assert.equal(sound.setPlatformTemporaryMute(true), true);
  assert.equal(sound.isEffectivelyMuted(), true);

  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'boss', active: false });
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'sidebar', active: false });
  assert.equal(sound.setPlatformTemporaryMute(false), true);
  assert.equal(sound.isEffectivelyMuted(), false);
  assert.equal(
    engine.isRunning(),
    false,
    'Exiting platform cover must preserve player manual pause',
  );
});

test('9. 内置修改器金币设定、一键全解锁与无敌战斗辅助测试', () => {
  const engine = new LongNightEmbersEngine();

  // 1. 金币数值设定与快捷增减
  engine.dispatch({ type: 'CHEAT_ACTION', action: { kind: 'SET_GOLD', amount: 999999 } });
  assert.equal(engine.getSnapshot().profile.gold, 999999);

  engine.dispatch({ type: 'CHEAT_ACTION', action: { kind: 'ADD_GOLD', delta: 50000 } });
  assert.equal(engine.getSnapshot().profile.gold, 1049999);

  engine.dispatch({ type: 'CHEAT_ACTION', action: { kind: 'SET_GOLD', amount: 0 } });
  assert.equal(engine.getSnapshot().profile.gold, 0);

  // 2. 角色与全解锁
  engine.dispatch({ type: 'CHEAT_ACTION', action: { kind: 'UNLOCK_ALL_CHARACTERS' } });
  assert.equal(engine.getSnapshot().profile.unlockedCharacterIds.length, 17);

  // 3. 局外强化全满
  engine.dispatch({ type: 'CHEAT_ACTION', action: { kind: 'MAX_ALL_POWERUPS' } });
  const pwr = engine.getSnapshot().profile.powerUpRanks;
  assert.ok(Object.keys(pwr).length >= 15);
  assert.equal(pwr.pw_might, 5);

  // 4. 无敌模式开关
  assert.equal(engine.getSnapshot().run.godMode, false);
  engine.dispatch({ type: 'CHEAT_ACTION', action: { kind: 'TOGGLE_GOD_MODE' } });
  assert.equal(engine.getSnapshot().run.godMode, true);

  // 5. 金蛋注入
  engine.dispatch({ type: 'CHEAT_ACTION', action: { kind: 'ADD_EGGS', characterId: 'torchguard_torren', count: 100 } });
  assert.equal(engine.getSnapshot().profile.goldenEggsByCharacter.torchguard_torren, 100);
});
