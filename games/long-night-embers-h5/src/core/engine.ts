import {
  ADVENTURE_MAP,
  ARCANAS,
  ARCANA_MAP,
  BASELINE_ID,
  CHARACTERS,
  CHARACTER_MAP,
  CONTENT_VERSION,
  ENEMY_MAP,
  EVOLUTIONS,
  PASSIVES,
  PASSIVE_MAP,
  POWERUPS,
  POWERUP_MAP,
  RELICS,
  SECRET_SPELLS,
  STAGES,
  STAGE_MAP,
  SURVAROTS,
  SURVAROT_MAP,
  UNLOCKS,
  WEAPONS,
  WEAPON_MAP,
} from '../content/ledger.ts';
import type {
  ActiveModesConfig,
  AdventureProfileState,
  ChestRewardEntry,
  ChoiceOption,
  DerivedStats,
  EnemyInstance,
  EquippedWeaponState,
  EvolutionDefinition,
  GameCommand,
  PauseReason,
  PendingChestState,
  PendingChoiceState,
  PickupKind,
  ProfileState,
  RunState,
  SettlementState,
} from './types.ts';

export const SCHEMA_VERSION = 1;
export const TICKS_PER_SECOND = 60;
export const TICK_MS = 1000 / TICKS_PER_SECOND;
export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;
export const MAX_WEAPON_SLOTS = 6;
export const MAX_PASSIVE_SLOTS = 6;

export function nextRandom(run: RunState): number {
  let t = (run.rngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  run.rngState = t >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextVisualRandom(run: RunState): number {
  let t = (run.visualRngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  run.visualRngState = t >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 5;
  if (level < 20) return 5 + (level - 1) * 10;
  if (level === 20) return 600;
  if (level < 40) return 195 + (level - 20) * 13;
  if (level === 40) return 2400;
  return 455 + (level - 40) * 16;
}

export function createDefaultModes(): ActiveModesConfig {
  return {
    hyper: false,
    hurry: false,
    arcana: false,
    limitBreak: false,
    inverse: false,
    endless: false,
    randomEvents: false,
    survarots: false,
  };
}

export function createInitialAdventureState(adventureId: string): AdventureProfileState {
  return {
    adventureId,
    gold: 500,
    powerUpRanks: {},
    completedChapterIds: [],
    ascensionLevel: 0,
  };
}

export function createInitialProfile(slotId: 1 | 2 | 3 = 1): ProfileState {
  const defaultChars = CHARACTERS.filter((c) => c.unlockedByDefault && c.scope !== 'dlc_excluded').map(
    (c) => c.id,
  );
  const defaultStages = STAGES.filter((s) => s.unlockedByDefault && s.scope !== 'dlc_excluded').map(
    (s) => s.id,
  );
  const defaultWeapons = WEAPONS.filter(
    (w) => w.kind === 'base' && w.scope !== 'dlc_excluded',
  ).map((w) => w.id);
  const defaultPassives = PASSIVES.filter((p) => !p.stageOnly && p.scope !== 'dlc_excluded').map(
    (p) => p.id,
  );
  const defaultArcanas = ARCANAS.filter((a) => a.deck === 'arcana').map((a) => a.id);
  const defaultSurvarots = SURVAROTS.filter((s) => s.scope !== 'dlc_excluded').map((s) => s.id);

  return {
    schemaVersion: SCHEMA_VERSION,
    slotId,
    gold: 600,
    powerUpRanks: {},
    goldenEggsByCharacter: {},
    eggsEnabled: true,
    unlockedCharacterIds: ['torchguard_torren'],
    unlockedStageIds: defaultStages,
    unlockedWeaponIds: defaultWeapons,
    unlockedPassiveIds: defaultPassives,
    unlockedRelicIds: [],
    unlockedArcanaIds: defaultArcanas,
    unlockedSurvarotIds: defaultSurvarots,
    completedUnlockIds: [],
    redeemedSpellCodes: [],
    sealedItemIds: [],
    discoveredItemIds: [...defaultChars, 'whip', 'magic_wand', 'spinach', 'hollow_heart'],
    killedEnemyCounts: {},
    settledRunIds: [],
    adventures: {
      a_garlic_paradise: createInitialAdventureState('a_garlic_paradise'),
      world_of_light_and_dark: createInitialAdventureState('world_of_light_and_dark'),
    },
    stats: {
      totalRuns: 0,
      totalKills: 0,
      totalGoldEarned: 0,
      bestSurvivalSecondsByStage: {},
    },
    settings: {
      musicVolume: 0.5,
      sfxVolume: 0.7,
      userMuted: false,
      damageNumbers: true,
      screenFlash: true,
      lowFxMode: false,
      spoilerSafeCollection: true,
    },
  };
}

export function getPowerUpPurchaseCost(
  powerUpId: string,
  ranks: Record<string, number>,
): number {
  const def = POWERUP_MAP[powerUpId];
  if (!def) return Infinity;
  const currentRank = ranks[powerUpId] ?? 0;
  if (currentRank >= def.maxRank) return Infinity;
  const totalPurchasedRanks = Object.values(ranks).reduce((sum, r) => sum + r, 0);
  const nextRank = currentRank + 1;
  return Math.round(def.baseCost * nextRank * (1 + 0.1 * totalPurchasedRanks));
}

export function getTotalPowerUpRefund(ranks: Record<string, number>): number {
  const simRanks: Record<string, number> = {};
  let totalSpent = 0;
  for (const pw of POWERUPS) {
    const count = ranks[pw.id] ?? 0;
    for (let i = 0; i < count; i++) {
      const cost = getPowerUpPurchaseCost(pw.id, simRanks);
      totalSpent += cost;
      simRanks[pw.id] = (simRanks[pw.id] ?? 0) + 1;
    }
  }
  return totalSpent;
}

export function computeDerivedStats(run: RunState, profile: ProfileState): DerivedStats {
  const charDef = CHARACTER_MAP[run.characterId] ?? CHARACTER_MAP['torchguard_torren']!;
  const stageDef = STAGE_MAP[run.stageId] ?? STAGE_MAP['mad_forest']!;
  const advState = run.adventureId ? profile.adventures[run.adventureId] : undefined;
  const activePowerUpRanks = advState ? advState.powerUpRanks : profile.powerUpRanks;

  let maxHp = charDef.baseHp;
  let recovery = 0;
  let armor = 0;
  let moveSpeed = charDef.baseMoveSpeed + stageDef.moveSpeedBonus;
  let might = 1.0;
  let area = 1.0;
  let speed = 1.0;
  let duration = 1.0;
  let amount = 0;
  let cooldownOffset = 0;
  let luck = 1.0 + stageDef.luckBonus;
  let growth = 1.0;
  let greed = 1.0 + stageDef.goldBonus;
  let curse = 1.0;
  let magnet = 72;
  let revival = 0;
  let reroll = 0;
  let skip = 0;
  let banish = 0;

  const applyModifier = (
    mod: Partial<Record<string, number>> | undefined,
    multiplier = 1,
  ) => {
    if (!mod) return;
    if (mod.maxHp) maxHp += mod.maxHp * multiplier;
    if (mod.recovery) recovery += mod.recovery * multiplier;
    if (mod.armor) armor += mod.armor * multiplier;
    if (mod.moveSpeed) moveSpeed += mod.moveSpeed * multiplier;
    if (mod.might) might += mod.might * multiplier;
    if (mod.area) area += mod.area * multiplier;
    if (mod.speed) speed += mod.speed * multiplier;
    if (mod.duration) duration += mod.duration * multiplier;
    if (mod.amount) amount += Math.round(mod.amount * multiplier);
    if (mod.cooldown) cooldownOffset += mod.cooldown * multiplier;
    if (mod.luck) luck += mod.luck * multiplier;
    if (mod.growth) growth += mod.growth * multiplier;
    if (mod.greed) greed += mod.greed * multiplier;
    if (mod.curse) curse += mod.curse * multiplier;
    if (mod.magnet) magnet *= 1 + mod.magnet * multiplier;
    if (mod.revival) revival += Math.round(mod.revival * multiplier);
    if (mod.reroll) reroll += Math.round(mod.reroll * multiplier);
    if (mod.skip) skip += Math.round(mod.skip * multiplier);
    if (mod.banish) banish += Math.round(mod.banish * multiplier);
  };

  // 1. Character base bonuses & growth trait
  applyModifier(charDef.baseBonuses, 1);
  if (charDef.growthTrait) {
    const { stat, perLevel, everyNLevels = 1, maxCap } = charDef.growthTrait;
    const steps = Math.floor((run.player.level - 1) / Math.max(1, everyNLevels));
    let delta = steps * perLevel;
    if (maxCap !== undefined) {
      delta = perLevel >= 0 ? Math.min(maxCap, delta) : Math.max(maxCap, delta);
    }
    applyModifier({ [stat]: delta }, 1);
  }
  if (charDef.id === 'stormcaller_iona' && run.player.level <= 3) {
    const portaBonus = (4 - run.player.level) * -0.3;
    cooldownOffset += portaBonus;
  }
  if (charDef.id === 'vowkeeper_oswin' && run.player.level >= 33) {
    revival += 1;
  }

  // 2. Meta PowerUps (isolated between main profile and Adventure)
  for (const [pwId, rank] of Object.entries(activePowerUpRanks)) {
    if (rank <= 0) continue;
    const pwDef = POWERUP_MAP[pwId];
    if (!pwDef) continue;
    applyModifier(pwDef.perRankBonuses, rank);
  }

  // 3. Adventure Ascension bonuses (only when inside Adventure)
  if (advState && run.adventureId) {
    const advDef = ADVENTURE_MAP[run.adventureId];
    if (advDef && advState.ascensionLevel > 0) {
      applyModifier(advDef.ascensionBonusPerLevel, advState.ascensionLevel);
    }
  }

  // 4. Golden Eggs (only outside Adventures and when enabled)
  if (!run.adventureId && profile.eggsEnabled) {
    const eggs = profile.goldenEggsByCharacter[run.characterId] ?? 0;
    if (eggs > 0) {
      maxHp += eggs * 2;
      might += eggs * 0.01;
      moveSpeed += eggs * 0.005;
      luck += eggs * 0.01;
      greed += eggs * 0.01;
    }
  }

  // 5. Equipped Passives
  for (const eq of run.passives) {
    const pDef = PASSIVE_MAP[eq.passiveId];
    if (!pDef) continue;
    if (pDef.id === 'torronas_box') {
      const effectiveStatLevels = Math.min(8, eq.level);
      applyModifier(pDef.perLevelBonuses, effectiveStatLevels);
      if (eq.level >= 9 && pDef.finalLevelCurseBonus) {
        curse += pDef.finalLevelCurseBonus;
      }
    } else {
      applyModifier(pDef.perLevelBonuses, eq.level);
    }
  }

  // 6. Mode modifiers
  if (run.modes.hyper) {
    moveSpeed += 0.25;
    greed += 0.5;
    luck += 0.1;
  }
  if (run.modes.hurry) {
    greed += 0.25;
  }
  if (run.modes.inverse) {
    greed += 2.0;
    luck += 0.2;
  }

  // 7. Arcanas & Darkanas
  for (const arcId of run.arcanas) {
    const arcDef = ARCANA_MAP[arcId];
    if (!arcDef) continue;
    applyModifier(arcDef.statBonuses, 1);
    if (arcDef.triggerKind === 'empty_slot_bonus') {
      const regularWeapons = run.weapons.filter((w) => !w.isExtraSlot).length;
      const emptySlots = Math.max(0, MAX_WEAPON_SLOTS - regularWeapons);
      might += emptySlots * 0.2;
      cooldownOffset -= emptySlots * 0.08;
    }
    if (arcDef.triggerKind === 'revive_bonus' && run.player.revivalsUsed > 0) {
      might += run.player.revivalsUsed * 0.1;
      area += run.player.revivalsUsed * 0.1;
      armor += run.player.revivalsUsed;
      maxHp += run.player.revivalsUsed * 15;
    }
  }

  // 8. Survarots (1.15 base game tarot system)
  for (const survId of run.survarots) {
    const survDef = SURVAROT_MAP[survId];
    if (!survDef) continue;
    applyModifier(survDef.statBonuses, 1);
  }

  // Temporary XP surge at lv20 / lv40 walls
  if (run.player.level === 20 || run.player.level === 40) {
    growth += 1.0;
  }

  const cooldownMultiplier = Math.max(0.15, Math.min(2.0, 1 + cooldownOffset));

  return {
    maxHp: Math.max(1, Math.round(maxHp)),
    recovery: Math.max(0, recovery),
    armor: Math.max(0, armor),
    moveSpeed: Math.max(0.3, moveSpeed),
    might: Math.max(0.2, might),
    area: Math.max(0.3, area),
    speed: Math.max(0.3, speed),
    duration: Math.max(0.3, duration),
    amount: Math.max(0, amount),
    cooldownMultiplier,
    luck: Math.max(0.1, luck),
    growth: Math.max(0.2, growth),
    greed: Math.max(0.2, greed),
    curse: Math.max(0.5, curse),
    magnet: Math.max(24, magnet),
    revival: Math.max(0, revival),
    reroll: Math.max(0, reroll),
    skip: Math.max(0, skip),
    banish: Math.max(0, banish),
  };
}

export function segmentIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-6) {
    const distSq = (cx - x1) * (cx - x1) + (cy - y1) * (cy - y1);
    return distSq <= r * r;
  }
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distSq = (cx - closestX) * (cx - closestX) + (cy - closestY) * (cy - closestY);
  return distSq <= r * r;
}

export function registerItemDiscovery(profile: ProfileState, itemId: string): void {
  if (!profile.discoveredItemIds.includes(itemId)) {
    profile.discoveredItemIds.push(itemId);
  }
}

export type CreateRunOptions = {
  seed?: number;
  characterId?: string;
  stageId?: string;
  modes?: Partial<ActiveModesConfig>;
  adventureId?: string | null;
  adventureChapterId?: string | null;
};

export function createInitialRun(
  slotId: 1 | 2 | 3 = 1,
  options: CreateRunOptions = {},
  profile: ProfileState = createInitialProfile(slotId),
): RunState {
  const adventureId = options.adventureId ?? null;
  const adventureDef = adventureId ? ADVENTURE_MAP[adventureId] : undefined;
  const adventureChapter =
    adventureDef && options.adventureChapterId
      ? adventureDef.chapters.find((c) => c.chapterId === options.adventureChapterId)
      : adventureDef?.chapters[0];

  const characterId =
    options.characterId && CHARACTER_MAP[options.characterId]?.scope !== 'dlc_excluded'
      ? options.characterId
      : adventureDef
        ? adventureDef.allowedCharacterIds[0] ?? 'herbwise_bode'
        : 'torchguard_torren';

  const stageId =
    adventureChapter?.stageId ??
    (options.stageId && STAGE_MAP[options.stageId]?.scope !== 'dlc_excluded'
      ? options.stageId
      : 'mad_forest');

  const charDef = CHARACTER_MAP[characterId] ?? CHARACTER_MAP['torchguard_torren']!;
  const stageDef = STAGE_MAP[stageId] ?? STAGE_MAP['mad_forest']!;
  const modes: ActiveModesConfig = {
    ...createDefaultModes(),
    ...options.modes,
  };

  const seed = (options.seed ?? 0x12345678) >>> 0;
  const startingWeapons: EquippedWeaponState[] = [
    {
      weaponId: charDef.startingWeaponId,
      level: 1,
      cooldownRemaining: 10,
      totalDamageDealt: 0,
      kills: 0,
      limitBreakLevels: 0,
      limitBreakMightBonus: 0,
      limitBreakAreaBonus: 0,
    },
  ];

  // 布鲁娜初始同时持有战斧与银隼
  if (charDef.id === 'cleaver_bruna') {
    startingWeapons.push({
      weaponId: 'eight_sparrow',
      level: 1,
      cooldownRemaining: 15,
      totalDamageDealt: 0,
      kills: 0,
      limitBreakLevels: 0,
      limitBreakMightBonus: 0,
      limitBreakAreaBonus: 0,
    });
  }

  const run: RunState = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    baselineId: BASELINE_ID,
    slotId,
    saveSeq: 1,
    runId: `run_${seed.toString(16)}_${slotId}`,
    rngState: seed === 0 ? 1 : seed,
    visualRngState: (seed ^ 0x9e3779b9) >>> 0,
    adventureId,
    adventureChapterId: adventureChapter?.chapterId ?? null,
    characterId: charDef.id,
    stageId: stageDef.id,
    modes,
    phase: 'combat',
    tick: 0,
    stageClockTicks: 0,
    player: {
      x: 0,
      y: 0,
      facingX: 1,
      facingY: 0,
      moveInputX: 0,
      moveInputY: 0,
      hp: charDef.baseHp,
      maxHp: charDef.baseHp,
      xp: 0,
      xpToNext: xpRequiredForLevel(1),
      level: 1,
      pendingLevels: 0,
      invulnerableTicks: 0,
      laurelCharges: charDef.startingWeaponId === 'laurel' ? 1 : 0,
      laurelCooldownTicks: 0,
      revivalsUsed: 0,
      rerollsRemaining: 0,
      skipsRemaining: 0,
      banishesRemaining: 0,
      distanceMovedAccum: 0,
      recoveryAccum: 0,
    },
    weapons: startingWeapons,
    passives: [],
    arcanas: [],
    survarots: [],
    banishedIds: [],
    enemies: {},
    projectiles: {},
    hazardZones: {},
    pickups: {},
    damageTexts: [],
    spawnedBossWaveMinutes: [],
    spawnedGroundItemIds: [],
    globalFreezeTicks: 0,
    goldFeverTicks: 0,
    randomEventCooldownTicks: 60 * TICKS_PER_SECOND,
    lastRandomEventLabelZh: null,
    pendingChoice: null,
    pendingChest: null,
    settlement: null,
    nextEntitySeq: 1,
    godMode: false,
    stats: {
      kills: 0,
      goldCollected: 0,
      damageDealtTotal: 0,
      damageTakenTotal: 0,
      chestsOpened: 0,
      evolutionsCompleted: [],
      killsByEnemy: {},
    },
  };

  for (const w of startingWeapons) {
    registerItemDiscovery(profile, w.weaponId);
  }
  registerItemDiscovery(profile, charDef.id);

  const derived = computeDerivedStats(run, profile);
  run.player.maxHp = derived.maxHp;
  run.player.hp = derived.maxHp;
  run.player.rerollsRemaining = derived.reroll;
  run.player.skipsRemaining = derived.skip;
  run.player.banishesRemaining = derived.banish;

  // Spawn stage ground items (passives & relics)
  const hasYellowSign = profile.unlockedRelicIds.includes('yellow_sign');
  for (const gi of stageDef.groundItems) {
    if (gi.requiresYellowSign && !hasYellowSign) continue;
    if (gi.kind === 'relic' && profile.unlockedRelicIds.includes(gi.targetId)) continue;
    const pickupId = `pk_stage_${gi.id}`;
    run.pickups[pickupId] = {
      pickupId,
      kind: gi.kind === 'relic' ? 'relic' : 'stage_passive',
      x: gi.x,
      y: gi.y,
      value: 1,
      targetId: gi.targetId,
      attracted: false,
      spawnMinute: 0,
    };
    run.spawnedGroundItemIds.push(gi.id);
  }

  return run;
}

export function getRegularWeaponSlotCount(run: RunState): number {
  return run.weapons.filter((w) => !w.isExtraSlot).length;
}

export function getRegularPassiveSlotCount(run: RunState): number {
  return run.passives.filter((p) => !p.fromStageFloor).length;
}

export function buildLevelUpChoices(
  run: RunState,
  profile: ProfileState,
  optionCount = 4,
): PendingChoiceState {
  const candidates: Array<{ option: ChoiceOption; weight: number }> = [];
  const sealedSet = new Set(profile.sealedItemIds);
  const banishedSet = new Set(run.banishedIds);
  const advDef = run.adventureId ? ADVENTURE_MAP[run.adventureId] : undefined;
  const allowedAdvWeapons = advDef ? new Set(advDef.allowedWeaponIds) : null;

  const regularWeaponsCount = getRegularWeaponSlotCount(run);
  const regularPassivesCount = getRegularPassiveSlotCount(run);

  // 1. Existing weapons that can still level up
  for (const eqW of run.weapons) {
    const wDef = WEAPON_MAP[eqW.weaponId];
    if (!wDef || eqW.level >= wDef.maxLevel) continue;
    if (banishedSet.has(wDef.id) || sealedSet.has(wDef.id)) continue;
    candidates.push({
      weight: Math.max(10, wDef.rarityWeight * 1.6),
      option: {
        optionId: `opt_w_up_${wDef.id}_${eqW.level + 1}`,
        kind: 'weapon_upgrade',
        targetId: wDef.id,
        titleZh: `${wDef.nameZh} Lv.${eqW.level + 1}`,
        subtitleZh: `升级武器：伤害 +${wDef.damagePerLevel}（${wDef.description}）`,
        nextLevel: eqW.level + 1,
        isNew: false,
      },
    });
  }

  // 2. Existing passives that can still level up (including floor passives!)
  for (const eqP of run.passives) {
    const pDef = PASSIVE_MAP[eqP.passiveId];
    if (!pDef || eqP.level >= pDef.maxLevel) continue;
    if (banishedSet.has(pDef.id) || sealedSet.has(pDef.id)) continue;
    candidates.push({
      weight: Math.max(10, pDef.rarityWeight * 1.5),
      option: {
        optionId: `opt_p_up_${pDef.id}_${eqP.level + 1}`,
        kind: 'passive_upgrade',
        targetId: pDef.id,
        titleZh: `${pDef.nameZh} Lv.${eqP.level + 1}`,
        subtitleZh: `升级被动：${pDef.description}`,
        nextLevel: eqP.level + 1,
        isNew: false,
      },
    });
  }

  // 3. New base weapons if regular weapon slots < MAX_WEAPON_SLOTS
  if (regularWeaponsCount < MAX_WEAPON_SLOTS) {
    const ownedWeaponIds = new Set(run.weapons.map((w) => w.weaponId));
    for (const wDef of WEAPONS) {
      if (wDef.kind !== 'base' || wDef.scope === 'dlc_excluded') continue;
      if (ownedWeaponIds.has(wDef.id)) continue;
      if (banishedSet.has(wDef.id) || sealedSet.has(wDef.id)) continue;
      if (!profile.unlockedWeaponIds.includes(wDef.id)) continue;
      if (allowedAdvWeapons && !allowedAdvWeapons.has(wDef.id)) continue;
      candidates.push({
        weight: Math.max(5, wDef.rarityWeight),
        option: {
          optionId: `opt_w_new_${wDef.id}`,
          kind: 'weapon_new',
          targetId: wDef.id,
          titleZh: `${wDef.nameZh}（新武器）`,
          subtitleZh: wDef.description,
          nextLevel: 1,
          isNew: true,
        },
      });
    }
  }

  // 4. New passives if regular passive slots < MAX_PASSIVE_SLOTS
  if (regularPassivesCount < MAX_PASSIVE_SLOTS) {
    const ownedPassiveIds = new Set(run.passives.map((p) => p.passiveId));
    for (const pDef of PASSIVES) {
      if (pDef.stageOnly || pDef.scope === 'dlc_excluded') continue;
      if (ownedPassiveIds.has(pDef.id)) continue;
      if (banishedSet.has(pDef.id) || sealedSet.has(pDef.id)) continue;
      if (!profile.unlockedPassiveIds.includes(pDef.id)) continue;
      candidates.push({
        weight: Math.max(5, pDef.rarityWeight),
        option: {
          optionId: `opt_p_new_${pDef.id}`,
          kind: 'passive_new',
          targetId: pDef.id,
          titleZh: `${pDef.nameZh}（新被动）`,
          subtitleZh: pDef.description,
          nextLevel: 1,
          isNew: true,
        },
      });
    }
  }

  const chosen: ChoiceOption[] = [];
  const pool = [...candidates];
  while (chosen.length < optionCount && pool.length > 0) {
    const totalWeight = pool.reduce((sum, c) => sum + c.weight, 0);
    let roll = nextRandom(run) * totalWeight;
    let pickedIdx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]!.weight;
      if (roll <= 0) {
        pickedIdx = i;
        break;
      }
    }
    const [picked] = pool.splice(pickedIdx, 1);
    if (picked) chosen.push(picked.option);
  }

  // 5. If no normal upgrades remain: Limit Break or fallback Gold Bag + Roast Chicken
  if (chosen.length === 0) {
    if (run.modes.limitBreak && run.weapons.length > 0) {
      for (const eqW of run.weapons.slice(0, optionCount)) {
        const wDef = WEAPON_MAP[eqW.weaponId];
        if (!wDef) continue;
        chosen.push({
          optionId: `opt_lb_${wDef.id}_${eqW.limitBreakLevels + 1}`,
          kind: 'limit_break',
          targetId: wDef.id,
          titleZh: `${wDef.nameZh} 极限突破 +${eqW.limitBreakLevels + 1}`,
          subtitleZh: '突破等级上限：伤害力量 +12%，攻击范围 +8%',
          nextLevel: eqW.limitBreakLevels + 1,
        });
      }
    }
    if (chosen.length === 0) {
      chosen.push(
        {
          optionId: 'opt_fallback_gold',
          kind: 'gold_bag',
          targetId: 'gold_bag',
          titleZh: '大钱袋（+25 金币）',
          subtitleZh: '所有装备槽位已满级，领取金币奖励',
        },
        {
          optionId: 'opt_fallback_chicken',
          kind: 'floor_chicken',
          targetId: 'roast_chicken',
          titleZh: '烤鸡（恢复 30 生命）',
          subtitleZh: '所有装备槽位已满级，恢复角色生命值',
        },
      );
    }
  }

  return {
    choiceId: `choice_${run.tick}_${run.nextEntitySeq++}`,
    source: 'level_up',
    options: chosen,
  };
}

export function buildArcanaDraftChoices(
  run: RunState,
  profile: ProfileState,
): PendingChoiceState | null {
  const hasDarkasso = profile.unlockedRelicIds.includes('darkasso');
  const pool = ARCANAS.filter((a) => {
    if (run.arcanas.includes(a.id)) return false;
    if (a.deck === 'darkana' && !hasDarkasso) return false;
    return true;
  });
  if (pool.length === 0) return null;

  const copy = [...pool];
  const options: ChoiceOption[] = [];
  while (options.length < 4 && copy.length > 0) {
    const idx = Math.floor(nextRandom(run) * copy.length);
    const [picked] = copy.splice(idx, 1);
    if (picked) {
      options.push({
        optionId: `opt_arc_${picked.id}`,
        kind: 'arcana_pick',
        targetId: picked.id,
        titleZh: picked.nameZh,
        subtitleZh: picked.description,
      });
    }
  }
  return {
    choiceId: `choice_arcana_${run.tick}_${run.nextEntitySeq++}`,
    source: 'arcana_draft',
    options,
  };
}

export function buildSurvarotDraftChoices(run: RunState): PendingChoiceState | null {
  const pool = SURVAROTS.filter(
    (s) => s.scope !== 'dlc_excluded' && !run.survarots.includes(s.id),
  );
  if (pool.length === 0) return null;

  const copy = [...pool];
  const options: ChoiceOption[] = [];
  while (options.length < 3 && copy.length > 0) {
    const idx = Math.floor(nextRandom(run) * copy.length);
    const [picked] = copy.splice(idx, 1);
    if (picked) {
      options.push({
        optionId: `opt_surv_${picked.id}`,
        kind: 'survarot_pick',
        targetId: picked.id,
        titleZh: picked.nameZh,
        subtitleZh: picked.description,
      });
    }
  }
  return {
    choiceId: `choice_survarot_${run.tick}_${run.nextEntitySeq++}`,
    source: 'survarot_draft',
    options,
  };
}

export function findEligibleEvolutions(
  run: RunState,
  canEvolveChest = true,
  currentMinute?: number,
): EvolutionDefinition[] {
  if (!canEvolveChest) return [];
  const elapsedMinutes = currentMinute ?? Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND));
  const ownedWeaponIds = new Set(run.weapons.map((w) => w.weaponId));

  return EVOLUTIONS.filter((evo) => {
    if (ownedWeaponIds.has(evo.outputWeaponId)) return false;
    // Allow evolution if chest spawned at >= minMinute OR stage is Moongolow / bonus stage
    const stageDef = STAGE_MAP[run.stageId];
    const minMinuteRequired = stageDef?.stageType === 'bonus' ? 0 : evo.minMinute;
    if (elapsedMinutes < minMinuteRequired) return false;

    for (const inp of evo.inputs) {
      const eqW = run.weapons.find((w) => w.weaponId === inp.weaponId);
      if (!eqW || eqW.level < inp.minLevel) return false;
    }
    for (const reqP of evo.requiredPassives) {
      const eqP = run.passives.find((p) => p.passiveId === reqP.passiveId);
      if (!eqP || eqP.level < reqP.minLevel) return false;
    }
    return true;
  });
}

export function openChest(
  run: RunState,
  profile: ProfileState,
  canEvolve = true,
  spawnMinute = 10,
): PendingChestState {
  const derived = computeDerivedStats(run, profile);
  const tierRoll = nextRandom(run) * derived.luck;
  const tier: 1 | 3 | 5 = tierRoll > 1.85 ? 5 : tierRoll > 1.25 ? 3 : 1;
  const rewards: ChestRewardEntry[] = [];

  const eligibleEvos = findEligibleEvolutions(
    run,
    canEvolve,
    Math.max(spawnMinute, Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND))),
  );

  for (let slot = 0; slot < tier; slot++) {
    if (slot === 0 && eligibleEvos.length > 0) {
      const evo = eligibleEvos[0]!;
      const outWeapon = WEAPON_MAP[evo.outputWeaponId]!;
      rewards.push({
        kind: 'evolution',
        targetId: outWeapon.id,
        evolutionId: evo.id,
        titleZh: `★ 超武进化：${outWeapon.nameZh}`,
        subtitleZh: evo.description,
      });
      continue;
    }

    // Upgrade existing non-maxed weapons or passives
    const upgradableWeapons = run.weapons.filter((w) => {
      const def = WEAPON_MAP[w.weaponId];
      // Do not upgrade weapon already being evolved in slot 0
      if (
        rewards.some(
          (r) =>
            r.kind === 'evolution' &&
            EVOLUTIONS.find((e) => e.id === r.evolutionId)?.inputs.some(
              (inp) => inp.weaponId === w.weaponId,
            ),
        )
      ) {
        return false;
      }
      return def && w.level < def.maxLevel;
    });
    const upgradablePassives = run.passives.filter((p) => {
      const def = PASSIVE_MAP[p.passiveId];
      return def && p.level < def.maxLevel;
    });

    if (upgradableWeapons.length > 0 || upgradablePassives.length > 0) {
      const totalItems = upgradableWeapons.length + upgradablePassives.length;
      const pick = Math.floor(nextRandom(run) * totalItems);
      if (pick < upgradableWeapons.length) {
        const w = upgradableWeapons[pick]!;
        const wDef = WEAPON_MAP[w.weaponId]!;
        rewards.push({
          kind: 'weapon_upgrade',
          targetId: w.weaponId,
          titleZh: `${wDef.nameZh} 升阶`,
          subtitleZh: wDef.description,
        });
      } else {
        const p = upgradablePassives[pick - upgradableWeapons.length]!;
        const pDef = PASSIVE_MAP[p.passiveId]!;
        rewards.push({
          kind: 'passive_upgrade',
          targetId: p.passiveId,
          titleZh: `${pDef.nameZh} 升阶`,
          subtitleZh: pDef.description,
        });
      }
    } else {
      rewards.push({
        kind: 'gold',
        targetId: 'gold_bag',
        titleZh: '黄金钱袋',
        subtitleZh: '额外金币奖励',
      });
    }
  }

  const baseGold = tier === 5 ? 250 : tier === 3 ? 120 : 50;
  const goldAwarded = Math.round(baseGold * derived.greed);

  const chestState: PendingChestState = {
    chestId: `chest_${run.tick}_${run.nextEntitySeq++}`,
    tier,
    rewards,
    goldAwarded,
    animationSkipped: false,
    committed: false,
  };

  commitChestRewards(run, profile, chestState);
  return chestState;
}

export function commitChestRewards(
  run: RunState,
  profile: ProfileState,
  chest: PendingChestState,
): void {
  if (chest.committed) return;
  chest.committed = true;
  run.stats.chestsOpened += 1;
  run.stats.goldCollected += chest.goldAwarded;

  for (const r of chest.rewards) {
    if (r.kind === 'evolution' && r.evolutionId) {
      const evo = EVOLUTIONS.find((e) => e.id === r.evolutionId);
      if (!evo) continue;
      if (evo.replacesInputs) {
        const inputIds = new Set(evo.inputs.map((i) => i.weaponId));
        run.weapons = run.weapons.filter((w) => !inputIds.has(w.weaponId));
      }
      if (evo.consumesPassives) {
        const reqIds = new Set(evo.requiredPassives.map((p) => p.passiveId));
        run.passives = run.passives.filter((p) => !reqIds.has(p.passiveId));
      }
      if (!run.weapons.some((w) => w.weaponId === evo.outputWeaponId)) {
        run.weapons.push({
          weaponId: evo.outputWeaponId,
          level: 1,
          cooldownRemaining: 5,
          totalDamageDealt: 0,
          kills: 0,
          limitBreakLevels: 0,
          limitBreakMightBonus: 0,
          limitBreakAreaBonus: 0,
          isExtraSlot: evo.kind === 'gift',
        });
      }
      if (!run.stats.evolutionsCompleted.includes(evo.outputWeaponId)) {
        run.stats.evolutionsCompleted.push(evo.outputWeaponId);
      }
      registerItemDiscovery(profile, evo.outputWeaponId);
    } else if (r.kind === 'weapon_upgrade') {
      const eqW = run.weapons.find((w) => w.weaponId === r.targetId);
      const wDef = WEAPON_MAP[r.targetId];
      if (eqW && wDef && eqW.level < wDef.maxLevel) {
        eqW.level += 1;
      }
    } else if (r.kind === 'passive_upgrade') {
      const eqP = run.passives.find((p) => p.passiveId === r.targetId);
      const pDef = PASSIVE_MAP[r.targetId];
      if (eqP && pDef && eqP.level < pDef.maxLevel) {
        eqP.level += 1;
      }
    } else if (r.kind === 'gold') {
      run.stats.goldCollected += 25;
    }
  }
}

export function spawnEnemyInstance(
  run: RunState,
  derived: DerivedStats,
  defId: string,
  overrideX?: number,
  overrideY?: number,
): EnemyInstance | null {
  const def = ENEMY_MAP[defId];
  if (!def) return null;

  const angle = nextRandom(run) * Math.PI * 2;
  const dist = 500 + nextRandom(run) * 90;
  let x = overrideX ?? run.player.x + Math.cos(angle) * dist;
  let y = overrideY ?? run.player.y + Math.sin(angle) * dist;

  const stageDef = STAGE_MAP[run.stageId];
  if (stageDef?.geometry === 'horizontal_corridor') {
    y = Math.max(-210, Math.min(210, y));
  } else if (stageDef?.geometry === 'vertical_tower') {
    x = Math.max(-280, Math.min(280, x));
  } else if (stageDef?.geometry === 'fixed_arena') {
    x = Math.max(-440, Math.min(440, x));
    y = Math.max(-360, Math.min(360, y));
  } else if (stageDef?.geometry === 'cart_track') {
    y = Math.max(-180, Math.min(180, y));
  }

  const inverseMult = run.modes.inverse ? 3.0 : 1.0;
  const curseMult = derived.curse;
  const rawHp = (def.maxHp + def.hpPerPlayerLevel * Math.max(0, run.player.level - 1)) * curseMult * inverseMult;
  const maxHp = Math.max(1, Math.round(rawHp));
  const moveSpeed = def.moveSpeed * (run.modes.hyper ? 1.25 : 1.0) * Math.min(1.8, 0.8 + 0.2 * curseMult);

  const instanceId = `en_${run.nextEntitySeq++}`;
  const vx = def.movePattern === 'swarm_line' ? (x > run.player.x ? -moveSpeed : moveSpeed) : 0;
  const vy = def.movePattern === 'swarm_line' ? (y > run.player.y ? -moveSpeed * 0.35 : moveSpeed * 0.35) : 0;

  const inst: EnemyInstance = {
    instanceId,
    defId: def.id,
    x,
    y,
    vx,
    vy,
    hp: maxHp,
    maxHp,
    contactDamage: def.contactDamage,
    moveSpeed,
    radius: def.radius,
    isBoss: def.isBoss,
    isReaper: def.isReaper,
    freezeTicks: 0,
    knockbackVx: 0,
    knockbackVy: 0,
    spawnTick: run.tick,
    phaseAngle: nextRandom(run) * Math.PI * 2,
  };
  run.enemies[instanceId] = inst;
  return inst;
}

function findNearestEnemy(run: RunState, fromX: number, fromY: number): EnemyInstance | null {
  let best: EnemyInstance | null = null;
  let bestDistSq = Infinity;
  for (const en of Object.values(run.enemies)) {
    if (en.hp <= 0) continue;
    const dx = en.x - fromX;
    const dy = en.y - fromY;
    const dSq = dx * dx + dy * dy;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = en;
    }
  }
  return best;
}

export function fireWeaponOnce(
  run: RunState,
  eqW: EquippedWeaponState,
  derived: DerivedStats,
): void {
  const def = WEAPON_MAP[eqW.weaponId];
  if (!def) return;

  if (def.behavior === 'laurel_shield') {
    const maxCharges = eqW.weaponId === 'crimson_shroud' ? 3 : Math.min(3, 1 + Math.floor(eqW.level / 3));
    if (run.player.laurelCharges < maxCharges) {
      run.player.laurelCharges += 1;
    }
    return;
  }

  const levelBonusCount =
    def.amountPerLevels && def.amountPerLevels > 0
      ? Math.floor((eqW.level - 1) / def.amountPerLevels)
      : 0;
  const totalProjectiles = Math.max(1, def.projectiles + levelBonusCount + derived.amount);
  const rawDamage =
    (def.baseDamage + def.damagePerLevel * (eqW.level - 1)) *
    (derived.might + eqW.limitBreakMightBonus);
  const damage = Math.max(1, Math.round(rawDamage));
  const radius = Math.max(4, def.areaRadius * (derived.area + eqW.limitBreakAreaBonus));
  const durationTicks = Math.max(6, Math.round(def.durationTicks * derived.duration));
  const speed = def.speed * derived.speed;

  const hasWaltzBounce =
    run.arcanas.includes('arcana_xi_waltz') &&
    ARCANA_MAP['arcana_xi_waltz']?.affectedWeapons.includes(def.id);
  const extraBounces = hasWaltzBounce ? 3 : def.behavior === 'bounce_tracer' || def.behavior === 'bounce_bone' ? 4 : 0;

  if (def.behavior === 'aura_pulse' || def.behavior === 'gaea_quake' || def.behavior === 'jubilee_light') {
    const zoneId = `hz_${run.nextEntitySeq++}`;
    run.hazardZones[zoneId] = {
      zoneId,
      weaponId: def.id,
      x: run.player.x,
      y: run.player.y,
      radius,
      damage,
      ticksRemaining: durationTicks,
      hitIntervalTicks: def.hitIntervalTicks,
      followPlayer: true,
      color: def.color,
      hitCooldownByEnemy: {},
    };
    return;
  }

  if (def.behavior === 'ground_pool') {
    for (let i = 0; i < totalProjectiles; i++) {
      const angle = (i / totalProjectiles) * Math.PI * 2 + nextRandom(run) * 0.6;
      const dist = 70 + nextRandom(run) * 90;
      const zoneId = `hz_${run.nextEntitySeq++}`;
      run.hazardZones[zoneId] = {
        zoneId,
        weaponId: def.id,
        x: run.player.x + Math.cos(angle) * dist,
        y: run.player.y + Math.sin(angle) * dist,
        radius,
        damage,
        ticksRemaining: durationTicks,
        hitIntervalTicks: def.hitIntervalTicks,
        followPlayer: def.id === 'la_borra',
        color: def.color,
        hitCooldownByEnemy: {},
      };
    }
    return;
  }

  if (def.behavior === 'screen_wipe') {
    for (const en of Object.values(run.enemies)) {
      if (en.isReaper) continue;
      en.hp = 0;
    }
    if (def.id === 'gorgeous_moon') {
      for (const pk of Object.values(run.pickups)) {
        if (pk.kind.startsWith('xp_') || pk.kind.startsWith('coin')) {
          pk.attracted = true;
        }
      }
    }
    return;
  }

  for (let i = 0; i < totalProjectiles; i++) {
    const projectileId = `pj_${run.nextEntitySeq++}`;
    let x = run.player.x;
    let y = run.player.y;
    let vx = 0;
    let vy = 0;
    let orbitAngle: number | undefined;
    let orbitDistance: number | undefined;
    let attackDirectionX: number | undefined;

    if (def.behavior === 'whip_horizontal' || def.behavior === 'omni_sword') {
      const dir = i % 2 === 0 ? Math.sign(run.player.facingX || 1) : -Math.sign(run.player.facingX || 1);
      attackDirectionX = dir;
      x = run.player.x + dir * radius;
      y = run.player.y - (i >> 1) * 18;
    } else if (def.behavior === 'scan_phaser') {
      attackDirectionX = Math.sign(run.player.facingX || 1);
      x = run.player.x + attackDirectionX * (16 + radius * 1.1);
      y = run.player.y + (i - (totalProjectiles - 1) / 2) * 12;
    } else if (def.behavior === 'nearest_bolt' || def.behavior === 'boomerang_cross') {
      const nearest = findNearestEnemy(run, run.player.x, run.player.y);
      const baseAngle = nearest
        ? Math.atan2(nearest.y - run.player.y, nearest.x - run.player.x)
        : Math.atan2(run.player.facingY, run.player.facingX);
      const spread = (i - (totalProjectiles - 1) / 2) * 0.14;
      vx = Math.cos(baseAngle + spread) * speed;
      vy = Math.sin(baseAngle + spread) * speed;
    } else if (def.behavior === 'facing_knife' || def.behavior === 'thrust_spear') {
      const baseAngle = Math.atan2(run.player.facingY, run.player.facingX);
      const spread = (i - (totalProjectiles - 1) / 2) * 0.1;
      vx = Math.cos(baseAngle + spread) * speed;
      vy = Math.sin(baseAngle + spread) * speed;
    } else if (def.behavior === 'lob_arc') {
      if (def.id === 'death_spiral') {
        const a = (i / totalProjectiles) * Math.PI * 2;
        vx = Math.cos(a) * speed;
        vy = Math.sin(a) * speed;
      } else {
        vx = (i - (totalProjectiles - 1) / 2) * 1.8 + (nextRandom(run) - 0.5) * 1.5;
        vy = -speed;
      }
    } else if (def.behavior === 'orbit_ring') {
      orbitAngle = (i / totalProjectiles) * Math.PI * 2;
      orbitDistance = radius;
      x = run.player.x + Math.cos(orbitAngle) * orbitDistance;
      y = run.player.y + Math.sin(orbitAngle) * orbitDistance;
    } else if (def.behavior === 'dual_diagonal') {
      const diagAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
      const a = diagAngles[i % diagAngles.length]! + Math.floor(i / 4) * 0.08;
      vx = Math.cos(a) * speed;
      vy = Math.sin(a) * speed;
    } else if (def.behavior === 'clock_freeze_ray') {
      const clockAngle = ((run.tick / 30 + i * 6) % 12) * ((Math.PI * 2) / 12);
      vx = Math.cos(clockAngle) * speed;
      vy = Math.sin(clockAngle) * speed;
    } else if (def.behavior === 'lightning_strike' || def.behavior === 'circle_bombard' || def.behavior === 'vertical_javelin') {
      const enemyList = Object.values(run.enemies);
      const target =
        enemyList.length > 0
          ? enemyList[Math.floor(nextRandom(run) * enemyList.length)]
          : null;
      if (target) {
        x = target.x;
        y = target.y;
      } else {
        const a = (i / totalProjectiles) * Math.PI * 2;
        x = run.player.x + Math.cos(a) * 110;
        y = run.player.y + Math.sin(a) * 110;
      }
    } else {
      const a = nextRandom(run) * Math.PI * 2;
      vx = Math.cos(a) * speed;
      vy = Math.sin(a) * speed;
    }

    run.projectiles[projectileId] = {
      projectileId,
      weaponId: def.id,
      behavior: def.behavior,
      x,
      y,
      prevX: x,
      prevY: y,
      vx,
      vy,
      radius: def.behavior === 'orbit_ring'
        ? 12 * (derived.area + eqW.limitBreakAreaBonus)
        : def.behavior === 'scan_phaser' ? radius * 1.1 : radius,
      damage,
      pierceRemaining: def.pierce,
      bouncesRemaining: extraBounces,
      ticksRemaining: durationTicks,
      hitIntervalTicks: def.hitIntervalTicks,
      knockback: def.knockback,
      color: def.color,
      orbitAngle,
      orbitDistance,
      attackDirectionX,
      lifestealHeal: def.lifestealHeal,
      freezeTicks: def.freezeTicks,
      halvesEnemyHp: def.halvesEnemyHp,
      hitCooldownByEnemy: {},
    };
  }
}

export function healPlayer(run: RunState, amount: number): void {
  if (amount <= 0) return;
  const hasSarabande = run.arcanas.includes('arcana_vi_sarabande');
  const effectiveHeal = hasSarabande ? amount * 2 : amount;
  run.player.hp = Math.min(run.player.maxHp, run.player.hp + effectiveHeal);

  if (hasSarabande) {
    const zoneId = `hz_sarabande_${run.nextEntitySeq++}`;
    run.hazardZones[zoneId] = {
      zoneId,
      weaponId: 'soul_eater',
      x: run.player.x,
      y: run.player.y,
      radius: 95,
      damage: Math.max(5, Math.round(effectiveHeal * 2)),
      ticksRemaining: 12,
      hitIntervalTicks: 12,
      followPlayer: true,
      color: '#f472b6',
      hitCooldownByEnemy: {},
    };
  }
}

export function mergeGroundXpGemsIfNeeded(run: RunState): void {
  const xpPickups = Object.values(run.pickups).filter(
    (p) => (p.kind === 'xp_blue' || p.kind === 'xp_green') && !p.attracted,
  );
  if (xpPickups.length <= 160) return;

  // Merge oldest 40 gems into a single high-value red gem near player perimeter
  const toMerge = xpPickups.slice(0, 40);
  let mergedValue = 0;
  let sumX = 0;
  let sumY = 0;
  for (const p of toMerge) {
    mergedValue += p.value;
    sumX += p.x;
    sumY += p.y;
    delete run.pickups[p.pickupId];
  }
  const newId = `pk_merged_${run.nextEntitySeq++}`;
  run.pickups[newId] = {
    pickupId: newId,
    kind: 'xp_red',
    x: sumX / toMerge.length,
    y: sumY / toMerge.length,
    value: mergedValue,
    attracted: false,
    spawnMinute: Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND)),
  };
}

export function awardExperience(run: RunState, profile: ProfileState, rawXp: number): void {
  const derived = computeDerivedStats(run, profile);
  const gained = Math.max(1, Math.round(rawXp * derived.growth));
  run.player.xp += gained;

  while (run.player.xp >= run.player.xpToNext) {
    run.player.xp -= run.player.xpToNext;
    run.player.level += 1;
    run.player.pendingLevels += 1;
    run.player.xpToNext = xpRequiredForLevel(run.player.level);

    // Darkana X Hail from the Future drops bonus pickup on level up
    if (run.arcanas.includes('darkana_x_hail_future')) {
      const kinds: PickupKind[] = ['coin_bag', 'roast_chicken', 'vacuum', 'orologion'];
      const kind = kinds[run.player.level % kinds.length]!;
      const pid = `pk_hail_${run.nextEntitySeq++}`;
      run.pickups[pid] = {
        pickupId: pid,
        kind,
        x: run.player.x + 36,
        y: run.player.y,
        value: kind === 'coin_bag' ? 25 : 30,
        attracted: false,
        spawnMinute: Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND)),
      };
    }
  }

  if (run.phase === 'combat' && !run.pendingChoice && run.player.pendingLevels > 0) {
    run.player.pendingLevels -= 1;
    run.pendingChoice = buildLevelUpChoices(run, profile);
    run.phase = 'choice';
  }
}

export function handleEnemyDeath(
  run: RunState,
  profile: ProfileState,
  enemy: EnemyInstance,
  killerWeaponId?: string,
): void {
  if (!run.enemies[enemy.instanceId]) return;
  const wasFrozen = enemy.freezeTicks > 0;
  delete run.enemies[enemy.instanceId];

  run.stats.kills += 1;
  run.stats.killsByEnemy[enemy.defId] = (run.stats.killsByEnemy[enemy.defId] ?? 0) + 1;
  profile.killedEnemyCounts[enemy.defId] = (profile.killedEnemyCounts[enemy.defId] ?? 0) + 1;

  if (killerWeaponId) {
    const eqW = run.weapons.find((w) => w.weaponId === killerWeaponId);
    if (eqW) eqW.kills += 1;
  }

  // Darkana XII Crystal Cries: killing frozen enemies boosts maxHp & growth
  if (wasFrozen && run.arcanas.includes('darkana_xii_crystal_cries')) {
    run.player.maxHp += 1;
    healPlayer(run, 1);
  }

  const currentMinute = Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND));
  const def = ENEMY_MAP[enemy.defId];

  if (enemy.isReaper) {
    // Defeating the Reaper grants victory immediately!
    settleRun(run, profile, 'victory');
    return;
  }

  if (def?.dropsChest) {
    const chestPickupId = `pk_chest_${run.nextEntitySeq++}`;
    run.pickups[chestPickupId] = {
      pickupId: chestPickupId,
      kind: 'chest',
      x: enemy.x,
      y: enemy.y,
      value: 1,
      canEvolve: true,
      attracted: false,
      spawnMinute: currentMinute,
    };
  }

  const xpVal = def?.xpValue ?? 1;
  const gemKind: PickupKind = xpVal >= 10 ? 'xp_red' : xpVal >= 3 ? 'xp_green' : 'xp_blue';
  const gemId = `pk_xp_${run.nextEntitySeq++}`;
  run.pickups[gemId] = {
    pickupId: gemId,
    kind: gemKind,
    x: enemy.x,
    y: enemy.y,
    value: xpVal,
    attracted: false,
    spawnMinute: currentMinute,
  };

  mergeGroundXpGemsIfNeeded(run);
}

export function evaluateUnlocks(run: RunState, profile: ProfileState): string[] {
  const newlyUnlocked: string[] = [];
  const survivedMinutes = Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND));
  const totalKills = profile.stats.totalKills + run.stats.kills;
  const totalGold = profile.stats.totalGoldEarned + run.stats.goldCollected;

  for (const ul of UNLOCKS) {
    if (profile.completedUnlockIds.includes(ul.id)) continue;
    let passed = false;
    if (ul.conditionType === 'reach_level' && run.player.level >= ul.targetValue) {
      passed = true;
    } else if (ul.conditionType === 'survive_minutes' && survivedMinutes >= ul.targetValue) {
      passed = true;
    } else if (
      ul.conditionType === 'evolve_weapon' &&
      run.stats.evolutionsCompleted.length >= ul.targetValue
    ) {
      passed = true;
    } else if (ul.conditionType === 'kill_enemies_total' && totalKills >= ul.targetValue) {
      passed = true;
    } else if (ul.conditionType === 'collect_gold_total' && totalGold >= ul.targetValue) {
      passed = true;
    } else if (
      ul.conditionType === 'find_relic' &&
      ul.targetId &&
      profile.unlockedRelicIds.includes(ul.targetId)
    ) {
      passed = true;
    }

    if (passed) {
      profile.completedUnlockIds.push(ul.id);
      newlyUnlocked.push(ul.id);
      if (ul.rewardGold) {
        profile.gold += ul.rewardGold;
      }
      if (ul.rewardKind === 'character' && !profile.unlockedCharacterIds.includes(ul.rewardId)) {
        profile.unlockedCharacterIds.push(ul.rewardId);
        if (ul.rewardId === 'emberpriest_cyra' && !profile.unlockedCharacterIds.includes('stormcaller_iona')) {
          profile.unlockedCharacterIds.push('stormcaller_iona');
        }
        if (ul.rewardId === 'vowkeeper_oswin' && !profile.unlockedCharacterIds.includes('bonewright_ravel')) {
          profile.unlockedCharacterIds.push('bonewright_ravel');
        }
      } else if (ul.rewardKind === 'stage' && !profile.unlockedStageIds.includes(ul.rewardId)) {
        profile.unlockedStageIds.push(ul.rewardId);
        if (ul.rewardId === 'gallo_tower' && !profile.unlockedStageIds.includes('moongolow')) {
          profile.unlockedStageIds.push('moongolow');
        }
        if (ul.rewardId === 'the_lycaeum' && !profile.unlockedStageIds.includes('whiteout')) {
          profile.unlockedStageIds.push('whiteout');
        }
        if (ul.rewardId === 'space_54' && !profile.unlockedCharacterIds.includes('starward_odd')) {
          profile.unlockedCharacterIds.push('starward_odd');
        }
      } else if (ul.rewardKind === 'relic' && !profile.unlockedRelicIds.includes(ul.rewardId)) {
        profile.unlockedRelicIds.push(ul.rewardId);
      }
    }
  }
  return newlyUnlocked;
}

export function settleRun(
  run: RunState,
  profile: ProfileState,
  reason: 'victory' | 'defeat' | 'quit',
): SettlementState {
  if (run.settlement && run.settlement.committedToProfile) {
    run.phase = 'settled';
    return run.settlement;
  }

  const survivedSeconds = Math.floor(run.stageClockTicks / TICKS_PER_SECOND);
  const alreadySettled = profile.settledRunIds.includes(run.runId);
  let newlyUnlockedIds: string[] = [];
  let adventureChapterCompleted: string | undefined;

  if (!alreadySettled) {
    profile.settledRunIds.push(run.runId);
    if (profile.settledRunIds.length > 100) {
      profile.settledRunIds = profile.settledRunIds.slice(-100);
    }

    if (run.adventureId) {
      // Isolated Adventure progression — never overwrites or pollutes main profile gold!
      const adv =
        profile.adventures[run.adventureId] ?? createInitialAdventureState(run.adventureId);
      profile.adventures[run.adventureId] = adv;
      adv.gold += run.stats.goldCollected;

      const advDef = ADVENTURE_MAP[run.adventureId];
      const chapter = advDef?.chapters.find((c) => c.chapterId === run.adventureChapterId);
      if (chapter) {
        const objectiveMet =
          (chapter.objectiveKind === 'survive_minutes' &&
            survivedSeconds >= chapter.objectiveValue * 60) ||
          (chapter.objectiveKind === 'kill_count' && run.stats.kills >= chapter.objectiveValue) ||
          (chapter.objectiveKind === 'reach_level' &&
            run.player.level >= chapter.objectiveValue);
        if (objectiveMet && !adv.completedChapterIds.includes(chapter.chapterId)) {
          adv.completedChapterIds.push(chapter.chapterId);
          adv.gold += chapter.rewardGold;
          adventureChapterCompleted = chapter.chapterId;
        }
      }
    } else {
      newlyUnlockedIds = evaluateUnlocks(run, profile);
      profile.gold += run.stats.goldCollected;
      profile.stats.totalRuns += 1;
      profile.stats.totalKills += run.stats.kills;
      profile.stats.totalGoldEarned += run.stats.goldCollected;
      const prevBest = profile.stats.bestSurvivalSecondsByStage[run.stageId] ?? 0;
      if (survivedSeconds > prevBest) {
        profile.stats.bestSurvivalSecondsByStage[run.stageId] = survivedSeconds;
      }
    }
  }

  const settlement: SettlementState = {
    settlementId: `settle_${run.runId}`,
    runId: run.runId,
    reason,
    survivedSeconds,
    levelReached: run.player.level,
    kills: run.stats.kills,
    goldEarned: run.stats.goldCollected,
    newlyUnlockedIds,
    adventureChapterCompleted,
    committedToProfile: true,
  };

  run.settlement = settlement;
  run.phase = 'settled';
  return settlement;
}

export function verifyRunInvariants(run: RunState): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!CHARACTER_MAP[run.characterId] || CHARACTER_MAP[run.characterId]?.scope === 'dlc_excluded') {
    errors.push(`Invalid characterId: ${run.characterId}`);
  }
  if (!STAGE_MAP[run.stageId] || STAGE_MAP[run.stageId]?.scope === 'dlc_excluded') {
    errors.push(`Invalid stageId: ${run.stageId}`);
  }
  if (!Number.isFinite(run.player.hp) || !Number.isFinite(run.player.maxHp) || run.player.maxHp <= 0) {
    errors.push('Invalid player HP');
  }
  if (!Number.isFinite(run.tick) || run.tick < 0) {
    errors.push('Invalid simulation tick');
  }
  for (const w of run.weapons) {
    if (!WEAPON_MAP[w.weaponId] || WEAPON_MAP[w.weaponId]?.scope === 'dlc_excluded') {
      errors.push(`Unknown or excluded weaponId: ${w.weaponId}`);
    }
  }
  for (const p of run.passives) {
    if (!PASSIVE_MAP[p.passiveId] || PASSIVE_MAP[p.passiveId]?.scope === 'dlc_excluded') {
      errors.push(`Unknown or excluded passiveId: ${p.passiveId}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export type EngineSnapshot = {
  run: RunState;
  profile: ProfileState;
  derived: DerivedStats;
  pauseReasons: PauseReason[];
  isRunning: boolean;
};

export class LongNightEmbersEngine {
  private run: RunState;
  private profile: ProfileState;
  private pauseReasons = new Set<PauseReason>();
  private listeners = new Set<() => void>();
  private snapshot: EngineSnapshot;

  constructor(initialRun?: RunState, initialProfile?: ProfileState) {
    this.profile = initialProfile ?? createInitialProfile(1);
    this.run = initialRun ?? createInitialRun(1, {}, this.profile);
    this.snapshot = this.buildSnapshot();
  }

  private buildSnapshot(): EngineSnapshot {
    const derived = computeDerivedStats(this.run, this.profile);
    const isRunning = this.run.phase === 'combat' && this.pauseReasons.size === 0;
    return {
      run: this.run,
      profile: this.profile,
      derived,
      pauseReasons: [...this.pauseReasons],
      isRunning,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) {
      l();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): EngineSnapshot => {
    const expectedRunning = this.run.phase === 'combat' && this.pauseReasons.size === 0;
    if (this.snapshot.isRunning !== expectedRunning) {
      this.snapshot = this.buildSnapshot();
    }
    return this.snapshot;
  };

  public isRunning(): boolean {
    return this.run.phase === 'combat' && this.pauseReasons.size === 0;
  }

  public loadState(run: RunState, profile: ProfileState): void {
    this.run = structuredClone(run);
    this.profile = structuredClone(profile);
    this.pauseReasons.delete('choice');
    this.pauseReasons.delete('chest');
    if (this.run.phase === 'choice') {
      this.pauseReasons.add('choice');
    } else if (this.run.phase === 'chest') {
      this.pauseReasons.add('chest');
    }
    this.emit();
  }

  public startNewRun(options: CreateRunOptions): void {
    this.run = createInitialRun(this.profile.slotId, options, this.profile);
    this.pauseReasons.delete('choice');
    this.pauseReasons.delete('chest');
    this.pauseReasons.delete('manual');
    this.pauseReasons.delete('menu');
    this.pauseReasons.delete('map');
    this.pauseReasons.delete('performance');
    this.emit();
  }

  public stepTick(): void {
    if (!this.isRunning()) return;

    const run = this.run;
    const profile = this.profile;
    const derived = computeDerivedStats(run, profile);
    const stageDef = STAGE_MAP[run.stageId] ?? STAGE_MAP['mad_forest']!;

    run.tick += 1;
    run.stageClockTicks += run.modes.hurry ? 2 : 1;
    run.player.maxHp = derived.maxHp;
    if (run.godMode) {
      run.player.hp = run.player.maxHp;
    } else if (run.player.hp > run.player.maxHp) {
      run.player.hp = run.player.maxHp;
    }

    if (run.player.invulnerableTicks > 0) {
      run.player.invulnerableTicks -= 1;
    }
    if (run.globalFreezeTicks > 0) {
      run.globalFreezeTicks -= 1;
    }
    if (run.goldFeverTicks > 0) {
      run.goldFeverTicks -= 1;
    }

    // 1. Passive HP recovery
    if (derived.recovery > 0 && run.player.hp < run.player.maxHp) {
      run.player.recoveryAccum += derived.recovery / TICKS_PER_SECOND;
      if (run.player.recoveryAccum >= 1) {
        const whole = Math.floor(run.player.recoveryAccum);
        run.player.recoveryAccum -= whole;
        healPlayer(run, whole);
      }
    }

    // 2. Player movement (normalized diagonal)
    const ix = run.player.moveInputX;
    const iy = run.player.moveInputY;
    if (ix !== 0 || iy !== 0) {
      const len = Math.hypot(ix, iy);
      const nx = ix / len;
      const ny = iy / len;
      run.player.facingX = nx;
      run.player.facingY = ny;
      const stepDist = derived.moveSpeed * 2.5;
      run.player.x += nx * stepDist;
      run.player.y += ny * stepDist;
      run.player.distanceMovedAccum += stepDist;

      if (stageDef.geometry === 'horizontal_corridor') {
        run.player.y = Math.max(-200, Math.min(200, run.player.y));
      } else if (stageDef.geometry === 'vertical_tower') {
        run.player.x = Math.max(-260, Math.min(260, run.player.x));
      } else if (stageDef.geometry === 'fixed_arena') {
        run.player.x = Math.max(-420, Math.min(420, run.player.x));
        run.player.y = Math.max(-340, Math.min(340, run.player.y));
      } else if (stageDef.geometry === 'cart_track') {
        run.player.y = Math.max(-160, Math.min(160, run.player.y));
      }
    }

    // 3. Stage wave spawning & Reaper at stage time limit
    const currentMinute = Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND));
    if (currentMinute >= stageDef.timeLimitMinutes && !run.modes.endless) {
      const hasReaper = Object.values(run.enemies).some((e) => e.isReaper);
      if (!hasReaper) {
        spawnEnemyInstance(run, derived, stageDef.endBossEnemyId);
      }
    } else {
      const effectiveWaveMinute = run.modes.endless
        ? currentMinute % Math.max(1, stageDef.timeLimitMinutes)
        : currentMinute;
      const activeWave =
        stageDef.waves.find(
          (w) => effectiveWaveMinute >= w.startMinute && effectiveWaveMinute < w.endMinute,
        ) ?? stageDef.waves[stageDef.waves.length - 1];

      if (activeWave) {
        const enemyCount = Object.keys(run.enemies).length;
        const interval = Math.max(
          8,
          Math.round(activeWave.spawnIntervalTicks / Math.min(2.2, derived.curse)),
        );
        if (run.tick % interval === 0 || enemyCount < Math.min(16, activeWave.minQuota)) {
          const eid =
            activeWave.enemyIds[Math.floor(nextRandom(run) * activeWave.enemyIds.length)] ?? 'bat';
          spawnEnemyInstance(run, derived, eid);
        }
        if (
          activeWave.bossEnemyId &&
          !run.spawnedBossWaveMinutes.includes(currentMinute) &&
          run.stageClockTicks >= currentMinute * 60 * TICKS_PER_SECOND + 30
        ) {
          run.spawnedBossWaveMinutes.push(currentMinute);
          spawnEnemyInstance(run, derived, activeWave.bossEnemyId);
        }
      }
    }

    // 4. Random Events & Arcana VIII Mad Groove / Darkana VI Moonlight Bolero
    if (run.modes.randomEvents) {
      run.randomEventCooldownTicks -= 1;
      if (run.randomEventCooldownTicks <= 0) {
        run.randomEventCooldownTicks = 60 * TICKS_PER_SECOND;
        run.goldFeverTicks = 10 * TICKS_PER_SECOND;
        run.lastRandomEventLabelZh = '黄金狂热降临！';
      }
    }
    if (
      run.arcanas.includes('arcana_viii_mad_groove') &&
      run.tick % (120 * TICKS_PER_SECOND) === 10
    ) {
      for (const pk of Object.values(run.pickups)) {
        const angle = nextRandom(run) * Math.PI * 2;
        pk.x = run.player.x + Math.cos(angle) * 65;
        pk.y = run.player.y + Math.sin(angle) * 65;
      }
    }
    if (
      run.arcanas.includes('darkana_vi_moonlight_bolero') &&
      run.tick % (60 * TICKS_PER_SECOND) === 30
    ) {
      spawnEnemyInstance(run, derived, 'boss_giant_bat');
    }

    // 5. Weapons cooldown & firing
    for (const eqW of run.weapons) {
      const wDef = WEAPON_MAP[eqW.weaponId];
      if (!wDef) continue;
      eqW.cooldownRemaining -= 1;
      if (eqW.cooldownRemaining <= 0) {
        const effectiveCooldown = Math.max(
          4,
          Math.round(wDef.cooldownTicks * derived.cooldownMultiplier),
        );
        eqW.cooldownRemaining = effectiveCooldown;
        fireWeaponOnce(run, eqW, derived);
        // Darkana I Sapphire Mist duplicate cast chance
        if (run.arcanas.includes('darkana_i_sapphire_mist') && nextRandom(run) < 0.35) {
          fireWeaponOnce(run, eqW, derived);
        }
      }
    }

    // 6. Hazard zones update & damage
    // Screen wipes mark targets dead during casting; resolve before other attacks or contact.
    for (const en of Object.values(run.enemies)) {
      if (en.hp <= 0) {
        const killer = run.weapons.find((w) => WEAPON_MAP[w.weaponId]?.behavior === 'screen_wipe');
        handleEnemyDeath(run, profile, en, killer?.weaponId);
      }
    }
    for (const hz of Object.values(run.hazardZones)) {
      hz.ticksRemaining -= 1;
      if (hz.ticksRemaining <= 0) {
        delete run.hazardZones[hz.zoneId];
        continue;
      }
      if (hz.followPlayer) {
        if (hz.weaponId === 'la_borra') {
          const dx = run.player.x - hz.x;
          const dy = run.player.y - hz.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 4) {
            hz.x += (dx / dist) * 1.6;
            hz.y += (dy / dist) * 1.6;
          }
        } else {
          hz.x = run.player.x;
          hz.y = run.player.y;
        }
      }

      for (const [eid, cd] of Object.entries(hz.hitCooldownByEnemy)) {
        if (cd <= 1) delete hz.hitCooldownByEnemy[eid];
        else hz.hitCooldownByEnemy[eid] = cd - 1;
      }

      for (const en of Object.values(run.enemies)) {
        if (hz.hitCooldownByEnemy[en.instanceId]) continue;
        const dist = Math.hypot(en.x - hz.x, en.y - hz.y);
        if (dist <= hz.radius + en.radius) {
          hz.hitCooldownByEnemy[en.instanceId] = hz.hitIntervalTicks;
          en.hp -= hz.damage;
          run.stats.damageDealtTotal += hz.damage;
          const eqW = run.weapons.find((w) => w.weaponId === hz.weaponId);
          if (eqW) eqW.totalDamageDealt += hz.damage;
          if (en.hp <= 0) {
            handleEnemyDeath(run, profile, en, hz.weaponId);
          }
        }
      }
    }

    // 7. Projectiles update & swept segment-circle collision
    for (const pj of Object.values(run.projectiles)) {
      pj.ticksRemaining -= 1;
      if (pj.ticksRemaining <= 0) {
        delete run.projectiles[pj.projectileId];
        continue;
      }

      pj.prevX = pj.x;
      pj.prevY = pj.y;

      if (pj.behavior === 'orbit_ring' && pj.orbitAngle !== undefined && pj.orbitDistance !== undefined) {
        pj.orbitAngle += 0.08 * derived.speed;
        pj.x = run.player.x + Math.cos(pj.orbitAngle) * pj.orbitDistance;
        pj.y = run.player.y + Math.sin(pj.orbitAngle) * pj.orbitDistance;
      } else if (pj.behavior === 'boomerang_cross') {
        if (!pj.returning && pj.ticksRemaining < 95) {
          pj.returning = true;
          pj.vx = -pj.vx * 1.25;
          pj.vy = -pj.vy * 1.25;
        }
        pj.x += pj.vx;
        pj.y += pj.vy;
      } else if (pj.behavior === 'lob_arc' && pj.weaponId === 'axe') {
        pj.vy += 0.24;
        pj.x += pj.vx;
        pj.y += pj.vy;
      } else {
        pj.x += pj.vx;
        pj.y += pj.vy;
      }

      // Screen boundary bounce for bounce_tracer / Waltz of Pearls
      if (pj.bouncesRemaining > 0) {
        const halfW = LOGICAL_WIDTH / 2 - 16;
        const halfH = LOGICAL_HEIGHT / 2 - 16;
        if (Math.abs(pj.x - run.player.x) >= halfW && (pj.x - run.player.x) * pj.vx > 0) {
          pj.x = run.player.x + Math.sign(pj.x - run.player.x) * halfW;
          pj.vx = -pj.vx;
          pj.bouncesRemaining -= 1;
        }
        if (pj.bouncesRemaining > 0 && Math.abs(pj.y - run.player.y) >= halfH && (pj.y - run.player.y) * pj.vy > 0) {
          pj.y = run.player.y + Math.sign(pj.y - run.player.y) * halfH;
          pj.vy = -pj.vy;
          pj.bouncesRemaining -= 1;
        }
      }

      for (const [eid, cd] of Object.entries(pj.hitCooldownByEnemy)) {
        if (cd <= 1) delete pj.hitCooldownByEnemy[eid];
        else pj.hitCooldownByEnemy[eid] = cd - 1;
      }

      for (const en of Object.values(run.enemies)) {
        if (pj.hitCooldownByEnemy[en.instanceId]) continue;
        const horizontal = pj.behavior === 'whip_horizontal' || pj.behavior === 'omni_sword' || pj.behavior === 'scan_phaser';
        const hit = horizontal
          ? segmentIntersectsCircle(pj.x - pj.radius, pj.y, pj.x + pj.radius, pj.y, en.x, en.y, en.radius + 3)
          : segmentIntersectsCircle(pj.prevX, pj.prevY, pj.x, pj.y, en.x, en.y, pj.radius + en.radius);
        if (!hit) continue;

        pj.hitCooldownByEnemy[en.instanceId] = pj.hitIntervalTicks;
        const wDef = WEAPON_MAP[pj.weaponId];
        let finalDamage = pj.damage;

        if (pj.halvesEnemyHp) {
          finalDamage = Math.max(finalDamage, Math.ceil(en.hp * 0.5));
        } else if (wDef) {
          let critChance = wDef.critChance;
          let critMult = wDef.critMultiplier;
          if (
            run.arcanas.includes('arcana_xvi_slash') &&
            ARCANA_MAP['arcana_xvi_slash']?.affectedWeapons.includes(wDef.id)
          ) {
            critChance += 0.15;
            critMult *= 2.0;
          }
          if (critChance > 0 && nextRandom(run) < critChance * derived.luck * 0.5) {
            finalDamage = Math.round(finalDamage * critMult);
          }
        }

        en.hp -= finalDamage;
        run.stats.damageDealtTotal += finalDamage;
        const eqW = run.weapons.find((w) => w.weaponId === pj.weaponId);
        if (eqW) eqW.totalDamageDealt += finalDamage;

        if (pj.lifestealHeal && pj.lifestealHeal > 0) {
          healPlayer(run, pj.lifestealHeal);
        }
        if (pj.freezeTicks && !ENEMY_MAP[en.defId]?.freezeImmune) {
          en.freezeTicks = Math.max(en.freezeTicks, pj.freezeTicks);
        }

        const eDef = ENEMY_MAP[en.defId];
        const kbFactor = Math.max(0, 1 - (eDef?.knockbackResist ?? 0));
        const dx = en.x - run.player.x;
        const dy = en.y - run.player.y;
        const dLen = Math.hypot(dx, dy) || 1;
        en.knockbackVx = (dx / dLen) * pj.knockback * kbFactor;
        en.knockbackVy = (dy / dLen) * pj.knockback * kbFactor;

        if (en.hp <= 0) {
          handleEnemyDeath(run, profile, en, pj.weaponId);
        }

        if (pj.pierceRemaining < 900) {
          pj.pierceRemaining -= 1;
          if (pj.pierceRemaining <= 0) {
            delete run.projectiles[pj.projectileId];
            break;
          }
        }
      }
    }

    // 8. Enemies movement, offscreen recycle & contact damage
    const hasCrimsonShroud = run.weapons.some((w) => w.weaponId === 'crimson_shroud');
    for (const en of Object.values(run.enemies)) {
      if (en.freezeTicks > 0 || run.globalFreezeTicks > 0) {
        if (en.freezeTicks > 0) en.freezeTicks -= 1;
        continue;
      }

      const dx = run.player.x - en.x;
      const dy = run.player.y - en.y;
      const dist = Math.hypot(dx, dy);

      // Offscreen recycle for non-boss enemies far behind player
      if (!en.isBoss && dist > 860) {
        const angle = Math.atan2(run.player.facingY, run.player.facingX) + (nextRandom(run) - 0.5) * 1.4;
        en.x = run.player.x + Math.cos(angle) * 520;
        en.y = run.player.y + Math.sin(angle) * 520;
        continue;
      }

      const def = ENEMY_MAP[en.defId];
      if (def?.movePattern === 'swarm_line') {
        en.x += en.vx + en.knockbackVx;
        en.y += en.vy + en.knockbackVy;
      } else if (def?.movePattern === 'sine_fly') {
        const nx = dist > 0.1 ? dx / dist : 0;
        const ny = dist > 0.1 ? dy / dist : 0;
        const wave = Math.sin(run.tick * 0.08 + en.phaseAngle) * 0.9;
        en.x += nx * en.moveSpeed - ny * wave + en.knockbackVx;
        en.y += ny * en.moveSpeed + nx * wave + en.knockbackVy;
      } else if (def?.movePattern === 'charge_dash') {
        const boost = (run.tick + Math.round(en.phaseAngle * 20)) % 90 < 22 ? 2.1 : 0.85;
        const nx = dist > 0.1 ? dx / dist : 0;
        const ny = dist > 0.1 ? dy / dist : 0;
        en.x += nx * en.moveSpeed * boost + en.knockbackVx;
        en.y += ny * en.moveSpeed * boost + en.knockbackVy;
      } else {
        const nx = dist > 0.1 ? dx / dist : 0;
        const ny = dist > 0.1 ? dy / dist : 0;
        en.x += nx * en.moveSpeed + en.knockbackVx;
        en.y += ny * en.moveSpeed + en.knockbackVy;
      }
      en.knockbackVx *= 0.7;
      en.knockbackVy *= 0.7;

      // Player contact damage check
      if (dist <= en.radius + 14 && run.player.invulnerableTicks <= 0) {
        if (run.godMode) {
          run.player.hp = run.player.maxHp;
          continue;
        }
        run.player.invulnerableTicks = 24;
        if (run.player.laurelCharges > 0) {
          run.player.laurelCharges -= 1;
          if (hasCrimsonShroud) {
            en.hp -= Math.max(120, Math.round(en.maxHp * 0.02));
            if (en.hp <= 0) handleEnemyDeath(run, profile, en, 'crimson_shroud');
          }
          continue;
        }
        let incoming = Math.max(1, en.contactDamage - derived.armor);
        if (hasCrimsonShroud) {
          incoming = Math.min(10, incoming);
          en.hp -= Math.max(100, Math.round(en.maxHp * 0.015));
          if (en.hp <= 0) handleEnemyDeath(run, profile, en, 'crimson_shroud');
        }
        run.player.hp -= incoming;
        run.stats.damageTakenTotal += incoming;

        if (run.player.hp <= 0) {
          if (run.player.revivalsUsed < derived.revival) {
            run.player.revivalsUsed += 1;
            run.player.hp = Math.max(1, Math.round(run.player.maxHp * 0.5));
            run.player.invulnerableTicks = 120;
            // Push back nearby enemies on revival
            for (const other of Object.values(run.enemies)) {
              const odx = other.x - run.player.x;
              const ody = other.y - run.player.y;
              const od = Math.hypot(odx, ody) || 1;
              if (od < 180) {
                other.x += (odx / od) * 110;
                other.y += (ody / od) * 110;
              }
            }
          } else {
            run.player.hp = 0;
            settleRun(run, profile, 'defeat');
            this.emit();
            return;
          }
        }
      }
    }

    // 9. Pickups attraction & collection
    for (const pk of Object.values(run.pickups)) {
      const dx = run.player.x - pk.x;
      const dy = run.player.y - pk.y;
      const dist = Math.hypot(dx, dy);

      if (
        !pk.attracted &&
        pk.kind !== 'chest' &&
        pk.kind !== 'stage_passive' &&
        pk.kind !== 'relic' &&
        dist <= derived.magnet
      ) {
        pk.attracted = true;
      }

      if (pk.attracted && dist > 16) {
        const pullSpeed = 9.5;
        pk.x += (dx / dist) * pullSpeed;
        pk.y += (dy / dist) * pullSpeed;
      }

      if (dist <= 22) {
        delete run.pickups[pk.pickupId];
        if (pk.kind === 'xp_blue' || pk.kind === 'xp_green' || pk.kind === 'xp_red') {
          awardExperience(run, profile, pk.value);
        } else if (pk.kind === 'coin' || pk.kind === 'coin_bag' || pk.kind === 'rich_bag') {
          const goldMult = (run.goldFeverTicks > 0 ? 2 : 1) * derived.greed;
          run.stats.goldCollected += Math.max(1, Math.round(pk.value * goldMult));
        } else if (pk.kind === 'roast_chicken' || pk.kind === 'little_heart') {
          healPlayer(run, pk.value);
        } else if (pk.kind === 'vacuum') {
          for (const other of Object.values(run.pickups)) {
            if (other.kind.startsWith('xp_') || other.kind.startsWith('coin')) {
              other.attracted = true;
            }
          }
        } else if (pk.kind === 'orologion') {
          run.globalFreezeTicks = 10 * TICKS_PER_SECOND;
        } else if (pk.kind === 'rosary') {
          for (const en of Object.values(run.enemies)) {
            if (!ENEMY_MAP[en.defId]?.rosaryImmune) {
              handleEnemyDeath(run, profile, en);
            }
          }
        } else if (pk.kind === 'stage_passive' && pk.targetId) {
          const existing = run.passives.find((p) => p.passiveId === pk.targetId);
          const pDef = PASSIVE_MAP[pk.targetId];
          if (existing && pDef) {
            existing.level = Math.min(pDef.maxLevel, existing.level + 1);
          } else if (pDef) {
            // Stage floor passives can exceed the 6-slot limit!
            const regularCount = getRegularPassiveSlotCount(run);
            run.passives.push({
              passiveId: pDef.id,
              level: 1,
              fromStageFloor: regularCount >= MAX_PASSIVE_SLOTS || Boolean(pDef.stageOnly),
            });
            registerItemDiscovery(profile, pDef.id);
          }
        } else if (pk.kind === 'relic' && pk.targetId) {
          if (!profile.unlockedRelicIds.includes(pk.targetId)) {
            profile.unlockedRelicIds.push(pk.targetId);
          }
          registerItemDiscovery(profile, pk.targetId);
        } else if (pk.kind === 'chest') {
          run.pendingChest = openChest(run, profile, pk.canEvolve ?? true, pk.spawnMinute);
          run.phase = 'chest';
          this.pauseReasons.add('chest');
          break;
        }
      }
    }

    if (run.phase === 'choice') {
      this.pauseReasons.add('choice');
    }

    this.emit();
  }

  public dispatch(command: GameCommand): boolean {
    const run = this.run;
    const profile = this.profile;

    switch (command.type) {
      case 'SET_MOVE_INPUT': {
        run.player.moveInputX = Math.max(-1, Math.min(1, command.x));
        run.player.moveInputY = Math.max(-1, Math.min(1, command.y));
        this.emit();
        return true;
      }

      case 'SET_PAUSE_REASON': {
        if (command.active) {
          this.pauseReasons.add(command.reason);
          // Clear residual move input on hidden/platform cover
          if (
            command.reason === 'hidden' ||
            command.reason === 'boss' ||
            command.reason === 'sidebar'
          ) {
            run.player.moveInputX = 0;
            run.player.moveInputY = 0;
          }
        } else {
          this.pauseReasons.delete(command.reason);
        }
        this.emit();
        return true;
      }

      case 'TOGGLE_MANUAL_PAUSE': {
        if (this.pauseReasons.has('manual')) {
          this.pauseReasons.delete('manual');
        } else {
          this.pauseReasons.add('manual');
          run.player.moveInputX = 0;
          run.player.moveInputY = 0;
        }
        this.emit();
        return true;
      }

      case 'SELECT_CHOICE_OPTION': {
        if (run.phase !== 'choice' || !run.pendingChoice) return false;
        const opt = run.pendingChoice.options.find((o) => o.optionId === command.optionId);
        if (!opt) return false;

        if (opt.kind === 'weapon_new') {
          run.weapons.push({
            weaponId: opt.targetId,
            level: 1,
            cooldownRemaining: 5,
            totalDamageDealt: 0,
            kills: 0,
            limitBreakLevels: 0,
            limitBreakMightBonus: 0,
            limitBreakAreaBonus: 0,
          });
          registerItemDiscovery(profile, opt.targetId);
        } else if (opt.kind === 'weapon_upgrade') {
          const eqW = run.weapons.find((w) => w.weaponId === opt.targetId);
          const wDef = WEAPON_MAP[opt.targetId];
          if (eqW && wDef) {
            eqW.level = Math.min(wDef.maxLevel, eqW.level + 1);
          }
        } else if (opt.kind === 'passive_new') {
          run.passives.push({
            passiveId: opt.targetId,
            level: 1,
          });
          registerItemDiscovery(profile, opt.targetId);
        } else if (opt.kind === 'passive_upgrade') {
          const eqP = run.passives.find((p) => p.passiveId === opt.targetId);
          const pDef = PASSIVE_MAP[opt.targetId];
          if (eqP && pDef) {
            eqP.level = Math.min(pDef.maxLevel, eqP.level + 1);
          }
        } else if (opt.kind === 'limit_break') {
          const eqW = run.weapons.find((w) => w.weaponId === opt.targetId);
          if (eqW) {
            eqW.limitBreakLevels += 1;
            eqW.limitBreakMightBonus += 0.12;
            eqW.limitBreakAreaBonus += 0.08;
          }
        } else if (opt.kind === 'gold_bag') {
          run.stats.goldCollected += 25;
        } else if (opt.kind === 'floor_chicken') {
          healPlayer(run, 30);
        } else if (opt.kind === 'arcana_pick') {
          if (!run.arcanas.includes(opt.targetId)) {
            run.arcanas.push(opt.targetId);
            registerItemDiscovery(profile, opt.targetId);
            if (opt.targetId === 'arcana_viii_mad_groove') {
              for (const pk of Object.values(run.pickups)) {
                const angle = nextRandom(run) * Math.PI * 2;
                pk.x = run.player.x + Math.cos(angle) * 65;
                pk.y = run.player.y + Math.sin(angle) * 65;
              }
            }
          }
        } else if (opt.kind === 'survarot_pick') {
          if (!run.survarots.includes(opt.targetId)) {
            run.survarots.push(opt.targetId);
            registerItemDiscovery(profile, opt.targetId);
          }
        }

        // Advance queued levels if any remain
        if (run.player.pendingLevels > 0) {
          run.player.pendingLevels -= 1;
          run.pendingChoice = buildLevelUpChoices(run, profile);
        } else {
          run.pendingChoice = null;
          run.phase = 'combat';
          this.pauseReasons.delete('choice');
        }
        this.emit();
        return true;
      }

      case 'REROLL_CHOICE': {
        if (run.phase !== 'choice' || !run.pendingChoice) return false;
        if (run.player.rerollsRemaining <= 0) return false;
        run.player.rerollsRemaining -= 1;
        run.pendingChoice =
          run.pendingChoice.source === 'arcana_draft'
            ? buildArcanaDraftChoices(run, profile)
            : run.pendingChoice.source === 'survarot_draft'
              ? buildSurvarotDraftChoices(run)
              : buildLevelUpChoices(run, profile);
        this.emit();
        return true;
      }

      case 'SKIP_CHOICE': {
        if (run.phase !== 'choice' || !run.pendingChoice) return false;
        if (run.player.skipsRemaining <= 0) return false;
        run.player.skipsRemaining -= 1;
        run.player.xp += Math.round(run.player.xpToNext * 0.2);
        if (run.player.pendingLevels > 0) {
          run.player.pendingLevels -= 1;
          run.pendingChoice = buildLevelUpChoices(run, profile);
        } else {
          run.pendingChoice = null;
          run.phase = 'combat';
          this.pauseReasons.delete('choice');
        }
        this.emit();
        return true;
      }

      case 'BANISH_CHOICE': {
        if (run.phase !== 'choice' || !run.pendingChoice) return false;
        if (run.player.banishesRemaining <= 0) return false;
        const opt = run.pendingChoice.options.find((o) => o.optionId === command.optionId);
        if (!opt) return false;
        run.player.banishesRemaining -= 1;
        if (!run.banishedIds.includes(opt.targetId)) {
          run.banishedIds.push(opt.targetId);
        }
        if (run.player.pendingLevels > 0) {
          run.player.pendingLevels -= 1;
          run.pendingChoice = buildLevelUpChoices(run, profile);
        } else {
          run.pendingChoice = null;
          run.phase = 'combat';
          this.pauseReasons.delete('choice');
        }
        this.emit();
        return true;
      }

      case 'SKIP_CHEST_ANIMATION': {
        if (!run.pendingChest) return false;
        run.pendingChest.animationSkipped = true;
        this.emit();
        return true;
      }

      case 'CONFIRM_CHEST_REWARD': {
        if (run.phase !== 'chest' || !run.pendingChest) return false;
        commitChestRewards(run, profile, run.pendingChest);
        run.pendingChest = null;
        if (run.player.pendingLevels > 0) {
          run.player.pendingLevels -= 1;
          run.pendingChoice = buildLevelUpChoices(run, profile);
          run.phase = 'choice';
          this.pauseReasons.delete('chest');
          this.pauseReasons.add('choice');
        } else {
          run.phase = 'combat';
          this.pauseReasons.delete('chest');
        }
        this.emit();
        return true;
      }

      case 'END_RUN_EARLY': {
        if (run.phase === 'settled') return false;
        this.pauseReasons.delete('choice');
        this.pauseReasons.delete('chest');
        this.pauseReasons.delete('manual');
        settleRun(
          run,
          profile,
          run.modes.endless && run.stageClockTicks >= 60 * TICKS_PER_SECOND ? 'victory' : 'quit',
        );
        this.emit();
        return true;
      }

      case 'BUY_POWERUP': {
        const advId = command.adventureId ?? null;
        const targetRanks = advId
          ? (profile.adventures[advId]?.powerUpRanks ?? {})
          : profile.powerUpRanks;
        const cost = getPowerUpPurchaseCost(command.powerUpId, targetRanks);
        if (!Number.isFinite(cost)) return false;
        if (advId) {
          const adv = profile.adventures[advId];
          if (!adv || adv.gold < cost) return false;
          adv.gold -= cost;
          adv.powerUpRanks[command.powerUpId] = (adv.powerUpRanks[command.powerUpId] ?? 0) + 1;
        } else {
          if (profile.gold < cost) return false;
          profile.gold -= cost;
          profile.powerUpRanks[command.powerUpId] =
            (profile.powerUpRanks[command.powerUpId] ?? 0) + 1;
        }
        this.emit();
        return true;
      }

      case 'RESET_POWERUPS': {
        const advId = command.adventureId ?? null;
        if (advId) {
          const adv = profile.adventures[advId];
          if (!adv) return false;
          const refund = getTotalPowerUpRefund(adv.powerUpRanks);
          adv.gold += refund;
          adv.powerUpRanks = {};
        } else {
          const refund = getTotalPowerUpRefund(profile.powerUpRanks);
          profile.gold += refund;
          profile.powerUpRanks = {};
        }
        this.emit();
        return true;
      }

      case 'BUY_CHARACTER': {
        const ch = CHARACTER_MAP[command.characterId];
        if (!ch || ch.scope === 'dlc_excluded') return false;
        if (profile.unlockedCharacterIds.includes(ch.id)) return false;
        if (profile.gold < ch.unlockCost) return false;
        profile.gold -= ch.unlockCost;
        profile.unlockedCharacterIds.push(ch.id);
        registerItemDiscovery(profile, ch.id);
        this.emit();
        return true;
      }

      case 'BUY_GOLDEN_EGG': {
        const eggCost = 10000;
        if (profile.gold < eggCost) return false;
        profile.gold -= eggCost;
        profile.goldenEggsByCharacter[command.characterId] =
          (profile.goldenEggsByCharacter[command.characterId] ?? 0) + 1;
        this.emit();
        return true;
      }

      case 'TOGGLE_EGGS_ENABLED': {
        profile.eggsEnabled = !profile.eggsEnabled;
        this.emit();
        return true;
      }

      case 'TOGGLE_SEAL_ITEM': {
        const maxSeals = profile.powerUpRanks['pw_seal'] ?? 0;
        const idx = profile.sealedItemIds.indexOf(command.itemId);
        if (idx >= 0) {
          profile.sealedItemIds.splice(idx, 1);
          this.emit();
          return true;
        }
        if (profile.sealedItemIds.length >= maxSeals) return false;
        profile.sealedItemIds.push(command.itemId);
        this.emit();
        return true;
      }

      case 'CAST_SECRET_SPELL': {
        const normalized = command.code.trim().toLowerCase();
        const spell = SECRET_SPELLS.find((s) => s.code.toLowerCase() === normalized);
        if (!spell) return false;
        if (!profile.redeemedSpellCodes.includes(spell.code)) {
          profile.redeemedSpellCodes.push(spell.code);
        }
        if (spell.rewardKind === 'character') {
          if (!profile.unlockedCharacterIds.includes(spell.rewardId)) {
            profile.unlockedCharacterIds.push(spell.rewardId);
          }
        } else if (spell.rewardKind === 'relic') {
          if (!profile.unlockedRelicIds.includes(spell.rewardId)) {
            profile.unlockedRelicIds.push(spell.rewardId);
          }
          if (spell.rewardId === 'randomazzo') {
            for (const rid of ['darkasso', 'survarot_deck']) {
              if (!profile.unlockedRelicIds.includes(rid)) profile.unlockedRelicIds.push(rid);
            }
          }
          if (spell.rewardId === 'yellow_sign') {
            for (const r of RELICS) {
              if (!profile.unlockedRelicIds.includes(r.id)) profile.unlockedRelicIds.push(r.id);
            }
          }
        } else if (spell.rewardKind === 'stage') {
          if (!profile.unlockedStageIds.includes(spell.rewardId)) {
            profile.unlockedStageIds.push(spell.rewardId);
          }
        }
        registerItemDiscovery(profile, spell.rewardId);
        this.emit();
        return true;
      }

      case 'ASCEND_ADVENTURE': {
        const advDef = ADVENTURE_MAP[command.adventureId];
        const advState = profile.adventures[command.adventureId];
        if (!advDef || !advState) return false;
        if (advState.completedChapterIds.length < advDef.chapters.length) return false;
        advState.ascensionLevel += 1;
        advState.completedChapterIds = [];
        advState.powerUpRanks = {};
        advState.gold = 500;
        this.emit();
        return true;
      }

      case 'RESET_ADVENTURE': {
        profile.adventures[command.adventureId] = createInitialAdventureState(command.adventureId);
        this.emit();
        return true;
      }

      case 'UPDATE_SETTINGS': {
        profile.settings = {
          ...profile.settings,
          ...command.settings,
        };
        this.emit();
        return true;
      }

      case 'CHEAT_ACTION': {
        const action = command.action;
        switch (action.kind) {
          case 'SET_GOLD': {
            profile.gold = Math.max(0, Math.floor(action.amount));
            this.emit();
            return true;
          }
          case 'ADD_GOLD': {
            profile.gold = Math.max(0, profile.gold + Math.floor(action.delta));
            this.emit();
            return true;
          }
          case 'ADD_EGGS': {
            const cid = action.characterId || run.characterId;
            const count = action.count ?? 100;
            profile.goldenEggsByCharacter[cid] = (profile.goldenEggsByCharacter[cid] ?? 0) + count;
            profile.eggsEnabled = true;
            this.emit();
            return true;
          }
          case 'UNLOCK_ALL_CHARACTERS': {
            for (const c of CHARACTERS) {
              if (c.scope !== 'dlc_excluded' && !profile.unlockedCharacterIds.includes(c.id)) {
                profile.unlockedCharacterIds.push(c.id);
              }
            }
            this.emit();
            return true;
          }
          case 'UNLOCK_ALL_STAGES': {
            for (const s of STAGES) {
              if (s.scope !== 'dlc_excluded' && !profile.unlockedStageIds.includes(s.id)) {
                profile.unlockedStageIds.push(s.id);
              }
            }
            this.emit();
            return true;
          }
          case 'UNLOCK_ALL_RELICS': {
            for (const r of RELICS) {
              if (!profile.unlockedRelicIds.includes(r.id)) {
                profile.unlockedRelicIds.push(r.id);
              }
            }
            this.emit();
            return true;
          }
          case 'MAX_ALL_POWERUPS': {
            for (const p of POWERUPS) {
              profile.powerUpRanks[p.id] = p.maxRank;
            }
            this.emit();
            return true;
          }
          case 'UNLOCK_ALL_COLLECTION': {
            for (const w of WEAPONS) {
              if (!profile.discoveredItemIds.includes(w.id)) profile.discoveredItemIds.push(w.id);
            }
            for (const p of PASSIVES) {
              if (!profile.discoveredItemIds.includes(p.id)) profile.discoveredItemIds.push(p.id);
            }
            for (const r of RELICS) {
              if (!profile.discoveredItemIds.includes(r.id)) profile.discoveredItemIds.push(r.id);
            }
            this.emit();
            return true;
          }
          case 'TOGGLE_GOD_MODE': {
            run.godMode = !run.godMode;
            if (run.godMode) {
              run.player.hp = run.player.maxHp;
            }
            this.emit();
            return true;
          }
          case 'HEAL_FULL': {
            run.player.hp = run.player.maxHp;
            this.emit();
            return true;
          }
          case 'MAX_REROLLS': {
            run.player.rerollsRemaining = 99;
            run.player.skipsRemaining = 99;
            run.player.banishesRemaining = 99;
            this.emit();
            return true;
          }
          case 'ADD_LEVELS': {
            const count = Math.max(1, action.count ?? 1);
            for (let i = 0; i < count; i++) {
              awardExperience(run, profile, Math.max(10, run.player.xpToNext - run.player.xp + 1));
            }
            this.emit();
            return true;
          }
          case 'KILL_ALL_ENEMIES': {
            for (const en of Object.values(run.enemies)) {
              handleEnemyDeath(run, profile, en);
            }
            this.emit();
            return true;
          }
          case 'VACUUM_ALL': {
            for (const pk of Object.values(run.pickups)) {
              if (pk.kind !== 'chest' && pk.kind !== 'stage_passive' && pk.kind !== 'relic') {
                pk.attracted = true;
              }
            }
            this.emit();
            return true;
          }
          case 'SPAWN_CHEST': {
            const chestPickupId = `pk_chest_${run.nextEntitySeq++}`;
            run.pickups[chestPickupId] = {
              pickupId: chestPickupId,
              kind: 'chest',
              x: run.player.x,
              y: run.player.y,
              value: action.tier ?? 3,
              canEvolve: true,
              attracted: false,
              spawnMinute: Math.max(10, Math.floor(run.stageClockTicks / (60 * TICKS_PER_SECOND))),
            };
            this.emit();
            return true;
          }
          case 'FORWARD_TIME': {
            const addTicks = Math.floor(action.seconds * TICKS_PER_SECOND);
            run.tick += addTicks;
            run.stageClockTicks += addTicks;
            this.emit();
            return true;
          }
        }
        return false;
      }
    }
  }
}
