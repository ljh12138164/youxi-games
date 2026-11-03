import {createBackpackGame} from '../src/canvas-game.ts';
import type {GameInput,GamePlatform} from '../src/canvas-platform.ts';
import {SOUND_TONES} from '../src/audio.ts';

type Touch={clientX:number;clientY:number};
type TouchEvent={touches:Touch[];changedTouches:Touch[]};
type Audio={src:string;volume:number;play:()=>void;pause:()=>void};
declare const tt:{
  createCanvas:()=>HTMLCanvasElement;createImage:()=>HTMLImageElement;
  getSystemInfoSync:()=>{windowWidth:number;windowHeight:number;pixelRatio:number;safeArea?:{top:number;bottom:number}};
  getStorageSync:(key:string)=>unknown;setStorageSync:(key:string,value:string)=>void;
  createInnerAudioContext:()=>Audio;
  onTouchStart:(fn:(event:TouchEvent)=>void)=>void;onTouchMove:(fn:(event:TouchEvent)=>void)=>void;onTouchEnd:(fn:(event:TouchEvent)=>void)=>void;onTouchCancel:(fn:()=>void)=>void;
  onHide:(fn:()=>void)=>void;onShow:(fn:()=>void)=>void;onWindowResize?:(fn:()=>void)=>void;
  setClipboardData:(options:{data:string;success:()=>void;fail:(error:unknown)=>void})=>void;
  getClipboardData:(options:{success:(result:{data:string})=>void;fail:(error:unknown)=>void})=>void;
};
const canvas=tt.createCanvas();let muted=false,paused=false;
const clips:Partial<Record<keyof typeof SOUND_TONES,Audio>>={};
try{for(const kind of Object.keys(SOUND_TONES) as (keyof typeof SOUND_TONES)[]){const audio=tt.createInnerAudioContext();audio.src=`assets/${kind}.wav`;audio.volume=.12;clips[kind]=audio;}}catch(error){console.warn('backpack-audio',String(error));}
const pauseAudio=()=>Object.values(clips).forEach(audio=>audio?.pause());
const sound:GamePlatform['sound']={play:kind=>{if(!muted&&!paused){try{clips[kind]?.play();}catch{/* Optional audio. */}}},setUserMuted:v=>{muted=v;if(v)pauseAudio();},setPaused:v=>{paused=v;if(v)pauseAudio();},isMuted:()=>muted||paused};
const game=createBackpackGame({
  canvas,createImage:()=>tt.createImage(),
  viewport:()=>{const info=tt.getSystemInfoSync();return {width:info.windowWidth,height:info.windowHeight,dpr:info.pixelRatio||1,top:(info.safeArea?.top??24)+44,bottom:Math.max(0,info.windowHeight-(info.safeArea?.bottom??info.windowHeight))};},
  storage:{getItem:key=>{const value=tt.getStorageSync(key);return value===undefined||value===null||value===''?null:typeof value==='string'?value:JSON.stringify(value);},setItem:(key,value)=>tt.setStorageSync(key,value)},
  saveKey:'youxi:backpack-expedition-h5:douyin:v1',sound,reducedMotion:false,
  resources:{actors:'assets/actors-pixel-v1.png',weapons:'assets/weapons-pixel-v1.png',equipment:'assets/equipment-pixel-v1.png',forest:'assets/forest-pixel-v2.png'},
  exportText:data=>new Promise((resolve,reject)=>tt.setClipboardData({data,success:resolve,fail:reject})),
  importText:()=>new Promise((resolve,reject)=>tt.getClipboardData({success:r=>resolve(r.data),fail:reject})),
});
function touch(event:TouchEvent,type:GameInput['type']){const t=event.changedTouches[0]??event.touches[0];if(t)game.input({type,x:t.clientX,y:t.clientY,touch:true,button:0});}
tt.onTouchStart(e=>touch(e,'down'));tt.onTouchMove(e=>touch(e,'move'));tt.onTouchEnd(e=>touch(e,'up'));tt.onTouchCancel(()=>game.input({type:'cancel',x:0,y:0,touch:true,button:0}));
tt.onHide(()=>{game.setPause('hidden',true);console.info('backpack-hidden',JSON.stringify(game.getState()));});
tt.onShow(()=>{game.setPause('hidden',false);console.info('backpack-shown',JSON.stringify(game.getState()));});
tt.onWindowResize?.(game.resize);
let previous=Date.now();setInterval(()=>{const now=Date.now();game.tick(now-previous);previous=now;},40);
Object.assign(globalThis,{__backpackGame:{getState:game.getState,getHits:game.getHits,isMuted:game.isMuted}});
