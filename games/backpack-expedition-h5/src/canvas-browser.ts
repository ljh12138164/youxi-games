import {connectYouxiPlatform} from '@shared/platform';
import {createBackpackGame} from './canvas-game.ts';
import {ForestAudio} from './audio.ts';
import actors from './assets/actors-pixel-v1.png';
import weapons from './assets/weapons-pixel-v1.png';
import equipment from './assets/equipment-pixel-v1.png';
import forest from './assets/forest-pixel-v2.png';
import type {GameHit} from './canvas-platform.ts';

const root=document.getElementById('root')!;
root.className='forest-game';
const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','背包远征游戏画布，Tab 选择操作，Enter 确认');root.append(canvas);
const accessible=document.createElement('nav');accessible.className='canvas-accessibility';accessible.setAttribute('aria-label','游戏操作');root.append(accessible);
const live=document.createElement('p');live.className='sr-only';live.setAttribute('role','status');root.append(live);
const sound=new ForestAudio();let handle:ReturnType<typeof connectYouxiPlatform>=null,signature='',accessibleHits:GameHit[]=[];
function textDialog(title:string,value:string,editable:boolean):Promise<string>{
  return new Promise((resolve,reject)=>{
    const dialog=document.createElement('dialog'),heading=document.createElement('h2'),area=document.createElement('textarea'),ok=document.createElement('button'),cancel=document.createElement('button');
    heading.textContent=title;area.value=value;area.readOnly=!editable;area.setAttribute('aria-label',title);ok.textContent=editable?'校验存档':'完成';cancel.textContent='取消';
    dialog.append(heading,area,ok,cancel);root.append(dialog);
    const close=()=>{dialog.close();dialog.remove();game.setPause('text-input',false);};
    ok.onclick=()=>{const text=area.value;close();resolve(text);};cancel.onclick=()=>{close();reject(Error('已取消。'));};dialog.oncancel=event=>{event.preventDefault();cancel.click();};
    game.setPause('text-input',true);dialog.showModal();area.focus();if(!editable)area.select();
  });
}
const game=createBackpackGame({
  canvas,createImage:()=>new Image(),
  viewport:()=>({width:innerWidth,height:innerHeight,dpr:Math.min(devicePixelRatio||1,3),top:0,bottom:0}),
  storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},
  resources:{actors,weapons,equipment,forest},sound,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
  exportText:async text=>{await textDialog('复制存档并妥善保存',text,false);},importText:()=>textDialog('粘贴存档 JSON','',true),
  ready:()=>handle?.ready(),
  onState:(state,hits)=>{
    accessibleHits=hits;
    root.dataset.running=String(state.running);root.dataset.idleFrame=String(state.frame);root.dataset.ready=String(state.ready);
    const status=`${state.run.phase} · 生命 ${state.run.hp}/${state.run.maxHp} · 能量 ${state.run.energy} · ${state.notice}`;
    if(live.textContent!==status)live.textContent=status;
    const next=JSON.stringify(hits.map(h=>[h.label,h.enabled]));if(next===signature)return;signature=next;
    accessible.replaceChildren(...hits.map((h,index)=>{const button=document.createElement('button');button.textContent=h.label;button.disabled=!h.enabled;button.onclick=()=>accessibleHits[index]?.tap();return button;}));
  },
});
handle=connectYouxiPlatform({onIdentity:identity=>game.setNickname(identity.user?.nickname??'独自远行'),onState:state=>{game.setPause('sidebar',state.sidebar);game.setPause('boss',state.boss);},setTemporaryMuted:value=>sound.setTemporaryMuted(value),isRunning:()=>game.getState().running});
function pointer(event:PointerEvent,type:'down'|'move'|'up'|'cancel'){
  if(type==='down'&&event.button===2)return;
  if(type==='down'){canvas.focus({preventScroll:true});if(event.button===0)canvas.setPointerCapture(event.pointerId);}
  game.input({type,x:event.clientX,y:event.clientY,touch:event.pointerType==='touch',button:event.button});
}
canvas.addEventListener('pointerdown',event=>pointer(event,'down'));
canvas.addEventListener('pointermove',event=>pointer(event,'move'));
canvas.addEventListener('pointerup',event=>pointer(event,'up'));
canvas.addEventListener('pointercancel',event=>pointer(event,'cancel'));
canvas.addEventListener('contextmenu',event=>event.preventDefault());
// Chording right-click while holding left emits mousedown, not another pointerdown.
canvas.addEventListener('mousedown',event=>{if(event.button===2){event.preventDefault();game.input({type:'down',x:event.clientX,y:event.clientY,touch:false,button:2});}});
canvas.addEventListener('wheel',event=>{event.preventDefault();game.wheel(event.deltaY,event.clientX,event.clientY);},{passive:false});
canvas.addEventListener('keydown',event=>{if(['Tab','Enter','Escape','Space','KeyR','ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.code)||/^Digit[1-9]$/.test(event.code)){event.preventDefault();game.keyboard(event.code,event.shiftKey);}});
window.addEventListener('resize',game.resize);
window.addEventListener('blur',()=>game.input({type:'cancel',x:0,y:0,touch:false,button:0}));
document.addEventListener('visibilitychange',()=>game.setPause('hidden',document.hidden));
let previous=performance.now();function loop(time:number){game.tick(time-previous);previous=time;requestAnimationFrame(loop);}requestAnimationFrame(loop);
Object.assign(globalThis,{__backpackGame:{getState:game.getState,getHits:game.getHits,isMuted:game.isMuted}});
