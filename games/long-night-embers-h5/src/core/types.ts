export type VerificationState = 'pending' | 'referenced' | 'implemented' | 'verified';
export type ContentScope = 'base' | 'free_update' | 'dlc_excluded';

export type StatModifierMap = Partial<{
  maxHp: number;
  recovery: number;
  armor: number;
  moveSpeed: number;
  might: number;
  area: number;
  speed: number;
  duration: number;
  amount: number;
  cooldown: number; // negative reduces cooldown (e.g. -0.08 = -8% cooldown)
  luck: number;
  growth: number;
  greed: number;
  curse: number;
  magnet: number;
  revival: number;
  reroll: number;
  skip: number;
  banish: number;
  seal: number;
}>;

export type CharacterDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  startingWeaponId: string;
  baseHp: number;
  baseMoveSpeed: number;
  baseBonuses: StatModifierMap;
  growthTrait?: {
    stat: 'might' | 'area' | 'speed' | 'duration' | 'amount' | 'cooldown' | 'growth' | 'greed' | 'curse' | 'luck';
    perLevel: number;
    everyNLevels?: number;
    maxCap?: number;
  };
  unlockCost: number;
  unlockedByDefault: boolean;
  unlockHintZh: string;
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type WeaponKind = 'base' | 'evolution' | 'union' | 'gift' | 'counterpart';

export type WeaponBehaviorType =
  | 'whip_horizontal'
  | 'nearest_bolt'
  | 'facing_knife'
  | 'lob_arc'
  | 'boomerang_cross'
  | 'orbit_ring'
  | 'random_pierce_beam'
  | 'aura_pulse'
  | 'ground_pool'
  | 'bounce_tracer'
  | 'lightning_strike'
  | 'screen_wipe'
  | 'circle_bombard'
  | 'dual_diagonal'
  | 'cat_roam'
  | 'vertical_column'
  | 'trail_dash'
  | 'combo_slash'
  | 'bounce_bone'
  | 'explode_cherry'
  | 'bouncing_cart'
  | 'move_trail'
  | 'falling_junk'
  | 'tri_shot'
  | 'retaliate_bat'
  | 'vertical_javelin'
  | 'thrust_spear'
  | 'scan_phaser'
  | 'festive_orb'
  | 'four_corners'
  | 'top_blades'
  | 'freeze_clone'
  | 'drain_slash'
  | 'bounce_bubble'
  | 'omni_sword'
  | 'flame_cone'
  | 'jubilee_light'
  | 'gaea_quake'
  | 'clock_freeze_ray'
  | 'laurel_shield';

export type WeaponDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  kind: WeaponKind;
  scope: ContentScope;
  behavior: WeaponBehaviorType;
  maxLevel: number;
  rarityWeight: number;
  baseDamage: number;
  damagePerLevel: number;
  cooldownTicks: number; // at 60 Hz
  projectiles: number;
  amountPerLevels?: number; // extra projectile every N levels
  pierce: number; // 999 for infinite pierce
  speed: number; // world units per tick
  areaRadius: number;
  durationTicks: number;
  hitIntervalTicks: number;
  knockback: number;
  critChance: number;
  critMultiplier: number;
  lifestealHeal?: number;
  freezeTicks?: number;
  halvesEnemyHp?: boolean;
  capsIncomingDamageAt?: number;
  color: string;
  tags: Array<'slash' | 'projectile' | 'magic' | 'fire' | 'ice' | 'lightning' | 'aura' | 'explosive' | 'holy'>;
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type PassiveDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  maxLevel: number;
  rarityWeight: number;
  perLevelBonuses: StatModifierMap;
  finalLevelCurseBonus?: number;
  stageOnly?: boolean;
  color: string;
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type EvolutionKind = 'evolution' | 'union' | 'self_evolution' | 'gift';

export type EvolutionDefinition = {
  id: string;
  nameZh: string;
  kind: EvolutionKind;
  scope: ContentScope;
  inputs: Array<{
    weaponId: string;
    minLevel: number;
  }>;
  requiredPassives: Array<{
    passiveId: string;
    minLevel: number;
  }>;
  outputWeaponId: string;
  replacesInputs: boolean;
  consumesPassives: boolean;
  freesWeaponSlotCount: number;
  minMinute: number;
  description: string;
  sourceRef: string;
  verification: VerificationState;
};

export type EnemyMovePattern =
  | 'chase'
  | 'swarm_line'
  | 'sine_fly'
  | 'ranged_orb'
  | 'charge_dash'
  | 'circle_guard'
  | 'reaper_hunt';

export type EnemyDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  isBoss: boolean;
  isReaper?: boolean;
  maxHp: number;
  hpPerPlayerLevel: number;
  contactDamage: number;
  moveSpeed: number;
  radius: number;
  knockbackResist: number;
  freezeImmune?: boolean;
  rosaryImmune?: boolean;
  movePattern: EnemyMovePattern;
  xpValue: number;
  dropsChest: boolean;
  dropsRelicId?: string;
  color: string;
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type StageGeometry =
  | 'infinite_field'
  | 'horizontal_corridor'
  | 'vertical_tower'
  | 'fixed_arena'
  | 'cart_track';

export type StageGroundItem = {
  id: string;
  kind: 'passive' | 'relic';
  targetId: string;
  x: number;
  y: number;
  requiresYellowSign?: boolean;
  guardedByEnemyId?: string;
};

export type StageWaveEntry = {
  startMinute: number;
  endMinute: number;
  enemyIds: string[];
  spawnIntervalTicks: number;
  minQuota: number;
  bossEnemyId?: string;
  eventLabelZh?: string;
};

export type StageDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  stageType: 'normal' | 'challenge' | 'bonus' | 'special';
  geometry: StageGeometry;
  timeLimitMinutes: number;
  moveSpeedBonus: number;
  goldBonus: number;
  luckBonus: number;
  unlockedByDefault: boolean;
  unlockHintZh: string;
  groundItems: StageGroundItem[];
  waves: StageWaveEntry[];
  endBossEnemyId: string;
  palette: {
    bgPrimary: string;
    bgSecondary: string;
    gridLine: string;
    obstacleColor: string;
  };
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type RelicDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  stageId: string;
  effectKind:
    | 'grimoire'
    | 'bestiary'
    | 'milky_way_map'
    | 'music_selection'
    | 'mode_hurry'
    | 'merchant'
    | 'yellow_sign'
    | 'mindbender'
    | 'mode_limit_break'
    | 'mode_inverse'
    | 'mode_endless'
    | 'mode_arcana'
    | 'mode_darkana'
    | 'mode_random_events'
    | 'mode_survarots'
    | 'magic_mirror';
  description: string;
  sourceRef: string;
  verification: VerificationState;
};

export type ModeId =
  | 'hyper'
  | 'hurry'
  | 'arcana'
  | 'limitBreak'
  | 'inverse'
  | 'endless'
  | 'randomEvents'
  | 'survarots';

export type ArcanaDeckKind = 'arcana' | 'darkana';

export type ArcanaDefinition = {
  id: string;
  roman: string;
  nameZh: string;
  nameEn: string;
  deck: ArcanaDeckKind;
  scope: ContentScope;
  triggerKind:
    | 'revive_bonus'
    | 'heal_double_pulse'
    | 'pull_stage_items'
    | 'projectile_bounce'
    | 'crit_slash'
    | 'fire_explosion'
    | 'empty_slot_bonus'
    | 'magnet_aura_zone'
    | 'duplicate_cast'
    | 'extra_chest_bolero'
    | 'random_candy_hail'
    | 'freeze_xp_crystal';
  affectedWeapons: string[];
  statBonuses?: StatModifierMap;
  description: string;
  sourceRef: string;
  verification: VerificationState;
};

export type SurvarotDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  effectKind:
    | 'fool_luck_reroll'
    | 'magician_cooldown'
    | 'empress_heal_growth'
    | 'strength_might_armor'
    | 'wheel_gold_burst'
    | 'judgement_smite';
  statBonuses: StatModifierMap;
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type PowerUpDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  maxRank: number;
  baseCost: number;
  perRankBonuses: StatModifierMap;
  description: string;
  sourceRef: string;
  verification: VerificationState;
};

export type UnlockConditionType =
  | 'reach_level'
  | 'survive_minutes'
  | 'evolve_weapon'
  | 'kill_enemies_total'
  | 'find_relic'
  | 'stage_clear'
  | 'collect_gold_total'
  | 'secret_spell';

export type UnlockDefinition = {
  id: string;
  nameZh: string;
  scope: ContentScope;
  conditionType: UnlockConditionType;
  targetId?: string;
  targetValue: number;
  rewardKind: 'character' | 'weapon' | 'passive' | 'stage' | 'arcana' | 'relic' | 'gold';
  rewardId: string;
  rewardGold?: number;
  description: string;
  sourceRef: string;
  verification: VerificationState;
};

export type SecretSpellDefinition = {
  id: string;
  code: string;
  nameZh: string;
  scope: ContentScope;
  rewardKind: 'character' | 'weapon' | 'relic' | 'stage';
  rewardId: string;
  hintZh: string;
  sourceRef: string;
  verification: VerificationState;
};

export type AdventureChapterDefinition = {
  chapterId: string;
  nameZh: string;
  stageId: string;
  objectiveKind: 'survive_minutes' | 'kill_count' | 'reach_level';
  objectiveValue: number;
  rewardGold: number;
};

export type AdventureDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  scope: ContentScope;
  allowedCharacterIds: string[];
  allowedWeaponIds: string[];
  chapters: AdventureChapterDefinition[];
  ascensionBonusPerLevel: StatModifierMap;
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type PauseReason =
  | 'home'
  | 'manual'
  | 'choice'
  | 'chest'
  | 'map'
  | 'sidebar'
  | 'boss'
  | 'hidden'
  | 'contextLost'
  | 'performance'
  | 'menu';

export type DerivedStats = {
  maxHp: number;
  recovery: number;
  armor: number;
  moveSpeed: number;
  might: number;
  area: number;
  speed: number;
  duration: number;
  amount: number;
  cooldownMultiplier: number;
  luck: number;
  growth: number;
  greed: number;
  curse: number;
  magnet: number;
  revival: number;
  reroll: number;
  skip: number;
  banish: number;
};

export type EquippedWeaponState = {
  weaponId: string;
  level: number;
  cooldownRemaining: number;
  totalDamageDealt: number;
  kills: number;
  limitBreakLevels: number;
  limitBreakMightBonus: number;
  limitBreakAreaBonus: number;
  isExtraSlot?: boolean; // from gift or stage floor
};

export type EquippedPassiveState = {
  passiveId: string;
  level: number;
  fromStageFloor?: boolean;
};

export type EnemyInstance = {
  instanceId: string;
  defId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  contactDamage: number;
  moveSpeed: number;
  radius: number;
  isBoss: boolean;
  isReaper?: boolean;
  freezeTicks: number;
  knockbackVx: number;
  knockbackVy: number;
  spawnTick: number;
  phaseAngle: number;
};

export type ProjectileInstance = {
  projectileId: string;
  weaponId: string;
  behavior: WeaponBehaviorType;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierceRemaining: number;
  bouncesRemaining: number;
  ticksRemaining: number;
  hitIntervalTicks: number;
  knockback: number;
  color: string;
  orbitAngle?: number;
  orbitDistance?: number;
  returning?: boolean;
  attackDirectionX?: number; // stationary horizontal attacks retain their cast direction
  lifestealHeal?: number;
  freezeTicks?: number;
  halvesEnemyHp?: boolean;
  hitCooldownByEnemy: Record<string, number>;
};

export type HazardZoneInstance = {
  zoneId: string;
  weaponId: string;
  x: number;
  y: number;
  radius: number;
  damage: number;
  ticksRemaining: number;
  hitIntervalTicks: number;
  followPlayer: boolean;
  color: string;
  hitCooldownByEnemy: Record<string, number>;
};

export type PickupKind =
  | 'xp_blue'
  | 'xp_green'
  | 'xp_red'
  | 'coin'
  | 'coin_bag'
  | 'rich_bag'
  | 'roast_chicken'
  | 'vacuum'
  | 'rosary'
  | 'orologion'
  | 'chest'
  | 'stage_passive'
  | 'relic'
  | 'nduja_fritta'
  | 'little_heart';

export type PickupInstance = {
  pickupId: string;
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  targetId?: string;
  canEvolve?: boolean;
  attracted: boolean;
  spawnMinute: number;
};

export type DamageTextInstance = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  ticksRemaining: number;
};

export type ChoiceOption = {
  optionId: string;
  kind: 'weapon_new' | 'weapon_upgrade' | 'passive_new' | 'passive_upgrade' | 'limit_break' | 'gold_bag' | 'floor_chicken' | 'arcana_pick' | 'survarot_pick';
  targetId: string;
  titleZh: string;
  subtitleZh: string;
  nextLevel?: number;
  isNew?: boolean;
};

export type PendingChoiceState = {
  choiceId: string;
  source: 'level_up' | 'arcana_draft' | 'survarot_draft';
  options: ChoiceOption[];
};

export type ChestRewardEntry = {
  kind: 'evolution' | 'weapon_upgrade' | 'passive_upgrade' | 'gold' | 'arcana' | 'survarot';
  targetId: string;
  titleZh: string;
  subtitleZh: string;
  evolutionId?: string;
};

export type PendingChestState = {
  chestId: string;
  tier: 1 | 3 | 5;
  rewards: ChestRewardEntry[];
  goldAwarded: number;
  animationSkipped: boolean;
  committed: boolean;
};

export type SettlementState = {
  settlementId: string;
  runId: string;
  reason: 'victory' | 'defeat' | 'quit';
  survivedSeconds: number;
  levelReached: number;
  kills: number;
  goldEarned: number;
  newlyUnlockedIds: string[];
  adventureChapterCompleted?: string;
  committedToProfile: boolean;
};

export type ActiveModesConfig = Record<ModeId, boolean>;

export type RunState = {
  difficulty?: import('./difficulty.ts').Difficulty;
  schemaVersion: number;
  contentVersion: string;
  baselineId: string;
  slotId: 1 | 2 | 3;
  saveSeq: number;
  runId: string;
  rngState: number;
  visualRngState: number;
  adventureId: string | null;
  adventureChapterId: string | null;
  characterId: string;
  stageId: string;
  modes: ActiveModesConfig;
  phase: 'combat' | 'choice' | 'chest' | 'settled';
  tick: number; // 60 Hz simulation ticks
  stageClockTicks: number; // advances faster in Hurry mode
  player: {
    x: number;
    y: number;
    facingX: number;
    facingY: number;
    moveInputX: number;
    moveInputY: number;
    hp: number;
    maxHp: number;
    xp: number;
    xpToNext: number;
    level: number;
    pendingLevels: number;
    invulnerableTicks: number;
    laurelCharges: number;
    laurelCooldownTicks: number;
    revivalsUsed: number;
    rerollsRemaining: number;
    skipsRemaining: number;
    banishesRemaining: number;
    distanceMovedAccum: number;
    recoveryAccum: number;
  };
  weapons: EquippedWeaponState[];
  passives: EquippedPassiveState[];
  arcanas: string[];
  survarots: string[];
  banishedIds: string[];
  enemies: Record<string, EnemyInstance>;
  projectiles: Record<string, ProjectileInstance>;
  hazardZones: Record<string, HazardZoneInstance>;
  pickups: Record<string, PickupInstance>;
  damageTexts: DamageTextInstance[];
  spawnedBossWaveMinutes: number[];
  spawnedGroundItemIds: string[];
  globalFreezeTicks: number;
  goldFeverTicks: number;
  randomEventCooldownTicks: number;
  lastRandomEventLabelZh: string | null;
  pendingChoice: PendingChoiceState | null;
  pendingChest: PendingChestState | null;
  settlement: SettlementState | null;
  nextEntitySeq: number;
  godMode?: boolean;
  stats: {
    kills: number;
    goldCollected: number;
    damageDealtTotal: number;
    damageTakenTotal: number;
    chestsOpened: number;
    evolutionsCompleted: string[];
    killsByEnemy: Record<string, number>;
  };
};

export type AdventureProfileState = {
  adventureId: string;
  gold: number;
  powerUpRanks: Record<string, number>;
  completedChapterIds: string[];
  ascensionLevel: number;
};

export type ProfileState = {
  schemaVersion: number;
  slotId: 1 | 2 | 3;
  gold: number;
  powerUpRanks: Record<string, number>;
  goldenEggsByCharacter: Record<string, number>;
  eggsEnabled: boolean;
  unlockedCharacterIds: string[];
  unlockedStageIds: string[];
  unlockedWeaponIds: string[];
  unlockedPassiveIds: string[];
  unlockedRelicIds: string[];
  unlockedArcanaIds: string[];
  unlockedSurvarotIds: string[];
  completedUnlockIds: string[];
  redeemedSpellCodes: string[];
  sealedItemIds: string[];
  discoveredItemIds: string[];
  killedEnemyCounts: Record<string, number>;
  settledRunIds: string[];
  adventures: Record<string, AdventureProfileState>;
  stats: {
    totalRuns: number;
    totalKills: number;
    totalGoldEarned: number;
    bestSurvivalSecondsByStage: Record<string, number>;
  };
  settings: {
    musicVolume: number;
    sfxVolume: number;
    userMuted: boolean;
    damageNumbers: boolean;
    screenFlash: boolean;
    lowFxMode: boolean;
    spoilerSafeCollection: boolean;
  };
};

export type GameCommand =
  | { type: 'SET_MOVE_INPUT'; x: number; y: number }
  | { type: 'SET_PAUSE_REASON'; reason: PauseReason; active: boolean }
  | { type: 'TOGGLE_MANUAL_PAUSE' }
  | { type: 'SELECT_CHOICE_OPTION'; optionId: string }
  | { type: 'REROLL_CHOICE' }
  | { type: 'SKIP_CHOICE' }
  | { type: 'BANISH_CHOICE'; optionId: string }
  | { type: 'SKIP_CHEST_ANIMATION' }
  | { type: 'CONFIRM_CHEST_REWARD' }
  | { type: 'END_RUN_EARLY' }
  | { type: 'BUY_POWERUP'; powerUpId: string; adventureId?: string | null }
  | { type: 'RESET_POWERUPS'; adventureId?: string | null }
  | { type: 'BUY_CHARACTER'; characterId: string }
  | { type: 'BUY_GOLDEN_EGG'; characterId: string }
  | { type: 'TOGGLE_EGGS_ENABLED' }
  | { type: 'TOGGLE_SEAL_ITEM'; itemId: string }
  | { type: 'CAST_SECRET_SPELL'; code: string }
  | { type: 'ASCEND_ADVENTURE'; adventureId: string }
  | { type: 'RESET_ADVENTURE'; adventureId: string }
  | {
      type: 'UPDATE_SETTINGS';
      settings: Partial<ProfileState['settings']>;
    }
  | { type: 'CHEAT_ACTION'; action: CheatAction };

export type CheatAction =
  | { kind: 'SET_GOLD'; amount: number }
  | { kind: 'ADD_GOLD'; delta: number }
  | { kind: 'ADD_EGGS'; characterId?: string; count?: number }
  | { kind: 'UNLOCK_ALL_CHARACTERS' }
  | { kind: 'UNLOCK_ALL_STAGES' }
  | { kind: 'UNLOCK_ALL_RELICS' }
  | { kind: 'UNLOCK_ALL_COLLECTION' }
  | { kind: 'MAX_ALL_POWERUPS' }
  | { kind: 'TOGGLE_GOD_MODE' }
  | { kind: 'HEAL_FULL' }
  | { kind: 'ADD_LEVELS'; count?: number }
  | { kind: 'MAX_REROLLS' }
  | { kind: 'KILL_ALL_ENEMIES' }
  | { kind: 'VACUUM_ALL' }
  | { kind: 'SPAWN_CHEST'; tier?: 1 | 3 | 5 }
  | { kind: 'FORWARD_TIME'; seconds: number };
