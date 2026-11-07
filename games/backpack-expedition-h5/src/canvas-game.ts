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
type Press={x:number;y:number;startY:number;touch:boolean;hit?:GameHit;moved:boolean;scroll:number;held:number;tooltip:boolean;tray:boolean};

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
  let mobileTab:'route'|'ground'=run.phase==='loot'?'ground':'route',trayScroll=0,maxTrayScroll=0,offerIndex=0,groundPage=0;
  let tray={x:0,y:0,w:0,h:0};
  const images:Record<string,HTMLImageElement>={},pauses=new Set<string>();
  try{muted=platform.storage.getItem((platform.saveKey??SAVE_KEY)+':muted')==='true';}catch{/* Optional preference. */}
  platform.sound.setUserMuted(muted);
  function getState():GameSnapshot{return JSON.parse(JSON.stringify({running:started&&ready&&!pauses.size&&run.phase==='battle',frame,paused:[...pauses],started,ready,run,selected,rotation,screen,notice,motion,scroll,ui:{text:renderedText,neighbors,tooltip,tooltipBounds:tooltip?tooltipBounds:null,ground,focus:focusableHits()[focus]?.label??null,preview,panel:W<740&&started?{...tray,tab:mobileTab,scroll:trayScroll,maxScroll:maxTrayScroll}:null}}));}
  function syncPause(){platform.sound.setPaused(pauses.size>0);}
  function setPause(reason:string,active:boolean){if(active)pauses.add(reason);else pauses.delete(reason);if(active){drag=null;press=null;tooltip=null;}syncPause();draw();}
  function open(name:string|null){screen=name;modalScroll=0;focus=-1;tooltip=null;if(name)pauses.add('menu');else pauses.delete('menu');syncPause();drag=null;press=null;draw();}
  function save(){const result=store.writeSave(run);if(!result.ok)notice=result.error??'保存失败，请导出进度。';}
  function replace(next:Run){run=next;selected=null;tooltip=null;drag=null;motion=null;scroll=0;trayScroll=0;mobileTab=run.phase==='loot'?'ground':'route';offerIndex=0;groundPage=0;save();draw();}
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
    const phase=run.phase;run=result.run;notice='';selected=action.type==='place'?action.uid:null;if(action.type==='place')rotation=action.rotation;tooltip=null;save();
    if(phase!==run.phase){scroll=0;trayScroll=0;mobileTab=run.phase==='loot'?'ground':'route';offerIndex=0;groundPage=0;}
    if(action.type==='buy'||action.type==='stash'){mobileTab='ground';trayScroll=0;groundPage=Math.floor((run.loot.length-1)/Math.max(2,Math.floor((W-24)/92)));}
    platform.sound.play(action.type==='use'?'hit':action.type==='place'?'move':action.type==='end'?'end':'reward');
    console.info('backpack-action',JSON.stringify({action:action.type,phase:run.phase,hp:run.hp,turn:run.turn,energy:run.energy,enemies:run.enemies.map(e=>({uid:e.uid,hp:e.hp}))}));draw();return true;
  }
  function leave(action:Action={type:'leave'}){if(run.loot.length)confirm(`还有 ${run.loot.length} 件物品在地上。离开后不能回来领取，确定放弃？`,()=>commit(action),'放弃剩余物品，继续');else commit(action);}
  function select(item:Item){
    if(pauses.size)return;
    const old=selectedItem();
    if(editable()&&old&&old.uid!==item.uid&&shape(old.def).length===shape(item.def).length&&run.items.some(i=>i.uid===item.uid)&&swapPlan(run,old,item.x,item.y,rotation)?.some(i=>i.uid===item.uid)){commit({type:'place',uid:old.uid,x:item.x,y:item.y,rotation});return;}
    selected=item.uid;rotation=item.rotation;tooltip=W>=1000?item.uid:null;tipScroll=0;focus=-1;
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
  function rect(x:number,y:number,w:number,h:number,fill=C.panel,edge=C.edge){
    x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);
    ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.strokeStyle=edge;ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,w-2,h-2);
    ctx.fillStyle='#ffffff20';ctx.fillRect(x+2,y+2,w-4,1);ctx.fillRect(x+2,y+2,1,h-4);ctx.fillStyle='#00000040';ctx.fillRect(x+2,y+h-3,w-4,1);ctx.fillRect(x+w-3,y+2,1,h-4);
  }
  function text(value:string,x:number,y:number,size=14,dark=false){
    if(y+dy>=clipTop&&y+dy<clipBottom)renderedText.push(value);
    ctx.font=`${size>=24?'bold ':''}${Math.max(14,size)}px sans-serif`;ctx.fillStyle=dark||paper?C.dark:C.ink;ctx.textBaseline='top';ctx.fillText(value,Math.round(x),Math.round(y));
  }
  function measure(value:string,size=14){ctx.font=`${size>=24?'bold ':''}${Math.max(14,size)}px sans-serif`;return ctx.measureText(value).width;}
  function fitText(value:string,width:number,size=14){let result=value;while(result&&measure(result,size)>width)result=result.slice(0,-1);return result===value?value:result.slice(0,-1)+'…';}
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
    const pressed=press?.hit?.label===label&&!press.moved,offset=pressed?1:0,caption=fitText(label,w-16);
    ctx.globalAlpha=enabled?1:.48;text(caption,x+Math.max(8,(w-measure(caption))/2)+offset,subtitle?y+8:y+(h-14)/2+offset,14,primary&&enabled);if(subtitle)text(fitText(subtitle,w-16),x+8,y+32,14,primary&&enabled);ctx.globalAlpha=1;
    hit(label,x,y,w,h,tap,enabled);
  }
  function sprite(sheet:string,index:number,rows:number,x:number,y:number,w:number,h:number){const image=images[sheet];if(!image?.width)return;ctx.drawImage(image,index%4*image.width/4,Math.floor(index/4)*image.height/rows,image.width/4,image.height/rows,x,y,w,h);}
  function actor(id:string,x:number,y:number,w:number,h:number){const size=Math.min(w,h);sprite('actors',ACTOR_SPRITES[id],4,x+(w-size)/2,y+h-size,size,size);}
  function forestBackground(x:number,y:number,w:number,h:number){const image=images.forest;if(!image?.width)return;const s=Math.max(w/image.width,h/image.height),sw=w/s,sh=h/s;ctx.drawImage(image,(image.width-sw)/2,(image.height-sh)*.9,sw,sh,x,y,w,h);}
  function healthBar(x:number,y:number,w:number,hp:number,max:number){rect(x,y,w,6,'#493127','#11190e');ctx.fillStyle='#c97b60';ctx.fillRect(x+1,y+1,(w-2)*Math.max(0,Math.min(1,hp/max)),4);}
  function targetReady(){const item=selectedItem();return !!item&&ITEM_MAP[item.def].kind==='weapon'&&!item.used&&run.energy>=ITEM_MAP[item.def].cost;}
  function combatHint(compact=false){const item=selectedItem();if(!item||ITEM_MAP[item.def].kind!=='weapon')return compact?'先选武器，再点目标攻击':'先点背包里的武器，再点敌人攻击。盾牌、药剂和干粮点击即用。';return item.used?(compact?'这件武器本回合已用':'这件武器本回合已经用过了，换一件武器或结束回合。'):run.energy<ITEM_MAP[item.def].cost?(compact?'能量不足，可吃干粮或结束回合':'能量不够使用这件武器，可以吃干粮或结束回合。'):(compact?'已选武器，点击高亮目标':`已选中${ITEM_MAP[item.def].name}，再点击高亮敌人攻击。`);}
  function showTargets(){tooltip=null;open(null);scroll=0;draw();}
  function art(item:Pick<Item,'def'|'rotation'>,x:number,y:number,w:number,h:number){
    const s=ITEM_SPRITES[item.def];ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(item.rotation*Math.PI/2);if(['branchblade','forkblade'].includes(item.def))ctx.scale(1,-1);
    const size=Math.min(w,h);sprite(s.sheet,s.index,s.rows,-size/2,-size/2,size,size);ctx.restore();
  }
  function scene(x:number,y:number,w:number,h:number){
    forestBackground(x,y,w,h);
    const idle=platform.reducedMotion?0:[0,-2,0,1][Math.floor(frame/8)%4];
    const progress=motion?Math.min(1,Math.floor(motion.elapsed/90)*90/750):0,active=motion&&!platform.reducedMotion&&progress<.75;
    const ranged=!!motion?.def.includes('bow'),lunge=active&&motion?.kind==='weapon'&&!ranged?Math.sin(progress/.75*Math.PI)*12:0;
    const actorSize=Math.min(h-40,w>=740?135:Math.min(144,w*.3)),heroX=x+(w>=740?w*.13:8),actorY=y+h-actorSize-18;
    actor('hero',heroX+lunge,actorY+idle,actorSize,actorSize);
    healthBar(heroX,y+h-9,Math.min(110,actorSize+8),run.hp,run.maxHp);text(`${run.hp}/${run.maxHp}`,heroX+4,y+h-26);
    const enemies=run.enemies.filter(e=>e.hp>0||motion?.target===e.uid),ew=Math.min(w>=740?155:144,(w-112)/Math.max(1,enemies.length));
    enemies.forEach((e,i)=>{
      const ex=x+w-ew*(enemies.length-i)-(w>=740?w*.12:8),dead=e.hp===0,target=motion?.target===e.uid&&active;
      ctx.save();if(dead&&!platform.reducedMotion)ctx.globalAlpha=1-progress;else if(target&&Math.floor(progress*16)%2)ctx.globalAlpha=.45;
      actor(e.def,ex+(target?4:0),actorY+(dead&&!platform.reducedMotion?progress*18:idle),ew,actorSize);ctx.restore();
      if(h>=140){rect(ex,y+h-26,ew-4,18,C.panel);text(fitText(`${ENEMY_MAP[e.def].name} ${e.hp}/${ENEMY_MAP[e.def].hp}`,ew-10),ex+3,y+h-25);}
      healthBar(ex,y+h-7,ew-4,e.hp,ENEMY_MAP[e.def].hp);
      const next=intent(run,e),color=next.kind==='attack'?C.red:next.kind==='poison'?'#485124':next.kind==='charge'?'#715024':'#3e5b57';
      if(h>=140){rect(ex,y+23,ew-4,21,color);text(fitText(dead?'已击败':next.label,ew-10),ex+3,y+26);}
      const weapon=selectedItem(),enabled=run.phase==='battle'&&!!weapon&&ITEM_MAP[weapon.def].kind==='weapon'&&!weapon.used&&run.energy>=ITEM_MAP[weapon.def].cost&&e.hp>0;
      if(enabled){ctx.strokeStyle='#f1cf78';ctx.lineWidth=2;ctx.strokeRect(ex,actorY,ew-4,actorSize);}
      hit(`攻击 ${ENEMY_MAP[e.def].name}`,ex,y,ew,h,()=>{if(weapon)commit({type:'use',uid:weapon.uid,target:e.uid});},enabled);
    });
    if(motion){
      const r=ranged&&active?-.35:active&&motion.kind==='weapon'?(-.9+progress*3):active&&motion.kind==='heal'?-.8:active&&motion.kind==='food'?-.4:0;
      const lifted=active&&motion.kind==='shield'?-10:active&&['heal','food'].includes(motion.kind)?-18:0,size=Math.min(48,actorSize*.55);
      ctx.save();ctx.translate(heroX+actorSize*.65+lunge,y+h-28+lifted);ctx.rotate(r);art({def:motion.def,rotation:0},-size/2,-size,size,size);ctx.restore();
      if(active&&ranged){const targetIndex=enemies.findIndex(e=>e.uid===motion?.target),targetX=x+w-ew*(enemies.length-Math.max(0,targetIndex))-(w>=740?w*.12:8)+ew/2,arrowX=heroX+actorSize*.7+(targetX-heroX-actorSize*.7)*Math.min(1,progress/.6),arrowY=actorY+actorSize*.5;ctx.fillStyle='#e4c57d';ctx.fillRect(arrowX,arrowY,22,3);ctx.fillStyle='#f4e9cd';ctx.fillRect(arrowX+20,arrowY-2,5,7);}
      rect(x+8,y+2,w-16,20,C.panel);text(fitText(motion.result,w-32),x+16,y+5);
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
      if(drag?.uid===item.uid&&drag.moved)ctx.globalAlpha=.35;
      art(item,ix+3,iy+3,iw*cell-6,ih*cell-19);
      const bottomRow=Math.max(...cells.map(c=>c[1])),labelCol=Math.min(...cells.filter(c=>c[1]===bottomRow).map(c=>c[0]));
      const d=ITEM_MAP[item.def],label=d.kind==='weapon'?(item.def.includes('bow')?'弓':'武器'):({shield:'盾牌',heal:'药剂',food:'干粮',charm:'护符',armor:'护甲'} as Record<string,string>)[d.kind];
      const lx=ix+labelCol*cell+3,ly=iy+(bottomRow+1)*cell-19;
      rect(lx,ly,Math.min(cell-6,measure(label)+8),17,C.panel,C.panel);text(label,lx+3,ly+1);
      if(run.phase==='battle'){rect(ix+2,iy+2,Math.min(50,iw*cell-4),16,C.panel);text(item.used?'已用':['armor','charm'].includes(d.kind)?'被动':`${d.cost} 能量`,ix+4,iy+3);}
      const border=selected===item.uid?'#fff0af':preview?.blocked.includes(item.uid)?'#eea187':plan?.some(i=>i.uid===item.uid)?'#fff0af':neighbors.includes(item.uid)?'#667c3d':run.phase==='battle'&&d.kind==='weapon'&&!item.used&&run.energy>=d.cost?'#d1b463':d.rarity===3?'#a9752f':d.rarity===2?'#627d48':'#8d784f';
      ctx.strokeStyle=border;ctx.lineWidth=selected===item.uid||neighbors.includes(item.uid)?3:2;
      const occupied=new Set(cells.map(([a,b])=>key(a,b)));ctx.beginPath();
      for(const [a,b]of cells){
        const left=ix+a*cell+2,right=ix+(a+1)*cell-2,top=iy+b*cell+2,bottom=iy+(b+1)*cell-2;
        if(!occupied.has(key(a,b-1))){ctx.moveTo(left,top);ctx.lineTo(right,top);}
        if(!occupied.has(key(a,b+1))){ctx.moveTo(left,bottom);ctx.lineTo(right,bottom);}
        if(!occupied.has(key(a-1,b))){ctx.moveTo(left,top);ctx.lineTo(left,bottom);}
        if(!occupied.has(key(a+1,b))){ctx.moveTo(right,top);ctx.lineTo(right,bottom);}
      }ctx.stroke();
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
    const d=ITEM_MAP[item.def];art({...item,rotation:selected===item.uid?rotation:item.rotation},x,y,60,60);text(d.name,x+72,y+4,24);text(`${shape(item.def).length} 格 · ${d.cost} 能量`,x+72,y+38);y+=72;
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
    if(!run.loot.length){rect(x,y,w-6,76);paragraph('拖到这里暂放，之后还能拿回来',x+12,y+16,w-30);y+=84;}
    run.loot.forEach((item,i)=>{const ix=x+i%cols*cw,iy=y+Math.floor(i/cols)*96;rect(ix,iy,cw-6,88,selected===item.uid?'#bfbc6c':'#d4bf91','#947d4a');art({...item,rotation:selected===item.uid?rotation:item.rotation},ix+16,iy+4,cw-38,58);text(fitText(ITEM_MAP[item.def].name,cw-16),ix+5,iy+65,14,true);hit(`地上 ${ITEM_MAP[item.def].name}`,ix,iy,cw-6,88,()=>select(item),true,item.uid);});
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
    if(W>=740&&H>=500&&['prepare','battle','shop','loot'].includes(run.phase)){button(run.phase==='prepare'?'开始战斗':run.phase==='battle'?`结束回合 · ${run.energy} 能量`:'收好行囊，继续走',x,y,w,()=>run.phase==='prepare'?commit({type:'start'}):run.phase==='battle'?commit({type:'end'}):leave(),!pauses.size,true);y+=58;}
    return y+24;
  }
  function travelLog(x:number,y:number,w:number){button(logOpen?'沿途记录 −':'沿途记录 +',x,y,w,()=>{logOpen=!logOpen;draw();});y+=54;if(logOpen)for(const line of run.log)y=paragraph(line,x,y,w)+12;return y;}
  function targetHeight(w:number){const enemies=run.enemies.filter(e=>e.hp>0),cw=(w-8*(enemies.length-1))/Math.max(1,enemies.length);return Math.max(0,...enemies.map(e=>56+wrappedLines(`本回合：${intent(run,e).label}`,cw-16).length*20));}
  function combatTargets(x:number,y:number,w:number){
    const enemies=run.enemies.filter(e=>e.hp>0),cw=(w-8*(enemies.length-1))/Math.max(1,enemies.length),enabled=targetReady();
    const height=targetHeight(w);
    enemies.forEach((e,i)=>{const ex=x+i*(cw+8),weapon=selectedItem();rect(ex,y,cw,height,enabled?'#46532c':'#293522',enabled?'#efd082':C.edge);
      text(fitText(`${i+1} ${ENEMY_MAP[e.def].name}`,cw-16),ex+8,y+6);
      text(`♥${e.hp}/${ENEMY_MAP[e.def].hp}  ◇${e.block}  毒${e.poison}`,ex+8,y+27);
      const lines=wrappedLines(`本回合：${intent(run,e).label}`,cw-16);lines.forEach((line,j)=>text(line,ex+8,y+49+j*20));
      hit(`${i+1} ${ENEMY_MAP[e.def].name} · 生命 ${e.hp}/${ENEMY_MAP[e.def].hp} · 护盾 ${e.block} · 中毒 ${e.poison} · ${intent(run,e).label}`,ex,y,cw,height,()=>{if(weapon)commit({type:'use',uid:weapon.uid,target:e.uid});},enabled);
    });
    y+=height+6;text(combatHint(true),x,y);return y+24;
  }
  function closeTooltip(){tooltip=null;focus=-1;draw();const item=selectedItem();if(item)focus=hits.filter(h=>h.enabled).findIndex(h=>h.item===item.uid);draw();}
  function drawTooltip(){
    const item=[...run.items,...run.loot].find(i=>i.uid===tooltip);if(!item){tooltip=null;tooltipBounds=null;return;}
    const inside=run.items.some(i=>i.uid===item.uid),anchor=inside?{x:bag.x+item.x*bag.cell,y:bag.y+item.y*bag.cell-scroll,w:(Math.max(...shape(item.def,item.rotation).map(c=>c[0]))+1)*bag.cell}:hits.find(h=>h.item===item.uid);
    if(!anchor||anchor.y<contentTop-100||anchor.y>contentBottom){tooltip=null;tooltipBounds=null;return;}
    const w=320,h=Math.min(Math.max(120,H-bottom-top-144),470),right=inside?bag.x+bag.cell*COLS+16:anchor.x+anchor.w+12,left=right+w<=W-12?right:anchor.x-w-12;
    const x=Math.max(12,Math.min(W-w-12,left)),y=Math.max(top+76,Math.min(H-bottom-68-h,anchor.y)),bodyTop=y+44,bodyBottom=y+h-12;
    tooltipBounds={x,y,w,h};tooltipHitStart=hits.length;dy=0;clipTop=0;clipBottom=H;paper=true;
    rect(x,y,w,h,'#e2d2a6','#baa16b');text('物品详情',x+16,y+14,16,true);button('关闭详情',x+w-90,y+4,84,closeTooltip,true,false,36);
    ctx.save();ctx.beginPath();ctx.rect(x+12,bodyTop,w-24,bodyBottom-bodyTop);ctx.clip();clipTop=bodyTop;clipBottom=bodyBottom;dy=-tipScroll;ctx.translate(0,dy);
    let cy=details(item,x+16,bodyTop+4,w-32);
    if(run.phase==='battle'&&ITEM_MAP[item.def].kind==='weapon'){cy=paragraph(combatHint(),x+16,cy,w-32)+8;button('去选择敌人 ↑',x+16,cy,w-32,showTargets);cy+=52;}
    cy=itemActions(item,x+16,cy,w-32);maxTipScroll=Math.max(0,cy-bodyBottom);ctx.restore();dy=0;clipTop=0;clipBottom=H;paper=false;
    if(maxTipScroll)text('滚轮查看更多',x+16,y+h-20,12,true);
  }
  function header(){
    rect(0,top,W,W>=740?68:60,C.panel,'#8d7544');text('背包远征',16,top+8,24);
    const status=`生命 ${run.hp}/${run.maxHp} · 金币 ${run.gold} · 护盾 ${run.block} · 中毒 ${run.poison}`;
    if(W>=1080){
      text('林间行囊 · FOREST SATCHEL',16,top+40);text(`第 ${run.floor} 层 · ${FLOOR_NAMES[run.floor-1]}`,260,top+12);text(status,260,top+40);
      const controls:Array<[string,number,()=>void]>=[[`难度 · ${difficultyOf(run).name}`,96,openRestart],['图鉴',52,()=>open('codex')],['存档',52,()=>open('saves')],[muted?'声音关':'声音开',72,toggleMute],['暂停',52,()=>setPause('manual',true)],['菜单',56,()=>open('menu')]];
      let x=W-436;for(const [label,w,fn]of controls){button(label,x,top+14,w,fn,true,false,40);x+=w+8;}
    }else{text(W>=740?status:`♥ ${run.hp}/${run.maxHp}  ◉ ${run.gold}${run.block?`  ◇ ${run.block}`:''}${run.poison?`  毒 ${run.poison}`:''}`,16,top+39);button('菜单',W-72,top+6,56,()=>open('menu'),true,false,36);}
  }
  function footer(){
    dy=0;clipTop=0;clipBottom=H;
    const y=H-bottom-56;rect(0,y,W,56+bottom,C.panel);const item=selectedItem(),bw=W>=740?176:128,compact=W<480;
    if(item)button(W<740?'详情':`详情 · ${ITEM_MAP[item.def].name}`,12,y+6,W<740?64:W-bw-40,()=>open('item'),true,false,44);
    else if(compact)text(`第 ${run.floor}/3 层`,12,y+21);
    else text(`第 ${run.floor}/3 层 · ${run.discoveries.length}/${ITEMS.length} 图鉴`,16,y+20);
    if(W<740&&item&&editable())button('旋转',84,y+6,64,rotate,!pauses.size);
    else if(compact&&run.phase==='battle'){text(`回合 ${run.turn}`,84,y+8);text(`◆ ${run.energy} 能量`,84,y+30);}
    const action=run.phase==='prepare'?()=>commit({type:'start'}):run.phase==='battle'?()=>commit({type:'end'}):['shop','loot'].includes(run.phase)?()=>leave():null;
    if(action)button(run.phase==='prepare'?'开始战斗':run.phase==='battle'?'结束回合':'收好行囊，继续走',W-bw-16,y+6,bw,action,!pauses.size,true);
    else if(editable()&&item){if(W<740)button('放到地上',W-bw-16,y+6,bw,()=>commit({type:'stash',uid:item.uid}),run.items.some(i=>i.uid===item.uid),true);else button('旋转选中物品',W-bw-16,y+6,bw,rotate,!pauses.size,true);}
  }
  function mobileGround(x:number,y:number,w:number,h:number){
    const cols=Math.max(2,Math.floor(w/92)),pages=Math.max(1,Math.ceil(run.loot.length/cols)),cw=w/cols;
    groundPage=Math.max(0,Math.min(pages-1,groundPage));ground={x,y,w,h:h-50};
    rect(x,y,w,h-50,drag?.moved?'#465b33':'#2a3823');
    if(!run.loot.length)paragraph('拖到这里暂放\n也可选中装备，点“放到地上”',x+12,y+14,w-24);
    const cardH=Math.min(88,h-56);
    run.loot.slice(groundPage*cols,(groundPage+1)*cols).forEach((item,i)=>{
      const ix=x+i*cw,d=ITEM_MAP[item.def];rect(ix+3,y+3,cw-6,cardH,selected===item.uid?'#bfbc6c':'#d4bf91','#947d4a');
      art({...item,rotation:selected===item.uid?rotation:item.rotation},ix+16,y+6,cw-32,cardH-25);text(fitText(d.name,cw-14),ix+7,y+cardH-18,14,true);
      hit(`地上 ${d.name}`,ix+3,y+3,cw-6,cardH,()=>select(item),true,item.uid);
    });
    const by=y+h-44;
    button('上页',x,by,52,()=>{groundPage--;draw();},groundPage>0);text(`${groundPage+1}/${pages}`,x+62,by+14);
    const held=selectedItem(),inside=held&&run.items.some(i=>i.uid===held.uid);
    button('放到地上',x+w-172,by,112,()=>{if(held)commit({type:'stash',uid:held.uid});},!!inside);
    button('下页',x+w-52,by,52,()=>{groundPage++;draw();},groundPage<pages-1);
  }
  function mobileShop(x:number,y:number,w:number,h:number){
    offerIndex=Math.max(0,Math.min(run.offers.length-1,offerIndex));const id=run.offers[offerIndex];
    if(!id){paragraph('摊位已经售空，整理好物品再出发。',x+8,y+12,w-16);return;}
    const d=ITEM_MAP[id];art({def:id,rotation:0},x,y+2,44,44);text(fitText(d.name,w-160),x+50,y+4,16);text(`${offerIndex+1}/${run.offers.length} · ${d.shape.length} 格 · ${d.cost} 能量`,x+50,y+27);
    button('上件',x+w-104,y,48,()=>{offerIndex--;trayScroll=0;draw();},offerIndex>0);
    button('下件',x+w-48,y,48,()=>{offerIndex++;trayScroll=0;draw();},offerIndex<run.offers.length-1);
    const bodyTop=y+52,bodyBottom=y+h-50;ctx.save();ctx.beginPath();ctx.rect(x,bodyTop,w,bodyBottom-bodyTop);ctx.clip();clipTop=bodyTop;clipBottom=bodyBottom;dy=-trayScroll;ctx.translate(0,dy);
    const end=paragraph(d.description,x+4,bodyTop,w-8,16);maxTrayScroll=Math.max(0,end-bodyBottom);ctx.restore();dy=0;clipTop=contentTop;clipBottom=contentBottom;
    const refreshW=run.shop?92:0;
    button(`购买 · ${priceOf(run,id)} 金币`,x,y+h-44,w-refreshW-(refreshW?8:0),()=>commit({type:'buy',def:id}),run.gold>=priceOf(run,id),true);
    if(run.shop)button('换货 · 4',x+w-92,y+h-44,92,()=>confirm('只换未售商品，已买货位不补回。本店仅一次，可能出现相同商品。',()=>commit({type:'refresh'}),'确认换货 · 4 金币'),!run.shop.refreshed&&!!run.offers.length&&run.gold>=REFRESH_PRICE);
  }
  function mobileLayout(){
    scroll=0;maxScroll=0;maxTrayScroll=0;ground={x:0,y:0,w:0,h:0};
    const battle=run.phase==='battle',available=contentBottom-contentTop,margin=12;
    const targets=battle?targetHeight(W-24)+30:0,reserve=battle?52:220;
    const minimumScene=Math.min(100,Math.max(58,available*.13)),spare=available-minimumScene-targets-38-reserve-(W-24)/COLS*ROWS;
    const sceneH=minimumScene+Math.max(0,Math.min(spare,Math.min(280,W*.6)-minimumScene));
    const boardW=Math.min(W-24,Math.max(196,(available-sceneH-targets-38-reserve)*COLS/ROWS));
    let y=contentTop;scene(0,y,W,sceneH);y+=sceneH+6;
    if(battle)y=combatTargets(margin,y,W-24);
    const bx=(W-boardW)/2;text(`林间行囊 · ${run.bag.length} 格`,bx,y,18);text(`◆ ${run.energy}`,bx+boardW-50,y+2);y+=26;
    y=drawBag(bx,y,boardW)-12;
    tray={x:margin,y,w:W-24,h:Math.max(0,contentBottom-y-4)};
    if(battle){
      const chosen=selectedItem();text(fitText(chosen?ITEM_MAP[chosen.def].name:'选择装备，安排这一回合',W-104),margin,y+6);button('战况',W-80,y,68,()=>open('battle-info'));
      if(tray.h>=98){
        const description=chosen?ITEM_MAP[chosen.def].description:'武器点选后攻击高亮敌人；盾牌、药剂和干粮点一下即可使用。';
        ctx.save();ctx.beginPath();ctx.rect(margin,y+50,W-24,tray.h-50);ctx.clip();paragraph(description,margin,y+50,W-24,16);ctx.restore();
      }return;
    }
    const tab=drag?.moved?'ground':mobileTab,tabW=(W-24-8)/2;
    const label=({shop:'摊位',map:'路线',prepare:'遭遇',rest:'营地',event:'见闻',expand:'扩展',loot:'战利品',won:'旅途',lost:'旅途'} as Record<string,string>)[run.phase]??'旅途';
    button(label,margin,y,tabW,()=>{mobileTab='route';trayScroll=0;draw();},true,tab==='route');
    button(`地上 · ${run.loot.length}`,margin+tabW+8,y,tabW,()=>{mobileTab='ground';trayScroll=0;draw();},true,tab==='ground');y+=50;
    tray={x:margin,y,w:W-24,h:Math.max(0,contentBottom-y-4)};
    if(tab==='ground'){mobileGround(margin,y,W-24,tray.h);return;}
    if(run.phase==='shop'){mobileShop(margin,y,W-24,tray.h);return;}
    if(run.phase==='event'||run.phase==='rest'){
      const event=run.phase==='event'?EVENTS[run.event]:null,bodyBottom=y+tray.h-104;
      ctx.save();ctx.beginPath();ctx.rect(margin,y,W-24,bodyBottom-y);ctx.clip();clipTop=y;clipBottom=bodyBottom;dy=-trayScroll;ctx.translate(0,dy);
      text(event?.name??'在树下歇一会儿',margin,y,24);
      const end=paragraph(event?.text??'火还温着，刚好可以坐下来喘口气。',margin,y+34,W-24,16);maxTrayScroll=Math.max(0,end-bodyBottom);
      ctx.restore();dy=0;clipTop=contentTop;clipBottom=contentBottom;
      button(event?.action??'休息 · 恢复 12 点生命',margin,y+tray.h-96,W-24,()=>leave(event?{type:'event',accept:true}:{type:'rest',choice:'heal'}),true,true);
      button(event?'不打扰，继续走':'整理补给 · 生命上限 +4',margin,y+tray.h-44,W-24,()=>leave(event?{type:'event',accept:false}:{type:'rest',choice:'grow'}));
      if(maxTrayScroll){ctx.fillStyle=C.edge;ctx.fillRect(W-6,y,3,Math.max(12,bodyBottom-y));}return;
    }
    ctx.save();ctx.beginPath();ctx.rect(margin,y,W-24,tray.h);ctx.clip();clipTop=y;clipBottom=y+tray.h;dy=-trayScroll;ctx.translate(0,dy);
    let end=y;
    if(run.phase==='map'){
      text(`第 ${run.floor} 层 · 下一站 ${run.step+1}/${stepsInFloor(run)}`,margin,y+4);end+=32;
      const options=routes(run),bw=(W-24-(options.length-1)*8)/options.length;
      options.forEach((kind,i)=>button(NODES[kind],margin+i*(bw+8),end,bw,()=>commit({type:'node',kind}),!run.loot.length,false,52));end+=60;
      if(run.loot.length){button('放弃地上物品，继续选路',margin,end,W-24,()=>leave());end+=52;}
    }else if(run.phase==='prepare'){
      end=paragraph('先整理行囊，准备好后开始战斗。',margin,y,W-24)+8;
      for(const enemy of run.enemies)end=paragraph(`${ENEMY_MAP[enemy.def].name} · ${intent(run,enemy).label}${encounterHint(run,enemy)?`\n${encounterHint(run,enemy)}`:''}`,margin,end,W-24)+8;
    }else if(run.phase==='loot')end=paragraph('把地上战利品拖入背包，或点选后点格子放入。离开后剩余物品会丢失。',margin,y,W-24);
    else end=routePanel(margin,y,W-24);
    maxTrayScroll=Math.max(0,end-y-tray.h);ctx.restore();dy=0;clipTop=contentTop;clipBottom=contentBottom;
    if(maxTrayScroll>0){const track=tray.h,thumb=Math.max(20,track*track/(track+maxTrayScroll));ctx.fillStyle=C.edge;ctx.fillRect(W-6,y+(track-thumb)*Math.min(1,trayScroll/maxTrayScroll),3,thumb);}
  }
  function difficultyButtons(x:number,y:number,w:number){
    const kinds=Object.keys(DIFFICULTIES) as Difficulty[];
    kinds.forEach((kind,i)=>button(DIFFICULTIES[kind].name,x+i*(w+8)/3,y,(w-16)/3,()=>{difficulty=kind;draw();},true,difficulty===kind));
    return paragraph(DIFFICULTIES[difficulty].description,x,y+56,w)+12;
  }
  function title(){
    const landscape=W>=740&&H<500,desktop=W>=1000,x=desktop?W*.1:20,width=landscape?W*.53:desktop?440:W-40;
    forestBackground(0,contentTop,W,Math.max(H-contentTop,620));ctx.fillStyle='#142011b8';ctx.fillRect(0,contentTop,W,Math.max(H-contentTop,620));
    let y=contentTop+(desktop?54:20);y=paragraph('一只背包，一条通往森林深处的路',x,y,width)+14;
    const size=desktop?56:landscape?32:40;if(landscape){text('把旅途装进行囊。',x,y,size);y+=size+16;}else{text('把旅途',x,y,size);text('装进行囊。',x,y+size+12,size);y+=size*2+36;}
    y=paragraph('挪一格，换一种搭配。\n带上草药、木盾和一点运气，走进古老的森林。',x,y,width)+14;
    if(!loaded.run)y=difficultyButtons(x,y,width);else{y=paragraph(`当前难度：${difficultyOf(run).name}`,x,y,width)+8;if(run.ruleset!==2)y=paragraph('这趟旅途沿用原有商店与敌人行动，重新出发可体验本次更新。',x,y,width)+8;}
    button(loaded.run?'继续上次远征':'收拾好，出发',x,y,width,()=>{started=true;scroll=0;if(!loaded.run)run=newRun(Date.now(),difficulty);save();draw();},true,true);y+=56;
    button('玩法说明',x,y,(width-8)/2,()=>open('help'));button('存档与导入',x+(width+8)/2,y,(width-8)/2,()=>open('saves'));y+=62;
    text('单人策略冒险 · 回合制 · 随时保存',x,y);y+=36;
    const heroSize=desktop?280:landscape?160:170,hx=desktop?W*.69:landscape?W-heroSize-22:W-heroSize-24,hy=desktop?Math.max(contentTop+100,H-heroSize-50):landscape?contentTop+24:y;
    actor('hero',hx,hy,heroSize,heroSize);
    return Math.max(y,hy+heroSize+24);
  }
  function drawNotice(){
    if(!notice)return;dy=0;clipTop=0;clipBottom=H;
    const w=Math.min(620,W-24),x=(W-w)/2,lines=wrappedLines(notice,w-64),h=lines.length*22+20,y=Math.max(top+68,H-bottom-(screen?16:64)-h);
    rect(x,y,w,h,'#5b442c','#d8ad62');lines.forEach((line,i)=>text(line,x+12,y+10+i*22));rect(x+w-44,y+4,40,32);text('×',x+w-30,y+12);hit('关闭提示',x+w-44,y+4,40,32,()=>{notice='';draw();});
  }
  function modal(){
    ctx.fillStyle='#10190cf2';ctx.fillRect(0,0,W,H);hits=[];renderedText=[];dy=0;clipTop=0;clipBottom=H;
    const w=Math.min(screen==='codex'?960:640,W-24),x=(W-w)/2,y=W<740&&['item','battle-info','log'].includes(screen!)?Math.max(top+8,H-bottom-Math.min(520,H*.7)):top+8,bodyTop=y+58,bodyBottom=H-bottom-16;
    rect(x,y,w,bodyBottom-y,C.panel,'#b4a16b');text(({menu:'旅途菜单',help:'林间向导',saves:'把旅途存好',codex:'行囊里的见闻',restart:'重新出发',confirm:'出发前再确认',item:'物品详情',log:'沿途记录','battle-info':'战况与敌人'} as Record<string,string>)[screen!]??'',x+16,y+20,24);
    button('关闭',x+w-68,y+8,56,()=>open(null),true,false,40);
    ctx.save();ctx.beginPath();ctx.rect(x+10,bodyTop,w-20,bodyBottom-bodyTop-8);ctx.clip();dy=-modalScroll;clipTop=bodyTop;clipBottom=bodyBottom-8;ctx.translate(0,dy);
    let cy=bodyTop+8;const bx=x+16,bw=w-32;
    const row=(label:string,fn:()=>void,primary=false)=>{button(label,bx,cy,bw,fn,true,primary);cy+=54;};
    if(screen==='menu'){
      row('继续远征',()=>open(null),true);row('图鉴',()=>open('codex'));row('存档',()=>open('saves'));row('玩法说明',()=>open('help'));row('沿途记录',()=>open('log'));
      row(muted?'声音关 · 点击开启':'声音开 · 点击静音',toggleMute);row('重新开始 / 更改难度',openRestart);row('暂停',()=>{open(null);setPause('manual',true);});
    }
    if(screen==='help'){
      for(const value of ['摆放：电脑拖动，右键或 R 旋转；手机竖屏按住物品直接拖动，下方切换摊位、路线和地上物品，只有说明面板局部滚动。横屏可长按拖动。也可以先选物品，再点目标格。拖到有物品的位置会先检查所有交换目标能否安置，不能放下就整体退回。','战斗：先点武器，再点敌人；盾牌、药剂、干粮点击即用。每回合 3 点基础能量，每件主动装备每回合最多使用一次。护符与护甲自动生效。','搭配：武器旁边的护符可以增加伤害；弓与同行箭束、钥匙配合。详情显示实际加成及条件。','防守：护盾抵挡普通攻击，下回合清除。中毒无视护盾，每回合结算后减少一层。看清敌人预告，为蓄力重击预留盾牌。','旅途：三层森林，每层八站（旧档保留原站数）。每两场战斗与层末守卫后可以扩一格背包。战利品、商店买到的物品先在地上，装好再走。',`${difficultyOf(run).name}难度：${difficultyOf(run).description}进度在每次行动后自动保存。`,`键盘：Tab 切换控件，Enter 确认，R 旋转，数字 1/2 选敌，空格暂停，Esc 取消选择或关闭菜单。`])cy=paragraph(value,bx,cy,bw)+16;
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
    if(screen==='battle-info'){cy=routePanel(bx,cy,bw);row('沿途记录',()=>open('log'));}
    if(screen==='log')for(const line of run.log)cy=paragraph(line,bx,cy,bw)+16;
    if(notice)cy=paragraph(notice,bx,cy+8,bw)+8;
    maxModalScroll=Math.max(0,cy-bodyBottom+12);ctx.restore();dy=0;
    if(maxModalScroll>0)text('上下滑动 / 滚轮查看更多',bx,bodyBottom-18);
  }
  function draw(){
    if(!canvas.width)return;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);hits=[];renderedText=[];neighbors=[];preview=null;dy=0;clipTop=0;clipBottom=H;
    if(!ready){text(failed?'素材加载失败，请重新打开游戏。':`正在准备森林行囊 ${loadedAssets}/4`,20,H/2,16);return;}
    header();contentTop=top+(W>=740?68:60);contentBottom=H-bottom-(started?60:0);clipTop=contentTop;clipBottom=contentBottom;
    if(!started){
      ctx.save();ctx.beginPath();ctx.rect(0,contentTop,W,contentBottom-contentTop);ctx.clip();dy=-scroll;ctx.translate(0,dy);maxScroll=Math.max(0,title()-contentBottom);ctx.restore();dy=0;
    }else if(W<740){
      mobileLayout();footer();
    }else{
      ctx.save();ctx.beginPath();ctx.rect(0,contentTop,W,contentBottom-contentTop);ctx.clip();dy=-scroll;ctx.translate(0,dy);
      const wide=W>=740,landscape=wide&&H<500;
      let boardW=landscape?Math.min(W*.45,(contentBottom-contentTop-38)*COLS/ROWS):wide?Math.min(560,W*.57):W-32;
      if(!wide&&run.phase==='battle'){
        let available=Math.max(240,(contentBottom-contentTop-138-targetHeight(boardW))*COLS/ROWS);
        while(boardW>available){boardW=available;available=Math.max(240,(contentBottom-contentTop-138-targetHeight(boardW))*COLS/ROWS);}
      }
      const bx=landscape?W-boardW-16:wide?16:(W-boardW)/2,sideX=landscape?16:boardW+48,sideW=landscape?W-boardW-48:W-boardW-64,sceneW=landscape?sideW:W,sceneH=landscape?86:wide?190:Math.max(64,Math.min(100,contentBottom-contentTop-boardW/COLS*ROWS-(run.phase==='battle'?targetHeight(boardW)+30:0)-44));
      let y=contentTop,sideY=y;
      scene(landscape?16:0,y,sceneW,sceneH);y+=sceneH+(wide?20:8);
      if(landscape){sideY=y;if(run.phase==='battle')sideY=combatTargets(sideX,sideY,sideW);y=contentTop+4;}
      else{sideY=y;if(run.phase==='battle')y=combatTargets(bx,y,boardW);}
      text(`林间行囊 · ${run.bag.length} 格`,bx,y,wide&&!landscape?24:18);text(`◆ ${run.energy}`,bx+boardW-55,y+3);y+=wide&&!landscape?34:28;
      y=drawBag(bx,y,boardW);
      if(editable()&&!drag)y=paragraph('电脑拖动，右键 / R 旋转；触屏长按拖动，也可点选后点格子放置。',bx,y-12,boardW)+12;
      if(!wide){y=routePanel(bx,y+8,boardW);y=groundItems(bx,y+8,boardW);y=travelLog(bx,y,boardW);}
      else{sideY=routePanel(sideX,sideY+8,sideW);sideY=groundItems(sideX,sideY+8,sideW);sideY=travelLog(sideX,sideY,sideW);}
      maxScroll=Math.max(0,Math.max(y,sideY)+16-contentBottom);ctx.restore();dy=0;footer();
    }
    if(drag?.moved){const item=[...run.items,...run.loot].find(i=>i.uid===drag!.uid);if(item){const cells=shape(item.def,drag.rotation),w=(Math.max(...cells.map(c=>c[0]))+1)*bag.cell,h=(Math.max(...cells.map(c=>c[1]))+1)*bag.cell;ctx.globalAlpha=.8;art({...item,rotation:drag.rotation},drag.x-w/2,drag.y-h/2,w,h);ctx.globalAlpha=1;}}
    if(pauses.has('manual')&&!screen){ctx.fillStyle='#10190cf2';ctx.fillRect(0,0,W,H);hits=[];text('歇一会儿，行囊还在。',24,H/2-50,24);button('继续远征',24,H/2+12,W-48,()=>setPause('manual',false),true,true);}
    if(tooltip&&!screen&&!pauses.size)drawTooltip();
    if(screen)modal();
    drawNotice();
    const focused=focusableHits()[focus];if(focused){ctx.strokeStyle='#f4e9cd';ctx.lineWidth=3;ctx.strokeRect(focused.x+3,focused.y+3,focused.w-6,focused.h-6);}
    platform.onState?.(getState(),tooltip&&!screen?hits.slice(tooltipHitStart):hits);
  }
  function resize(){
    const v=platform.viewport();W=Math.max(320,Math.min(1120,v.width));const cssScale=v.width/W;H=v.height/cssScale;top=v.top/cssScale;bottom=v.bottom/cssScale;scale=cssScale*v.dpr;
    canvas.width=Math.round(v.width*v.dpr);canvas.height=Math.round(v.height*v.dpr);scroll=0;modalScroll=0;trayScroll=0;drag=null;press=null;draw();
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
      const insideTray=W<740&&started&&x>=tray.x&&x<tray.x+tray.w&&y>=tray.y&&y<tray.y+tray.h;
      press={x,y,startY:y,touch:event.touch,hit:target,moved:false,scroll:screen?modalScroll:insideTooltip?tipScroll:insideTray?trayScroll:scroll,held:0,tooltip:insideTooltip,tray:insideTray};
      if(target?.item&&(!event.touch||W<740)&&editable()&&!screen&&!pauses.size){const item=[...run.items,...run.loot].find(i=>i.uid===target.item)!;drag={uid:item.uid,rotation:selected===item.uid?rotation:item.rotation,x,y,startX:x,startY:y,moved:false};}
      draw();
    }else if(event.type==='move'&&press){
      if(Math.hypot(x-press.x,y-press.startY)>6)press.moved=true;
      if(drag){drag.x=x;drag.y=y;drag.moved=press.moved;if(drag.moved){selected=drag.uid;rotation=drag.rotation;tooltip=null;}draw();}
      else if(press.touch&&press.moved){const amount=press.scroll+press.startY-y;if(screen)modalScroll=Math.max(0,Math.min(maxModalScroll,amount));else if(press.tooltip)tipScroll=Math.max(0,Math.min(maxTipScroll,amount));else if(press.tray)trayScroll=Math.max(0,Math.min(maxTrayScroll,amount));else scroll=Math.max(0,Math.min(maxScroll,amount));draw();}
    }else if(event.type==='up'&&event.button===0&&press){
      const current=press,d=drag;press=null;drag=null;
      if(d?.moved){const item=[...run.items,...run.loot].find(i=>i.uid===d.uid),drop=item&&dropPosition(d,item);if(drop)commit({type:'place',uid:d.uid,...drop,rotation:d.rotation});else if(x>=ground.x&&x<ground.x+ground.w&&y>=ground.y&&y<ground.y+ground.h&&run.items.some(i=>i.uid===d.uid))commit({type:'stash',uid:d.uid});draw();}
      else if(!current.moved&&current.hit&&x>=current.hit.x&&x<current.hit.x+current.hit.w&&y>=current.hit.y&&y<current.hit.y+current.hit.h){current.hit.tap();}
      else draw();
      console.info('backpack-state',JSON.stringify(getState()));
    }
  }
  function wheel(delta:number,x?:number,y?:number){const ratio=W/platform.viewport().width,inside=tooltip&&tooltipBounds&&(x===undefined||y===undefined||x*ratio>=tooltipBounds.x&&x*ratio<tooltipBounds.x+tooltipBounds.w&&y*ratio>=tooltipBounds.y&&y*ratio<tooltipBounds.y+tooltipBounds.h),insideTray=x===undefined||y===undefined||x*ratio>=tray.x&&x*ratio<tray.x+tray.w&&y*ratio>=tray.y&&y*ratio<tray.y+tray.h;if(screen)modalScroll=Math.max(0,Math.min(maxModalScroll,modalScroll+delta));else if(inside)tipScroll=Math.max(0,Math.min(maxTipScroll,tipScroll+delta));else if(W<740&&started){if(insideTray)trayScroll=Math.max(0,Math.min(maxTrayScroll,trayScroll+delta));}else scroll=Math.max(0,Math.min(maxScroll,scroll+delta));draw();}
  function focusableHits(){return (tooltip&&!screen?hits.slice(tooltipHitStart):hits).filter(h=>h.enabled);}
  function keyboard(code:string,shift=false){
    if(['hidden','sidebar','boss','text-input'].some(reason=>pauses.has(reason)))return;
    if(code==='Tab'){const length=focusableHits().length;focus=length?(focus+(shift?-1:1)+length)%length:-1;draw();return;}
    if(code==='Enter'){focusableHits()[focus]?.tap();return;}
    if(code==='Escape'){if(screen)open(null);else if(tooltip)closeTooltip();else{selected=null;drag=null;draw();}return;}
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
