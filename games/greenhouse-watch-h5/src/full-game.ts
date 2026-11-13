import { connectYouxiPlatform } from '@shared/platform';
import engineScript from './runtime/engine.js?url&no-inline';
import engineWasm from './runtime/engine.wasm?url&no-inline';
import yard from './runtime/assets/yard.pak?url&no-inline';
import lgpl from './runtime/LGPL-3.0.txt?url&no-inline';
import gpl from './runtime/GPL-3.0.txt?url&no-inline';
import framework from './runtime/framework-license.txt?url&no-inline';
import audioLicense from './runtime/audio-license.txt?url&no-inline';
import fontLicense from './runtime/NotoSansSC-OFL.txt?url&no-inline';
import { chineseAssets } from './chinese';
import './style.css';

type FileSystem = {
  mkdirTree(path: string): void;
  writeFile(path: string, bytes: Uint8Array, options?: { canOwn: boolean }): void;
  mount(filesystem: unknown, options: object, path: string): void;
  syncfs(populate: boolean, callback: (error: Error | null) => void): void;
};

type Engine = {
  FS: FileSystem;
  IDBFS: unknown;
  callMain(args: string[]): void;
  SDL2?: { audioContext: AudioContext; audio?: { scriptProcessorNode: ScriptProcessorNode } };
  _greenhouse_ready(): number;
  _greenhouse_scene(): number;
  _greenhouse_ticks(): number;
  _greenhouse_mode(): number;
  _greenhouse_set_speed(multiplier: number): void;
  _greenhouse_load_glyph_index(): void;
  _greenhouse_sun(): number;
  _greenhouse_coins(): number;
  _greenhouse_level(): number;
  _greenhouse_can_jump(): number;
  _greenhouse_set_coins(coins: number): number;
  _greenhouse_unlock_modes(): number;
  _greenhouse_jump(level: number): number;
  _greenhouse_board_ticks(): number;
  _greenhouse_add_sun(amount: number): number;
  _greenhouse_save_round(): void;
};

declare global {
  interface Window {
    MainLoop?: { preMainLoop: Array<() => boolean>; postMainLoop: Array<() => void> };
    onGameExit?: () => void;
  }
}

function element<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

const game = element('game');
const canvas = element<HTMLCanvasElement>('canvas');
const retry = element<HTMLButtonElement>('retry');
const trainer = element<HTMLDialogElement>('trainer');
const loadStatus = element('load-status');
const saveStatus = element('save-status');
const pause = element<HTMLButtonElement>('pause');
const exit = element<HTMLButtonElement>('exit');
const gameTrainer = element<HTMLButtonElement>('game-trainer');
const trainerStatus = element('trainer-status');
const gameSpeed = element<HTMLSelectElement>('game-speed');
const addSun = element<HTMLButtonElement>('add-sun');
const coinAmount = element<HTMLInputElement>('trainer-coins');
const setCoins = element<HTMLButtonElement>('set-coins');
const unlockModes = element<HTMLButtonElement>('unlock-levels');
const jumpLevel = element<HTMLButtonElement>('jump-level');
const targetLevel = element<HTMLInputElement>('trainer-level');
const openingSun = element<HTMLInputElement>('trainer-sun');
const jumpHint = element('trainer-level-hint');
const gameLanguage = element<HTMLSelectElement>('game-language');
const applyLanguage = element<HTMLButtonElement>('apply-language');
const loading = element('game-loading');
const title = document.title;
const saveRoot = '/greenhouse-full-saves';
const launchLock = 'greenhouse-watch-full-save';
const languageKey = 'greenhouse-watch-language';
const speedKey = 'greenhouse-watch-speed';
const propertyUrls = import.meta.glob<string>('./runtime/assets/properties/*', {
  eager: true, import: 'default', query: '?url&no-inline',
});
const licenses = { 'license-lgpl': lgpl, 'license-gpl': gpl, 'license-framework': framework, 'license-audio': audioLicense, 'license-font': fontLicense };
for (const [id, url] of Object.entries(licenses)) element<HTMLAnchorElement>(id).href = url;

let engine: Engine | undefined;
let started = false;
let ready = false;
let manualPaused = false;
let platformPaused = false;
let platformMuted = false;
let outputDisconnected: ScriptProcessorNode | undefined;
try {
  const language = localStorage.getItem(languageKey);
  if (language === 'zh-CN' || language === 'en') gameLanguage.value = language;
  const speed = sessionStorage.getItem(speedKey);
  if (Array.from(gameSpeed.options).some(option => option.value === speed)) gameSpeed.value = speed!;
} catch { /* Storage is optional for preferences. */ }
let activeLanguage = gameLanguage.value;
let lastScene = -1;
let pendingOpeningSun = 0;
let saveTask: Promise<void> | undefined;
let releaseSaveLock: (() => void) | undefined;

function canAdvance() {
  return started && !manualPaused && !platformPaused && !trainer.open;
}

const platform = connectYouxiPlatform({
  onIdentity: identity => { element('identity').textContent = identity.user?.nickname ?? ''; },
  onState: state => { platformPaused = state.sidebar || state.boss; },
  setTemporaryMuted: muted => {
    platformMuted = muted;
    updateAudio();
    return true;
  },
  isRunning: () => ready && canAdvance(),
});

function updateAudio() {
  const audio = engine?.SDL2;
  const output = audio?.audio?.scriptProcessorNode;
  if (!audio || !output) return;
  if (platformMuted && outputDisconnected !== output) {
    output.disconnect();
    outputDisconnected = output;
  } else if (!platformMuted && outputDisconnected === output) {
    output.connect(audio.audioContext.destination);
    outputDisconnected = undefined;
  }
}

Object.assign(window, {
  greenhouseWatch: { readState: () => ({
    running: ready && canAdvance(),
    progress: engine?._greenhouse_ticks() ?? 0,
    scene: engine?._greenhouse_scene() ?? -1,
    mode: engine?._greenhouse_mode() ?? -1,
    boardTicks: engine?._greenhouse_board_ticks() ?? -1,
    sun: engine?._greenhouse_sun() ?? -1,
    coins: engine?._greenhouse_coins() ?? -1,
    level: engine?._greenhouse_level() ?? -1,
    language: canvas.lang,
  }) },
});

function syncFiles(fs: FileSystem, populate: boolean) {
  return new Promise<void>((resolve, reject) => {
    fs.syncfs(populate, error => error ? reject(error) : resolve());
  });
}

async function saveLocally() {
  if (!engine || !started) return;
  if (saveTask) return saveTask;
  saveTask = syncFiles(engine.FS, false).then(() => {
    saveStatus.textContent = '本地已保存';
  }).finally(() => { saveTask = undefined; });
  return saveTask;
}

function scheduleSave() {
  void saveLocally().catch(() => { saveStatus.textContent = '本地存档保存失败'; });
}

function showFailure(error: unknown) {
  started = ready = false;
  releaseSaveLock?.();
  releaseSaveLock = undefined;
  loading.hidden = false;
  pause.disabled = gameTrainer.disabled = exit.disabled = applyLanguage.disabled = true;
  retry.hidden = false;
  loadStatus.textContent = error instanceof Error ? error.message : String(error);
}

async function readAsset(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('游戏资源加载失败，请重新加载。');
  return new Uint8Array(await response.arrayBuffer());
}

function loadEngine(pack: Uint8Array, properties: ReadonlyArray<readonly [string, Uint8Array]>, chinese?: Awaited<ReturnType<typeof chineseAssets>>) {
  return new Promise<Engine>((resolve, reject) => {
    const module = {
      canvas,
      noInitialRun: true,
      locateFile: () => engineWasm,
      onRuntimeInitialized: () => {
        try {
          native.FS.mkdirTree('/game-assets/properties');
          native.FS.writeFile('/game-assets/main.pak', pack, { canOwn: true });
          for (const [name, bytes] of properties) {
            const asset = name === 'pvz-portable.xml' && chinese
              ? new TextEncoder().encode(new TextDecoder().decode(bytes).replace('</Properties>', chinese.entries + '\n</Properties>'))
              : bytes;
            native.FS.writeFile('/game-assets/properties/' + name, asset, { canOwn: true });
          }
          if (chinese) {
            native.FS.writeFile('/game-assets/chinese-glyphs.png', chinese.image);
            native.FS.writeFile('/game-assets/chinese-glyphs.bin', chinese.index);
            native._greenhouse_load_glyph_index();
          }
          native.FS.mkdirTree(saveRoot);
          native.FS.mount(native.IDBFS, {}, saveRoot);
          resolve(native);
        } catch (error) { reject(error); }
      },
      onAbort: (error: unknown) => engine ? showFailure(error) : reject(new Error(String(error))),
    };
    const native = module as unknown as Engine;
    Object.assign(window, { Module: module });
    const script = document.createElement('script');
    script.src = engineScript;
    script.onerror = () => reject(new Error('游戏运行程序加载失败。'));
    document.head.append(script);
  });
}

function fitCanvas() {
  const width = Math.max(1, Math.min(innerWidth, (innerHeight - 50) * 4 / 3, 1200));
  game.style.setProperty('--game-width', width + 'px');
}

function afterFrame() {
  if (!engine || !started) return;
  updateAudio();
  if (!ready && engine._greenhouse_ready()) {
    ready = true;
    loading.hidden = true;
    pause.disabled = gameTrainer.disabled = exit.disabled = applyLanguage.disabled = false;
    canvas.dataset.ready = 'true';
    platform?.ready();
  }
  const scene = engine._greenhouse_scene();
  if (pendingOpeningSun && scene !== 2) {
    if (scene === 3) engine._greenhouse_add_sun(pendingOpeningSun);
    pendingOpeningSun = 0;
  }
  if (scene !== lastScene) {
    engine._greenhouse_set_speed(scene === 3 ? Number(gameSpeed.value) : 1);
    addSun.disabled = scene !== 3;
  }
  lastScene = scene;
}

async function begin() {
  const native = engine!;
  await syncFiles(native.FS, true);
  fitCanvas();
  canvas.focus();
  const loop = window.MainLoop;
  if (!loop) throw new Error('无法连接游戏时钟。');
  let wasAdvancing = false;
  loop.preMainLoop.push(() => {
    const advancing = canAdvance();
    if (advancing && !wasAdvancing && ready) {
      native._greenhouse_set_speed(lastScene === 3 ? Number(gameSpeed.value) : 1);
    }
    wasAdvancing = advancing;
    return advancing;
  });
  loop.postMainLoop.push(afterFrame);
  started = true;
  saveStatus.textContent = '本地存档';
  native.callMain(['-resdir', '/game-assets', '-savedir', saveRoot]);
  document.title = title;
}

gameTrainer.addEventListener('click', () => {
  const coins = engine?._greenhouse_coins() ?? -1;
  coinAmount.disabled = setCoins.disabled = coins < 0;
  if (coins >= 0) coinAmount.valueAsNumber = coins;
  jumpLevel.disabled = targetLevel.disabled = openingSun.disabled = unlockModes.disabled = !engine?._greenhouse_can_jump();
  if (!jumpLevel.disabled) targetLevel.valueAsNumber = engine!._greenhouse_level();
  jumpHint.textContent = jumpLevel.disabled
    ? '进入档案主菜单后可跳关或解锁模式。'
    : '跳关会替换当前档案的冒险对局。';
  trainerStatus.textContent = coins < 0 ? '进入档案后可修改金币。' : '';
  trainer.showModal();
});
gameSpeed.addEventListener('change', () => {
  try { sessionStorage.setItem(speedKey, gameSpeed.value); } catch { /* Current setting still applies. */ }
  if (lastScene === 3) engine?._greenhouse_set_speed(Number(gameSpeed.value));
  trainerStatus.textContent = lastScene === 3
    ? '关闭修改器后以 ' + gameSpeed.selectedOptions[0].textContent + ' 继续。'
    : '下次进入对局时应用倍速。';
});
trainer.addEventListener('close', () => { if (started) canvas.focus(); });
async function saveTrainerChange(message: string) {
  trainerStatus.textContent = message;
  try {
    if (saveTask) await saveTask;
    await saveLocally();
  } catch {
    trainerStatus.textContent = '修改已应用，写入本地存档失败。';
    saveStatus.textContent = '本地存档保存失败';
  }
}
element<HTMLFormElement>('trainer-profile').addEventListener('submit', event => {
  event.preventDefault();
  if (engine?._greenhouse_set_coins(coinAmount.valueAsNumber)) {
    void saveTrainerChange('金币已设为 ' + coinAmount.valueAsNumber + '。');
  }
});
unlockModes.addEventListener('click', () => {
  if (engine?._greenhouse_unlock_modes()) {
    void saveTrainerChange('小游戏、解谜和生存已解锁。');
  } else {
    trainerStatus.textContent = '无法解锁附加模式。';
  }
});
element<HTMLFormElement>('trainer-level-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!engine?._greenhouse_jump(targetLevel.valueAsNumber)) {
    trainerStatus.textContent = '请先返回档案主菜单。';
    return;
  }
  pendingOpeningSun = openingSun.valueAsNumber;
  void saveTrainerChange('已进入第 ' + targetLevel.valueAsNumber + ' 关。');
  trainer.close();
});
addSun.addEventListener('click', () => {
  const sun = engine?._greenhouse_add_sun(100) ?? -1;
  trainerStatus.textContent = sun < 0 ? '请先进入对局。' : '当前阳光 ' + sun;
});
pause.addEventListener('click', () => {
  manualPaused = !manualPaused;
  pause.textContent = manualPaused ? '继续' : '暂停';
  pause.setAttribute('aria-pressed', String(manualPaused));
  if (!manualPaused) canvas.focus();
});
let leaving = false;
async function returnToTitle(change?: () => void) {
  if (leaving || !ready) return;
  leaving = true;
  const wasPaused = manualPaused;
  exit.disabled = true;
  manualPaused = true;
  try {
    engine?._greenhouse_save_round();
    if (saveTask) await saveTask;
    await saveLocally();
    change?.();
    location.reload();
  } catch {
    saveStatus.textContent = '无法保存到浏览器，请重试。';
    manualPaused = wasPaused;
    exit.disabled = false;
    leaving = false;
  }
}
exit.addEventListener('click', () => {
  void returnToTitle();
});
element<HTMLFormElement>('language-form').addEventListener('submit', event => {
  event.preventDefault();
  if (activeLanguage !== gameLanguage.value) {
    void returnToTitle(() => localStorage.setItem(languageKey, gameLanguage.value));
  }
});

window.onGameExit = () => {
  if (leaving) return;
  leaving = true;
  void saveLocally().then(() => location.reload(), () => {
    leaving = false;
    saveStatus.textContent = '无法保存到浏览器，请重试。';
  });
};
window.addEventListener('pagehide', scheduleSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) scheduleSave(); });
window.addEventListener('resize', fitCanvas);
window.setInterval(scheduleSave, 2500);
retry.addEventListener('click', () => location.reload());
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', () => {
  const audio = engine?.SDL2?.audioContext;
  if (audio?.state === 'suspended') void audio.resume().catch(() => {});
});

async function prepare() {
  fitCanvas();
  try {
    activeLanguage = gameLanguage.value;
    const useChinese = activeLanguage === 'zh-CN' ||
      (activeLanguage === 'auto' && /^zh(?:-|$)/i.test(navigator.language));
    canvas.lang = useChinese ? 'zh-CN' : 'en';
    const [pack, properties, chinese] = await Promise.all([
      readAsset(yard),
      Promise.all(Object.entries(propertyUrls).map(async ([path, url]) => [
        path.split('/').at(-1)!, await readAsset(url),
      ] as const)),
      useChinese ? chineseAssets() : undefined,
    ]);
    engine = await loadEngine(pack, properties, chinese);
    if (!navigator.locks) { await begin(); return; }
    await navigator.locks.request(launchLock, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('游戏已在另一个页面打开。关闭那个页面后再试。');
      await begin();
      await new Promise<void>(resolve => { releaseSaveLock = resolve; });
    });
  } catch (error) { showFailure(error); }
}
void prepare();
