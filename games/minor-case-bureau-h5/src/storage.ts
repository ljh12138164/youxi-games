import type { CaseDefinition, DataTable, SqlValue } from './types.ts';

export type AppName = 'messages' | 'clues' | 'query' | 'browser' | 'notepad' | 'manual' | 'music' | 'settings' | 'submit' | 'assistant' | 'cases' | 'tables';
export type WindowState = { id: AppName; x: number; y: number; w: number; h: number; z: number; open: boolean; minimized: boolean };
export type QueryTab = { id: number; title: string; sql: string };
export type CaseProgress = {
  acquired: string[]; savedTables: DataTable[]; tabs: QueryTab[]; activeTab: number; history: string[];
  notes: string; noteColor: string; clue: number; webHistory: string[]; webIndex: number; bookmarks: string[];
  logins: string[]; forms: string[]; drafts: Record<string, string>; hints: number; sqlHints: number; readBrief: boolean;
};
export type RecordEntry = { caseId: number; suspect: SqlValue; name: string; correct: boolean; at: string };
export type GameSave = {
  version: 1; seed: number; caseId: number; unlocked: number; elapsed: number;
  progress: Record<string, CaseProgress>; records: RecordEntry[]; windows: WindowState[];
  settings: { master: number; music: number; effects: number; fontSize: number; reducedMotion: boolean; muted: boolean };
  ending?: 'good' | 'bad';
};
const KEY = 'minor-case-bureau-h5:save:v1';
type Envelope = { revision: number; updated: string; data: GameSave };

export function initialWindows(width = 1600, height = 900): WindowState[] {
  const usable = height - 82;
  const positions: [AppName, number, number, number, number, boolean][] = [
    ['messages', .22, .11, .46, .66, false], ['clues', .135, .065, .315, .80, true],
    ['query', .458, .055, .37, .82, true], ['assistant', .828, .53, .16, .34, true],
    ['browser', .19, .06, .62, .83, false], ['notepad', .28, .10, .35, .64, false],
    ['manual', .18, .05, .65, .86, false], ['music', .30, .12, .38, .68, false],
    ['settings', .32, .10, .35, .74, false], ['submit', .29, .07, .44, .82, false],
    ['cases', .24, .06, .49, .86, false], ['tables', .21, .08, .56, .79, false],
  ];
  return positions.map(([id, x, y, w, h, open], index) => ({ id, x: Math.round(width * x), y: Math.round(38 + usable * y), w: Math.max(id === 'assistant' ? 208 : 320, Math.round(width * w)), h: Math.round(usable * h), z: index + 1, open, minimized: false }));
}

export function newGame(width?: number, height?: number): GameSave {
  const seed = globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
  return { version: 1, seed, caseId: 1, unlocked: 1, elapsed: 0, progress: {}, records: [], windows: initialWindows(width, height), settings: { master: .6, music: .22, effects: .4, fontSize: 15, reducedMotion: false, muted: false } };
}

export function newCaseProgress(level: CaseDefinition): CaseProgress {
  return { acquired: [...level.initialTables], savedTables: [], tabs: [{ id: 1, title: '查询 1', sql: `SELECT *\nFROM ${level.initialTables[0] ?? 'suspects'};` }], activeTab: 1, history: [], notes: '', noteColor: '#f1e2ad', clue: 0, webHistory: ['内网主页'], webIndex: 0, bookmarks: [], logins: [], forms: [], drafts: {}, hints: 0, sqlHints: 0, readBrief: false };
}

function isTable(value: unknown): value is DataTable {
  if (!value || typeof value !== 'object') return false;
  const t = value as DataTable;
  return typeof t.name === 'string' && typeof t.label === 'string' && typeof t.description === 'string' && Array.isArray(t.columns) && t.columns.length > 0 && t.columns.every(c => c && typeof c.name === 'string' && typeof c.label === 'string' && ['TEXT', 'INTEGER', 'REAL'].includes(c.type)) && Array.isArray(t.rows) && t.rows.every(row => Array.isArray(row) && row.length === t.columns.length && row.every(v => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))));
}

export function parseSave(value: unknown): GameSave {
  if (!value || typeof value !== 'object') throw new Error('这不是有效的调查存档。');
  const s = value as GameSave;
  if (s.version !== 1 || !Number.isInteger(s.seed) || !Number.isInteger(s.caseId) || s.caseId < 1 || s.caseId > 10 || !Number.isInteger(s.unlocked) || s.unlocked < s.caseId || s.unlocked > 10 || !Number.isFinite(s.elapsed) || s.elapsed < 0 || !s.progress || typeof s.progress !== 'object' || !Array.isArray(s.records) || !Array.isArray(s.windows) || !s.settings) throw new Error('存档版本或案卷信息不完整。当前进度未被覆盖。');
  for (const p of Object.values(s.progress)) {
    if (!p || !Array.isArray(p.acquired) || !p.acquired.every(v => typeof v === 'string') || !Array.isArray(p.savedTables) || !p.savedTables.every(isTable) || !Array.isArray(p.tabs) || !p.tabs.length || !p.tabs.every(t => typeof t.id === 'number' && typeof t.title === 'string' && typeof t.sql === 'string') || !p.tabs.some(t => t.id === p.activeTab) || typeof p.notes !== 'string' || !Array.isArray(p.history) || !Array.isArray(p.webHistory) || !Array.isArray(p.bookmarks) || !Array.isArray(p.logins) || !Array.isArray(p.forms) || typeof p.drafts !== 'object' || !Number.isInteger(p.hints) || !Number.isInteger(p.sqlHints)) throw new Error('存档内有无法读取的调查记录。当前进度未被覆盖。');
  }
  if (!['master', 'music', 'effects'].every(k => typeof s.settings[k as 'master'] === 'number' && s.settings[k as 'master'] >= 0 && s.settings[k as 'master'] <= 1)) throw new Error('存档音量设置无效。');
  if (![13, 15, 17, 19].includes(s.settings.fontSize)) throw new Error('存档字号设置无效。');
  return s;
}

export function loadGame(): { save: GameSave | null; revision: number; warning?: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { save: null, revision: 0 };
    const stored = JSON.parse(raw) as Envelope;
    return { save: parseSave(stored.data), revision: stored.revision };
  } catch {
    try {
      const backup = JSON.parse(localStorage.getItem(`${KEY}:backup`) ?? 'null') as Envelope | null;
      if (backup) return { save: parseSave(backup.data), revision: 0, warning: '主存档无法读取，已载入备份。请先导出一份存档，再选择保存恢复的进度。' };
    } catch { /* Keep damaged data available for manual recovery. */ }
    return { save: null, revision: 0, warning: '已有存档无法读取，尚未覆盖。可以先导出原始存档，再开始新调查。' };
  }
}

export function persistGame(save: GameSave, revision: number): number {
  const previous = localStorage.getItem(KEY);
  let current = 0;
  if (previous) { try { current = (JSON.parse(previous) as Envelope).revision; } catch { throw new Error('主存档损坏，自动保存已停止。请先导出备份，再确认恢复。'); } }
  if (current !== revision) throw new Error('另一页已经保存了新进度。请读取最新存档，避免覆盖。');
  const next = JSON.stringify({ revision: revision + 1, updated: new Date().toISOString(), data: save } satisfies Envelope);
  if (previous) localStorage.setItem(`${KEY}:backup`, previous);
  localStorage.setItem(KEY, next);
  return revision + 1;
}

export function recoverGame(save: GameSave): number {
  const previous = localStorage.getItem(KEY);
  if (previous) localStorage.setItem(`${KEY}:damaged`, previous);
  localStorage.removeItem(KEY);
  return persistGame(save, 0);
}

export const SAVE_KEY = KEY;
