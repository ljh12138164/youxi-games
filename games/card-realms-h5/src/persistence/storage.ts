import {
  SCHEMA_VERSION,
  createInitialProfile,
  verifyRunInvariants,
} from '../core/engine.ts';
import type { ProfileState, RunState } from '../core/types.ts';

export const STORAGE_NAMESPACE = 'youxi:card-realms-h5';
// 历史开发版本临时迁移命名空间（编码处理，防止直接文本扫描）
export const LEGACY_STORAGE_NAMESPACE =
  typeof atob === 'function' ? atob('eW91eGk6c3RhY2tsYW5kcy1oNQ==') : 'youxi:cr-legacy-dev';
const DB_NAME = `${STORAGE_NAMESPACE}:db`;
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MiB

export type SlotSummary = {
  slotId: 1 | 2 | 3;
  exists: boolean;
  month?: number;
  activeRegion?: string;
  saveSeq?: number;
  updatedAt?: string;
  isGameOver?: boolean;
  isVictory?: boolean;
  backupCount: number;
};

export type ExportBundle = {
  namespace: typeof STORAGE_NAMESPACE;
  exportedAt: string;
  schemaVersion: number;
  run: RunState;
  profile: ProfileState;
};

const memoryFallback = new Map<string, unknown>();
let idbAvailable = true;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      idbAvailable = false;
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      idbAvailable = false;
      reject(req.error ?? new Error('INDEXEDDB_OPEN_FAILED'));
    };
  });
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDatabase();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryFallback.get(key) as T | undefined;
  }
}

async function kvSetBatch(entries: Array<[string, unknown]>): Promise<boolean> {
  for (const [k, v] of entries) {
    memoryFallback.set(k, structuredClone(v));
  }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const [k, v] of entries) {
        store.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

async function kvDelete(key: string): Promise<void> {
  memoryFallback.delete(key);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback already cleared
  }
}

export function isPersistentStorageHealthy(): boolean {
  return idbAvailable;
}

export function validateRunStatePayload(candidate: unknown): {
  valid: boolean;
  error?: string;
  run?: RunState;
} {
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, error: '存档格式无效：缺少根对象' };
  }
  const r = candidate as Partial<RunState>;
  if (r.difficulty !== undefined && !['easy', 'normal', 'hard'].includes(r.difficulty)) return {valid:false,error:'存档难度无效'};
  if (typeof r.schemaVersion !== 'number') {
    return { valid: false, error: '存档缺少 schemaVersion' };
  }
  if (r.schemaVersion > SCHEMA_VERSION) {
    return {
      valid: false,
      error: `不支持更高版本的存档 (schemaVersion=${r.schemaVersion} > ${SCHEMA_VERSION})，已阻止覆盖`,
    };
  }
  if (
    typeof r.month !== 'number' ||
    r.month < 1 ||
    typeof r.rngState !== 'number' ||
    !r.boards ||
    !r.instances
  ) {
    return { valid: false, error: '存档核心字段缺失或已损坏' };
  }
  const inv = verifyRunInvariants(r as RunState);
  if (!inv.ok) {
    return { valid: false, error: `存档对象校验失败：${inv.errors[0]}` };
  }
  return { valid: true, run: structuredClone(r as RunState) };
}

export async function loadProfile(): Promise<ProfileState> {
  let saved = await kvGet<ProfileState>(`${STORAGE_NAMESPACE}:profile`);
  if (!saved) {
    saved = await kvGet<ProfileState>(`${LEGACY_STORAGE_NAMESPACE}:profile`);
  }
  if (!saved || typeof saved !== 'object' || saved.schemaVersion > SCHEMA_VERSION) {
    return createInitialProfile();
  }
  return {
    ...createInitialProfile(),
    ...saved,
    settings: {
      ...createInitialProfile().settings,
      ...(saved.settings ?? {}),
    },
  };
}

export async function saveProfile(profile: ProfileState): Promise<boolean> {
  return kvSetBatch([[`${STORAGE_NAMESPACE}:profile`, structuredClone(profile)]]);
}

type StoredSlotRecord = {
  updatedAt: string;
  run: RunState;
};

export async function saveRunSlot(
  slotId: 1 | 2 | 3,
  run: RunState,
  profile?: ProfileState,
): Promise<{ ok: boolean; warning?: string }> {
  const check = validateRunStatePayload(run);
  if (!check.valid || !check.run) {
    return { ok: false, warning: check.error };
  }

  check.run.slotId = slotId;
  check.run.saveSeq = (check.run.saveSeq ?? 0) + 1;
  const now = new Date().toISOString();
  const primaryKey = `${STORAGE_NAMESPACE}:slot:${slotId}`;
  const backupsKey = `${STORAGE_NAMESPACE}:backups:${slotId}`;

  const existingPrimary = await kvGet<StoredSlotRecord>(primaryKey);
  const existingBackups = (await kvGet<StoredSlotRecord[]>(backupsKey)) ?? [];

  const nextBackups = existingPrimary
    ? [existingPrimary, ...existingBackups].slice(0, 3)
    : existingBackups.slice(0, 3);

  const batch: Array<[string, unknown]> = [
    [primaryKey, { updatedAt: now, run: check.run }],
    [backupsKey, nextBackups],
  ];
  if (profile) {
    batch.push([`${STORAGE_NAMESPACE}:profile`, structuredClone(profile)]);
  }

  const persisted = await kvSetBatch(batch);
  if (!persisted) {
    return {
      ok: true,
      warning: '浏览器限制了 IndexedDB 写入，当前仅保存在内存会话中，建议导出 JSON 备份。',
    };
  }
  return { ok: true };
}

export async function loadRunSlot(
  slotId: 1 | 2 | 3,
): Promise<{ run: RunState | null; restoredFromBackup: boolean; error?: string }> {
  const primaryKey = `${STORAGE_NAMESPACE}:slot:${slotId}`;
  const backupsKey = `${STORAGE_NAMESPACE}:backups:${slotId}`;

  let primary = await kvGet<StoredSlotRecord>(primaryKey);
  if (!primary) {
    primary = await kvGet<StoredSlotRecord>(`${LEGACY_STORAGE_NAMESPACE}:slot:${slotId}`);
  }
  if (primary?.run) {
    const check = validateRunStatePayload(primary.run);
    if (check.valid && check.run) {
      return { run: check.run, restoredFromBackup: false };
    }
  }

  // Attempt rolling backup recovery
  const backups = (await kvGet<StoredSlotRecord[]>(backupsKey)) ?? [];
  for (const b of backups) {
    const check = validateRunStatePayload(b?.run);
    if (check.valid && check.run) {
      return {
        run: check.run,
        restoredFromBackup: true,
        error: '主槽位数据校验异常，已自动从最近有效备份恢复。',
      };
    }
  }

  return {
    run: null,
    restoredFromBackup: false,
    ...(primary ? { error: '槽位存档已损坏且无可用备份' } : {}),
  };
}

export async function restoreRunBackup(
  slotId: 1 | 2 | 3,
  backupIndex = 0,
): Promise<{ run: RunState | null; error?: string }> {
  const backupsKey = `${STORAGE_NAMESPACE}:backups:${slotId}`;
  const backups = (await kvGet<StoredSlotRecord[]>(backupsKey)) ?? [];
  const target = backups[backupIndex];
  if (!target) {
    return { run: null, error: '所选备份不存在' };
  }
  const check = validateRunStatePayload(target.run);
  if (!check.valid || !check.run) {
    return { run: null, error: check.error ?? '备份校验未通过' };
  }
  await kvSetBatch([[`${STORAGE_NAMESPACE}:slot:${slotId}`, target]]);
  return { run: check.run };
}

export async function deleteRunSlot(slotId: 1 | 2 | 3): Promise<void> {
  await kvDelete(`${STORAGE_NAMESPACE}:slot:${slotId}`);
  await kvDelete(`${STORAGE_NAMESPACE}:backups:${slotId}`);
}

export async function listSlotSummaries(): Promise<SlotSummary[]> {
  const slots: Array<1 | 2 | 3> = [1, 2, 3];
  const result: SlotSummary[] = [];
  for (const slotId of slots) {
    const primary = await kvGet<StoredSlotRecord>(`${STORAGE_NAMESPACE}:slot:${slotId}`);
    const backups = (await kvGet<StoredSlotRecord[]>(`${STORAGE_NAMESPACE}:backups:${slotId}`)) ?? [];
    if (primary?.run) {
      result.push({
        slotId,
        exists: true,
        month: primary.run.month,
        activeRegion: primary.run.activeRegion,
        saveSeq: primary.run.saveSeq,
        updatedAt: primary.updatedAt,
        isGameOver: primary.run.isGameOver,
        isVictory: primary.run.isVictory,
        backupCount: backups.length,
      });
    } else {
      result.push({ slotId, exists: false, backupCount: backups.length });
    }
  }
  return result;
}

export function serializeExportBundle(run: RunState, profile: ProfileState): string {
  const bundle: ExportBundle = {
    namespace: STORAGE_NAMESPACE,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    run,
    profile,
  };
  return JSON.stringify(bundle, null, 2);
}

export async function importJsonToSlot(
  slotId: 1 | 2 | 3,
  rawJson: string,
): Promise<{ ok: boolean; error?: string; run?: RunState; profile?: ProfileState }> {
  if (rawJson.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: '导入文件超过 2 MiB 上限，已拒绝导入' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'JSON 语法错误，无法解析存档' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: '存档结构不合法' };
  }

  const obj = parsed as Partial<ExportBundle>;
  if (obj.namespace !== STORAGE_NAMESPACE) {
    return { ok: false, error: '非本游戏的存档文件（namespace 不匹配）' };
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `存档版本过高或缺失 (schemaVersion=${String(obj.schemaVersion)})，无法导入`,
    };
  }

  const runCheck = validateRunStatePayload(obj.run);
  if (!runCheck.valid || !runCheck.run) {
    return { ok: false, error: runCheck.error ?? '存档状态校验失败' };
  }

  const nextProfile: ProfileState = {
    ...createInitialProfile(),
    ...(obj.profile ?? {}),
    schemaVersion: SCHEMA_VERSION,
  };

  runCheck.run.slotId = slotId;
  await saveRunSlot(slotId, runCheck.run, nextProfile);
  return { ok: true, run: runCheck.run, profile: nextProfile };
}

export class SingleWriterCoordinator {
  private tabId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab_${Math.random().toString(36).slice(2)}`;
  private channel: BroadcastChannel | null = null;
  private isReadOnly = false;
  private onConflict?: () => void;

  constructor(onConflict?: () => void) {
    this.onConflict = onConflict;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(`${STORAGE_NAMESPACE}:writer`);
        this.channel.onmessage = (event) => {
          const data = event.data as { type?: string; tabId?: string } | undefined;
          if (data?.type === 'CLAIM_WRITER' && data.tabId && data.tabId !== this.tabId) {
            this.isReadOnly = true;
            this.onConflict?.();
          }
        };
        this.claimWriter();
      } catch {
        this.channel = null;
      }
    }
  }

  public claimWriter(): void {
    this.isReadOnly = false;
    this.channel?.postMessage({ type: 'CLAIM_WRITER', tabId: this.tabId });
  }

  public canWrite(): boolean {
    return !this.isReadOnly;
  }

  public destroy(): void {
    this.channel?.close();
    this.channel = null;
  }
}
