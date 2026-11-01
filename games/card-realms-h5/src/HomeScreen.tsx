import { DIFFICULTIES, difficultyOf, type Difficulty } from './core/difficulty.ts';
import type { RunState } from './core/types.ts';

type Props = {
  run: RunState; ready: boolean; difficulty: Difficulty; notice: string | null;
  onContinue: () => void; onNew: () => void; onSaves: () => void; onSettings: () => void;
  onDifficulty: (difficulty: Difficulty) => void;
};

export function HomeScreen({run,ready,difficulty,notice,onContinue,onNew,onSaves,onSettings,onDifficulty}:Props){
  return <section className="cr-home" aria-label="卡牌领地首页">
    <header className="cr-home-nav"><span>卡牌领地</span><div className="flex gap-4"><button onClick={onSaves}>存档管理</button><button onClick={onSettings}>设置</button></div></header>
    <div className="cr-home-layout">
      <div className="cr-home-copy"><h1>一张牌，<br/>一片领地。</h1><p className="cr-home-intro">让村民采集，把木石变成房屋。<br/>一边搭起聚落，一边准备下一顿饭。</p>
        <div className="cr-home-save"><strong>槽位 {run.slotId} · 第 {run.month} 月 · {difficultyOf(run).name}{run.peacefulMode?' · 和平':''}</strong><span>{run.isGameOver?'这次旅程已经结束，可以换个难度再来。':run.tickCount>0?`已开启 ${run.stats.packsOpened} 包卡牌，牌桌还在等你。`:'村民、木石和第一包卡牌都准备好了。'}</span></div>
        {notice&&<p className="cr-home-notice" role="status">{notice}</p>}
        <div className="cr-home-actions"><button className="cr-home-primary" disabled={!ready||run.isGameOver} onClick={onContinue}>{!ready?'正在整理牌桌…':run.tickCount>0?'继续游戏':'进入牌桌'}<span aria-hidden="true">→</span></button><button className="cr-home-secondary" disabled={!ready} onClick={onNew}>新游戏</button></div>
        <fieldset className="cr-home-difficulty"><legend>下一局，想怎么玩？</legend><div className="flex flex-wrap gap-2">{(Object.keys(DIFFICULTIES) as Difficulty[]).map(id=><button key={id} aria-pressed={difficulty===id} onClick={()=>onDifficulty(id)}>{DIFFICULTIES[id].name}</button>)}</div><p>{DIFFICULTIES[difficulty].description}</p><small>选择后点“新游戏”确认；当前牌桌的难度不会改变。</small></fieldset>
      </div>
      <div className="cr-home-table" aria-hidden="true">
        <div className="cr-home-table-line"/>
        <article className="cr-title-card cr-title-resource"><span>树木</span><svg viewBox="0 0 180 190"><path d="M79 160V91h24v69" fill="#876141"/><path d="M89 19 36 99h25l-37 35h132l-36-35h25L93 19Z" fill="#526e42" stroke="#31472e" strokeWidth="4"/><path d="m90 63-20 45h21l-17 26" fill="none" stroke="#82915d" strokeWidth="5"/></svg><small>采集木材</small></article>
        <article className="cr-title-card cr-title-house"><span>房屋</span><svg viewBox="0 0 180 190"><path d="M35 87h109v78H35Z" fill="#d5b983" stroke="#765438" strokeWidth="4"/><path d="m20 87 69-60 70 60Z" fill="#9e6245" stroke="#765438" strokeWidth="4"/><path d="M73 165v-48h32v48M46 99h16v24H46m71-24h16v24h-16" fill="#574b36"/><path d="M119 36V15h17v37" fill="#9e6245" stroke="#765438" strokeWidth="4"/></svg><small>留下一个家</small></article>
        <article className="cr-title-card cr-title-villager"><span>村民</span><svg viewBox="0 0 180 190"><path d="M47 178v-46q0-29 42-29t43 29v46" fill="#65754c" stroke="#42503a" strokeWidth="4"/><path d="M65 52q25-24 50 0v38q-25 35-50 0Z" fill="#dfb78c" stroke="#866444" strokeWidth="3"/><path d="M59 62V43q28-29 61 0v19l-20-18-8 20-10-11Z" fill="#66513c"/><path d="M77 79h4m22 0h4m-25 18q8 6 17 0" stroke="#66513c" strokeWidth="4" fill="none"/><path d="m52 143 79 24" stroke="#ccb182" strokeWidth="10"/></svg><small>从这里开始</small></article>
        <p className="cr-home-table-note">采集 · 合成 · 建造 · 生存</p>
      </div>
    </div>
    <footer className="cr-home-footer"><details><summary>第一次玩？</summary><p>把村民拖到树木或浆果丛上采集，叠放材料尝试合成。出售多余卡牌能买新卡包；月末记得给村民留够食物。空格暂停，拖动时也可自动暂停。</p></details><span>单人聚落经营 · 本机三槽存档</span></footer>
  </section>;
}
