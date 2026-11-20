import { useEffect, useRef, useState } from 'react';
import { TOTAL_ORDERS } from '../levels';
import { ACCOUNT_LABEL, MAILS } from '../mails';
import {
  canDeleteMail,
  getFolderMails,
  isMailHighlightRed,
} from '../game';
import type { ClearedId, InstallerId, SaveState } from '../types';
import {
  InstallerExeIcon,
  MiniEnvelopeIcon,
  MoneyIcon,
  OuthookBannerIcon,
  ToolbarIcon,
  TreeIcon,
} from './Win98Icons';

type Props = {
  save: SaveState;
  selectedMailId: string | null;
  musicEnabled: boolean;
  trackTitle: string;
  onSelectMail: (id: string) => void;
  onDeleteMail: (id: string) => void;
  onRecoverMail: (id: string) => void;
  onDeleteRead: () => void;
  onClaimMoney: (id: string) => void;
  onLaunchInstaller: (id: InstallerId) => void;
  onToggleMusic: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onStartTour: () => void;
  onPause: () => void;
  onReplayEpilogue: () => void;
  onClickSound: () => void;
};

type MenuKey = 'file' | 'edit' | 'view' | 'tools' | 'info' | 'help' | null;

export function MailClient({
  save,
  selectedMailId,
  musicEnabled,
  trackTitle,
  onSelectMail,
  onDeleteMail,
  onRecoverMail,
  onDeleteRead,
  onClaimMoney,
  onLaunchInstaller,
  onToggleMusic,
  onOpenSettings,
  onOpenHelp,
  onStartTour,
  onPause,
  onReplayEpilogue,
  onClickSound,
}: Props) {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [displayBalance, setDisplayBalance] = useState(save.balance);
  const balanceRef = useRef(save.balance);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const inboxMails = getFolderMails(save, 'inbox');
  const trashMails = getFolderMails(save, 'trash');
  const selectedMail = selectedMailId ? MAILS[selectedMailId] ?? null : null;
  const inTrash = selectedMail ? save.deletedMails.includes(selectedMail.id) : false;
  const canDeleteSelected = selectedMail ? !inTrash && canDeleteMail(save, selectedMail.id) : false;
  const canRecoverSelected = Boolean(selectedMail && inTrash);
  const canDeleteAnyRead = inboxMails.some(m => save.readMails.includes(m.id) && canDeleteMail(save, m.id));

  // Smooth rolling balance display.
  useEffect(() => {
    const target = save.balance;
    if (Math.abs(balanceRef.current - target) < 0.01) {
      balanceRef.current = target;
      setDisplayBalance(target);
      return;
    }
    if (save.fastInstall || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      balanceRef.current = target;
      setDisplayBalance(target);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const diff = target - balanceRef.current;
      const step = diff * Math.min(1, dt * 6) + Math.sign(diff) * Math.max(0.15, Math.abs(diff) * 0.04);
      if (Math.abs(step) >= Math.abs(diff)) {
        balanceRef.current = target;
        setDisplayBalance(target);
      } else {
        balanceRef.current += step;
        setDisplayBalance(balanceRef.current);
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [save.balance, save.fastInstall]);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (e: PointerEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [openMenu]);

  const toggleMenu = (key: Exclude<MenuKey, null>) => {
    onClickSound();
    setOpenMenu(curr => (curr === key ? null : key));
  };

  const renderTreeMail = (mailId: string) => {
    const mail = MAILS[mailId];
    if (!mail) return null;
    const active = selectedMailId === mail.id;
    const isRed = isMailHighlightRed(save, mail.id);
    const isRead = save.readMails.includes(mail.id);
    const cleared = mail.attachment && mail.attachment.installerId !== 'voodoo'
      ? save.clearedInstallers.includes(mail.attachment.installerId as ClearedId)
      : mail.attachment?.installerId === 'voodoo' && save.voodooSubscribed;

    let colorClass = 'text-[#1e293b] font-medium';
    if (isRed) colorClass = 'text-[#c42b1c] font-semibold';
    else if (cleared || (isRead && !mail.attachment)) colorClass = 'text-[#64748b]';

    return (
      <button
        key={mail.id}
        type="button"
        onClick={() => {
          setOpenMenu(null);
          onSelectMail(mail.id);
        }}
        aria-current={active ? 'true' : undefined}
        className={`mail-tree-item ${colorClass} ${active ? 'is-selected' : ''}`}
        title={mail.subject}
      >
        <span className="flex items-center gap-2 min-w-0">
          {isRed && <span className="w-1.5 h-1.5 rounded-full bg-[#c42b1c] shrink-0" aria-hidden="true" />}
          <span className="truncate">{mail.subject}</span>
        </span>
        {cleared && (
          <span className="ml-1 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-[#e6f6e6] border border-[#9cd69c] text-[#0f7b0f]">
            已过
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="win11-mica h-dvh w-full overflow-hidden sm:p-2.5 flex flex-col text-[#18202c] select-none">
      {/* Framed Windows 11 Desktop Application Window */}
      <div className="app-shell-frame flex-1 min-h-0 flex flex-col sm:rounded-xl sm:border sm:border-[#aebbd0] overflow-hidden">
        {/* Windows 11 App Title & Menu Bar */}
        <header
          ref={menuBarRef}
          className="app-menubar shrink-0 relative flex items-center justify-between gap-2 px-3 py-1.5 bg-[#ebf0f7] border-b border-[#cbd5e1]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-2 shrink-0 pr-2.5 border-r border-[#bac4d4]">
              <OuthookBannerIcon className="w-6 h-5 shrink-0" />
              <h1 className="m-0 text-[14px] font-semibold tracking-tight text-[#0f172a] whitespace-nowrap">
                Outhook Express
              </h1>
            </div>
            <nav className="flex flex-wrap items-center gap-0.5 text-[12.5px]" aria-label="邮箱菜单">
              {(
                [
                  ['file', '文件'],
                  ['edit', '编辑'],
                  ['view', '视图'],
                  ['tools', '工具'],
                  ['info', '信息'],
                  ['help', '帮助'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="relative">
                  <button
                    type="button"
                    aria-expanded={openMenu === key}
                    onClick={() => toggleMenu(key)}
                    className="px-2 py-1 text-left whitespace-nowrap"
                  >
                    {label}
                  </button>
                  {openMenu === key && (
                    <div className="app-dropdown absolute left-0 top-full mt-1.5 z-30 min-w-[164px] p-1 text-[13px]">
                      {key === 'file' && (
                        <>
                          <button type="button" onClick={() => { setOpenMenu(null); onPause(); }}>暂停值班 (Esc)</button>
                          <button type="button" onClick={() => { setOpenMenu(null); onOpenSettings(); }}>设置与重置…</button>
                          {save.endingReached && (
                            <button type="button" onClick={() => { setOpenMenu(null); onReplayEpilogue(); }}>重看收工页面</button>
                          )}
                        </>
                      )}
                      {key === 'edit' && (
                        <>
                          <button type="button" disabled={!canDeleteSelected} onClick={() => { setOpenMenu(null); if (selectedMail) onDeleteMail(selectedMail.id); }}>删除这封邮件</button>
                          <button type="button" disabled={!canRecoverSelected} onClick={() => { setOpenMenu(null); if (selectedMail) onRecoverMail(selectedMail.id); }}>放回收件箱</button>
                          <button type="button" disabled={!canDeleteAnyRead} onClick={() => { setOpenMenu(null); onDeleteRead(); }}>清理已读邮件</button>
                        </>
                      )}
                      {key === 'view' && (
                        <>
                          <button type="button" onClick={() => { setOpenMenu(null); if (inboxMails[0]) onSelectMail(inboxMails[0].id); }}>跳到最新收件</button>
                          <button type="button" onClick={() => { setOpenMenu(null); if (trashMails[0]) onSelectMail(trashMails[0].id); }}>查看回收站</button>
                        </>
                      )}
                      {key === 'tools' && (
                        <>
                          <button type="button" onClick={() => { setOpenMenu(null); onToggleMusic(); }}>
                            {musicEnabled && !save.muted ? '关闭背景音乐' : '开启背景音乐'}
                          </button>
                          <button type="button" onClick={() => { setOpenMenu(null); onOpenSettings(); }}>声音、曲目与动画设置…</button>
                        </>
                      )}
                      {key === 'info' && (
                        <button type="button" onClick={() => {
                          setOpenMenu(null);
                          setInfoText(`已完成 ${save.clearedInstallers.length} / ${TOTAL_ORDERS} 单；当前余额 $${save.balance.toFixed(2)}。`);
                        }}>查看工单进度</button>
                      )}
                      {key === 'help' && (
                        <>
                          <button type="button" onClick={() => { setOpenMenu(null); onStartTour(); }}>互动新手指引</button>
                          <button type="button" onClick={() => { setOpenMenu(null); onOpenHelp(); }}>排查提示与说明</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[12px] text-[#334155] shrink-0">
            <span className="rounded-full bg-white border border-[#bac4d4] px-2.5 py-0.5 font-medium tabular-nums shadow-2xs">
              已过 {save.clearedInstallers.length} / {TOTAL_ORDERS} 单
            </span>
          </div>
        </header>

        {/* Windows 11 Command Bar */}
        <div className="shrink-0 mx-2 sm:mx-2.5 mt-2 mb-2 flex flex-wrap items-center gap-1 rounded-lg bg-white px-2 py-1 border border-[#cbd5e1] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <button
            type="button"
            className="toolbar-btn"
            disabled={!canDeleteSelected}
            onClick={() => selectedMail && onDeleteMail(selectedMail.id)}
          >
            <ToolbarIcon name="delete" />
            <span>删除</span>
          </button>
          <button
            type="button"
            className="toolbar-btn"
            disabled={!canRecoverSelected}
            onClick={() => selectedMail && onRecoverMail(selectedMail.id)}
          >
            <ToolbarIcon name="recover" />
            <span>恢复</span>
          </button>
          <div className="toolbar-sep" aria-hidden="true" />
          <button
            type="button"
            className="toolbar-btn"
            disabled={!canDeleteAnyRead}
            onClick={onDeleteRead}
          >
            <ToolbarIcon name="deleteRead" />
            <span>删除已读</span>
          </button>
          <div className="toolbar-sep hidden sm:block" aria-hidden="true" />
          <button type="button" className="toolbar-btn" onClick={onOpenSettings}>
            <ToolbarIcon name="settings" />
            <span>设置</span>
          </button>
          <button type="button" className="toolbar-btn" onClick={onOpenHelp} data-tour="guide-btn">
            <ToolbarIcon name="help" />
            <span>指南</span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={`toolbar-btn ${musicEnabled && !save.muted ? 'text-[#0067c0]' : ''}`}
              onClick={onToggleMusic}
              title={`当前曲目：${trackTitle}`}
              aria-pressed={musicEnabled && !save.muted}
            >
              <ToolbarIcon name={musicEnabled && !save.muted ? 'music' : 'musicOff'} />
              <span>{musicEnabled && !save.muted ? '音乐' : '已静音'}</span>
            </button>
            <div className="toolbar-sep" aria-hidden="true" />
            <button type="button" className="toolbar-btn" onClick={onPause}>
              <ToolbarIcon name="pause" />
              <span>暂停</span>
            </button>
          </div>
        </div>

        {/* Main Split Workspace */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-2.5 px-2 sm:px-2.5 pb-2.5">
          {/* Left Navigation Sidebar */}
          <aside
            data-tour="inbox-list"
            className="flex flex-col w-full md:w-[300px] lg:w-[330px] shrink-0 min-h-0 max-h-[38dvh] md:max-h-none rounded-lg bg-[#fcfdff] border border-[#cbd5e1] shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden"
            aria-label="文件夹与邮件列表"
          >
            <div className="px-3.5 py-2 text-[12px] font-semibold text-[#475569] bg-[#f1f5f9] border-b border-[#cbd5e1] flex items-center justify-between">
              <span>文件夹</span>
              <span className="text-[11px] font-normal text-[#64748b]">点红色邮件查看</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 text-[13px] space-y-1.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#f4f7fb] border border-[#d6dfe9] text-[12px] font-medium text-[#334155]">
                <TreeIcon name="user" />
                <span>night@tmail.com</span>
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-[#0f172a]">
                  <span className="flex items-center gap-2">
                    <TreeIcon name="inbox" />
                    <span>收件箱</span>
                  </span>
                  <span className="rounded-full bg-white border border-[#cbd5e1] px-2 py-0.5 text-[11px] font-medium text-[#475569] tabular-nums">
                    {inboxMails.length}
                  </span>
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {inboxMails.length === 0 ? (
                    <span className="text-[12px] text-[#64748b] px-3 py-1.5">收件箱为空</span>
                  ) : (
                    inboxMails.map(m => renderTreeMail(m.id))
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-[#e2e8f0]">
                <div className="flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-[#475569]">
                  <span className="flex items-center gap-2">
                    <TreeIcon name="trash" />
                    <span>回收站</span>
                  </span>
                  <span className="rounded-full bg-white border border-[#cbd5e1] px-2 py-0.5 text-[11px] font-medium text-[#64748b] tabular-nums">
                    {trashMails.length}
                  </span>
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {trashMails.length === 0 ? (
                    <span className="text-[12px] text-[#64748b] px-3 py-1.5">暂无已删邮件</span>
                  ) : (
                    trashMails.map(m => renderTreeMail(m.id))
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Right Fluent Document Reading Pane */}
          <section className="flex-1 min-h-0 rounded-lg bg-white border border-[#cbd5e1] overflow-y-auto select-text p-4 sm:p-7 shadow-[0_1px_3px_rgba(15,23,42,0.05)]" aria-label="邮件内容">
            {selectedMail ? (
              <article className="max-w-[70ch]">
                <header className="rounded-lg bg-[#f6f8fc] border border-[#cfd8e5] p-4 sm:p-5 mb-5 space-y-2.5">
                  <h2 className="m-0 text-[19px] sm:text-[21px] font-semibold text-[#0f172a] leading-snug">
                    {selectedMail.subject}
                  </h2>
                  <div className="flex items-start gap-3 pt-1">
                    <div
                      aria-hidden="true"
                      className="w-8 h-8 rounded-full bg-[#e4effc] border border-[#adc8eb] text-[#0067c0] font-semibold text-[13px] flex items-center justify-center shrink-0 mt-0.5"
                    >
                      {selectedMail.senderName.slice(0, 1)}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-1 text-[13px] text-[#475569]">
                      <div>
                        <span className="text-[#64748b]">发件人：</span>
                        <span className="font-medium text-[#0f172a]">{selectedMail.senderName}</span>{' '}
                        <span className="text-[#64748b]">&lt;{selectedMail.senderEmail}&gt;</span>
                      </div>
                      <div>
                        <span className="text-[#64748b]">收件人：</span>
                        <span className="text-[#1e293b]">{ACCOUNT_LABEL}</span>{' '}
                        <span className="text-[#64748b]">&lt;{selectedMail.toEmail}&gt;</span>
                      </div>
                    </div>
                  </div>
                </header>

                <div className="space-y-3.5 text-[15px] leading-[1.78] text-[#1e293b] px-0.5">
                  {selectedMail.body.map((para, index) => (
                    <p key={index} className="m-0">{para}</p>
                  ))}
                </div>

                {(selectedMail.attachment || selectedMail.money) && (
                  <div
                    data-tour="attachment-box"
                    className="mt-6 rounded-lg bg-[#f6f8fc] border border-[#cbd5e1] p-4 space-y-3"
                  >
                    <div className="text-[12px] font-semibold text-[#475569]">附件与收付款</div>
                    <div className="flex flex-wrap items-center gap-3">
                      {selectedMail.attachment && (
                        <button
                          type="button"
                          className="ui-btn px-4 py-2 text-[13.5px] hover:border-[#0067c0] hover:bg-[#eff6fc]"
                          onClick={() => onLaunchInstaller(selectedMail.attachment!.installerId)}
                        >
                          <InstallerExeIcon className="w-5 h-5 shrink-0" />
                          <span className="font-mono text-[13px] font-semibold text-[#0f172a]">
                            {selectedMail.attachment.fileName}
                          </span>
                          <span className="text-[12px] font-semibold text-[#0067c0] ml-1">运行</span>
                        </button>
                      )}

                      {selectedMail.money && (() => {
                        const claimed = save.claimedMails.includes(selectedMail.id);
                        const isBill = selectedMail.money.kind === 'bill';
                        const cantAfford = isBill && !claimed && save.balance < selectedMail.money.amount;
                        const label = claimed
                          ? isBill ? '已结清' : '已领取'
                          : isBill
                            ? cantAfford ? '余额不足' : '立即支付'
                            : '点击领取';

                        return (
                          <button
                            type="button"
                            disabled={claimed || cantAfford}
                            className={`ui-btn px-4 py-2 text-[13.5px] ${
                              !claimed && !cantAfford
                                ? isBill
                                  ? 'ui-btn-primary'
                                  : 'border-[#57a757] bg-[#f1fbf1] text-[#0f7b0f] hover:bg-[#dff6dd]'
                                : ''
                            }`}
                            onClick={() => onClaimMoney(selectedMail.id)}
                          >
                            <MoneyIcon className="w-5 h-5 shrink-0" />
                            <span className="tabular-nums font-semibold">
                              ${selectedMail.money.amount.toFixed(2)} ({label})
                            </span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {infoText && (
                  <div className="mt-5 p-3 rounded-md bg-[#eff6fc] border border-[#8fbce6] text-[13px] text-[#004578] flex items-center justify-between gap-3">
                    <span>{infoText}</span>
                    <button type="button" className="ui-btn px-2.5 py-1 text-[12px]" onClick={() => setInfoText(null)}>关闭</button>
                  </div>
                )}
              </article>
            ) : (
              <div className="h-full flex items-center justify-center text-center py-10">
                <div className="max-w-[320px] rounded-xl border border-dashed border-[#bec9d8] bg-[#f8fafd] px-6 py-8 space-y-2.5">
                  <MiniEnvelopeIcon className="w-8 h-6 mx-auto opacity-75" />
                  <p className="m-0 text-[13.5px] text-[#475569]">在左侧收件箱选一封邮件，点开就能看详情或运行附件。</p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Windows 11 Style Status Strip */}
        <footer
          data-tour="status-strip"
          className="shrink-0 flex items-center justify-between gap-3 px-3.5 py-2 bg-[#ebf0f7] border-t border-[#cbd5e1] text-[12px] text-[#475569]"
        >
          <div className="flex items-center gap-3 min-w-0 truncate">
            <span>收件箱 {inboxMails.length} 封 · 已完成 {save.clearedInstallers.length} / {TOTAL_ORDERS}</span>
            {musicEnabled && !save.muted && (
              <span className="hidden md:inline-flex items-center gap-1 rounded bg-white/80 border border-[#cbd5e1] px-2 py-0.5 text-[11px] text-[#334155]">
                ♪ {trackTitle}
              </span>
            )}
          </div>
          <div
            className="shrink-0 rounded-md bg-white border border-[#aeb9ca] px-2.5 py-0.5 font-semibold text-[#0f172a] tabular-nums shadow-[0_1px_1px_rgba(15,23,42,0.04)]"
            data-testid="balance"
            data-tour="balance-chip"
          >
            余额: ${displayBalance.toFixed(2)}
          </div>
        </footer>
      </div>
    </div>
  );
}
