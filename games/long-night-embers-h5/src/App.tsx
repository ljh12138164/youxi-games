import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { YouxiIdentity } from '@shared/platform';
import { SoundController } from './audio/sound.ts';
import {
  ADVENTURES,
  ADVENTURE_MAP,
  ARCANA_MAP,
  CHARACTERS,
  CHARACTER_MAP,
  EVOLUTIONS,
  PASSIVE_MAP,
  POWERUPS,
  SECRET_SPELLS,
  STAGES,
  STAGE_MAP,
  SURVAROT_MAP,
  WEAPONS,
  WEAPON_MAP,
} from './content/ledger.ts';
import {
  TICK_MS,
  TICKS_PER_SECOND,
  LongNightEmbersEngine,
  createDefaultModes,
  createInitialRun,
  getPowerUpPurchaseCost,
  getTotalPowerUpRefund,
} from './core/engine.ts';
import type { ActiveModesConfig, CheatAction, ModeId } from './core/types.ts';
import {
  SingleWriterCoordinator,
  importJsonToSlot,
  listSlotSummaries,
  loadSlotBundle,
  restoreSlotBackup,
  saveSlotBundle,
  serializeExportBundle,
  type SlotSummary,
} from './persistence/storage.ts';
import { LongNightEmbersPlatformBridge } from './platform/bridge.ts';
import { BattlefieldCanvas } from './render/BattlefieldCanvas.tsx';
import { getCharacterPortraitUrl, getItemIconUrl } from './render/pixelArt.ts';

type ActiveModal =
  | 'none'
  | 'newRun'
  | 'stageSelect'
  | 'powerups'
  | 'adventures'
  | 'collection'
  | 'saves'
  | 'settings'
  | 'guide'
  | 'trainer';

type ScreenMode = 'title' | 'battle';

const singletonEngine = new LongNightEmbersEngine();
const singletonSound = new SoundController();

function formatClock(ticks: number): string {
  const totalSec = Math.floor(ticks / TICKS_PER_SECOND);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function shortCharName(fullName: string): string {
  return fullName.split('·')[0] ?? fullName;
}

export function App() {
  const snapshot = useSyncExternalStore(
    singletonEngine.subscribe,
    singletonEngine.getSnapshot,
  );
  const { run, profile, derived, pauseReasons, isRunning } = snapshot;

  const [screenMode, setScreenMode] = useState<ScreenMode>('title');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const activeModalRef = useRef<ActiveModal>(activeModal);
  activeModalRef.current = activeModal;
  const [guideTab, setGuideTab] = useState<'grimoire' | 'builds' | 'tier' | 'tips'>('grimoire');
  const [trainerTab, setTrainerTab] = useState<'gold' | 'unlocks' | 'combat'>('gold');
  const [customGoldInput, setCustomGoldInput] = useState<string>('');
  const [slotSummaries, setSlotSummaries] = useState<SlotSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState<YouxiIdentity | null>(null);
  const [writerConflict, setWriterConflict] = useState(false);

  const [selCharId, setSelCharId] = useState<string>('torchguard_torren');
  const [selStageId, setSelStageId] = useState<string>('mad_forest');
  const [selModes, setSelModes] = useState<ActiveModesConfig>(createDefaultModes);
  const [spellInput, setSpellInput] = useState('');
  const [importJsonText, setImportJsonText] = useState('');

  const bridgeRef = useRef<LongNightEmbersPlatformBridge | null>(null);
  const writerRef = useRef<SingleWriterCoordinator | null>(null);
  const keysPressedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    singletonSound.setUserAudioPreferences({
      userMuted: profile.settings.userMuted,
      sfxVolume: profile.settings.sfxVolume,
      musicVolume: profile.settings.musicVolume,
    });
  }, [
    profile.settings.userMuted,
    profile.settings.sfxVolume,
    profile.settings.musicVolume,
  ]);

  useEffect(() => {
    let cancelled = false;
    writerRef.current = new SingleWriterCoordinator(() => {
      setWriterConflict(true);
      setStatusMessage('检测到另一窗口接管了当前档案写入，本窗口已转为只读模式。');
    });

    bridgeRef.current = new LongNightEmbersPlatformBridge(
      singletonEngine,
      singletonSound,
      (nextId) => {
        if (!cancelled) setIdentity(nextId);
      },
    );

    async function init() {
      const loaded = await loadSlotBundle(1);
      if (cancelled) return;

      if (loaded.run) {
        singletonEngine.loadState(loaded.run, loaded.profile);
        if (loaded.error) setStatusMessage(loaded.error);
      } else {
        const fresh = createInitialRun(1, {}, loaded.profile);
        singletonEngine.loadState(fresh, loaded.profile);
        await saveSlotBundle(1, fresh, loaded.profile);
      }
      singletonEngine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'manual', active: true });

      const summaries = await listSlotSummaries();
      if (!cancelled) {
        setSlotSummaries(summaries);
        bridgeRef.current?.notifyGameReady();
      }
    }

    void init();

    return () => {
      cancelled = true;
      bridgeRef.current?.destroy();
      writerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    let lastTime = performance.now();
    let accumulator = 0;
    let rafId = 0;

    function loop(now: number) {
      const rawDelta = Math.max(0, now - lastTime);
      lastTime = now;
      const snap = singletonEngine.getSnapshot();

      if (snap.isRunning) {
        if (rawDelta > 250) {
          accumulator = 0;
          singletonEngine.dispatch({
            type: 'SET_PAUSE_REASON',
            reason: 'performance',
            active: true,
          });
          setStatusMessage('检测到帧间隔积压超过 250ms，已自动进入性能保护暂停。');
        } else {
          accumulator += rawDelta;
          let steps = 0;
          while (accumulator >= TICK_MS && steps < 5) {
            singletonEngine.stepTick();
            accumulator -= TICK_MS;
            steps += 1;
          }
          if (accumulator > TICK_MS * 5) {
            accumulator = 0;
          }
        }
      } else {
        accumulator = 0;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      keysPressedRef.current.clear();
      if (document.hidden) {
        singletonEngine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'hidden', active: true });
        singletonEngine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'manual', active: true });
      } else {
        singletonEngine.dispatch({ type: 'SET_PAUSE_REASON', reason: 'hidden', active: false });
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!writerRef.current?.canWrite()) return;
      const snap = singletonEngine.getSnapshot();
      void saveSlotBundle(snap.profile.slotId, snap.run, snap.profile).then((res) => {
        if (res.warning) setStatusMessage(res.warning);
      });
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function syncMoveVector() {
      const keys = keysPressedRef.current;
      let mx = 0;
      let my = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
      singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: mx, y: my });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input,textarea,select,[contenteditable="true"]')) return;

      if (e.code === 'Escape') {
        e.preventDefault();
        if (activeModalRef.current !== 'none') {
          openModal('none');
          return;
        }
        singletonEngine.dispatch({ type: 'TOGGLE_MANUAL_PAUSE' });
        return;
      }

      if (e.code === 'F1' || e.code === 'Backquote') {
        e.preventDefault();
        openModal(activeModalRef.current === 'trainer' ? 'none' : 'trainer');
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        singletonEngine.dispatch({ type: 'TOGGLE_MANUAL_PAUSE' });
        return;
      }

      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(e.code)
      ) {
        keysPressedRef.current.add(e.code);
        syncMoveVector();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (keysPressedRef.current.delete(e.code)) {
        syncMoveVector();
      }
    }

    function onBlur() {
      keysPressedRef.current.clear();
      singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 0, y: 0 });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  async function refreshSlots() {
    setSlotSummaries(await listSlotSummaries());
  }

  function openModal(modal: ActiveModal) {
    setActiveModal(modal);
    singletonEngine.dispatch({
      type: 'SET_PAUSE_REASON',
      reason: 'menu',
      active: modal !== 'none',
    });
    if (modal === 'saves') {
      void refreshSlots();
    }
  }

  function applyCheat(action: CheatAction, msg: string) {
    singletonEngine.dispatch({ type: 'CHEAT_ACTION', action });
    setStatusMessage(`【修改器】${msg}`);
  }

  function resumeCombat() {
    if (pauseReasons.includes('performance')) {
      singletonEngine.dispatch({
        type: 'SET_PAUSE_REASON',
        reason: 'performance',
        active: false,
      });
    }
    setScreenMode('battle');
    setActiveModal('none');
    singletonEngine.dispatch({
      type: 'SET_PAUSE_REASON',
      reason: 'menu',
      active: false,
    });
    singletonEngine.dispatch({
      type: 'SET_PAUSE_REASON',
      reason: 'manual',
      active: false,
    });
  }

  async function handleStartConfiguredRun(
    adventureId: string | null = null,
    chapterId: string | null = null,
  ) {
    singletonEngine.startNewRun({
      seed: Date.now() >>> 0,
      characterId: selCharId,
      stageId: selStageId,
      modes: selModes,
      adventureId,
      adventureChapterId: chapterId,
    });
    const snap = singletonEngine.getSnapshot();
    await saveSlotBundle(snap.profile.slotId, snap.run, snap.profile);
    setScreenMode('battle');
    setActiveModal('none');
    setStatusMessage(null);
  }

  async function handleSwitchSlot(slotId: 1 | 2 | 3) {
    if (writerRef.current?.canWrite()) {
      await saveSlotBundle(profile.slotId, run, profile);
    }
    const loaded = await loadSlotBundle(slotId);
    if (loaded.run) {
      singletonEngine.loadState(loaded.run, loaded.profile);
      setStatusMessage(
        loaded.restoredFromBackup
          ? `档案 ${slotId} 主档损坏，已自动从备份恢复。`
          : `已切换到档案 ${slotId}。`,
      );
    } else {
      const fresh = createInitialRun(slotId, {}, loaded.profile);
      singletonEngine.loadState(fresh, loaded.profile);
      await saveSlotBundle(slotId, fresh, loaded.profile);
      setStatusMessage(`已初始化档案 ${slotId}。`);
    }
    await refreshSlots();
  }

  const charDef = CHARACTER_MAP[run.characterId] ?? CHARACTER_MAP['torchguard_torren']!;
  const stageDef = STAGE_MAP[run.stageId] ?? STAGE_MAP['mad_forest']!;
  const xpPercent = Math.min(
    100,
    Math.round((run.player.xp / Math.max(1, run.player.xpToNext)) * 100),
  );
  const manualPaused = pauseReasons.includes('manual') || pauseReasons.includes('performance');

  const mainWeapons = run.weapons.filter((w) => !w.isExtraSlot);
  const extraWeapons = run.weapons.filter((w) => w.isExtraSlot);
  const mainPassives = run.passives.filter((p) => !p.fromStageFloor);
  const floorPassives = run.passives.filter((p) => p.fromStageFloor);

  const ownedWeaponIds = new Set(run.weapons.map((w) => w.weaponId));
  const ownedPassiveIds = new Set(run.passives.map((p) => p.passiveId));

  // Left-side Equipment Pips Box + 19-Row Stat Sheet 
  const renderStatSheet = () => {
    const movePct = Math.round(((derived.moveSpeed - 145) / 145) * 100);
    const mightPct = Math.round((derived.might - 1) * 100);
    const speedPct = Math.round((derived.speed - 1) * 100);
    const durationPct = Math.round((derived.duration - 1) * 100);
    const areaPct = Math.round((derived.area - 1) * 100);
    const cdPct = Math.round((derived.cooldownMultiplier - 1) * 100);
    const luckPct = Math.round((derived.luck - 1) * 100);
    const growthPct = Math.round((derived.growth - 1) * 100);
    const greedPct = Math.round((derived.greed - 1) * 100);
    const cursePct = Math.round((derived.curse - 1) * 100);
    const revivalsLeft = Math.max(0, derived.revival - run.player.revivalsUsed);

    const fmtPct = (val: number) => (val === 0 ? '-' : `${val > 0 ? '+' : ''}${val}%`);

    return (
      <div className="lne-left-pause-column">
        {/* Top Equipment Box with level pips under each icon */}
        <div className="lne-pause-equip-panel">
          <div className="lne-pause-equip-grid">
            {Array.from({ length: 6 }).map((_, idx) => {
              const w = mainWeapons[idx];
              const def = w ? WEAPON_MAP[w.weaponId] : undefined;
              const maxLvl = def?.maxLevel ?? 8;
              return (
                <div key={`pw_${idx}`} className="lne-pause-slot-cell">
                  <div className="lne-pause-slot-icon-box">
                    {w && (
                      <img
                        src={getItemIconUrl(w.weaponId)}
                        alt={def?.nameZh}
                        className="lne-pause-slot-img"
                      />
                    )}
                  </div>
                  {w && (
                    <div className="lne-slot-pips">
                      {Array.from({ length: Math.min(maxLvl, 8) }).map((__, pIdx) => (
                        <span
                          key={pIdx}
                          className={`lne-slot-pip ${pIdx < w.level ? 'lne-slot-pip-on' : ''}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lne-pause-equip-grid">
            {Array.from({ length: 6 }).map((_, idx) => {
              const p = mainPassives[idx];
              const def = p ? PASSIVE_MAP[p.passiveId] : undefined;
              const maxLvl = def?.maxLevel ?? 5;
              return (
                <div key={`pp_${idx}`} className="lne-pause-slot-cell">
                  <div className="lne-pause-slot-icon-box">
                    {p && (
                      <img
                        src={getItemIconUrl(p.passiveId)}
                        alt={def?.nameZh}
                        className="lne-pause-slot-img"
                      />
                    )}
                  </div>
                  {p && (
                    <div className="lne-slot-pips">
                      {Array.from({ length: Math.min(maxLvl, 5) }).map((__, pIdx) => (
                        <span
                          key={pIdx}
                          className={`lne-slot-pip ${pIdx < p.level ? 'lne-slot-pip-on' : ''}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 19-Row Stat Sheet */}
        <aside className="lne-stat-sheet">
          <div className="lne-stat-group">
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('heart')} alt="" className="lne-stat-mini-icon" />
                生命上限
              </span>
              <strong>{run.player.maxHp}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('pummarola')} alt="" className="lne-stat-mini-icon" />
                恢复
              </span>
              <strong>{derived.recovery > 0 ? derived.recovery.toFixed(2) : '-'}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('armor')} alt="" className="lne-stat-mini-icon" />
                防御
              </span>
              <strong>{derived.armor !== 0 ? `+${derived.armor}` : '-'}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('wings')} alt="" className="lne-stat-mini-icon" />
                移动速度
              </span>
              <strong>{fmtPct(movePct)}</strong>
            </div>
          </div>

          <div className="lne-stat-group">
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('spinach')} alt="" className="lne-stat-mini-icon" />
                力量
              </span>
              <strong>{fmtPct(mightPct)}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('bracer')} alt="" className="lne-stat-mini-icon" />
                飞射速度
              </span>
              <strong>{fmtPct(speedPct)}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('spellbinder')} alt="" className="lne-stat-mini-icon" />
                持续时间
              </span>
              <strong>{fmtPct(durationPct)}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('candelabrador')} alt="" className="lne-stat-mini-icon" />
                攻击范围
              </span>
              <strong>{fmtPct(areaPct)}</strong>
            </div>
          </div>

          <div className="lne-stat-group">
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('empty_tome')} alt="" className="lne-stat-mini-icon" />
                冷却时间
              </span>
              <strong>{fmtPct(cdPct)}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('duplicator')} alt="" className="lne-stat-mini-icon" />
                发射数量
              </span>
              <strong>{derived.amount > 0 ? `+${derived.amount}` : '-'}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('tiragisu')} alt="" className="lne-stat-mini-icon" />
                复活机会
              </span>
              <strong>{revivalsLeft > 0 ? revivalsLeft : '-'}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('attractorb')} alt="" className="lne-stat-mini-icon" />
                念力
              </span>
              <strong className="lne-gold-text">{Math.round(derived.magnet)}</strong>
            </div>
          </div>

          <div className="lne-stat-group">
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('clover')} alt="" className="lne-stat-mini-icon" />
                运气
              </span>
              <strong>{fmtPct(luckPct)}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('crown')} alt="" className="lne-stat-mini-icon" />
                成长
              </span>
              <strong>{fmtPct(growthPct)}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('stone_mask')} alt="" className="lne-stat-mini-icon" />
                贪欲
              </span>
              <strong>{fmtPct(greedPct)}</strong>
            </div>
            <div className="lne-stat-row">
              <span>
                <img src={getItemIconUrl('skull_o_maniac')} alt="" className="lne-stat-mini-icon" />
                诅咒
              </span>
              <strong>{fmtPct(cursePct)}</strong>
            </div>
          </div>

          <div className="lne-stat-group">
            <div className="lne-stat-row">
              <span>🎲 重选</span>
              <strong>{run.player.rerollsRemaining > 0 ? run.player.rerollsRemaining : '-'}</strong>
            </div>
            <div className="lne-stat-row">
              <span>⏭ 跳过</span>
              <strong>{run.player.skipsRemaining > 0 ? run.player.skipsRemaining : '-'}</strong>
            </div>
            <div className="lne-stat-row">
              <span>🚫 排除</span>
              <strong>{run.player.banishesRemaining > 0 ? run.player.banishesRemaining : '-'}</strong>
            </div>
          </div>
        </aside>
      </div>
    );
  };

  // Visual 2-Column Weapon Evolution & Combination Formula Chart 
  const renderEvolutionFormulaGrid = () => (
    <div className="lne-grimoire-formula-grid">
      {EVOLUTIONS.map((ev) => {
        const w1 = ev.inputs[0]?.weaponId;
        const w2 = ev.inputs[1]?.weaponId;
        const p1 = ev.requiredPassives[0]?.passiveId;
        const p2 = ev.requiredPassives[1]?.passiveId;
        const w1Def = w1 ? WEAPON_MAP[w1] : undefined;
        const w2Def = w2 ? WEAPON_MAP[w2] : undefined;
        const p1Def = p1 ? PASSIVE_MAP[p1] : undefined;
        const p2Def = p2 ? PASSIVE_MAP[p2] : undefined;
        const outDef = WEAPON_MAP[ev.outputWeaponId];

        const hasW1 = w1 ? ownedWeaponIds.has(w1) : false;
        const hasW2 = w2 ? ownedWeaponIds.has(w2) : false;
        const hasP1 = p1 ? ownedPassiveIds.has(p1) : false;
        const hasP2 = p2 ? ownedPassiveIds.has(p2) : false;
        const hasOut = ownedWeaponIds.has(ev.outputWeaponId);

        return (
          <div key={ev.id} className="lne-formula-item" title={ev.description}>
            <div className="lne-formula-icons">
              {w1 && (
                <div
                  className={`lne-formula-slot ${hasW1 ? 'lne-formula-owned' : ''}`}
                  title={w1Def?.nameZh ?? w1}
                >
                  <img src={getItemIconUrl(w1)} alt={w1Def?.nameZh} />
                </div>
              )}
              {w2 && (
                <>
                  <span className="lne-formula-op">+</span>
                  <div
                    className={`lne-formula-slot ${hasW2 ? 'lne-formula-owned' : ''}`}
                    title={w2Def?.nameZh ?? w2}
                  >
                    <img src={getItemIconUrl(w2)} alt={w2Def?.nameZh} />
                  </div>
                </>
              )}
              {p1 && (
                <>
                  <span className="lne-formula-op">+</span>
                  <div
                    className={`lne-formula-slot ${hasP1 ? 'lne-formula-owned' : ''}`}
                    title={p1Def?.nameZh ?? p1}
                  >
                    <img src={getItemIconUrl(p1)} alt={p1Def?.nameZh} />
                  </div>
                </>
              )}
              {p2 && (
                <>
                  <span className="lne-formula-op">+</span>
                  <div
                    className={`lne-formula-slot ${hasP2 ? 'lne-formula-owned' : ''}`}
                    title={p2Def?.nameZh ?? p2}
                  >
                    <img src={getItemIconUrl(p2)} alt={p2Def?.nameZh} />
                  </div>
                </>
              )}
              <span className="lne-formula-op">=</span>
              <div
                className={`lne-formula-slot lne-formula-result ${hasOut ? 'lne-formula-owned' : ''}`}
                title={`${outDef?.nameZh ?? ev.nameZh}：${ev.description}`}
              >
                <img src={getItemIconUrl(ev.outputWeaponId)} alt={ev.nameZh} />
              </div>
            </div>
            <div className="lne-formula-caption">
              <strong>{outDef?.nameZh ?? ev.nameZh}</strong>
              <span>
                {w1Def?.nameZh}
                {w2Def ? ` + ${w2Def.nameZh}` : ''}
                {p1Def ? ` + ${p1Def.nameZh}` : ''}
                {p2Def ? ` + ${p2Def.nameZh}` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="lne-app"
      data-running={String(isRunning)}
      data-tick={String(run.tick)}
    >
      {/* 1. Full-Screen PixiJS 8 Battlefield */}
      <main className="lne-battlefield-fullscreen">
        <BattlefieldCanvas engine={singletonEngine} />

        {/* 2. Embers of the Long Night Top Experience Bar */}
        <div className="lne-top-xp-bar">
          <div className="lne-top-xp-fill" style={{ width: `${xpPercent}%` }} />
          <div className="lne-top-xp-label">
            <span>
              {run.goldFeverTicks > 0 ? '🔥 黄金狂热 GOLD FEVER! · ' : ''}
              EXP {run.player.xp} / {run.player.xpToNext}
            </span>
            <strong>LV {run.player.level}</strong>
          </div>
        </div>

        {/* 3. Top-Left 6+6 Equipment Slots + Top-Center Clock + Top-Right Counters */}
        <div className="lne-hud-overlay">
          {/* Top-Left: 6 Weapon Boxes + 6 Passive Boxes */}
          <div className="lne-hud-inventory">
            <div className="lne-equip-row">
              {Array.from({ length: 6 }).map((_, idx) => {
                const w = mainWeapons[idx];
                const def = w ? WEAPON_MAP[w.weaponId] : undefined;
                return (
                  <div
                    key={`wslot_${idx}`}
                    className={`lne-equip-box ${def?.kind && def.kind !== 'base' ? 'lne-equip-evolved' : ''}`}
                    title={w ? `${def?.nameZh} Lv.${w.level}` : '空武器槽'}
                  >
                    {w && (
                      <>
                        <img
                          src={getItemIconUrl(w.weaponId)}
                          alt={def?.nameZh}
                          className="lne-equip-icon"
                        />
                        <span className="lne-equip-lvl">
                          {w.level}
                          {w.limitBreakLevels > 0 ? `+${w.limitBreakLevels}` : ''}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="lne-equip-row">
              {Array.from({ length: 6 }).map((_, idx) => {
                const p = mainPassives[idx];
                const def = p ? PASSIVE_MAP[p.passiveId] : undefined;
                return (
                  <div
                    key={`pslot_${idx}`}
                    className="lne-equip-box lne-equip-passive"
                    title={p ? `${def?.nameZh} Lv.${p.level}` : '空被动槽'}
                  >
                    {p && (
                      <>
                        <img
                          src={getItemIconUrl(p.passiveId)}
                          alt={def?.nameZh}
                          className="lne-equip-icon"
                        />
                        <span className="lne-equip-lvl">{p.level}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {(extraWeapons.length > 0 ||
              floorPassives.length > 0 ||
              run.arcanas.length > 0 ||
              run.survarots.length > 0) && (
              <div className="lne-equip-overflow">
                {extraWeapons.map((w) => (
                  <span key={w.weaponId} className="lne-overflow-pill">
                    🎁 {WEAPON_MAP[w.weaponId]?.nameZh} Lv.{w.level}
                  </span>
                ))}
                {floorPassives.map((p) => (
                  <span key={p.passiveId} className="lne-overflow-pill">
                    🗺 {PASSIVE_MAP[p.passiveId]?.nameZh} Lv.{p.level}
                  </span>
                ))}
                {run.arcanas.map((aid) => (
                  <span key={aid} className="lne-overflow-pill">
                    🃏 {ARCANA_MAP[aid]?.nameZh}
                  </span>
                ))}
                {run.survarots.map((sid) => (
                  <span key={sid} className="lne-overflow-pill">
                    🌟 {SURVAROT_MAP[sid]?.nameZh}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Top-Center: Crisp Pixel Stage Clock */}
          <div className="lne-hud-clock-box">
            <div className="lne-pixel-clock">{formatClock(run.stageClockTicks)}</div>
            <div className="lne-clock-sub">
              {stageDef.nameZh}
              {run.adventureId ? ` · ${ADVENTURE_MAP[run.adventureId]?.nameZh}` : ''}
            </div>
          </div>

          {/* Top-Right: Kills, Coins & Pause/Menu Controls */}
          <div className="lne-hud-right">
            <div className="lne-counter-strip">
              <span className="lne-counter-badge" title="本局击杀数">
                💀 {run.stats.kills.toLocaleString()}
              </span>
              <span className="lne-counter-badge lne-gold-badge" title="本局金币 (金库总额)">
                🪙 {run.stats.goldCollected.toLocaleString()} <small>(库:{profile.gold})</small>
              </span>
            </div>

            <div className="lne-hud-action-row">
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-gold"
                onClick={() => {
                  if (manualPaused) {
                    resumeCombat();
                  } else {
                    singletonEngine.dispatch({
                      type: 'SET_PAUSE_REASON',
                      reason: 'manual',
                      active: true,
                    });
                  }
                }}
              >
                {manualPaused ? '▶ 战斗' : '⏸ 暂停'}
              </button>
              <button
                type="button"
                className="lne-gothic-btn"
                onClick={() => openModal('newRun')}
              >
                ⚔ 选角
              </button>
              <button
                type="button"
                className="lne-gothic-btn"
                onClick={() => openModal('powerups')}
              >
                ⚡ 强化
              </button>
              <button
                type="button"
                className="lne-gothic-btn"
                onClick={() => openModal('collection')}
              >
                📖 图鉴
              </button>
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-gold"
                onClick={() => openModal('guide')}
              >
                📜 攻略
              </button>
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-trainer"
                onClick={() => openModal('trainer')}
                title="开启内置修改器 (快捷键 F1 或 ~)"
              >
                🛠 修改器
              </button>
            </div>
          </div>
        </div>

        {/* Status Toast Banner */}
        {statusMessage && (
          <div className="lne-toast-banner">
            <span>{statusMessage}</span>
            {writerConflict && (
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-sm"
                onClick={() => {
                  writerRef.current?.claimWriter();
                  setWriterConflict(false);
                  setStatusMessage('已重新接管当前窗口写入权限。');
                }}
              >
                接管写入
              </button>
            )}
            <button
              type="button"
              className="lne-gothic-btn lne-gothic-btn-sm"
              onClick={() => setStatusMessage(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Touch / Mouse D-Pad in bottom-left */}
        <div className="lne-touch-dpad">
          <button
            type="button"
            className="lne-dpad-btn"
            onPointerDown={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 0, y: -1 })}
            onPointerUp={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 0, y: 0 })}
          >
            ▲
          </button>
          <div className="lne-dpad-mid">
            <button
              type="button"
              className="lne-dpad-btn"
              onPointerDown={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: -1, y: 0 })}
              onPointerUp={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 0, y: 0 })}
            >
              ◀
            </button>
            <button
              type="button"
              className="lne-dpad-btn"
              onPointerDown={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 1, y: 0 })}
              onPointerUp={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 0, y: 0 })}
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            className="lne-dpad-btn"
            onPointerDown={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 0, y: 1 })}
            onPointerUp={() => singletonEngine.dispatch({ type: 'SET_MOVE_INPUT', x: 0, y: 0 })}
          >
            ▼
          </button>
        </div>
      </main>

      {/* 4A. Dedicated Title / Home Screen (Issue 1: Home Screen before entering combat) */}
      {screenMode === 'title' && activeModal === 'none' && run.phase === 'combat' && (
        <div className="lne-home-screen">
          <div className="lne-home-top-bar">
            <button
              type="button"
              className="lne-royal-pill-btn lne-royal-pill-sm"
              onClick={() => openModal('saves')}
            >
              档案 #{profile.slotId}
            </button>

            <div className="lne-home-gold-box">
              <span className="lne-home-coin-pile">🪙</span>
              <strong>{profile.gold.toLocaleString()}</strong>
            </div>

            <button
              type="button"
              className="lne-royal-pill-btn lne-royal-pill-sm"
              onClick={() => openModal('settings')}
            >
              选项
            </button>
          </div>

          <div className="lne-home-center">
            <div className="lne-home-crest">
              <div className="lne-home-crest-sub">EMBERS OF THE LONG NIGHT · 哥特弹幕生存</div>
              <h1 className="lne-home-crest-title">永夜余烬</h1>
              {identity?.user?.nickname && (
                <div className="lne-home-player-tag">当前猎魔人：{identity.user.nickname}</div>
              )}
            </div>

            <div className="lne-home-hero-stage">
              <img
                src={getCharacterPortraitUrl(CHARACTERS[1]?.id ?? 'lampwright_mirelle', false)}
                alt=""
                className="lne-home-side-hero"
              />
              <div className="lne-home-main-hero-card">
                <img
                  src={getCharacterPortraitUrl(charDef.id, false)}
                  alt={charDef.nameZh}
                  className="lne-home-main-hero-img"
                />
                <div className="lne-home-main-hero-text">
                  <strong>{charDef.nameZh}</strong>
                  <span>
                    初始武器：
                    <img
                      src={getItemIconUrl(charDef.startingWeaponId)}
                      alt=""
                      className="lne-inline-icon"
                    />
                    {WEAPON_MAP[charDef.startingWeaponId]?.nameZh} · 关卡：{stageDef.nameZh}
                  </span>
                  <small>{charDef.description}</small>
                </div>
              </div>
              <img
                src={getCharacterPortraitUrl(CHARACTERS[6]?.id ?? 'herbwise_bode', false)}
                alt=""
                className="lne-home-side-hero"
              />
            </div>

            <div className="lne-home-buttons">
              <button
                type="button"
                className="lne-home-start-btn"
                onClick={() => openModal('newRun')}
              >
                开始游戏
              </button>

              <button
                type="button"
                className="lne-royal-pill-btn"
                onClick={resumeCombat}
              >
                {run.tick > 0 ? `继续进度 (${formatClock(run.stageClockTicks)})` : '直接出击当前角色'}
              </button>

              <div className="lne-home-btn-row">
                <button
                  type="button"
                  className="lne-home-crimson-btn"
                  onClick={() => openModal('powerups')}
                >
                  强化
                </button>
                <button
                  type="button"
                  className="lne-royal-pill-btn"
                  onClick={() => openModal('collection')}
                >
                  收藏
                </button>
                <button
                  type="button"
                  className="lne-royal-pill-btn"
                  onClick={() => openModal('adventures')}
                >
                  冒险
                </button>
                <button
                  type="button"
                  className="lne-royal-pill-btn lne-royal-pill-gold"
                  onClick={() => openModal('guide')}
                >
                  攻略与进化表
                </button>
                <button
                  type="button"
                  className="lne-royal-pill-btn lne-royal-pill-purple"
                  onClick={() => openModal('trainer')}
                >
                  🛠 内置修改器
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4B. Pause / Grimoire Screen (: Left Stat Sheet + Center Evolution Chart + Right Arcana + Bottom Royal Blue Buttons) */}
      {screenMode === 'battle' && manualPaused && activeModal === 'none' && run.phase === 'combat' && (
        <div className="lne-pause-overlay">
          <div className="lne-pause-main-row">
            {renderStatSheet()}

            <div className="lne-slate-panel lne-pause-grimoire-panel">
              <h2 className="lne-slate-panel-title">武器进化与组合</h2>
              {renderEvolutionFormulaGrid()}
            </div>

            <aside className="lne-pause-arcana-column">
              <div className="lne-arcana-header-icon">🃏</div>
              {[0, 1, 2].map((slotIdx) => {
                const arcId = run.arcanas[slotIdx];
                const arcDef = arcId ? ARCANA_MAP[arcId] : undefined;
                return (
                  <div
                    key={`arc_slot_${slotIdx}`}
                    className={`lne-arcana-card-slot ${arcDef ? 'lne-arcana-card-active' : ''}`}
                    title={arcDef ? `${arcDef.nameZh}：${arcDef.description}` : '未装配奥秘牌'}
                  >
                    {arcDef ? (
                      <>
                        <span className="lne-arcana-roman">{arcDef.roman}</span>
                        <div className="lne-arcana-art" />
                        <small className="lne-arcana-name">{arcDef.nameZh}</small>
                      </>
                    ) : (
                      <div className="lne-arcana-empty-back" />
                    )}
                  </div>
                );
              })}
            </aside>
          </div>

          <div className="lne-pause-bottom-bar">
            <button
              type="button"
              className="lne-royal-pill-btn"
              onClick={() => openModal('settings')}
            >
              选项
            </button>
            <button
              type="button"
              className="lne-royal-pill-btn"
              onClick={() => openModal('guide')}
            >
              攻略与流派
            </button>
            <button
              type="button"
              className="lne-royal-pill-btn lne-royal-pill-purple"
              onClick={() => openModal('trainer')}
            >
              🛠 修改器
            </button>
            <button
              type="button"
              className="lne-royal-pill-btn"
              onClick={() => setScreenMode('title')}
            >
              返回首页
            </button>
            {run.tick > 0 && (
              <button
                type="button"
                className="lne-home-crimson-btn"
                onClick={() => singletonEngine.dispatch({ type: 'END_RUN_EARLY' })}
              >
                结算本局
              </button>
            )}
            <button
              type="button"
              className="lne-royal-pill-btn lne-royal-continue-btn"
              onClick={resumeCombat}
            >
              继续
            </button>
          </div>
        </div>
      )}

      {/* 5. Level-Up / Arcana / Survarot Choice Modal */}
      {run.phase === 'choice' && run.pendingChoice && (
        <div className="lne-modal-backdrop">
          <div className="lne-levelup-layout">
            {renderStatSheet()}

            <div className="lne-gothic-modal lne-levelup-box">
              <h2 className="lne-gothic-title">
                {run.pendingChoice.source === 'arcana_draft'
                  ? '🃏 命运奥秘选择'
                  : run.pendingChoice.source === 'survarot_draft'
                    ? '🌟 1.15 命运星牌 (Survarot)'
                    : '升级! 选择一项强化'}
              </h2>
              <div className="lne-choice-list">
                {run.pendingChoice.options.map((opt) => (
                  <div key={opt.optionId} className="lne-levelup-option">
                    <img
                      src={getItemIconUrl(opt.targetId)}
                      alt={opt.titleZh}
                      className="lne-option-pixel-icon"
                    />
                    <div className="lne-option-body">
                      <div className="lne-option-header">
                        <strong>{opt.titleZh}</strong>
                        <span className="lne-option-badge">
                          {opt.isNew ? '新!' : `等级 ${opt.nextLevel}`}
                        </span>
                      </div>
                      <p>{opt.subtitleZh}</p>
                    </div>
                    <div className="lne-choice-btns">
                      <button
                        type="button"
                        className="lne-gothic-btn lne-gothic-btn-gold"
                        onClick={() => {
                          singletonEngine.dispatch({
                            type: 'SELECT_CHOICE_OPTION',
                            optionId: opt.optionId,
                          });
                          singletonSound.play('levelup');
                        }}
                      >
                        选择
                      </button>
                      {run.player.banishesRemaining > 0 &&
                        run.pendingChoice?.source === 'level_up' && (
                          <button
                            type="button"
                            className="lne-gothic-btn lne-gothic-btn-sm lne-gothic-btn-crimson"
                            onClick={() =>
                              singletonEngine.dispatch({
                                type: 'BANISH_CHOICE',
                                optionId: opt.optionId,
                              })
                            }
                          >
                            放逐 ({run.player.banishesRemaining})
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="lne-levelup-footer">
                <button
                  type="button"
                  className="lne-gothic-btn"
                  disabled={run.player.rerollsRemaining <= 0}
                  onClick={() => singletonEngine.dispatch({ type: 'REROLL_CHOICE' })}
                >
                  🎲 重抽 ({run.player.rerollsRemaining})
                </button>
                <button
                  type="button"
                  className="lne-gothic-btn"
                  disabled={run.player.skipsRemaining <= 0}
                  onClick={() => singletonEngine.dispatch({ type: 'SKIP_CHOICE' })}
                >
                  ⏭ 跳过换经验 ({run.player.skipsRemaining})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Treasure Chest Modal */}
      {run.phase === 'chest' && run.pendingChest && (
        <div className="lne-modal-backdrop">
          <div className="lne-gothic-modal lne-chest-modal">
            <h2 className="lne-gothic-title lne-gold-text">
              🎁 开启宝箱! ({run.pendingChest.tier} 阶秘宝)
            </h2>
            <div className="lne-chest-gold-counter">
              + {run.pendingChest.goldAwarded} 金币
            </div>
            <div className="lne-choice-list">
              {run.pendingChest.rewards.map((rw, idx) => (
                <div key={`${rw.targetId}_${idx}`} className="lne-levelup-option lne-chest-reward">
                  <img
                    src={getItemIconUrl(rw.targetId)}
                    alt={rw.titleZh}
                    className="lne-option-pixel-icon"
                  />
                  <div className="lne-option-body">
                    <strong>{rw.titleZh}</strong>
                    <p>{rw.subtitleZh}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="lne-levelup-footer">
              {!run.pendingChest.animationSkipped && (
                <button
                  type="button"
                  className="lne-gothic-btn"
                  onClick={() => singletonEngine.dispatch({ type: 'SKIP_CHEST_ANIMATION' })}
                >
                  跳过动画
                </button>
              )}
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-cta"
                onClick={() => {
                  singletonEngine.dispatch({ type: 'CONFIRM_CHEST_REWARD' });
                  singletonSound.play('chest');
                }}
              >
                收下宝物
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Run Settlement / Game Over Modal */}
      {run.phase === 'settled' && run.settlement && (
        <div className="lne-modal-backdrop">
          <div className="lne-gothic-modal">
            <h2 className="lne-gothic-title">
              {run.settlement.reason === 'victory'
                ? '🏆 生存胜利 STAGE COMPLETE'
                : run.settlement.reason === 'defeat'
                  ? '💀 生存终结 GAME OVER'
                  : '🏁 本局结算 RESULTS'}
            </h2>
            <div className="lne-settlement-summary">
              <img
                src={getCharacterPortraitUrl(charDef.id)}
                alt={charDef.nameZh}
                className="lne-pixel-portrait"
              />
              <div>
                <p>
                  <strong>{charDef.nameZh}</strong> · {stageDef.nameZh}
                </p>
                <p>
                  存活时间：{formatClock(run.settlement.survivedSeconds * TICKS_PER_SECOND)} ·
                  达成等级：Lv.{run.settlement.levelReached}
                </p>
                <p>
                  消灭敌群：{run.settlement.kills.toLocaleString()} · 获得金币：+
                  {run.settlement.goldEarned.toLocaleString()}
                </p>
              </div>
            </div>
            {run.settlement.adventureChapterCompleted && (
              <p className="lne-highlight">
                🎉 已完成冒险章节：{run.settlement.adventureChapterCompleted}
              </p>
            )}
            {run.settlement.newlyUnlockedIds.length > 0 && (
              <p className="lne-highlight">
                🔓 新增解锁：{run.settlement.newlyUnlockedIds.join(', ')}
              </p>
            )}
            <div className="lne-levelup-footer">
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-cta"
                onClick={() => {
                  void handleStartConfiguredRun(run.adventureId, run.adventureChapterId).then(() =>
                    resumeCombat(),
                  );
                }}
              >
                ▶ 再来一局
              </button>
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-gold"
                onClick={() => openModal('newRun')}
              >
                ⚔ 更换角色与关卡
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Character Selection & Stage Select Screen  */}
      {activeModal === 'newRun' && (() => {
        const availChars = CHARACTERS.filter((c) => c.scope !== 'dlc_excluded');
        const selChar = CHARACTER_MAP[selCharId] ?? availChars[0]!;
        const selUnlocked = profile.unlockedCharacterIds.includes(selChar.id);
        const selEggs = profile.goldenEggsByCharacter[selChar.id] ?? 0;

        return (
          <div className="lne-charselect-backdrop">
            <div className="lne-charselect-top-bar">
              <div className="lne-home-gold-box">
                <span className="lne-home-coin-pile">🪙</span>
                <strong>{profile.gold.toLocaleString()}</strong>
              </div>
              <button
                type="button"
                className="lne-home-crimson-btn"
                onClick={() => openModal('none')}
              >
                返回
              </button>
            </div>

            <div className="lne-charselect-columns">
              {/* Left/Center:  Character Selection Slate Panel */}
              <div className="lne-slate-panel lne-charselect-panel">
                <h2 className="lne-slate-panel-title">角色选择</h2>

                <div className="lne-authentic-char-grid">
                  {availChars.map((c) => {
                    const unlocked = profile.unlockedCharacterIds.includes(c.id);
                    const isSel = selCharId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`lne-authentic-char-tile ${isSel ? 'lne-tile-selected' : ''} ${!unlocked ? 'lne-tile-locked' : ''}`}
                        onClick={() => setSelCharId(c.id)}
                      >
                        <div className="lne-tile-name">{shortCharName(c.nameZh)}</div>
                        <div className="lne-tile-bottom">
                          <img
                            src={getCharacterPortraitUrl(c.id, !unlocked)}
                            alt={c.nameZh}
                            className="lne-tile-char-sprite"
                          />
                          <img
                            src={getItemIconUrl(c.startingWeaponId)}
                            alt={WEAPON_MAP[c.startingWeaponId]?.nameZh}
                            className={`lne-tile-weapon-icon ${!unlocked ? 'lne-tile-weapon-dim' : ''}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Selected Character Detail Drawer (matches  "波 拉奇奥" drawer) */}
                <div className="lne-char-detail-drawer">
                  <div className="lne-drawer-header">
                    <strong>
                      {selChar.nameZh.replace('·', ' ')}
                      {selEggs > 0 ? ` · 金蛋 ×${selEggs}` : ''}
                    </strong>
                    <span className="lne-drawer-star">★</span>
                  </div>

                  <div className="lne-drawer-body">
                    <div className="lne-drawer-sprite-col">
                      <img
                        src={getCharacterPortraitUrl(selChar.id, !selUnlocked)}
                        alt={selChar.nameZh}
                        className="lne-drawer-sprite"
                      />
                      <div className="lne-drawer-skin-pips">
                        <span className="lne-skin-pip lne-skin-pip-active" />
                        <span className="lne-skin-pip" />
                      </div>
                    </div>

                    <div className="lne-drawer-weapon-frame">
                      <img
                        src={getItemIconUrl(selChar.startingWeaponId)}
                        alt={WEAPON_MAP[selChar.startingWeaponId]?.nameZh}
                      />
                    </div>

                    <div className="lne-drawer-desc">
                      <p>{selChar.description}</p>
                      {!selUnlocked && (
                        <small className="lne-gold-text">
                          解锁条件：{selChar.unlockHintZh}（或消耗 {selChar.unlockCost} 金币直接招募）
                        </small>
                      )}
                    </div>

                    <div className="lne-drawer-actions">
                      {!selUnlocked ? (
                        <button
                          type="button"
                          className="lne-home-crimson-btn"
                          disabled={profile.gold < selChar.unlockCost}
                          onClick={() => {
                            singletonEngine.dispatch({
                              type: 'BUY_CHARACTER',
                              characterId: selChar.id,
                            });
                            singletonSound.play('unlock');
                          }}
                        >
                          解锁 ({selChar.unlockCost} 🪙)
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="lne-royal-pill-btn lne-royal-pill-sm"
                          disabled={profile.gold < 10000}
                          onClick={() =>
                            singletonEngine.dispatch({
                              type: 'BUY_GOLDEN_EGG',
                              characterId: selChar.id,
                            })
                          }
                        >
                          购买金蛋 (10000)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Stage Checklist & Rules + Green Confirm Button (matches right side of ) */}
              <div className="lne-charselect-right-col">
                <div className="lne-royal-header-banner">关卡与法则配置</div>

                <div className="lne-stage-checklist-box">
                  <div className="lne-stage-list-title">选择出击地图</div>
                  {STAGES.filter((s) => s.scope !== 'dlc_excluded').map((s) => {
                    const unlocked = profile.unlockedStageIds.includes(s.id);
                    const isSelected = selStageId === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`lne-stage-check-row ${isSelected ? 'lne-stage-row-active' : ''} ${!unlocked ? 'lne-stage-row-locked' : ''}`}
                        onClick={() => {
                          if (unlocked) setSelStageId(s.id);
                        }}
                      >
                        <span className={`lne-gold-checkbox ${isSelected ? 'lne-checked' : ''}`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <div className="lne-stage-row-info">
                          <strong>{unlocked ? s.nameZh : `???? (${s.nameZh})`}</strong>
                          <small>
                            {unlocked
                              ? `${s.timeLimitMinutes} 分钟 · ${s.description}`
                              : `解锁条件：${s.unlockHintZh}`}
                          </small>
                        </div>
                      </div>
                    );
                  })}

                  <div className="lne-stage-list-title" style={{ marginTop: '10px' }}>
                    关卡词缀开关
                  </div>
                  <div className="lne-rule-check-grid">
                    {(
                      [
                        ['hyper', '狂热 (Hyper)'],
                        ['hurry', '倍速 (Hurry)'],
                        ['arcana', '奥秘牌 (Arcanas)'],
                        ['limitBreak', '极限突破 (Limit Break)'],
                        ['inverse', '反转 (+200% 金币)'],
                        ['endless', '无尽循环 (Endless)'],
                        ['randomEvents', '随机事件'],
                        ['survarots', '命运星牌'],
                      ] as Array<[ModeId, string]>
                    ).map(([mId, label]) => (
                      <label key={mId} className="lne-rule-check-item">
                        <input
                          type="checkbox"
                          checked={selModes[mId]}
                          onChange={(e) =>
                            setSelModes((prev) => ({ ...prev, [mId]: e.target.checked }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                    <label className="lne-rule-check-item">
                      <input
                        type="checkbox"
                        checked={profile.eggsEnabled}
                        onChange={() => singletonEngine.dispatch({ type: 'TOGGLE_EGGS_ENABLED' })}
                      />
                      <span>启用金蛋加成</span>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  className="lne-home-start-btn lne-confirm-run-btn"
                  disabled={!selUnlocked}
                  onClick={() => {
                    void handleStartConfiguredRun(null, null).then(() => resumeCombat());
                  }}
                >
                  {selUnlocked ? '确认出击 (START)' : '请先解锁所选角色'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 9. PowerUps Shop Modal */}
      {activeModal === 'powerups' && (
        <div className="lne-modal-backdrop" onClick={() => openModal('none')}>
          <div className="lne-gothic-modal lne-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="lne-modal-top-row">
              <h2 className="lne-gothic-title">
                ⚡ 强化商店 POWER UP (金库: 🪙 {profile.gold} · 可退还:{' '}
                {getTotalPowerUpRefund(profile.powerUpRanks)})
              </h2>
              <button type="button" className="lne-gothic-btn" onClick={() => openModal('none')}>
                返回
              </button>
            </div>
            <div className="lne-char-grid">
              {POWERUPS.map((pw) => {
                const rank = profile.powerUpRanks[pw.id] ?? 0;
                const cost = getPowerUpPurchaseCost(pw.id, profile.powerUpRanks);
                return (
                  <div key={pw.id} className="lne-char-card">
                    <div className="lne-char-card-top">
                      <img
                        src={getItemIconUrl(pw.id)}
                        alt={pw.nameZh}
                        className="lne-option-pixel-icon"
                      />
                      <div className="lne-char-card-title">
                        <strong>{pw.nameZh}</strong>
                        <div className="lne-rank-pips">
                          {Array.from({ length: pw.maxRank }).map((_, idx) => (
                            <span
                              key={idx}
                              className={`lne-pip ${idx < rank ? 'lne-pip-filled' : ''}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <p>{pw.description}</p>
                    <button
                      type="button"
                      className="lne-gothic-btn lne-gothic-btn-sm lne-gothic-btn-gold"
                      disabled={rank >= pw.maxRank || profile.gold < cost}
                      onClick={() => {
                        singletonEngine.dispatch({ type: 'BUY_POWERUP', powerUpId: pw.id });
                        singletonSound.play('unlock');
                      }}
                    >
                      {rank >= pw.maxRank ? '✓ 已满级' : `🪙 购买 (${cost})`}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="lne-levelup-footer">
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-crimson"
                onClick={() => singletonEngine.dispatch({ type: 'RESET_POWERUPS' })}
              >
                🔄 100% 免费重置全部强化
              </button>
              <button type="button" className="lne-gothic-btn" onClick={() => openModal('none')}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Base Game Adventures Modal */}
      {activeModal === 'adventures' && (
        <div className="lne-modal-backdrop" onClick={() => openModal('none')}>
          <div className="lne-gothic-modal lne-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="lne-modal-top-row">
              <h2 className="lne-gothic-title">🗺 本体内置冒险 (独立进度与升阶)</h2>
              <button type="button" className="lne-gothic-btn" onClick={() => openModal('none')}>
                返回
              </button>
            </div>
            <div className="lne-stage-grid">
              {ADVENTURES.filter((a) => a.scope !== 'dlc_excluded').map((adv) => {
                const advState = profile.adventures[adv.id];
                const completedCount = advState?.completedChapterIds.length ?? 0;
                return (
                  <div key={adv.id} className="lne-stage-card">
                    <strong>
                      {adv.nameZh} (升阶 Lv.{advState?.ascensionLevel ?? 0} · 独立金币:{' '}
                      {advState?.gold ?? 0})
                    </strong>
                    <p>{adv.description}</p>
                    <div className="lne-adv-chapters">
                      {adv.chapters.map((ch) => {
                        const done = advState?.completedChapterIds.includes(ch.chapterId);
                        return (
                          <div key={ch.chapterId} className="lne-adv-chapter-row">
                            <span>
                              {done ? '✅' : '⬜'} {ch.nameZh} (+{ch.rewardGold} 金币)
                            </span>
                            <button
                              type="button"
                              className="lne-gothic-btn lne-gothic-btn-sm lne-gothic-btn-gold"
                              onClick={() => {
                                void handleStartConfiguredRun(adv.id, ch.chapterId).then(() =>
                                  resumeCombat(),
                                );
                              }}
                            >
                              出击章节
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="lne-gothic-btn lne-gothic-btn-sm"
                      disabled={completedCount < adv.chapters.length}
                      onClick={() =>
                        singletonEngine.dispatch({
                          type: 'ASCEND_ADVENTURE',
                          adventureId: adv.id,
                        })
                      }
                    >
                      ✨ 升阶重置 (Ascend)
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 11. Grimoire, Collection, Seal & Secret Spells Modal */}
      {activeModal === 'collection' && (
        <div className="lne-modal-backdrop" onClick={() => openModal('none')}>
          <div className="lne-gothic-modal lne-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="lne-modal-top-row">
              <h2 className="lne-gothic-title">📖 魔导书进化表、武器收藏与秘密咒语</h2>
              <button type="button" className="lne-gothic-btn" onClick={() => openModal('none')}>
                返回
              </button>
            </div>

            <div className="lne-spell-bar">
              <input
                type="text"
                className="lne-input"
                placeholder="输入秘密咒语（如 x-x1viiq / everything / ihaveseenit）"
                value={spellInput}
                onChange={(e) => setSpellInput(e.target.value)}
              />
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-gold"
                onClick={() => {
                  const ok = singletonEngine.dispatch({
                    type: 'CAST_SECRET_SPELL',
                    code: spellInput,
                  });
                  setStatusMessage(
                    ok ? `✨ 咒语生效：${spellInput}` : '咒语未匹配，请核对下方秘密列表。',
                  );
                  if (ok) singletonSound.play('unlock');
                }}
              >
                吟唱咒语
              </button>
            </div>

            <h3 className="lne-section-heading">超武进化与联合进化配方 (Grimoire · 共 {EVOLUTIONS.length} 条)</h3>
            <div className="lne-char-grid">
              {EVOLUTIONS.map((ev) => (
                <div key={ev.id} className="lne-char-card">
                  <div className="lne-char-card-top">
                    <img
                      src={getItemIconUrl(ev.id)}
                      alt={ev.nameZh}
                      className="lne-option-pixel-icon"
                    />
                    <strong>{ev.nameZh}</strong>
                  </div>
                  <p>{ev.description}</p>
                </div>
              ))}
            </div>

            <h3 className="lne-section-heading">
              武器图鉴与封印 (已封印 {profile.sealedItemIds.length}/
              {profile.powerUpRanks['pw_seal'] ?? 0})
            </h3>
            <div className="lne-char-grid">
              {WEAPONS.filter((w) => w.scope !== 'dlc_excluded').map((w) => {
                const sealed = profile.sealedItemIds.includes(w.id);
                return (
                  <div key={w.id} className="lne-char-card">
                    <div className="lne-char-card-top">
                      <img
                        src={getItemIconUrl(w.id)}
                        alt={w.nameZh}
                        className="lne-option-pixel-icon"
                      />
                      <strong>
                        {w.nameZh} {sealed ? '🔒[封印]' : ''}
                      </strong>
                    </div>
                    <p>{w.description}</p>
                    {w.kind === 'base' && (
                      <button
                        type="button"
                        className="lne-gothic-btn lne-gothic-btn-sm"
                        onClick={() =>
                          singletonEngine.dispatch({ type: 'TOGGLE_SEAL_ITEM', itemId: w.id })
                        }
                      >
                        {sealed ? '解除封印' : '🔒 封印'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <h3 className="lne-section-heading">秘密咒语名录 (Secrets)</h3>
            <div className="lne-char-grid">
              {SECRET_SPELLS.map((sp) => (
                <div key={sp.id} className="lne-char-card">
                  <strong>{sp.nameZh}</strong>
                  <small className="lne-gold-text">咒语: {sp.code}</small>
                  <p>{sp.hintZh}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 12. 3-Slot Save & Backup Manager Modal */}
      {activeModal === 'saves' && (
        <div className="lne-modal-backdrop" onClick={() => openModal('none')}>
          <div className="lne-gothic-modal lne-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="lne-modal-top-row">
              <h2 className="lne-gothic-title">💾 本机三档案、断点续玩与 JSON 导入导出</h2>
              <button type="button" className="lne-gothic-btn" onClick={() => openModal('none')}>
                返回
              </button>
            </div>
            <div className="lne-char-grid">
              {slotSummaries.map((s) => (
                <div
                  key={s.slotId}
                  className={`lne-char-card ${profile.slotId === s.slotId ? 'lne-selected' : ''}`}
                >
                  <strong>
                    档案槽位 #{s.slotId} {profile.slotId === s.slotId ? '（当前）' : ''}
                  </strong>
                  <p>
                    {s.exists
                      ? `角色: ${CHARACTER_MAP[s.characterId ?? '']?.nameZh ?? s.characterId} · Lv.${s.level} · 金币: ${s.gold} · 备份: ${s.backupCount} 份`
                      : '空白档案槽位'}
                  </p>
                  <div className="lne-choice-btns">
                    <button
                      type="button"
                      className="lne-gothic-btn lne-gothic-btn-sm lne-gothic-btn-gold"
                      onClick={() => void handleSwitchSlot(s.slotId)}
                    >
                      切换至此档案
                    </button>
                    {s.backupCount > 0 && (
                      <button
                        type="button"
                        className="lne-gothic-btn lne-gothic-btn-sm"
                        onClick={async () => {
                          const res = await restoreSlotBackup(s.slotId, 0);
                          if (res.run && res.profile) {
                            singletonEngine.loadState(res.run, res.profile);
                            setStatusMessage(`已恢复档案 ${s.slotId} 的最近备份。`);
                          }
                        }}
                      >
                        恢复备份
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="lne-section-heading">导出 / 导入 JSON (上限 32 MiB)</h3>
            <div className="lne-choice-btns">
              <button
                type="button"
                className="lne-gothic-btn"
                onClick={() => {
                  setImportJsonText(serializeExportBundle(run, profile));
                  setStatusMessage('已生成当前档案与局内快照 JSON。');
                }}
              >
                导出当前档案到文本框
              </button>
              <button
                type="button"
                className="lne-gothic-btn lne-gothic-btn-gold"
                onClick={async () => {
                  const res = await importJsonToSlot(profile.slotId, importJsonText);
                  if (res.ok && res.run && res.profile) {
                    singletonEngine.loadState(res.run, res.profile);
                    await refreshSlots();
                    setStatusMessage('JSON 存档导入成功！');
                  } else {
                    setStatusMessage(res.error ?? '导入失败');
                  }
                }}
              >
                校验并导入到当前槽位
              </button>
            </div>
            <textarea
              className="lne-textarea"
              rows={5}
              placeholder="在此粘贴要导入的 JSON 存档..."
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* 13. Audio & Visual Settings Modal */}
      {activeModal === 'settings' && (
        <div className="lne-modal-backdrop" onClick={() => openModal('none')}>
          <div className="lne-gothic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lne-modal-top-row">
              <h2 className="lne-gothic-title">⚙ 音频与画面清晰设置</h2>
              <button type="button" className="lne-gothic-btn" onClick={() => openModal('none')}>
                返回
              </button>
            </div>
            <div className="lne-settings-list">
              <label className="lne-checkbox-pill">
                <input
                  type="checkbox"
                  checked={profile.settings.userMuted}
                  onChange={(e) =>
                    singletonEngine.dispatch({
                      type: 'UPDATE_SETTINGS',
                      settings: { userMuted: e.target.checked },
                    })
                  }
                />
                总静音（与平台防 Boss 临时静音独立保存）
              </label>

              <label className="lne-checkbox-pill">
                <span>音效音量 ({Math.round(profile.settings.sfxVolume * 100)}%)</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={profile.settings.sfxVolume}
                  onChange={(e) =>
                    singletonEngine.dispatch({
                      type: 'UPDATE_SETTINGS',
                      settings: { sfxVolume: Number(e.target.value) },
                    })
                  }
                />
              </label>

              <label className="lne-checkbox-pill">
                <input
                  type="checkbox"
                  checked={profile.settings.lowFxMode}
                  onChange={(e) =>
                    singletonEngine.dispatch({
                      type: 'UPDATE_SETTINGS',
                      settings: { lowFxMode: e.target.checked },
                    })
                  }
                />
                低特效清晰模式（仅降低闪烁与飘字，不删减弹体、敌人或经验）
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 14. In-Game Visual Grimoire & Build Guide Modal */}
      {activeModal === 'guide' && (
        <div
          className="lne-modal-backdrop"
          onClick={() => openModal('none')}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="lne-slate-panel lne-modal-wide lne-guide-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lne-modal-top-row">
              <h2 className="lne-slate-panel-title" style={{ margin: 0 }}>
                武器进化与流派攻略
              </h2>
              <button
                type="button"
                className="lne-home-crimson-btn"
                onClick={() => openModal('none')}
                aria-label="关闭攻略"
                title="关闭攻略 (Esc)"
              >
                ✕ 关闭
              </button>
            </div>

            {/* Guide Tabs */}
            <div className="lne-guide-tabs">
              <button
                type="button"
                className={`lne-royal-pill-btn lne-royal-pill-sm ${guideTab === 'grimoire' ? 'lne-royal-pill-gold' : ''}`}
                onClick={() => setGuideTab('grimoire')}
              >
                📖 武器进化合成表
              </button>
              <button
                type="button"
                className={`lne-royal-pill-btn lne-royal-pill-sm ${guideTab === 'builds' ? 'lne-royal-pill-gold' : ''}`}
                onClick={() => setGuideTab('builds')}
              >
                ⚔ 四套实战搭配 (6+6)
              </button>
              <button
                type="button"
                className={`lne-royal-pill-btn lne-royal-pill-sm ${guideTab === 'tier' ? 'lne-royal-pill-gold' : ''}`}
                onClick={() => setGuideTab('tier')}
              >
                ⭐ 被动优先级
              </button>
              <button
                type="button"
                className={`lne-royal-pill-btn lne-royal-pill-sm ${guideTab === 'tips' ? 'lne-royal-pill-gold' : ''}`}
                onClick={() => setGuideTab('tips')}
              >
                💡 进阶细节
              </button>
            </div>

            {/* Tab 0: Visual Formula Chart ( style) */}
            {guideTab === 'grimoire' && (
              <div className="lne-guide-content">
                <div className="lne-grimoire-legend">
                  <span>
                    <strong>进化规则：</strong>主武器升到满级（通常 8 级）并持有对应被动道具（1 级即可，合体超武与礼品超武需双方满级），拾取 10:00 后精英怪掉落的宝箱即可进化。
                  </span>
                  <span className="lne-legend-owned-tag">■ 橄榄金底色 = 本局已持有</span>
                </div>
                {renderEvolutionFormulaGrid()}
              </div>
            )}

            {/* Tab 1: 4 Visual 6+6 Builds (Clean Grimoire Design) */}
            {guideTab === 'builds' && (
              <div className="lne-guide-content">
                {[
                  {
                    badge: '🛡️ 搭配一',
                    badgeClass: 'lne-badge-defense',
                    title: '近身环绕防守流（适合新手开荒与稳健生存）',
                    desc: '围绕角色铺开圣经、圣水和噬魂者三层近身伤害圈，怪群靠近前就会被持续消耗并击退，中后期走位压力极小。',
                    weapons: [
                      ['king_bible', 'unholy_vespers', '邪恶晚祷', '国王圣经 ➜ 邪恶晚祷 (受拼写器加成)'],
                      ['santa_water', 'la_borra', '圣洁之水', '圣水 ➜ 圣洁之水 (受吸引器加成)'],
                      ['garlic', 'soul_eater', '噬魂者', '大蒜 ➜ 噬魂者 (受番茄加成)'],
                      ['magic_wand', 'holy_wand', '圣魔杖', '魔杖 ➜ 圣魔杖 (受空白之书加成)'],
                      ['lightning_ring', 'thunder_loop', '雷电环', '闪电 ➜ 雷电之环 (受复制器加成)'],
                      ['axe', 'death_spiral', '死亡旋风', '斧头 ➜ 死亡旋风 (受烛台加成)'],
                    ],
                    passives: [
                      ['spellbinder', '拼写器', '拼写器：持续时间+50%（合成晚祷）'],
                      ['attractorb', '吸引器', '吸引器：拾取范围+165%（合成圣水）'],
                      ['empty_tome', '空白书', '空白之书：冷却缩减-40%（合成魔杖）'],
                      ['duplicator', '复制器', '复制器：发射数量+2（合成雷电）'],
                      ['candelabrador', '烛台', '烛台：攻击范围+50%（合成旋风）'],
                      ['pummarola', '番茄', '番茄：每秒恢复+1.0（合成噬魂者）'],
                    ],
                    combos: '典籍+拼写器 ➔ 晚祷 | 圣水+吸引器 ➔ 圣洁之水 | 大蒜+番茄 ➔ 噬魂者 | 魔杖+空白书 ➔ 圣魔杖 | 闪电+复制器 ➔ 雷电环 | 斧头+烛台 ➔ 死亡旋风',
                  },
                  {
                    badge: '💥 搭配二',
                    badgeClass: 'lne-badge-crit',
                    title: '高速暴击投射流（适合快速清理精英与高机动跑图）',
                    desc: '依靠天堂之剑、千刃和地狱火的高暴击倍率与穿透弹道，集中火力处理精英怪，配合血泪暴击回血维持血线。',
                    weapons: [
                      ['cross', 'heaven_sword', '天堂之剑', '十字架 ➜ 天堂之剑 (受四叶草加成)'],
                      ['axe', 'death_spiral', '死亡旋风', '斧头 ➜ 死亡旋风 (受烛台加成)'],
                      ['fire_wand', 'hellfire', '地狱火', '火魔杖 ➜ 地狱火 (受菠菜加成)'],
                      ['knife', 'thousand_edge', '千刃', '小刀 ➜ 千刃 (受护腕加成)'],
                      ['runetracer', 'no_future', '无未来', '符文 ➜ 无未来 (受护甲加成)'],
                      ['whip', 'bloody_tear', '血泪', '鞭子 ➜ 血泪 (受黑心加成)'],
                    ],
                    passives: [
                      ['clover', '四叶草', '四叶草：暴击幸运+50%（合成天剑）'],
                      ['candelabrador', '烛台', '烛台：攻击范围+50%（合成旋风）'],
                      ['spinach', '菠菜', '菠菜：基础伤害+50%（合成地狱火）'],
                      ['bracer', '护腕', '护腕：弹道速度+50%（合成千刃）'],
                      ['armor', '护甲', '护甲：减伤5点+反伤（合成无未来）'],
                      ['hollow_heart', '黑心', '空虚之心：最大生命+100%（合成血泪）'],
                    ],
                    combos: '十字架+四叶草 ➔ 天剑 | 斧头+烛台 ➔ 旋风 | 火杖+菠菜 ➔ 地狱火 | 飞刀+护腕 ➔ 千刃 | 符文+护甲 ➔ 无未来 | 鞭子+黑心 ➔ 血泪',
                  },
                  {
                    badge: '☠️ 搭配三',
                    badgeClass: 'lne-badge-reaper',
                    title: '30 分钟终局死神针对流（百分比削血 + 锁伤护盾）',
                    desc: '30:00 出现的终局死神血量极高（65 万 × 当前等级），常规武器很难打动，需要依靠无尽回廊的折半削血与绯红裹尸布的锁伤机制。',
                    weapons: [
                      ['clock_lancet', 'infinite_corridor', '无尽回廊', '时钟柳叶刀 ➜ 无尽回廊 (百分比折半削血)'],
                      ['laurel', 'crimson_shroud', '绯红裹尸布', '月桂 ➜ 绯红裹尸布 (伤害上限锁定10点)'],
                      ['magic_wand', 'holy_wand', '圣魔杖', '魔杖 ➜ 圣魔杖 (无缝击退控制)'],
                      ['king_bible', 'unholy_vespers', '邪恶晚祷', '典籍 ➜ 邪恶晚祷 (近身绝对防御)'],
                      ['santa_water', 'la_borra', '圣洁之水', '圣水 ➜ 圣洁之水 (跟随地毯伤害)'],
                      ['cross', 'heaven_sword', '天堂之剑', '十字架 ➜ 天堂之剑 (高额单体暴击)'],
                    ],
                    passives: [
                      ['silver_ring', '银戒指', '银戒指：持续+范围（合成无尽回廊）'],
                      ['gold_ring', '金戒指', '金戒指：诅咒+敌速（合成无尽回廊）'],
                      ['metaglio_left', '左元印', '左元印：生命+恢复（合成绯红裹尸布）'],
                      ['metaglio_right', '右元印', '右元印：诅咒+伤害（合成绯红裹尸布）'],
                      ['empty_tome', '空白书', '空白之书：冷却缩减-40%（极大加速削血）'],
                      ['spellbinder', '拼写器', '拼写器：延长晚祷与冻结（合成晚祷）'],
                    ],
                    combos: '柳叶刀+双戒指 ➔ 无尽回廊 | 月桂+双元印 ➔ 绯红裹尸布 | 典籍+拼写器 ➔ 晚祷 | 魔杖+空白书 ➔ 圣魔杖',
                  },
                  {
                    badge: '🪙 搭配四',
                    badgeClass: 'lne-badge-gold',
                    title: '黄金狂热刷金流（快速攒钱点满局外强化）',
                    desc: '华丽之月全屏清怪并自动吸附经验与宝珠，配合石面具与王冠实现超高金币产出，适合中期集中刷钱点满强化。',
                    weapons: [
                      ['pentagram', 'gorgeous_moon', '华丽之月', '五芒星 ➜ 华丽之月 (全屏清场+吸宝石)'],
                      ['garlic', 'soul_eater', '噬魂者', '大蒜 ➜ 噬魂者 (近身吸血护航)'],
                      ['santa_water', 'la_borra', '圣洁之水', '圣水 ➜ 圣洁之水 (大范围安全区)'],
                      ['king_bible', 'unholy_vespers', '邪恶晚祷', '典籍 ➜ 邪恶晚祷 (无死角贴身击退)'],
                      ['lightning_ring', 'thunder_loop', '雷电环', '闪电 ➜ 雷电之环 (大范围索敌)'],
                      ['laurel', 'crimson_shroud', '月桂', '月桂 ➜ 护盾容错保护'],
                    ],
                    passives: [
                      ['stone_mask', '石面具', '石面具：金币获取+50%（刷钱核心）'],
                      ['crown', '王冠', '王冠：经验成长+40%（合成华丽之月）'],
                      ['attractorb', '吸引器', '吸引器：全屏磁吸金币宝石（合成圣水）'],
                      ['clover', '四叶草', '四叶草：增加幸运与金币掉落'],
                      ['empty_tome', '空白书', '空白之书：缩短全屏清场冷却'],
                      ['pummarola', '番茄', '番茄：自动回血续航（合成噬魂者）'],
                    ],
                    combos: '五芒星+王冠 ➔ 华丽之月 | 圣水+吸引器 ➔ 圣洁之水 | 大蒜+番茄 ➔ 噬魂者 | 典籍+拼写器 ➔ 晚祷 | 闪电+复制器 ➔ 雷电环',
                  },
                ].map((b) => (
                  <div key={b.title} className="lne-guide-build-card">
                    <div className="lne-guide-build-header">
                      <span className={`lne-build-badge ${b.badgeClass}`}>{b.badge}</span>
                      <strong>{b.title}</strong>
                    </div>
                    <p className="lne-guide-desc">{b.desc}</p>

                    <div className="lne-visual-build-slots">
                      <div className="lne-visual-slot-group">
                        <span className="lne-combo-label">6 武器槽：</span>
                        <div className="lne-visual-icon-row">
                          {b.weapons.map(([baseId, evoId, shortName, tip]) => (
                            <div key={baseId} className="lne-visual-build-cell" title={tip}>
                              <div className="lne-visual-pair">
                                <img src={getItemIconUrl(baseId!)} alt="" />
                                <span>➜</span>
                                <img src={getItemIconUrl(evoId!)} alt="" />
                              </div>
                              <small className="lne-cell-shortname">{shortName}</small>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="lne-visual-slot-group">
                        <span className="lne-combo-label">6 被动槽：</span>
                        <div className="lne-visual-icon-row">
                          {b.passives.map(([pid, shortName, tip]) => (
                            <div key={pid} className="lne-visual-build-cell lne-visual-passive-cell" title={tip}>
                              <img src={getItemIconUrl(pid!)} alt="" />
                              <small className="lne-cell-shortname">{shortName}</small>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="lne-build-combo-strip">
                        <strong>超武组合：</strong>{b.combos}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 2: Passive Tier List (humanizer-zh natural copy) */}
            {guideTab === 'tier' && (
              <div className="lne-guide-content">
                <div className="lne-tier-section">
                  <div className="lne-tier-title lne-t0-title">⭐ 第一梯队：通用核心被动（多数阵容都值得优先拿）</div>
                  <div className="lne-tier-grid">
                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('empty_tome')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>空白之书 (Empty Tome)</strong>
                          <span className="lne-tier-tag lne-t0-tag">T0 通用</span>
                        </div>
                      </div>
                      <p>满级减少 40% 攻击冷却，直接提高所有武器的攻击频率，同时是魔杖进化的必需被动。</p>
                    </div>

                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('duplicator')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>复制器 (Duplicator)</strong>
                          <span className="lne-tier-tag lne-t0-tag">T0 通用</span>
                        </div>
                      </div>
                      <p>满级增加 2 个发射物，对前中期只有 1~2 发弹道的武器提升尤为明显，也是闪电戒指进化的配对道具。</p>
                    </div>

                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('candelabrador')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>烛台 (Candelabrador)</strong>
                          <span className="lne-tier-tag lne-t0-tag">T0 通用</span>
                        </div>
                      </div>
                      <p>满级扩大 50% 攻击范围，让圣水、大蒜、圣经和斧头的覆盖面积明显变大。</p>
                    </div>

                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('attractorb')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>吸引器 (Attractorb)</strong>
                          <span className="lne-tier-tag lne-t0-tag">T0 通用</span>
                        </div>
                      </div>
                      <p>大幅增加拾取半径，减少为了捡经验钻进怪堆掉血的风险，同时用于进化圣水。</p>
                    </div>
                  </div>

                  <div className="lne-tier-title lne-t1-title" style={{ marginTop: '14px' }}>
                    🔹 第二梯队：定向强化被动（按主武器进化需求选择）
                  </div>
                  <div className="lne-tier-grid">
                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('spinach')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>菠菜 (Spinach)</strong>
                          <span className="lne-tier-tag lne-t1-tag">T1 输出</span>
                        </div>
                      </div>
                      <p>满级提供 50% 基础伤害加成，并用于火焰魔杖进化地狱火。</p>
                    </div>

                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('spellbinder')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>拼写器 (Spellbinder)</strong>
                          <span className="lne-tier-tag lne-t1-tag">T1 持续</span>
                        </div>
                      </div>
                      <p>延长旋转与地面区域武器的持续时间，是国王圣经和符文追踪器进化的关键配件。</p>
                    </div>

                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('clover')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>四叶草 (Clover)</strong>
                          <span className="lne-tier-tag lne-t1-tag">T1 幸运</span>
                        </div>
                      </div>
                      <p>提升暴击率、多倍宝箱概率和升级四选一出现率，用于十字架进化天堂之剑。</p>
                    </div>

                    <div className="lne-tier-card">
                      <div className="lne-tier-card-top">
                        <img src={getItemIconUrl('stone_mask')} alt="" className="lne-option-pixel-icon" />
                        <div>
                          <strong>石面具 (Stone Mask)</strong>
                          <span className="lne-tier-tag lne-t1-tag">T1 经济</span>
                        </div>
                      </div>
                      <p>满级提升 50% 金币收益，并用于猫咪进化邪恶食欲。</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Pro Tips (humanizer-zh natural copy) */}
            {guideTab === 'tips' && (
              <div className="lne-guide-content lne-tips-list">
                <div className="lne-tip-card">
                  <strong className="lne-tip-headline">1. 前 5 分钟优先集中升满 1~2 把主武器</strong>
                  <p>
                    开局如果把 6 个武器槽全部占满且每样只升 1~2 级，单发伤害会跟不上第 5 分钟后的怪群血量。先把主力武器升到 6~8 级，清怪效率会稳定很多。
                  </p>
                </div>

                <div className="lne-tip-card">
                  <strong className="lne-tip-headline">2. 精英宝箱可以留在地上等到 10:00 后再捡</strong>
                  <p>
                    绝大多数常规关卡里，10:00 之前掉落的宝箱不会触发武器进化。8~9 分钟打出的宝箱可以先不捡，等主武器满级、凑齐配对被动且时间过 10:00 后再开箱。
                  </p>
                </div>

                <div className="lne-tip-card">
                  <strong className="lne-tip-headline">3. 先选满 6 个被动槽，再拾取地图地面被动</strong>
                  <p>
                    升级选满 6 个被动槽之后，再去捡地图上固定摆放的被动道具（例如镶嵌图书馆地面的石面具和空白之书），可以直接突破 6 槽限制，单局同时持有 7~10 件被动。
                  </p>
                </div>

                <div className="lne-tip-card">
                  <strong className="lne-tip-headline">4. 联合进化武器合成后会空出 1 个武器槽</strong>
                  <p>
                    白鸽与黑翼合成破坏者、红黑双枪合成菲拉吉后，原本占用的两个武器槽会合并为一个，空出来的槽位可以继续选一把新武器。
                  </p>
                </div>
              </div>
            )}

            <div className="lne-levelup-footer">
              <button
                type="button"
                className="lne-royal-pill-btn"
                onClick={() => openModal('none')}
                aria-label="关闭攻略"
              >
                ✕ 关闭攻略
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 15. Built-in Trainer & Cheat Menu Modal */}
      {activeModal === 'trainer' && (
        <div
          className="lne-modal-backdrop"
          onClick={() => openModal('none')}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="lne-slate-panel lne-modal-wide lne-trainer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lne-modal-top-row">
              <div className="lne-trainer-title-wrap">
                <h2 className="lne-slate-panel-title" style={{ margin: 0 }}>
                  🛠 开发者内置修改器
                </h2>
                <span className="lne-trainer-tag-live">TRAINER & CHEAT ENGINE</span>
              </div>
              <button
                type="button"
                className="lne-home-crimson-btn"
                onClick={() => openModal('none')}
                aria-label="关闭修改器"
                title="关闭修改器 (Esc / F1)"
              >
                ✕ 关闭
              </button>
            </div>

            {/* Trainer Tabs */}
            <div className="lne-guide-tabs">
              <button
                type="button"
                className={`lne-royal-pill-btn lne-royal-pill-sm ${trainerTab === 'gold' ? 'lne-royal-pill-purple-active' : ''}`}
                onClick={() => setTrainerTab('gold')}
              >
                🪙 金币与资产修改
              </button>
              <button
                type="button"
                className={`lne-royal-pill-btn lne-royal-pill-sm ${trainerTab === 'unlocks' ? 'lne-royal-pill-purple-active' : ''}`}
                onClick={() => setTrainerTab('unlocks')}
              >
                🔓 一键全解锁与全满
              </button>
              <button
                type="button"
                className={`lne-royal-pill-btn lne-royal-pill-sm ${trainerTab === 'combat' ? 'lne-royal-pill-purple-active' : ''}`}
                onClick={() => setTrainerTab('combat')}
              >
                ⚔️ 局内即时战斗辅助
              </button>
            </div>

            {/* Tab 1: Gold & Economy */}
            {trainerTab === 'gold' && (
              <div className="lne-guide-content">
                <div className="lne-cheat-card lne-cheat-gold-hero">
                  <div className="lne-cheat-gold-info">
                    <span className="lne-cheat-gold-label">全局金库可用总额</span>
                    <strong className="lne-cheat-gold-val">🪙 {profile.gold.toLocaleString()}</strong>
                    {run.phase === 'combat' && (
                      <span className="lne-cheat-gold-sub">本局战斗中已拾取金币：🪙 {run.stats.goldCollected.toLocaleString()}</span>
                    )}
                  </div>
                  <div className="lne-cheat-input-group">
                    <input
                      type="number"
                      className="lne-input lne-cheat-num-input"
                      placeholder="输入任意自定义金币数..."
                      value={customGoldInput}
                      onChange={(e) => setCustomGoldInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="lne-royal-pill-btn lne-royal-pill-gold"
                      onClick={() => {
                        const val = parseInt(customGoldInput, 10);
                        if (!Number.isNaN(val)) {
                          applyCheat({ kind: 'SET_GOLD', amount: val }, `金币总额已变更为 🪙 ${val.toLocaleString()}`);
                          setCustomGoldInput('');
                        }
                      }}
                    >
                      修改为此数值
                    </button>
                  </div>
                </div>

                <div className="lne-cheat-section">
                  <span className="lne-cheat-section-title">⚡ 快捷金币调控</span>
                  <div className="lne-cheat-btn-grid">
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'ADD_GOLD', delta: 10000 }, '已增加 10,000 金币！')}
                    >
                      🪙 +10,000 金币
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'ADD_GOLD', delta: 100000 }, '已增加 100,000 金币！')}
                    >
                      🪙 +100,000 金币
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'ADD_GOLD', delta: 1000000 }, '已增加 1,000,000 金币！')}
                    >
                      💰 +1,000,000 金币 (百万)
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-gold"
                      onClick={() => applyCheat({ kind: 'SET_GOLD', amount: 99999999 }, '金币已直接拉满至 99,999,999！')}
                    >
                      👑 金币拉满 (99,999,999)
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-danger"
                      onClick={() => applyCheat({ kind: 'SET_GOLD', amount: 0 }, '金币已清零')}
                    >
                      🗑 金币清零 (0)
                    </button>
                  </div>
                </div>

                <div className="lne-cheat-section">
                  <span className="lne-cheat-section-title">🥚 黄金蛋强化注入 (永久提升全属性)</span>
                  <div className="lne-cheat-desc">
                    当前选定角色：<strong>{CHARACTER_MAP[selCharId]?.nameZh ?? selCharId}</strong> · 已持有金蛋：
                    <span className="lne-gold-text"> {profile.goldenEggsByCharacter[selCharId] ?? 0} 个</span>
                  </div>
                  <div className="lne-cheat-btn-grid">
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'ADD_EGGS', characterId: selCharId, count: 10 }, `为 ${CHARACTER_MAP[selCharId]?.nameZh} 注入 10 枚金蛋`)}
                    >
                      🥚 +10 枚金蛋
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'ADD_EGGS', characterId: selCharId, count: 100 }, `为 ${CHARACTER_MAP[selCharId]?.nameZh} 注入 100 枚金蛋`)}
                    >
                      🥚 +100 枚金蛋
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-gold"
                      onClick={() => applyCheat({ kind: 'ADD_EGGS', characterId: selCharId, count: 1000 }, `为 ${CHARACTER_MAP[selCharId]?.nameZh} 注入 1,000 枚黄金蛋！`)}
                    >
                      ✨ +1,000 枚黄金蛋 (属性暴涨)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Full Unlocks */}
            {trainerTab === 'unlocks' && (
              <div className="lne-guide-content">
                <div className="lne-cheat-grid">
                  <div className="lne-cheat-card">
                    <strong>👥 全部角色解锁</strong>
                    <p>立即解锁全部 17 位角色（包含艾瑞丝·虚翼、马罗·灰面、塞拉芬·冠冕等隐藏角色）。</p>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-purple"
                      onClick={() => applyCheat({ kind: 'UNLOCK_ALL_CHARACTERS' }, '已解锁全部 17 位角色！')}
                    >
                      一键全角色解锁
                    </button>
                  </div>

                  <div className="lne-cheat-card">
                    <strong>🗺 全部地图关卡解锁</strong>
                    <p>开放疯狂森林、镶嵌图书馆、乳品厂、加洛塔、大教堂等全部关卡地图。</p>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-purple"
                      onClick={() => applyCheat({ kind: 'UNLOCK_ALL_STAGES' }, '已解锁全部地图关卡！')}
                    >
                      一键全关卡解锁
                    </button>
                  </div>

                  <div className="lne-cheat-card">
                    <strong>📜 局外强化全满 (PowerUps)</strong>
                    <p>无需消耗金币，攻击力、护甲、移动速度、范围、持续时间、数量、冷却、幸运全部升至满级。</p>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-gold"
                      onClick={() => applyCheat({ kind: 'MAX_ALL_POWERUPS' }, '所有局外强化已全部点满！')}
                    >
                      一键点满全部强化
                    </button>
                  </div>

                  <div className="lne-cheat-card">
                    <strong>✨ 全遗物与模式解锁</strong>
                    <p>直接激活黄衣之印、随机塔罗（Randomazzo）、暗黑奥秘、魔导书与全部模式功能。</p>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-purple"
                      onClick={() => applyCheat({ kind: 'UNLOCK_ALL_RELICS' }, '已激活全部核心遗物！')}
                    >
                      一键解锁全遗物
                    </button>
                  </div>

                  <div className="lne-cheat-card">
                    <strong>📖 收藏图鉴全点亮</strong>
                    <p>将全部武器、被动道具、超武进化的图鉴收藏全部标记已发现并点亮。</p>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-purple"
                      onClick={() => applyCheat({ kind: 'UNLOCK_ALL_COLLECTION' }, '全部图鉴与超武已点亮！')}
                    >
                      一键点亮全部图鉴
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Combat Real-Time Cheats */}
            {trainerTab === 'combat' && (
              <div className="lne-guide-content">
                <div className="lne-cheat-card lne-cheat-god-box">
                  <div className="lne-god-status-row">
                    <div>
                      <strong style={{ fontSize: 16 }}>🛡️ 无敌模式 (God Mode)</strong>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#cbd5e1' }}>
                        锁定最大生命值，完全免疫一切敌人碰撞伤害与即死。
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`lne-cheat-action-btn ${run.godMode ? 'lne-cheat-btn-active-green' : 'lne-cheat-btn-danger'}`}
                      onClick={() => applyCheat({ kind: 'TOGGLE_GOD_MODE' }, run.godMode ? '无敌模式已关闭' : '无敌模式已开启！')}
                    >
                      {run.godMode ? '✅ 无敌模式：已开启' : '❌ 无敌模式：已关闭'}
                    </button>
                  </div>
                </div>

                <div className="lne-cheat-section">
                  <span className="lne-cheat-section-title">⚡ 战斗状态瞬发调节</span>
                  <div className="lne-cheat-btn-grid">
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'HEAL_FULL' }, '生命值已瞬间回满 (100%)！')}
                    >
                      ❤️ 生命值完全回满
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'ADD_LEVELS', count: 1 }, '已增加 1 次升级选择机会！')}
                    >
                      ⬆️ 立即升 1 级 (升级选技)
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'ADD_LEVELS', count: 5 }, '已连续增加 5 次升级！')}
                    >
                      ⬆️ 立即升 5 级
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'MAX_REROLLS' }, '重抽、跳过与放逐已各补满 99 次！')}
                    >
                      🎲 重抽/跳过/放逐各补 99 次
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-purple"
                      onClick={() => applyCheat({ kind: 'VACUUM_ALL' }, '全屏经验宝石与金币已全部吸附过来！')}
                    >
                      🧲 全屏经验/金币瞬间吸取 (全图磁铁)
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-danger"
                      onClick={() => applyCheat({ kind: 'KILL_ALL_ENEMIES' }, '全屏敌人已秒杀清空！')}
                    >
                      💥 秒杀全屏敌人 (全图清场)
                    </button>
                  </div>
                </div>

                <div className="lne-cheat-section">
                  <span className="lne-cheat-section-title">🎁 宝箱与时间控制</span>
                  <div className="lne-cheat-btn-grid">
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'SPAWN_CHEST', tier: 1 }, '已在脚下生成 1 阶宝箱！')}
                    >
                      🎁 生成 1 阶普通宝箱
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'SPAWN_CHEST', tier: 3 }, '已在脚下生成 3 阶进阶宝箱！')}
                    >
                      🎁 生成 3 阶进阶宝箱
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-gold"
                      onClick={() => applyCheat({ kind: 'SPAWN_CHEST', tier: 5 }, '已在脚下生成 5 阶豪华超武宝箱！')}
                    >
                      🌟 生成 5 阶豪华超武宝箱
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'FORWARD_TIME', seconds: 60 }, '生存时间快进 1 分钟')}
                    >
                      ⏩ 快进 1 分钟 (+60s)
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn"
                      onClick={() => applyCheat({ kind: 'FORWARD_TIME', seconds: 300 }, '生存时间快进 5 分钟')}
                    >
                      ⏩ 快进 5 分钟 (+300s)
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-purple"
                      onClick={() => {
                        const targetTicks = 10 * 60 * TICKS_PER_SECOND;
                        const delta = Math.max(0, targetTicks - run.stageClockTicks);
                        applyCheat({ kind: 'FORWARD_TIME', seconds: Math.floor(delta / TICKS_PER_SECOND) }, '已直达 10:00 超武时间！');
                      }}
                    >
                      ⏱️ 直达 10:00 (超武箱时间)
                    </button>
                    <button
                      type="button"
                      className="lne-cheat-action-btn lne-cheat-btn-danger"
                      onClick={() => {
                        const targetTicks = (30 * 60 - 10) * TICKS_PER_SECOND;
                        const delta = Math.max(0, targetTicks - run.stageClockTicks);
                        applyCheat({ kind: 'FORWARD_TIME', seconds: Math.floor(delta / TICKS_PER_SECOND) }, '已直达 29:50 准备迎战死神！');
                      }}
                    >
                      ☠️ 直达 29:50 (迎战终局死神)
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="lne-levelup-footer">
              <button
                type="button"
                className="lne-royal-pill-btn"
                onClick={() => openModal('none')}
                aria-label="关闭修改器"
              >
                ✕ 关闭修改器
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
