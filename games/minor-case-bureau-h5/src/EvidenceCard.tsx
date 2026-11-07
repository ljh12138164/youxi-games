import type { CaseDefinition, Clue, EvidenceVisual } from './types.ts';
import { EvidenceArt, PixelIcon } from './visuals.tsx';
import witnesses from './assets/witnesses.png';

function Fields({ visual }: { visual: EvidenceVisual }) {
  return <dl className="evidence-fields">{visual.fields.map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}

export function EvidenceCard({ level, clue, zoomed = false }: { level: CaseDefinition; clue: Clue; zoomed?: boolean }) {
  const visual = clue.visual;
  if (!visual) return <article className="evidence-card witness-statement"><header><span>霖港市微案调查局 · 证言记录</span><h3>{clue.title}</h3></header><div className="statement-rule" /><p className="preserve-lines">{clue.body}</p><footer>案卷 {String(level.id).padStart(2, '0')} / {clue.id} · 按原意记录，信息仍需交叉核对</footer></article>;
  return <article className={`evidence-card evidence-card-${visual.kind} ${zoomed ? 'evidence-zoomed' : ''}`} aria-label={visual.heading}>
    <header><span>案卷 {String(level.id).padStart(2, '0')} / {clue.id}</span><h3>{visual.heading}</h3></header>
    {visual.kind === 'camera' ? <>
      <div className="camera-frame"><div className="camera-photo" style={{ backgroundImage: `url(${witnesses})`, backgroundPosition: `${(visual.frame ?? 0) * 100}% 0` }} role="img" aria-label={visual.frame === 1 ? '制服人员袖章有三条横杠，腰间可见两把钥匙' : '穿红色外套的人经过刚留下涂鸦的街角'} /><span className="camera-channel">CAM {String((visual.frame ?? 0) + 1).padStart(2, '0')}</span><time className="camera-time">当日 {visual.frame === 1 ? '22:00:00' : '20:26:14'}</time><span className="camera-recording">REC</span></div><Fields visual={visual} />
    </> : visual.kind === 'identity' ? <div className="identity-card"><div className="identity-crest">霖港 · 身份登记</div><div className="identity-body"><div className="identity-photo"><span className="identity-person" /><small>照片磨损</small></div><Fields visual={visual} /></div><div className="card-worn-line">姓名与完整生日部分缺损，仅使用清晰字段。</div></div>
      : visual.kind === 'chat' ? <div className="chat-device"><div className="chat-device-top">课堂消息 · 截取记录</div>{visual.fields.map((field, i) => <div className={`chat-message ${i % 2 ? 'reply' : ''}`} key={i}><small>{field.label}</small><p>{field.value}</p></div>)}<small className="chat-source">由举报人提供，昵称已经隐去</small></div>
      : visual.kind === 'luggage' ? <><div className="luggage-inventory">{visual.items?.map((item, i) => <div className="inventory-row" key={item.label}><strong>{item.label}</strong><div>{Array.from({ length: item.count }, (_, n) => i === 0 ? <PixelIcon index={5} size={46} key={n} /> : <span className="dumbbell-item" aria-label="一只哑铃" key={n}><i /><b /><i /></span>)}</div><span>{item.count} 件</span></div>)}</div><Fields visual={visual} /></>
      : <Fields visual={visual} />}
    {visual.columns && visual.rows && <div className="evidence-record-table"><table><thead><tr>{visual.columns.map((col, i) => <th key={i}>{col}</th>)}</tr></thead><tbody>{visual.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {visual.footer && <div className="evidence-footnote">{visual.footer}</div>}
    <footer><span>原件信息转录 · 保留数值与条件</span><strong>调查附件</strong></footer>
    <details className="evidence-transcript"><summary>查看完整记录文字</summary><p className="preserve-lines">{clue.body}</p></details>
    {visual.kind !== 'camera' && <details className="evidence-context"><summary>查看现场环境图</summary><EvidenceArt caseId={level.id} /><small>环境插画用于说明场景，推理条件以本证据的清晰记录为准。</small></details>}
  </article>;
}
