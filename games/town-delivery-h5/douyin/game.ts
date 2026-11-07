import { createTownGame } from '../src/game.ts';

type Touch = { identifier: number; clientX: number; clientY: number };
type TouchEvent = { touches: Touch[]; changedTouches: Touch[] };
declare const tt: {
  createCanvas: () => HTMLCanvasElement;
  getSystemInfoSync: () => { windowWidth: number; windowHeight: number; pixelRatio: number; safeArea?: { top: number; bottom: number } };
  getStorageSync: (key: string) => unknown; setStorageSync: (key: string, value: number) => void;
  onTouchStart: (fn: (event: TouchEvent) => void) => void;
  onTouchMove: (fn: (event: TouchEvent) => void) => void;
  onTouchEnd: (fn: (event: TouchEvent) => void) => void;
  onTouchCancel: (fn: () => void) => void;
  onHide: (fn: () => void) => void; onShow: (fn: () => void) => void;
  onWindowResize?: (fn: () => void) => void;
};
const canvas = tt.createCanvas(), key = 'youxi:town-delivery-h5:douyin:best:v1';
const game = createTownGame({
  canvas,
  viewport: () => {
    const info = tt.getSystemInfoSync();
    return { width: info.windowWidth, height: info.windowHeight, dpr: info.pixelRatio || 1,
      top: (info.safeArea?.top ?? 24) + 36, bottom: Math.max(12, info.windowHeight - (info.safeArea?.bottom ?? info.windowHeight)) };
  },
  readBest: () => { try { const value = Number(tt.getStorageSync(key)); return Number.isFinite(value) ? Math.max(0, value) : 0; } catch { return 0; } },
  writeBest: score => { try { tt.setStorageSync(key, score); } catch { /* Best score is optional. */ } },
});
let activeTouch: number | null = null;
function touch(event: TouchEvent, type: 'down' | 'move' | 'up') {
  if (type === 'down' && activeTouch !== null) return;
  const point = event.changedTouches.find(t => activeTouch === null || t.identifier === activeTouch);
  if (!point) return;
  if (type === 'down') activeTouch = point.identifier;
  game.input(type, point.clientX, point.clientY);
  if (type === 'up') activeTouch = null;
}
tt.onTouchStart(event => touch(event, 'down'));
tt.onTouchMove(event => touch(event, 'move'));
tt.onTouchEnd(event => touch(event, 'up'));
tt.onTouchCancel(() => { activeTouch = null; game.input('cancel', 0, 0); });
tt.onHide(() => { activeTouch = null; game.setPause('hidden', true); });
tt.onShow(() => game.setPause('hidden', false));
tt.onWindowResize?.(game.resize);
let previous = Date.now();
function frame() { const now = Date.now(); game.tick(now - previous); previous = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
Object.assign(globalThis, { __townGame: { getState: game.getState, getHits: game.getHits, isMuted: game.isMuted } });
