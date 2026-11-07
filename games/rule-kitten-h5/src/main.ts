import './style.css';
import atlasUrl from './assets/atlas-paper-v1.png';
import { createRuleGame } from './game.ts';
import { TONES } from './audio.ts';
import { connectYouxiPlatform } from '@shared/platform';
import type { YouxiPlatformHandle } from '@shared/platform';

const root = document.getElementById('root')!;
root.className = 'fixed inset-0 overflow-hidden';
root.innerHTML = '<canvas tabindex="0" class="block h-full w-full touch-none" aria-label="文字世界：方向键或滑动移动，推动文字改写规则。Z 撤销，R 重来。"></canvas><div class="sr-only" id="controls"></div>';
const canvas = root.querySelector('canvas')!, controls = root.querySelector('#controls')!;
const safeArea = document.createElement('div');
safeArea.setAttribute('aria-hidden', 'true');
safeArea.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
root.appendChild(safeArea);
const key = 'youxi:rule-kitten-h5:save:v1';
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let audio: AudioContext | null = null, muted = false, paused = true;
const voices = new Set<OscillatorNode>();
function stopAudio() { for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } } voices.clear(); }
let game: ReturnType<typeof createRuleGame>, platform: YouxiPlatformHandle | null = null;
game = createRuleGame({
  canvas, createImage: () => new Image(), atlas: atlasUrl,
  reducedMotion: motionPreference.matches,
  viewport: () => { const insets = getComputedStyle(safeArea); return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, top: parseFloat(insets.paddingTop) || 0, bottom: parseFloat(insets.paddingBottom) || 0 }; },
  load: () => { try { return localStorage.getItem(key); } catch { return null; } },
  save: value => { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ } },
  sound: {
    play: kind => {
      if (muted || paused) return;
      try {
        audio ??= new AudioContext(); void audio.resume().catch(() => {});
        const voice = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
        voice.type = 'sine'; voice.frequency.setValueAtTime(TONES[kind], now); voice.frequency.exponentialRampToValueAtTime(TONES[kind] * (kind === 'win' ? 1.5 : .8), now + .1);
        gain.gain.setValueAtTime(.045, now); gain.gain.exponentialRampToValueAtTime(.001, now + .15);
        voice.connect(gain); gain.connect(audio.destination); voices.add(voice); voice.onended = () => { voices.delete(voice); voice.disconnect(); gain.disconnect(); };
        voice.start(); voice.stop(now + .16);
      } catch { /* Puzzles remain playable without audio. */ }
    },
    setMuted: value => { muted = value; if (value) stopAudio(); }, setPaused: value => { paused = value; if (value) stopAudio(); },
  },
  ready: () => platform?.ready(),
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
  activePointer = event.pointerId; canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); game.input('down', event.clientX, event.clientY);
});
canvas.addEventListener('pointermove', event => {
  if (activePointer === event.pointerId) game.input('move', event.clientX, event.clientY);
  if (event.pointerType === 'mouse') canvas.style.cursor = game.hover(event.clientX, event.clientY) ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => { game.hover(-1, -1); canvas.style.cursor = 'default'; });
canvas.addEventListener('pointerup', event => { if (activePointer === event.pointerId) { game.input('up', event.clientX, event.clientY); activePointer = null; } });
canvas.addEventListener('pointercancel', () => { activePointer = null; game.input('cancel', 0, 0); });
window.addEventListener('blur', () => { activePointer = null; game.input('cancel', 0, 0); });
document.addEventListener('visibilitychange', () => { activePointer = null; game.setPause('hidden', document.hidden); });
window.addEventListener('resize', game.resize);
motionPreference.addEventListener('change', event => game.setReducedMotion(event.matches));
window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyR', 'Escape'].includes(event.code)) { event.preventDefault(); game.key(event.code); }
});
platform = connectYouxiPlatform({ onState: state => { game.setPause('sidebar', state.sidebar); game.setPause('boss', state.boss); }, setTemporaryMuted: game.setTemporaryMuted, isRunning: () => game.getState().running });
if (game.getState().ready) platform?.ready();
let previous = performance.now();
function frame(now: number) { game.tick(now - previous); previous = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
Object.assign(globalThis, { __ruleKitten: { getState: game.getState, getHits: game.getHits, isMuted: game.isMuted } });
