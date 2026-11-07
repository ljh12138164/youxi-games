import './style.css';
import { createTownGame } from './game.ts';
import { connectYouxiPlatform } from '@shared/platform';

const root = document.getElementById('root')!;
root.className = 'fixed inset-0 overflow-hidden';
root.innerHTML = '<canvas class="block h-full w-full touch-none" tabindex="0" aria-label="小镇配送地图：拖动画路连接面包房和住宅"></canvas><div class="sr-only" id="controls"></div>';
const canvas = root.querySelector('canvas')!;
const controls = root.querySelector<HTMLDivElement>('#controls')!;
const key = 'youxi:town-delivery-h5:best:v1';
let game: ReturnType<typeof createTownGame>;
game = createTownGame({
  canvas, viewport: () => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, top: 0, bottom: 0 }),
  readBest: () => { try { return Math.max(0, Number(localStorage.getItem(key)) || 0); } catch { return 0; } },
  writeBest: score => { try { localStorage.setItem(key, String(score)); } catch { /* Best score is optional. */ } },
  onControls: hits => {
    controls.replaceChildren(...hits.map(hit => {
      const button = document.createElement('button'); button.textContent = hit.label; button.disabled = !hit.enabled;
      button.onclick = () => game.getHits().find(h => h.label === hit.label)?.tap(); return button;
    }));
  },
});
let activePointer: number | null = null;
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activePointer !== null) return;
  activePointer = event.pointerId; canvas.setPointerCapture(event.pointerId); canvas.focus(); game.input('down', event.clientX, event.clientY);
});
canvas.addEventListener('pointermove', event => { if (activePointer === null || activePointer === event.pointerId) game.input('move', event.clientX, event.clientY); });
canvas.addEventListener('pointerup', event => { if (activePointer === event.pointerId) { game.input('up', event.clientX, event.clientY); activePointer = null; } });
canvas.addEventListener('pointercancel', () => { activePointer = null; game.input('cancel', 0, 0); });
canvas.addEventListener('keydown', event => {
  if (event.code === 'Space') { event.preventDefault(); game.getHits().find(h => /开始营业|继续配送|暂停规划/.test(h.label))?.tap(); }
});
document.addEventListener('visibilitychange', () => { activePointer = null; game.setPause('hidden', document.hidden); });
window.addEventListener('blur', () => { activePointer = null; game.input('cancel', 0, 0); });
window.addEventListener('resize', game.resize);
const platform = connectYouxiPlatform({ onState: state => { game.setPause('sidebar', state.sidebar); game.setPause('boss', state.boss); }, setTemporaryMuted: () => true, isRunning: () => game.getState().running });
platform?.ready();
let previous = performance.now();
function frame(now: number) { game.tick(now - previous); previous = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
Object.assign(globalThis, { __townGame: { getState: game.getState, getHits: game.getHits, isMuted: game.isMuted } });
