import { createRuleGame } from '../src/game.ts';
import { TONES } from '../src/audio.ts';

type Touch = { identifier: number; clientX: number; clientY: number };
type TouchEvent = { touches: Touch[]; changedTouches: Touch[] };
type Clip = { src: string; volume: number; play: () => void; stop: () => void };
declare const tt: {
  createCanvas: () => HTMLCanvasElement; createImage: () => HTMLImageElement; createInnerAudioContext: () => Clip;
  getSystemInfoSync: () => { windowWidth: number; windowHeight: number; pixelRatio: number; safeArea?: { top: number; bottom: number } };
  getStorageSync: (key: string) => unknown; setStorageSync: (key: string, value: string) => void;
  onTouchStart: (fn: (event: TouchEvent) => void) => void; onTouchMove: (fn: (event: TouchEvent) => void) => void;
  onTouchEnd: (fn: (event: TouchEvent) => void) => void; onTouchCancel: (fn: () => void) => void;
  onHide: (fn: () => void) => void; onShow: (fn: () => void) => void; onWindowResize?: (fn: () => void) => void;
};
const canvas = tt.createCanvas(), key = 'youxi:rule-kitten-h5:douyin:save:v1';
let muted = false, paused = true;
const clips: Partial<Record<keyof typeof TONES, Clip>> = {};
function stop() { for (const clip of Object.values(clips)) { try { clip?.stop(); } catch { /* Optional audio. */ } } }
const game = createRuleGame({
  canvas, createImage: () => tt.createImage(), atlas: 'assets/atlas-paper-v1.png',
  ready: () => report('ready'),
  viewport: () => {
    const info = tt.getSystemInfoSync();
    return { width: info.windowWidth, height: info.windowHeight, dpr: info.pixelRatio || 1,
      top: (info.safeArea?.top ?? 24) + 36, bottom: Math.max(12, info.windowHeight - (info.safeArea?.bottom ?? info.windowHeight)) };
  },
  load: () => { try { const value = tt.getStorageSync(key); return typeof value === 'string' ? value : null; } catch { return null; } },
  save: value => { try { tt.setStorageSync(key, value); } catch { /* Storage may be unavailable. */ } },
  sound: {
    play: kind => {
      if (muted || paused) return;
      try { let clip = clips[kind]; if (!clip) { clip = tt.createInnerAudioContext(); clip.src = `assets/${kind}.wav`; clip.volume = .2; clips[kind] = clip; } clip.stop(); clip.play(); } catch { /* Puzzles remain playable without audio. */ }
    },
    setMuted: value => { muted = value; if (value) stop(); }, setPaused: value => { paused = value; if (value) stop(); },
  },
});
let activeTouch: number | null = null;
let lastReport = '';
function report(reason: string) {
  const state = game.getState();
  const snapshot = { ready: state.ready, screen: state.screen, level: state.level, steps: state.board.steps, won: state.board.won, paused: state.paused, running: state.running, completed: state.completed, muted: state.muted, reducedMotion: state.feedback.reducedMotion };
  const signature = JSON.stringify(snapshot);
  if (signature !== lastReport) { lastReport = signature; console.info('rule-kitten-state', reason, signature); }
}
function touch(event: TouchEvent, type: 'down' | 'move' | 'up') {
  if (type === 'down' && activeTouch !== null) return;
  const point = event.changedTouches.find(p => activeTouch === null || p.identifier === activeTouch); if (!point) return;
  if (type === 'down') activeTouch = point.identifier;
  game.input(type, point.clientX, point.clientY); if (type === 'up') activeTouch = null; report(type);
}
tt.onTouchStart(event => touch(event, 'down')); tt.onTouchMove(event => touch(event, 'move')); tt.onTouchEnd(event => touch(event, 'up'));
tt.onTouchCancel(() => { activeTouch = null; game.input('cancel', 0, 0); });
tt.onHide(() => { activeTouch = null; game.setPause('hidden', true); report('hide'); }); tt.onShow(() => { game.setPause('hidden', false); report('show'); }); tt.onWindowResize?.(game.resize);
let previous = Date.now();
function frame() { const now = Date.now(); game.tick(now - previous); previous = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
Object.assign(globalThis, { __ruleKitten: { getState: game.getState, getHits: game.getHits, isMuted: game.isMuted } });
