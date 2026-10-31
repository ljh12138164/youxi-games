import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { YouxiIdentity } from '@shared/platform';
import { SoundController } from './audio/sound.ts';
import { TabletopBoard } from './board/TabletopBoard.tsx';
import {
  BASELINE_ID,
  BOOSTER_PACKS,
  CARD_MAP,
  CONTENT_VERSION,
  QUESTS,
  RAW_LEDGER_CARDS,
  RECIPES,
} from './content/ledger.ts';
import {
  CardRealmsEngine,
  TICK_MS,
  createInitialRun,
  getBoardCapacity,
  getBoardFoodSummary,
  getCurrencyBalance,
  getEffectiveVillagerStats,
  isPackUnlocked,
} from './core/engine.ts';
import type { EquipSlot, MonthLengthOption, RegionId } from './core/types.ts';
import {
  SingleWriterCoordinator,
  importJsonToSlot,
  listSlotSummaries,
  loadProfile,
  loadRunSlot,
  restoreRunBackup,
  saveProfile,
  saveRunSlot,
  serializeExportBundle,
  type SlotSummary,
} from './persistence/storage.ts';
import { CardRealmsPlatformBridge } from './platform/bridge.ts';

type DrawerTab = 'inspector' | 'quests' | 'ideas' | 'cardopedia';
type ActiveModal = 'none' | 'newGame' | 'saves' | 'settings';

const singletonEngine = new CardRealmsEngine();
const singletonSound = new SoundController();

export function App() {
  const snapshot = useSyncExternalStore(singletonEngine.subscribe, singletonEngine.getSnapshot);
  const { run, profile, pauseReasons, isRunning } = snapshot;

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('quests');
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [slotSummaries, setSlotSummaries] = useState<SlotSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState<YouxiIdentity | null>(null);
  const [writerConflict, setWriterConflict] = useState(false);
  const [cardSearch, setCardSearch] = useState('');

  // New game form options
  const [newGameSlot, setNewGameSlot] = useState<1 | 2 | 3>(1);
  const [newGameMonthLen, setNewGameMonthLen] = useState<MonthLengthOption>('normal');
  const [newGamePeaceful, setNewGamePeaceful] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  const bridgeRef = useRef<CardRealmsPlatformBridge | null>(null);
  const writerRef = useRef<SingleWriterCoordinator | null>(null);

  // Sync user audio settings
  useEffect(() => {
    singletonSound.setUserAudioPreferences({
      userMuted: profile.settings.userMuted,
      sfxVolume: profile.settings.sfxVolume,
      musicVolume: profile.settings.musicVolume,
    });
  }, [profile.settings.userMuted, profile.settings.sfxVolume, profile.settings.musicVolume]);

  // Boot: load profile & slot 1, connect platform bridge, and notify ready()
  useEffect(() => {
    let cancelled = false;
    writerRef.current = new SingleWriterCoordinator(() => {
      setWriterConflict(true);
      setStatusMessage('检测到另一标签页接管了存档写入，本标签页已转为只读模式。');
    });

    bridgeRef.current = new CardRealmsPlatformBridge(
      singletonEngine,
      singletonSound,
      (nextId) => {
        if (!cancelled) setIdentity(nextId);
      },
    );

    async function init() {
      const loadedProfile = await loadProfile();
      const loadedSlot = await loadRunSlot(1);
      if (cancelled) return;

      if (loadedSlot.run) {
        singletonEngine.loadState(loadedSlot.run, loadedProfile);
        if (loadedSlot.error) {
          setStatusMessage(loadedSlot.error);
        }
      } else {
        const fresh = createInitialRun(1, {}, loadedProfile);
        singletonEngine.loadState(fresh, loadedProfile);
        await saveRunSlot(1, fresh, loadedProfile);
      }

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

  // Fixed-step simulation loop (20 Hz at 1x, 40 Hz at 2x), bounded catch-up
  useEffect(() => {
    let lastTime = performance.now();
    let accumulator = 0;
    let rafId = 0;

    function loop(now: number) {
      const rawDelta = Math.min(200, Math.max(0, now - lastTime));
      lastTime = now;
      const snap = singletonEngine.getSnapshot();
      if (snap.isRunning && snap.run.speed > 0) {
        const stepMs = snap.run.speed === 2 ? TICK_MS / 2 : TICK_MS;
        accumulator += rawDelta;
        let steps = 0;
        while (accumulator >= stepMs && steps < 4) {
          singletonEngine.stepTick();
          accumulator -= stepMs;
          steps += 1;
        }
      } else {
        accumulator = 0;
      }
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Visibilitychange pause (H02: pause in background, stay paused when returning)
  useEffect(() => {
    function onVisibilityChange() {
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

  // Auto-save every 15s when writer is active
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!writerRef.current?.canWrite()) return;
      const snap = singletonEngine.getSnapshot();
      void saveRunSlot(snap.run.slotId, snap.run, snap.profile).then((res) => {
        if (res.warning) setStatusMessage(res.warning);
      });
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcuts (Space / custom pause key, never intercepting Alt+M / Alt+Q / Alt+Shift+Q)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input,textarea,select,[contenteditable="true"]')) return;

      const pauseKey = singletonEngine.getSnapshot().profile.settings.pauseKey || 'Space';
      if (e.code === pauseKey) {
        e.preventDefault();
        const snap = singletonEngine.getSnapshot();
        if (snap.run.monthEndPhase !== null) {
          singletonEngine.dispatch({ type: 'ADVANCE_MONTH_PHASE' });
          singletonSound.play('month');
        } else {
          singletonEngine.dispatch({ type: 'TOGGLE_MANUAL_PAUSE' });
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
    if (modal === 'saves' || modal === 'newGame') {
      void refreshSlots();
    }
  }

  async function handleStartNewGame() {
    const fresh = createInitialRun(
      newGameSlot,
      {
        seed: Date.now() >>> 0,
        monthLengthOption: newGameMonthLen,
        peacefulMode: newGamePeaceful,
      },
      profile,
    );
    singletonEngine.loadState(fresh, profile);
    await saveRunSlot(newGameSlot, fresh, profile);
    await refreshSlots();
    setStatusMessage(`已在槽位 ${newGameSlot} 创建新局。`);
    openModal('none');
  }

  async function handleSwitchSlot(slotId: 1 | 2 | 3) {
    if (writerRef.current?.canWrite()) {
      await saveRunSlot(run.slotId, run, profile);
    }
    const loaded = await loadRunSlot(slotId);
    if (loaded.run) {
      singletonEngine.loadState(loaded.run, profile);
      setStatusMessage(
        loaded.restoredFromBackup
          ? `槽位 ${slotId} 主档损坏，已自动恢复最近有效备份。`
          : `已切换到槽位 ${slotId}。`,
      );
    } else {
      const fresh = createInitialRun(slotId, {}, profile);
      singletonEngine.loadState(fresh, profile);
      await saveRunSlot(slotId, fresh, profile);
      setStatusMessage(`槽位 ${slotId} 为空，已初始化新局。`);
    }
    await refreshSlots();
    openModal('none');
  }

  async function handleManualSave() {
    if (!writerRef.current?.canWrite()) {
      setStatusMessage('当前标签页处于只读模式，请先接管写入权限。');
      return;
    }
    const res = await saveRunSlot(run.slotId, run, profile);
    await refreshSlots();
    setStatusMessage(res.warning ?? `槽位 ${run.slotId} 已保存（序号 #${run.saveSeq}）。`);
  }

  async function handleRestoreBackup(slotId: 1 | 2 | 3) {
    const res = await restoreRunBackup(slotId, 0);
    if (!res.run) {
      setStatusMessage(res.error ?? '无可用备份');
      return;
    }
    singletonEngine.loadState(res.run, profile);
    await refreshSlots();
    setStatusMessage(`已恢复槽位 ${slotId} 的最近有效备份。`);
    openModal('none');
  }

  function handleExportJson() {
    const json = serializeExportBundle(run, profile);
    setImportJsonText(json);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `card-realms-h5-slot${run.slotId}-m${run.month}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage('已生成并下载存档 JSON。');
    } catch {
      setStatusMessage('已在下方文本框生成存档 JSON，可复制保存。');
    }
  }

  async function handleImportJson(slotId: 1 | 2 | 3) {
    const res = await importJsonToSlot(slotId, importJsonText);
    if (!res.ok || !res.run || !res.profile) {
      setStatusMessage(`导入失败（原档已保留）：${res.error}`);
      return;
    }
    singletonEngine.loadState(res.run, res.profile);
    await refreshSlots();
    setStatusMessage(`成功导入存档到槽位 ${slotId}！`);
    openModal('none');
  }

  const goldBalance = getCurrencyBalance(run, run.activeRegion, 'gold');
  const shellBalance = getCurrencyBalance(run, run.activeRegion, 'shell');
  const capacity = getBoardCapacity(run, run.activeRegion);
  const foodSummary = getBoardFoodSummary(run, run.activeRegion);
  const monthProgressPct = Math.min(
    100,
    Math.round((run.monthTicksElapsed / run.monthDurationTicks) * 100),
  );

  const selectedInst = selectedInstanceId ? run.instances[selectedInstanceId] : undefined;
  const selectedDef = selectedInst ? CARD_MAP[selectedInst.defId] : undefined;
  const regionalPacks = BOOSTER_PACKS.filter((p) => p.region === run.activeRegion);

  return (
    <div
      className={`sl-app ${profile.settings.reducedMotion ? 'reduced-motion' : ''}`}
      data-running={isRunning}
      data-tick={run.tickCount}
    >
      {/* Top HUD Bar */}
      <header className="sl-hud">
        <div className="sl-brand">
          <strong>卡牌领地</strong>
          <span className="sl-slot-pill">槽位 #{run.slotId}</span>
          {identity?.user?.nickname && (
            <span className="sl-user-pill" title="游隙平台昵称（不影响本机存档归属）">
              👤 {identity.user.nickname}
            </span>
          )}
        </div>

        <div className="sl-stats-strip">
          <div className="hud-stat" title="当前桌面金币 / 钱箱总额">
            🪙 金币 <strong>{goldBalance}</strong>
          </div>
          {run.unlockedRegions.includes('island') && (
            <div className="hud-stat" title="海岛贝壳 / 贝壳箱总额">
              🐚 贝壳 <strong>{shellBalance}</strong>
            </div>
          )}
          <div
            className={`hud-stat ${foodSummary.available < foodSummary.needed ? 'stat-warn' : ''}`}
            title="现有食物值 / 月末所需食物值"
          >
            🍖 食物 <strong>{foodSummary.available}</strong> / {foodSummary.needed}
          </div>
          <div
            className={`hud-stat ${capacity.used > capacity.max ? 'stat-warn' : ''}`}
            title="当前桌面卡牌数 / 容量上限"
          >
            🃏 容量 <strong>{capacity.used}</strong> / {capacity.max}
          </div>

          <div className="hud-month-box" title="当前月份与进度">
            <div className="hud-month-label">
              <span>第 {run.month} 月</span>
              <span>{monthProgressPct}%</span>
            </div>
            <div className="hud-month-bar">
              <div className="hud-month-fill" style={{ width: `${monthProgressPct}%` }} />
            </div>
          </div>

          <div className="hud-speed-group" role="group" aria-label="时间速度控制">
            <button
              type="button"
              className={`btn-speed ${!isRunning ? 'active' : ''}`}
              onClick={() => singletonEngine.dispatch({ type: 'TOGGLE_MANUAL_PAUSE' })}
            >
              ⏸ 暂停
            </button>
            <button
              type="button"
              className={`btn-speed ${isRunning && run.speed === 1 ? 'active' : ''}`}
              onClick={() => singletonEngine.dispatch({ type: 'SET_SPEED', speed: 1 })}
            >
              ▶ 1x
            </button>
            <button
              type="button"
              className={`btn-speed ${isRunning && run.speed === 2 ? 'active' : ''}`}
              onClick={() => singletonEngine.dispatch({ type: 'SET_SPEED', speed: 2 })}
            >
              ⏩ 2x
            </button>
          </div>
        </div>

        <div className="sl-nav-actions">
          <div className="region-switcher">
            {(['mainland', 'island', 'forest'] as RegionId[]).map((reg) => {
              const unlocked = run.unlockedRegions.includes(reg);
              const label = reg === 'mainland' ? '大陆' : reg === 'island' ? '海岛' : '森林';
              return (
                <button
                  key={reg}
                  type="button"
                  disabled={!unlocked}
                  className={`btn-region ${run.activeRegion === reg ? 'active' : ''}`}
                  onClick={() => singletonEngine.dispatch({ type: 'SWITCH_REGION', region: reg })}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-top" onClick={() => openModal('newGame')}>
            新游戏
          </button>
          <button type="button" className="btn-top" onClick={() => openModal('saves')}>
            存档 ({run.slotId})
          </button>
          <button type="button" className="btn-top" onClick={() => openModal('settings')}>
            设置
          </button>
        </div>
      </header>

      {/* Booster Pack Bar */}
      {regionalPacks.length > 0 && (
        <section className="sl-pack-bar" aria-label="卡包商店">
          <span className="pack-bar-title">📦 购买卡包：</span>
          {regionalPacks.map((pack) => {
            const unlocked = isPackUnlocked(run, profile, pack.id);
            const balance = pack.currencyCardId === 'shell' ? shellBalance : goldBalance;
            const canAfford = unlocked && balance >= pack.cost;
            return (
              <button
                key={pack.id}
                type="button"
                disabled={!canAfford}
                className={`pack-btn ${unlocked ? '' : 'pack-locked'}`}
                onClick={() => {
                  const ok = singletonEngine.dispatch({ type: 'BUY_PACK', packId: pack.id });
                  if (ok) singletonSound.play('pack');
                }}
                title={pack.description}
              >
                <span className="pack-name">{unlocked ? pack.nameZh : `🔒 ${pack.nameZh}`}</span>
                <span className="pack-cost">
                  {pack.cost} {pack.currencyCardId === 'shell' ? '🐚' : '🪙'}
                </span>
              </button>
            );
          })}

          {pauseReasons.length > 0 && (
            <span className="pause-badge">
              已暂停（{pauseReasons.join(', ')}）
            </span>
          )}
        </section>
      )}

      {statusMessage && (
        <div className="sl-toast" role="status">
          <span>{statusMessage}</span>
          {writerConflict && (
            <button
              type="button"
              className="btn-subtle"
              onClick={() => {
                writerRef.current?.claimWriter();
                setWriterConflict(false);
                setStatusMessage('已重新接管当前标签页的存档写入权限。');
              }}
            >
              接管写入
            </button>
          )}
          <button type="button" className="btn-close" onClick={() => setStatusMessage(null)}>
            ×
          </button>
        </div>
      )}

      {/* Main Workspace: Tabletop + Collapsible Side Drawer */}
      <div className="sl-workspace">
        <TabletopBoard
          engine={singletonEngine}
          run={run}
          sound={singletonSound}
          selectedInstanceId={selectedInstanceId}
          onSelectInstance={(id) => {
            setSelectedInstanceId(id);
            setDrawerTab('inspector');
          }}
        />

        <aside className={`sl-drawer ${drawerCollapsed ? 'drawer-collapsed' : ''}`}>
          <div className="drawer-tabs">
            <button
              type="button"
              className={drawerTab === 'inspector' ? 'active' : ''}
              onClick={() => {
                setDrawerCollapsed(false);
                setDrawerTab('inspector');
              }}
            >
              详情
            </button>
            <button
              type="button"
              className={drawerTab === 'quests' ? 'active' : ''}
              onClick={() => {
                setDrawerCollapsed(false);
                setDrawerTab('quests');
              }}
            >
              任务 ({profile.completedQuests.length}/{QUESTS.length})
            </button>
            <button
              type="button"
              className={drawerTab === 'ideas' ? 'active' : ''}
              onClick={() => {
                setDrawerCollapsed(false);
                setDrawerTab('ideas');
              }}
            >
              主意 ({profile.discoveredIdeas.length})
            </button>
            <button
              type="button"
              className={drawerTab === 'cardopedia' ? 'active' : ''}
              onClick={() => {
                setDrawerCollapsed(false);
                setDrawerTab('cardopedia');
              }}
            >
              图鉴 ({profile.discoveredCards.length}/363)
            </button>
            <button
              type="button"
              className="btn-collapse"
              onClick={() => setDrawerCollapsed(!drawerCollapsed)}
              title={drawerCollapsed ? '展开侧栏' : '折叠侧栏'}
            >
              {drawerCollapsed ? '◀' : '▶'}
            </button>
          </div>

          {!drawerCollapsed && (
            <div className="drawer-content">
              {drawerTab === 'inspector' && (
                <div className="panel-section">
                  {selectedInst && selectedDef ? (
                    <div className="inspector-card">
                      <h3>
                        {selectedDef.nameZh} <small>({selectedDef.nameEn})</small>
                      </h3>
                      <p className="muted-line">
                        ID: <code>{selectedDef.id}</code> · 类别: {selectedDef.category} · 区域:{' '}
                        {selectedDef.region}
                      </p>
                      <ul className="stat-list">
                        <li>
                          售价：{selectedDef.value > 0 ? `${selectedDef.value} 货币` : '不可出售'}
                        </li>
                        {selectedDef.foodValue > 0 && <li>食物提供：{selectedDef.foodValue} 点</li>}
                        {selectedDef.foodNeed > 0 && <li>月末食量：{selectedDef.foodNeed} 点</li>}
                        {selectedInst.maxHp > 0 && (
                          <li>
                            生命值：{selectedInst.hp} / {selectedInst.maxHp}
                          </li>
                        )}
                        {selectedDef.category === 'villager' && (
                          <li>
                            综合战力：攻击{' '}
                            {getEffectiveVillagerStats(run, selectedInst).attack} / 防御{' '}
                            {getEffectiveVillagerStats(run, selectedInst).defense}
                          </li>
                        )}
                        {selectedDef.capacityBonus > 0 && (
                          <li>提供容量加成：+{selectedDef.capacityBonus}</li>
                        )}
                        {selectedDef.category === 'container' && (
                          <li>
                            当前储量：{selectedInst.storedCount} / {selectedDef.containerMax ?? 30}
                          </li>
                        )}
                      </ul>

                      {selectedDef.category === 'villager' && (
                        <div className="equip-box">
                          <h4>已穿戴装备</h4>
                          {(['hand', 'torso', 'head'] as EquipSlot[]).map((slot) => {
                            const eqId = selectedInst.equipment[slot];
                            const eqInst = eqId ? run.instances[eqId] : undefined;
                            const eqDef = eqInst ? CARD_MAP[eqInst.defId] : undefined;
                            return (
                              <div key={slot} className="equip-row">
                                <span>
                                  {slot === 'hand' ? '武器' : slot === 'torso' ? '护甲' : '头部'}：
                                  {eqDef ? eqDef.nameZh : '未装备'}
                                </span>
                                {eqDef && (
                                  <button
                                    type="button"
                                    className="btn-tiny"
                                    onClick={() =>
                                      singletonEngine.dispatch({
                                        type: 'UNEQUIP_ITEM',
                                        villagerInstanceId: selectedInst.instanceId,
                                        slot,
                                      })
                                    }
                                  >
                                    卸下
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <h4>相关已知配方</h4>
                      <ul className="recipe-mini-list">
                        {RECIPES.filter(
                          (r) =>
                            r.inputs[selectedDef.id] !== undefined ||
                            r.catalysts.includes(selectedDef.id) ||
                            r.ideaCardId === selectedDef.id ||
                            r.outputs.some((o) => o.cardId === selectedDef.id),
                        ).map((r) => (
                          <li key={r.id}>
                            <strong>{r.nameZh}</strong>：{r.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="muted-line">点击桌面任意卡牌查看详细属性、装备与关联配方。</p>
                  )}

                  <h4>近期事件记录</h4>
                  <ul className="event-log-list">
                    {run.recentEvents.map((ev, i) => (
                      <li key={i}>{ev}</li>
                    ))}
                  </ul>
                </div>
              )}

              {drawerTab === 'quests' && (
                <div className="panel-section">
                  <h3>主线与阶段目标</h3>
                  <ul className="quest-list">
                    {QUESTS.map((q) => {
                      const done = profile.completedQuests.includes(q.id);
                      return (
                        <li key={q.id} className={done ? 'quest-done' : ''}>
                          <div className="quest-title">
                            <span>{done ? '✅' : '⬜'}</span>
                            <strong>{q.nameZh}</strong>
                            <small className="quest-tag">{q.group}</small>
                          </div>
                          <p>{q.description}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {drawerTab === 'ideas' && (
                <div className="panel-section">
                  <h3>合成知识与配方表</h3>
                  <ul className="recipe-mini-list">
                    {RECIPES.map((r) => {
                      const known =
                        !r.ideaCardId || profile.discoveredIdeas.includes(r.ideaCardId);
                      return (
                        <li key={r.id} className={known ? '' : 'idea-unknown'}>
                          <strong>{known ? r.nameZh : `❓ 未发现主意 (${r.nameZh})`}</strong>
                          <div>{known ? r.description : '开启卡包或完成任务解锁此主意配方'}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {drawerTab === 'cardopedia' && (
                <div className="panel-section">
                  <h3>全量内容台账 (S06 基线 367 项)</h3>
                  <input
                    type="search"
                    placeholder="搜索卡牌名称或 ID..."
                    value={cardSearch}
                    onChange={(e) => setCardSearch(e.target.value)}
                    className="search-input"
                  />
                  <ul className="cardopedia-list">
                    {RAW_LEDGER_CARDS.filter((c) => {
                      if (!cardSearch.trim()) return true;
                      const q = cardSearch.toLowerCase();
                      return (
                        c.nameZh.toLowerCase().includes(q) ||
                        c.nameEn.toLowerCase().includes(q) ||
                        c.id.toLowerCase().includes(q)
                      );
                    }).map((c) => {
                      const discovered = profile.discoveredCards.includes(c.id);
                      const isExcluded = c.category === 'system';
                      return (
                        <li
                          key={c.id}
                          className={
                            isExcluded
                              ? 'ledger-excluded'
                              : discovered
                                ? 'ledger-discovered'
                                : 'ledger-undiscovered'
                          }
                        >
                          <div>
                            <strong>
                              {isExcluded
                                ? `🚫 ${c.nameZh}`
                                : discovered
                                  ? c.nameZh
                                  : `？？？ (${c.category})`}
                            </strong>{' '}
                            <code>{c.id}</code>
                          </div>
                          <small>
                            {isExcluded
                              ? `已排除：${c.excludedReason}`
                              : discovered
                                ? `${c.nameEn} · 售价 ${c.value > 0 ? c.value : '-'} · 状态: ${c.verification}`
                                : `所属区域: ${c.region} · 状态: ${c.verification}`}
                          </small>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Month-End Settlement Modal */}
      {run.monthEndPhase !== null && !run.isGameOver && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="月末生存结算">
          <div className="modal-card">
            <h2>🌙 第 {run.month} 月末生存结算</h2>
            <p className="settlement-steps">
              <span className={run.monthEndPhase === 'feed' ? 'step-active' : ''}>
                1. 喂食与成长
              </span>{' '}
              →{' '}
              <span className={run.monthEndPhase === 'spoil' ? 'step-active' : ''}>
                2. 产出与腐败
              </span>{' '}
              →{' '}
              <span className={run.monthEndPhase === 'capacity' ? 'step-active' : ''}>
                3. 容量检查
              </span>{' '}
              →{' '}
              <span className={run.monthEndPhase === 'events' ? 'step-active' : ''}>
                4. 月末事件
              </span>
            </p>
            <ul className="settlement-log">
              {run.monthEndLog.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  singletonEngine.dispatch({ type: 'ADVANCE_MONTH_PHASE' });
                  singletonSound.play('month');
                }}
              >
                {run.monthEndPhase === 'events' ? '进入下一月 (Space)' : '下一步 (Space)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over / Victory Modal */}
      {(run.isGameOver || run.isVictory) && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>{run.isVictory ? '🏆 主线目标达成！' : '💀 聚落覆灭'}</h2>
            <p>
              {run.isVictory
                ? '你已成功击败恶魔王！你可以继续自由经营当前聚落，冲击全图鉴收集。'
                : run.gameOverReason}
            </p>
            <p className="muted-line">
              存活月份：{run.month} · 开启卡包：{run.stats.packsOpened} · 击败敌人：
              {run.stats.enemiesKilled}
            </p>
            <div className="modal-actions">
              {run.isVictory && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    run.isVictory = false;
                    singletonEngine.loadState({ ...run }, profile);
                  }}
                >
                  继续经营
                </button>
              )}
              <button
                type="button"
                className="btn-subtle"
                onClick={() => void handleRestoreBackup(run.slotId)}
              >
                恢复最近备份
              </button>
              <button type="button" className="btn-primary" onClick={() => openModal('newGame')}>
                开启新局
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Game Modal */}
      {activeModal === 'newGame' && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>开始新游戏</h2>
            <label className="form-row">
              <span>选择存档槽位：</span>
              <select
                value={newGameSlot}
                onChange={(e) => setNewGameSlot(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value={1}>槽位 1</option>
                <option value={2}>槽位 2</option>
                <option value={3}>槽位 3</option>
              </select>
            </label>
            <label className="form-row">
              <span>月份时长：</span>
              <select
                value={newGameMonthLen}
                onChange={(e) => setNewGameMonthLen(e.target.value as MonthLengthOption)}
              >
                <option value="short">短月 (90 秒)</option>
                <option value="normal">标准 (120 秒)</option>
                <option value="long">长月 (200 秒)</option>
              </select>
            </label>
            <label className="form-row">
              <input
                type="checkbox"
                checked={newGamePeaceful}
                onChange={(e) => setNewGamePeaceful(e.target.checked)}
              />
              <span>和平模式（取消月末传送门与海盗突袭，仍可主动召唤主线 Boss）</span>
            </label>
            <p className="muted-line">
              注意：开始新游戏将覆盖槽位 {newGameSlot} 的当前局内进度（舊状态将自动滚入该槽位的三份备份中）。
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-subtle" onClick={() => openModal('none')}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleStartNewGame()}
              >
                确认开局
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Manager Modal */}
      {activeModal === 'saves' && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-wide">
            <h2>存档管理（本机三槽位 + 滚动备份 + JSON 导入导出）</h2>
            <div className="slot-grid">
              {slotSummaries.map((s) => (
                <div
                  key={s.slotId}
                  className={`slot-card ${run.slotId === s.slotId ? 'slot-active' : ''}`}
                >
                  <h3>
                    槽位 {s.slotId} {run.slotId === s.slotId && <small>(当前)</small>}
                  </h3>
                  {s.exists ? (
                    <p>
                      第 {s.month} 月 · 区域: {s.activeRegion} · 备份数: {s.backupCount}/3
                    </p>
                  ) : (
                    <p className="muted-line">空槽位</p>
                  )}
                  <div className="slot-actions">
                    <button
                      type="button"
                      className="btn-tiny"
                      onClick={() => void handleSwitchSlot(s.slotId)}
                    >
                      加载/切换
                    </button>
                    {s.backupCount > 0 && (
                      <button
                        type="button"
                        className="btn-tiny"
                        onClick={() => void handleRestoreBackup(s.slotId)}
                      >
                        恢复备份
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-tiny"
                      onClick={() => void handleImportJson(s.slotId)}
                    >
                      导入到此槽
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="json-io-box">
              <div className="json-io-header">
                <button
                  type="button"
                  className="btn-subtle"
                  onClick={() => void handleManualSave()}
                >
                  立即保存当前槽位
                </button>
                <button type="button" className="btn-subtle" onClick={handleExportJson}>
                  导出当前存档 JSON
                </button>
              </div>
              <textarea
                rows={4}
                placeholder="在此粘贴要导入的 JSON 存档内容，然后点击对应槽位的「导入到此槽」..."
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => openModal('none')}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {activeModal === 'settings' && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>游戏与辅助设置</h2>
            <label className="form-row">
              <span>音效音量 ({Math.round(profile.settings.sfxVolume * 100)}%)：</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={profile.settings.sfxVolume}
                onChange={(e) => {
                  singletonEngine.updateSettings({ sfxVolume: Number(e.target.value) });
                  void saveProfile(singletonEngine.getSnapshot().profile);
                }}
              />
            </label>
            <label className="form-row">
              <span>音乐音量 ({Math.round(profile.settings.musicVolume * 100)}%)：</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={profile.settings.musicVolume}
                onChange={(e) => {
                  singletonEngine.updateSettings({ musicVolume: Number(e.target.value) });
                  void saveProfile(singletonEngine.getSnapshot().profile);
                }}
              />
            </label>
            <label className="form-row">
              <input
                type="checkbox"
                checked={profile.settings.userMuted}
                onChange={(e) => {
                  singletonEngine.updateSettings({ userMuted: e.target.checked });
                  void saveProfile(singletonEngine.getSnapshot().profile);
                }}
              />
              <span>用户静音（与游隙平台防 Boss 临时静音独立保存）</span>
            </label>
            <label className="form-row">
              <input
                type="checkbox"
                checked={profile.settings.pauseOnDrag}
                onChange={(e) => {
                  singletonEngine.updateSettings({ pauseOnDrag: e.target.checked });
                  void saveProfile(singletonEngine.getSnapshot().profile);
                }}
              />
              <span>拖拽卡牌时自动暂停（松开后恢复原暂停状态）</span>
            </label>
            <label className="form-row">
              <input
                type="checkbox"
                checked={profile.settings.gridSnap}
                onChange={(e) => {
                  singletonEngine.updateSettings({ gridSnap: e.target.checked });
                  void saveProfile(singletonEngine.getSnapshot().profile);
                }}
              />
              <span>桌面网格对齐吸附</span>
            </label>
            <label className="form-row">
              <input
                type="checkbox"
                checked={profile.settings.reducedMotion}
                onChange={(e) => {
                  singletonEngine.updateSettings({ reducedMotion: e.target.checked });
                  void saveProfile(singletonEngine.getSnapshot().profile);
                }}
              />
              <span>减少动画效果</span>
            </label>
            <label className="form-row">
              <span>暂停 / 月末确认快捷键（避开平台 Alt+M/Q）：</span>
              <select
                value={profile.settings.pauseKey}
                onChange={(e) => {
                  singletonEngine.updateSettings({ pauseKey: e.target.value });
                  void saveProfile(singletonEngine.getSnapshot().profile);
                }}
              >
                <option value="Space">空格 (Space)</option>
                <option value="KeyP">P 键 (KeyP)</option>
              </select>
            </label>
            <p className="muted-line">
              版本：{CONTENT_VERSION} · 台账基线：{BASELINE_ID}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => openModal('none')}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
