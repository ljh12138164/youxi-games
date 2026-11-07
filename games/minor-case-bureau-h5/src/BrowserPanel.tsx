import { useState } from 'react';
import type { CaseDefinition, WebPage } from './types.ts';
import type { CaseProgress } from './storage.ts';

export const normalizeAddress = (address: string) => address.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
type Props = { level: CaseDefinition; progress: CaseProgress; onPatch: (patch: Partial<CaseProgress>) => void; onNavigate: (address: string) => void; onDownload: (name: string) => void; onReport: () => void; notify: (message: string) => void };

export function BrowserPanel({ level, progress, onPatch, onNavigate, onDownload, onReport, notify }: Props) {
  const address = progress.webHistory[progress.webIndex] ?? '内网主页';
  const [locationDraft, setLocationDraft] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState('');
  const page = level.websites.find(site => normalizeAddress(site.address) === normalizeAddress(address));
  const draft = (key: string) => progress.drafts[`${address}:${key}`] ?? '';
  const setDraft = (key: string, value: string) => onPatch({ drafts: { ...progress.drafts, [`${address}:${key}`]: value } });
  const navigate = (target: string) => { setLocationDraft(null); setSearch(''); setSearchSubmitted(''); onNavigate(target); };
  const changeIndex = (delta: number) => { setLocationDraft(null); setSearch(''); setSearchSubmitted(''); onPatch({ webIndex: progress.webIndex + delta }); };
  const loggedIn = !page?.login || progress.logins.includes(address);
  const formDone = progress.forms.includes(address);
  const bookmark = () => onPatch({ bookmarks: progress.bookmarks.includes(address) ? progress.bookmarks.filter(a => a !== address) : [...progress.bookmarks, address] });
  const login = () => {
    if (!page?.login) return;
    if (draft('username').trim() === page.login.username && draft('password') === page.login.password) { onPatch({ logins: [...new Set([...progress.logins, address])] }); notify('登录成功，资料已经打开。'); }
    else notify('账号或密码不匹配。先核对线索中提到的登录信息。');
  };
  const submitForm = () => {
    const form = page?.form; if (!form) return;
    if (form.kind === 'publish') { onReport(); return; }
    const value = draft('form').trim();
    if (!value) { notify('先填写内容，再提交。'); return; }
    if (form.answer && value.replaceAll(/\s/g, '').toLocaleLowerCase() !== form.answer.replaceAll(/\s/g, '').toLocaleLowerCase()) { notify('答案还不符合要求。可以回到相关页面核对资料，再试一次。'); return; }
    onPatch({ forms: [...new Set([...progress.forms, address])], acquired: [...new Set([...progress.acquired, ...(form.unlockTables ?? [])])] });
    notify(form.successText);
  };
  const renderDownloads = (site: WebPage) => <div className="site-downloads">{site.downloadTables.map(name => {
    const table = level.tables.find(t => t.name === name); const downloaded = progress.acquired.includes(name);
    return <button key={name} disabled={downloaded} onClick={() => onDownload(name)}>{downloaded ? '已取得' : '下载数据'} · {table?.label ?? name}<small>{name}</small></button>;
  })}</div>;
  return <div className="browser-panel flex h-full min-h-0 flex-col">
    <form className="browser-toolbar" onSubmit={e => { e.preventDefault(); navigate(normalizeAddress(locationDraft ?? address)); }}>
      <button type="button" title="后退" disabled={progress.webIndex <= 0} onClick={() => changeIndex(-1)}>←</button><button type="button" title="前进" disabled={progress.webIndex >= progress.webHistory.length - 1} onClick={() => changeIndex(1)}>→</button><button type="button" title="返回内网主页" onClick={() => navigate('内网主页')}>首页</button>
      <input aria-label="内网地址" spellCheck={false} value={locationDraft ?? address} onChange={e => setLocationDraft(e.target.value)} /><button type="submit">前往</button><button type="button" title="添加或移除书签" onClick={bookmark}>{progress.bookmarks.includes(address) ? '已收藏' : '收藏'}</button>
    </form>
    <div className="browser-view flex min-h-0 flex-1">
      <aside className="browser-sidebar"><h3>调查入口</h3>{level.initialSites.map(a => <button key={a} onClick={() => navigate(a)}>{level.websites.find(s => s.address === a)?.title ?? a}</button>)}<h3>书签</h3>{progress.bookmarks.length ? progress.bookmarks.map(a => <button key={a} onClick={() => navigate(a)}>{level.websites.find(s => s.address === a)?.title ?? a}</button>) : <small>收藏后会出现在这里。</small>}<details><summary>浏览历史</summary>{[...new Set(progress.webHistory)].reverse().map(a => <button key={a} onClick={() => navigate(a)}>{a}</button>)}<button className="danger-link" onClick={() => onPatch({ webHistory: [address], webIndex: 0 })}>清空历史</button></details></aside>
      <div className="site-scroll min-w-0 flex-1" key={address}>
        {address === '内网主页' ? <article className="site-home"><span className="site-mark">内网导航</span><h2>资料都在路上。</h2><p>从案卷里提到的网址开始。下载的数据会出现在查询工作台。</p><div className="site-directory">{level.websites.filter(s => level.initialSites.includes(s.address)).map(s => <button key={s.address} onClick={() => navigate(s.address)}><span>{s.category}</span><strong>{s.title}</strong><small>{s.address}</small><p>{s.intro}</p></button>)}</div></article> : page ? <article className={`web-article site-${page.category.length % 4}`}>
          <header className="site-header"><span>{page.category}</span><h2>{page.title}</h2><p>{page.intro}</p></header><div className="site-body">{page.body.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          {page.search && <section className="site-section"><h3>检索资料</h3><form className="site-search" onSubmit={e => { e.preventDefault(); setSearchSubmitted(search.trim()); }}><input aria-label="站内搜索" placeholder="输入姓名、账号或关键词" value={search} onChange={e => setSearch(e.target.value)} /><button>搜索</button></form>{searchSubmitted && (() => {
            const table = level.tables.find(t => t.name === page.search!.table);
            const matching = table?.rows.filter(row => page.search!.fields.some(field => String(row[table.columns.findIndex(c => c.name === field)] ?? '').toLocaleLowerCase().includes(searchSubmitted.toLocaleLowerCase()))) ?? [];
            return <div className="search-matches"><p>找到 {matching.length} 条记录</p>{matching.map((row, i) => <dl key={i}>{table!.columns.map((col, j) => <div key={col.name}><dt>{col.label}</dt><dd>{row[j] === null ? '未提供' : String(row[j])}</dd></div>)}</dl>)}</div>;
          })()}</section>}
          {page.login && !loggedIn && <section className="site-section"><h3>成员资料</h3><p>需要登录后查看。登录线索可以从本案的公开资料中找到。</p><form className="site-login" onSubmit={e => { e.preventDefault(); login(); }}><label>账号<input autoComplete="off" value={draft('username')} onChange={e => setDraft('username', e.target.value)} /></label><label>密码<input type="password" autoComplete="off" value={draft('password')} onChange={e => setDraft('password', e.target.value)} /></label><button>登录</button></form></section>}
          {page.login && loggedIn && <section className="site-section"><h3>成员资料已打开</h3><p className="preserve-lines">{page.login.body}</p><button className="text-button" onClick={() => onPatch({ logins: progress.logins.filter(a => a !== address) })}>退出登录</button></section>}
          {loggedIn && renderDownloads(page)}
          {loggedIn && page.form && <section className="site-section"><h3>{page.form.label}</h3>{page.form.question && <p className="preserve-lines">{page.form.question}</p>}{formDone ? <div className="form-success"><strong>{page.form.successText}</strong>{page.form.kind === 'comment' && <blockquote>{draft('form')}</blockquote>}</div> : <form onSubmit={e => { e.preventDefault(); submitForm(); }}>{page.form.kind !== 'publish' && <textarea aria-label={page.form.label} value={draft('form')} onChange={e => setDraft('form', e.target.value)} rows={3} />}<button className="primary" type="submit">{page.form.kind === 'publish' ? '打开报道编辑器' : '提交'}</button></form>}</section>}
          {!!page.links.length && <nav className="site-links" aria-label="相关页面"><h3>继续查阅</h3>{page.links.map(link => <button key={link.address} onClick={() => navigate(link.address)}>{link.label}<small>{link.address}</small></button>)}</nav>}
        </article> : <article className="not-found"><h2>这个地址没有收录。</h2><p>核对地址中的字母和斜杠，或返回内网主页找线索。</p><code>{address}</code><button onClick={() => navigate('内网主页')}>返回内网主页</button></article>}
      </div>
    </div>
  </div>;
}
