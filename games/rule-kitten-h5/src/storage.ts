import type { Board, Entity } from './engine.ts';
import { LEVELS } from './levels.ts';

export type Progress = { version: 1; level: number; unlocked: number; completed: number[]; best: Record<number, number>; muted: boolean; reducedMotion: boolean; board?: Board; history?: Board[] };
export const freshProgress = (): Progress => ({ version: 1, level: 0, unlocked: 1, completed: [], best: {}, muted: false, reducedMotion: false });
function validBoard(value: unknown, level: number): value is Board {
  if (!value || typeof value !== 'object') return false;
  const board = value as Board, original = LEVELS[level].entities;
  return Number.isInteger(board.steps) && board.steps >= 0 && board.steps <= 100000 && typeof board.won === 'boolean' && Array.isArray(board.entities)
    && board.entities.length <= original.length && new Set(board.entities.map((e: Entity) => e?.id)).size === board.entities.length
    && board.entities.every((e: Entity) => e && original[e.id] && e.kind === original[e.id].kind && e.word === original[e.id].word
      && Number.isInteger(e.x) && Number.isInteger(e.y) && e.x >= 0 && e.x < 9 && e.y >= 0 && e.y < 10);
}
export function readProgress(raw: string | null): Progress {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || value.version !== 1 || !Number.isInteger(value.level) || value.level < 0 || value.level >= LEVELS.length
      || !Number.isInteger(value.unlocked) || value.unlocked < 1 || value.unlocked > LEVELS.length || value.level >= value.unlocked) return freshProgress();
    const result: Progress = { ...freshProgress(), level: value.level, unlocked: value.unlocked, muted: value.muted === true, reducedMotion: value.reducedMotion === true };
    if (Array.isArray(value.completed)) result.completed = [...new Set<number>(value.completed.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < value.unlocked))];
    result.unlocked = Math.min(LEVELS.length, Math.max(result.unlocked, ...result.completed.map(n => n + 2)));
    if (value.best && typeof value.best === 'object') for (const [key, steps] of Object.entries(value.best)) {
      if (result.completed.includes(Number(key)) && Number.isInteger(steps) && Number(steps) >= 0) result.best[Number(key)] = Number(steps);
    }
    if (validBoard(value.board, result.level)) {
      result.board = value.board;
      if (Array.isArray(value.history) && value.history.every((b: unknown) => validBoard(b, result.level))) result.history = value.history.slice(-64);
    }
    return result;
  } catch { return freshProgress(); }
}
