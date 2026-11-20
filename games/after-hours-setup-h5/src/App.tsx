import { useCallback, useEffect, useRef, useState } from 'react';
import { type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { connectYouxiPlatform, type YouxiSceneState } from '@shared/platform';
import { NIGHT_TRACKS, RetroAudio } from './audio';
import { Epilogue } from './components/Epilogue';
import { MailClient } from './components/MailClient';
import { SetupWizard } from './components/SetupWizard';
import { ONBOARDING_SEEN_KEY, createOnboardingTour } from './onboarding';
import {
  STORAGE_KEY,
  claimMailMoney,
  decodeSave,
  deleteMail,
  deleteReadMails,
  markMailRead,
  newSave,
  recordCleanInstall,
  recordFailedAttempt,
  recoverMail,
  triggerVoodooSubscription,
} from './game';
import type { ClearedId, InstallerId, SaveState } from './types';

function loadInitialSave(): { save: SaveState; corrupted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const save = decodeSave(raw);
    if (!raw) save.fastInstall = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { save, corrupted: false };
  } catch {
    return { save: newSave(), corrupted: true };
  }
}

type AppModal = 'settings' | 'help' | 'resetConfirm' | null;

const BGM_FILES = import.meta.glob<string>('./assets/music/*.mp3', {
  eager: true,
  import: 'default',
});

const BGM_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(BGM_FILES).map(([path, url]) => [path.split('/').pop() ?? path, url]),
);

export function App() {
  const [initial] = useState(loadInitialSave);
  const [save, setSave] = useState<SaveState>(initial.save);
  const [storageBlocked, setStorageBlocked] = useState(initial.corrupted);
  const [storageError, setStorageError] = useState(false);

  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const [activeInstaller, setActiveInstaller] = useState<InstallerId | null>(null);
  const [showEpilogue, setShowEpilogue] = useState(false);
  const [modal, setModal] = useState<AppModal>(null);
  const [manualPaused, setManualPaused] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [trackIndex, setTrackIndex] = useState(0);
  const [platform, setPlatform] = useState<YouxiSceneState>({ sidebar: false, boss: false });

  const audioRef = useRef<RetroAudio | null>(null);
  if (!audioRef.current) {
    const audio = new RetroAudio();
    audio.setTrackSources(BGM_SOURCES);
    audioRef.current = audio;
  }
  const driverRef = useRef<Driver | null>(null);
  const autoTourDoneRef = useRef(false);

  const platformRef = useRef(platform);
  const manualRef = useRef(manualPaused);
  platformRef.current = platform;
  manualRef.current = manualPaused;

  const pausedByPlatform = platform.sidebar || platform.boss;
  const running = !manualPaused && !pausedByPlatform;
  const currentTrack = NIGHT_TRACKS[trackIndex % NIGHT_TRACKS.length] ?? NIGHT_TRACKS[0];

  const syncAudioState = useCallback(
    (overrides?: {
      muted?: boolean;
      tempMuted?: boolean;
      paused?: boolean;
      musicEnabled?: boolean;
      trackIndex?: number;
    }) => {
      audioRef.current?.setState({
        userMuted: overrides?.muted ?? save.muted,
        tempMuted: overrides?.tempMuted,
        paused: overrides?.paused ?? !running,
        musicEnabled: overrides?.musicEnabled ?? musicEnabled,
        trackIndex: overrides?.trackIndex ?? trackIndex,
      });
    },
    [save.muted, running, musicEnabled, trackIndex],
  );

  useEffect(() => {
    syncAudioState();
  }, [syncAudioState]);

  useEffect(() => {
    const unlock = () => audioRef.current?.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const bridge = connectYouxiPlatform({
      onState(state) {
        platformRef.current = state;
        setPlatform(state);
        audioRef.current?.setState({ paused: manualRef.current || state.sidebar || state.boss });
      },
      setTemporaryMuted(muted) {
        audioRef.current?.setState({ tempMuted: muted });
        return true;
      },
      isRunning() {
        const s = platformRef.current;
        return !manualRef.current && !s.sidebar && !s.boss;
      },
    });
    bridge?.ready();
    return () => {
      bridge?.destroy();
      audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (storageBlocked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [save, storageBlocked]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pausedByPlatform || driverRef.current?.isActive()) return;
      if (modal) {
        e.preventDefault();
        setModal(null);
      } else if (!activeInstaller && !showEpilogue) {
        e.preventDefault();
        setManualPaused(p => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pausedByPlatform, modal, activeInstaller, showEpilogue]);

  const startOnboardingTour = useCallback(() => {
    setModal(null);
    setActiveInstaller(null);
    driverRef.current?.destroy();
    window.setTimeout(() => {
      const tour = createOnboardingTour({
        isFastMotion: () =>
          save.fastInstall || matchMedia('(prefers-reduced-motion: reduce)').matches,
        selectSampleMail: () => setSelectedMailId('m-l1'),
        openSampleWizard: () => setActiveInstaller('doghouse'),
        closeSampleWizard: () => setActiveInstaller(null),
        onPlayClick: () => audioRef.current?.click(),
        onFinish: () => {
          try {
            localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
          } catch {
            // Ignore restricted storage environments.
          }
          if (driverRef.current === tour) {
            driverRef.current = null;
          }
        },
      });
      driverRef.current = tour;
      tour.drive();
    }, 60);
  }, [save.fastInstall]);

  useEffect(() => {
    if (autoTourDoneRef.current || navigator.webdriver || storageBlocked || !running) return;
    let seen = false;
    try {
      seen = Boolean(localStorage.getItem(ONBOARDING_SEEN_KEY));
    } catch {
      seen = false;
    }
    if (seen) {
      autoTourDoneRef.current = true;
      return;
    }
    if (
      save.clearedInstallers.length === 0 &&
      save.readMails.length === 0 &&
      save.claimedMails.length === 0
    ) {
      autoTourDoneRef.current = true;
      startOnboardingTour();
    }
  }, [
    running,
    storageBlocked,
    save.clearedInstallers.length,
    save.readMails.length,
    save.claimedMails.length,
    startOnboardingTour,
  ]);

  useEffect(() => {
    if (!running) driverRef.current?.destroy();
  }, [running]);

  useEffect(() => () => driverRef.current?.destroy(), []);

  const handleSelectMail = (id: string) => {
    audioRef.current?.click();
    setSelectedMailId(id);
    setSave(curr => markMailRead(curr, id));
  };

  const handleDeleteMail = (id: string) => {
    audioRef.current?.click();
    setSave(curr => deleteMail(curr, id));
    if (selectedMailId === id) setSelectedMailId(null);
  };

  const handleRecoverMail = (id: string) => {
    audioRef.current?.click();
    setSave(curr => recoverMail(curr, id));
    if (selectedMailId === id) setSelectedMailId(null);
  };

  const handleDeleteRead = () => {
    audioRef.current?.click();
    setSave(curr => {
      const next = deleteReadMails(curr);
      if (selectedMailId && next.deletedMails.includes(selectedMailId)) {
        setSelectedMailId(null);
      }
      return next;
    });
  };

  const handleClaimMoney = (id: string) => {
    setSave(curr => {
      const res = claimMailMoney(curr, id);
      if (res.save !== curr) {
        audioRef.current?.money();
      }
      if (res.paidEnding) {
        setShowEpilogue(true);
      }
      return res.save;
    });
  };

  const handleCleanSuccess = (id: InstallerId) => {
    if (id === 'voodoo') return;
    setSave(curr => recordCleanInstall(curr, id as ClearedId));
    window.setTimeout(() => audioRef.current?.mail(), 250);
  };

  const handleAttemptFailed = (id: InstallerId) => {
    setSave(curr => recordFailedAttempt(curr, id));
  };

  const handleVoodooSubscribed = () => {
    setSave(curr => triggerVoodooSubscription(curr));
    audioRef.current?.mail();
  };

  const backupAndReset = () => {
    try {
      driverRef.current?.destroy();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(`${STORAGE_KEY}/backup-${Date.now()}`, raw);
      localStorage.removeItem(ONBOARDING_SEEN_KEY);
      const fresh = newSave();
      setSave(fresh);
      setSelectedMailId(null);
      setActiveInstaller(null);
      setShowEpilogue(false);
      setStorageBlocked(false);
      setModal(null);
    } catch {
      setStorageError(true);
    }
  };

  return (
    <main
      className="game-root"
      data-running={running}
      data-manual-paused={manualPaused}
      data-cleared-count={save.clearedInstallers.length}
      data-balance={save.balance.toFixed(2)}
    >
      <div className="h-dvh flex flex-col" inert={!running}>
        {(storageBlocked || storageError) && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-[#fff4ce] border-b border-[#f0c36d] text-[12px] text-[#664d03]"
          >
            <span>
              {storageBlocked
                ? '旧存档损坏无法读取，备份并重置后可继续保存。'
                : '当前浏览器禁止本地存储，进度暂时无法写入。'}
            </span>
            {storageBlocked && (
              <button type="button" className="ui-btn px-2.5 py-0.5 text-[12px]" onClick={backupAndReset}>
                备份旧档并重置
              </button>
            )}
          </div>
        )}

        <MailClient
          save={save}
          selectedMailId={selectedMailId}
          musicEnabled={musicEnabled}
          trackTitle={currentTrack.title}
          onSelectMail={handleSelectMail}
          onDeleteMail={handleDeleteMail}
          onRecoverMail={handleRecoverMail}
          onDeleteRead={handleDeleteRead}
          onClaimMoney={handleClaimMoney}
          onLaunchInstaller={id => {
            audioRef.current?.click();
            setActiveInstaller(id);
          }}
          onToggleMusic={() => {
            audioRef.current?.unlock();
            if (save.muted) {
              setSave(curr => ({ ...curr, muted: false }));
              setMusicEnabled(true);
              syncAudioState({ muted: false, musicEnabled: true });
            } else {
              const next = !musicEnabled;
              setMusicEnabled(next);
              syncAudioState({ musicEnabled: next });
            }
            audioRef.current?.click();
          }}
          onOpenSettings={() => {
            audioRef.current?.click();
            setModal('settings');
          }}
          onOpenHelp={() => {
            audioRef.current?.click();
            setModal('help');
          }}
          onStartTour={() => {
            audioRef.current?.click();
            startOnboardingTour();
          }}
          onPause={() => {
            audioRef.current?.click();
            setManualPaused(true);
          }}
          onReplayEpilogue={() => {
            audioRef.current?.click();
            setShowEpilogue(true);
          }}
          onClickSound={() => audioRef.current?.click()}
        />

        {activeInstaller && (
          <SetupWizard
            key={activeInstaller}
            installerId={activeInstaller}
            fastInstall={save.fastInstall}
            paused={!running}
            attempts={save.attempts[activeInstaller] ?? 0}
            voodooSubscribed={save.voodooSubscribed}
            onAttemptFailed={handleAttemptFailed}
            onCleanSuccess={handleCleanSuccess}
            onVoodooSubscribed={handleVoodooSubscribed}
            onExitToMail={() => {
              audioRef.current?.click();
              setActiveInstaller(null);
            }}
            onClickSound={() => audioRef.current?.click()}
            onErrorSound={() => audioRef.current?.error()}
            onSuccessSound={() => audioRef.current?.success()}
          />
        )}

        {showEpilogue && (
          <Epilogue
            save={save}
            onReturn={() => {
              audioRef.current?.click();
              setShowEpilogue(false);
              setSelectedMailId('m-ending');
            }}
          />
        )}
      </div>

      {/* Windows 11 Settings Dialog */}
      {modal === 'settings' && running && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 backdrop-blur-[3px] p-3">
          <div className="modal-window w-full max-w-[420px] overflow-hidden text-[#18202c]" role="dialog" aria-label="设置">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#eef2f7] border-b border-[#cbd5e1]">
              <span className="text-[13.5px] font-semibold">系统设置</span>
              <button type="button" aria-label="关闭设置" className="win11-close-btn" onClick={() => setModal(null)}>×</button>
            </div>

            <div className="p-5 space-y-4 text-[13.5px]">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="ui-checkbox"
                  checked={musicEnabled && !save.muted}
                  onChange={e => {
                    const next = e.currentTarget.checked;
                    audioRef.current?.unlock();
                    if (next && save.muted) {
                      setSave(curr => ({ ...curr, muted: false }));
                      setMusicEnabled(true);
                      syncAudioState({ muted: false, musicEnabled: true });
                    } else {
                      setMusicEnabled(next);
                      syncAudioState({ musicEnabled: next });
                    }
                    audioRef.current?.click();
                  }}
                />
                <span>开启背景音乐</span>
              </label>

              <div className="rounded-lg bg-[#f6f8fc] border border-[#cbd5e1] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[12px] text-[#475569]">
                  <span className="font-semibold text-[#1e293b]">当前曲目</span>
                  <span>{currentTrack.subtitle}</span>
                </div>
                <div className="text-[13px] font-medium text-[#0f172a]">{currentTrack.title}</div>
                <div className="text-[11.5px] text-[#64748b]">演奏 / 授权：{currentTrack.attribution}</div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    className="ui-btn px-2.5 py-1 text-[12px]"
                    onClick={() => {
                      audioRef.current?.unlock();
                      const next = (trackIndex + NIGHT_TRACKS.length - 1) % NIGHT_TRACKS.length;
                      setTrackIndex(next);
                      syncAudioState({ trackIndex: next });
                      audioRef.current?.click();
                    }}
                  >
                    上一首
                  </button>
                  <button
                    type="button"
                    className="ui-btn px-2.5 py-1 text-[12px]"
                    onClick={() => {
                      audioRef.current?.unlock();
                      const next = (trackIndex + 1) % NIGHT_TRACKS.length;
                      setTrackIndex(next);
                      syncAudioState({ trackIndex: next });
                      audioRef.current?.click();
                    }}
                  >
                    下一首
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="ui-checkbox"
                  checked={save.muted}
                  onChange={e => {
                    const muted = e.currentTarget.checked;
                    setSave(curr => ({ ...curr, muted }));
                    syncAudioState({ muted });
                    if (!muted) audioRef.current?.click();
                  }}
                />
                <span>全部静音（音乐与提示音）</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="ui-checkbox"
                  checked={save.fastInstall}
                  onChange={e => {
                    const fastInstall = e.currentTarget.checked;
                    setSave(curr => ({ ...curr, fastInstall }));
                  }}
                />
                <span>缩短安装进度条等待动画</span>
              </label>

              <div className="pt-3 border-t border-[#cbd5e1] flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="ui-btn ui-btn-danger px-3 py-1.5 text-[12.5px]"
                  onClick={() => setModal('resetConfirm')}
                >
                  重置全部进度…
                </button>
                <button type="button" className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]" onClick={() => setModal(null)}>
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Windows 11 Reset Confirm Dialog */}
      {modal === 'resetConfirm' && running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[3px] p-3">
          <div className="modal-window w-full max-w-[370px] overflow-hidden text-[#18202c]" role="dialog" aria-label="确认重置游戏">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#eef2f7] border-b border-[#cbd5e1]">
              <span className="text-[13.5px] font-semibold">确认重置</span>
              <button type="button" aria-label="关闭确认重置" className="win11-close-btn" onClick={() => setModal('settings')}>×</button>
            </div>
            <div className="p-5">
              <p className="m-0 mb-5 text-[13.5px] text-[#334155] leading-relaxed">
                确定要清空所有邮件、账户余额和通关记录，重新开始夜班吗？
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className="ui-btn px-4 py-1.5 text-[13px]" onClick={() => setModal('settings')}>
                  取消
                </button>
                <button type="button" className="ui-btn ui-btn-danger px-4 py-1.5 text-[13px]" onClick={backupAndReset}>
                  确定重置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Windows 11 Help Dialog */}
      {modal === 'help' && running && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 backdrop-blur-[3px] p-3">
          <div className="modal-window w-full max-w-[450px] overflow-hidden text-[#18202c]" role="dialog" aria-label="操作指南">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#eef2f7] border-b border-[#cbd5e1]">
              <span className="text-[13.5px] font-semibold">夜班排查指南</span>
              <button type="button" aria-label="关闭指南" className="win11-close-btn" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="p-5 space-y-3 text-[13.5px] leading-relaxed text-[#334155]">
              <p className="m-0">1. 点开收件箱里标红的求助邮件，点击正文底下的 `.exe` 安装包运行向导。</p>
              <p className="m-0">2. 每个安装包的套路都不同：完成页暗桩、正反话、弹窗陷阱、假禁用按钮、协议里藏着的文字开关，甚至插画背后和右键菜单里都有机关。</p>
              <p className="m-0">3. 安全检测显示 <strong>0 个流氓捆绑软件</strong> 才算过关，回邮箱领酬劳；攒够 $7,000.00 去「尾款结算单」结账即可收工。</p>
              <p className="m-0 text-[#64748b] text-[12px]">提示：同一单只要失败过一次，检测结果弹窗就会开放「查看排查线索」。</p>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="ui-btn px-4 py-1.5 text-[13px]"
                  onClick={() => {
                    audioRef.current?.click();
                    startOnboardingTour();
                  }}
                >
                  互动新手指引
                </button>
                <button type="button" className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]" onClick={() => setModal(null)}>
                  知道了
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Platform Boss & Pause Overlays */}
      {platform.boss ? (
        <div className="fixed inset-0 z-50 bg-[#0b1320]" aria-label="游戏已暂停" />
      ) : (
        !running && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[4px] p-3">
            <section className="modal-window w-full max-w-[350px] overflow-hidden text-[#18202c]">
              <div className="px-4 py-2.5 bg-[#eef2f7] border-b border-[#cbd5e1] text-[13.5px] font-semibold">
                {platform.sidebar ? '游戏已暂停' : '值班暂停'}
              </div>
              <div className="p-5">
                {platform.sidebar ? (
                  <p className="m-0 text-[13.5px] text-[#334155]">关闭平台侧栏后就会自动恢复。</p>
                ) : (
                  <div className="space-y-4">
                    <p className="m-0 text-[13.5px] text-[#334155]">安装计时、背景音乐和提示音都已暂停，点下面随时恢复。</p>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]"
                        onClick={() => {
                          setManualPaused(false);
                        }}
                      >
                        继续值班
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )
      )}
    </main>
  );
}
