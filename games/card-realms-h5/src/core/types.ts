export type CardCategory =
  | 'villager'
  | 'animal'
  | 'food'
  | 'resource'
  | 'harvestable'
  | 'building'
  | 'equipable'
  | 'enemy'
  | 'blueprint'
  | 'rumor'
  | 'portal'
  | 'container'
  | 'boat'
  | 'currency'
  | 'corpse'
  | 'system';

export type ContentGroup = 'base' | 'island' | 'forest' | 'order';
export type RegionId = 'mainland' | 'island' | 'forest';
export type VerificationState = 'pending' | 'referenced' | 'implemented' | 'verified';
export type EquipSlot = 'hand' | 'torso' | 'head';
export type CombatStyle = 'melee' | 'ranged' | 'magic';
export type StatusEffectType = 'poison' | 'stun' | 'bleed' | 'regen';

export type WeightedDrop = {
  cardId: string;
  weight: number;
  count?: number;
};

export type CardDefinition = {
  id: string;
  nameZh: string;
  nameEn: string;
  sourceClass: string;
  category: CardCategory;
  contentGroup: ContentGroup;
  region: RegionId;
  value: number; // -1 表示不可出售
  foodValue: number;
  foodNeed: number;
  spoilMonths: number; // 0 表示不腐败
  countsTowardCapacity: boolean;
  capacityBonus: number;
  maxStack: number;
  maxUses: number;
  maxHp: number;
  attack: number;
  defense: number;
  attackIntervalTicks: number;
  hitChance: number;
  equipSlot?: EquipSlot;
  combatStyle?: CombatStyle;
  roleOnEquip?: string;
  statusOnHit?: {
    type: StatusEffectType;
    chance: number;
    durationTicks: number;
  };
  harvestDrops?: WeightedDrop[];
  harvestTicks?: number;
  containerAcceptedCategories?: CardCategory[];
  containerAcceptedIds?: string[];
  containerMax?: number;
  travelMaxUnits?: number;
  travelTargetRegion?: RegionId;
  unlocksRecipeId?: string;
  description: string;
  sourceRef: string;
  verification: VerificationState;
  excludedReason?: string;
};

export type RecipeOutput = {
  cardId: string;
  count: number;
  chance?: number;
};

export type RecipeDefinition = {
  id: string;
  nameZh: string;
  inputs: Record<string, number>;
  catalysts: string[];
  requireWorker: boolean;
  workerIds?: string[];
  durationTicks: number;
  outputs: RecipeOutput[];
  ideaCardId?: string;
  region: RegionId | 'any';
  loopable: boolean;
  description: string;
  sourceRef: string;
  verification: VerificationState;
};

export type BoosterPackSlot = {
  label: string;
  pool: WeightedDrop[];
};

export type BoosterPackDefinition = {
  id: string;
  nameZh: string;
  region: RegionId;
  cost: number;
  currencyCardId: 'gold' | 'shell';
  cardCount: number;
  slots: BoosterPackSlot[];
  unlockCondition: {
    type: 'start' | 'questCount' | 'ideaFound' | 'regionReached';
    count?: number;
    targetId?: string;
  };
  description: string;
  sourceRef: string;
  verification: VerificationState;
};

export type QuestDefinition = {
  id: string;
  nameZh: string;
  description: string;
  group: ContentGroup;
  region: RegionId;
  condition: {
    type:
      | 'haveCard'
      | 'haveCategoryCount'
      | 'craftCard'
      | 'killCard'
      | 'openPackCount'
      | 'reachMonth'
      | 'reachRegion';
    targetId?: string;
    category?: CardCategory;
    count: number;
  };
  rewardCardId?: string;
  sourceRef: string;
  verification: VerificationState;
};

export type StatusEffectInstance = {
  type: StatusEffectType;
  ticksRemaining: number;
  stacks: number;
};

export type CardInstance = {
  instanceId: string;
  defId: string;
  region: RegionId;
  hp: number;
  maxHp: number;
  remainingUses: number;
  storedDefId?: string;
  storedCount: number;
  spoilAge: number;
  equipment: Partial<Record<EquipSlot, string>>;
  equippedOnInstanceId?: string;
  statusEffects: StatusEffectInstance[];
};

export type Stack = {
  stackId: string;
  region: RegionId;
  x: number;
  y: number;
  z: number;
  cardIds: string[];
  lockedByEncounterId?: string;
};

export type Job = {
  jobId: string;
  stackId: string;
  recipeId: string;
  region: RegionId;
  totalTicks: number;
  elapsedTicks: number;
  inputSignature: string;
};

export type Encounter = {
  encounterId: string;
  region: RegionId;
  x: number;
  y: number;
  friendlyIds: string[];
  enemyIds: string[];
  cooldowns: Record<string, number>;
  ticksElapsed: number;
  lastActionText: string;
};

export type BoardState = {
  region: RegionId;
  stacks: Record<string, Stack>;
  jobs: Record<string, Job>;
  encounters: Record<string, Encounter>;
  nextZ: number;
};

export type PauseReason =
  | 'home'
  | 'manual'
  | 'menu'
  | 'drag'
  | 'sidebar'
  | 'boss'
  | 'hidden'
  | 'settlement';

export type MonthLengthOption = 'short' | 'normal' | 'long';
export type MonthEndPhase = 'feed' | 'spoil' | 'capacity' | 'events' | null;

export type RunStats = {
  cardsSold: number;
  packsOpened: number;
  enemiesKilled: number;
  craftedByDef: Record<string, number>;
  killedByDef: Record<string, number>;
  packsOpenedById: Record<string, number>;
};

export type RunState = {
  difficulty?: import('./difficulty.ts').Difficulty;
  schemaVersion: number;
  contentVersion: string;
  baselineId: string;
  saveSeq: number;
  slotId: 1 | 2 | 3;
  rngState: number;
  tickCount: number;
  month: number;
  monthTicksElapsed: number;
  monthDurationTicks: number;
  speed: 0 | 1 | 2;
  manualPaused: boolean;
  peacefulMode: boolean;
  monthLengthOption: MonthLengthOption;
  activeRegion: RegionId;
  unlockedRegions: RegionId[];
  boards: Record<RegionId, BoardState>;
  instances: Record<string, CardInstance>;
  nextInstanceNum: number;
  nextStackNum: number;
  nextJobNum: number;
  nextEncounterNum: number;
  monthEndPhase: MonthEndPhase;
  monthEndLog: string[];
  forestWave: number;
  isGameOver: boolean;
  gameOverReason?: string;
  isVictory: boolean;
  stats: RunStats;
  recentEvents: string[];
};

export type UserSettings = {
  musicVolume: number;
  sfxVolume: number;
  userMuted: boolean;
  pauseOnDrag: boolean;
  gridSnap: boolean;
  reducedMotion: boolean;
  pauseKey: string;
};

export type ProfileState = {
  schemaVersion: number;
  discoveredCards: string[];
  discoveredIdeas: string[];
  completedQuests: string[];
  settings: UserSettings;
};

export type GameCommand =
  | {
      type: 'MOVE_CARDS';
      sourceStackId: string;
      startCardIndex: number;
      x: number;
      y: number;
      targetStackId?: string;
    }
  | { type: 'SELL_STACK'; stackId: string; startCardIndex?: number }
  | { type: 'BUY_PACK'; packId: string; x?: number; y?: number }
  | { type: 'ADVANCE_MONTH_PHASE' }
  | { type: 'SET_SPEED'; speed: 0 | 1 | 2 }
  | { type: 'TOGGLE_MANUAL_PAUSE' }
  | { type: 'SET_PAUSE_REASON'; reason: PauseReason; active: boolean }
  | { type: 'SWITCH_REGION'; region: RegionId }
  | { type: 'TRAVEL_BOAT'; boatStackId: string; targetRegion: RegionId }
  | { type: 'ENTER_PORTAL'; portalStackId: string }
  | { type: 'RETREAT_FOREST' }
  | { type: 'AUTO_ARRANGE_BOARD' }
  | { type: 'UNEQUIP_ITEM'; villagerInstanceId: string; slot: EquipSlot };
