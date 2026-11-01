import type { RunState } from './types.ts';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES = {
  easy: { name: '轻松', berries: 2, monthLength: 'long', hungerDamage: 0.35, graceMonths: 3, firstRaid: 5, raidInterval: 3, description: '开局 2 份浆果，前三个月缺粮至少保留 1 点生命；第 5 月起每 3 月袭击一次。' },
  normal: { name: '标准', berries: 1, monthLength: 'normal', hungerDamage: 0.45, graceMonths: 2, firstRaid: 4, raidInterval: 3, description: '开局 1 份浆果，前两个月缺粮至少保留 1 点生命；第 4 月起每 3 月袭击一次。' },
  hard: { name: '挑战', berries: 0, monthLength: 'short', hungerDamage: 0.55, graceMonths: 1, firstRaid: 3, raidInterval: 2, description: '开局需要自行采集口粮，第一个月缺粮至少保留 1 点生命；第 3 月起每 2 月袭击一次。' },
} as const;
export const difficultyOf = (run: RunState) => DIFFICULTIES[run.difficulty ?? 'easy'];
