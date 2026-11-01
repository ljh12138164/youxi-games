import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { connectYouxiPlatform } from '@shared/platform';
import { Art } from './Art.tsx';
import { ItemTooltip } from './ItemTooltip.tsx';
import { ForestAudio } from './audio.ts';
import { EVENTS, FLOOR_NAMES, ITEMS, ITEM_MAP, ENEMY_MAP } from './content.ts';
import { act, adjacent, canPlace, COLS, ROWS, DIFFICULTIES, difficultyOf, expansionCells, intent, key, newRun, power, routes, shape, type Action, type Difficulty, type Item, type NodeKind, type Run } from './engine.ts';
import { parseSave, readSave, restoreBackup, writeSave } from './storage.ts';
import backdrop from './assets/forest-path.png';
import atlas from './assets/forest-atlas.png';

const loaded=readSave();
const sound=new ForestAudio();
const NODE_NAMES:Record<NodeKind,string>={battle:'林间遭遇',elite:'守卫挑战',boss:'遗迹守卫',shop:'旅人小摊',rest:'树下营地',event:'林中见闻'};
const NODE_SIGNS:Record<NodeKind,string>={battle:'⚔',elite:'♜',boss:'♛',shop:'♧',rest:'⌂',event:'?'};
type Modal='help'|'saves'|'codex'|'restart'|'discard'|'discardItem'|null;
type Drag={uid:number;pointerId:number;rotation:number;clientX:number;clientY:number;startX:number;startY:number;offsetX:number;offsetY:number;moved:boolean};

export function App(){
  const [run,setRun]=useState<Run>(()=>loaded.run??newRun());
  const runRef=useRef(run);
  const [started,setStarted]=useState(false);
  const [difficulty,setDifficulty]=useState<Difficulty>(loaded.run?.difficulty??(loaded.run?'easy':'normal'));
  const startedRef=useRef(started);startedRef.current=started;
  const [ready,setReady]=useState(false);
  const [notice,setNotice]=useState(loaded.error??'');
  const [selected,setSelected]=useState<number|null>(null);
  const [tip,setTip]=useState<{uid:number;anchor:HTMLElement}|null>(null);
  const [rotation,setRotation]=useState(0);
  const selectedRef=useRef(selected);selectedRef.current=selected;
  const rotationRef=useRef(rotation);rotationRef.current=rotation;
  const [drag,setDrag]=useState<Drag|null>(null);
  const dragRef=useRef<Drag|null>(null);
  const [discardUid,setDiscardUid]=useState<number|null>(null);
  const [leaveAction,setLeaveAction]=useState<Action>({type:'leave'});
  const [modal,setModal]=useState<Modal>(null);
  const [muted,setMuted]=useState(()=>{try{return localStorage.getItem('youxi:backpack-expedition-h5:muted')==='true';}catch{return false;}});
  const [pauseVersion,setPauseVersion]=useState(0);
  const [frame,setFrame]=useState(0);
  const pauses=useRef(new Set<string>());
  const [json,setJson]=useState('');
  const [nickname,setNickname]=useState('独自远行');
  const bagRef=useRef<HTMLDivElement>(null);
  const groundRef=useRef<HTMLElement>(null);
  const sceneRef=useRef<HTMLElement>(null);
  const suppressClick=useRef(false);
  const selectedItem=[...run.items,...run.loot].find(i=>i.uid===selected);
  const inspectedItem=[...run.items,...run.loot].find(i=>i.uid===tip?.uid);
  const editable=!['battle','expand','won','lost'].includes(run.phase);
  const paused=pauses.current.size>0;
  const targetWeapon=run.phase==='battle'&&selectedItem&&ITEM_MAP[selectedItem.def].kind==='weapon'?selectedItem:undefined;
  const targetReady=!!targetWeapon&&!targetWeapon.used&&run.energy>=ITEM_MAP[targetWeapon.def].cost&&!paused;
  const combatHint=targetWeapon?(targetWeapon.used?'这件武器本回合已经用过了，换一件武器或结束回合。':run.energy<ITEM_MAP[targetWeapon.def].cost?'能量不够使用这件武器，可以吃干粮或结束回合。':`已选中${ITEM_MAP[targetWeapon.def].name}，再点击上方高亮的敌人攻击。`):'先点背包里的武器，再点敌人攻击。盾牌、药剂和干粮点击即用。';
  function showTargets(){
    setTip(null);
    sceneRef.current?.scrollIntoView({block:'center',behavior:'instant'});
    sceneRef.current?.querySelector<HTMLButtonElement>('.enemy:not(:disabled)')?.focus({preventScroll:true});
  }
  function updateDrag(next:Drag|null){dragRef.current=next;setDrag(next);}
  function rotateSelection(){
    const current=dragRef.current;
    if(current){
      const item=[...runRef.current.items,...runRef.current.loot].find(i=>i.uid===current.uid);
      if(!item)return;
      const height=Math.max(...shape(item.def,current.rotation).map(c=>c[1]))+1;
      const nextRotation=(current.rotation+1)%4;
      updateDrag({...current,rotation:nextRotation,offsetX:height-1-current.offsetY,offsetY:current.offsetX});
      setRotation(nextRotation);
    }else{
      const item=runRef.current.items.find(i=>i.uid===selectedRef.current);
      if(item){
        const nextRotation=(item.rotation+1)%4;
        if(commit({type:'place',uid:item.uid,x:item.x,y:item.y,rotation:nextRotation}))setRotation(nextRotation);
      }else setRotation(r=>(r+1)%4);
    }
  }
  function setPause(reason:string,active:boolean){
    if(active)pauses.current.add(reason);else pauses.current.delete(reason);
    sound.setPaused(pauses.current.size>0);setPauseVersion(v=>v+1);if(active){updateDrag(null);setTip(null);}
  }
  function replace(next:Run){
    runRef.current=next;setRun(next);setSelected(null);updateDrag(null);setTip(null);
    const saved=writeSave(next);if(!saved.ok)setNotice(saved.error??'保存失败');
  }
  function commit(action:Action){
    if(pauses.current.size)return false;
    const result=act(runRef.current,action);
    if(result.error){setNotice(result.error);return false;}
    runRef.current=result.run;setRun(result.run);
    const saved=writeSave(result.run);setNotice(saved.error??'');
    sound.play(action.type==='use'?'hit':action.type==='place'?'move':action.type==='end'?'end':'reward');
    setTip(null);if(action.type!=='place')setSelected(null);return true;
  }
  useEffect(()=>{sound.setUserMuted(muted);try{localStorage.setItem('youxi:backpack-expedition-h5:muted',String(muted));}catch{/* Optional preference. */}},[muted]);
  useEffect(()=>{
    let cancelled=false;
    const handle=connectYouxiPlatform({onIdentity:id=>setNickname(id.user?.nickname??'独自远行'),
      onState:s=>{setPause('sidebar',s.sidebar);setPause('boss',s.boss);},
      setTemporaryMuted:m=>sound.setTemporaryMuted(m),isRunning:()=>startedRef.current&&!pauses.current.size&&runRef.current.phase==='battle'});
    Promise.all([backdrop,atlas].map(src=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=reject;img.src=src;}))).then(()=>{
      if(!cancelled){setReady(true);handle?.ready();}
    }).catch(()=>{if(!cancelled)setNotice('画面素材没有加载成功，请刷新页面重试。');});
    const visibility=()=>setPause('hidden',document.hidden),blur=()=>updateDrag(null);
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);visibility();
    const timer=setInterval(()=>{if(startedRef.current&&!pauses.current.size&&runRef.current.phase==='battle')setFrame(f=>(f+1)%100000);},180);
    return()=>{cancelled=true;handle?.destroy();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);};
  },[]);
  useEffect(()=>{setPause('menu',modal!==null);},[modal]);
  useEffect(()=>{
    const outside=(e:PointerEvent)=>{if(!(e.target as HTMLElement).closest('.pack-item,.item-tooltip'))setTip(null);};
    document.addEventListener('pointerdown',outside);
    return()=>{document.removeEventListener('pointerdown',outside);};
  },[]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.altKey||e.ctrlKey||e.metaKey||(e.target as HTMLElement)?.closest('input,textarea,select'))return;
      if(e.code==='Space'&&startedRef.current&&!modal){e.preventDefault();setPause('manual',!pauses.current.has('manual'));}
      if(e.code==='Escape'){updateDrag(null);setSelected(null);setTip(null);if(modal)setModal(null);}
      if(e.code==='KeyR'&&editable&&!pauses.current.size){e.preventDefault();rotateSelection();}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[editable,modal]);
  function selectItem(item:Item,anchor:HTMLElement){
    if(paused)return;if(suppressClick.current){suppressClick.current=false;return;}
    setSelected(item.uid);setRotation(item.rotation);setTip({uid:item.uid,anchor});
    if(run.phase==='battle'&&['shield','heal','food'].includes(ITEM_MAP[item.def].kind))commit({type:'use',uid:item.uid});
  }
  function beginDrag(e:ReactPointerEvent<HTMLButtonElement>,item:Item,inBag:boolean){
    suppressClick.current=false;setTip(null);
    if(!editable||paused||e.button!==0)return;
    const rect=e.currentTarget.getBoundingClientRect(),cell=(bagRef.current?.getBoundingClientRect().width??490)/COLS;
    const initialRotation=!inBag&&selectedRef.current===item.uid?rotationRef.current:item.rotation;
    e.currentTarget.setPointerCapture(e.pointerId);setSelected(item.uid);setRotation(initialRotation);
    updateDrag({uid:item.uid,pointerId:e.pointerId,rotation:initialRotation,clientX:e.clientX,clientY:e.clientY,startX:e.clientX,startY:e.clientY,offsetX:inBag?Math.floor((e.clientX-rect.left)/cell):0,offsetY:inBag?Math.floor((e.clientY-rect.top)/cell):0,moved:false});
  }
  function moveDrag(e:ReactPointerEvent){const current=dragRef.current;if(current&&e.pointerId===current.pointerId)updateDrag({...current,clientX:e.clientX,clientY:e.clientY,moved:current.moved||Math.hypot(e.clientX-current.startX,e.clientY-current.startY)>4});}
  function dropPosition(d:Drag){const rect=bagRef.current?.getBoundingClientRect();if(!rect||d.clientX<rect.left||d.clientX>=rect.right||d.clientY<rect.top||d.clientY>=rect.bottom)return null;const cell=rect.width/COLS;return {x:Math.floor((d.clientX-rect.left)/cell)-d.offsetX,y:Math.floor((d.clientY-rect.top)/cell)-d.offsetY};}
  function overGround(d:Drag){const rect=groundRef.current?.getBoundingClientRect();return !!rect&&d.clientX>=rect.left&&d.clientX<=rect.right&&d.clientY>=rect.top&&d.clientY<=rect.bottom;}
  function endDrag(e:ReactPointerEvent){
    const current=dragRef.current;if(!current||current.pointerId!==e.pointerId)return;
    const final={...current,clientX:e.clientX,clientY:e.clientY,moved:current.moved||Math.hypot(e.clientX-current.startX,e.clientY-current.startY)>4};
    updateDrag(null);
    if(final.moved){
      if(overGround(final)){if(runRef.current.items.some(i=>i.uid===final.uid))commit({type:'stash',uid:final.uid});}
      else{const pos=dropPosition(final);if(pos)commit({type:'place',uid:final.uid,...pos,rotation:final.rotation});}
      suppressClick.current=true;e.preventDefault();
    }
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const leaveWith=(action:Action)=>{if(run.loot.length){setLeaveAction(action);setModal('discard');}else commit(action);};
  const maybeLeave=()=>leaveWith({type:'leave'});
  const dragItem=[...run.items,...run.loot].find(i=>i.uid===drag?.uid);
  const preview=drag&&dragItem?dropPosition(drag):null;
  const previewCells=preview&&dragItem&&drag?shape(dragItem.def,drag.rotation).map(([x,y])=>key(x+preview.x,y+preview.y)):[];
  const validPreview=preview&&dragItem&&drag?canPlace(run,dragItem,preview.x,preview.y,drag.rotation):false;
  const groundHovered=drag?.moved&&overGround(drag);
  const bagBox=bagRef.current?.getBoundingClientRect();
  const ghostCell=(bagBox?.width??490)/COLS;
  const ghostShape=dragItem&&drag?shape(dragItem.def,drag.rotation):[];
  const ghostWidth=ghostShape.length?Math.max(...ghostShape.map(c=>c[0]))+1:1;
  const ghostHeight=ghostShape.length?Math.max(...ghostShape.map(c=>c[1]))+1:1;
  const ghostLeft=bagBox&&preview?Math.max(bagBox.left,Math.min(bagBox.left+preview.x*ghostCell,bagBox.right-ghostWidth*ghostCell)):Math.max(0,Math.min((drag?.clientX??0)+12,window.innerWidth-ghostWidth*ghostCell));
  const ghostTop=bagBox&&preview?Math.max(bagBox.top,Math.min(bagBox.top+preview.y*ghostCell,bagBox.bottom-ghostHeight*ghostCell)):Math.max(0,Math.min((drag?.clientY??0)+12,window.innerHeight-ghostHeight*ghostCell));
  const difficultyPicker=<fieldset className="difficulty-picker"><legend>远征难度</legend><div className="flex gap-2">{(Object.keys(DIFFICULTIES) as Difficulty[]).map(id=><button key={id} type="button" aria-pressed={difficulty===id} onClick={()=>setDifficulty(id)}>{DIFFICULTIES[id].name}{id==='normal'?' · 推荐':''}</button>)}</div><p>{DIFFICULTIES[difficulty].description}</p><small>初始金币 {DIFFICULTIES[difficulty].gold} · 背包 24 格 · 难度在本次远征中固定</small></fieldset>;
  const synergy=selectedItem?run.items.filter(i=>i.uid!==selectedItem.uid&&adjacent(i,selectedItem)).map(i=>i.uid):[];
  const itemButton=(item:Item,inBag:boolean)=>{
    const d=ITEM_MAP[item.def],s=shape(item.def,item.rotation),w=Math.max(...s.map(c=>c[0]))+1,h=Math.max(...s.map(c=>c[1]))+1;
    const artRotation=!inBag&&selected===item.uid?rotation:item.rotation;
    const lShapes=['polygon(0 0,50% 0,50% 50%,100% 50%,100% 100%,0 100%)','polygon(0 0,100% 0,100% 50%,50% 50%,50% 100%,0 100%)','polygon(0 0,100% 0,100% 100%,50% 100%,50% 50%,0 50%)','polygon(50% 0,100% 0,100% 100%,0 100%,0 50%,50% 50%)'];
    return <button key={item.uid} type="button" className={`pack-item rarity-${d.rarity} ${selected===item.uid?'selected':''} ${synergy.includes(item.uid)?'neighbor':''} ${run.phase==='battle'&&item.used?'spent':''} ${drag?.moved&&drag.uid===item.uid?'drag-source':''} ${inBag?'in-bag':'in-loot'} ${run.phase==='battle'&&d.kind==='weapon'&&!item.used&&run.energy>=d.cost?'available-weapon':''}`}
      style={inBag?{gridColumn:`${item.x+1} / span ${w}`,gridRow:`${item.y+1} / span ${h}`,clipPath:item.def==='branchblade'?lShapes[item.rotation]:undefined}:{}}
      aria-label={`${d.name}，${inBag?'背包内':'待整理'}，${d.cost} 能量`} aria-haspopup="dialog" aria-expanded={tip?.uid===item.uid}
      onClick={e=>selectItem(item,e.currentTarget)} onPointerDown={e=>beginDrag(e,item,inBag)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={()=>updateDrag(null)} onLostPointerCapture={e=>{if(dragRef.current?.pointerId===e.pointerId)updateDrag(null);}} onDragStart={e=>e.preventDefault()}>
      <div className="item-art-wrap"><Art icon={d.icon} style={{width:`${(artRotation%2?h/w:1)*100}%`,height:`${(artRotation%2?w/h:1)*100}%`,transform:`translate(-50%,-50%) rotate(${artRotation*90}deg)`}}/></div><span className="item-name">{d.name}</span>{inBag&&run.phase==='battle'&&<span className="item-cost">{item.used?'已用':d.kind==='charm'||d.kind==='armor'?'被动':`${d.cost} ◆`}</span>}
    </button>;
  };
  return <main className={`forest-game ${paused?'is-paused':''}`} data-phase={run.phase} data-running={started&&!paused&&run.phase==='battle'} data-idle-frame={frame} data-pauses={pauseVersion}>
    <header className="forest-header"><button className="wordmark" onClick={()=>setModal('help')}><span className="leaf-mark">❧</span><span>背包远征<small>林间行囊 · FOREST SATCHEL</small></span></button>
      <div className="journey-status"><span>第 {run.floor} 层 <b>{FLOOR_NAMES[run.floor-1]}</b></span><span className="hp">♥ {run.hp}<small>/{run.maxHp}</small></span><span className="gold">◉ {run.gold}</span></div>
      <nav aria-label="游戏菜单"><button onClick={()=>{setDifficulty(run.difficulty??'easy');setModal('restart');}}>难度 · {difficultyOf(run).name}</button><button onClick={()=>setModal('codex')}>图鉴</button><button onClick={()=>{setJson('');setModal('saves');}}>存档</button><button onClick={()=>setMuted(!muted)}>{muted?'声音关':'声音开'}</button><button onClick={()=>setPause('manual',!pauses.current.has('manual'))}>{pauses.current.has('manual')?'继续':'暂停'}</button></nav>
    </header>
    {!started?<section className="title-screen" style={{backgroundImage:`linear-gradient(90deg,rgba(16,25,15,.92),rgba(16,25,15,.15)),url(${backdrop})`}}><div className="title-copy"><p className="eyebrow">一只背包，一条通往森林深处的路</p><h1>把旅途<br/>装进行囊。</h1><p>挪一格，换一种搭配。<br/>带上草药、木盾和一点运气，走进古老的森林。</p>{!loaded.run&&difficultyPicker}{loaded.run&&<p>当前难度：{difficultyOf(run).name}</p>}<button className="primary large" disabled={!ready} onClick={()=>{setStarted(true);if(!loaded.run)replace(newRun(Date.now(),difficulty));}}>{!ready?'正在收拾行囊…':loaded.run?'继续远征':'收拾好，出发'}</button><button className="text-button" onClick={()=>setModal('help')}>第一次来？看看怎么玩 ↗</button><small>单人策略冒险 · 回合制 · 随时保存</small></div><div className="title-hero"><Art icon={0}/></div></section>:<>
      <section ref={sceneRef} className={`forest-scene floor-${run.floor}`} style={{backgroundImage:`url(${backdrop})`}} aria-label="森林战场"><div className="scene-caption"><span>{run.phase==='battle'?`第 ${run.turn} 回合`:run.phase==='prepare'?'前方有敌人':run.phase==='loot'?'战斗结束':run.phase==='won'?'远征完成':run.phase==='lost'?'旅途暂歇':'森林里还有路'}</span><small>{nickname}</small></div>
        <div className={`hero actor ${frame%4===0?'breathing':''}`}><Art icon={0}/><div className="actor-hp"><i style={{width:`${run.hp/run.maxHp*100}%`}}/></div><span>♥ {run.hp}/{run.maxHp}{run.block?` · 盾 ${run.block}`:''}{run.poison?` · 毒 ${run.poison}`:''}</span></div>
        <div className="enemy-line">{run.enemies.filter(e=>e.hp>0).map(enemy=>{const d=ENEMY_MAP[enemy.def],next=intent(run,enemy);return <button key={enemy.uid} className={`enemy actor ${run.node==='boss'?'boss':''} ${targetReady?'attack-target':''}`} disabled={paused||run.phase!=='battle'} aria-label={`攻击${d.name}`} onClick={()=>{if(targetWeapon)commit({type:'use',uid:targetWeapon.uid,target:enemy.uid});else setNotice('先点背包里的武器，再点敌人攻击。');}}><span className={`intent ${next.kind}`}>{next.kind==='attack'?'⚔ 攻击':next.kind==='guard'?'◇ 护盾':'☠ 中毒'} {next.value}</span><Art icon={d.icon}/><div className="actor-hp"><i style={{width:`${enemy.hp/d.hp*100}%`}}/></div><span>{targetReady?'点击攻击 · ':''}{d.name} · {enemy.hp}/{d.hp}{enemy.block?` · 盾${enemy.block}`:''}{enemy.poison?` · 毒${enemy.poison}`:''}</span></button>;})}</div>
      </section>
      <div className="game-columns"><section className="inventory-panel" aria-label="背包整理"><div className="panel-heading"><div><p className="eyebrow">YOUR SATCHEL</p><h2>林间行囊 <small>{run.bag.length} 格</small></h2></div><span className="energy">◆ {run.energy} <small>能量</small></span></div>
        <div className="bag-frame"><div ref={bagRef} className="bag-grid" style={{gridTemplateColumns:`repeat(${COLS},1fr)`,gridTemplateRows:`repeat(${ROWS},1fr)`}}>{Array.from({length:COLS*ROWS},(_,i)=>{const x=i%COLS,y=Math.floor(i/COLS),k=key(x,y),open=run.bag.includes(k),expand=run.phase==='expand'&&expansionCells(run).includes(k);return <button type="button" key={k} className={`bag-cell ${open?'open':'locked'} ${expand?'expandable':''} ${previewCells.includes(k)?validPreview?'valid':'invalid':''}`} style={{gridColumn:x+1,gridRow:y+1}} aria-label={expand?`扩容 ${x+1},${y+1}`:`格子 ${x+1},${y+1}`} disabled={paused||(!open&&!expand)} onClick={()=>{if(expand)commit({type:'expand',cell:k});else if(selectedItem&&editable)commit({type:'place',uid:selectedItem.uid,x,y,rotation});}}>{expand?'+':!open?'·':''}</button>;})}{run.items.map(i=>itemButton(i,true))}</div></div>
        <div className="bag-toolbar"><span>{run.phase==='battle'?'先点武器 → 再点上方敌人 · 盾牌和补给点击即用':'拖动摆放 · R 旋转 · 也可先选物品，再点空格'}</span><button disabled={paused||!selectedItem||!editable} onClick={()=>{setRotation(r=>(r+1)%4);if(selectedItem&&run.items.some(i=>i.uid===selectedItem.uid))commit({type:'place',uid:selectedItem.uid,x:selectedItem.x,y:selectedItem.y,rotation:(selectedItem.rotation+1)%4});}}>旋转 R</button></div>
        
      </section><aside className="journey-panel">
        <section className={`route-panel ${['prepare','battle'].includes(run.phase)?'battle-controls':''}`} aria-label="当前行动">
          {run.phase==='map'&&<><div className="section-title"><h2>下一站</h2><span>{run.step+1} / 6</span></div><div className="route-progress">{Array.from({length:6},(_,i)=><span key={i} className={i<run.step?'done':i===run.step?'current':''}>{i===5?'♛':i+1}</span>)}</div><div className="route-options">{routes(run).map((kind,i)=><button key={i} disabled={paused||run.loot.length>0} onClick={()=>commit({type:'node',kind})}><span className="node-symbol">{NODE_SIGNS[kind]}</span><span><b>{NODE_NAMES[kind]}</b><small>{kind==='battle'?'战斗、金币与新装备':kind==='elite'?'更危险，也有更多金币':kind==='shop'?'买卖装备，整理行囊':kind==='rest'?'恢复生命或增加上限':kind==='boss'?'击败守卫，进入下一层':'停下来，看看发生了什么'}</small></span><span>↗</span></button>)}</div></>}
          {run.phase==='prepare'&&<><h2>整装待发</h2><p>先整理背包，再点下方按钮。开战后，先点武器，再点敌人攻击。</p><button className="primary" disabled={paused} onClick={()=>commit({type:'start'})}>开始战斗 <span>⚔</span></button></>}
          {run.phase==='battle'&&<><div className="turn-note"><span>你的回合</span><b>◆ {run.energy} 能量</b></div><div className="combat-steps" aria-label="攻击步骤"><span className={targetReady?'':'current'}>先点武器</span><span aria-hidden="true">→</span><span className={targetReady?'current':''}>再点敌人</span></div><p className="combat-hint" role="status">{combatHint}</p>{targetReady&&<button className="target-jump" onClick={showTargets}>去选择敌人 ↑</button>}<button className="primary" disabled={paused} onClick={()=>commit({type:'end'})}>结束回合 <span>→</span></button></>}
          {run.phase==='loot'&&<><h2>战利品整理</h2><p>没放进背包的物品会留在这里。</p><button className="primary" disabled={paused} onClick={maybeLeave}>继续前进 <span>→</span></button></>}
          {run.phase==='shop'&&<><h2>旅人小摊</h2><div className="shop-grid">{run.offers.map(id=><button key={id} disabled={paused} onClick={()=>commit({type:'buy',def:id})} title={ITEM_MAP[id].description}><Art icon={ITEM_MAP[id].icon}/><b>{ITEM_MAP[id].name}</b><span>◉ {ITEM_MAP[id].price}</span></button>)}</div><button className="primary" disabled={paused} onClick={maybeLeave}>收好行囊，继续走</button></>}
          {run.phase==='rest'&&<><h2>在树下歇一会儿</h2><p>火还温着，刚好可以坐下来喘口气。</p><button className="primary" disabled={paused} onClick={()=>leaveWith({type:'rest',choice:'heal'})}>好好休息 · 恢复 12 点生命</button><button className="secondary" disabled={paused} onClick={()=>leaveWith({type:'rest',choice:'grow'})}>整理补给 · 生命上限 +4</button></>}
          {run.phase==='event'&&<><h2>{EVENTS[run.event].name}</h2><p>{EVENTS[run.event].text}</p><button className="primary" disabled={paused} onClick={()=>leaveWith({type:'event',accept:true})}>{EVENTS[run.event].action}</button><button className="secondary" disabled={paused} onClick={()=>leaveWith({type:'event',accept:false})}>不打扰，继续走</button></>}
          {run.phase==='expand'&&<><h2>多带一点好东西</h2><p>这一程走得不错。选一格与背包相连的空位，把行囊扩得更大一些。</p></>}
          {['won','lost'].includes(run.phase)&&<><h2>{run.phase==='won'?'森林另一头，天亮了':'这次先走到这里'}</h2><p>{run.phase==='won'?'你走过三层遗迹，找到了离开森林的路。':'带上这次学到的搭配，下回再走远一点。'}</p><p>击败 {run.kills} 名敌人 · 完成 {run.battles} 场战斗 · 发现 {run.discoveries.length} 件物品</p><button className="primary" onClick={()=>setModal('restart')}>再走一趟</button></>}
        </section>

        {editable&&<section ref={groundRef} className={`ground-area ${groundHovered?'ground-hover':''}`} aria-label="地上物品">
          <div className="flex items-center justify-between gap-3"><h2>地上物品 <small>{run.loot.length} 件</small></h2><button className="ground-stash" disabled={paused||!selectedItem||!run.items.some(i=>i.uid===selectedItem.uid)} onClick={()=>{if(selectedItem)commit({type:'stash',uid:selectedItem.uid});}}>放下选中物品</button></div>
          <p>{run.phase==='loot'?'战利品和暂放的装备都在这里。':'把装备拖到这片区域，先腾出背包位置。'}放回背包才能带走。</p>
          <div className="ground-items">{run.loot.length?run.loot.map(i=>itemButton(i,false)):<div className="ground-empty">拖到这里暂放<br/><small>离开前可以随时拿回</small></div>}</div>
          {run.phase==='map'&&run.loot.length>0&&<button className="text-button" disabled={paused} onClick={maybeLeave}>放弃地上物品，继续选路</button>}
        </section>}
        {notice&&<div className="notice" role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button></div>}
<details className="travel-log"><summary>沿途记录 <span>＋</span></summary><ol>{run.log.map((text,i)=><li key={`${i}-${text}`}>{text}</li>)}</ol></details>
      </aside></div><footer className="game-footer"><span>第 {run.floor} 层 / 共 3 层 · 找到 {run.discoveries.length} / {ITEMS.length} 件物品</span><span>每次行动后自动保存 <button onClick={()=>setModal('help')}>玩法说明</button></span></footer>
    </>}
    {pauses.current.has('manual')&&!modal&&<div className="pause-curtain"><p className="eyebrow">TAKE A BREATH</p><h2>歇一会儿。</h2><p>行囊和路都在这里等你。</p><button className="primary" onClick={()=>setPause('manual',false)}>继续远征</button></div>}
    {modal&&<div className="modal-curtain" onClick={()=>setModal(null)}><section className={`forest-modal ${modal==='codex'?'wide':''}`} role="dialog" aria-modal="true" aria-label="游戏菜单" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(null)} aria-label="关闭">×</button>
      {modal==='help'&&<><p className="eyebrow">A LITTLE FIELD GUIDE</p><h2>出发前，记住这几件事</h2><ol className="help-list"><li><b>把东西摆进背包。</b>拖动摆放，按 R 旋转。也可以先选物品，再点目标格子。花朵、戒指与武器边相邻时能增加伤害；弓能用到同行箭束与钥匙的加成。</li><li><b>先看敌人要做什么。</b>开始战斗后，位置固定。每回合有 3 点能量，每件装备每回合最多使用一次。护符和靴子自动生效。</li><li><b>留一点能量给盾牌。</b>护盾抵挡普通攻击，下回合开始时清除，再获得靴子的护盾。中毒无视护盾，每回合结算后减少一层。</li><li><b>战利品要装得下。</b>离开时，没装进背包的物品会被放弃。每两场战斗和层末守卫后有一次扩容。</li><li><b>慢慢走完三层森林。</b>{difficultyOf(run).recovery?`每次战斗后恢复 ${difficultyOf(run).recovery} 点生命。`:'当前难度战后不恢复生命。'}{difficultyOf(run).rescues?'每次远征有一次濒死救援，恢复一半生命。':'当前难度没有濒死救援。'}行动后自动保存，空间键暂停，Esc 取消选择。</li></ol><button className="primary" onClick={()=>setModal(null)}>记住了</button></>}
      {modal==='saves'&&<><h2>把旅途存好</h2><p>进度存在当前浏览器里。清理浏览器数据前，记得导出一份。</p><div className="save-buttons"><button className="secondary" onClick={()=>setJson(JSON.stringify(runRef.current,null,2))}>导出到文本框</button><button className="secondary" onClick={()=>{const result=readSave();if(result.run){replace(result.run);setModal(null);setNotice('已读取最新进度。');}else setNotice(result.error??'还没有存档。');}}>读取最新进度</button><button className="secondary" onClick={()=>{try{replace(restoreBackup());setModal(null);setNotice('已恢复上一次保存。');}catch(e){setNotice(String(e));}}}>恢复备份</button></div><textarea aria-label="存档 JSON" rows={6} value={json} onChange={e=>setJson(e.target.value)} placeholder="导出后复制保存，或粘贴已有存档。"/><button className="primary" onClick={()=>{try{replace(parseSave(json));setModal(null);setStarted(true);}catch(e){setNotice(e instanceof Error?e.message:'导入失败。');}}}>校验并导入</button><button className="text-button danger" onClick={()=>setModal('restart')}>重新开始一趟远征</button></>}
      {modal==='codex'&&<><p className="eyebrow">COLLECTION</p><h2>行囊里的见闻 <small>{run.discoveries.length} / {ITEMS.length}</small></h2><div className="codex-grid">{ITEMS.map(d=><article key={d.id} className={run.discoveries.includes(d.id)?'':'undiscovered'}><Art icon={d.icon}/><b>{run.discoveries.includes(d.id)?d.name:'尚未发现'}</b><p>{run.discoveries.includes(d.id)?d.description:'继续探索森林。'}</p></article>)}</div></>}
      {modal==='restart'&&<><h2>重新出发？</h2><p>当前远征会被替换。想留住这次进度，可以先在存档菜单导出。选择的难度从新远征开始生效。</p>{difficultyPicker}<button className="primary" onClick={()=>{const next=newRun(Date.now(),difficulty);next.discoveries=[...new Set([...run.discoveries,...next.discoveries])];replace(next);setStarted(true);setModal(null);}}>收拾行囊，重新出发</button><button className="secondary" onClick={()=>setModal('saves')}>先保存这次进度</button></>}
      {modal==='discardItem'&&<><h2>丢弃这件物品？</h2><p>{ITEM_MAP[[...run.items,...run.loot].find(i=>i.uid===discardUid)?.def??"staff"].name}会从行囊中移除，不能再拿回来。想先腾位置，可以取消后把它放到地上。</p><button className="primary" onClick={()=>{if(discardUid!==null){setPause("menu",false);commit({type:"discard",uid:discardUid});}setModal(null);setDiscardUid(null);}}>确认丢弃</button><button className="secondary" onClick={()=>{setModal(null);setDiscardUid(null);}}>先留着</button></>}
      {modal==='discard'&&<><h2>这些东西不带走了？</h2><p>还有 {run.loot.length} 件物品没放进背包。离开后就不能回来领取了。</p><button className="primary" onClick={()=>{setPause('menu',false);commit(leaveAction);setModal(null);}}>{run.phase==='map'?'放弃地上物品，继续选路':'放弃剩余物品，继续前进'}</button><button className="secondary" onClick={()=>setModal(null)}>再整理一下</button></>}
      {notice&&<p className="modal-notice" role="status">{notice}</p>}
    </section></div>}
    {started&&tip&&inspectedItem&&!paused&&!drag?.moved&&<ItemTooltip anchor={tip.anchor} name={ITEM_MAP[inspectedItem.def].name} onClose={()=>setTip(null)}><div className="inspect-title"><Art icon={ITEM_MAP[inspectedItem.def].icon}/><div><h2>{ITEM_MAP[inspectedItem.def].name}</h2><small>{shape(inspectedItem.def,rotation).length} 格 · {ITEM_MAP[inspectedItem.def].cost} 能量</small></div></div>{run.phase==='battle'&&ITEM_MAP[inspectedItem.def].kind==='weapon'&&<div className="weapon-instruction"><p>{combatHint}</p>{targetReady&&<button className="secondary" onClick={showTargets}>去选择敌人 ↑</button>}</div>}<p>{ITEM_MAP[inspectedItem.def].description}</p>{editable&&<button className="secondary discard-item" onClick={()=>{setDiscardUid(inspectedItem.uid);setModal("discardItem");}}>丢弃这件物品</button>}{ITEM_MAP[inspectedItem.def].kind==='weapon'&&<p className="effect-total">当前伤害 {power(run,inspectedItem).value}<small>{power(run,inspectedItem).sources.join(' · ')||'试试把护符放在武器旁边。'}</small></p>}{editable&&run.items.some(i=>i.uid===inspectedItem.uid)&&<button className="secondary" onClick={()=>commit({type:'stash',uid:inspectedItem.uid})}>放到地上，腾出位置</button>}{run.phase==='shop'&&run.items.some(i=>i.uid===inspectedItem.uid)&&<button className="secondary" onClick={()=>commit({type:'sell',uid:inspectedItem.uid})}>出售 · {Math.floor(ITEM_MAP[inspectedItem.def].price/2)} 金币</button>}</ItemTooltip>}
    {drag&&drag.moved&&dragItem&&(preview||groundHovered)&&<div className={`drag-ghost ${validPreview?'valid-drop':'invalid-drop'}`} style={{left:ghostLeft,top:ghostTop,width:ghostWidth*ghostCell,height:ghostHeight*ghostCell}}><div className="item-art-wrap"><Art icon={ITEM_MAP[dragItem.def].icon} style={{width:`${(drag.rotation%2?ghostHeight/ghostWidth:1)*100}%`,height:`${(drag.rotation%2?ghostWidth/ghostHeight:1)*100}%`,transform:`translate(-50%,-50%) rotate(${drag.rotation*90}deg)`}}/></div><span>{groundHovered?'松开放到地上，之后还能拿回来':validPreview?'松开即可放入':'这里放不下，松开会回到原位'}</span></div>}
  </main>;
}
