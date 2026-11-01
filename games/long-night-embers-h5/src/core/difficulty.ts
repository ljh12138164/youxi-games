import type { RunState } from './types.ts';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES = {
  easy: { name: '轻松', hp: 1.25, recovery: 0.3, revival: 1, reroll: 2, skip: 1, magnet: 96, invulnerability: 45, damage: 0.75, earlySpawn: 1.5, lateSpawn: 1.2, earlyQuota: 6, lateQuota: 12, refillTicks: 20, description: '基础生命 +25%，每秒恢复 0.3，额外复活 1 次；受伤更轻，敌潮更缓。' },
  normal: { name: '标准', hp: 1.1, recovery: 0.1, revival: 0, reroll: 1, skip: 1, magnet: 80, invulnerability: 36, damage: 0.9, earlySpawn: 1.25, lateSpawn: 1.05, earlyQuota: 8, lateQuota: 14, refillTicks: 16, description: '基础生命 +10%，每秒恢复 0.1，无额外复活；保留重抽与跳过各 1 次。' },
  hard: { name: '挑战', hp: 1, recovery: 0, revival: 0, reroll: 0, skip: 0, magnet: 72, invulnerability: 30, damage: 1.1, earlySpawn: 1, lateSpawn: 0.9, earlyQuota: 10, lateQuota: 16, refillTicks: 12, description: '基础生命，无额外回血、复活或重抽；受伤更重，敌潮更密。角色与强化仍可提供加成。' },
} as const;
export const difficultyOf = (run: RunState) => DIFFICULTIES[run.difficulty ?? 'easy'];
