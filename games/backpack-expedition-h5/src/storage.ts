import { ENEMY_MAP, ITEM_MAP } from './content.ts';
import { canPlace, COLS, ROWS, type Run } from './engine.ts';

export const SAVE_KEY='youxi:backpack-expedition-h5:v1';
const MAX_BYTES=2*1024*1024;
export function validateSave(value:unknown):value is Run {
  if(!value||typeof value!=='object')return false;
  const r=value as Run;
  if(r.version!==1||!['map','prepare','battle','loot','shop','rest','event','expand','won','lost'].includes(r.phase))return false;
  if(![r.seed,r.seq,r.floor,r.step,r.hp,r.maxHp,r.gold,r.energy,r.block,r.poison,r.turn,r.xp,r.kills,r.battles,r.event].every(n=>Number.isSafeInteger(n)&&n>=0))return false;
  if(r.floor<1||r.floor>3||r.step>5||r.maxHp<1||r.hp>r.maxHp||r.event>5||r.turn<1)return false;
  if(r.hp===0&&r.phase!=='lost')return false;
  if(r.rescues!==undefined&&r.rescues!==0&&r.rescues!==1)return false;
  if(r.difficulty!==undefined&&!['easy','normal','hard'].includes(r.difficulty))return false;
  if(!Array.isArray(r.bag)||r.bag.length>COLS*ROWS||new Set(r.bag).size!==r.bag.length||r.bag.some(c=>!/^([0-6]),([0-4])$/.test(c)))return false;
  if(!Array.isArray(r.items)||!Array.isArray(r.loot)||r.items.length+r.loot.length>100)return false;
  const ids=new Set<number>();
  for(const i of [...r.items,...r.loot]){
    if(!i||!ITEM_MAP[i.def]||!Number.isSafeInteger(i.uid)||i.uid<1||i.uid>=r.seq||ids.has(i.uid)||![i.x,i.y,i.rotation,i.used].every(Number.isSafeInteger)||i.rotation<0||i.rotation>3||i.used<0)return false;
    ids.add(i.uid);
  }
  if(r.items.some(i=>!canPlace(r,i,i.x,i.y,i.rotation)))return false;
  if(!Array.isArray(r.enemies)||r.enemies.length>10||r.enemies.some(e=>!e||!ENEMY_MAP[e.def]||![e.uid,e.hp,e.block,e.poison].every(n=>Number.isSafeInteger(n)&&n>=0)||ids.has(e.uid)))return false;
  if(new Set(r.enemies.map(e=>e.uid)).size!==r.enemies.length||r.enemies.some(e=>e.uid<1||e.uid>=r.seq))return false;
  if(['prepare','battle'].includes(r.phase)&&!r.enemies.some(e=>e.hp>0))return false;
  if(!Array.isArray(r.offers)||r.offers.some(id=>!ITEM_MAP[id])||!Array.isArray(r.discoveries)||r.discoveries.some(id=>!ITEM_MAP[id]))return false;
  if(!Array.isArray(r.log)||r.log.length>20||r.log.some(s=>typeof s!=='string'||s.length>500))return false;
  return ['battle','elite','boss','shop','rest','event'].includes(r.node);
}
export function parseSave(text:string):Run {
  if(text.length>MAX_BYTES)throw Error('存档超过 2 MiB，无法导入。');
  const parsed:unknown=JSON.parse(text);
  if(!validateSave(parsed))throw Error('存档格式不匹配或已经损坏。原来的进度还在。');
  return parsed;
}
let observed:string|null|undefined;
export function readSave():{run?:Run;error?:string} {
  try{
    const text=localStorage.getItem(SAVE_KEY);observed=text;
    return text?{run:parseSave(text)}:{};
  }catch(error){return {error:error instanceof Error?error.message:'读取存档失败。'};}
}
export function writeSave(run:Run):{ok:boolean;error?:string} {
  try{
    const current=localStorage.getItem(SAVE_KEY);
    if(observed!==undefined&&current!==observed)return {ok:false,error:'另一窗口更新了进度。请先导出当前存档，再重新读取。'};
    if(!validateSave(run))return {ok:false,error:'当前进度未通过校验，未覆盖旧存档。'};
    const text=JSON.stringify({...run,savedAt:Date.now()});
    if(current)localStorage.setItem(`${SAVE_KEY}:backup`,current);
    localStorage.setItem(SAVE_KEY,text);observed=text;return {ok:true};
  }catch{return {ok:false,error:'浏览器没有保存成功。请导出存档，避免关闭后丢失进度。'};}
}
export function restoreBackup():Run {
  const text=localStorage.getItem(`${SAVE_KEY}:backup`);
  if(!text)throw Error('还没有可用备份。');
  return parseSave(text);
}
