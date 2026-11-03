import {act,adjacent,canPlace,cellsOf,COLS,ROWS,DIFFICULTIES,difficultyOf,encounterHint,expansionCells,intent,key,newRun,poisonOnHit,power,priceOf,REFRESH_PRICE,routes,shape,stepsInFloor,swapPlan,type Action,type Difficulty,type Item,type NodeKind,type Run} from './engine.ts';
import {ENEMY_MAP,EVENTS,ITEMS,ITEM_MAP,FLOOR_NAMES} from './content.ts';
import {ACTOR_SPRITES} from './actor-sprites.ts';
import {ITEM_SPRITES} from './item-sprites.ts';
import {createSaveStore,parseSave,SAVE_KEY} from './storage.ts';
import type {GameHit,GameInput,GamePlatform,GameSnapshot} from './canvas-platform.ts';

const NODES:Record<NodeKind,string>={battle:'林间遭遇',elite:'守卫挑战',boss:'遗迹守卫',shop:'旅人小摊',rest:'树下营地',event:'林中见闻'};
const C={bg:'#20291d',panel:'#172015',edge:'#7e9160',ink:'#f4e9cd',gold:'#b88b3f',paper:'#c0a674',dark:'#172015',red:'#914c36',green:'#647d42'};
type Motion={def:string;kind:string;elapsed:number;result:string;target?:number};
type Drag={uid:number;rotation:number;x:number;y:number;startX:number;startY:number;moved:boolean};
type Press={x:number;y:number;startY:number;touch:boolean;hit?:GameHit;moved:boolean;scroll:number;held:number};

// Both delivery targets use this scene. Only input, storage, audio and host lifecycle differ.
export function createBackpackGame(platform:GamePlatform){
  const {canvas}=platform,ctx=canvas.getContext('2d')!,store=createSaveStore(platform.storage,platform.saveKey??SAVE_KEY);
  const loaded=store.readSave();let run:Run=loaded.run??newRun(),started=false,ready=false,notice=loaded.error??'';
  let difficulty:Difficulty=run.difficulty??'easy',selected:number|null=null,rotation=0,screen:string|null=null,nickname='独自远行';
  let muted=false,frame=0,clock=0,scroll=0,modalScroll=0,maxScroll=0,maxModalScroll=0,dy=0,focus=-1;
  let W=390,H=844,scale=1,top=0,bottom=0,contentTop=0,contentBottom=0,clipTop=0,clipBottom=0;
  let hits:GameHit[]=[],press:Press|null=null,drag:Drag|null=null,motion:Motion|null=null,confirmAction:(()=>void)|null=null,confirmText='',confirmLabel='确认';
  let bag={x:16,y:0,cell:50},ground={x:0,y:0,w:0,h:0},loadedAssets=0,failed=false;
  let renderedText:string[]=[],neighbors:number[]=[],preview:GameSnapshot['ui']['preview']=null,tooltip:number|null=null,paper=false,tipScroll=0,maxTipScroll=0;
  let tooltipBounds:{x:number;y:number;w:number;h:number}|null=null,logOpen=false,tooltipHitStart=0;
  const images:Record<string,HTMLImageElement>={},pauses=new Set<string>();
  try{muted=platform.storage.getItem((platform.saveKey??SAVE_KEY)+':muted')==='true';}catch{/* Optional preference. */}
  platform.sound.setUserMuted(muted);
  function getState():GameSnapshot{return JSON.parse(JSON.stringify({running:started&&ready&&!pauses.size&&run.phase==='battle',frame,paused:[...pauses],started,ready,run,selected,rotation,screen,notice,motion,scroll,ui:{text:renderedText,neighbors,tooltip,preview}}));}
  function syncPause(){platform.sound.setPaused(pauses.size>0);}
  function setPause(reason:string,active:boolean){if(active)pauses.add(reason);else pauses.delete(reason);if(active){drag=null;press=null;tooltip=null;}syncPause();draw();}
  function open(name:string|null){screen=name;modalScroll=0;focus=-1;tooltip=null;if(name)pauses.add('menu');else pauses.delete('menu');syncPause();drag=null;press=null;draw();}
  function save(){const result=store.writeSave(run);if(!result.ok)notice=result.error??'保存失败，请导出进度。';}
  function replace(next:Run){run=next;selected=null;drag=null;motion=null;scroll=0;save();draw();}
  function confirm(text:string,action:()=>void,label='确认'){confirmText=text;confirmAction=action;confirmLabel=label;open('confirm');}
  function toggleMute(){muted=!muted;platform.sound.setUserMuted(muted);try{platform.storage.setItem((platform.saveKey??SAVE_KEY)+':muted',String(muted));}catch{/* Optional preference. */}draw();}
  function openRestart(){difficulty=run.difficulty??'easy';open('restart');}
  function commit(action:Action){
    if(pauses.size||!ready)return false;
    const before=run,result=act(run,action);if(result.error){notice=result.error;draw();return false;}
    if(action.type==='use'){
      const item=before.items.find(i=>i.uid===action.uid)!,d=ITEM_MAP[item.def],enemy=before.enemies.find(e=>e.uid===action.target),after=result.run.enemies.find(e=>e.uid===action.target);
      const delta=enemy&&after?enemy.hp-after.hp:0,block=enemy&&after?enemy.block-after.block:0;
      motion={def:item.def,kind:d.kind,elapsed:0,target:enemy?.uid,result:d.kind==='weapon'?`命中 · 生命 -${delta}${block?` · 护盾 -${block}`:''}`:d.kind==='shield'?`护盾 +${result.run.block-before.block}`:d.kind==='heal'?`生命 +${result.run.hp-before.hp}`:`能量 +${result.run.energy-before.energy}`};
    }else if(action.type!=='place')motion=null;
    const phase=run.phase;run=result.run;notice='';selected=action.type==='place'?action.uid:null;tooltip=null;save();
    if(phase!==run.phase)scroll=0;
    platform.sound.play(action.type==='use'?'hit':action.type==='place'?'move':action.type==='end'?'end':'reward');
    console.info('backpack-action',JSON.stringify({action:action.type,phase:run.phase,hp:run.hp,turn:run.turn,energy:run.energy,enemies:run.enemies.map(e=>({uid:e.uid,hp:e.hp}))}));draw();return true;
  }
  function leave(action:Action={type:'leave'}){if(run.loot.length)confirm(`还有 ${run.loot.length} 件物品在地上。离开后不能回来领取，确定放弃？`,()=>commit(action),'放弃剩余物品，继续');else commit(action);}
  function select(item:Item){
    if(pauses.size)return;
    const old=selectedItem();
    if(editable()&&old&&old.uid!==item.uid&&shape(old.def).length===shape(item.def).length&&run.items.some(i=>i.uid===item.uid)&&swapPlan(run,old,item.x,item.y,rotation)?.some(i=>i.uid===item.uid)){commit({type:'place',uid:old.uid,x:item.x,y:item.y,rotation});return;}
    selected=item.uid;rotation=item.rotation;tooltip=W>=1000?item.uid:null;tipScroll=0;
    if(run.phase==='battle'&&['shield','heal','food'].includes(ITEM_MAP[item.def].kind))commit({type:'use',uid:item.uid});else draw();
  }
  function editable(){return ['map','prepare','loot','shop','rest','event'].includes(run.phase);}
  function selectedItem(){return [...run.items,...run.loot].find(i=>i.uid===selected);}
  function rotate(){
    if(!editable()||pauses.size)return;
    if(drag){drag.rotation=(drag.rotation+1)%4;rotation=drag.rotation;draw();return;}
    const item=selectedItem();if(!item)return;
    const next=(rotation+1)%4;
    if(run.items.some(i=>i.uid===item.uid)){if(commit({type:'place',uid:item.uid,x:item.x,y:item.y,rotation:next})){selected=item.uid;rotation=next;}}
    else rotation=next;draw();
  }
  function rect(x:number,y:number,w:number,h:number,fill=C.panel,edge=C.edge){ctx.fillStyle=fill;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));ctx.strokeStyle=edge;ctx.lineWidth=2;ctx.strokeRect(Math.round(x)+1,Math.round(y)+1,Math.round(w)-2,Math.round(h)-2);}
  function text(value:string,x:number,y:number,size=12,dark=false){
    if(y+dy>=clipTop&&y+dy<clipBottom)renderedText.push(value);
    ctx.font=`${size>=24?'bold ':''}${Math.max(14,size)}px sans-serif`;ctx.fillStyle=dark||paper?C.dark:C.ink;ctx.textBaseline='top';ctx.fillText(value,Math.round(x),Math.round(y));
  }
  function measure(value:string,size=12){ctx.font=`${size>=24?'bold ':''}${Math.max(14,size)}px sans-serif`;return ctx.measureText(value).width;}
  function wrappedLines(value:string,width:number,size=12){
    const lines:string[]=[];let line='';
    for(const c of value){if(c==='\n'||measure(line+c,size)>width){lines.push(line);line='';if(c==='\n')continue;}line+=c;}
    if(line)lines.push(line);return lines;
  }
  function paragraph(value:string,x:number,y:number,width:number,size=12){
    for(const line of wrappedLines(value,width,size)){text(line,x,y,size);y+=Math.max(14,size)+8;}return y;
  }
  function hit(label:string,x:number,y:number,w:number,h:number,tap:()=>void,enabled=true,item?:number){
    const sy=y+dy,a=Math.max(sy,clipTop),b=Math.min(sy+h,clipBottom);
    if(b>a)hits.push({label,x,y:a,w,h:b-a,tap,enabled,item});
  }
  function button(label:string,x:number,y:number,w:number,tap:()=>void,enabled=true,primary=false,h=44,subtitle=''){
    rect(x,y,w,h,paper?(primary?C.gold:'#d2bd8c'):enabled?(primary?C.gold:'#304127'):'#293022',paper?'#9b8a60':enabled?(primary?'#e4c57d':C.edge):'#48573c');
    ctx.globalAlpha=enabled?1:.48;text(label,x+Math.max(8,(w-measure(label))/2),subtitle?y+8:y+(h-14)/2,12,primary&&enabled);if(subtitle)text(subtitle,x+Math.max(8,(w-measure(subtitle))/2),y+32,12,primary&&enabled);ctx.globalAlpha=1;
    hit(label,x,y,w,h,tap,enabled);
  }
  function sprite(sheet:string,index:number,rows:number,x:number,y:number,w:number,h:number){const image=images[sheet];if(!image?.width)return;ctx.drawImage(image,index%4*image.width/4,Math.floor(index/4)*image.height/rows,image.width/4,image.height/rows,x,y,w,h);}
  function actor(id:string,x:number,y:number,w:number,h:number){sprite('actors',ACTOR_SPRITES[id],4,x,y,w,h);}
  function forestBackground(x:number,y:number,w:number,h:number){const image=images.forest;if(!image?.width)return;const s=Math.max(w/image.width,h/image.height),sw=w/s,sh=h/s;ctx.drawImage(image,(image.width-sw)/2,(image.height-sh)*.9,sw,sh,x,y,w,h);}
  function healthBar(x:number,y:number,w:number,hp:number,max:number){rect(x,y,w,6,'#493127','#11190e');ctx.fillStyle='#c97b60';ctx.fillRect(x+1,y+1,(w-2)*Math.max(0,Math.min(1,hp/max)),4);}
  function combatHint(){const item=selectedItem();if(!item||ITEM_MAP[item.def].kind!=='weapon')return '先点背包里的武器，再点敌人攻击。盾牌、药剂和干粮点击即用。';return item.used?'这件武器本回合已经用过了，换一件武器或结束回合。':run.energy<ITEM_MAP[item.def].cost?'能量不够使用这件武器，可以吃干粮或结束回合。':`已选中${ITEM_MAP[item.def].name}，再点击高亮敌人攻击。`;}
  function showTargets(){tooltip=null;open(null);scroll=0;draw();}
  function art(item:Pick<Item,'def'|'rotation'>,x:number,y:number,w:number,h:number){
    const s=ITEM_SPRITES[item.def];ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(item.rotation*Math.PI/2);if(['branchblade','forkblade'].includes(item.def))ctx.scale(1,-1);
    sprite(s.sheet,s.index,s.rows,-(item.rotation%2?h:w)/2,-(item.rotation%2?w:h)/2,item.rotation%2?h:w,item.rotation%2?w:h);ctx.restore();
  }
  function scene(x:number,y:number,w:number,h:number){
    forestBackground(x,y,w,h);
    const idle=platform.reducedMotion?0:[0,-2,0,1][Math.floor(frame/8)%4];
    const progress=motion?Math.min(1,motion.elapsed/750):0,active=motion&&!platform.reducedMotion&&progress<.65;
    const lunge=active&&motion?.kind==='weapon'?Math.sin(progress/.65*Math.PI)*12:0;
    const actorSize=Math.min(h-30,w>=740?135:90),heroX=x+(w>=740?w*.13:8),actorY=y+h-actorSize-22;
    actor('hero',heroX+lunge,actorY+idle,actorSize,actorSize);
    healthBar(heroX,y+h-9,Math.min(110,actorSize+8),run.hp,run.maxHp);text(`${run.hp}/${run.maxHp}`,heroX+4,y+h-26);
    const enemies=run.enemies.filter(e=>e.hp>0||motion?.target===e.uid),ew=Math.min(w>=740?155:100,(w-112)/Math.max(1,enemies.length));
    enemies.forEach((e,i)=>{
      const ex=x+w-ew*(enemies.length-i)-(w>=740?w*.12:8),dead=e.hp===0,target=motion?.target===e.uid&&active;
      ctx.save();if(dead)ctx.globalAlpha=1-progress;else if(target&&Math.floor(progress*16)%2)ctx.globalAlpha=.45;
      actor(e.def,ex+(target?4:0),actorY+(dead?progress*18:idle),ew,actorSize);ctx.restore();
      rect(ex,y+h-26,ew-4,18,C.panel);text(`${ENEMY_MAP[e.def].name} ${e.hp}`,ex+3,y+h-25);
      healthBar(ex,y+h-7,ew-4,e.hp,ENEMY_MAP[e.def].hp);
      const next=intent(run,e),color=next.kind==='attack'?C.red:next.kind==='poison'?'#485124':next.kind==='charge'?'#715024':'#3e5b57';
      rect(ex,y+23,ew-4,21,color);text(next.label.split(' · ')[0],ex+3,y+26);
      const weapon=selectedItem(),enabled=run.phase==='battle'&&!!weapon&&ITEM_MAP[weapon.def].kind==='weapon'&&!weapon.used&&run.energy>=ITEM_MAP[weapon.def].cost&&e.hp>0;
      if(enabled){ctx.strokeStyle='#f1cf78';ctx.lineWidth=2;ctx.strokeRect(ex,actorY,ew-4,actorSize);}
      hit(`攻击 ${ENEMY_MAP[e.def].name}`,ex,y,ew,h,()=>{if(weapon)commit({type:'use',uid:weapon.uid,target:e.uid});},enabled);
    });
    if(motion){
      const ranged=motion.def.includes('bow'),r=ranged&&active?-.5:active&&motion.kind==='weapon'?(-.8+progress*3):active&&['heal','food'].includes(motion.kind)?-.5:0;
      ctx.save();ctx.translate(heroX+64+lunge,y+h-56);ctx.rotate(r);art({def:motion.def,rotation:0},-24,-26,48,48);ctx.restore();
      if(active&&ranged){ctx.fillStyle='#e4c57d';ctx.fillRect(heroX+80+progress*(w-170),y+h-58,28,3);}
      rect(x+8,y+2,w-16,20,C.panel);text(motion.result,x+16,y+5);
    }else{const phase=run.phase==='battle'?`第 ${run.turn} 回合`:run.phase==='prepare'?'前方有敌人':run.phase==='loot'?'战斗结束':run.phase==='won'?'远征完成':run.phase==='lost'?'旅途暂歇':`第 ${run.step+1}/${stepsInFloor(run)} 站`;rect(x+8,y+2,Math.min(w-16,290),20,C.panel);text(`${phase} · ${nickname}`,x+14,y+5);}
  }
  function drawBag(x:number,y:number,w:number){
    const cell=w/COLS;bag={x,y,cell};
    const dragged=drag&&[...run.items,...run.loot].find(i=>i.uid===drag!.uid),drop=dragged&&dropPosition(drag!,dragged),plan=drop&&dragged?swapPlan(run,dragged,drop.x,drop.y,drag!.rotation):undefined;
    const chosen=selectedItem();neighbors=chosen?run.items.filter(i=>i.uid!==chosen.uid&&adjacent(i,chosen)).map(i=>i.uid):[];
    const destination=drop&&dragged?cellsOf({...dragged,...drop,rotation:drag!.rotation}).map(([a,b])=>key(a,b)):[],overlaps=run.items.filter(i=>i.uid!==drag?.uid&&cellsOf(i).some(([a,b])=>destination.includes(key(a,b))));
    const returned=plan?.filter(i=>i.x>=0).flatMap(i=>cellsOf(i).map(([a,b])=>key(a,b)))??[],valid=!!drop&&!!dragged&&(canPlace(run,dragged,drop.x,drop.y,drag!.rotation)||!!plan);
    preview=drop?{destination,returns:returned,targets:plan?.map(i=>i.uid)??[],blocked:valid?[]:overlaps.map(i=>i.uid),valid}:null;
    rect(x-3,y-3,w+6,cell*ROWS+6,'#967447','#d4bc7c');
    for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){
      const k=key(col,row),unlocked=run.bag.includes(k),expand=run.phase==='expand'&&expansionCells(run).includes(k);
      rect(x+col*cell,y+row*cell,cell,cell,expand?C.green:unlocked?C.paper:'#80704d','#8d784f');
      if(returned.includes(k))rect(x+col*cell+3,y+row*cell+3,cell-6,cell-6,'#9eae66','#fff0af');
      if(expand)text('+',x+col*cell+cell/2-6,y+row*cell+cell/2-6,12);
      hit(`格子 ${col+1},${row+1}`,x+col*cell,y+row*cell,cell,cell,()=>{const item=selectedItem();if(expand)commit({type:'expand',cell:k});else if(item&&editable())commit({type:'place',uid:item.uid,x:col,y:row,rotation});},unlocked||expand);
    }
    run.items.forEach(item=>{
      const cells=shape(item.def,item.rotation),iw=Math.max(...cells.map(c=>c[0]))+1,ih=Math.max(...cells.map(c=>c[1]))+1,ix=x+item.x*cell,iy=y+item.y*cell;
      ctx.save();ctx.beginPath();cellsOf(item).forEach(([a,b])=>ctx.rect(x+a*cell,y+b*cell,cell,cell));ctx.clip();
      if(selected===item.uid||plan?.some(i=>i.uid===item.uid)){ctx.fillStyle=plan?C.green:'#b1ba75';ctx.fillRect(ix,iy,iw*cell,ih*cell);}
      if(run.phase==='battle'&&item.used)ctx.globalAlpha=.6;
      if(drag?.uid===item.uid&&(drag.moved||press?.touch))ctx.globalAlpha=.35;
      art(item,ix+3,iy+3,iw*cell-6,ih*cell-19);
      const bottomRow=Math.max(...cells.map(c=>c[1])),labelCol=Math.min(...cells.filter(c=>c[1]===bottomRow).map(c=>c[0]));
      const d=ITEM_MAP[item.def],label=d.kind==='weapon'?(item.def.includes('bow')?'弓':'武器'):({shield:'盾牌',heal:'药剂',food:'干粮',charm:'护符',armor:'护甲'} as Record<string,string>)[d.kind];
      const lx=ix+labelCol*cell+3,ly=iy+(bottomRow+1)*cell-19;
      rect(lx,ly,Math.min(cell-6,measure(label)+8),17,C.panel,C.panel);text(label,lx+3,ly+1);
      if(run.phase==='battle'){rect(ix+2,iy+2,Math.min(50,iw*cell-4),16,C.panel);text(item.used?'已用':['armor','charm'].includes(d.kind)?'被动':`${d.cost} 能量`,ix+4,iy+3);}
      const border=selected===item.uid?'#fff0af':preview?.blocked.includes(item.uid)?'#eea187':plan?.some(i=>i.uid===item.uid)?'#fff0af':neighbors.includes(item.uid)?'#667c3d':run.phase==='battle'&&d.kind==='weapon'&&!item.used&&run.energy>=d.cost?'#d1b463':d.rarity===3?'#a9752f':d.rarity===2?'#627d48':'#8d784f';
      ctx.strokeStyle=border;ctx.lineWidth=selected===item.uid||neighbors.includes(item.uid)?3:2;cellsOf(item).forEach(([a,b])=>ctx.strokeRect(x+a*cell+2,y+b*cell+2,cell-4,cell-4));
      ctx.restore();
      cellsOf(item).forEach(([a,b])=>hit(`物品 ${ITEM_MAP[item.def].name}`,x+a*cell,y+b*cell,cell,cell,()=>select(item),true,item.uid));
    });
    if(drop&&dragged){
      ctx.globalAlpha=.4;ctx.fillStyle=valid?C.green:C.red;cellsOf({...dragged,...drop,rotation:drag!.rotation}).forEach(([a,b])=>ctx.fillRect(x+a*cell,y+b*cell,cell,cell));ctx.globalAlpha=1;
      text(valid?plan?`可交换 ${plan.length} 件物品`:'松开放入背包':'这里无法放置',x,y+cell*ROWS+8);
    }
    return y+cell*ROWS+24;
  }
  function details(item:Item,x:number,y:number,w:number){
    const d=ITEM_MAP[item.def];art(item,x,y,60,60);text(d.name,x+72,y+4,24);text(`${shape(item.def).length} 格 · ${d.cost} 能量`,x+72,y+38);y+=72;
    y=paragraph(d.description,x,y,w)+8;
    if(['weapon','shield'].includes(d.kind)){const p=power(run,item);y=paragraph(`当前${d.kind==='weapon'?'伤害':'护盾'} ${p.value} · ${p.sources.join(' · ')||'基础效果'}`,x,y,w);}
    if(item.def==='mossbow')y=paragraph(`本次附加中毒 ${poisonOnHit(run,item)} 层`,x,y,w);
    return y+8;
  }
  function itemActions(item:Item,x:number,y:number,w:number){
    const inside=run.items.some(i=>i.uid===item.uid),gap=8,bw=(w-gap)/2;
    if(editable()){
      button('旋转',x,y,bw,()=>rotate());button(inside?'放到地上':'取消选择',x+bw+gap,y,bw,()=>{if(inside)commit({type:'stash',uid:item.uid});else{selected=null;draw();}});y+=52;
      button('丢弃物品',x,y,bw,()=>confirm(`确定丢弃${ITEM_MAP[item.def].name}？丢弃后不能拿回来。`,()=>commit({type:'discard',uid:item.uid}),'确认丢弃'));
      if(run.phase==='shop')button(`出售 · ${Math.floor(priceOf(run,item.def)/2)} 金币`,x+bw+gap,y,bw,()=>commit({type:'sell',uid:item.uid}));y+=52;
    }
    return y;
  }
  function groundItems(x:number,y:number,w:number){
    if(!editable())return y;
    text(`地上物品 · ${run.loot.length} 件`,x,y,24);y+=34;
    const held=selectedItem();button('放下选中物品',x+w-136,y-38,136,()=>{if(held)commit({type:'stash',uid:held.uid});},!!held&&run.items.some(i=>i.uid===held.uid),false,36);
    y=paragraph('点选后再点背包格子放入。离开前记得带走。',x,y,w)+8;
    const cols=Math.max(2,Math.floor(w/100)),cw=w/cols;
    ground={x,y:y+dy,w,h:Math.max(88,Math.ceil(run.loot.length/cols)*96)};
    const hover=!!drag?.moved&&drag.x>=ground.x&&drag.x<ground.x+ground.w&&drag.y>=ground.y&&drag.y<ground.y+ground.h;
    rect(x-5,y-5,w+4,ground.h+10,hover?'#51653a':'#2a3823',hover?'#ffedaa':C.edge);
    if(!run.loot.length){rect(x,y,w-6,76);text('拖到这里暂放，之后还能拿回来',x+12,y+28);y+=84;}
    run.loot.forEach((item,i)=>{const ix=x+i%cols*cw,iy=y+Math.floor(i/cols)*96;rect(ix,iy,cw-6,88,selected===item.uid?'#bfbc6c':'#d4bf91','#947d4a');art({...item,rotation:selected===item.uid?rotation:item.rotation},ix+16,iy+4,cw-38,58);text(ITEM_MAP[item.def].name,ix+5,iy+65,12,true);hit(`地上 ${ITEM_MAP[item.def].name}`,ix,iy,cw-6,88,()=>select(item),true,item.uid);});
    if(run.loot.length)y+=Math.ceil(run.loot.length/cols)*96;
    if(run.phase==='map'&&run.loot.length){button('放弃地上物品，继续选路',x,y,w,()=>leave());y+=52;}
    return y+16;
  }
  function routePanel(x:number,y:number,w:number){
    if(run.phase==='map'){
      text('下一站',x,y,24);text(`${run.step+1} / ${stepsInFloor(run)}`,x+w-60,y+8);y+=38;
      const count=stepsInFloor(run),size=Math.min(30,(w-7*(count-1))/count),gap=(w-count*size)/(count-1);
      for(let i=0;i<count;i++){rect(x+i*(size+gap),y,size,size,i===run.step?C.gold:i<run.step?'#596a40':'#273121',i===run.step?'#e0bf72':C.edge);text(i===count-1?'守':String(i+1),x+i*(size+gap)+8,y+8,12,i===run.step);}y+=size+20;
      const descriptions:Record<NodeKind,string>={battle:'战斗、金币与新装备',elite:'更危险，也有更多金币',shop:'买卖装备，整理行囊',rest:'恢复生命或增加上限',boss:'击败守卫，进入下一层',event:'停下来，看看发生了什么'};
      for(const kind of routes(run)){button(NODES[kind],x,y,w,()=>commit({type:'node',kind}),!run.loot.length,false,64,descriptions[kind]);y+=74;}
      if(run.loot.length)y=paragraph('地上还有物品，先装好，或确认放弃后选路。',x,y,w);
    }
    if(run.phase==='prepare'){
      text('前方有动静',x,y,24);y+=36;y=paragraph('先整理行囊，开始战斗后不能移动装备。',x,y,w)+8;
      for(const enemy of run.enemies){y=paragraph(`${ENEMY_MAP[enemy.def].name} · ${intent(run,enemy).label}`,x,y,w);const hint=encounterHint(run,enemy);if(hint)y=paragraph(hint,x,y,w)+8;}
    }
    if(run.phase==='battle'){
      text('你的回合',x,y,24);y+=36;
      y=paragraph(combatHint(),x,y,w)+8;
      const chosen=selectedItem();if(chosen&&ITEM_MAP[chosen.def].kind==='weapon'&&!chosen.used&&run.energy>=ITEM_MAP[chosen.def].cost){button('去选择敌人 ↑',x,y,w,showTargets);y+=52;}
      for(const enemy of run.enemies.filter(e=>e.hp>0)){y=paragraph(`${ENEMY_MAP[enemy.def].name} · 生命 ${enemy.hp}/${ENEMY_MAP[enemy.def].hp} · 护盾 ${enemy.block} · 中毒 ${enemy.poison}`,x,y,w);y=paragraph(`本回合：${intent(run,enemy).label}`,x,y,w);const hint=encounterHint(run,enemy);if(hint)y=paragraph(hint,x,y,w);y+=12;}
    }
    if(run.phase==='shop'){
      text('旅人小摊',x,y,24);y+=36;y=paragraph('买到的物品先放地上，整理进背包再带走。选中自己的装备可以出售。',x,y,w)+12;
      const cols=2,cw=(w-12)/cols;
      for(let row=0;row<Math.ceil(run.offers.length/cols);row++){
        const offers=run.offers.slice(row*cols,row*cols+cols),cardH=Math.max(...offers.map(id=>{const d=ITEM_MAP[id];return Math.max(64,wrappedLines(d.name,cw-76,16).length*24+36)+(run.shop?22:0)+wrappedLines(`${d.shape.length} 格 · ${d.cost} 能量${d.shopOnly?' · 专属':''}`,cw-24).length*22+wrappedLines(d.description,cw-24).length*22+72;}));
        offers.forEach((id,col)=>{const d=ITEM_MAP[id],cx=x+col*(cw+12);rect(cx,y,cw,cardH,'#36422b','#617145');art({def:id,rotation:0},cx+8,y+12,44,48);paragraph(d.name,cx+60,y+12,cw-72,16);
          let cy=y+Math.max(64,wrappedLines(d.name,cw-76,16).length*24+36);const kind=run.shop?.kinds[row*cols+col];if(kind){text(({weapon:'武器',build:'构筑配件',supply:'随行补给',any:'随缘好物'})[kind],cx+12,cy);cy+=22;}cy=paragraph(`${d.shape.length} 格 · ${d.cost} 能量${d.shopOnly?' · 专属':''}`,cx+12,cy,cw-24);paragraph(d.description,cx+12,cy+8,cw-24);button(`购买 · ${priceOf(run,id)} 金币`,cx+8,y+cardH-52,cw-16,()=>commit({type:'buy',def:id}),run.gold>=priceOf(run,id));});y+=cardH+12;
      }
      if(run.shop){button(run.shop.refreshed?'本店已换过货':`请摊主换货 · ${REFRESH_PRICE} 金币`,x,y,w,()=>confirm('只换未售商品，已买货位不补回。本店仅一次，可能出现相同商品。',()=>commit({type:'refresh'}),'确认换货 · 4 金币'),!run.shop.refreshed&&!!run.offers.length&&run.gold>=REFRESH_PRICE);y+=58;}
    }
    if(run.phase==='rest'){text('在树下歇一会儿',x,y,24);y+=38;y=paragraph('火还温着，刚好可以坐下来喘口气。',x,y,w)+8;button('休息 · 恢复 12 点生命',x,y,w,()=>leave({type:'rest',choice:'heal'}),true,true);y+=52;button('整理补给 · 生命上限 +4',x,y,w,()=>leave({type:'rest',choice:'grow'}));y+=60;}
    if(run.phase==='event'){const e=EVENTS[run.event];text(e.name,x,y,24);y+=38;y=paragraph(e.text,x,y,w)+12;button(e.action,x,y,w,()=>leave({type:'event',accept:true}),true,true);y+=52;button('不打扰，继续走',x,y,w,()=>leave({type:'event',accept:false}));y+=60;}
    if(run.phase==='expand'){text('多带一点好东西',x,y,24);y+=38;y=paragraph('点选背包边上亮起的格子，扩展一格行囊。',x,y,w);}
    if(run.phase==='loot'){text('这一程走得不错',x,y,24);y+=38;y=paragraph('挑些用得上的战利品装进背包，地上物品离开后会放弃。',x,y,w);}
    if(['won','lost'].includes(run.phase)){y=paragraph(run.phase==='won'?'森林另一头，天亮了':'这次先走到这里',x,y,w,24)+12;y=paragraph(run.phase==='won'?'你走过三层遗迹，找到了离开森林的路。':'带上这次学到的搭配，下回再走远一点。',x,y,w)+8;y=paragraph(`完成 ${run.battles} 场战斗 · 击败 ${run.kills} 名敌人 · 发现 ${run.discoveries.length} 件物品`,x,y,w);button('再走一趟',x,y+12,w,openRestart,true,true);y+=72;}
    return y+24;
  }
  function travelLog(x:number,y:number,w:number){button(logOpen?'沿途记录 −':'沿途记录 +',x,y,w,()=>{logOpen=!logOpen;draw();});y+=54;if(logOpen)for(const line of run.log)y=paragraph(line,x,y,w)+12;return y;}
  function drawTooltip(){
    const item=[...run.items,...run.loot].find(i=>i.uid===tooltip);if(!item){tooltip=null;tooltipBounds=null;return;}
    const w=320,x=Math.min(W-w-16,bag.x+bag.cell*COLS+28),y=top+82,h=Math.min(H-bottom-y-72,470),bodyTop=y+44,bodyBottom=y+h-12;
    tooltipBounds={x,y,w,h};tooltipHitStart=hits.length;dy=0;clipTop=0;clipBottom=H;paper=true;
    rect(x,y,w,h,'#e2d2a6','#baa16b');button('关闭详情',x+w-90,y+4,84,()=>{tooltip=null;draw();},true,false,36);
    ctx.save();ctx.beginPath();ctx.rect(x+12,bodyTop,w-24,bodyBottom-bodyTop);ctx.clip();clipTop=bodyTop;clipBottom=bodyBottom;dy=-tipScroll;ctx.translate(0,dy);
    let cy=details(item,x+16,bodyTop+4,w-32);
    if(run.phase==='battle'&&ITEM_MAP[item.def].kind==='weapon'){cy=paragraph(combatHint(),x+16,cy,w-32)+8;button('去选择敌人 ↑',x+16,cy,w-32,showTargets);cy+=52;}
    cy=itemActions(item,x+16,cy,w-32);maxTipScroll=Math.max(0,cy-bodyBottom);ctx.restore();dy=0;clipTop=0;clipBottom=H;paper=false;
    if(maxTipScroll)text('滚轮查看更多',x+16,y+h-20,12,true);
  }
  function header(){
    rect(0,top,W,68,C.panel,'#8d7544');text('背包远征',16,top+8,24);
    const status=`生命 ${run.hp}/${run.maxHp} · 金币 ${run.gold} · 护盾 ${run.block} · 中毒 ${run.poison}`;
    if(W>=1080){
      text('林间行囊 · FOREST SATCHEL',16,top+40);text(`第 ${run.floor} 层 · ${FLOOR_NAMES[run.floor-1]}`,260,top+12);text(status,260,top+40);
      const controls:Array<[string,number,()=>void]>=[[`难度 · ${difficultyOf(run).name}`,96,openRestart],['图鉴',52,()=>open('codex')],['存档',52,()=>open('saves')],[muted?'声音关':'声音开',72,toggleMute],['暂停',52,()=>setPause('manual',true)],['菜单',56,()=>open('menu')]];
      let x=W-436;for(const [label,w,fn]of controls){button(label,x,top+14,w,fn,true,false,40);x+=w+8;}
    }else{text(status,16,top+46);button('菜单',W-72,top+6,56,()=>open('menu'),true,false,36);}
  }
  function footer(){
    dy=0;clipTop=0;clipBottom=H;
    const y=H-bottom-56;rect(0,y,W,56+bottom,C.panel);const item=selectedItem(),bw=W>=740?176:Math.min(190,W*.52);
    if(item)button(`详情 · ${ITEM_MAP[item.def].name}`,16,y+6,W-bw-40,()=>open('item'),true,false,44);
    else text(`第 ${run.floor}/3 层 · ${run.discoveries.length}/${ITEMS.length} 图鉴`,16,y+20);
    const action=run.phase==='prepare'?()=>commit({type:'start'}):run.phase==='battle'?()=>commit({type:'end'}):['shop','loot'].includes(run.phase)?()=>leave():null;
    if(action)button(run.phase==='prepare'?'开始战斗':run.phase==='battle'?'结束回合':'收好行囊，继续走',W-bw-16,y+6,bw,action,!pauses.size,true);
    else if(editable()&&item)button('旋转选中物品',W-bw-16,y+6,bw,rotate,!pauses.size,true);
  }
  function difficultyButtons(x:number,y:number,w:number){
    const kinds=Object.keys(DIFFICULTIES) as Difficulty[];
    kinds.forEach((kind,i)=>button(DIFFICULTIES[kind].name,x+i*(w+8)/3,y,(w-16)/3,()=>{difficulty=kind;draw();},true,difficulty===kind));
    return paragraph(DIFFICULTIES[difficulty].description,x,y+56,w)+12;
  }
  function modal(){
    ctx.fillStyle='#10190cf2';ctx.fillRect(0,0,W,H);hits=[];renderedText=[];dy=0;clipTop=0;clipBottom=H;
    const w=Math.min(640,W-24),x=(W-w)/2,y=top+8,bodyTop=y+58,bodyBottom=H-bottom-16;
    rect(x,y,w,bodyBottom-y,C.panel,'#b4a16b');text(({menu:'旅途菜单',help:'林间向导',saves:'把旅途存好',codex:'行囊里的见闻',restart:'重新出发',confirm:'出发前再确认',item:'物品详情',log:'沿途记录'} as Record<string,string>)[screen!]??'',x+16,y+20,24);
    button('关闭',x+w-68,y+8,56,()=>open(null),true,false,40);
    ctx.save();ctx.beginPath();ctx.rect(x+10,bodyTop,w-20,bodyBottom-bodyTop-8);ctx.clip();dy=-modalScroll;clipTop=bodyTop;clipBottom=bodyBottom-8;ctx.translate(0,dy);
    let cy=bodyTop+8;const bx=x+16,bw=w-32;
    const row=(label:string,fn:()=>void,primary=false)=>{button(label,bx,cy,bw,fn,true,primary);cy+=54;};
    if(screen==='menu'){
      row('继续远征',()=>open(null),true);row('图鉴',()=>open('codex'));row('存档',()=>open('saves'));row('玩法说明',()=>open('help'));row('沿途记录',()=>open('log'));
      row(muted?'声音关 · 点击开启':'声音开 · 点击静音',toggleMute);row('重新开始 / 更改难度',openRestart);row('暂停',()=>{open(null);setPause('manual',true);});
    }
    if(screen==='help'){
      for(const value of ['摆放：电脑拖动，右键或 R 旋转；手机长按物品片刻即可拖动，直接滑动则滚动页面。也可以先选物品，再点目标格。拖到有物品的位置会先检查所有交换目标能否安置，不能放下就整体退回。','战斗：先点武器，再点敌人；盾牌、药剂、干粮点击即用。每回合 3 点基础能量，每件主动装备每回合最多使用一次。护符与护甲自动生效。','搭配：武器旁边的护符可以增加伤害；弓与同行箭束、钥匙配合。详情显示实际加成及条件。','防守：护盾抵挡普通攻击，下回合清除。中毒无视护盾，每回合结算后减少一层。看清敌人预告，为蓄力重击预留盾牌。','旅途：三层森林，每层八站（旧档保留原站数）。每两场战斗与层末守卫后可以扩一格背包。战利品、商店买到的物品先在地上，装好再走。',`${difficultyOf(run).name}难度：${difficultyOf(run).description}进度在每次行动后自动保存。`,`键盘：Tab 切换控件，Enter 确认，R 旋转，数字 1/2 选敌，空格暂停，Esc 取消选择或关闭菜单。`])cy=paragraph(value,bx,cy,bw)+16;
    }
    if(screen==='saves'){
      cy=paragraph('进度只保存在当前设备，清理数据前请导出。两端使用相同存档格式，可以导出后在另一端导入；不会自动跨设备同步。',bx,cy,bw)+12;
      row('导出当前进度',()=>{void platform.exportText(JSON.stringify(run,null,2)).then(()=>{notice='存档已导出，请保存在安全的位置。';draw();}).catch(error=>{notice=String(error);draw();});});
      row('导入存档',()=>{void platform.importText().then(value=>{const next=parseSave(value);confirm('导入会替换当前远征。确认前可先导出当前进度。',()=>{replace(next);started=true;},'确认导入');}).catch(error=>{notice=String(error);draw();});});
      row('读取最新进度',()=>{const result=store.readSave();if(result.run){replace(result.run);open(null);}else{notice=result.error??'还没有存档。';draw();}});
      row('恢复上一次备份',()=>{try{const next=store.restoreBackup();confirm('用上一次保存的备份替换当前远征？',()=>replace(next),'恢复备份');}catch(error){notice=String(error);draw();}});
      row('重新开始一趟远征',openRestart);
    }
    if(screen==='codex'){
      cy=paragraph(`已发现 ${run.discoveries.length} / ${ITEMS.length} 件物品`,bx,cy,bw)+12;
      const cols=W>=1000?4:2,cw=(bw-(cols-1)*10)/cols;
      for(let row=0;row<Math.ceil(ITEMS.length/cols);row++){
        const entries=ITEMS.slice(row*cols,row*cols+cols),cardH=Math.max(...entries.map(d=>106+wrappedLines(run.discoveries.includes(d.id)?d.description:'继续探索森林。',cw-16).length*22));
        entries.forEach((d,col)=>{const cx=bx+col*(cw+10),discovered=run.discoveries.includes(d.id);rect(cx,cy,cw,cardH,'#334028','#62714a');ctx.save();ctx.globalAlpha=discovered?1:.12;art({def:d.id,rotation:0},cx+cw/2-30,cy+8,60,60);ctx.restore();text(discovered?d.name:'尚未发现',cx+8,cy+76);paragraph(discovered?d.description:'继续探索森林。',cx+8,cy+100,cw-16);});cy+=cardH+12;
      }
    }
    if(screen==='restart'){
      cy=paragraph('当前远征会被替换，发现过的图鉴保留。想留住进度，可以先在存档菜单导出。难度从新远征生效。',bx,cy,bw)+16;cy=difficultyButtons(bx,cy,bw);
      row('收拾行囊，重新出发',()=>{const next=newRun(Date.now(),difficulty);next.discoveries=[...new Set([...run.discoveries,...next.discoveries])];open(null);started=true;replace(next);},true);row('先导出存档',()=>open('saves'));
    }
    if(screen==='confirm'){cy=paragraph(confirmText,bx,cy,bw)+16;row(confirmLabel,()=>{const fn=confirmAction;confirmAction=null;open(null);fn?.();},true);row('再想想',()=>open(null));}
    if(screen==='item'){
      const item=selectedItem();if(item){cy=details(item,bx,cy,bw);
        if(editable()){
          row('旋转',()=>{open(null);rotate();});
          if(run.items.some(i=>i.uid===item.uid))row('放到地上',()=>{open(null);commit({type:'stash',uid:item.uid});});
          row('丢弃这件物品',()=>confirm(`确定丢弃${ITEM_MAP[item.def].name}？不能再拿回来。`,()=>commit({type:'discard',uid:item.uid}),'确认丢弃'));
          if(run.phase==='shop')row(`出售 · ${Math.floor(priceOf(run,item.def)/2)} 金币`,()=>{open(null);commit({type:'sell',uid:item.uid});});
        }else if(run.phase==='battle'&&ITEM_MAP[item.def].kind==='weapon'){cy=paragraph(combatHint(),bx,cy,bw)+8;row('去选择敌人 ↑',showTargets);}
      }
    }
    if(screen==='log')for(const line of run.log)cy=paragraph(line,bx,cy,bw)+16;
    if(notice)cy=paragraph(notice,bx,cy+8,bw)+8;
    maxModalScroll=Math.max(0,cy-bodyBottom+12);ctx.restore();dy=0;
    if(maxModalScroll>0)text('上下滑动 / 滚轮查看更多',bx,bodyBottom-18);
  }
  function draw(){
    if(!canvas.width)return;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);hits=[];renderedText=[];neighbors=[];preview=null;dy=0;clipTop=0;clipBottom=H;
    if(!ready){text(failed?'素材加载失败，请重新打开游戏。':`正在准备森林行囊 ${loadedAssets}/4`,20,H/2,16);return;}
    if(!started){
      const compact=W>=740&&H<500,width=compact?W/2-32:Math.min(620,W-32),x=compact?W/2+16:(W-width)/2,sceneHeight=compact?H-top-bottom-100:Math.min(200,H*.25);
      scene(compact?16:x,top+20,width,sceneHeight);text('背包远征',compact?16:x,top+sceneHeight+42,compact?24:36);
      let y=compact?top+24:top+sceneHeight+98;y=paragraph('带好行囊，穿过三层林间遗迹。装备的摆法，也能改变每一场战斗。',x,y,width)+16;y=difficultyButtons(x,y,width);
      button(loaded.run?'继续上次远征':'收拾好，出发',x,y,width,()=>{started=true;if(!loaded.run)run=newRun(Date.now(),difficulty);save();draw();},true,true);y+=54;
      button('存档与导入',x,y,(width-8)/2,()=>open('saves'));button('玩法说明',x+(width+8)/2,y,(width-8)/2,()=>open('help'));
    }else{
      header();
      contentTop=top+68;contentBottom=H-bottom-60;clipTop=contentTop;clipBottom=contentBottom;
      ctx.save();ctx.beginPath();ctx.rect(0,contentTop,W,contentBottom-contentTop);ctx.clip();dy=-scroll;ctx.translate(0,dy);
      const wide=W>=740,landscape=wide&&H<500,boardW=landscape?Math.min(W*.45,(contentBottom-contentTop-38)*COLS/ROWS):wide?Math.min(560,W*.57):W-32;
      const bx=landscape?W-boardW-16:16,sceneX=16,sceneW=landscape?W-boardW-48:boardW;
      let y=contentTop+4,sideY=y;
      scene(sceneX,y,sceneW,landscape?100:wide?150:100);y+=landscape?112:wide?162:112;
      if(run.phase==='battle'){
        const live=run.enemies.filter(e=>e.hp>0),weapon=selectedItem(),targetW=landscape?sceneW:boardW,cw=(targetW+8)/Math.max(1,live.length);
        live.forEach((e,i)=>button(`${i+1} ${ENEMY_MAP[e.def].name} · ${e.hp}`,landscape?16+i*cw:bx+i*cw,y,cw-8,()=>{if(weapon)commit({type:'use',uid:weapon.uid,target:e.uid});},!!weapon&&ITEM_MAP[weapon.def].kind==='weapon'&&!weapon.used&&run.energy>=ITEM_MAP[weapon.def].cost,true,40));y+=48;
      }
      if(landscape){sideY=y+4;y=contentTop+4;}
      text(`林间行囊 · ${run.bag.length} 格`,bx,y,landscape?16:24);text(`能量 ${run.energy}`,bx+boardW-78,y+7);y+=34;
      y=drawBag(bx,y,boardW);
      if(editable()&&!drag)text('触屏长按拖动 · 也可点选后点格子放置',bx,y-14);
      if(selectedItem()&&editable())y=itemActions(selectedItem()!,bx,y,boardW);
      if(!wide)y=routePanel(bx,y,boardW);
      y=groundItems(bx,y+8,boardW);
      y=travelLog(bx,y,boardW);
      if(wide)sideY=routePanel(landscape?16:boardW+40,sideY+8,landscape?sceneW:W-boardW-56);
      if(notice)y=paragraph(notice,bx,y+8,boardW)+16;
      maxScroll=Math.max(0,Math.max(y,sideY)+16-contentBottom);ctx.restore();dy=0;footer();
    }
    if(drag&&(drag.moved||press?.touch)){const item=[...run.items,...run.loot].find(i=>i.uid===drag!.uid);if(item){const cells=shape(item.def,drag.rotation),w=(Math.max(...cells.map(c=>c[0]))+1)*bag.cell,h=(Math.max(...cells.map(c=>c[1]))+1)*bag.cell;ctx.globalAlpha=.8;art({...item,rotation:drag.rotation},drag.x-w/2,drag.y-h/2,w,h);ctx.globalAlpha=1;}}
    if(pauses.has('manual')&&!screen){ctx.fillStyle='#10190cf2';ctx.fillRect(0,0,W,H);hits=[];text('歇一会儿，行囊还在。',24,H/2-50,24);button('继续远征',24,H/2+12,W-48,()=>setPause('manual',false),true,true);}
    if(tooltip&&!screen&&!pauses.size)drawTooltip();
    if(screen)modal();
    const focused=hits.filter(h=>h.enabled)[focus];if(focused){ctx.strokeStyle='#f4e9cd';ctx.lineWidth=3;ctx.strokeRect(focused.x+3,focused.y+3,focused.w-6,focused.h-6);}
    platform.onState?.(getState(),hits);
  }
  function resize(){
    const v=platform.viewport();W=Math.max(360,Math.min(1120,v.width));const cssScale=v.width/W;H=v.height/cssScale;top=v.top/cssScale;bottom=v.bottom/cssScale;scale=cssScale*v.dpr;
    canvas.width=Math.round(v.width*v.dpr);canvas.height=Math.round(v.height*v.dpr);scroll=0;modalScroll=0;drag=null;press=null;draw();
  }
  function dropPosition(d:Drag,item:Item){
    const y=bag.y-scroll,w=bag.cell*COLS,h=bag.cell*ROWS;if(d.x<bag.x||d.x>=bag.x+w||d.y<y||d.y>=y+h)return null;
    const cells=shape(item.def,d.rotation),iw=Math.max(...cells.map(c=>c[0]))+1,ih=Math.max(...cells.map(c=>c[1]))+1;
    return {x:Math.round((d.x-bag.x)/bag.cell-iw/2),y:Math.round((d.y-y)/bag.cell-ih/2)};
  }
  function input(event:GameInput){
    const v=platform.viewport(),ratio=W/v.width,x=event.x*ratio,y=event.y*ratio;
    if(event.type==='cancel'){press=null;drag=null;draw();return;}
    if(pauses.has('hidden')||pauses.has('sidebar')||pauses.has('boss'))return;
    if(event.type==='down'){
      if(event.button===2){rotate();return;}
      if(event.button!==0)return;
      const insideTooltip=tooltip!==null&&tooltipBounds!==null&&x>=tooltipBounds.x&&x<tooltipBounds.x+tooltipBounds.w&&y>=tooltipBounds.y&&y<tooltipBounds.y+tooltipBounds.h;
      if(tooltip!==null&&!insideTooltip){tooltip=null;draw();}
      const target=[...(insideTooltip?hits.slice(tooltipHitStart):hits)].reverse().find(h=>h.enabled&&x>=h.x&&x<h.x+h.w&&y>=h.y&&y<h.y+h.h);
      press={x,y,startY:y,touch:event.touch,hit:target,moved:false,scroll:screen?modalScroll:scroll,held:0};
      if(target?.item&&!event.touch&&editable()&&!screen&&!pauses.size){const item=[...run.items,...run.loot].find(i=>i.uid===target.item)!;drag={uid:item.uid,rotation:selected===item.uid?rotation:item.rotation,x,y,startX:x,startY:y,moved:false};}
    }else if(event.type==='move'&&press){
      if(Math.hypot(x-press.x,y-press.startY)>6)press.moved=true;
      if(drag){drag.x=x;drag.y=y;drag.moved=press.moved;draw();}
      else if(press.touch&&press.moved){const amount=press.scroll+press.startY-y;if(screen)modalScroll=Math.max(0,Math.min(maxModalScroll,amount));else scroll=Math.max(0,Math.min(maxScroll,amount));draw();}
    }else if(event.type==='up'&&event.button===0&&press){
      const current=press,d=drag;press=null;drag=null;
      if(d?.moved){const item=[...run.items,...run.loot].find(i=>i.uid===d.uid),drop=item&&dropPosition(d,item);if(drop)commit({type:'place',uid:d.uid,...drop,rotation:d.rotation});else if(x>=ground.x&&x<ground.x+ground.w&&y>=ground.y&&y<ground.y+ground.h&&run.items.some(i=>i.uid===d.uid))commit({type:'stash',uid:d.uid});draw();}
      else if(!current.moved&&current.hit&&x>=current.hit.x&&x<current.hit.x+current.hit.w&&y>=current.hit.y&&y<current.hit.y+current.hit.h){current.hit.tap();console.info('backpack-state',JSON.stringify(getState()));}
      else draw();
    }
  }
  function wheel(delta:number){if(screen)modalScroll=Math.max(0,Math.min(maxModalScroll,modalScroll+delta));else if(tooltip)tipScroll=Math.max(0,Math.min(maxTipScroll,tipScroll+delta));else scroll=Math.max(0,Math.min(maxScroll,scroll+delta));draw();}
  function keyboard(code:string,shift=false){
    if(code==='Tab'){const length=hits.filter(h=>h.enabled).length;focus=length?(focus+(shift?-1:1)+length)%length:-1;draw();return;}
    if(code==='Enter'){hits.filter(h=>h.enabled)[focus]?.tap();return;}
    if(code==='Escape'){if(screen)open(null);else{selected=null;tooltip=null;drag=null;draw();}return;}
    if(code==='Space'&&started&&!screen){setPause('manual',!pauses.has('manual'));return;}
    if(pauses.size)return;
    if(code==='KeyR')rotate();
    if(/^Digit[1-9]$/.test(code)){const enemy=run.enemies.filter(e=>e.hp>0)[Number(code.slice(-1))-1],item=selectedItem();if(enemy&&item&&ITEM_MAP[item.def].kind==='weapon')commit({type:'use',uid:item.uid,target:enemy.uid});}
    if(code==='ArrowDown'||code==='PageDown')wheel(code==='PageDown'?H*.65:44);
    if(code==='ArrowUp'||code==='PageUp')wheel(code==='PageUp'?-H*.65:-44);
  }
  function tick(elapsed:number){
    if(!started||pauses.size||!ready)return;
    const delta=Math.min(elapsed,100);clock+=delta;let dirty=false;
    if(press?.touch&&!press.moved&&!drag&&press.hit?.item&&editable()&&!screen){
      press.held+=delta;
      if(press.held>=320){const item=[...run.items,...run.loot].find(i=>i.uid===press!.hit!.item);if(item){drag={uid:item.uid,rotation:selected===item.uid?rotation:item.rotation,x:press.x,y:press.y,startX:press.x,startY:press.y,moved:false};selected=item.uid;rotation=drag.rotation;dirty=true;}}
    }
    if(drag?.moved&&press?.touch){const direction=drag.y>contentBottom-24?1:drag.y<contentTop+24?-1:0,next=Math.max(0,Math.min(maxScroll,scroll+direction*delta*.45));if(next!==scroll){scroll=next;dirty=true;}}
    if(clock>=40&&run.phase==='battle'){frame++;clock=0;dirty=true;}
    if(motion){motion.elapsed+=Math.min(elapsed,100);if(motion.elapsed>=750)motion=null;dirty=true;}
    if(dirty)draw();
  }
  for(const [name,url] of Object.entries(platform.resources)){
    const image=platform.createImage();images[name]=image;image.onload=()=>{loadedAssets++;if(loadedAssets===Object.keys(platform.resources).length){ready=true;console.info('backpack-ready',JSON.stringify(getState()));platform.ready?.();}draw();};image.onerror=()=>{failed=true;console.error('backpack-asset-error',name);draw();};image.src=url;
  }
  resize();
  return {input,keyboard,wheel,tick,resize,setPause,getState,setNickname:(value:string)=>{nickname=[...value].slice(0,8).join('');draw();},getHits:()=>hits.map(h=>({label:h.label,x:h.x,y:h.y,w:h.w,h:h.h,enabled:h.enabled,item:h.item})),isMuted:()=>platform.sound.isMuted()};
}
