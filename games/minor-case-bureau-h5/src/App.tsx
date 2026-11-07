import { useEffect, useMemo, useRef, useState } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { connectYouxiPlatform, type YouxiIdentity, type YouxiPlatformHandle } from '@shared/platform';
import wallpaper from './assets/wallpaper.png';
import { BUREAU_TRACKS, BureauAudio } from './audio.ts';
import { BrowserPanel, normalizeAddress } from './BrowserPanel.tsx';
import { buildCases } from './content.ts';
import { quoteIdentifier, saveResultAsTable, type QueryResult } from './database.ts';
import { EvidenceCard } from './EvidenceCard.tsx';
import { manualChapters } from './manual.ts';
import { QueryClient } from './query-client.ts';
import { SqlEditor } from './SqlEditor.tsx';
import {
  initialWindows,
  loadGame,
  newCaseProgress,
  newGame,
  parseSave,
  persistGame,
  recoverGame,
  SAVE_KEY,
  type AppName,
  type CaseProgress,
  type GameSave,
  type WindowState,
} from './storage.ts';
import type { CaseDefinition, DataTable, SqlValue } from './types.ts';
import { appInfo, Cat, DataGrid, DeskWindow, EvidenceArt, PixelIcon } from './visuals.tsx';

type DialogSpec = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
};

type BureauDebugState = {
  ready: boolean;
  running: boolean;
  started: boolean;
  paused: string[];
  elapsed: number;
  caseId: number;
  seed: number;
  acquired: string[];
  savedTables: string[];
  records: GameSave['records'];
  audioMuted: boolean;
};

declare global {
  var __minorBureau: { getState: () => BureauDebugState } | undefined;
}

const DESKTOP_APPS: AppName[] = ['messages', 'clues', 'query', 'browser', 'notepad', 'manual', 'music', 'settings'];
const BRIEFING_AUDIO = import.meta.glob<string>('./assets/briefings/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});
const NOTE_COLORS = [
  { color: '#f1e2ad', label: '琥珀便笺' },
  { color: '#d7e3c8', label: '苔绿便笺' },
  { color: '#e5d8cf', label: '浅褐便笺' },
];

function ensureCaseProgress(save: GameSave, cases: CaseDefinition[]): GameSave {
  let changed = false;
  const nextProgress = { ...save.progress };
  for (const level of cases) {
    const key = String(level.id);
    if (!nextProgress[key]) {
      nextProgress[key] = newCaseProgress(level);
      changed = true;
    }
  }
  return changed ? { ...save, progress: nextProgress } : save;
}

function clampWindowsToViewport(windows: WindowState[], width: number, height: number): WindowState[] {
  const safeW = Math.max(480, width);
  const safeH = Math.max(420, height);
  return windows.map(w => {
    const minW = w.id === 'assistant' ? 208 : 300;
    const maxW = Math.max(minW, safeW - 16);
    const maxH = Math.max(180, safeH - 94);
    const nextW = Math.max(minW, Math.min(w.w, maxW));
    const nextH = Math.min(w.h, maxH);
    const nextX = Math.max(4, Math.min(safeW - Math.min(nextW, 140), w.x));
    const nextY = Math.max(38, Math.min(safeH - 88, w.y));
    return nextW === w.w && nextH === w.h && nextX === w.x && nextY === w.y
      ? w
      : { ...w, x: nextX, y: nextY, w: nextW, h: nextH };
  });
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hrs > 0
    ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function App() {
  const initialLoad = useMemo(() => {
    const loaded = loadGame();
    const hasExisting = loaded.save !== null;
    const baseSave = loaded.save ?? newGame(window.innerWidth, window.innerHeight);
    const clampedSave = {
      ...baseSave,
      windows: clampWindowsToViewport(baseSave.windows, window.innerWidth, window.innerHeight),
    };
    const cases = buildCases(clampedSave.seed);
    return {
      save: ensureCaseProgress(clampedSave, cases),
      revision: loaded.revision,
      warning: loaded.warning ?? null,
      started: hasExisting,
    };
  }, []);

  const [save, setSave] = useState<GameSave>(initialLoad.save);
  const [started, setStarted] = useState<boolean>(initialLoad.started);
  const [saveWarning, setSaveWarning] = useState<string | null>(initialLoad.warning);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(initialLoad.warning);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [identity, setIdentity] = useState<YouxiIdentity | null>(null);
  const [ready, setReady] = useState(false);

  const [manualPaused, setManualPaused] = useState(false);
  const [platformSidebar, setPlatformSidebar] = useState(false);
  const [platformBoss, setPlatformBoss] = useState(false);
  const [docHidden, setDocHidden] = useState(() => document.hidden);
  const [winBlurred, setWinBlurred] = useState(false);
  const [tempMuted, setTempMuted] = useState(false);
  const pauseFlagsRef = useRef({
    ready: false,
    started: initialLoad.started,
    manual: false,
    sidebar: false,
    boss: false,
    hidden: document.hidden,
    blur: false,
  });
  pauseFlagsRef.current.ready = ready;
  pauseFlagsRef.current.started = started;
  pauseFlagsRef.current.manual = manualPaused;
  pauseFlagsRef.current.sidebar = platformSidebar;
  pauseFlagsRef.current.boss = platformBoss;
  pauseFlagsRef.current.hidden = docHidden;
  pauseFlagsRef.current.blur = winBlurred;
  const computeRunningNow = () => {
    const f = pauseFlagsRef.current;
    return f.ready && f.started && !f.manual && !f.sidebar && !f.boss && !f.hidden && !f.blur;
  };

  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  );
  const [displayElapsed, setDisplayElapsed] = useState(initialLoad.save.elapsed);
  const [catPose, setCatPose] = useState(0);
  const [hintMode, setHintMode] = useState<'case' | 'sql'>('case');
  const [activeHintIdx, setActiveHintIdx] = useState(0);
  const [activeSqlHintIdx, setActiveSqlHintIdx] = useState(0);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [zoomedClue, setZoomedClue] = useState(false);
  const [clipboardBuffer, setClipboardBuffer] = useState('');

  const [queryRunning, setQueryRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | undefined>(undefined);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [saveTableName, setSaveTableName] = useState('');

  const [selectedTableName, setSelectedTableName] = useState<string>('');
  const [renameTableDraft, setRenameTableDraft] = useState('');
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [tableViewMode, setTableViewMode] = useState<'rows' | 'schema'>('rows');
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const autoTourDoneRef = useRef(false);
  const [manualChapterIdx, setManualChapterIdx] = useState(0);
  const [suspectInput, setSuspectInput] = useState('');
  const [lastVerdict, setLastVerdict] = useState<{ caseId: number; name: string; correct: boolean; suspect: SqlValue } | null>(null);
  const [solvedCelebration, setSolvedCelebration] = useState<{
    caseId: number;
    caseTitle: string;
    name: string;
    suspect: SqlValue;
  } | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(true);
  const [maximizedMap, setMaximizedMap] = useState<Partial<Record<AppName, WindowState>>>({});

  const revisionRef = useRef<number>(initialLoad.revision);
  const saveRef = useRef<GameSave>(save);
  saveRef.current = save;
  const elapsedRef = useRef<number>(initialLoad.save.elapsed);
  const lastElapsedSyncRef = useRef<number>(initialLoad.save.elapsed);
  const audioRef = useRef<BureauAudio | null>(null);
  if (!audioRef.current) audioRef.current = new BureauAudio();
  const queryClientRef = useRef<QueryClient | null>(null);
  if (!queryClientRef.current) queryClientRef.current = new QueryClient();
  const queryRunTokenRef = useRef(0);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const platformRef = useRef<YouxiPlatformHandle | null>(null);

  const cases = useMemo(() => buildCases(save.seed), [save.seed]);
  const level = useMemo(
    () => cases.find(c => c.id === save.caseId) ?? cases[0],
    [cases, save.caseId],
  );
  const progress: CaseProgress = useMemo(
    () => save.progress[String(level.id)] ?? newCaseProgress(level),
    [save.progress, level],
  );

  const acquiredTables: DataTable[] = useMemo(() => {
    const base = level.tables.filter(t => progress.acquired.includes(t.name));
    return [...base, ...progress.savedTables];
  }, [level.tables, progress.acquired, progress.savedTables]);

  const activeTab = useMemo(
    () => progress.tabs.find(t => t.id === progress.activeTab) ?? progress.tabs[0],
    [progress.tabs, progress.activeTab],
  );

  const pauseReasons = useMemo(() => {
    const list: string[] = [];
    if (manualPaused) list.push('manual');
    if (platformSidebar) list.push('sidebar');
    if (platformBoss) list.push('boss');
    if (docHidden) list.push('hidden');
    if (winBlurred) list.push('blur');
    return list;
  }, [manualPaused, platformSidebar, platformBoss, docHidden, winBlurred]);

  const isPaused = pauseReasons.length > 0;
  const isRunning = ready && started && !isPaused;
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  const notify = (msg: string) => {
    setToast(msg);
  };

  const unlockAudio = () => {
    audioRef.current?.unlock();
  };

  const patchCase = (caseId: number, patch: Partial<CaseProgress>) => {
    setSave(prev => {
      const targetLevel = cases.find(c => c.id === caseId) ?? level;
      const current = prev.progress[String(caseId)] ?? newCaseProgress(targetLevel);
      return {
        ...prev,
        progress: {
          ...prev.progress,
          [String(caseId)]: { ...current, ...patch },
        },
      };
    });
  };

  const patchCurrentCase = (patch: Partial<CaseProgress>) => {
    patchCase(level.id, patch);
  };

  const focusWindow = (id: AppName, forceOpen = true) => {
    unlockAudio();
    audioRef.current?.click();
    setSave(prev => {
      const maxZ = prev.windows.reduce((m, w) => Math.max(m, w.z), 1);
      return {
        ...prev,
        windows: prev.windows.map(w =>
          w.id === id
            ? { ...w, open: forceOpen ? true : w.open, minimized: false, z: maxZ + 1 }
            : w,
        ),
      };
    });
  };

  const closeWindow = (id: AppName) => {
    unlockAudio();
    audioRef.current?.click();
    setSave(prev => ({
      ...prev,
      windows: prev.windows.map(w => (w.id === id ? { ...w, open: false, minimized: false } : w)),
    }));
  };

  const minimizeWindow = (id: AppName) => {
    unlockAudio();
    audioRef.current?.click();
    setSave(prev => ({
      ...prev,
      windows: prev.windows.map(w => (w.id === id ? { ...w, minimized: true } : w)),
    }));
  };

  const toggleMaximizeWindow = (id: AppName) => {
    unlockAudio();
    setSave(prev => {
      const target = prev.windows.find(w => w.id === id);
      if (!target) return prev;
      const maxZ = prev.windows.reduce((m, w) => Math.max(m, w.z), 1);
      const savedGeom = maximizedMap[id];
      const maxW = Math.max(320, window.innerWidth - 110);
      const maxH = Math.max(240, window.innerHeight - 96);
      const isCurrentlyMax = Math.abs(target.w - maxW) < 24 && Math.abs(target.h - maxH) < 24;
      if (isCurrentlyMax && savedGeom) {
        setMaximizedMap(m => {
          const copy = { ...m };
          delete copy[id];
          return copy;
        });
        return {
          ...prev,
          windows: prev.windows.map(w =>
            w.id === id ? { ...w, x: savedGeom.x, y: savedGeom.y, w: savedGeom.w, h: savedGeom.h, z: maxZ + 1 } : w,
          ),
        };
      }
      setMaximizedMap(m => ({ ...m, [id]: target }));
      return {
        ...prev,
        windows: prev.windows.map(w =>
          w.id === id ? { ...w, x: 98, y: 42, w: maxW, h: maxH, open: true, minimized: false, z: maxZ + 1 } : w,
        ),
      };
    });
  };

  const updateWindowGeometry = (id: AppName, rect: Partial<WindowState>) => {
    setSave(prev => ({
      ...prev,
      windows: prev.windows.map(w => (w.id === id ? { ...w, ...rect } : w)),
    }));
  };

  const toggleTaskbarWindow = (id: AppName) => {
    unlockAudio();
    audioRef.current?.click();
    const target = save.windows.find(w => w.id === id);
    if (!target || !target.open || target.minimized) {
      focusWindow(id, true);
      return;
    }
    const openWins = save.windows.filter(w => w.open && !w.minimized);
    const topWin = openWins.reduce((top, w) => (w.z > top.z ? w : top), target);
    if (topWin.id === id) {
      minimizeWindow(id);
    } else {
      focusWindow(id, true);
    }
  };

  // Dialog management
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (dialog) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [dialog]);

  // Platform & visibility integration
  useEffect(() => {
    const onVisibility = () => {
      pauseFlagsRef.current.hidden = document.hidden;
      setDocHidden(document.hidden);
    };
    const onBlur = () => {
      pauseFlagsRef.current.blur = true;
      setWinBlurred(true);
    };
    const onFocus = () => {
      pauseFlagsRef.current.blur = false;
      setWinBlurred(false);
    };
    const onResize = () => {
      setSave(prev => ({
        ...prev,
        windows: clampWindowsToViewport(prev.windows, window.innerWidth, window.innerHeight),
      }));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        if (dialogRef.current?.open) return;
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.closest('.monaco-editor')) return;
        setManualPaused(p => {
          const next = !p;
          pauseFlagsRef.current.manual = next;
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);

    const handle = connectYouxiPlatform({
      onIdentity: id => setIdentity(id),
      onState: state => {
        pauseFlagsRef.current.sidebar = !!state.sidebar;
        pauseFlagsRef.current.boss = !!state.boss;
        setPlatformSidebar(!!state.sidebar);
        setPlatformBoss(!!state.boss);
        audioRef.current?.setPaused(!computeRunningNow());
      },
      setTemporaryMuted: muted => {
        setTempMuted(muted);
        return audioRef.current?.setTemporaryMuted(muted) ?? true;
      },
      isRunning: () => computeRunningNow(),
    });
    platformRef.current = handle;
    pauseFlagsRef.current.ready = true;
    setReady(true);
    handle?.ready();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      handle?.destroy();
      queryClientRef.current?.cancel();
      audioRef.current?.destroy();
    };
  }, []);

  // Sync audio settings & pause state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.track = trackIndex;
    audio.playing = musicPlaying;
    audio.update({
      master: save.settings.master,
      music: save.settings.music,
      effects: save.settings.effects,
      muted: save.settings.muted,
    });
    audio.setPaused(!started || isPaused);
  }, [save.settings, started, isPaused, trackIndex, musicPlaying]);

  // Cancel running query when paused, switching case, or switching query tab
  useEffect(() => {
    if (isPaused && queryRunning) {
      queryRunTokenRef.current++;
      queryClientRef.current?.cancel();
      setQueryRunning(false);
    }
  }, [isPaused, queryRunning]);

  useEffect(() => {
    audioRef.current?.stopBriefing();
    queryRunTokenRef.current++;
    queryClientRef.current?.cancel();
    setQueryRunning(false);
    setQueryError(undefined);
    setQueryResult(null);
    setZoomedClue(false);
    setLastVerdict(null);
    setSolvedCelebration(null);
    setSuspectInput('');
    setActiveHintIdx(Math.max(0, progress.hints - 1));
    setActiveSqlHintIdx(Math.max(0, progress.sqlHints - 1));
    const firstTable = acquiredTables[0]?.name ?? '';
    setSelectedTableName(firstTable);
    setRenameTableDraft(firstTable);
  }, [level.id]);

  useEffect(() => {
    if (!acquiredTables.some(t => t.name === selectedTableName)) {
      const fallback = acquiredTables[0]?.name ?? '';
      setSelectedTableName(fallback);
      setRenameTableDraft(fallback);
    }
  }, [acquiredTables, selectedTableName]);

  // Runtime elapsed timer (100ms tick while running, persisted every 15s)
  useEffect(() => {
    const timer = setInterval(() => {
      setClockText(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      if (!isRunningRef.current) return;
      elapsedRef.current = Number((elapsedRef.current + 0.1).toFixed(1));
      setDisplayElapsed(elapsedRef.current);
      if (elapsedRef.current - lastElapsedSyncRef.current >= 15) {
        lastElapsedSyncRef.current = elapsedRef.current;
        setSave(prev => ({ ...prev, elapsed: Math.round(elapsedRef.current) }));
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Cat pose animation
  useEffect(() => {
    if (!isRunning || save.settings.reducedMotion) return;
    const timer = setInterval(() => {
      setCatPose(p => (p + 1) % 4);
    }, 2400);
    return () => clearInterval(timer);
  }, [isRunning, save.settings.reducedMotion]);

  // Debounced auto-save (450ms)
  useEffect(() => {
    if (saveError || saveWarning) return;
    const timer = setTimeout(() => {
      try {
        const snapshot: GameSave = { ...saveRef.current, elapsed: Math.round(elapsedRef.current) };
        revisionRef.current = persistGame(snapshot, revisionRef.current);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSaveError(message);
        notify(message);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [save, saveError, saveWarning]);

  // Expose read-only debug observer
  useEffect(() => {
    globalThis.__minorBureau = {
      getState: () => ({
        ready,
        running: isRunning,
        started,
        paused: pauseReasons,
        elapsed: elapsedRef.current,
        caseId: save.caseId,
        seed: save.seed,
        acquired: [...progress.acquired],
        savedTables: progress.savedTables.map(t => t.name),
        records: [...save.records],
        audioMuted: save.settings.muted || tempMuted || !started || isPaused,
      }),
    };
    return () => {
      delete globalThis.__minorBureau;
    };
  }, [ready, isRunning, started, pauseReasons, save.caseId, save.seed, progress.acquired, progress.savedTables, save.records, save.settings.muted, tempMuted, isPaused]);

  const copyText = async (text: string, label = '内容') => {
    setClipboardBuffer(text);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        notify(`已复制${label}，也可在查询窗口或记事本点击“追加复制值”插入末尾。`);
        return;
      }
    } catch {
      // Fallback to in-game clipboard buffer
    }
    notify(`已暂存${label}到局内剪贴板，可在查询窗口或记事本点击“追加复制值”插入末尾。`);
  };

  const updateActiveSql = (sql: string) => {
    if (!activeTab) return;
    patchCurrentCase({
      tabs: progress.tabs.map(t => (t.id === activeTab.id ? { ...t, sql } : t)),
    });
  };

  const addQueryTab = (initialSql = '') => {
    const nextId = progress.tabs.reduce((m, t) => Math.max(m, t.id), 0) + 1;
    const sql = initialSql || `SELECT *\nFROM ${acquiredTables[0]?.name ?? 'suspects'};`;
    patchCurrentCase({
      tabs: [...progress.tabs, { id: nextId, title: `查询 ${nextId}`, sql }],
      activeTab: nextId,
    });
    setQueryError(undefined);
  };

  const closeQueryTab = (tabId: number) => {
    const target = progress.tabs.find(t => t.id === tabId);
    if (!target || progress.tabs.length <= 1) return;
    const trimmed = target.sql.trim();
    const nextHistory = trimmed
      ? [trimmed, ...progress.history.filter(h => h !== trimmed)].slice(0, 30)
      : progress.history;
    const remaining = progress.tabs.filter(t => t.id !== tabId);
    const nextActive = progress.activeTab === tabId ? remaining[0].id : progress.activeTab;
    patchCurrentCase({
      tabs: remaining,
      activeTab: nextActive,
      history: nextHistory,
    });
  };

  const executeQuery = async () => {
    if (!activeTab || isPaused) return;
    unlockAudio();
    const sql = activeTab.sql;
    const trimmed = sql.trim();
    if (!trimmed) {
      setQueryError('请先输入一条 SQL 查询语句。');
      return;
    }
    const token = ++queryRunTokenRef.current;
    setQueryRunning(true);
    setQueryError(undefined);
    try {
      const res = await queryClientRef.current!.run(acquiredTables, sql);
      if (token !== queryRunTokenRef.current) return;
      setQueryResult(res);
      setQueryRunning(false);
      const nextHistory = [trimmed, ...progress.history.filter(h => h !== trimmed)].slice(0, 30);
      patchCurrentCase({ history: nextHistory });
      audioRef.current?.click();
    } catch (err) {
      if (token !== queryRunTokenRef.current) return;
      setQueryRunning(false);
      setQueryError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancelQuery = () => {
    queryRunTokenRef.current++;
    queryClientRef.current?.cancel();
    setQueryRunning(false);
    setQueryError('查询已停止。输入内容仍然保留。');
  };

  const handleSaveResultTable = () => {
    if (!queryResult) {
      notify('请先执行一条查询并取得结果，再保存为新表。');
      return;
    }
    try {
      const created = saveResultAsTable(saveTableName, queryResult, [...level.tables, ...progress.savedTables]);
      patchCurrentCase({ savedTables: [...progress.savedTables, created] });
      setSaveTableName('');
      setSelectedTableName(created.name);
      setRenameTableDraft(created.name);
      notify(`已将查询结果保存为数据表 ${created.name}，现在可以在后续查询和补全中直接引用。`);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenameSavedTable = (oldName: string) => {
    const trimmed = renameTableDraft.trim();
    if (trimmed === oldName) {
      notify('新表名与原表名相同。');
      return;
    }
    if (!/^[\p{L}_][\p{L}\p{N}_]{0,39}$/u.test(trimmed)) {
      notify('表名请使用字母、汉字、数字或下划线，以字母、汉字或下划线开头，最多 40 个字符。');
      return;
    }
    const others = [...level.tables, ...progress.savedTables.filter(t => t.name !== oldName)];
    if (others.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      notify('这个表名已经在使用，请换一个名字。');
      return;
    }
    patchCurrentCase({
      savedTables: progress.savedTables.map(t =>
        t.name === oldName ? { ...t, name: trimmed, label: trimmed } : t,
      ),
    });
    setSelectedTableName(trimmed);
    notify(`已将结果表 ${oldName} 重命名为 ${trimmed}。`);
  };

  const handleDeleteSavedTable = (tableName: string) => {
    setDialog({
      title: '删除保存的结果表',
      body: `确认删除你保存的结果表“${tableName}”吗？原始案卷数据表不会受影响，但依赖该表的后续查询将需要重新保存。`,
      confirmLabel: '确认删除',
      onConfirm: () => {
        patchCurrentCase({
          savedTables: progress.savedTables.filter(t => t.name !== tableName),
        });
        setDialog(null);
        notify(`已删除结果表 ${tableName}。`);
      },
    });
  };

  const handleSelectRowForSubmit = (row: SqlValue[], columns: string[]) => {
    const lowerCols = columns.map(c => c.toLowerCase());
    const idIdx =
      lowerCols.indexOf(level.idColumn.toLowerCase()) >= 0
        ? lowerCols.indexOf(level.idColumn.toLowerCase())
        : lowerCols.findIndex(c => c === 'id' || c.endsWith('_id'));
    const candidate = idIdx >= 0 ? row[idIdx] : row[0];
    if (candidate === null || candidate === undefined) {
      notify('所选行没有可用的人物标识。');
      return;
    }
    setSuspectInput(String(candidate));
    focusWindow('submit', true);
    notify(`已将候选标识 ${String(candidate)} 带入提交调查窗口。`);
  };

  const handleNavigateWeb = (target: string) => {
    const clean = target === '内网主页' ? '内网主页' : normalizeAddress(target);
    const trimmedHistory = progress.webHistory.slice(0, progress.webIndex + 1);
    const nextHistory = trimmedHistory[trimmedHistory.length - 1] === clean ? trimmedHistory : [...trimmedHistory, clean];
    patchCurrentCase({
      webHistory: nextHistory,
      webIndex: nextHistory.length - 1,
    });
    focusWindow('browser', true);
  };

  const handleDownloadTable = (tableName: string) => {
    const exists = level.tables.find(t => t.name === tableName);
    if (!exists) {
      notify(`未找到数据表 ${tableName}。`);
      return;
    }
    if (progress.acquired.includes(tableName)) {
      notify(`数据表 ${exists.label}（${tableName}）已在工作台中。`);
      return;
    }
    patchCurrentCase({ acquired: [...progress.acquired, tableName] });
    audioRef.current?.success();
    notify(`已下载数据表《${exists.label}》（${tableName}），查询补全和数据表工具已同步更新。`);
  };

  const suspectRoster = useMemo(() => {
    if (!progress.acquired.includes(level.suspectTable)) return [];
    const tbl = level.tables.find(t => t.name === level.suspectTable);
    if (!tbl) return [];
    const idIdx = tbl.columns.findIndex(c => c.name === level.idColumn);
    const nameIdx = tbl.columns.findIndex(c => c.name === level.nameColumn);
    if (idIdx < 0) return [];
    return tbl.rows.map(r => ({
      id: r[idIdx],
      name: nameIdx >= 0 ? String(r[nameIdx] ?? '') : String(r[idIdx] ?? ''),
    }));
  }, [progress.acquired, level]);

  const submitSuspectVerdict = () => {
    const raw = suspectInput.trim();
    if (!raw) {
      notify('请先填写或选择要提交的人物编号。');
      return;
    }
    const tbl = level.tables.find(t => t.name === level.suspectTable);
    const idIdx = tbl?.columns.findIndex(c => c.name === level.idColumn) ?? -1;
    const nameIdx = tbl?.columns.findIndex(c => c.name === level.nameColumn) ?? -1;
    const matchedRow = tbl?.rows.find(r => String(r[idIdx]) === raw || (nameIdx >= 0 && String(r[nameIdx]) === raw));
    if (!matchedRow || idIdx < 0) {
      notify(`在当前嫌疑名单（${level.suspectTable}）中找不到编号或姓名为“${raw}”的对象。请核对唯一编号。`);
      return;
    }
    const suspectId = matchedRow[idIdx];
    const suspectName = nameIdx >= 0 ? String(matchedRow[nameIdx] ?? suspectId) : String(suspectId);
    const alreadySame = save.records.some(r => r.caseId === level.id && String(r.suspect) === String(suspectId));
    if (alreadySame) {
      notify(`本案已提交过对 ${suspectName}（${String(suspectId)}）的调查结论，无需重复归档同一人选。`);
      return;
    }
    setDialog({
      title: '确认提交调查结论',
      body: `你将把 ${suspectName}（编号：${String(suspectId)}）作为《${level.title}》的调查对象提交归档。\n提交后结果会记入局内档案；若证据链有出入，你仍可留在本案继续复核。确认提交吗？`,
      confirmLabel: '确认提交',
      onConfirm: () => {
        const correct = String(suspectId) === String(level.culpritId);
        const entry = {
          caseId: level.id,
          suspect: suspectId,
          name: suspectName,
          correct,
          at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        setSave(prev => ({
          ...prev,
          unlocked: correct ? Math.min(10, Math.max(prev.unlocked, level.id + 1)) : prev.unlocked,
          records: [entry, ...prev.records],
        }));
        setLastVerdict({ caseId: level.id, name: suspectName, correct, suspect: suspectId });
        setDialog(null);
        if (correct) {
          audioRef.current?.success();
          setSolvedCelebration({
            caseId: level.id,
            caseTitle: level.title,
            name: suspectName,
            suspect: suspectId,
          });
          notify(`核验通过：${suspectName}（${String(suspectId)}）与全部证据吻合，下一案卷已开放。`);
        } else {
          audioRef.current?.click();
          notify(`复核提醒：${suspectName}（${String(suspectId)}）与部分关键证据不符，请留在案卷中核对遗漏条件。`);
        }
      },
    });
  };

  const switchCase = (targetCaseId: number) => {
    if (targetCaseId < 1 || targetCaseId > save.unlocked) return;
    unlockAudio();
    driverRef.current?.destroy();
    setSolvedCelebration(null);
    setSave(prev => {
      const defaults = initialWindows(window.innerWidth, window.innerHeight);
      const keepOpen: AppName[] = ['clues', 'query', 'assistant'];
      return {
        ...prev,
        caseId: targetCaseId,
        windows: prev.windows.map((w, idx) => {
          const def = defaults.find(d => d.id === w.id) ?? w;
          const open = keepOpen.includes(w.id);
          return {
            ...w,
            x: def.x,
            y: def.y,
            w: def.w,
            h: def.h,
            open,
            minimized: false,
            z: open ? 10 + keepOpen.indexOf(w.id) : idx + 1,
          };
        }),
      };
    });
    notify(`已切换到第 ${String(targetCaseId).padStart(2, '0')} 案《${cases[targetCaseId - 1]?.title ?? ''}》。`);
  };

  const publishFinaleReport = () => {
    const finale = level.finale;
    if (!finale) return;
    const headlineIdx = Number(progress.drafts['finale:headline'] ?? '0');
    const bodyText = (progress.drafts['finale:body'] ?? '').trim();
    const answers = finale.questions.map(q => ({
      ...q,
      input: (progress.drafts[`finale:q:${q.id}`] ?? '').trim(),
    }));
    if (answers.some(a => !a.input) || !bodyText) {
      notify('请先选定标题、填齐三项核实结论，并撰写报道正文后再提交发布。');
      return;
    }
    setDialog({
      title: '确认发布最后一份报道',
      body: `标题：《${finale.headlines[headlineIdx] ?? finale.headlines[0]}》\n发布后将根据标题、三项核实数据以及正文中的事实依据触发结局。确认立即发稿吗？`,
      confirmLabel: '确认发稿',
      onConfirm: () => {
        const normalize = (s: string) => s.replaceAll(/\s+/g, '').toLocaleLowerCase();
        const headlineOk = headlineIdx === finale.correctHeadline;
        const questionsOk = answers.every(a => normalize(a.input) === normalize(a.answer));
        const bodyNorm = normalize(bodyText);
        const bodyHasFacts = answers.every(a => bodyNorm.includes(normalize(a.answer)));
        const isGood = headlineOk && questionsOk && bodyHasFacts;
        const ending: 'good' | 'bad' = isGood ? 'good' : 'bad';
        const entry = {
          caseId: level.id,
          suspect: answers.map(a => a.input).join(' / '),
          name: finale.headlines[headlineIdx] ?? '终章报道',
          correct: isGood,
          at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        setSave(prev => ({
          ...prev,
          ending,
          records: [entry, ...prev.records],
        }));
        setDialog(null);
        if (isGood) audioRef.current?.success();
        else audioRef.current?.click();
      },
    });
  };

  const exportSaveFile = () => {
    const snapshot: GameSave = { ...saveRef.current, elapsed: Math.round(elapsedRef.current) };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minor-case-bureau-save-${snapshot.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('已导出当前调查存档文件。');
  };

  const handleImportSaveFile = async (file: File) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as { data?: unknown };
      const parsed = parseSave(raw && typeof raw === 'object' && 'data' in raw && raw.data ? raw.data : raw);
      setDialog({
        title: '确认导入调查存档',
        body: `该存档位于第 ${parsed.caseId} 案（已解锁 ${parsed.unlocked} 案，累计用时 ${formatDuration(parsed.elapsed)}）。\n确认导入并替换当前进度吗？原存档会保留在本地备份中。`,
        confirmLabel: '确认导入',
        onConfirm: () => {
          const rebuilt = ensureCaseProgress(parsed, buildCases(parsed.seed));
          revisionRef.current = recoverGame(rebuilt);
          elapsedRef.current = rebuilt.elapsed;
          lastElapsedSyncRef.current = rebuilt.elapsed;
          setDisplayElapsed(rebuilt.elapsed);
          setSave(rebuilt);
          setStarted(true);
          setSaveError(null);
          setSaveWarning(null);
          setDialog(null);
          notify('存档导入成功，调查进度已恢复。');
        },
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : '存档文件格式无效，当前进度未改动。');
    }
  };

  const handleReloadLatestSave = () => {
    const latest = loadGame();
    if (!latest.save) {
      notify(latest.warning ?? '没有找到可读取的最新存档。');
      return;
    }
    const rebuilt = ensureCaseProgress(latest.save, buildCases(latest.save.seed));
    revisionRef.current = latest.revision;
    elapsedRef.current = rebuilt.elapsed;
    lastElapsedSyncRef.current = rebuilt.elapsed;
    setDisplayElapsed(rebuilt.elapsed);
    setSave(rebuilt);
    setSaveError(null);
    setSaveWarning(latest.warning ?? null);
    notify('已载入最新保存的调查进度。');
  };

  const handleConfirmRecoverSave = () => {
    const snapshot: GameSave = { ...saveRef.current, elapsed: Math.round(elapsedRef.current) };
    revisionRef.current = recoverGame(snapshot);
    setSaveError(null);
    setSaveWarning(null);
    notify('已将当前进度写入主存档，原异常数据已另存为 :damaged 备份。');
  };

  const handleStartNewGame = () => {
    setDialog({
      title: '开启新调查',
      body: '开启新调查会生成全新的随机种子与十案数据，并从第一案重新开始。当前存档将保留在备份键中。确认开启新调查吗？',
      confirmLabel: '开启新调查',
      onConfirm: () => {
        const fresh = newGame(window.innerWidth, window.innerHeight);
        const rebuilt = ensureCaseProgress(fresh, buildCases(fresh.seed));
        revisionRef.current = recoverGame(rebuilt);
        elapsedRef.current = 0;
        lastElapsedSyncRef.current = 0;
        setDisplayElapsed(0);
        setSave(rebuilt);
        setStarted(true);
        setSaveError(null);
        setSaveWarning(null);
        setDialog(null);
        notify('新调查已开启，案卷数据已按新种子生成。');
      },
    });
  };

  const unlockedManualCount = Math.min(manualChapters.length, Math.max(2, save.unlocked));
  const safeManualIdx = Math.min(manualChapterIdx, unlockedManualCount - 1);
  const currentManual = manualChapters[safeManualIdx] ?? manualChapters[0];
  const currentClue = level.clues[progress.clue] ?? level.clues[0];
  const inspectTable = acquiredTables.find(t => t.name === selectedTableName) ?? acquiredTables[0];
  const inspectTableResult: QueryResult | null = useMemo(() => {
    if (!inspectTable) return null;
    return {
      columns: inspectTable.columns.map(c => c.name),
      values: inspectTable.rows,
      truncated: false,
      duration: 0,
    };
  }, [inspectTable]);

  const topOpenWindowId = useMemo(() => {
    const open = save.windows.filter(w => w.open && !w.minimized);
    if (!open.length) return null;
    return open.reduce((top, w) => (w.z > top.z ? w : top), open[0]).id;
  }, [save.windows]);

  const hasUnreadBrief = !progress.readBrief;
  const previousCaseWrong = save.records.some(r => r.caseId === level.id && !r.correct);

  const startOnboardingTour = () => {
    setStartMenuOpen(false);
    setSolvedCelebration(null);
    setSave(prev => {
      const defaults = initialWindows(window.innerWidth, window.innerHeight);
      const keepOpen: AppName[] = ['clues', 'query', 'assistant'];
      return {
        ...prev,
        windows: prev.windows.map((w, idx) => {
          const def = defaults.find(d => d.id === w.id) ?? w;
          const open = keepOpen.includes(w.id);
          return {
            ...w,
            x: def.x,
            y: def.y,
            w: def.w,
            h: def.h,
            open,
            minimized: false,
            z: open ? 10 + keepOpen.indexOf(w.id) : idx + 1,
          };
        }),
      };
    });
    window.setTimeout(() => {
      driverRef.current?.destroy();
      const drv = driver({
        showProgress: true,
        allowClose: true,
        animate: !save.settings.reducedMotion,
        stagePadding: 6,
        stageRadius: 4,
        overlayColor: '#0e1d28',
        overlayOpacity: 0.65,
        popoverClass: 'bureau-driver-popover',
        nextBtnText: '下一步 →',
        prevBtnText: '← 上一步',
        doneBtnText: '开始查案',
        progressText: '第 {{current}} / {{total}} 步',
        steps: [
          {
            element: '.window-clues .clue-tabs',
            popover: {
              title: '1. 切换现场线索页签',
              description:
                '先在「线索档案」顶部切换证据页签（例如第 1 案的【街角监控】与【目击记录】），找出嫌疑人的全部特征。',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '.window-clues .evidence-card',
            popover: {
              title: '2. 提取证据关键字段',
              description:
                '仔细核对证据卡上的时间、特征和数字（可点击下方「摘录到记事本」暂存关键线索）。',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '.window-query .editor-shell',
            popover: {
              title: '3. 编写 SQL 查询语句',
              description:
                '在「数据查询」编辑器里输入 SELECT ... FROM ... WHERE 筛选数据表。输入表名或列名时会自动弹出带中文释义的补全列表。',
              side: 'left',
              align: 'start',
            },
          },
          {
            element: '.window-query .query-tools .primary',
            popover: {
              title: '4. 执行查询并选择嫌疑人',
              description:
                '点击「▶ 执行查询 (Ctrl+Enter)」运行语句，在下方结果表右侧点击「选择」即可把嫌疑人编号带入结案窗口。',
              side: 'bottom',
              align: 'end',
            },
          },
          {
            element: '.taskbar-submit',
            popover: {
              title: '5. 提交调查结论',
              description:
                '核对无误后点击「提交调查」归档结案！遇到卡壳时，随时点右下角橘白猫「调查助手」查看提示。',
              side: 'top',
              align: 'end',
            },
          },
        ],
      });
      driverRef.current = drv;
      drv.drive();
    }, 100);
  };

  useEffect(() => {
    if (
      started &&
      !autoTourDoneRef.current &&
      !navigator.webdriver &&
      save.caseId === 1 &&
      save.records.length === 0 &&
      save.elapsed < 5
    ) {
      autoTourDoneRef.current = true;
      startOnboardingTour();
    }
  }, [started]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  return (
    <main
      className={`bureau-desktop ${isPaused ? 'is-paused' : ''} ${save.settings.reducedMotion ? 'reduced-motion' : ''}`}
      style={{
        backgroundImage: `url(${wallpaper})`,
        ['--reading-size' as string]: `${save.settings.fontSize}px`,
      }}
      onPointerDown={e => {
        unlockAudio();
        if (
          startMenuOpen &&
          !(e.target as HTMLElement).closest('.start-menu') &&
          !(e.target as HTMLElement).closest('.bureau-menu')
        ) {
          setStartMenuOpen(false);
        }
      }}
    >
      <header className="system-bar">
        <button
          type="button"
          onClick={() => setStartMenuOpen(o => !o)}
          title="打开微案调查局开始菜单"
        >
          <PixelIcon index={1} size={22} />
          <strong>微案调查局</strong>
        </button>
        <span className="system-case">
          案卷 {String(level.id).padStart(2, '0')} · {level.title}
          {identity?.user?.nickname ? ` · 调查员 ${identity.user.nickname}` : ''}
        </span>
        {saveError || saveWarning ? (
          <button
            type="button"
            className="save-indicator failed"
            onClick={() => focusWindow('settings', true)}
            title="点击查看存档冲突或恢复选项"
          >
            存档待确认处理
          </button>
        ) : (
          <span className="save-indicator">自动归档已连接</span>
        )}
        <button
          type="button"
          onClick={startOnboardingTour}
          title="打开分步高亮新手指引"
        >
          新手指引
        </button>
        <button
          type="button"
          onClick={() => {
            setStartMenuOpen(false);
            setGameMenuOpen(true);
          }}
          title="打开游戏主菜单"
        >
          游戏菜单
        </button>
        <button
          type="button"
          onClick={() =>
            setManualPaused(p => {
              const next = !p;
              pauseFlagsRef.current.manual = next;
              return next;
            })
          }
        >
          {manualPaused ? '继续值班' : '暂停'}
        </button>
        <time>{clockText}</time>
      </header>

      <nav className="desktop-icons" aria-label="桌面应用">
        {DESKTOP_APPS.map(appId => (
          <button
            key={appId}
            type="button"
            className="desktop-icon group transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-px"
            onClick={() => {
              if (appId === 'messages' && !progress.readBrief) {
                patchCurrentCase({ readBrief: true });
              }
              focusWindow(appId, true);
            }}
          >
            <PixelIcon index={appInfo[appId].icon} size={48} />
            <span>
              {appInfo[appId].title}
              {appId === 'messages' && hasUnreadBrief && <i className="unread-dot" aria-label="未读简报" />}
            </span>
          </button>
        ))}
        {acquiredTables.map(t => (
          <button
            key={`table:${t.name}`}
            type="button"
            className="desktop-icon desktop-table-icon group transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-px"
            title={`查看数据表：${t.label} (${t.name})`}
            onClick={() => {
              setSelectedTableName(t.name);
              setRenameTableDraft(t.name);
              setTableViewMode('rows');
              focusWindow('tables', true);
            }}
          >
            <PixelIcon index={8} size={44} />
            <span>{t.name}</span>
            <small className="desktop-table-sub">{t.label}</small>
          </button>
        ))}
      </nav>

      {save.windows
        .filter(w => w.open && !w.minimized)
        .map(win => (
          <DeskWindow
            key={win.id}
            state={win}
            active={topOpenWindowId === win.id}
            onFocus={() => focusWindow(win.id, false)}
            onClose={() => closeWindow(win.id)}
            onMinimize={() => minimizeWindow(win.id)}
            onMaximize={() => toggleMaximizeWindow(win.id)}
            onGeometry={rect => updateWindowGeometry(win.id, rect)}
            title={
              win.id === 'clues'
                ? `线索档案 · 第 ${String(level.id).padStart(2, '0')} 案`
                : win.id === 'query'
                  ? `数据查询 · 第 ${String(level.id).padStart(2, '0')} 案`
                  : undefined
            }
          >
            {win.id === 'messages' && (
              <div className="messages-panel panel-scroll">
                <div className="message-heading">
                  <PixelIcon index={0} size={36} />
                  <div>
                    <h2>{level.title}</h2>
                    <div className="case-subtitle">{level.subtitle}</div>
                  </div>
                </div>
                {previousCaseWrong && (
                  <p className="message-warning">
                    复核提醒：本案已有一次不吻合的指认记录。请对照下方线索与数据表重新检查筛选条件。
                  </p>
                )}
                <div className="briefing-text preserve-lines">{level.briefing}</div>
                <div className="message-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      patchCurrentCase({ readBrief: true });
                      audioRef.current?.playBriefing(
                        BRIEFING_AUDIO[`./assets/briefings/case-${level.id}.mp3`],
                        () => notify('简报语音未能播放，请再点一次“收听简报”。'),
                      );
                      notify('正在播放案件简报语音。');
                    }}
                  >
                    收听简报
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      audioRef.current?.stopBriefing();
                      notify('已停止简报语音。');
                    }}
                  >
                    停止播报
                  </button>
                  {!progress.readBrief && (
                    <button type="button" onClick={() => patchCurrentCase({ readBrief: true })}>
                      标记已读
                    </button>
                  )}
                </div>
                <h3 className="section-title">本案附件与入口</h3>
                {level.clues.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    className="message-attachment"
                    onClick={() => {
                      patchCurrentCase({ clue: idx, readBrief: true });
                      focusWindow('clues', true);
                    }}
                  >
                    <PixelIcon index={1} size={22} />
                    <strong>{c.title}</strong>
                    <span>打开证据</span>
                  </button>
                ))}
                {level.initialSites.map(addr => (
                  <button
                    key={addr}
                    type="button"
                    className="message-attachment"
                    onClick={() => {
                      patchCurrentCase({ readBrief: true });
                      handleNavigateWeb(addr);
                    }}
                  >
                    <PixelIcon index={3} size={22} />
                    <strong>内网入口：{addr}</strong>
                    <span>前往调查</span>
                  </button>
                ))}
              </div>
            )}

            {win.id === 'clues' && (
              <div className="clues-panel flex h-full min-h-0 flex-col">
                <div className="clue-tabs" role="tablist" aria-label="案件线索">
                  {level.clues.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={progress.clue === idx}
                      className={progress.clue === idx ? 'selected' : ''}
                      onClick={() => {
                        setZoomedClue(false);
                        patchCurrentCase({ clue: idx });
                      }}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>
                <div className="clue-content min-h-0 flex-1 overflow-auto p-3">
                  {currentClue && (
                    <div className={`evidence-sheet ${zoomedClue ? 'zoomed' : ''}`}>
                      <EvidenceCard level={level} clue={currentClue} zoomed={zoomedClue} />
                      <div className="clue-actions mt-2.5 flex flex-wrap items-center justify-end gap-2">
                        <button type="button" className="small-button" onClick={() => setZoomedClue(z => !z)}>
                          {zoomedClue ? '还原尺寸' : '放大检视'}
                        </button>
                        <button
                          type="button"
                          className="small-button"
                          onClick={() =>
                            void copyText(`${currentClue.title}：${currentClue.body}`, '线索文字')
                          }
                        >
                          复制线索
                        </button>
                        <button
                          type="button"
                          className="small-button"
                          onClick={() => {
                            const line = `【${currentClue.title}】${currentClue.body}`;
                            const nextNotes = progress.notes ? `${progress.notes}\n${line}` : line;
                            patchCurrentCase({ notes: nextNotes });
                            focusWindow('notepad', true);
                            notify('已将线索摘录追加到记事本。');
                          }}
                        >
                          摘录到记事本
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {win.id === 'query' && (
              <div className="query-panel flex h-full min-h-0 flex-col">
                <div className="query-tabs" role="tablist" aria-label="查询页签">
                  {progress.tabs.map(t => (
                    <div
                      key={t.id}
                      className={`query-tab ${!showHistoryView && t.id === activeTab?.id ? 'selected' : ''}`}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!showHistoryView && t.id === activeTab?.id}
                        onClick={() => {
                          setShowHistoryView(false);
                          patchCurrentCase({ activeTab: t.id });
                        }}
                      >
                        {t.title}
                      </button>
                      {progress.tabs.length > 1 && (
                        <button
                          type="button"
                          aria-label={`关闭${t.title}`}
                          title="关闭页签并收入历史"
                          onClick={() => closeQueryTab(t.id)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showHistoryView}
                    className={showHistoryView ? 'selected' : ''}
                    onClick={() => setShowHistoryView(v => !v)}
                  >
                    查询历史{progress.history.length ? ` (${progress.history.length})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowHistoryView(false);
                      addQueryTab();
                    }}
                    title="新建查询页签"
                  >
                    + 新页签
                  </button>
                </div>

                {showHistoryView ? (
                  <div className="query-history min-h-0 flex-1 overflow-auto p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <strong>最近执行与关闭的 SQL 记录</strong>
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => setShowHistoryView(false)}
                      >
                        返回编辑器
                      </button>
                    </div>
                    {progress.history.length ? (
                      progress.history.map((h, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            updateActiveSql(h);
                            setShowHistoryView(false);
                            notify('已将历史查询恢复到当前页签。');
                          }}
                        >
                          <code>{h}</code>
                          <small>点击恢复到当前编辑器</small>
                        </button>
                      ))
                    ) : (
                      <div className="empty-state">
                        <p>暂无历史查询记录。</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="editor-shell">
                      <SqlEditor
                        value={activeTab?.sql ?? ''}
                        onChange={updateActiveSql}
                        onExecute={() => void executeQuery()}
                        tables={acquiredTables}
                        disabled={queryRunning}
                        error={queryError}
                        fontSize={save.settings.fontSize}
                      />
                    </div>

                    <div className="query-tools">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                        {acquiredTables.map(t => (
                          <button
                            key={t.name}
                            type="button"
                            className="small-button"
                            title={`${t.label} (${t.columns.length} 列 · ${t.rows.length} 行) — 点击查阅表结构与数据`}
                            onClick={() => {
                              setSelectedTableName(t.name);
                              setRenameTableDraft(t.name);
                              focusWindow('tables', true);
                            }}
                          >
                            表: {t.name}
                          </button>
                        ))}
                        {clipboardBuffer && (
                          <button
                            type="button"
                            className="small-button"
                            onClick={() =>
                              updateActiveSql(
                                `${activeTab?.sql ?? ''}${activeTab?.sql ? ' ' : ''}${clipboardBuffer}`,
                              )
                            }
                            title="将最近一次复制的值追加到当前查询末尾"
                          >
                            粘贴复制值
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          updateActiveSql('');
                          setQueryError(undefined);
                        }}
                      >
                        清空
                      </button>
                      {queryRunning && (
                        <button type="button" onClick={cancelQuery}>
                          停止
                        </button>
                      )}
                      <button
                        type="button"
                        className="primary"
                        disabled={queryRunning || isPaused}
                        onClick={() => void executeQuery()}
                      >
                        {queryRunning ? '正在查询…' : '▶ 执行查询 (Ctrl+Enter)'}
                      </button>
                    </div>

                    {queryError && (
                      <div className="query-error" role="alert">
                        {queryError}
                      </div>
                    )}

                    <div className="result-title">
                      <h3>查询结果</h3>
                      <span>
                        {queryResult
                          ? `找到 ${queryResult.values.length} 条记录${queryResult.truncated ? '（已达 1000 行上限）' : ''} · ${queryResult.duration.toFixed(1)} ms`
                          : '按 Ctrl+Enter 或点击运行查询'}
                      </span>
                    </div>

                    <div className="query-result min-h-0 flex-1 overflow-hidden">
                      {queryResult ? (
                        <DataGrid
                          result={queryResult}
                          table={acquiredTables.find(t =>
                            queryResult.columns.every(col => t.columns.some(c => c.name === col)),
                          )}
                          onCopy={val => void copyText(val, '单元格值')}
                          onSelect={
                            level.id < 10 ? (row, cols) => handleSelectRowForSubmit(row, cols) : undefined
                          }
                        />
                      ) : (
                        <div className="empty-state">
                          <PixelIcon index={2} size={36} />
                          <p>编写 SQL 并点击“执行查询”，结果表将显示在这里。</p>
                          <small>输入 FROM 或表名加点号（.）可唤出表名与中文字段提示。</small>
                        </div>
                      )}
                    </div>

                    {queryResult && (
                      <div className="save-result">
                        <label>
                          结果表名称
                          <input
                            placeholder="输入新表名，例如 step1"
                            value={saveTableName}
                            onChange={e => setSaveTableName(e.target.value)}
                          />
                        </label>
                        <button type="button" className="primary" onClick={handleSaveResultTable}>
                          保存结果表
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {win.id === 'tables' && (
              <div className="tables-panel flex h-full min-h-0">
                <aside className="tables-nav" aria-label="本案数据表列表">
                  {acquiredTables.map(t => (
                    <button
                      key={t.name}
                      type="button"
                      className={inspectTable?.name === t.name ? 'selected' : ''}
                      onClick={() => {
                        setSelectedTableName(t.name);
                        setRenameTableDraft(t.name);
                      }}
                    >
                      <strong>{t.label}</strong>
                      <small>
                        {t.name} {t.source === 'saved' ? '· 已存结果' : ''}
                      </small>
                    </button>
                  ))}
                </aside>
                {inspectTable && inspectTableResult ? (
                  <div className="table-detail flex min-w-0 flex-1 flex-col">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#a7b099] p-3">
                      <div>
                        <h3>
                          {inspectTable.label} <code>({inspectTable.name})</code>
                        </h3>
                        <p>{inspectTable.description}</p>
                      </div>
                      <div className="table-actions">
                        <button
                          type="button"
                          className={tableViewMode === 'rows' ? 'selected' : ''}
                          onClick={() => setTableViewMode('rows')}
                        >
                          数据行 ({inspectTable.rows.length})
                        </button>
                        <button
                          type="button"
                          className={tableViewMode === 'schema' ? 'selected' : ''}
                          onClick={() => setTableViewMode('schema')}
                        >
                          字段说明 ({inspectTable.columns.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHistoryView(false);
                            addQueryTab(`SELECT *\nFROM ${quoteIdentifier(inspectTable.name)};`);
                            focusWindow('query', true);
                          }}
                        >
                          在查询器中打开
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyText(inspectTable.name, '表名')}
                        >
                          复制表名
                        </button>
                        {inspectTable.source === 'saved' && (
                          <>
                            <input
                              aria-label="重命名结果表"
                              value={renameTableDraft}
                              onChange={e => setRenameTableDraft(e.target.value)}
                              style={{ width: 120, padding: '3px 6px' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRenameSavedTable(inspectTable.name)}
                            >
                              重命名
                            </button>
                            <button
                              type="button"
                              className="danger-link"
                              onClick={() => handleDeleteSavedTable(inspectTable.name)}
                            >
                              删除此表
                            </button>
                          </>
                        )}
                      </div>
                    </header>
                    {tableViewMode === 'schema' ? (
                      <div className="schema-details min-h-0 flex-1 overflow-auto p-3">
                        {inspectTable.columns.map(col => (
                          <div key={col.name}>
                            <strong>
                              {col.label} (<code>{col.name}</code>)
                            </strong>
                            <span>{col.type}</span>
                            {col.description && <small>{col.description}</small>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <DataGrid
                          result={inspectTableResult}
                          table={inspectTable}
                          onCopy={val => void copyText(val, '单元格值')}
                          onSelect={
                            inspectTable.name === level.suspectTable && level.id < 10
                              ? (row, cols) => handleSelectRowForSubmit(row, cols)
                              : undefined
                          }
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>当前没有已取得的数据表。</p>
                  </div>
                )}
              </div>
            )}

            {win.id === 'browser' && (
              <BrowserPanel
                level={level}
                progress={progress}
                onPatch={patchCurrentCase}
                onNavigate={handleNavigateWeb}
                onDownload={handleDownloadTable}
                onReport={() => focusWindow('submit', true)}
                notify={notify}
              />
            )}

            {win.id === 'assistant' && (
              <div className="assistant-panel relative flex h-full min-h-0 flex-col">
                <div className="assistant-stage">
                  {((hintMode === 'case' && progress.hints > 0) ||
                    (hintMode === 'sql' && progress.sqlHints > 0)) && (
                    <div
                      className="cat-speech-popover hint-copy"
                      key={
                        hintMode === 'case'
                          ? `case:${Math.min(activeHintIdx, progress.hints - 1)}`
                          : `sql:${Math.min(activeSqlHintIdx, progress.sqlHints - 1)}`
                      }
                    >
                      <div className="cat-speech-head">
                        <strong>
                          {hintMode === 'case'
                            ? `调查提示 ${Math.min(activeHintIdx, progress.hints - 1) + 1} / ${progress.hints}`
                            : `SQL 提示 ${Math.min(activeSqlHintIdx, progress.sqlHints - 1) + 1} / ${progress.sqlHints}`}
                        </strong>
                        {(hintMode === 'case' ? progress.hints : progress.sqlHints) > 1 && (
                          <div className="cat-speech-pager">
                            <button
                              type="button"
                              disabled={(hintMode === 'case' ? activeHintIdx : activeSqlHintIdx) <= 0}
                              onClick={() =>
                                hintMode === 'case'
                                  ? setActiveHintIdx(i => Math.max(0, i - 1))
                                  : setActiveSqlHintIdx(i => Math.max(0, i - 1))
                              }
                              title="上一条提示"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              disabled={
                                (hintMode === 'case' ? activeHintIdx : activeSqlHintIdx) >=
                                (hintMode === 'case' ? progress.hints : progress.sqlHints) - 1
                              }
                              onClick={() =>
                                hintMode === 'case'
                                  ? setActiveHintIdx(i => Math.min(progress.hints - 1, i + 1))
                                  : setActiveSqlHintIdx(i => Math.min(progress.sqlHints - 1, i + 1))
                              }
                              title="下一条提示"
                            >
                              ›
                            </button>
                          </div>
                        )}
                      </div>
                      <p>
                        {hintMode === 'case'
                          ? level.hints[Math.min(activeHintIdx, progress.hints - 1)]
                          : level.sqlHints[Math.min(activeSqlHintIdx, progress.sqlHints - 1)]}
                      </p>
                      <span className="cat-speech-tail" aria-hidden="true" />
                    </div>
                  )}
                  <Cat pose={catPose} />
                </div>

                <div className="hint-tabs">
                  <button
                    type="button"
                    className={hintMode === 'case' ? 'selected' : ''}
                    onClick={() => setHintMode('case')}
                  >
                    查什么 ({progress.hints}/{level.hints.length})
                  </button>
                  <button
                    type="button"
                    className={hintMode === 'sql' ? 'selected' : ''}
                    onClick={() => setHintMode('sql')}
                  >
                    怎么写 ({progress.sqlHints}/{level.sqlHints.length})
                  </button>
                </div>

                {hintMode === 'case' ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={progress.hints >= level.hints.length}
                    onClick={() => {
                      const nextCount = Math.min(level.hints.length, progress.hints + 1);
                      patchCurrentCase({ hints: nextCount });
                      setActiveHintIdx(nextCount - 1);
                    }}
                  >
                    {progress.hints >= level.hints.length ? '调查提示已全部展开' : '展开下一条调查提示'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={progress.sqlHints >= level.sqlHints.length}
                    onClick={() => {
                      const nextCount = Math.min(level.sqlHints.length, progress.sqlHints + 1);
                      patchCurrentCase({ sqlHints: nextCount });
                      setActiveSqlHintIdx(nextCount - 1);
                    }}
                  >
                    {progress.sqlHints >= level.sqlHints.length ? 'SQL 提示已全部展开' : '展开下一条 SQL 提示'}
                  </button>
                )}
              </div>
            )}

            {win.id === 'notepad' && (
              <div
                className="notepad-panel flex h-full min-h-0 flex-col"
                style={{ backgroundColor: progress.noteColor }}
              >
                <div className="notepad-tools">
                  {NOTE_COLORS.map(c => (
                    <button
                      key={c.color}
                      type="button"
                      className="note-color"
                      style={{ backgroundColor: c.color }}
                      aria-label={c.label}
                      title={c.label}
                      onClick={() => patchCurrentCase({ noteColor: c.color })}
                    />
                  ))}
                  <button
                    type="button"
                    disabled={!clipboardBuffer}
                    onClick={() =>
                      patchCurrentCase({
                        notes: `${progress.notes}${progress.notes ? '\n' : ''}${clipboardBuffer}`,
                      })
                    }
                  >
                    追加复制值到末尾
                  </button>
                </div>
                <textarea
                  aria-label="案卷记事本"
                  className="min-h-0 flex-1"
                  placeholder="在这里记录嫌疑编号、IP、时间范围或金额算式（自动随案卷保存）…"
                  value={progress.notes}
                  onChange={e => patchCurrentCase({ notes: e.target.value })}
                />
                <small>本案笔记独立保存，切换案件或刷新页面不会丢失。</small>
              </div>
            )}

            {win.id === 'manual' && (
              <div className="manual-panel flex h-full min-h-0">
                <nav aria-label="手册章节">
                  {manualChapters.map((ch, idx) => {
                    const unlocked = idx < unlockedManualCount;
                    return (
                      <button
                        key={ch.title}
                        type="button"
                        disabled={!unlocked}
                        className={safeManualIdx === idx ? 'selected' : ''}
                        onClick={() => setManualChapterIdx(idx)}
                      >
                        <strong>{ch.title}</strong>
                        <small>{unlocked ? '已开放查阅' : `解锁第 ${idx + 1} 案后开放`}</small>
                      </button>
                    );
                  })}
                </nav>
                <div className="panel-scroll min-w-0 flex-1">
                  <span className="document-meta">
                    霖港市微案调查局 · 内部查询手册（第 {safeManualIdx + 1} / {manualChapters.length} 章）
                  </span>
                  <h2>{currentManual.title}</h2>
                  <p className="chapter-intro">{currentManual.intro}</p>
                  {currentManual.sections.map(sec => (
                    <section key={sec.title}>
                      <h3>{sec.title}</h3>
                      <p>{sec.body}</p>
                      {sec.code && (
                        <div className="manual-code">
                          <pre>{sec.code}</pre>
                          <button
                            type="button"
                            onClick={() => void copyText(sec.code!, '示例 SQL')}
                          >
                            复制示例
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateActiveSql(sec.code!);
                              focusWindow('query', true);
                              notify('已将手册示例填入当前查询编辑器。');
                            }}
                          >
                            放入查询窗口
                          </button>
                        </div>
                      )}
                    </section>
                  ))}
                  <div className="manual-paging">
                    <button
                      type="button"
                      disabled={safeManualIdx <= 0}
                      onClick={() => setManualChapterIdx(i => Math.max(0, i - 1))}
                    >
                      上一章
                    </button>
                    <button
                      type="button"
                      disabled={safeManualIdx >= unlockedManualCount - 1}
                      onClick={() =>
                        setManualChapterIdx(i => Math.min(unlockedManualCount - 1, i + 1))
                      }
                    >
                      下一章
                    </button>
                  </div>
                </div>
              </div>
            )}

            {win.id === 'submit' && (
              <div className="submit-panel panel-scroll">
                <div className="warrant-heading">
                  <PixelIcon index={9} size={36} />
                  <div>
                    <h2>
                      {level.finale ? '发布深度调查报道' : `提交调查结论 · 第 ${String(level.id).padStart(2, '0')} 案`}
                    </h2>
                    <small>{level.title}</small>
                  </div>
                </div>

                {level.finale ? (
                  <div className="report-editor">
                    <p>
                      请将采购差额与农场警卫部署两条证据链的核实结论填入下方，并撰写报道正文。标题、核实数值与正文内容都会参与结局判定。
                    </p>
                    <label>
                      选择报道标题
                      <select
                        aria-label="选择报道标题"
                        value={progress.drafts['finale:headline'] ?? '0'}
                        onChange={e =>
                          patchCurrentCase({
                            drafts: { ...progress.drafts, 'finale:headline': e.target.value },
                          })
                        }
                      >
                        {level.finale.headlines.map((h, idx) => (
                          <option key={h} value={String(idx)}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                    {level.finale.questions.map(q => (
                      <label key={q.id}>
                        {q.label}
                        <input
                          placeholder="填写从数据表核实出的准确名称"
                          value={progress.drafts[`finale:q:${q.id}`] ?? ''}
                          onChange={e =>
                            patchCurrentCase({
                              drafts: { ...progress.drafts, [`finale:q:${q.id}`]: e.target.value },
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      报道正文（须在正文中写明上述三项核实事实）
                      <textarea
                        rows={4}
                        placeholder="写明目标农场种植的作物、异常材料装配的消费品，以及两条线索共同指向的物种…"
                        value={progress.drafts['finale:body'] ?? ''}
                        onChange={e =>
                          patchCurrentCase({
                            drafts: { ...progress.drafts, 'finale:body': e.target.value },
                          })
                        }
                      />
                    </label>
                    <div className="report-preview">
                      <h3>
                        刊发预览：《
                        {level.finale.headlines[Number(progress.drafts['finale:headline'] ?? '0')] ??
                          level.finale.headlines[0]}
                        》
                      </h3>
                      <p className="preserve-lines">
                        {progress.drafts['finale:body'] || '（正文预览将在输入后显示）'}
                      </p>
                    </div>
                    <button type="button" className="primary" onClick={publishFinaleReport}>
                      确认发布报道
                    </button>
                  </div>
                ) : (
                  <>
                    <p>
                      核对《{level.tables.find(t => t.name === level.suspectTable)?.label ?? level.suspectTable}
                      》中的唯一标识列（<code>{level.idColumn}</code>）。可从查询结果点击“选择”带入，也在下方直接输入或选取。
                    </p>
                    <label>
                      人物编号（{level.idColumn}）
                      <input
                        placeholder="输入人物编号，例如 1024"
                        value={suspectInput}
                        onChange={e => setSuspectInput(e.target.value)}
                      />
                    </label>
                    {suspectRoster.length > 0 && (
                      <label>
                        从已取得名单快速选择
                        <select
                          aria-label="从已取得名单快速选择"
                          value={suspectInput}
                          onChange={e => setSuspectInput(e.target.value)}
                        >
                          <option value="">-- 选择候选人 --</option>
                          {suspectRoster.map(person => (
                            <option key={String(person.id)} value={String(person.id)}>
                              {String(person.id)} · {person.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button type="button" className="primary" onClick={submitSuspectVerdict}>
                      提交调查结论
                    </button>

                    {lastVerdict && lastVerdict.caseId === level.id && (
                      <div className={`verdict ${lastVerdict.correct ? '' : 'incorrect'}`}>
                        <strong>
                          {lastVerdict.correct
                            ? `归档通过：${lastVerdict.name}（${String(lastVerdict.suspect)}）`
                            : `复核未通过：${lastVerdict.name}（${String(lastVerdict.suspect)}）`}
                        </strong>
                        <p>
                          {lastVerdict.correct
                            ? '证据链核验无误。你可以留在本案继续查阅，或前往下一桩案卷。'
                            : '该对象未能同时满足本案全部线索条件。你的查询草稿、保存表与笔记均已保留，请核对后再试。'}
                        </p>
                        {lastVerdict.correct && level.id < 10 && (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => switchCase(level.id + 1)}
                          >
                            进入第 {String(level.id + 1).padStart(2, '0')} 案
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                <h3 className="section-title">本案提交记录</h3>
                {save.records.filter(r => r.caseId === level.id).length ? (
                  <ul>
                    {save.records
                      .filter(r => r.caseId === level.id)
                      .map((r, idx) => (
                        <li key={idx}>
                          [{r.at}] {r.name}（{String(r.suspect)}） — {r.correct ? '核验吻合' : '证据不符'}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <small>本案尚无提交记录。</small>
                )}
              </div>
            )}

            {win.id === 'cases' && (
              <div className="cases-panel panel-scroll">
                <h2>案件回顾与切换</h2>
                <p>已解锁的案卷可随时切换复查，笔记、保存的中间表与历史记录均会保留。</p>
                {cases.map(c => {
                  const unlocked = c.id <= save.unlocked;
                  const solved = save.records.some(r => r.caseId === c.id && r.correct);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!unlocked}
                      className={`case-row ${c.id === level.id ? 'selected' : ''}`}
                      onClick={() => switchCase(c.id)}
                    >
                      <span>{String(c.id).padStart(2, '0')}</span>
                      <div>
                        <strong>{c.title}</strong>
                        <small>{c.subtitle}</small>
                      </div>
                      <span>{solved ? '已侦破' : unlocked ? '调查中' : '未开放'}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {win.id === 'music' && (() => {
              const currentTrack = BUREAU_TRACKS[trackIndex % BUREAU_TRACKS.length] ?? BUREAU_TRACKS[0];
              return (
                <div className="music-panel panel-scroll">
                  <div className="music-hero">
                    <div className={`record-art ${musicPlaying && !isPaused && !save.settings.muted ? 'playing' : ''}`}>
                      <PixelIcon index={6} size={52} />
                    </div>
                    <div className="music-hero-info">
                      <small>{currentTrack.origin}</small>
                      <h2>{currentTrack.title}</h2>
                      <p>{currentTrack.subtitle} · {currentTrack.mood}</p>
                    </div>
                  </div>
                  <div className="music-controls">
                    <button
                      type="button"
                      onClick={() => setTrackIndex(t => (t + BUREAU_TRACKS.length - 1) % BUREAU_TRACKS.length)}
                    >
                      ⏮ 上一首
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setMusicPlaying(p => !p)}
                    >
                      {musicPlaying ? '⏸ 暂停播放' : '▶ 继续播放'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrackIndex(t => (t + 1) % BUREAU_TRACKS.length)}
                    >
                      下一首 ⏭
                    </button>
                  </div>
                  <label className="range-field">
                    音乐音量
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={save.settings.music}
                      onChange={e =>
                        setSave(prev => ({
                          ...prev,
                          settings: { ...prev.settings, music: Number(e.target.value) },
                        }))
                      }
                    />
                    <output>{Math.round(save.settings.music * 100)}%</output>
                  </label>
                  <div className="music-playlist" role="list" aria-label="无版权背景音乐列表">
                    {BUREAU_TRACKS.map((tr, idx) => {
                      const active = idx === trackIndex % BUREAU_TRACKS.length;
                      return (
                        <button
                          key={tr.id}
                          type="button"
                          className={`playlist-row ${active ? 'selected' : ''}`}
                          onClick={() => {
                            setTrackIndex(idx);
                            setMusicPlaying(true);
                          }}
                        >
                          <span className="playlist-idx">
                            {active && musicPlaying ? '♪' : String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="playlist-meta">
                            <strong>{tr.title}</strong>
                            <small>{tr.origin} · {tr.mood}</small>
                          </div>
                          <span className="playlist-tag">{active ? (musicPlaying ? '播放中' : '已暂停') : '点击播放'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {win.id === 'settings' && (
              <div className="settings-panel panel-scroll">
                <h2>系统与存档设置</h2>
                {(saveError || saveWarning) && (
                  <div className="verdict incorrect">
                    <strong>存档状态提醒</strong>
                    <p>{saveError ?? saveWarning}</p>
                    <div className="storage-actions">
                      <button type="button" onClick={exportSaveFile}>
                        导出当前存档
                      </button>
                      <button type="button" onClick={handleReloadLatestSave}>
                        读取最新存档
                      </button>
                      <button type="button" className="primary" onClick={handleConfirmRecoverSave}>
                        确认恢复并继续保存
                      </button>
                    </div>
                  </div>
                )}

                <label className="range-field">
                  主音量
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={save.settings.master}
                    onChange={e =>
                      setSave(prev => ({
                        ...prev,
                        settings: { ...prev.settings, master: Number(e.target.value) },
                      }))
                    }
                  />
                  <output>{Math.round(save.settings.master * 100)}%</output>
                </label>

                <label className="range-field">
                  音乐音量
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={save.settings.music}
                    onChange={e =>
                      setSave(prev => ({
                        ...prev,
                        settings: { ...prev.settings, music: Number(e.target.value) },
                      }))
                    }
                  />
                  <output>{Math.round(save.settings.music * 100)}%</output>
                </label>

                <label className="range-field">
                  音效音量
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={save.settings.effects}
                    onChange={e =>
                      setSave(prev => ({
                        ...prev,
                        settings: { ...prev.settings, effects: Number(e.target.value) },
                      }))
                    }
                  />
                  <output>{Math.round(save.settings.effects * 100)}%</output>
                </label>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={save.settings.muted}
                    onChange={e =>
                      setSave(prev => ({
                        ...prev,
                        settings: { ...prev.settings, muted: e.target.checked },
                      }))
                    }
                  />
                  静音全部音频
                </label>

                <label>
                  阅读与编辑器字号
                  <select
                    aria-label="阅读与编辑器字号"
                    value={String(save.settings.fontSize)}
                    onChange={e =>
                      setSave(prev => ({
                        ...prev,
                        settings: { ...prev.settings, fontSize: Number(e.target.value) },
                      }))
                    }
                  >
                    <option value="13">紧凑 (13px)</option>
                    <option value="15">标准 (15px)</option>
                    <option value="17">舒适 (17px)</option>
                    <option value="19">大字号 (19px)</option>
                  </select>
                </label>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={save.settings.reducedMotion}
                    onChange={e =>
                      setSave(prev => ({
                        ...prev,
                        settings: { ...prev.settings, reducedMotion: e.target.checked },
                      }))
                    }
                  />
                  减少动态效果（固定助手姿态）
                </label>

                <h3 className="section-title">窗口与存档管理</h3>
                <div className="storage-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSave(prev => ({
                        ...prev,
                        windows: initialWindows(window.innerWidth, window.innerHeight),
                      }));
                      notify('已重置桌面窗口位置与尺寸。');
                    }}
                  >
                    恢复默认窗口布局
                  </button>
                  <button type="button" onClick={exportSaveFile}>
                    导出存档 JSON
                  </button>
                  <label className="file-button">
                    导入存档 JSON
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) void handleImportSaveFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <button type="button" className="danger-button" onClick={handleStartNewGame}>
                  开启新调查（重新生成随机种子）
                </button>
                <p className="small-note">
                  存档键名：{SAVE_KEY} · 当前随机种子：{save.seed}
                </p>
              </div>
            )}
          </DeskWindow>
        ))}

      {startMenuOpen && (
        <section className="start-menu" aria-label="微案调查局主菜单">
          <header className="start-menu-header">
            <PixelIcon index={1} size={26} />
            <div>
              <strong>霖港市微案调查局</strong>
              <small>
                当前：第 {String(level.id).padStart(2, '0')} 案 · 已开放 {save.unlocked}/10 案
              </small>
            </div>
          </header>
          <div className="start-menu-grid">
            <div className="start-menu-col">
              <span className="start-menu-label">调查工具</span>
              {(['messages', 'clues', 'query', 'tables', 'browser', 'notepad', 'manual', 'assistant'] as AppName[]).map(
                appId => (
                  <button
                    key={appId}
                    type="button"
                    onClick={() => {
                      if (appId === 'messages' && !progress.readBrief) {
                        patchCurrentCase({ readBrief: true });
                      }
                      focusWindow(appId, true);
                      setStartMenuOpen(false);
                    }}
                  >
                    <PixelIcon index={appInfo[appId].icon} size={20} />
                    <span>{appInfo[appId].title}</span>
                  </button>
                ),
              )}
            </div>
            <div className="start-menu-col">
              <span className="start-menu-label">案卷与系统</span>
              <button
                type="button"
                onClick={() => {
                  focusWindow('cases', true);
                  setStartMenuOpen(false);
                }}
              >
                <PixelIcon index={1} size={20} />
                <span>案件回顾与切换 ({save.unlocked}/10)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  focusWindow('submit', true);
                  setStartMenuOpen(false);
                }}
              >
                <PixelIcon index={9} size={20} />
                <span>{level.finale ? '撰写调查报道' : '提交调查结论'}</span>
              </button>
              <button
                type="button"
                onClick={startOnboardingTour}
              >
                <PixelIcon index={5} size={20} />
                <span>新手指引（分步教学）</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSave(prev => ({
                    ...prev,
                    windows: initialWindows(window.innerWidth, window.innerHeight),
                  }));
                  setStartMenuOpen(false);
                  notify('已恢复默认桌面窗口布局。');
                }}
              >
                <PixelIcon index={2} size={20} />
                <span>整理桌面窗口布局</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  focusWindow('music', true);
                  setStartMenuOpen(false);
                }}
              >
                <PixelIcon index={6} size={20} />
                <span>音乐播放器</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  focusWindow('settings', true);
                  setStartMenuOpen(false);
                }}
              >
                <PixelIcon index={7} size={20} />
                <span>系统与存档设置</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartMenuOpen(false);
                  pauseFlagsRef.current.started = false;
                  setStarted(false);
                }}
              >
                <PixelIcon index={0} size={20} />
                <span>返回主菜单封面</span>
              </button>
            </div>
          </div>
        </section>
      )}

      <footer className="taskbar">
        <button
          type="button"
          className={`bureau-menu ${startMenuOpen ? 'selected' : ''}`}
          aria-expanded={startMenuOpen}
          onClick={() => setStartMenuOpen(o => !o)}
        >
          <PixelIcon index={1} size={20} />
          调查局菜单
        </button>
        <button
          type="button"
          className="taskbar-cases small-button"
          onClick={() => focusWindow('cases', true)}
        >
          案件回顾 ({save.unlocked}/10)
        </button>
        <div className="taskbar-apps">
          {save.windows
            .filter(w => w.open)
            .map(w => (
              <button
                key={w.id}
                type="button"
                className={topOpenWindowId === w.id && !w.minimized ? 'selected' : ''}
                onClick={() => toggleTaskbarWindow(w.id)}
              >
                <PixelIcon index={appInfo[w.id].icon} size={18} />
                <span>{appInfo[w.id].title}</span>
              </button>
            ))}
        </div>
        <button
          type="button"
          className="primary taskbar-submit"
          onClick={() => focusWindow('submit', true)}
        >
          {level.finale ? '撰写报道' : '提交调查'}
        </button>
        <span className="playtime">值班时长 {formatDuration(displayElapsed)}</span>
      </footer>

      {!started && (
        <section className="welcome-overlay" aria-label="入职欢迎">
          <div className="welcome-window">
            <div className="welcome-masthead">
              <PixelIcon index={2} size={36} />
              <span>霖港市微案调查局 · 内部终端</span>
            </div>
            <h1>开始今晚的值班</h1>
            <p>
              桌面已连接案卷数据库与市政内网。阅读现场证据、查询关联表、核实时间与账目，把每一桩看似不起眼的微案查个水落石出。
            </p>
            <div className="welcome-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  unlockAudio();
                  pauseFlagsRef.current.started = true;
                  setStarted(true);
                }}
              >
                开始值班
              </button>
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  pauseFlagsRef.current.started = true;
                  setStarted(true);
                  autoTourDoneRef.current = true;
                  startOnboardingTour();
                }}
              >
                新手指引教学
              </button>
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  pauseFlagsRef.current.started = true;
                  setStarted(true);
                  focusWindow('cases', true);
                }}
              >
                选择案件 ({save.unlocked}/10)
              </button>
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  pauseFlagsRef.current.started = true;
                  setStarted(true);
                  focusWindow('manual', true);
                }}
              >
                先看操作手册
              </button>
            </div>
            <div className="welcome-foot">
              <Cat pose={0} />
              <div>
                <strong>新手指引与调查助手已就位</strong>
                <p>右上角提供 5 步互动新手指引；遇到卡壳时可点开右下角橘白猫查看调查方向或 SQL 语法提示。</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {(started && (manualPaused || gameMenuOpen)) && (
        <section className="pause-overlay" aria-label={manualPaused ? '调查已暂停' : '游戏主菜单'}>
          <div className="game-menu-card">
            <div className="game-menu-head">
              <Cat pose={manualPaused ? 2 : 0} />
              <div>
                <small>霖港市微案调查局 · 内部终端</small>
                <h2>{manualPaused ? '值班已暂停' : '游戏主菜单'}</h2>
                <p>
                  当前进度：第 {String(level.id).padStart(2, '0')} 案《{level.title}》 · 已解锁 {save.unlocked}/10 案 · 累计用时 {formatDuration(displayElapsed)}
                </p>
              </div>
            </div>
            <div className="game-menu-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  pauseFlagsRef.current.manual = false;
                  setManualPaused(false);
                  setGameMenuOpen(false);
                }}
              >
                继续调查
              </button>
              <button
                type="button"
                onClick={() => {
                  pauseFlagsRef.current.manual = false;
                  setManualPaused(false);
                  setGameMenuOpen(false);
                  startOnboardingTour();
                }}
              >
                新手指引（分步高亮教学）
              </button>
              <button
                type="button"
                onClick={() => {
                  pauseFlagsRef.current.manual = false;
                  setManualPaused(false);
                  setGameMenuOpen(false);
                  focusWindow('cases', true);
                }}
              >
                案件选择与回顾 ({save.unlocked}/10)
              </button>
              <button
                type="button"
                onClick={() => {
                  pauseFlagsRef.current.manual = false;
                  setManualPaused(false);
                  setGameMenuOpen(false);
                  focusWindow('manual', true);
                }}
              >
                查阅 SQL 操作手册
              </button>
              <button
                type="button"
                onClick={() => {
                  pauseFlagsRef.current.manual = false;
                  setManualPaused(false);
                  setGameMenuOpen(false);
                  focusWindow('settings', true);
                }}
              >
                系统与音量设置
              </button>
              <button
                type="button"
                onClick={() => {
                  setSave(prev => ({
                    ...prev,
                    windows: initialWindows(window.innerWidth, window.innerHeight),
                  }));
                  pauseFlagsRef.current.manual = false;
                  setManualPaused(false);
                  setGameMenuOpen(false);
                  notify('已整理并恢复默认桌面窗口布局。');
                }}
              >
                整理重置桌面窗口
              </button>
              <button
                type="button"
                onClick={() => {
                  pauseFlagsRef.current.manual = false;
                  setManualPaused(false);
                  setGameMenuOpen(false);
                  pauseFlagsRef.current.started = false;
                  setStarted(false);
                }}
              >
                返回标题封面
              </button>
            </div>
          </div>
        </section>
      )}

      {solvedCelebration && solvedCelebration.caseId === level.id && (
        <section className="case-clear-overlay" aria-label="案件侦破庆贺">
          <div className="confetti-layer" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{
                  left: `${(i * 5.5 + 3) % 96}%`,
                  animationDelay: `${(i % 6) * 90}ms`,
                  backgroundColor: ['#e5ae5f', '#7eb29b', '#d97f59', '#f4e8c1'][i % 4],
                }}
              />
            ))}
          </div>
          <article className="case-clear-card">
            <div className="case-clear-stamp">卷宗归档 · 侦破确认</div>
            <div className="case-clear-header">
              <Cat pose={1} />
              <div>
                <small>第 {String(solvedCelebration.caseId).padStart(2, '0')} 案 · {solvedCelebration.caseTitle}</small>
                <h2>案件侦破成功！</h2>
                <p>
                  锁定对象：<strong>{solvedCelebration.name}</strong>（编号：<code>{String(solvedCelebration.suspect)}</code>）与全部现场证据链完全吻合。
                </p>
              </div>
            </div>
            <div className="case-clear-actions">
              <button
                type="button"
                onClick={() => setSolvedCelebration(null)}
              >
                留在本案复盘
              </button>
              {level.id < 10 && (
                <button
                  type="button"
                  className="primary case-clear-next"
                  onClick={() => switchCase(level.id + 1)}
                >
                  继续 · 进入第 {String(level.id + 1).padStart(2, '0')} 案 →
                </button>
              )}
            </div>
          </article>
        </section>
      )}

      {save.ending && level.finale && (
        <section className="ending-overlay" aria-label="调查结局">
          {save.ending === 'good' && (
            <div className="confetti-layer" aria-hidden="true">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className="confetti-piece"
                  style={{
                    left: `${(i * 3.6 + 2) % 98}%`,
                    animationDelay: `${(i % 7) * 110}ms`,
                    backgroundColor: ['#e5ae5f', '#7eb29b', '#d97f59', '#f4e8c1'][i % 4],
                  }}
                />
              ))}
            </div>
          )}
          <article className={`ending-paper ${save.ending === 'good' ? 'ending-good' : 'ending-bad'}`}>
            <div className="ending-ribbon">
              <span>霖港晨报 · 特别调查号外</span>
              <strong>{save.ending === 'good' ? '全十案终章通关 · 完满结局' : '终章结局 · 待复核'}</strong>
            </div>
            <EvidenceArt caseId={10} />
            <h1>
              {save.ending === 'good' ? '报道刊发：证据链完整闭环' : '报道撤回：关键事实仍待核实'}
            </h1>
            <p className="preserve-lines">
              {save.ending === 'good' ? level.finale.goodEnding : level.finale.badEnding}
            </p>
            <div className="ending-stats">
              <div>
                <small>侦破案卷</small>
                <strong>{ new Set(save.records.filter(r => r.correct).map(r => r.caseId)).size } / 10 案</strong>
              </div>
              <div>
                <small>累计值班用时</small>
                <strong>{formatDuration(displayElapsed)}</strong>
              </div>
              <div>
                <small>调查员评级</small>
                <strong>{save.ending === 'good' ? 'S 级首席调查员' : 'B 级见习调查员'}</strong>
              </div>
            </div>
            <div className="ending-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setSave(prev => {
                    const copy = { ...prev };
                    delete copy.ending;
                    return copy;
                  });
                  focusWindow('submit', true);
                }}
              >
                返回案卷桌面
              </button>
              <button type="button" onClick={exportSaveFile}>
                导出结案存档
              </button>
            </div>
          </article>
        </section>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        onCancel={e => {
          e.preventDefault();
          setDialog(null);
        }}
      >
        {dialog && (
          <>
            <h2>{dialog.title}</h2>
            <p>{dialog.body}</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setDialog(null)}>
                {dialog.cancelLabel ?? '取消'}
              </button>
              <button type="button" className="primary" onClick={dialog.onConfirm}>
                {dialog.confirmLabel}
              </button>
            </div>
          </>
        )}
      </dialog>
    </main>
  );
}
