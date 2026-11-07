export const TONES = { move: 280, rule: 660, win: 880, tap: 400 };
export type SoundKind = keyof typeof TONES;
export type Sound = { play: (kind: SoundKind) => void; setMuted: (muted: boolean) => void; setPaused: (paused: boolean) => void };
