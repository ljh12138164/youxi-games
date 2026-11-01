import {
  BASELINE_ID,
  BOOSTER_PACKS,
  CARD_MAP,
  CONTENT_VERSION,
  QUESTS,
  RECIPES,
} from '../content/ledger.ts';
import type {
  BoardState,
  CardDefinition,
  CardInstance,
  Encounter,
  EquipSlot,
  GameCommand,
  Job,
  MonthLengthOption,
  PauseReason,
  ProfileState,
  RecipeDefinition,
  RegionId,
  RunState,
  Stack,
  WeightedDrop,
} from './types.ts';

import { DIFFICULTIES, difficultyOf, type Difficulty } from './difficulty.ts';

export const SCHEMA_VERSION = 1;
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 50;
export const BASE_BOARD_CAPACITY = 25;

export function monthTicksForOption(option: MonthLengthOption): number {
  if (option === 'short') return 90 * TICKS_PER_SECOND; // 90s
  if (option === 'long') return 200 * TICKS_PER_SECOND; // 200s
  return 120 * TICKS_PER_SECOND; // 120s normal
}

export function nextRandom(run: RunState): number {
  let t = (run.rngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  run.rngState = t >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pickWeighted(run: RunState, pool: WeightedDrop[]): WeightedDrop {
  const total = pool.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return pool[0]!;
  let roll = nextRandom(run) * total;
  for (const item of pool) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1]!;
}

export function createInitialProfile(): ProfileState {
  return {
    schemaVersion: SCHEMA_VERSION,
    discoveredCards: ['villager', 'berrybush', 'wood', 'stone', 'gold', 'blueprint_carving'],
    discoveredIdeas: ['blueprint_carving', 'blueprint_house'],
    completedQuests: [],
    settings: {
      musicVolume: 0.5,
      sfxVolume: 0.7,
      userMuted: false,
      pauseOnDrag: true,
      gridSnap: true,
      reducedMotion: false,
      pauseKey: 'Space',
    },
  };
}

function createEmptyBoard(region: RegionId): BoardState {
  return {
    region,
    stacks: {},
    jobs: {},
    encounters: {},
    nextZ: 1,
  };
}

export function getEffectiveVillagerStats(
  run: RunState,
  instance: CardInstance,
): { maxHp: number; attack: number; defense: number; attackIntervalTicks: number; hitChance: number } {
  const baseDef = CARD_MAP[instance.defId]!;
  let maxHp = baseDef.maxHp;
  let attack = baseDef.attack;
  let defense = baseDef.defense;
  const attackIntervalTicks = baseDef.attackIntervalTicks;
  const hitChance = baseDef.hitChance;

  for (const eqInstanceId of Object.values(instance.equipment)) {
    if (!eqInstanceId) continue;
    const eqInst = run.instances[eqInstanceId];
    if (!eqInst) continue;
    const eqDef = CARD_MAP[eqInst.defId];
    if (!eqDef) continue;
    maxHp += eqDef.maxHp;
    attack += eqDef.attack;
    defense += eqDef.defense;
  }
  return { maxHp, attack, defense, attackIntervalTicks, hitChance };
}

export function registerDiscovery(profile: ProfileState, defId: string): void {
  const def = CARD_MAP[defId];
  if (!def) return;
  if (!profile.discoveredCards.includes(defId)) {
    profile.discoveredCards.push(defId);
  }
  if ((def.category === 'blueprint' || def.category === 'rumor') && !profile.discoveredIdeas.includes(defId)) {
    profile.discoveredIdeas.push(defId);
  }
}

export function spawnCardInstance(
  run: RunState,
  profile: ProfileState,
  defId: string,
  region: RegionId,
  x: number,
  y: number,
  autoStack = true,
): CardInstance {
  const def = CARD_MAP[defId];
  if (!def) {
    throw new Error(`Unknown card definition: ${defId}`);
  }
  const instanceId = `inst_${run.nextInstanceNum++}`;
  const instance: CardInstance = {
    instanceId,
    defId,
    region,
    hp: def.maxHp,
    maxHp: def.maxHp,
    remainingUses: def.maxUses,
    storedCount: 0,
    spoilAge: 0,
    equipment: {},
    statusEffects: [],
  };
  run.instances[instanceId] = instance;
  registerDiscovery(profile, defId);

  const board = run.boards[region];

  // Auto-deposit currency or resources into matching containers or magnet stacks on the board
  if (autoStack) {
    for (const stack of Object.values(board.stacks)) {
      if (stack.lockedByEncounterId) continue;
      for (const cid of stack.cardIds) {
        const containerInst = run.instances[cid];
        if (!containerInst) continue;
        const containerDef = CARD_MAP[containerInst.defId];
        if (!containerDef || containerDef.category !== 'container') continue;
        const maxCap = containerDef.containerMax ?? 30;
        const acceptsId = containerDef.containerAcceptedIds?.includes(defId) ?? false;
        const acceptsCat =
          containerDef.containerAcceptedCategories?.includes(def.category) &&
          (!containerInst.storedDefId || containerInst.storedDefId === defId);
        if ((acceptsId || acceptsCat) && containerInst.storedCount < maxCap) {
          containerInst.storedDefId = defId;
          containerInst.storedCount += 1;
          delete run.instances[instanceId];
          return containerInst;
        }
      }
    }

    // Try stacking onto nearby identical stack if within 90px
    for (const stack of Object.values(board.stacks)) {
      if (stack.lockedByEncounterId || stack.cardIds.length === 0) continue;
      const topId = stack.cardIds[stack.cardIds.length - 1]!;
      const topInst = run.instances[topId];
      if (
        topInst &&
        topInst.defId === defId &&
        stack.cardIds.length < def.maxStack &&
        Math.hypot(stack.x - x, stack.y - y) <= 95
      ) {
        stack.cardIds.push(instanceId);
        syncStackJob(run, region, stack.stackId);
        return instance;
      }
    }
  }

  const stackId = `stk_${run.nextStackNum++}`;
  board.stacks[stackId] = {
    stackId,
    region,
    x: Math.round(x),
    y: Math.round(y),
    z: board.nextZ++,
    cardIds: [instanceId],
  };
  syncStackJob(run, region, stackId);
  return instance;
}

export function createInitialRun(
  slotId: 1 | 2 | 3 = 1,
  options: {
    seed?: number;
    monthLengthOption?: MonthLengthOption;
    peacefulMode?: boolean;
    difficulty?: Difficulty;
  } = {},
  profile: ProfileState = createInitialProfile(),
): RunState {
  const difficulty = options.difficulty ?? 'normal';
  const monthLengthOption = options.monthLengthOption ?? DIFFICULTIES[difficulty].monthLength;
  const run: RunState = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    baselineId: BASELINE_ID,
    saveSeq: 1,
    slotId,
    rngState: (options.seed ?? 0x12345678) >>> 0,
    tickCount: 0,
    month: 1,
    monthTicksElapsed: 0,
    monthDurationTicks: monthTicksForOption(monthLengthOption),
    speed: 1,
    manualPaused: false,
    peacefulMode: options.peacefulMode ?? false,
    difficulty,
    monthLengthOption,
    activeRegion: 'mainland',
    unlockedRegions: ['mainland'],
    boards: {
      mainland: createEmptyBoard('mainland'),
      island: createEmptyBoard('island'),
      forest: createEmptyBoard('forest'),
    },
    instances: {},
    nextInstanceNum: 1,
    nextStackNum: 1,
    nextJobNum: 1,
    nextEncounterNum: 1,
    monthEndPhase: null,
    monthEndLog: [],
    forestWave: 0,
    isGameOver: false,
    isVictory: false,
    stats: {
      cardsSold: 0,
      packsOpened: 0,
      enemiesKilled: 0,
      craftedByDef: {},
      killedByDef: {},
      packsOpenedById: {},
    },
    recentEvents: ['新局开始：将村民拖到浆果丛、树木或岩石上即可采集；出售多余卡牌购买卡包。'],
  };

  spawnCardInstance(run, profile, 'villager', 'mainland', 180, 220, false);
  spawnCardInstance(run, profile, 'berrybush', 'mainland', 340, 220, false);
  spawnCardInstance(run, profile, 'tree', 'mainland', 500, 220, false);
  spawnCardInstance(run, profile, 'rock', 'mainland', 660, 220, false);
  spawnCardInstance(run, profile, 'gold', 'mainland', 180, 400, true);
  spawnCardInstance(run, profile, 'gold', 'mainland', 180, 400, true);
  spawnCardInstance(run, profile, 'gold', 'mainland', 180, 400, true);
  spawnCardInstance(run, profile, 'blueprint_carving', 'mainland', 340, 400, false);
  for (let i = 0; i < DIFFICULTIES[difficulty].berries; i++) {
    spawnCardInstance(run, profile, 'berry', 'mainland', 500, 400, true);
  }

  return run;
}

export function computeStackSignature(run: RunState, stack: Stack): string {
  const counts: Record<string, number> = {};
  for (const cid of stack.cardIds) {
    const inst = run.instances[cid];
    if (!inst) continue;
    counts[inst.defId] = (counts[inst.defId] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
}

function normalizeCatalystDefId(defId: string): string {
  if (defId === 'stove') return 'campfire';
  if (defId === 'farm' || defId === 'greenhouse') return 'garden';
  return defId;
}

export function matchStackRecipe(
  run: RunState,
  region: RegionId,
  stack: Stack,
): { recipeId: string; durationTicks: number } | null {
  if (stack.cardIds.length === 0 || stack.lockedByEncounterId) return null;

  const counts: Record<string, number> = {};
  const catalystPresent = new Set<string>();
  let workerCount = 0;
  let harvestableInst: CardInstance | undefined;

  for (const cid of stack.cardIds) {
    const inst = run.instances[cid];
    if (!inst) continue;
    const def = CARD_MAP[inst.defId];
    if (!def) continue;
    counts[inst.defId] = (counts[inst.defId] ?? 0) + 1;
    catalystPresent.add(inst.defId);
    catalystPresent.add(normalizeCatalystDefId(inst.defId));
    if (inst.defId === 'garden' || inst.defId === 'farm' || inst.defId === 'greenhouse') {
      catalystPresent.add('soil');
    }
    if (def.category === 'villager' && inst.defId !== 'kid') {
      workerCount += 1;
    }
    if (def.category === 'harvestable') {
      harvestableInst = inst;
    }
  }

  // Special case: breeding 2 adult villagers + house
  if (workerCount >= 2 && counts['house'] === 1 && stack.cardIds.length === 3) {
    return { recipeId: 'breed_villager', durationTicks: 180 };
  }

  // Check explicit crafting recipes first
  for (const recipe of RECIPES) {
    if (recipe.id === 'breed_villager') continue;
    if (recipe.region !== 'any' && recipe.region !== region) continue;
    if (recipe.requireWorker && workerCount < 1) continue;

    let allCatalysts = true;
    for (const cat of recipe.catalysts) {
      if (!catalystPresent.has(cat)) {
        allCatalysts = false;
        break;
      }
    }
    if (!allCatalysts) continue;

    const inputEntries = Object.entries(recipe.inputs);
    if (inputEntries.length === 0) continue;

    let inputsMatch = true;
    for (const [inputDefId, needed] of inputEntries) {
      if ((counts[inputDefId] ?? 0) < needed) {
        inputsMatch = false;
        break;
      }
    }
    if (!inputsMatch) continue;

    // Ensure no unrelated non-worker, non-catalyst, non-input cards pollute the stack
    let hasStranger = false;
    for (const cid of stack.cardIds) {
      const inst = run.instances[cid]!;
      const def = CARD_MAP[inst.defId]!;
      const isWorker = def.category === 'villager' && inst.defId !== 'kid';
      const isInput = recipe.inputs[inst.defId] !== undefined;
      const isCatalyst =
        recipe.catalysts.includes(inst.defId) ||
        recipe.catalysts.includes(normalizeCatalystDefId(inst.defId)) ||
        (recipe.catalysts.includes('soil') && ['garden', 'farm', 'greenhouse'].includes(inst.defId));
      if (!isWorker && !isInput && !isCatalyst) {
        hasStranger = true;
        break;
      }
    }
    if (hasStranger) continue;

    const speedFactor = workerCount > 1 ? 1 + (workerCount - 1) * 0.45 : 1;
    return {
      recipeId: recipe.id,
      durationTicks: Math.max(20, Math.round(recipe.durationTicks / speedFactor)),
    };
  }

  // Check harvesting (villager or fish_trap on a harvestable card)
  const hasFishTrapOnSpot =
    harvestableInst?.defId === 'fishing_spot' && (counts['fish_trap'] ?? 0) >= 1;
  if (harvestableInst && (workerCount >= 1 || hasFishTrapOnSpot)) {
    const hDef = CARD_MAP[harvestableInst.defId]!;
    const baseTicks = hDef.harvestTicks ?? 90;
    const workers = Math.max(1, workerCount);
    const speedFactor = workers > 1 ? 1 + (workers - 1) * 0.45 : 1;
    return {
      recipeId: `harvest:${harvestableInst.defId}`,
      durationTicks: Math.max(20, Math.round(baseTicks / speedFactor)),
    };
  }

  return null;
}

export function syncStackJob(run: RunState, region: RegionId, stackId: string): void {
  const board = run.boards[region];
  const stack = board.stacks[stackId];

  let existingJob: Job | undefined;
  for (const job of Object.values(board.jobs)) {
    if (job.stackId === stackId) {
      existingJob = job;
      break;
    }
  }

  if (!stack) {
    if (existingJob) delete board.jobs[existingJob.jobId];
    return;
  }

  const signature = computeStackSignature(run, stack);
  const matched = matchStackRecipe(run, region, stack);

  if (!matched) {
    if (existingJob) delete board.jobs[existingJob.jobId];
    return;
  }

  // Preserve progress if recipe and input signature are unchanged (e.g. dragging stack)
  if (
    existingJob &&
    existingJob.recipeId === matched.recipeId &&
    existingJob.inputSignature === signature
  ) {
    return;
  }

  if (existingJob) {
    delete board.jobs[existingJob.jobId];
  }

  const jobId = `job_${run.nextJobNum++}`;
  board.jobs[jobId] = {
    jobId,
    stackId,
    recipeId: matched.recipeId,
    region,
    totalTicks: matched.durationTicks,
    elapsedTicks: 0,
    inputSignature: signature,
  };
}

function removeCardFromItsStack(run: RunState, region: RegionId, instanceId: string): void {
  const board = run.boards[region];
  for (const stack of Object.values(board.stacks)) {
    const idx = stack.cardIds.indexOf(instanceId);
    if (idx !== -1) {
      stack.cardIds.splice(idx, 1);
      if (stack.cardIds.length === 0) {
        delete board.stacks[stack.stackId];
      }
      syncStackJob(run, region, stack.stackId);
      return;
    }
  }
}

function destroyInstance(run: RunState, instanceId: string): void {
  const inst = run.instances[instanceId];
  if (!inst) return;
  removeCardFromItsStack(run, inst.region, instanceId);
  delete run.instances[instanceId];
}

function pushEvent(run: RunState, text: string): void {
  run.recentEvents.unshift(`[第${run.month}月] ${text}`);
  if (run.recentEvents.length > 25) {
    run.recentEvents.length = 25;
  }
}

function completeJob(run: RunState, profile: ProfileState, job: Job): void {
  const board = run.boards[job.region];
  const stack = board.stacks[job.stackId];
  delete board.jobs[job.jobId];
  if (!stack) return;

  if (job.recipeId.startsWith('harvest:')) {
    const harvestDefId = job.recipeId.slice('harvest:'.length);
    const hCardId = stack.cardIds.find((cid) => run.instances[cid]?.defId === harvestDefId);
    if (!hCardId) return;
    const hInst = run.instances[hCardId]!;
    const hDef = CARD_MAP[hInst.defId]!;
    const drops = hDef.harvestDrops ?? [{ cardId: 'wood', weight: 1 }];
    const chosen = pickWeighted(run, drops);
    const outCount = chosen.count ?? 1;

    for (let i = 0; i < outCount; i++) {
      spawnCardInstance(
        run,
        profile,
        chosen.cardId,
        job.region,
        stack.x + 115 + i * 25,
        stack.y + 15,
        true,
      );
    }

    if (hInst.remainingUses > 0 && hInst.remainingUses < 90) {
      hInst.remainingUses -= 1;
      if (hInst.remainingUses <= 0) {
        destroyInstance(run, hInst.instanceId);
      }
    }

    if (board.stacks[stack.stackId]) {
      syncStackJob(run, job.region, stack.stackId);
    }
    evaluateQuests(run, profile);
    return;
  }

  const recipe: RecipeDefinition | undefined = RECIPES.find((r) => r.id === job.recipeId);
  if (!recipe) return;

  // Verify inputs still exist in stack
  for (const [inputDefId, needed] of Object.entries(recipe.inputs)) {
    const matchingIds = stack.cardIds.filter((cid) => run.instances[cid]?.defId === inputDefId);
    if (matchingIds.length < needed) {
      syncStackJob(run, job.region, stack.stackId);
      return;
    }
  }

  // Consume required inputs
  for (const [inputDefId, needed] of Object.entries(recipe.inputs)) {
    let left = needed;
    for (const cid of [...stack.cardIds]) {
      if (left <= 0) break;
      if (run.instances[cid]?.defId === inputDefId) {
        destroyInstance(run, cid);
        left -= 1;
      }
    }
  }

  if (recipe.ideaCardId) {
    registerDiscovery(profile, recipe.ideaCardId);
  }

  for (const out of recipe.outputs) {
    if (out.chance !== undefined && nextRandom(run) > out.chance) continue;
    for (let i = 0; i < out.count; i++) {
      spawnCardInstance(
        run,
        profile,
        out.cardId,
        job.region,
        stack.x + 115 + i * 28,
        stack.y + 10,
        true,
      );
      run.stats.craftedByDef[out.cardId] = (run.stats.craftedByDef[out.cardId] ?? 0) + 1;
    }
  }

  pushEvent(run, `完成配方：${recipe.nameZh}`);
  if (board.stacks[stack.stackId]) {
    syncStackJob(run, job.region, stack.stackId);
  }
  evaluateQuests(run, profile);
}

export function getCurrencyBalance(
  run: RunState,
  region: RegionId,
  currencyDefId: 'gold' | 'shell',
): number {
  const board = run.boards[region];
  const chestDefId = currencyDefId === 'gold' ? 'coin_chest' : 'shell_chest';
  let total = 0;
  for (const stack of Object.values(board.stacks)) {
    for (const cid of stack.cardIds) {
      const inst = run.instances[cid];
      if (!inst) continue;
      if (inst.defId === currencyDefId) {
        total += 1;
      } else if (inst.defId === chestDefId) {
        total += inst.storedCount;
      }
    }
  }
  return total;
}

export function deductCurrency(
  run: RunState,
  region: RegionId,
  currencyDefId: 'gold' | 'shell',
  amount: number,
): boolean {
  if (getCurrencyBalance(run, region, currencyDefId) < amount) return false;
  const board = run.boards[region];
  const chestDefId = currencyDefId === 'gold' ? 'coin_chest' : 'shell_chest';
  let remaining = amount;

  // Deduct loose coins/shells first
  for (const stack of Object.values(board.stacks)) {
    for (const cid of [...stack.cardIds]) {
      if (remaining <= 0) break;
      const inst = run.instances[cid];
      if (inst?.defId === currencyDefId) {
        destroyInstance(run, cid);
        remaining -= 1;
      }
    }
    if (remaining <= 0) break;
  }

  // Deduct remaining from chests
  if (remaining > 0) {
    for (const stack of Object.values(board.stacks)) {
      for (const cid of stack.cardIds) {
        if (remaining <= 0) break;
        const inst = run.instances[cid];
        if (inst?.defId === chestDefId && inst.storedCount > 0) {
          const take = Math.min(inst.storedCount, remaining);
          inst.storedCount -= take;
          remaining -= take;
        }
      }
    }
  }
  return true;
}

export function getBoardCapacity(run: RunState, region: RegionId): { used: number; max: number } {
  const board = run.boards[region];
  let used = 0;
  let bonus = 0;
  for (const stack of Object.values(board.stacks)) {
    for (const cid of stack.cardIds) {
      const inst = run.instances[cid];
      if (!inst) continue;
      const def = CARD_MAP[inst.defId];
      if (!def) continue;
      if (def.countsTowardCapacity) {
        used += 1;
      }
      bonus += def.capacityBonus;
    }
  }
  return { used, max: BASE_BOARD_CAPACITY + bonus };
}

export function getBoardFoodSummary(
  run: RunState,
  region: RegionId,
): { available: number; needed: number } {
  const board = run.boards[region];
  let available = 0;
  let needed = 0;
  for (const stack of Object.values(board.stacks)) {
    for (const cid of stack.cardIds) {
      const inst = run.instances[cid];
      if (!inst) continue;
      const def = CARD_MAP[inst.defId];
      if (!def) continue;
      available += def.foodValue;
      needed += def.foodNeed;
      if (inst.defId === 'hotpot' && inst.storedDefId) {
        const storedDef = CARD_MAP[inst.storedDefId];
        if (storedDef) {
          available += storedDef.foodValue * inst.storedCount;
        }
      }
    }
  }
  return { available, needed };
}

export function isPackUnlocked(
  run: RunState,
  profile: ProfileState,
  packId: string,
): boolean {
  const pack = BOOSTER_PACKS.find((p) => p.id === packId);
  if (!pack) return false;
  const cond = pack.unlockCondition;
  if (cond.type === 'start') return true;
  if (cond.type === 'questCount') {
    return profile.completedQuests.length >= (cond.count ?? 1);
  }
  if (cond.type === 'ideaFound' && cond.targetId) {
    return profile.discoveredIdeas.includes(cond.targetId);
  }
  if (cond.type === 'regionReached' && cond.targetId) {
    return run.unlockedRegions.includes(cond.targetId as RegionId);
  }
  return true;
}

export function evaluateQuests(run: RunState, profile: ProfileState): void {
  const allInstances = Object.values(run.instances);

  for (const quest of QUESTS) {
    if (profile.completedQuests.includes(quest.id)) continue;
    const cond = quest.condition;
    let passed = false;

    if (cond.type === 'openPackCount') {
      passed = run.stats.packsOpened >= cond.count;
    } else if (cond.type === 'reachMonth') {
      passed = run.month >= cond.count;
    } else if (cond.type === 'reachRegion' && cond.targetId) {
      passed = run.unlockedRegions.includes(cond.targetId as RegionId);
    } else if (cond.type === 'haveCard' && cond.targetId) {
      const cnt = allInstances.filter((i) => i.defId === cond.targetId).length;
      passed = cnt >= cond.count;
    } else if (cond.type === 'haveCategoryCount' && cond.category) {
      const cnt = allInstances.filter((i) => CARD_MAP[i.defId]?.category === cond.category).length;
      passed = cnt >= cond.count;
    } else if (cond.type === 'craftCard' && cond.targetId) {
      passed = (run.stats.craftedByDef[cond.targetId] ?? 0) >= cond.count;
    } else if (cond.type === 'killCard') {
      if (cond.targetId) {
        passed = (run.stats.killedByDef[cond.targetId] ?? 0) >= cond.count;
      } else {
        passed = run.stats.enemiesKilled >= cond.count;
      }
    }

    if (passed) {
      profile.completedQuests.push(quest.id);
      pushEvent(run, `完成任务：${quest.nameZh}`);
      if (quest.rewardCardId && !profile.discoveredIdeas.includes(quest.rewardCardId)) {
        spawnCardInstance(
          run,
          profile,
          quest.rewardCardId,
          run.activeRegion,
          260 + (profile.completedQuests.length % 5) * 90,
          440,
          true,
        );
      }
    }
  }
}

function equipItemOnVillager(
  run: RunState,
  profile: ProfileState,
  villager: CardInstance,
  equipInst: CardInstance,
  x: number,
  y: number,
): boolean {
  const eqDef = CARD_MAP[equipInst.defId];
  if (!eqDef || eqDef.category !== 'equipable' || !eqDef.equipSlot) return false;
  if (villager.defId === 'kid') return false;

  const slot: EquipSlot = eqDef.equipSlot;
  const previousId = villager.equipment[slot];
  if (previousId && run.instances[previousId]) {
    const prevInst = run.instances[previousId]!;
    delete prevInst.equippedOnInstanceId;
    const board = run.boards[villager.region];
    const stackId = `stk_${run.nextStackNum++}`;
    board.stacks[stackId] = {
      stackId,
      region: villager.region,
      x: x + 90,
      y: y + 20,
      z: board.nextZ++,
      cardIds: [previousId],
    };
  }

  removeCardFromItsStack(run, equipInst.region, equipInst.instanceId);
  equipInst.region = villager.region;
  equipInst.equippedOnInstanceId = villager.instanceId;
  villager.equipment[slot] = equipInst.instanceId;

  if (slot === 'hand' && eqDef.roleOnEquip && CARD_MAP[eqDef.roleOnEquip]) {
    villager.defId = eqDef.roleOnEquip;
    registerDiscovery(profile, villager.defId);
  }

  const eff = getEffectiveVillagerStats(run, villager);
  villager.maxHp = eff.maxHp;
  villager.hp = Math.min(villager.maxHp, villager.hp + (eqDef.maxHp || 2));
  pushEvent(run, `${CARD_MAP[villager.defId]?.nameZh} 装备了 ${eqDef.nameZh}`);
  return true;
}

function checkDefeat(run: RunState): void {
  const anyVillagerOrKid = Object.values(run.instances).some((inst) => {
    const def = CARD_MAP[inst.defId];
    return def?.category === 'villager';
  });
  if (!anyVillagerOrKid) {
    run.isGameOver = true;
    run.gameOverReason = '所有村民均已阵亡或饿死，聚落覆灭。';
    pushEvent(run, run.gameOverReason);
  }
}

function scanAndTickEncounters(run: RunState, profile: ProfileState, region: RegionId): void {
  const board = run.boards[region];

  // Find stacks with enemies or friendly combatants close to enemies
  const enemyStacks: Stack[] = [];
  const friendlyStacks: Stack[] = [];

  for (const stack of Object.values(board.stacks)) {
    if (stack.lockedByEncounterId) continue;
    const hasEnemy = stack.cardIds.some((id) => CARD_MAP[run.instances[id]?.defId ?? '']?.category === 'enemy');
    const hasFriendly = stack.cardIds.some((id) => {
      const def = CARD_MAP[run.instances[id]?.defId ?? ''];
      return def?.category === 'villager' && run.instances[id]?.defId !== 'kid';
    });
    if (hasEnemy && hasFriendly) {
      createEncounterFromStacks(run, region, [stack]);
    } else if (hasEnemy) {
      enemyStacks.push(stack);
    } else if (hasFriendly) {
      friendlyStacks.push(stack);
    }
  }

  for (const eStack of enemyStacks) {
    if (eStack.lockedByEncounterId) continue;
    const nearbyFriendly = friendlyStacks.filter(
      (fStack) => !fStack.lockedByEncounterId && Math.hypot(fStack.x - eStack.x, fStack.y - eStack.y) <= 170,
    );
    if (nearbyFriendly.length > 0) {
      createEncounterFromStacks(run, region, [eStack, ...nearbyFriendly]);
    }
  }

  // Advance active encounters
  for (const enc of Object.values(board.encounters)) {
    enc.ticksElapsed += 1;
    enc.friendlyIds = enc.friendlyIds.filter((id) => Boolean(run.instances[id]));
    enc.enemyIds = enc.enemyIds.filter((id) => Boolean(run.instances[id]));

    if (enc.friendlyIds.length === 0 || enc.enemyIds.length === 0) {
      finishEncounter(run, profile, region, enc);
      continue;
    }

    const allCombatants = [...enc.friendlyIds, ...enc.enemyIds];
    for (const cid of allCombatants) {
      const inst = run.instances[cid];
      if (!inst) continue;

      // Status effects
      let stunned = false;
      for (const st of inst.statusEffects) {
        st.ticksRemaining -= 1;
        if (st.type === 'stun') stunned = true;
        if (st.type === 'poison' && enc.ticksElapsed % 20 === 0) {
          inst.hp -= st.stacks;
        }
        if (st.type === 'bleed' && enc.ticksElapsed % 15 === 0) {
          inst.hp -= st.stacks;
        }
        if (st.type === 'regen' && enc.ticksElapsed % 20 === 0) {
          inst.hp = Math.min(inst.maxHp, inst.hp + st.stacks);
        }
      }
      inst.statusEffects = inst.statusEffects.filter((s) => s.ticksRemaining > 0);

      if (inst.hp <= 0) {
        handleCombatDeath(run, profile, region, enc, inst);
        continue;
      }
      if (stunned) continue;

      const isFriendly = enc.friendlyIds.includes(cid);
      const targets = (isFriendly ? enc.enemyIds : enc.friendlyIds).filter((tid) => {
        const t = run.instances[tid];
        return t && t.hp > 0;
      });
      if (targets.length === 0) continue;

      const stats =
        CARD_MAP[inst.defId]?.category === 'villager'
          ? getEffectiveVillagerStats(run, inst)
          : {
              maxHp: CARD_MAP[inst.defId]!.maxHp,
              attack: CARD_MAP[inst.defId]!.attack,
              defense: CARD_MAP[inst.defId]!.defense,
              attackIntervalTicks: CARD_MAP[inst.defId]!.attackIntervalTicks,
              hitChance: CARD_MAP[inst.defId]!.hitChance,
            };

      const cd = (enc.cooldowns[cid] ?? stats.attackIntervalTicks) - 1;
      if (cd > 0) {
        enc.cooldowns[cid] = cd;
        continue;
      }
      enc.cooldowns[cid] = stats.attackIntervalTicks;

      const targetId = targets[Math.floor(nextRandom(run) * targets.length)]!;
      const targetInst = run.instances[targetId]!;
      const targetDef = CARD_MAP[targetInst.defId]!;
      const targetStats =
        targetDef.category === 'villager'
          ? getEffectiveVillagerStats(run, targetInst)
          : { defense: targetDef.defense };

      if (nextRandom(run) <= stats.hitChance) {
        const dmg = Math.max(1, stats.attack - targetStats.defense);
        targetInst.hp -= dmg;
        enc.lastActionText = `${CARD_MAP[inst.defId]?.nameZh} 命中 ${targetDef.nameZh} (-${dmg})`;

        const weaponId = inst.equipment.hand;
        const statusRule =
          (weaponId && CARD_MAP[run.instances[weaponId]?.defId ?? '']?.statusOnHit) ||
          CARD_MAP[inst.defId]?.statusOnHit;
        if (statusRule && nextRandom(run) <= statusRule.chance) {
          const existing = targetInst.statusEffects.find((s) => s.type === statusRule.type);
          if (existing) {
            existing.ticksRemaining = Math.max(existing.ticksRemaining, statusRule.durationTicks);
            existing.stacks = Math.min(3, existing.stacks + 1);
          } else {
            targetInst.statusEffects.push({
              type: statusRule.type,
              ticksRemaining: statusRule.durationTicks,
              stacks: 1,
            });
          }
        }

        if (targetInst.hp <= 0) {
          handleCombatDeath(run, profile, region, enc, targetInst);
        }
      } else {
        enc.lastActionText = `${CARD_MAP[inst.defId]?.nameZh} 攻击未命中`;
      }
    }
  }
}

function createEncounterFromStacks(run: RunState, region: RegionId, stacks: Stack[]): void {
  const board = run.boards[region];
  const friendlyIds: string[] = [];
  const enemyIds: string[] = [];
  const cooldowns: Record<string, number> = {};

  for (const stack of stacks) {
    for (const cid of stack.cardIds) {
      const inst = run.instances[cid];
      if (!inst) continue;
      const def = CARD_MAP[inst.defId];
      if (!def) continue;
      if (def.category === 'enemy') {
        enemyIds.push(cid);
        cooldowns[cid] = def.attackIntervalTicks;
      } else if (def.category === 'villager' && inst.defId !== 'kid') {
        friendlyIds.push(cid);
        cooldowns[cid] = def.attackIntervalTicks;
      }
    }
  }

  if (friendlyIds.length === 0 || enemyIds.length === 0) return;

  const encounterId = `enc_${run.nextEncounterNum++}`;
  for (const stack of stacks) {
    stack.lockedByEncounterId = encounterId;
    for (const job of Object.values(board.jobs)) {
      if (job.stackId === stack.stackId) {
        delete board.jobs[job.jobId];
      }
    }
  }

  board.encounters[encounterId] = {
    encounterId,
    region,
    x: stacks[0]!.x,
    y: stacks[0]!.y,
    friendlyIds,
    enemyIds,
    cooldowns,
    ticksElapsed: 0,
    lastActionText: '战斗开始！',
  };
}

function handleCombatDeath(
  run: RunState,
  profile: ProfileState,
  region: RegionId,
  enc: Encounter,
  dead: CardInstance,
): void {
  const def = CARD_MAP[dead.defId]!;
  enc.friendlyIds = enc.friendlyIds.filter((id) => id !== dead.instanceId);
  enc.enemyIds = enc.enemyIds.filter((id) => id !== dead.instanceId);

  if (def.category === 'enemy') {
    run.stats.enemiesKilled += 1;
    run.stats.killedByDef[dead.defId] = (run.stats.killedByDef[dead.defId] ?? 0) + 1;
    const drops = def.harvestDrops ?? [{ cardId: 'gold', weight: 1 }];
    const drop = pickWeighted(run, drops);
    spawnCardInstance(run, profile, drop.cardId, region, enc.x + 100, enc.y + 20, true);
    pushEvent(run, `击败了 ${def.nameZh}，掉落 ${CARD_MAP[drop.cardId]?.nameZh}`);
    if (dead.defId === 'demon_lord') {
      run.isVictory = true;
      pushEvent(run, '击败恶魔王！主线胜利达成，你可以继续自由经营。');
    }
    destroyInstance(run, dead.instanceId);
    evaluateQuests(run, profile);
  } else {
    // Drop equipped items back onto the board
    for (const eqId of Object.values(dead.equipment)) {
      if (eqId && run.instances[eqId]) {
        const eqInst = run.instances[eqId]!;
        delete eqInst.equippedOnInstanceId;
        const board = run.boards[region];
        const stackId = `stk_${run.nextStackNum++}`;
        board.stacks[stackId] = {
          stackId,
          region,
          x: enc.x - 70,
          y: enc.y + 30,
          z: board.nextZ++,
          cardIds: [eqId],
        };
      }
    }
    destroyInstance(run, dead.instanceId);
    spawnCardInstance(run, profile, 'corpse', region, enc.x, enc.y + 40, true);
    pushEvent(run, `${def.nameZh} 在战斗中阵亡！`);
    checkDefeat(run);
  }
}

function finishEncounter(
  run: RunState,
  profile: ProfileState,
  region: RegionId,
  enc: Encounter,
): void {
  const board = run.boards[region];
  for (const stack of Object.values(board.stacks)) {
    if (stack.lockedByEncounterId === enc.encounterId) {
      delete stack.lockedByEncounterId;
      syncStackJob(run, region, stack.stackId);
    }
  }
  delete board.encounters[enc.encounterId];

  // If in Dark Forest and all enemies on board are cleared, advance wave
  if (region === 'forest' && Object.keys(board.encounters).length === 0) {
    const remainingEnemies = Object.values(board.stacks).some((s) =>
      s.cardIds.some((id) => CARD_MAP[run.instances[id]?.defId ?? '']?.category === 'enemy'),
    );
    if (!remainingEnemies && run.forestWave > 0) {
      if (run.forestWave < 3) {
        run.forestWave += 1;
        spawnForestWave(run, profile, run.forestWave);
      } else {
        run.forestWave = 0;
        pushEvent(run, '黑暗森林远征全部波次完成！点击撤离返回大陆。');
      }
    }
  }
}

function spawnForestWave(run: RunState, profile: ProfileState, wave: number): void {
  if (wave === 1) {
    spawnCardInstance(run, profile, 'goblin', 'forest', 520, 240, false);
    spawnCardInstance(run, profile, 'goblin_archer', 'forest', 640, 240, false);
    pushEvent(run, '黑暗森林第 1 波敌群出现！');
  } else if (wave === 2) {
    spawnCardInstance(run, profile, 'dark_elf', 'forest', 520, 240, false);
    spawnCardInstance(run, profile, 'ogre', 'forest', 640, 240, false);
    pushEvent(run, '黑暗森林第 2 波精锐出现！');
  } else {
    spawnCardInstance(run, profile, 'wicked_witch', 'forest', 560, 240, false);
    pushEvent(run, '黑暗森林最终首领：邪恶女巫降临！');
  }
}

function enterMonthEndFeedPhase(run: RunState, profile: ProfileState): void {
  run.monthEndPhase = 'feed';
  run.monthEndLog = [];
  const region = run.activeRegion;
  const board = run.boards[region];

  // Collect mouths to feed on active board
  const mouths: CardInstance[] = [];
  const foodSources: Array<{ type: 'card' | 'hotpot'; inst: CardInstance; foodValue: number; priority: number }> = [];
  let hasMessHall = false;

  for (const stack of Object.values(board.stacks)) {
    for (const cid of stack.cardIds) {
      const inst = run.instances[cid];
      if (!inst) continue;
      const def = CARD_MAP[inst.defId];
      if (!def) continue;
      if (inst.defId === 'mess_hall') hasMessHall = true;
      if (def.foodNeed > 0) {
        mouths.push(inst);
      }
      if (def.foodValue > 0) {
        foodSources.push({
          type: 'card',
          inst,
          foodValue: def.foodValue,
          priority: hasMessHall ? def.foodValue + 10 : def.foodValue,
        });
      } else if (inst.defId === 'hotpot' && inst.storedDefId && inst.storedCount > 0) {
        const sDef = CARD_MAP[inst.storedDefId];
        if (sDef && sDef.foodValue > 0) {
          foodSources.push({
            type: 'hotpot',
            inst,
            foodValue: sDef.foodValue,
            priority: 20 + sDef.foodValue,
          });
        }
      }
    }
  }

  foodSources.sort((a, b) => b.priority - a.priority);

  let foodCarry = 0;
  for (const mouth of mouths) {
    const def = CARD_MAP[mouth.defId]!;
    let need = def.foodNeed;
    const useCarry = Math.min(need, foodCarry);
    need -= useCarry;
    foodCarry -= useCarry;

    while (need > 0 && foodSources.length > 0) {
      const src = foodSources[0]!;
      if (src.type === 'hotpot') {
        if (src.inst.storedCount <= 0) {
          foodSources.shift();
          continue;
        }
        src.inst.storedCount -= 1;
        if (src.inst.storedCount === 0) delete src.inst.storedDefId;
        if (src.foodValue >= need) {
          foodCarry += src.foodValue - need;
          need = 0;
        } else {
          need -= src.foodValue;
        }
      } else {
        foodSources.shift();
        destroyInstance(run, src.inst.instanceId);
        if (src.foodValue >= need) {
          foodCarry += src.foodValue - need;
          need = 0;
        } else {
          need -= src.foodValue;
        }
      }
    }

    if (need > 0) {
      const settings = difficultyOf(run);
      const protectedMonth = run.month <= settings.graceMonths;
      const hungerDamage = Math.ceil(mouth.maxHp * settings.hungerDamage);
      const beforeHungerHp = mouth.hp;
      mouth.hp = Math.max(protectedMonth ? 1 : 0, mouth.hp - hungerDamage);
      if (mouth.hp > 0) {
        const actualDamage = Math.max(0, beforeHungerHp - mouth.hp);
        run.monthEndLog.push(`${def.nameZh} 缺少 ${need} 点食物，失去 ${actualDamage} 点生命。${protectedMonth ? '本月仍有缺粮保护，至少保留 1 点生命。' : ''}下个月及时补上食物就能恢复。`);
        continue;
      }
      run.monthEndLog.push(`${def.nameZh} 连续缺粮且生命耗尽，没能撑过去。`);
      const stack = Object.values(board.stacks).find((s) => s.cardIds.includes(mouth.instanceId));
      const sx = stack?.x ?? 260;
      const sy = stack?.y ?? 260;
      destroyInstance(run, mouth.instanceId);
      spawnCardInstance(run, profile, 'corpse', region, sx, sy, true);
    } else {
      mouth.hp = mouth.maxHp;
      if (mouth.defId === 'kid') {
        mouth.defId = 'villager';
        mouth.maxHp = CARD_MAP['villager']!.maxHp;
        mouth.hp = mouth.maxHp;
        registerDiscovery(profile, 'villager');
        run.monthEndLog.push('婴儿已健康长大，成为成年村民！');
      } else {
        run.monthEndLog.push(`${def.nameZh} 进食完毕（生命恢复满值）。`);
      }
    }
  }

  if (mouths.length === 0) {
    run.monthEndLog.push('当前区域无需喂食单位。');
  }
  checkDefeat(run);
}

function advanceMonthSettlementPhase(run: RunState, profile: ProfileState): void {
  const region = run.activeRegion;
  const board = run.boards[region];

  if (run.monthEndPhase === 'feed') {
    run.monthEndPhase = 'spoil';
    run.monthEndLog = [];
    for (const stack of Object.values(board.stacks)) {
      const inPreserver = stack.cardIds.some((id) =>
        ['mess_hall', 'hotpot', 'animal_pen', 'breeding_pen'].includes(run.instances[id]?.defId ?? ''),
      );
      for (const cid of [...stack.cardIds]) {
        const inst = run.instances[cid];
        if (!inst) continue;
        const def = CARD_MAP[inst.defId];
        if (!def) continue;

        // Animal monthly output
        if (inst.defId === 'chicken') {
          spawnCardInstance(run, profile, 'egg', region, stack.x + 85, stack.y, true);
          run.monthEndLog.push('鸡产下了 1 枚鸡蛋。');
        } else if (inst.defId === 'cow') {
          spawnCardInstance(run, profile, 'milk', region, stack.x + 85, stack.y, true);
          run.monthEndLog.push('奶牛产出了 1 份牛奶。');
        } else if (def.category === 'animal') {
          spawnCardInstance(run, profile, 'poop', region, stack.x + 85, stack.y, true);
        }

        // Island spoilage (or food aging)
        if (region === 'island' && def.spoilMonths > 0 && !inPreserver) {
          inst.spoilAge += 1;
          if (inst.spoilAge >= def.spoilMonths) {
            const sx = stack.x;
            const sy = stack.y;
            destroyInstance(run, cid);
            spawnCardInstance(run, profile, 'goop', region, sx, sy, true);
            run.monthEndLog.push(`${def.nameZh} 在海岛潮湿气候中腐败变成了腐烂物。`);
          }
        }
      }
    }
    if (run.monthEndLog.length === 0) {
      run.monthEndLog.push('本月无食物腐败或特殊折损。');
    }
    return;
  }

  if (run.monthEndPhase === 'spoil') {
    run.monthEndPhase = 'capacity';
    const cap = getBoardCapacity(run, region);
    if (cap.used > cap.max) {
      run.monthEndLog = [
        `当前卡牌数量（${cap.used}）超出容量上限（${cap.max}）！请出售多余卡牌，或再次确认自动清理超限低价值卡牌。`,
      ];
    } else {
      run.monthEndLog = [`当前卡牌容量正常（${cap.used} / ${cap.max}）。`];
    }
    return;
  }

  if (run.monthEndPhase === 'capacity') {
    const cap = getBoardCapacity(run, region);
    if (cap.used > cap.max) {
      // Sell/discard lowest-value non-villager cards so player never gets permanently softlocked
      let excess = cap.used - cap.max;
      const candidates: Array<{ inst: CardInstance; def: CardDefinition }> = [];
      for (const stack of Object.values(board.stacks)) {
        for (const cid of stack.cardIds) {
          const inst = run.instances[cid];
          if (!inst) continue;
          const def = CARD_MAP[inst.defId];
          if (!def || !def.countsTowardCapacity || def.category === 'villager') continue;
          candidates.push({ inst, def });
        }
      }
      candidates.sort((a, b) => a.def.value - b.def.value);
      for (const item of candidates) {
        if (excess <= 0) break;
        destroyInstance(run, item.inst.instanceId);
        if (item.def.value > 0) {
          const curr = region === 'island' ? 'shell' : 'gold';
          for (let i = 0; i < item.def.value; i++) {
            spawnCardInstance(run, profile, curr, region, 180, 420, true);
          }
        }
        excess -= 1;
      }
    }

    run.monthEndPhase = 'events';
    run.monthEndLog = [];
    const settings = difficultyOf(run);
    if (!run.peacefulMode && run.month >= settings.firstRaid && (run.month - settings.firstRaid) % settings.raidInterval === 0) {
      if (region === 'island') {
        spawnCardInstance(run, profile, 'pirate', 'island', 620, 260, false);
        run.monthEndLog.push('月末事件：海盗袭击了海岛海岸！');
      } else {
        spawnCardInstance(run, profile, 'strange_portal', 'mainland', 620, 260, false);
        spawnCardInstance(run, profile, 'goblin', 'mainland', 660, 300, false);
        run.monthEndLog.push('月末事件：奇异传送门开启，哥布林来袭！');
      }
    } else if (!run.peacefulMode && run.month === settings.firstRaid - 1) {
      run.monthEndLog.push('远处出现了敌人的踪迹。下个月可能遭到袭击，趁现在准备武器和食物。');
    } else if (run.month % 3 === 0) {
      spawnCardInstance(run, profile, 'travelling_cart', region, 580, 360, false);
      run.monthEndLog.push('月末事件：行商马车到访。');
    } else {
      run.monthEndLog.push('新的一月风平浪静。');
    }
    return;
  }

  if (run.monthEndPhase === 'events') {
    run.month += 1;
    run.monthTicksElapsed = 0;
    run.monthEndPhase = null;
    run.monthEndLog = [];
    pushEvent(run, `进入第 ${run.month} 月。`);
    evaluateQuests(run, profile);
  }
}

export function verifyRunInvariants(run: RunState): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenLocations = new Map<string, string>();

  for (const [id, inst] of Object.entries(run.instances)) {
    if (inst.instanceId !== id) {
      errors.push(`Instance key mismatch: ${id} !== ${inst.instanceId}`);
    }
    if (!CARD_MAP[inst.defId]) {
      errors.push(`Instance ${id} has unknown defId ${inst.defId}`);
    }
    for (const [slot, eqId] of Object.entries(inst.equipment)) {
      if (!eqId) continue;
      if (!run.instances[eqId]) {
        errors.push(`Villager ${id} equips missing instance ${eqId} in ${slot}`);
      } else if (seenLocations.has(eqId)) {
        errors.push(`Instance ${eqId} located in multiple places (${seenLocations.get(eqId)} and equip:${id})`);
      } else {
        seenLocations.set(eqId, `equip:${id}:${slot}`);
      }
    }
  }

  for (const [region, board] of Object.entries(run.boards) as Array<[RegionId, BoardState]>) {
    for (const [stackId, stack] of Object.entries(board.stacks)) {
      if (stack.cardIds.length === 0) {
        errors.push(`Empty stack ${stackId} on ${region}`);
      }
      for (const cid of stack.cardIds) {
        const inst = run.instances[cid];
        if (!inst) {
          errors.push(`Stack ${stackId} references missing instance ${cid}`);
        } else if (inst.region !== region) {
          errors.push(`Instance ${cid} region ${inst.region} !== stack region ${region}`);
        } else if (seenLocations.has(cid)) {
          errors.push(`Instance ${cid} in multiple places: ${seenLocations.get(cid)} and stack:${stackId}`);
        } else {
          seenLocations.set(cid, `stack:${stackId}`);
        }
      }
    }
  }

  for (const id of Object.keys(run.instances)) {
    if (!seenLocations.has(id)) {
      errors.push(`Orphan instance ${id} (${run.instances[id]?.defId}) not in any stack or equipment slot`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export class CardRealmsEngine {
  private run: RunState;
  private profile: ProfileState;
  private pauseReasons = new Set<PauseReason>();
  private listeners = new Set<() => void>();
  private versionCounter = 0;
  private cachedSnapshot: {
    version: number;
    run: RunState;
    profile: ProfileState;
    pauseReasons: PauseReason[];
    isRunning: boolean;
  };

  constructor(initialRun?: RunState, initialProfile?: ProfileState) {
    this.profile = initialProfile ?? createInitialProfile();
    this.run = initialRun ?? createInitialRun(1, {}, this.profile);
    if (this.run.manualPaused) {
      this.pauseReasons.add('manual');
    }
    if (this.run.monthEndPhase !== null) {
      this.pauseReasons.add('settlement');
    }
    this.cachedSnapshot = this.buildSnapshot();
  }

  private buildSnapshot() {
    return {
      version: this.versionCounter,
      run: this.run,
      profile: this.profile,
      pauseReasons: [...this.pauseReasons],
      isRunning: this.isRunning(),
    };
  }

  private emit(): void {
    this.versionCounter += 1;
    this.cachedSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = () => {
    return this.cachedSnapshot;
  };

  public isRunning(): boolean {
    if (this.run.isGameOver) return false;
    if (this.run.speed === 0) return false;
    return this.pauseReasons.size === 0;
  }

  public loadState(run: RunState, profile?: ProfileState): void {
    this.run = run;
    if (profile) this.profile = profile;
    this.pauseReasons.delete('manual');
    this.pauseReasons.delete('settlement');
    if (this.run.manualPaused) this.pauseReasons.add('manual');
    if (this.run.monthEndPhase !== null) this.pauseReasons.add('settlement');
    this.emit();
  }

  public updateSettings(partial: Partial<ProfileState['settings']>): void {
    this.profile.settings = { ...this.profile.settings, ...partial };
    this.emit();
  }

  public stepTick(): void {
    if (!this.isRunning()) return;
    const region = this.run.activeRegion;
    const board = this.run.boards[region];

    this.run.tickCount += 1;
    this.run.monthTicksElapsed += 1;

    // Resource magnet auto-pulls nearby matching resources every 20 ticks
    if (this.run.tickCount % 20 === 0) {
      for (const stack of Object.values(board.stacks)) {
        const hasMagnet = stack.cardIds.some((id) => this.run.instances[id]?.defId === 'resource_magnet');
        if (!hasMagnet || stack.cardIds.length < 2) continue;
        const targetDefId = this.run.instances[stack.cardIds[stack.cardIds.length - 1]!]?.defId;
        if (!targetDefId || targetDefId === 'resource_magnet') continue;
        for (const other of Object.values(board.stacks)) {
          if (other.stackId === stack.stackId || other.lockedByEncounterId) continue;
          if (other.cardIds.length === 1 && this.run.instances[other.cardIds[0]!]?.defId === targetDefId) {
            stack.cardIds.push(other.cardIds[0]!);
            delete board.stacks[other.stackId];
            break;
          }
        }
      }
    }

    // Advance jobs
    for (const job of Object.values(board.jobs)) {
      job.elapsedTicks += 1;
      if (job.elapsedTicks >= job.totalTicks) {
        completeJob(this.run, this.profile, job);
      }
    }

    // Advance combat encounters
    scanAndTickEncounters(this.run, this.profile, region);

    // Check month end
    if (this.run.monthTicksElapsed >= this.run.monthDurationTicks && this.run.monthEndPhase === null) {
      this.pauseReasons.add('settlement');
      enterMonthEndFeedPhase(this.run, this.profile);
    }

    this.emit();
  }

  public dispatch(cmd: GameCommand): boolean {
    const region = this.run.activeRegion;
    const board = this.run.boards[region];

    if (cmd.type === 'SET_PAUSE_REASON') {
      if (cmd.active) {
        this.pauseReasons.add(cmd.reason);
      } else {
        this.pauseReasons.delete(cmd.reason);
      }
      if (cmd.reason === 'manual') {
        this.run.manualPaused = cmd.active;
      }
      this.emit();
      return true;
    }

    if (cmd.type === 'TOGGLE_MANUAL_PAUSE') {
      const next = !this.pauseReasons.has('manual');
      if (next) this.pauseReasons.add('manual');
      else this.pauseReasons.delete('manual');
      this.run.manualPaused = next;
      this.emit();
      return true;
    }

    if (cmd.type === 'SET_SPEED') {
      this.run.speed = cmd.speed;
      if (cmd.speed === 0) {
        this.pauseReasons.add('manual');
        this.run.manualPaused = true;
      } else {
        this.pauseReasons.delete('manual');
        this.run.manualPaused = false;
      }
      this.emit();
      return true;
    }

    if (cmd.type === 'ADVANCE_MONTH_PHASE') {
      if (this.run.monthEndPhase === null) return false;
      advanceMonthSettlementPhase(this.run, this.profile);
      if (this.run.monthEndPhase === null) {
        this.pauseReasons.delete('settlement');
      }
      this.emit();
      return true;
    }

    if (cmd.type === 'MOVE_CARDS') {
      const src = board.stacks[cmd.sourceStackId];
      if (!src || src.lockedByEncounterId) return false;
      if (cmd.startCardIndex < 0 || cmd.startCardIndex >= src.cardIds.length) return false;

      const movingIds = src.cardIds.slice(cmd.startCardIndex);
      if (movingIds.length === 0) return false;

      const gx = this.profile.settings.gridSnap ? Math.round(cmd.x / 20) * 20 : Math.round(cmd.x);
      const gy = this.profile.settings.gridSnap ? Math.round(cmd.y / 20) * 20 : Math.round(cmd.y);

      // Moving the entire stack without a target stack: preserve job progress!
      if (cmd.startCardIndex === 0 && (!cmd.targetStackId || cmd.targetStackId === src.stackId)) {
        src.x = gx;
        src.y = gy;
        src.z = board.nextZ++;
        this.emit();
        return true;
      }

      const target =
        cmd.targetStackId && cmd.targetStackId !== src.stackId
          ? board.stacks[cmd.targetStackId]
          : undefined;

      if (target && !target.lockedByEncounterId && target.cardIds.length > 0) {
        const topTargetInst = this.run.instances[target.cardIds[target.cardIds.length - 1]!];
        const firstMovingInst = this.run.instances[movingIds[0]!];

        // 1. Check trash can
        if (topTargetInst?.defId === 'trash_can') {
          let trashedAny = false;
          for (const mid of movingIds) {
            const mInst = this.run.instances[mid];
            if (mInst && CARD_MAP[mInst.defId]?.category !== 'villager') {
              destroyInstance(this.run, mid);
              trashedAny = true;
            }
          }
          if (trashedAny) {
            pushEvent(this.run, '已在垃圾桶销毁卡牌。');
            this.emit();
            return true;
          }
        }

        // 2. Check container storage
        if (topTargetInst) {
          const cDef = CARD_MAP[topTargetInst.defId];
          if (cDef?.category === 'container') {
            const maxCap = cDef.containerMax ?? 30;
            let stored = false;
            for (const mid of movingIds) {
              const mInst = this.run.instances[mid];
              if (!mInst) continue;
              const mDef = CARD_MAP[mInst.defId]!;
              const acceptsId = cDef.containerAcceptedIds?.includes(mInst.defId) ?? false;
              const acceptsCat =
                (cDef.containerAcceptedCategories?.includes(mDef.category) ?? false) &&
                (!topTargetInst.storedDefId || topTargetInst.storedDefId === mInst.defId);
              if ((acceptsId || acceptsCat) && topTargetInst.storedCount < maxCap) {
                topTargetInst.storedDefId = mInst.defId;
                topTargetInst.storedCount += 1;
                destroyInstance(this.run, mid);
                stored = true;
              }
            }
            if (stored) {
              this.emit();
              return true;
            }
          }
        }

        // 3. Check equipping onto villager
        if (
          movingIds.length === 1 &&
          firstMovingInst &&
          CARD_MAP[firstMovingInst.defId]?.category === 'equipable' &&
          topTargetInst &&
          CARD_MAP[topTargetInst.defId]?.category === 'villager'
        ) {
          const ok = equipItemOnVillager(
            this.run,
            this.profile,
            topTargetInst,
            firstMovingInst,
            target.x,
            target.y,
          );
          if (ok) {
            this.emit();
            return true;
          }
        }

        // 4. Standard stack merge
        src.cardIds.splice(cmd.startCardIndex);
        if (src.cardIds.length === 0) {
          delete board.stacks[src.stackId];
        }
        syncStackJob(this.run, region, src.stackId);

        target.cardIds.push(...movingIds);
        target.z = board.nextZ++;
        syncStackJob(this.run, region, target.stackId);
        this.emit();
        return true;
      }

      // Split suffix into a new stack at (gx, gy)
      src.cardIds.splice(cmd.startCardIndex);
      syncStackJob(this.run, region, src.stackId);

      const newStackId = `stk_${this.run.nextStackNum++}`;
      board.stacks[newStackId] = {
        stackId: newStackId,
        region,
        x: gx,
        y: gy,
        z: board.nextZ++,
        cardIds: movingIds,
      };
      syncStackJob(this.run, region, newStackId);
      this.emit();
      return true;
    }

    if (cmd.type === 'SELL_STACK') {
      const stack = board.stacks[cmd.stackId];
      if (!stack || stack.lockedByEncounterId) return false;
      const startIdx = cmd.startCardIndex ?? 0;
      const candidateIds = stack.cardIds.slice(startIdx);
      if (candidateIds.length === 0) return false;

      let totalCoins = 0;
      const soldIds: string[] = [];
      for (const cid of candidateIds) {
        const inst = this.run.instances[cid];
        if (!inst) continue;
        const def = CARD_MAP[inst.defId];
        if (!def || def.value <= 0 || def.category === 'currency') continue;
        let cardVal = def.value;
        if (inst.storedCount > 0 && inst.storedDefId) {
          const sDef = CARD_MAP[inst.storedDefId];
          cardVal += inst.storedCount * Math.max(1, sDef?.value ?? 1);
        }
        totalCoins += cardVal;
        soldIds.push(cid);
      }

      if (soldIds.length === 0) return false;
      const sx = stack.x;
      const sy = stack.y;
      for (const cid of soldIds) {
        destroyInstance(this.run, cid);
      }

      const currencyId = region === 'island' ? 'shell' : 'gold';
      for (let i = 0; i < totalCoins; i++) {
        spawnCardInstance(this.run, this.profile, currencyId, region, sx + 40, sy + 20, true);
      }
      this.run.stats.cardsSold += soldIds.length;
      pushEvent(this.run, `出售了 ${soldIds.length} 张卡牌，获得 ${totalCoins} ${currencyId === 'shell' ? '贝壳' : '金币'}。`);
      this.emit();
      return true;
    }

    if (cmd.type === 'BUY_PACK') {
      const pack = BOOSTER_PACKS.find((p) => p.id === cmd.packId);
      if (!pack) return false;
      if (!isPackUnlocked(this.run, this.profile, pack.id)) return false;
      if (!deductCurrency(this.run, region, pack.currencyCardId, pack.cost)) return false;

      const baseX = cmd.x ?? 260;
      const baseY = cmd.y ?? 320;
      for (let i = 0; i < pack.slots.length; i++) {
        const slot = pack.slots[i]!;
        // Guarantee boost for undiscovered ideas
        const undiscoveredPool = slot.pool.filter((item) => {
          const def = CARD_MAP[item.cardId];
          return (
            def &&
            (def.category === 'blueprint' || def.category === 'rumor') &&
            !this.profile.discoveredIdeas.includes(item.cardId)
          );
        });
        const chosenPool =
          undiscoveredPool.length > 0 && nextRandom(this.run) < 0.65 ? undiscoveredPool : slot.pool;
        const drop = pickWeighted(this.run, chosenPool);
        spawnCardInstance(
          this.run,
          this.profile,
          drop.cardId,
          region,
          baseX + i * 115,
          baseY + (i % 2) * 18,
          false,
        );
      }

      this.run.stats.packsOpened += 1;
      this.run.stats.packsOpenedById[pack.id] = (this.run.stats.packsOpenedById[pack.id] ?? 0) + 1;
      pushEvent(this.run, `开启卡包「${pack.nameZh}」，获得 ${pack.slots.length} 张卡牌。`);
      evaluateQuests(this.run, this.profile);
      this.emit();
      return true;
    }

    if (cmd.type === 'SWITCH_REGION') {
      if (!this.run.unlockedRegions.includes(cmd.region)) return false;
      this.run.activeRegion = cmd.region;
      this.emit();
      return true;
    }

    if (cmd.type === 'TRAVEL_BOAT') {
      const stack = board.stacks[cmd.boatStackId];
      if (!stack || stack.lockedByEncounterId) return false;
      const boatId = stack.cardIds.find((cid) => CARD_MAP[this.run.instances[cid]?.defId ?? '']?.category === 'boat');
      if (!boatId) return false;
      const boatInst = this.run.instances[boatId]!;
      const boatDef = CARD_MAP[boatInst.defId]!;
      const maxCargo = (boatDef.travelMaxUnits ?? 2) + 1; // +1 includes boat itself
      const movingIds = stack.cardIds.slice(0, maxCargo);
      const hasPassenger = movingIds.some(
        (cid) => CARD_MAP[this.run.instances[cid]?.defId ?? '']?.category === 'villager',
      );
      if (!hasPassenger) {
        pushEvent(this.run, '船只远航至少需要将 1 名村民叠放在船上！');
        this.emit();
        return false;
      }

      const dest: RegionId = cmd.targetRegion;
      if (!this.run.unlockedRegions.includes(dest)) {
        this.run.unlockedRegions.push(dest);
        // Spawn starter island cards on first visit
        if (dest === 'island' && Object.keys(this.run.boards.island.stacks).length === 0) {
          spawnCardInstance(this.run, this.profile, 'driftwood', 'island', 320, 220, false);
          spawnCardInstance(this.run, this.profile, 'banana_tree', 'island', 480, 220, false);
          spawnCardInstance(this.run, this.profile, 'fishing_spot', 'island', 640, 220, false);
          spawnCardInstance(this.run, this.profile, 'shell', 'island', 320, 380, true);
          spawnCardInstance(this.run, this.profile, 'shell', 'island', 320, 380, true);
          spawnCardInstance(this.run, this.profile, 'shell', 'island', 320, 380, true);
        }
      }

      // Atomic transfer from current board to destination board
      for (const cid of movingIds) {
        removeCardFromItsStack(this.run, region, cid);
        const inst = this.run.instances[cid]!;
        inst.region = dest;
        for (const eqId of Object.values(inst.equipment)) {
          if (eqId && this.run.instances[eqId]) {
            this.run.instances[eqId]!.region = dest;
          }
        }
      }

      const destBoard = this.run.boards[dest];
      const destStackId = `stk_${this.run.nextStackNum++}`;
      destBoard.stacks[destStackId] = {
        stackId: destStackId,
        region: dest,
        x: 180,
        y: 240,
        z: destBoard.nextZ++,
        cardIds: movingIds,
      };
      this.run.activeRegion = dest;
      pushEvent(this.run, `乘坐 ${boatDef.nameZh} 抵达 ${dest === 'island' ? '海岛' : '大陆'}！`);
      evaluateQuests(this.run, this.profile);
      this.emit();
      return true;
    }

    if (cmd.type === 'ENTER_PORTAL') {
      const stack = board.stacks[cmd.portalStackId];
      if (!stack || stack.lockedByEncounterId) return false;
      const fighterIds = stack.cardIds.filter((cid) => {
        const inst = this.run.instances[cid];
        return inst && CARD_MAP[inst.defId]?.category === 'villager' && inst.defId !== 'kid';
      });
      if (fighterIds.length === 0) {
        pushEvent(this.run, '请先将至少 1 名成年村民叠放到传送门上再进入黑暗森林！');
        this.emit();
        return false;
      }

      if (!this.run.unlockedRegions.includes('forest')) {
        this.run.unlockedRegions.push('forest');
      }

      for (const cid of fighterIds) {
        removeCardFromItsStack(this.run, region, cid);
        const inst = this.run.instances[cid]!;
        inst.region = 'forest';
        for (const eqId of Object.values(inst.equipment)) {
          if (eqId && this.run.instances[eqId]) {
            this.run.instances[eqId]!.region = 'forest';
          }
        }
      }

      const fBoard = this.run.boards.forest;
      const fStackId = `stk_${this.run.nextStackNum++}`;
      fBoard.stacks[fStackId] = {
        stackId: fStackId,
        region: 'forest',
        x: 220,
        y: 240,
        z: fBoard.nextZ++,
        cardIds: fighterIds,
      };
      this.run.activeRegion = 'forest';
      this.run.forestWave = 1;
      spawnForestWave(this.run, this.profile, 1);
      evaluateQuests(this.run, this.profile);
      this.emit();
      return true;
    }

    if (cmd.type === 'RETREAT_FOREST') {
      if (this.run.activeRegion !== 'forest') return false;
      const fBoard = this.run.boards.forest;
      const returnIds: string[] = [];
      for (const stack of Object.values(fBoard.stacks)) {
        for (const cid of [...stack.cardIds]) {
          const inst = this.run.instances[cid];
          if (!inst) continue;
          const def = CARD_MAP[inst.defId]!;
          if (def.category === 'enemy') {
            destroyInstance(this.run, cid);
          } else {
            removeCardFromItsStack(this.run, 'forest', cid);
            inst.region = 'mainland';
            for (const eqId of Object.values(inst.equipment)) {
              if (eqId && this.run.instances[eqId]) {
                this.run.instances[eqId]!.region = 'mainland';
              }
            }
            returnIds.push(cid);
          }
        }
      }
      fBoard.encounters = {};
      fBoard.jobs = {};
      this.run.forestWave = 0;

      if (returnIds.length > 0) {
        const mBoard = this.run.boards.mainland;
        const mStackId = `stk_${this.run.nextStackNum++}`;
        mBoard.stacks[mStackId] = {
          stackId: mStackId,
          region: 'mainland',
          x: 280,
          y: 260,
          z: mBoard.nextZ++,
          cardIds: returnIds,
        };
      }
      this.run.activeRegion = 'mainland';
      pushEvent(this.run, '远征队已从黑暗森林返回大陆。');
      this.emit();
      return true;
    }

    if (cmd.type === 'UNEQUIP_ITEM') {
      const vInst = this.run.instances[cmd.villagerInstanceId];
      if (!vInst) return false;
      const eqId = vInst.equipment[cmd.slot];
      if (!eqId || !this.run.instances[eqId]) return false;
      delete vInst.equipment[cmd.slot];
      const eqInst = this.run.instances[eqId]!;
      delete eqInst.equippedOnInstanceId;
      if (cmd.slot === 'hand') {
        vInst.defId = 'villager';
      }
      const eff = getEffectiveVillagerStats(this.run, vInst);
      vInst.maxHp = eff.maxHp;
      vInst.hp = Math.min(vInst.maxHp, vInst.hp);

      const vBoard = this.run.boards[vInst.region];
      const stackId = `stk_${this.run.nextStackNum++}`;
      vBoard.stacks[stackId] = {
        stackId,
        region: vInst.region,
        x: 300,
        y: 300,
        z: vBoard.nextZ++,
        cardIds: [eqId],
      };
      this.emit();
      return true;
    }

    if (cmd.type === 'AUTO_ARRANGE_BOARD') {
      const stacks = Object.values(board.stacks).sort((a, b) => {
        const aDef = CARD_MAP[this.run.instances[a.cardIds[0]!]?.defId ?? ''];
        const bDef = CARD_MAP[this.run.instances[b.cardIds[0]!]?.defId ?? ''];
        return (aDef?.category ?? '').localeCompare(bDef?.category ?? '');
      });
      const cols = 6;
      stacks.forEach((stk, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        stk.x = 140 + col * 145;
        stk.y = 140 + row * 175;
        stk.z = idx + 1;
      });
      board.nextZ = stacks.length + 2;
      this.emit();
      return true;
    }

    return false;
  }
}
