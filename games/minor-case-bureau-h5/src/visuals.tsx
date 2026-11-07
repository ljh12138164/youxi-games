import type { CSSProperties, ReactNode } from 'react';
import icons from './assets/icons.png';
import cats from './assets/cat.png';
import evidence from './assets/evidence.png';
import type { QueryResult } from './database.ts';
import type { DataTable, SqlValue } from './types.ts';
import type { AppName, WindowState } from './storage.ts';
import { useState } from 'react';

export const appInfo: Record<AppName, { title: string; icon: number }> = {
  messages: { title: '消息', icon: 0 }, clues: { title: '线索档案', icon: 1 }, query: { title: '数据查询', icon: 2 },
  browser: { title: '内网浏览器', icon: 3 }, notepad: { title: '记事本', icon: 4 }, manual: { title: '操作手册', icon: 5 },
  music: { title: '音乐播放器', icon: 6 }, settings: { title: '设置', icon: 7 }, submit: { title: '提交调查', icon: 9 },
  assistant: { title: '调查助手', icon: 9 }, cases: { title: '案件回顾', icon: 1 }, tables: { title: '数据表', icon: 8 },
};

export function PixelIcon({ index, className = '', size = 44 }: { index: number; className?: string; size?: number }) {
  return <span aria-hidden="true" className={`pixel-icon ${className}`} style={{ width: size, height: size, backgroundImage: `url(${icons})`, backgroundPosition: `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 50}%` }} />;
}

export function Cat({ pose = 0 }: { pose?: number }) {
  return <div role="img" aria-label="自然蹲坐的橘白猫调查助手" className="cat-sprite" style={{ backgroundImage: `url(${cats})`, backgroundPosition: `${pose % 2 * 100}% ${Math.floor(pose / 2) * 100}%` }} />;
}

export function EvidenceArt({ caseId, large = false }: { caseId: number; large?: boolean }) {
  const index = Math.max(0, Math.min(11, caseId - 1));
  return <div role="img" aria-label={`案件 ${caseId} 的现场插画；详细证据信息见下方文字`} className={`evidence-art ${large ? 'large' : ''}`} style={{ backgroundImage: `url(${evidence})`, backgroundPosition: `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 50}%` }} />;
}

type WindowProps = {
  state: WindowState; active: boolean; children: ReactNode; onFocus: () => void;
  onClose: () => void; onMinimize: () => void; onMaximize: () => void;
  onGeometry: (rect: Partial<WindowState>) => void; title?: string;
};
export function DeskWindow({ state, active, children, onFocus, onClose, onMinimize, onMaximize, onGeometry, title }: WindowProps) {
  const [dragging, setDragging] = useState(false);
  const begin = (event: React.PointerEvent<HTMLElement>, resize = false) => {
    if (event.button !== 0 || (!resize && (event.target as HTMLElement).closest('button'))) return;
    event.preventDefault(); onFocus(); setDragging(true);
    const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const startX = event.clientX, startY = event.clientY;
    const move = (e: PointerEvent) => {
      if (resize) onGeometry({ w: Math.max(state.id === 'assistant' ? 208 : 320, Math.min(innerWidth - state.x - 8, state.w + e.clientX - startX)), h: Math.max(180, Math.min(innerHeight - state.y - 56, state.h + e.clientY - startY)) });
      else onGeometry({ x: Math.max(0, Math.min(innerWidth - 100, state.x + e.clientX - startX)), y: Math.max(38, Math.min(innerHeight - 100, state.y + e.clientY - startY)) });
    };
    const stop = () => { setDragging(false); target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', stop); target.removeEventListener('pointercancel', stop); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', stop); target.addEventListener('pointercancel', stop);
  };
  const style: CSSProperties = { left: state.x, top: state.y, width: state.w, height: state.h, zIndex: state.z };
  return <section className={`desk-window window-${state.id} ${active ? 'active' : ''} ${dragging ? 'dragging' : ''}`} style={style} onPointerDownCapture={onFocus} aria-label={title ?? appInfo[state.id].title}>
    <header className="window-title" onPointerDown={e => begin(e)} onDoubleClick={state.id === 'assistant' ? undefined : onMaximize}>
      <PixelIcon index={appInfo[state.id].icon} size={22} /><h2>{title ?? appInfo[state.id].title}</h2>
      <div className="window-controls">
        <button aria-label={`最小化${appInfo[state.id].title}`} title="最小化到任务栏" onClick={onMinimize}><span className="control-min" /></button>
        {state.id !== 'assistant' && <button aria-label={`调整${appInfo[state.id].title}窗口大小`} title="最大化 / 还原窗口" onClick={onMaximize}><span className="control-max" /></button>}
        <button className="close-control" aria-label={`关闭${appInfo[state.id].title}`} title="关闭窗口" onClick={onClose}><span className="control-close" /></button>
      </div>
    </header>
    {state.id === 'assistant' ? children : <div className="window-body">{children}</div>}
    {state.id !== 'assistant' && <div className="resize-handle" onPointerDown={e => begin(e, true)} aria-hidden="true" />}
  </section>;
}

export function DataGrid({ result, table, onCopy, onSelect }: { result: QueryResult; table?: DataTable; onCopy: (text: string) => void; onSelect?: (row: SqlValue[], columns: string[]) => void }) {
  const [sort, setSort] = useState<{ index: number; reverse: boolean } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const rows = [...result.values];
  if (sort) rows.sort((a, b) => { const x = a[sort.index], y = b[sort.index]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'zh-CN', { numeric: true })) * (sort.reverse ? -1 : 1); });
  return <div className="table-scroll"><table className="data-grid"><thead><tr>{result.columns.map((column, index) => <th key={`${column}:${index}`}><button title={`按 ${column} 排序`} onClick={() => setSort({ index, reverse: sort?.index === index ? !sort.reverse : false })}>{table?.columns.find(c => c.name === column)?.label ?? column}{sort?.index === index ? (sort.reverse ? ' ↓' : ' ↑') : ''}<small>{column}</small></button></th>)}{onSelect && <th>操作</th>}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => { const cellKey = `${rowIndex}:${index}`; const isCopied = copiedKey === cellKey; return <td key={index} className={typeof cell === 'number' ? 'numeric' : ''}><button className={`cell-copy ${isCopied ? 'copied' : ''}`} title="单击复制这个值" onClick={() => { setCopiedKey(cellKey); setTimeout(() => setCopiedKey(k => (k === cellKey ? null : k)), 850); onCopy(cell === null ? 'NULL' : String(cell)); }}>{cell === null ? <span className="null-value">NULL</span> : cell === '' ? <span className="null-value">空字符串</span> : String(cell)}</button></td>; })}{onSelect && <td><button className="small-button" onClick={() => onSelect(row, result.columns)}>选择</button></td>}</tr>)}</tbody></table>{!rows.length && <div className="empty-state"><PixelIcon index={8} size={44} /><p>没有符合条件的记录。</p><small>可以先去掉一条条件，确认数据的范围。</small></div>}</div>;
}
