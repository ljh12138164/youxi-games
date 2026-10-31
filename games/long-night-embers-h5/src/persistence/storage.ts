import {
  SCHEMA_VERSION,
  createInitialProfile,
  verifyRunInvariants,
} from '../core/engine.ts';
import type { ProfileState, RunState } from '../core/types.ts';

export const STORAGE_NAMESPACE = 'youxi:long-night-embers-h5';
const DB_NAME = `${STORAGE_NAMESPACE}:db`;
const DB_VERSION = 1;
const STORE_NAME = 'kv';
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024; // 32 MiB per ROADMAP 8.3

export type SlotSummary = {
  slotId: 1 | 2 | 3;
  exists: boolean;
  characterId?: string;
  stageId?: string;
  level?: number;
  gold?: number;
  saveSeq?: number;
  updatedAt?: string;
  phase?: RunState['phase'];
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
    typeof r.rngState !== 'number' ||
    typeof r.tick !== 'number' ||
    !r.player ||
    !Array.isArray(r.weapons) ||
    !Array.isArray(r.passives)
  ) {
    return { valid: false, error: '存档核心字段缺失或已损坏' };
  }
  const inv = verifyRunInvariants(r as RunState);
  if (!inv.ok) {
    return { valid: false, error: `存档对象校验失败：${inv.errors[0]}` };
  }
  return { valid: true, run: structuredClone(r as RunState) };
}

type StoredSlotRecord = {
  updatedAt: string;
  run: RunState;
  profile: ProfileState;
};

export async function saveSlotBundle(
  slotId: 1 | 2 | 3,
  run: RunState,
  profile: ProfileState,
): Promise<{ ok: boolean; warning?: string }> {
  const check = validateRunStatePayload(run);
  if (!check.valid || !check.run) {
    return { ok: false, warning: check.error };
  }

  check.run.slotId = slotId;
  check.run.saveSeq = (check.run.saveSeq ?? 0) + 1;
  const nextProfile = structuredClone(profile);
  nextProfile.slotId = slotId;

  const now = new Date().toISOString();
  const primaryKey = `${STORAGE_NAMESPACE}:slot:${slotId}`;
  const backupsKey = `${STORAGE_NAMESPACE}:backups:${slotId}`;

  const existingPrimary = await kvGet<StoredSlotRecord>(primaryKey);
  const existingBackups = (await kvGet<StoredSlotRecord[]>(backupsKey)) ?? [];

  const nextBackups = existingPrimary
    ? [existingPrimary, ...existingBackups].slice(0, 3)
    : existingBackups.slice(0, 3);

  const batch: Array<[string, unknown]> = [
    [primaryKey, { updatedAt: now, run: check.run, profile: nextProfile }],
    [backupsKey, nextBackups],
  ];

  const persisted = await kvSetBatch(batch);
  if (!persisted) {
    return {
      ok: true,
      warning: '浏览器限制了 IndexedDB 写入，当前仅保存在内存会话中，建议导出 JSON 备份。',
    };
  }
  return { ok: true };
}

export async function loadSlotBundle(
  slotId: 1 | 2 | 3,
): Promise<{
  run: RunState | null;
  profile: ProfileState;
  restoredFromBackup: boolean;
  error?: string;
}> {
  const primaryKey = `${STORAGE_NAMESPACE}:slot:${slotId}`;
  const backupsKey = `${STORAGE_NAMESPACE}:backups:${slotId}`;

  const primary = await kvGet<StoredSlotRecord>(primaryKey);
  if (primary?.run) {
    const check = validateRunStatePayload(primary.run);
    if (check.valid && check.run) {
      const mergedProfile: ProfileState = {
        ...createInitialProfile(slotId),
        ...primary.profile,
        slotId,
      };
      return { run: check.run, profile: mergedProfile, restoredFromBackup: false };
    }
  }

  const backups = (await kvGet<StoredSlotRecord[]>(backupsKey)) ?? [];
  for (const b of backups) {
    const check = validateRunStatePayload(b?.run);
    if (check.valid && check.run) {
      const mergedProfile: ProfileState = {
        ...createInitialProfile(slotId),
        ...b.profile,
        slotId,
      };
      return {
        run: check.run,
        profile: mergedProfile,
        restoredFromBackup: true,
        error: '主档案校验异常，已自动从最近有效备份恢复。',
      };
    }
  }

  return {
    run: null,
    profile: createInitialProfile(slotId),
    restoredFromBackup: false,
    ...(primary ? { error: '槽位存档已损坏且无可用备份' } : {}),
  };
}

export async function restoreSlotBackup(
  slotId: 1 | 2 | 3,
  backupIndex = 0,
): Promise<{ run: RunState | null; profile: ProfileState | null; error?: string }> {
  const backupsKey = `${STORAGE_NAMESPACE}:backups:${slotId}`;
  const backups = (await kvGet<StoredSlotRecord[]>(backupsKey)) ?? [];
  const target = backups[backupIndex];
  if (!target) {
    return { run: null, profile: null, error: '所选备份不存在' };
  }
  const check = validateRunStatePayload(target.run);
  if (!check.valid || !check.run) {
    return { run: null, profile: null, error: check.error ?? '备份校验未通过' };
  }
  await kvSetBatch([[`${STORAGE_NAMESPACE}:slot:${slotId}`, target]]);
  return { run: check.run, profile: target.profile };
}

export async function deleteSlotBundle(slotId: 1 | 2 | 3): Promise<void> {
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
        characterId: primary.run.characterId,
        stageId: primary.run.stageId,
        level: primary.run.player.level,
        gold: primary.profile?.gold ?? 0,
        saveSeq: primary.run.saveSeq,
        updatedAt: primary.updatedAt,
        phase: primary.run.phase,
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
    return { ok: false, error: '导入文件超过 32 MiB 上限，已拒绝导入' };
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
    ...createInitialProfile(slotId),
    ...obj.profile,
    schemaVersion: SCHEMA_VERSION,
    slotId,
  };

  runCheck.run.slotId = slotId;
  await saveSlotBundle(slotId, runCheck.run, nextProfile);
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

  public canWrite(): void | boolean {
    return !this.isReadOnly;
  }

  public destroy(): void {
    this.channel?.close();
    this.channel = null;
  }
}
