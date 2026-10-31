import assert from 'node:assert/strict';
import test from 'node:test';
import { SoundController } from '../src/audio/sound.ts';
import { validateContentIntegrity } from '../src/content/ledger.ts';
import {
  CardRealmsEngine,
  createInitialProfile,
  createInitialRun,
  getBoardCapacity,
  getCurrencyBalance,
  spawnCardInstance,
  verifyRunInvariants,
} from '../src/core/engine.ts';
import {
  importJsonToSlot,
  loadRunSlot,
  saveRunSlot,
  serializeExportBundle,
} from '../src/persistence/storage.ts';

test('1. 内容台账与完整性检查 (367 项 S06 基础版台账)', () => {
  const report = validateContentIntegrity();
  assert.equal(report.valid, true, `Errors: ${report.errors.join('; ')}`);
  assert.equal(report.totalLedgerEntries, 367);
  assert.equal(report.inScopeEntries, 363);
  assert.equal(report.excludedEntries, 4);
});

test('2. 牌堆拖拽保留工作进度、拆堆中断与配方事务提交', () => {
  const profile = createInitialProfile();
  const run = createInitialRun(1, { seed: 42 }, profile);
  const engine = new CardRealmsEngine(run, profile);

  // Stack villager onto wood to craft stick (craft_stick: 60 ticks)
  const board = engine.getSnapshot().run.boards.mainland;
  const villagerStack = Object.values(board.stacks).find((s) =>
    s.cardIds.some((id) => engine.getSnapshot().run.instances[id]?.defId === 'villager'),
  )!;
  const woodInst = spawnCardInstance(
    engine.getSnapshot().run,
    profile,
    'wood',
    'mainland',
    400,
    300,
    false,
  );
  const woodStack = Object.values(board.stacks).find((s) => s.cardIds.includes(woodInst.instanceId))!;

  engine.dispatch({
    type: 'MOVE_CARDS',
    sourceStackId: villagerStack.stackId,
    startCardIndex: 0,
    x: woodStack.x,
    y: woodStack.y,
    targetStackId: woodStack.stackId,
  });

  // Advance 25 ticks
  for (let i = 0; i < 25; i++) engine.stepTick();
  const activeJobBeforeMove = Object.values(board.jobs)[0];
  assert.ok(activeJobBeforeMove, 'Job should be active');
  assert.equal(activeJobBeforeMove.elapsedTicks, 25);

  // Drag whole stack to new position -> progress must be preserved!
  engine.dispatch({
    type: 'MOVE_CARDS',
    sourceStackId: woodStack.stackId,
    startCardIndex: 0,
    x: 520,
    y: 340,
  });
  const activeJobAfterMove = Object.values(board.jobs)[0];
  assert.ok(activeJobAfterMove);
  assert.equal(activeJobAfterMove.elapsedTicks, 25);

  // Finish remaining 35 ticks -> stick produced, wood consumed, villager preserved
  for (let i = 0; i < 36; i++) engine.stepTick();
  assert.equal(engine.getSnapshot().run.stats.craftedByDef['stick'], 1);
  assert.equal(verifyRunInvariants(engine.getSnapshot().run).ok, true);
});

test('3. 金币与钱箱支付、出售与确定性开包', () => {
  const p1 = createInitialProfile();
  const r1 = createInitialRun(1, { seed: 999 }, p1);
  const e1 = new CardRealmsEngine(r1, p1);

  const p2 = createInitialProfile();
  const r2 = createInitialRun(1, { seed: 999 }, p2);
  const e2 = new CardRealmsEngine(r2, p2);

  // Spawn a coin_chest with 5 gold stored
  const chest = spawnCardInstance(r1, p1, 'coin_chest', 'mainland', 100, 100, false);
  chest.storedDefId = 'gold';
  chest.storedCount = 5;

  const chest2 = spawnCardInstance(r2, p2, 'coin_chest', 'mainland', 100, 100, false);
  chest2.storedDefId = 'gold';
  chest2.storedCount = 5;

  assert.equal(getCurrencyBalance(r1, 'mainland', 'gold'), 8); // 3 loose + 5 in chest

  assert.equal(e1.dispatch({ type: 'BUY_PACK', packId: 'seeking_wisdom' }), true);
  assert.equal(e2.dispatch({ type: 'BUY_PACK', packId: 'seeking_wisdom' }), true);

  assert.equal(getCurrencyBalance(r1, 'mainland', 'gold'), 4);
  const defs1 = Object.values(r1.instances).map((i) => i.defId);
  const defs2 = Object.values(r2.instances).map((i) => i.defId);
  assert.deepEqual(defs1, defs2, 'Same seed must produce identical pack draws');
});

test('4. 月末结算：喂食、婴儿成长、海岛腐败与容量超限处置', () => {
  const profile = createInitialProfile();
  const run = createInitialRun(1, { seed: 77, monthLengthOption: 'short', peacefulMode: true }, profile);
  const engine = new CardRealmsEngine(run, profile);

  // Add food (apple = 2 food) and a kid (needs 1 food) + berry (1 food)
  spawnCardInstance(run, profile, 'apple', 'mainland', 220, 220, false);
  spawnCardInstance(run, profile, 'berry', 'mainland', 250, 220, false);
  const kid = spawnCardInstance(run, profile, 'kid', 'mainland', 280, 220, false);

  // Advance to month end
  run.monthTicksElapsed = run.monthDurationTicks - 1;
  engine.stepTick();

  assert.equal(run.monthEndPhase, 'feed');
  assert.equal(kid.defId, 'villager', 'Fed kid must grow into adult villager');

  // Step through spoil -> capacity -> events -> next month
  engine.dispatch({ type: 'ADVANCE_MONTH_PHASE' });
  assert.equal(run.monthEndPhase, 'spoil');
  engine.dispatch({ type: 'ADVANCE_MONTH_PHASE' });
  assert.equal(run.monthEndPhase, 'capacity');
  engine.dispatch({ type: 'ADVANCE_MONTH_PHASE' });
  assert.equal(run.monthEndPhase, 'events');
  engine.dispatch({ type: 'ADVANCE_MONTH_PHASE' });
  assert.equal(run.monthEndPhase, null);
  assert.equal(run.month, 2);
  assert.equal(getBoardCapacity(run, 'mainland').max, 20);
});

test('5. 装备穿戴、职业转换与战斗击败结算', () => {
  const profile = createInitialProfile();
  const run = createInitialRun(1, { seed: 123 }, profile);
  const engine = new CardRealmsEngine(run, profile);

  const villagerInst = Object.values(run.instances).find((i) => i.defId === 'villager')!;
  const villagerStack = Object.values(run.boards.mainland.stacks).find((s) =>
    s.cardIds.includes(villagerInst.instanceId),
  )!;

  const swordInst = spawnCardInstance(run, profile, 'sword', 'mainland', 300, 300, false);
  const swordStack = Object.values(run.boards.mainland.stacks).find((s) =>
    s.cardIds.includes(swordInst.instanceId),
  )!;

  // Equip sword onto villager
  engine.dispatch({
    type: 'MOVE_CARDS',
    sourceStackId: swordStack.stackId,
    startCardIndex: 0,
    x: villagerStack.x,
    y: villagerStack.y,
    targetStackId: villagerStack.stackId,
  });

  assert.equal(villagerInst.defId, 'swordsman');
  assert.equal(villagerInst.equipment.hand, swordInst.instanceId);

  // Spawn a rat next to the swordsman and run ticks until rat is defeated
  spawnCardInstance(run, profile, 'rat', 'mainland', villagerStack.x + 20, villagerStack.y, false);
  for (let i = 0; i < 150; i++) {
    engine.stepTick();
    if (run.stats.enemiesKilled >= 1) break;
  }
  assert.equal(run.stats.enemiesKilled, 1);
  assert.equal(verifyRunInvariants(run).ok, true);
});

test('6. 跨区域旅行：划艇前往海岛与传送门进入黑暗森林', () => {
  const profile = createInitialProfile();
  const run = createInitialRun(1, { seed: 555 }, profile);
  const engine = new CardRealmsEngine(run, profile);

  const villagerInst = Object.values(run.instances).find((i) => i.defId === 'villager')!;
  const villagerStack = Object.values(run.boards.mainland.stacks).find((s) =>
    s.cardIds.includes(villagerInst.instanceId),
  )!;
  const boatInst = spawnCardInstance(run, profile, 'rowboat', 'mainland', 400, 220, false);
  const boatStack = Object.values(run.boards.mainland.stacks).find((s) =>
    s.cardIds.includes(boatInst.instanceId),
  )!;

  // Stack villager onto boat and travel to island
  engine.dispatch({
    type: 'MOVE_CARDS',
    sourceStackId: villagerStack.stackId,
    startCardIndex: 0,
    x: boatStack.x,
    y: boatStack.y,
    targetStackId: boatStack.stackId,
  });

  const ok = engine.dispatch({
    type: 'TRAVEL_BOAT',
    boatStackId: boatStack.stackId,
    targetRegion: 'island',
  });
  assert.equal(ok, true);
  assert.equal(run.activeRegion, 'island');
  assert.equal(villagerInst.region, 'island');
  assert.equal(boatInst.region, 'island');
  assert.equal(verifyRunInvariants(run).ok, true);
});

test('7. 存档序列化、损坏恢复与高版本保护', async () => {
  const profile = createInitialProfile();
  const run = createInitialRun(2, { seed: 888 }, profile);
  await saveRunSlot(2, run, profile);

  // Save a second time so backup #0 holds the valid first snapshot
  run.month = 3;
  await saveRunSlot(2, run, profile);

  const loaded = await loadRunSlot(2);
  assert.equal(loaded.run?.month, 3);

  // Export and re-import to slot 3
  const json = serializeExportBundle(loaded.run!, profile);
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
  const slot3After = await loadRunSlot(3);
  assert.equal(slot3After.run?.month, 3);
});

test('8. 游隙平台暂停原因独立维护与临时静音回执', () => {
  const engine = new CardRealmsEngine();
  const sound = new SoundController();

  // Player manually pauses
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'manual', active: true });
  assert.equal(engine.isRunning(), false);

  // Platform enters boss cover and sidebar, then exits both -> manual pause MUST remain!
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'sidebar', active: true });
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'boss', active: true });
  assert.equal(sound.setPlatformTemporaryMute(true), true);
  assert.equal(sound.isEffectivelyMuted(), true);

  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'boss', active: false });
  engine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'sidebar', active: false });
  assert.equal(sound.setPlatformTemporaryMute(false), true);
  assert.equal(sound.isEffectivelyMuted(), false);
  assert.equal(engine.isRunning(), false, 'Exiting platform cover must preserve player manual pause');
});
