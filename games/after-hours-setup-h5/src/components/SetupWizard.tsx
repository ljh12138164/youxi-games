import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { LEVELS } from '../levels';
import {
  INSTALLER_SPECS,
  createInitialPuzzleState,
  evaluateInstaller,
  type CheckOption,
  type InstallerPuzzleState,
  type WizardPageKind,
} from '../installers/specs';
import type { InstallerId } from '../types';
import { InstallerExeIcon, SetupArtwork } from './Win98Icons';

type Props = {
  installerId: InstallerId;
  fastInstall: boolean;
  paused: boolean;
  attempts: number;
  voodooSubscribed: boolean;
  onAttemptFailed: (id: InstallerId) => void;
  onCleanSuccess: (id: InstallerId) => void;
  onVoodooSubscribed: () => void;
  onExitToMail: () => void;
  onClickSound: () => void;
  onErrorSound: () => void;
  onSuccessSound: () => void;
};

type DetectionResult = {
  bundles: number;
  voodooMailSent: boolean;
};

export function SetupWizard({
  installerId,
  fastInstall,
  paused,
  attempts,
  voodooSubscribed,
  onAttemptFailed,
  onCleanSuccess,
  onVoodooSubscribed,
  onExitToMail,
  onClickSound,
  onErrorSound,
  onSuccessSound,
}: Props) {
  const level = LEVELS[installerId];
  const spec = INSTALLER_SPECS[installerId];
  const reducedMotion = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speedFast = fastInstall || reducedMotion;

  const [runKey, setRunKey] = useState(0);
  const [puzzle, setPuzzle] = useState<InstallerPuzzleState>(() => createInitialPuzzleState(spec));
  const [inSplash, setInSplash] = useState(Boolean(spec.splashInit));
  const [splashProgress, setSplashProgress] = useState(0);
  const [splashCancelModal, setSplashCancelModal] = useState(false);

  const [pageIndex, setPageIndex] = useState(spec.initialPageIndex ?? 0);
  const [agreed, setAgreed] = useState(false);
  const [installPath, setInstallPath] = useState(level.defaultPath);
  const [browseToast, setBrowseToast] = useState<string | null>(null);

  const [welcomeInitPct, setWelcomeInitPct] = useState(spec.welcomeInit ? 0 : 100);
  const [installProgress, setInstallProgress] = useState(0);
  const [subProgress, setSubProgress] = useState(0);
  const [blackoutActive, setBlackoutActive] = useState(false);
  const blackoutDoneRef = useRef(false);

  const [showMoreModal, setShowMoreModal] = useState(false);
  const [showGearModal, setShowGearModal] = useState(false);
  const [showAgreementMore, setShowAgreementMore] = useState(false);
  const [breadSupportModal, setBreadSupportModal] = useState(false);
  const [mhnRefuseCount, setMhnRefuseCount] = useState(0);
  const [mhnModalOpen, setMhnModalOpen] = useState(false);
  const [mhnSecretCheck, setMhnSecretCheck] = useState(false);

  const [artworkHidden, setArtworkHidden] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [showHint, setShowHint] = useState(false);

  const longPressTimer = useRef<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const currentPage: WizardPageKind = spec.pages[pageIndex] ?? 'welcome';
  const maxProgress = spec.progressMaxPercent ?? 100;
  const anyModalOpen =
    exitModalOpen ||
    Boolean(detection) ||
    showMoreModal ||
    showGearModal ||
    breadSupportModal ||
    mhnModalOpen ||
    splashCancelModal;

  const resetWizard = () => {
    setPuzzle(createInitialPuzzleState(spec));
    setInSplash(Boolean(spec.splashInit));
    setSplashProgress(0);
    setSplashCancelModal(false);
    setPageIndex(spec.initialPageIndex ?? 0);
    setAgreed(false);
    setInstallPath(level.defaultPath);
    setBrowseToast(null);
    setWelcomeInitPct(spec.welcomeInit ? 0 : 100);
    setInstallProgress(0);
    setSubProgress(0);
    setBlackoutActive(false);
    blackoutDoneRef.current = false;
    setShowMoreModal(false);
    setShowGearModal(false);
    setShowAgreementMore(false);
    setBreadSupportModal(false);
    setMhnRefuseCount(0);
    setMhnModalOpen(false);
    setMhnSecretCheck(false);
    setArtworkHidden(false);
    setContextMenu(null);
    setExitModalOpen(false);
    setDetection(null);
    setShowHint(false);
    setRunKey(k => k + 1);
  };

  // Splash init timer (L3, L5).
  useEffect(() => {
    if (!inSplash || !spec.splashInit || paused || splashCancelModal) return;
    const totalMs = spec.splashInit.cancelOffersLite
      ? (speedFast ? 3200 : spec.splashInit.durationMs)
      : (speedFast ? 220 : spec.splashInit.durationMs);
    const tickMs = 50;
    const step = (100 * tickMs) / totalMs;
    const timer = window.setInterval(() => {
      setSplashProgress(prev => {
        const next = Math.min(100, prev + step);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => setInSplash(false), speedFast ? 80 : 220);
        }
        return next;
      });
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [inSplash, spec.splashInit, paused, splashCancelModal, speedFast, runKey]);

  // Welcome inline init timer (L8, L12).
  useEffect(() => {
    if (inSplash || currentPage !== 'welcome' || !spec.welcomeInit || welcomeInitPct >= 100 || paused || anyModalOpen) {
      return;
    }
    const totalMs = spec.welcomeInit.disappearingCheck
      ? (speedFast ? 2800 : spec.welcomeInit.durationMs)
      : (speedFast ? 250 : spec.welcomeInit.durationMs);
    const tickMs = 50;
    const step = (100 * tickMs) / totalMs;
    const timer = window.setInterval(() => {
      setWelcomeInitPct(prev => Math.min(100, prev + step));
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [inSplash, currentPage, spec.welcomeInit, welcomeInitPct, paused, anyModalOpen, speedFast]);

  // Installing progress simulation with realistic stalls, sub-progress and blackout.
  useEffect(() => {
    if (inSplash || currentPage !== 'installing' || paused || exitModalOpen || blackoutActive) return;
    let lag = 0;
    let nextLag = -1.1;
    const tickMs = 60;
    const baseGain = speedFast ? (maxProgress / 7) : (maxProgress / 34);
    const timer = window.setInterval(() => {
      if (!speedFast) {
        lag -= tickMs / 1000;
        if (lag > 0) return;
        if (lag < nextLag) {
          lag = 0.25 + Math.random() * 0.45;
          nextLag = -(0.8 + Math.random() * 1.4);
          return;
        }
      }

      setSubProgress(prev => (prev + (speedFast ? 48 : 18 + Math.random() * 24)) % 100);
      setInstallProgress(prev => {
        const next = Math.min(maxProgress, prev + baseGain);
        if (spec.blackoutAt40 && !blackoutDoneRef.current && next >= 40) {
          blackoutDoneRef.current = true;
          setBlackoutActive(true);
          window.setTimeout(() => setBlackoutActive(false), speedFast ? 220 : 1050);
        }
        if (next >= maxProgress) {
          window.clearInterval(timer);
          window.setTimeout(() => {
            const finishIdx = spec.pages.indexOf('finish');
            if (finishIdx !== -1) setPageIndex(finishIdx);
          }, speedFast ? 80 : 320);
        }
        return next;
      });
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [inSplash, currentPage, paused, exitModalOpen, blackoutActive, speedFast, maxProgress, spec.blackoutAt40, spec.pages]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  const setCheck = (id: string, checked: boolean) => {
    onClickSound();
    setPuzzle(prev => ({
      ...prev,
      checks: { ...prev.checks, [id]: checked },
    }));
  };

  const renderCheckList = (options: CheckOption[]) => (
    <div className="space-y-2 mt-3.5">
      {options.map(opt => (
        <label
          key={opt.id}
          className={`flex items-start gap-2.5 cursor-pointer text-[13.5px] leading-snug ${
            opt.faint ? 'text-[#b5b5b5] hover:text-[#424242] transition-colors' : 'text-[#1a1a1a]'
          }`}
        >
          <input
            type="checkbox"
            className="ui-checkbox mt-0.5 shrink-0"
            checked={Boolean(puzzle.checks[opt.id])}
            onChange={e => setCheck(opt.id, e.currentTarget.checked)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );

  const handleNext = () => {
    onClickSound();

    if (installerId === 'bread' && currentPage === 'welcome') {
      const anyUnchecked = spec.welcomeChecks?.some(c => !puzzle.checks[c.id]);
      if (anyUnchecked) {
        onErrorSound();
        setBreadSupportModal(true);
        return;
      }
    }

    if (spec.mhnAgreementTrap && currentPage === 'agreement' && !agreed) {
      onErrorSound();
      setMhnRefuseCount(c => c + 1);
      setMhnModalOpen(true);
      return;
    }

    if (currentPage === 'mode' && puzzle.installMode !== 'custom') {
      const pathIdx = spec.pages.indexOf('path');
      if (pathIdx !== -1) {
        setPageIndex(pathIdx);
        return;
      }
    }

    if (currentPage === 'finish' && spec.fakeDisabledNextOnFinish) {
      const extraIdx = spec.pages.indexOf('extraFinish');
      if (extraIdx !== -1) {
        setPageIndex(extraIdx);
        return;
      }
    }

    if (pageIndex < spec.pages.length - 1) {
      setPageIndex(i => i + 1);
      setShowAgreementMore(false);
    }
  };

  const handlePrevious = () => {
    onClickSound();
    if (currentPage === 'path' && spec.pages.includes('mode') && puzzle.installMode !== 'custom') {
      const modeIdx = spec.pages.indexOf('mode');
      if (modeIdx !== -1) {
        setPageIndex(modeIdx);
        return;
      }
    }
    if (pageIndex > 0) {
      const nextIdx = pageIndex - 1;
      if (spec.pages[nextIdx] === 'welcome' && spec.welcomeInit?.disappearingCheck) {
        setWelcomeInitPct(0);
      }
      setPageIndex(nextIdx);
      setShowAgreementMore(false);
    }
  };

  const handleFinish = () => {
    let voodooMailSent = false;
    if (installerId === 'voodoo' && puzzle.subscribeMail && !voodooSubscribed) {
      voodooMailSent = true;
      onVoodooSubscribed();
    } else if (installerId === 'voodoo' && puzzle.subscribeMail) {
      voodooMailSent = true;
    }

    const bundles = evaluateInstaller(spec, puzzle);
    if (bundles === 0) {
      onSuccessSound();
      onCleanSuccess(installerId);
    } else {
      onErrorSound();
      onAttemptFailed(installerId);
    }
    setDetection({ bundles, voodooMailSent });
  };

  const openContextAt = (clientX: number, clientY: number) => {
    if (!spec.rightClickLiteMenu || currentPage === 'installing' || currentPage === 'finish') return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    const x = rect ? Math.min(rect.width - 165, Math.max(8, clientX - rect.left)) : 24;
    const y = rect ? Math.min(rect.height - 84, Math.max(44, clientY - rect.top)) : 52;
    setContextMenu({ x, y });
  };

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!spec.rightClickLiteMenu || currentPage === 'installing' || currentPage === 'finish') return;
    e.preventDefault();
    openContextAt(e.clientX, e.clientY);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || !spec.rightClickLiteMenu || currentPage === 'installing' || currentPage === 'finish') {
      return;
    }
    const { clientX, clientY } = e;
    longPressTimer.current = window.setTimeout(() => {
      openContextAt(clientX, clientY);
    }, 450);
  };

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const isFirstPage = pageIndex === 0 || (currentPage === 'welcome' && !spec.backFromWelcome && pageIndex === (spec.initialPageIndex ?? 0));
  const agreementBlocked = currentPage === 'agreement' && !agreed && !spec.mhnAgreementTrap;
  const welcomeBlocked = currentPage === 'welcome' && Boolean(spec.welcomeInit) && welcomeInitPct < 100;
  const nextDisabled = agreementBlocked || welcomeBlocked;

  const isOnFinishStage = currentPage === 'finish' || currentPage === 'extraFinish';
  const showFakeDisabledNext = currentPage === 'finish' && Boolean(spec.fakeDisabledNextOnFinish);
  const wizardTitle = puzzle.mantisRealMode ? '螳螂虾车友会（官方直装向导）' : level.wizardTitle;

  const progressShown = Math.floor(installProgress);

  return (
    <div
      className="setup-backdrop fixed inset-0 z-10 flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto select-none"
      data-installer-id={installerId}
      data-page={inSplash ? 'splash' : currentPage}
      data-install-progress={currentPage === 'installing' ? progressShown : ''}
    >
      {/* L16 simulated display-driver blackout */}
      {blackoutActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-[#9ca3af] text-[13px]">
          正在重置显示输出模式…
        </div>
      )}

      {/* Initial Splash Screen (L3, L5) */}
      {inSplash && spec.splashInit ? (
        <div className="modal-window w-full max-w-[480px] overflow-hidden text-[#18202c]">
          <div className="flex items-center justify-between bg-[#e8edf5] border-b border-[#cbd5e1] px-3.5 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <InstallerExeIcon className="w-4 h-4 shrink-0" />
              <span className="text-[13px] font-semibold truncate">{wizardTitle}</span>
            </div>
            {spec.splashInit.cancelOffersLite && (
              <button
                type="button"
                aria-label="关闭初始化窗口"
                className="win11-close-btn ui-close-btn"
                disabled={splashProgress >= 100}
                onClick={() => { onClickSound(); setSplashCancelModal(true); }}
              >
                ×
              </button>
            )}
          </div>
          <div className="p-5">
            <p className="m-0 mb-3.5 text-[13.5px] text-[#1e293b]">{spec.splashInit.message}</p>
            <div className="h-[8px] rounded-full bg-[#e2e8f0] border border-[#cbd5e1] overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-[#0067c0] transition-[width] duration-75"
                style={{ width: `${Math.min(100, splashProgress)}%` }}
              />
            </div>
            <div className="text-right text-[12px] text-[#5c5c5c] tabular-nums mb-4">
              {Math.floor(splashProgress)}%
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="ui-btn min-w-[88px] py-1.5 text-[13px]"
                disabled={splashProgress >= 100}
                onClick={() => {
                  onClickSound();
                  if (spec.splashInit?.cancelOffersLite) setSplashCancelModal(true);
                  else setExitModalOpen(true);
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Windows 11 Fluent Setup Wizard Window */
        <div
          ref={surfaceRef}
          tabIndex={-1}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onKeyDown={e => {
            if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && spec.rightClickLiteMenu) {
              e.preventDefault();
              openContextAt(120, 120);
            }
          }}
          className="wizard-window relative w-full max-w-[780px] overflow-hidden text-[#18202c]"
        >
          {/* Windows 11 Caption Bar */}
          <div className="flex items-center justify-between bg-[#e8edf5] border-b border-[#cbd5e1] px-3 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              {spec.rightClickLiteMenu ? (
                <button
                  type="button"
                  aria-label="打开安装菜单"
                  title="窗口菜单"
                  className="win11-caption-btn ui-close-btn"
                  onClick={e => {
                    e.stopPropagation();
                    openContextAt(20, 48);
                  }}
                >
                  ≡
                </button>
              ) : (
                <InstallerExeIcon className="w-4 h-4 shrink-0 ml-1" />
              )}
              <h2 className="m-0 text-[13px] font-semibold text-[#1a1a1a] truncate">
                {wizardTitle}
              </h2>
            </div>

            <button
              type="button"
              aria-label="关闭向导"
              className="win11-close-btn ui-close-btn"
              onClick={() => {
                onClickSound();
                setExitModalOpen(true);
              }}
            >
              ×
            </button>
          </div>

          <div className="p-4 sm:p-5">
            {/* L16 Real clickable strikethrough header bar */}
            {spec.voodooStrikeLabel && currentPage !== 'installing' && (
              <div className="mb-3 px-3 py-2 rounded-md bg-[#eff6fc] border border-[#0067c0]/20 text-[12.5px] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClickSound();
                    setPuzzle(p => ({ ...p, voodooFooterStruck: !p.voodooFooterStruck }));
                  }}
                  className={`border-0 bg-transparent p-0 text-left cursor-pointer text-[12.5px] ${
                    puzzle.voodooFooterStruck ? 'line-through text-[#757575]' : 'text-[#1a1a1a]'
                  }`}
                >
                  {spec.voodooStrikeLabel}
                </button>
              </div>
            )}

            {/* Main Wizard Two-Column Area */}
            <div className="flex flex-col sm:flex-row gap-4 min-h-[300px] sm:min-h-[350px]">
              {/* Left Illustration Panel (L12 clickable to reveal hidden checks) */}
              <div
                className={`relative shrink-0 sm:w-[196px] rounded-lg border border-[#9fb0c8] bg-[#f1f5f9] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${
                  spec.artworkHiddenChecks ? 'min-h-[120px] sm:min-h-[350px]' : 'hidden sm:block sm:min-h-[350px]'
                }`}
              >
                {spec.artworkHiddenChecks && (
                  <div className="p-3 text-[12.5px] space-y-2 bg-white h-full">
                    <div className="font-semibold text-[#c42b1c]">隐藏附加插件：</div>
                    {spec.artworkHiddenChecks.map(opt => (
                      <label key={opt.id} className="flex items-start gap-2 cursor-pointer text-[12px] leading-snug">
                        <input
                          type="checkbox"
                          className="ui-checkbox mt-0.5 shrink-0"
                          checked={Boolean(puzzle.checks[opt.id])}
                          onChange={e => setCheck(opt.id, e.currentTarget.checked)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {!artworkHidden && (
                  spec.artworkHiddenChecks ? (
                    <button
                      type="button"
                      aria-label="向导左侧插画"
                      onClick={() => {
                        onClickSound();
                        setArtworkHidden(true);
                      }}
                      className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer block group"
                    >
                      <SetupArtwork className="w-full h-full block" />
                      <span className="absolute right-1.5 bottom-1.5 w-3 h-3 rounded-sm bg-white/80 border border-black/20 opacity-75 group-hover:opacity-100" />
                    </button>
                  ) : (
                    <SetupArtwork
                      variant={puzzle.mantisRealMode ? 'alt' : 'classic'}
                      className="w-full h-full block"
                    />
                  )
                )}
              </div>

              {/* Right Wizard Content Card */}
              <div
                data-tour="wizard-content"
                className="flex-1 min-w-0 rounded-lg bg-white border border-[#cbd5e1] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] flex flex-col justify-between"
              >
                {(currentPage === 'preAd1' || currentPage === 'preAd2') && (
                  <div>
                    <h3 className="m-0 mb-2 text-[19px] font-semibold">
                      {currentPage === 'preAd1' ? '装机推广推荐（第 1 页）' : '装机配套服务（第 2 页）'}
                    </h3>
                    <p className="m-0 text-[13.5px] text-[#5c5c5c]">
                      以下合作组件将随主程序一并启用：
                    </p>
                    {renderCheckList(
                      (currentPage === 'preAd1' ? spec.preAd1Checks : spec.preAd2Checks) ?? []
                    )}
                  </div>
                )}

                {currentPage === 'welcome' && (
                  <div>
                    <h3 className="m-0 mb-2.5 text-[20px] sm:text-[22px] font-semibold text-[#1a1a1a]">安装向导即将开始</h3>
                    <p className="m-0 text-[13.5px] sm:text-[14px] text-[#424242] leading-relaxed">{spec.welcomeText}</p>

                    {spec.mantisDecoyLink && !puzzle.mantisRealMode && (
                      <div className="mt-3.5 p-2.5 rounded-md bg-[#eff6fc] border border-[#0067c0]/25 text-[12.5px]">
                        <button
                          type="button"
                          onClick={() => {
                            onClickSound();
                            setPuzzle(p => ({
                              ...p,
                              mantisRealMode: true,
                              checks: { ...p.checks, 'mt-safe': true, 'mt-nav': true },
                            }));
                            setPageIndex(0);
                            setAgreed(false);
                          }}
                          className="border-0 bg-transparent p-0 text-[#0067c0] hover:underline cursor-pointer text-left text-[12.5px] font-medium"
                        >
                          当前为推广壳引导，点击切换至「螳螂虾车友会官方直装向导」
                        </button>
                      </div>
                    )}

                    {spec.voodooSubscribeCheck && (
                      <label className="mt-4 flex items-start gap-2.5 cursor-pointer text-[13.5px] font-medium text-[#0067c0]">
                        <input
                          type="checkbox"
                          className="ui-checkbox mt-0.5 shrink-0"
                          checked={puzzle.subscribeMail}
                          onChange={e => {
                            onClickSound();
                            const checked = e.currentTarget.checked;
                            setPuzzle(p => ({ ...p, subscribeMail: checked }));
                          }}
                        />
                        <span>允许我们向您的邮箱发送官方最新驱动通知邮件</span>
                      </label>
                    )}

                    {spec.welcomeInit && (
                      <div className="mt-4 space-y-2.5">
                        {welcomeInitPct < 100 && (
                          <>
                            <div className="flex justify-between text-[12px] text-[#5c5c5c]">
                              <span>正在载入安装包组件…</span>
                              <span className="tabular-nums">{Math.floor(welcomeInitPct)}%</span>
                            </div>
                            <div className="h-[7px] rounded-full bg-[#e2e8f0] border border-[#cbd5e1] overflow-hidden">
                              <div className="h-full rounded-full bg-[#0067c0]" style={{ width: `${welcomeInitPct}%` }} />
                            </div>
                          </>
                        )}
                        {spec.welcomeInit.disappearingCheck && welcomeInitPct < 100 && (
                          <div className="p-2.5 rounded-md bg-[#fff8e1] border border-[#f0c36d]">
                            {renderCheckList([spec.welcomeInit.disappearingCheck])}
                          </div>
                        )}
                        {spec.welcomeInit.revealsMoreButton && welcomeInitPct >= 100 && (
                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              className="ui-btn px-3 py-1 text-[12.5px]"
                              onClick={() => {
                                onClickSound();
                                setShowMoreModal(true);
                              }}
                            >
                              更多…
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {spec.welcomeChecks && (!spec.mantisDecoyLink || puzzle.mantisRealMode) && renderCheckList(spec.welcomeChecks)}
                  </div>
                )}

                {currentPage === 'mode' && (
                  <div>
                    <h3 className="m-0 mb-2.5 text-[19px] font-semibold">选择安装模式</h3>
                    <p className="m-0 mb-3.5 text-[13.5px] text-[#5c5c5c]">请选择「{level.appName}」的安装方式：</p>
                    <div className="space-y-2.5 text-[13.5px]">
                      {(
                        [
                          ['full', '完全安装（推荐）：装入完整功能与精选推荐插件'],
                          ['lite', '精简安装：安装基础组件（含少量赞助插件）'],
                          ['custom', '自定义安装：手动挑选要保留或取消的组件'],
                        ] as const
                      ).map(([mode, label]) => (
                        <label key={mode} className="flex items-center gap-2.5 cursor-pointer rounded-md p-2.5 border border-[#cbd5e1] bg-[#f9fbfd] hover:bg-[#eff5fc] hover:border-[#94a3b8]">
                          <input
                            type="radio"
                            name="eyecare-mode"
                            checked={puzzle.installMode === mode}
                            onChange={() => {
                              onClickSound();
                              setPuzzle(p => ({ ...p, installMode: mode }));
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {currentPage === 'checklist' && (
                  <div>
                    <h3 className="m-0 mb-2 text-[19px] font-semibold">{spec.checklistTitle ?? '自定义组件选项'}</h3>
                    <p className="m-0 text-[13.5px] text-[#5c5c5c]">看清每一项的文字表述再点「下一步」：</p>
                    {spec.checklistChecks && renderCheckList(spec.checklistChecks)}
                  </div>
                )}

                {currentPage === 'agreement' && (
                  <div className="flex flex-col h-full">
                    <h3 className="m-0 mb-2.5 text-[19px] font-semibold">软件最终许可协议</h3>
                    {showAgreementMore && spec.agreementMoreChecks ? (
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <p className="m-0 text-[13.5px] font-medium text-[#242424]">附加桌面组件：</p>
                          {renderCheckList(spec.agreementMoreChecks)}
                        </div>
                        <div className="mt-4">
                          <button
                            type="button"
                            className="ui-btn px-3 py-1.5 text-[12.5px]"
                            onClick={() => {
                              onClickSound();
                              setShowAgreementMore(false);
                            }}
                          >
                            返回协议正文
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className="rounded-md border border-[#9fb0c6] bg-[#f8fafc] p-3 h-[182px] overflow-y-auto text-[12.5px] leading-relaxed select-text space-y-2 text-[#1e293b]"
                          aria-label="软件最终许可协议正文"
                        >
                          {puzzle.mhnCleanAgreement && (
                            <p className="m-0 font-semibold text-[#0f7b0f]">
                              【纯净协议 B 已生效】已剥离第三方浏览器与附加推广。
                            </p>
                          )}
                          {level.eulaText.map((line, i) => (
                            <p key={i} className="m-0">{line}</p>
                          ))}
                          {spec.agreementHiddenButton && (
                            <p className="m-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onClickSound();
                                  setPuzzle(p => ({ ...p, lettershopForbidden: !p.lettershopForbidden }));
                                }}
                                className={`border-0 bg-transparent p-0 text-left text-[12.5px] cursor-pointer font-normal ${
                                  puzzle.lettershopForbidden ? 'text-[#0f7b0f] font-semibold' : 'text-[#2c2c2c]'
                                }`}
                              >
                                {puzzle.lettershopForbidden
                                  ? '附加条款：禁止安装 LetterShop 桌面快捷助手。'
                                  : '附加条款：安装 LetterShop 桌面快捷助手。'}
                              </button>
                            </p>
                          )}
                          {spec.mantisEulaClauses && puzzle.mantisRealMode && (
                            <div className="space-y-1.5 pt-2 border-t border-[#cbd5e1]">
                              {spec.mantisEulaClauses.map((clause, idx) => {
                                const detached = puzzle.mantisDetached[idx];
                                return (
                                  <p key={idx} className="m-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onClickSound();
                                        setPuzzle(p => {
                                          const next: [boolean, boolean, boolean] = [...p.mantisDetached];
                                          next[idx] = !next[idx];
                                          return { ...p, mantisDetached: next };
                                        });
                                      }}
                                      className={`border-0 bg-transparent p-0 text-left text-[12.5px] cursor-pointer ${
                                        detached ? 'text-[#9e9e9e] line-through' : 'text-[#1a1a1a]'
                                      }`}
                                    >
                                      {clause}
                                    </button>
                                  </p>
                                );
                              })}
                            </div>
                          )}
                          {spec.agreementCheckInsideScroll && (
                            <div className="pt-2 border-t border-[#cbd5e1]">
                              {renderCheckList([spec.agreementCheckInsideScroll])}
                            </div>
                          )}
                        </div>

                        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer text-[13.5px]">
                            <input
                              type="checkbox"
                              className="ui-checkbox"
                              checked={agreed}
                              onChange={e => {
                                onClickSound();
                                setAgreed(e.currentTarget.checked);
                              }}
                            />
                            <span>我同意此协议</span>
                          </label>
                          {spec.agreementMoreChecks && (
                            <button
                              type="button"
                              className="border-0 bg-transparent p-0 text-[12.5px] text-[#5c5c5c] underline cursor-pointer"
                              onClick={() => {
                                onClickSound();
                                setShowAgreementMore(true);
                              }}
                            >
                              更多选项
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {currentPage === 'path' && (
                  <div>
                    <h3 className="m-0 mb-2 text-[19px] font-semibold">选择安装路径</h3>
                    <p className="m-0 mb-3 text-[13.5px] text-[#5c5c5c]">程序将装入下面目录，点「浏览」可核对路径：</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        aria-label="安装路径"
                        value={installPath}
                        onChange={e => setInstallPath(e.currentTarget.value)}
                        className="flex-1 min-w-0 rounded-md border border-[#94a3b8] bg-white px-2.5 py-1.5 text-[13px] font-mono focus:border-[#0067c0]"
                      />
                      <button
                        type="button"
                        className="ui-btn px-3 py-1.5 text-[13px] shrink-0"
                        onClick={() => {
                          onClickSound();
                          setBrowseToast(`目录 ${installPath} 空间充足。`);
                        }}
                      >
                        浏览…
                      </button>
                    </div>
                    {browseToast && <p className="m-0 mt-1.5 text-[12px] text-[#0f7b0f]">{browseToast}</p>}
                    {spec.pathChecks && renderCheckList(spec.pathChecks)}
                  </div>
                )}

                {currentPage === 'installing' && (
                  <div>
                    <h3 className="m-0 mb-2.5 text-[19px] font-semibold">正在安装…</h3>
                    <p className="m-0 mb-4 text-[13.5px] text-[#5c5c5c]">
                      正在写入「{level.appName}」，请稍候。
                    </p>
                    <div className="flex items-center justify-between text-[12.5px] font-medium text-[#1a1a1a] mb-1.5">
                      <span>安装进度</span>
                      <span className="tabular-nums">已安装 {progressShown}%</span>
                    </div>
                    <div className="h-[9px] rounded-full bg-[#e2e8f0] border border-[#cbd5e1] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0067c0] transition-[width] duration-75"
                        style={{ width: `${Math.min(100, (installProgress / maxProgress) * 100)}%` }}
                      />
                    </div>
                    {spec.dualProgressBar && (
                      <div className="mt-4">
                        <div className="text-[12px] text-[#475569] mb-1.5">当前文件写入进度</div>
                        <div className="h-[6px] rounded-full bg-[#e2e8f0] border border-[#cbd5e1] overflow-hidden">
                          <div className="h-full rounded-full bg-[#0067c0]/75" style={{ width: `${subProgress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentPage === 'finish' && (
                  <div>
                    <h3 className="m-0 mb-2.5 text-[20px] font-semibold">安装完成</h3>
                    <p className="m-0 text-[13.5px] sm:text-[14px] text-[#424242] leading-relaxed">
                      「{level.appName}」已经装好了。点下面「完成」运行安全检测。
                    </p>
                    {spec.finishChecks && renderCheckList(spec.finishChecks)}
                  </div>
                )}

                {currentPage === 'extraFinish' && (
                  <div>
                    <h3 className="m-0 mb-2 text-[19px] font-semibold">等等，还有更多！</h3>
                    <p className="m-0 text-[13.5px] text-[#5c5c5c]">向导还附带了一批合作内容，点击完成前请确认：</p>
                    {spec.extraFinishChecks && renderCheckList(spec.extraFinishChecks)}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Wizard Action Bar */}
            <div
              data-tour="wizard-actions"
              className="mt-4 pt-3.5 border-t border-[#cbd5e1] flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                {spec.gearChecks && currentPage !== 'installing' && !isOnFinishStage && (
                  <button
                    type="button"
                    className="ui-btn px-3 py-1.5 text-[12.5px]"
                    onClick={() => {
                      onClickSound();
                      setShowGearModal(true);
                    }}
                  >
                    ⚙ 安装选项
                  </button>
                )}
                {puzzle.liteMode && (
                  <span className="rounded-full bg-[#dff6dd] px-2.5 py-0.5 text-[12px] font-medium text-[#0f7b0f]">
                    已切换精简版
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 ml-auto">
                {currentPage !== 'installing' && currentPage !== 'extraFinish' && (
                  <button
                    type="button"
                    disabled={isFirstPage || isOnFinishStage}
                    className={`ui-btn min-w-[84px] py-1.5 text-[13px] ${
                      spec.backFromWelcome && currentPage === 'welcome' ? 'text-[#5c5c5c]' : ''
                    }`}
                    onClick={handlePrevious}
                  >
                    上一步
                  </button>
                )}

                {currentPage !== 'installing' && (!isOnFinishStage || showFakeDisabledNext) && (
                  <button
                    type="button"
                    disabled={nextDisabled}
                    className={`ui-btn min-w-[84px] py-1.5 text-[13px] ${
                      showFakeDisabledNext ? 'is-fake-disabled' : 'ui-btn-primary'
                    }`}
                    onClick={handleNext}
                  >
                    {currentPage === 'path' ? '安装' : '下一步'}
                  </button>
                )}

                {isOnFinishStage ? (
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary min-w-[84px] py-1.5 text-[13px]"
                    onClick={handleFinish}
                  >
                    完成
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ui-btn min-w-[84px] py-1.5 text-[13px]"
                    onClick={() => {
                      onClickSound();
                      setExitModalOpen(true);
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right-click context menu (L14 kindoor) */}
          {contextMenu && (
            <div
              role="menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={e => e.stopPropagation()}
              className="app-dropdown absolute z-40 min-w-[156px] p-1 text-[13px]"
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={puzzle.liteMode}
                onClick={() => {
                  onClickSound();
                  setPuzzle(p => ({ ...p, liteMode: !p.liteMode }));
                  setContextMenu(null);
                }}
              >
                {puzzle.liteMode ? '✓ 安装精简版' : '□ 安装精简版'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setContextMenu(null);
                  setExitModalOpen(true);
                }}
              >
                退出安装
              </button>
            </div>
          )}
        </div>
      )}

      {/* L5 Splash Cancel Modal */}
      {splashCancelModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3">
          <div className="modal-window w-full max-w-[380px] overflow-hidden text-[#1a1a1a]">
            <div className="flex items-center justify-between bg-[#eef2f7] border-b border-[#cbd5e1] px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">取消初始化</span>
              <button type="button" aria-label="关闭取消初始化窗口" className="win11-close-btn ui-close-btn" onClick={() => setSplashCancelModal(false)}>×</button>
            </div>
            <div className="p-5">
              <p className="m-0 mb-4 text-[13.5px] text-[#424242] leading-relaxed">
                确定要退出标准推广版吗？你也可以直接安装无插件精简版。
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="ui-btn ui-btn-primary px-3.5 py-1.5 text-[13px]"
                  onClick={() => {
                    onClickSound();
                    setPuzzle(p => ({ ...p, liteMode: true }));
                    setSplashCancelModal(false);
                    setInSplash(false);
                  }}
                >
                  安装精简版
                </button>
                <button type="button" className="ui-btn px-3.5 py-1.5 text-[13px]" onClick={onExitToMail}>
                  取消安装
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* L3 Bread Support Trap Modal */}
      {breadSupportModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3">
          <div className="modal-window w-full max-w-[370px] overflow-hidden text-[#1a1a1a]">
            <div className="flex items-center justify-between bg-[#eef2f7] border-b border-[#cbd5e1] px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">请支持我们</span>
              <button
                type="button"
                aria-label="忽略并继续"
                className="win11-close-btn ui-close-btn"
                onClick={() => {
                  onClickSound();
                  setBreadSupportModal(false);
                  setPageIndex(i => i + 1);
                }}
              >
                ×
              </button>
            </div>
            <div className="p-5">
              <p className="m-0 mb-4 text-[13.5px] text-[#424242] leading-relaxed">
                免费软件开发不易，点「确定」支持安装合作推荐组件。
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]"
                  onClick={() => {
                    onClickSound();
                    setPuzzle(p => ({
                      ...p,
                      checks: { ...p.checks, 'br-moon': true, 'br-weather': true, 'br-clean': true },
                    }));
                    setBreadSupportModal(false);
                    setPageIndex(i => i + 1);
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* L8 CCSST More Options Modal */}
      {showMoreModal && spec.moreChecks && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3">
          <div className="modal-window w-full max-w-[400px] overflow-hidden text-[#1a1a1a]">
            <div className="flex items-center justify-between bg-[#eef2f7] border-b border-[#cbd5e1] px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">更多安装选项</span>
              <button type="button" aria-label="关闭更多选项" className="win11-close-btn ui-close-btn" onClick={() => setShowMoreModal(false)}>×</button>
            </div>
            <div className="p-5">
              <p className="m-0 text-[13.5px] text-[#424242]">同时订阅下面这些扩展服务：</p>
              {renderCheckList(spec.moreChecks)}
              <div className="flex justify-end mt-5">
                <button type="button" className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]" onClick={() => setShowMoreModal(false)}>
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* L8 CCSST Gear Options Modal */}
      {showGearModal && spec.gearChecks && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3">
          <div className="modal-window w-full max-w-[390px] overflow-hidden text-[#1a1a1a]">
            <div className="flex items-center justify-between bg-[#eef2f7] border-b border-[#cbd5e1] px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">安装选项设置</span>
              <button type="button" aria-label="关闭安装选项" className="win11-close-btn ui-close-btn" onClick={() => setShowGearModal(false)}>×</button>
            </div>
            <div className="p-5">
              <p className="m-0 text-[13.5px] text-[#424242]">默认附带的网络服务与下载工具：</p>
              {renderCheckList(spec.gearChecks)}
              <div className="flex justify-end mt-5">
                <button type="button" className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]" onClick={() => setShowGearModal(false)}>
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* L10 MHN Repeated Agreement Warning Modal */}
      {mhnModalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3">
          <div className="modal-window w-full max-w-[400px] overflow-hidden text-[#1a1a1a]">
            <div className="flex items-center justify-between bg-[#eef2f7] border-b border-[#cbd5e1] px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">许可协议提示</span>
              <button type="button" aria-label="关闭协议提示" className="win11-close-btn ui-close-btn" onClick={() => setMhnModalOpen(false)}>×</button>
            </div>
            <div className="p-5">
              <p className="m-0 text-[13.5px] text-[#424242] leading-relaxed">
                必须同意许可协议才能继续安装，已帮你自动勾选同意。
              </p>
              {mhnRefuseCount >= 4 && (
                <label className="mt-3.5 flex items-start gap-2.5 cursor-pointer text-[13px] font-medium text-[#0067c0] p-2.5 rounded-md bg-[#eff6fc] border border-[#0067c0]/25">
                  <input
                    type="checkbox"
                    className="ui-checkbox mt-0.5 shrink-0"
                    checked={mhnSecretCheck}
                    onChange={e => {
                      onClickSound();
                      setMhnSecretCheck(e.currentTarget.checked);
                    }}
                  />
                  <span>不要安装「Internet Exploder」（切换至纯净协议 B）</span>
                </label>
              )}
              <div className="flex justify-end mt-5">
                <button
                  type="button"
                  className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]"
                  onClick={() => {
                    onClickSound();
                    setAgreed(true);
                    if (mhnSecretCheck) {
                      setPuzzle(p => ({ ...p, mhnCleanAgreement: true }));
                    }
                    setMhnModalOpen(false);
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Universal Exit Confirmation Modal (holds secret checkboxes on L11 banquet) */}
      {exitModalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px] p-3">
          <div className="modal-window w-full max-w-[390px] overflow-hidden text-[#1a1a1a]">
            <div className="flex items-center justify-between bg-[#eef2f7] border-b border-[#cbd5e1] px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">退出安装</span>
              <button type="button" aria-label="返回安装" className="win11-close-btn ui-close-btn" onClick={() => setExitModalOpen(false)}>×</button>
            </div>
            <div className="p-5">
              <p className="m-0 text-[13.5px] text-[#424242]">确定要退出「{level.appName}」安装向导吗？</p>
              {spec.exitDialogChecks && renderCheckList(spec.exitDialogChecks)}
              <div className="flex justify-end gap-2 mt-5">
                <button type="button" className="ui-btn px-4 py-1.5 text-[13px]" onClick={onExitToMail}>
                  确定退出
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary px-4 py-1.5 text-[13px]"
                  onClick={() => {
                    onClickSound();
                    setExitModalOpen(false);
                  }}
                >
                  继续安装
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Malicious Software Detection Result Modal */}
      {detection && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-3">
          <div className="modal-window w-full max-w-[440px] overflow-hidden text-[#1a1a1a]" role="dialog" aria-label="流氓软件安全检测">
            <div className="flex items-center justify-between bg-[#eef2f7] border-b border-[#cbd5e1] px-4 py-2.5">
              <span className="text-[13.5px] font-semibold">流氓软件安全检测</span>
              <button type="button" aria-label="关闭检测结果" className="win11-close-btn ui-close-btn" onClick={onExitToMail}>×</button>
            </div>

            <div className="p-5">
              {detection.bundles === 0 ? (
                <div className="space-y-3 text-[13.5px]">
                  <p className="m-0 font-semibold text-[#0f7b0f] text-[15px]">
                    检测通过：本次安装共携带 0 个流氓捆绑软件。
                  </p>
                  <p className="m-0 text-[#424242] leading-relaxed">
                    电脑干干净净。回 Outhook Express 收取委托人的回信和酬劳吧。
                  </p>
                  <div className="flex justify-end pt-2">
                    <button type="button" className="ui-btn ui-btn-primary px-5 py-1.5 text-[13px]" onClick={onExitToMail}>
                      确定
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-[13.5px]">
                  <p className="m-0 font-semibold text-[#c42b1c] text-[15px]">
                    检测到 {detection.bundles} 个多余或恶意捆绑组件。
                  </p>
                  {detection.voodooMailSent ? (
                    <p className="m-0 p-3 rounded-md bg-[#eff6fc] border border-[#0067c0]/25 text-[#004578] leading-relaxed">
                      主包只是推广壳，不过你勾选了邮件通知——官方离线安装包已经发往 Outhook Express 收件箱，回去查看新邮件。
                    </p>
                  ) : (
                    <p className="m-0 text-[#424242] leading-relaxed">
                      带捆绑交不了差。重开向导再查一遍页面、按钮和弹窗里的暗格。
                    </p>
                  )}

                  {attempts >= 1 && (
                    <div className="pt-1">
                      {!showHint ? (
                        <button
                          type="button"
                          className="ui-btn px-3 py-1 text-[12px]"
                          onClick={() => setShowHint(true)}
                        >
                          查看排查线索
                        </button>
                      ) : (
                        <div className="p-3 rounded-md bg-[#fff8e1] border border-[#f0c36d] text-[12.5px] text-[#5c4300] leading-relaxed">
                          <strong>排查线索：</strong>
                          {level.hint}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <button type="button" className="ui-btn ui-btn-primary px-4 py-1.5 text-[13px]" onClick={resetWizard}>
                      重新安装排查
                    </button>
                    <button type="button" className="ui-btn px-4 py-1.5 text-[13px]" onClick={onExitToMail}>
                      返回邮箱
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
