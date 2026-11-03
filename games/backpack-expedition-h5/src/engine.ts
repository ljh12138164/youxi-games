import { ENEMIES, ENEMY_MAP, EVENTS, ITEMS, ITEM_MAP } from './content.ts';

export type Phase = 'map'|'prepare'|'battle'|'loot'|'shop'|'rest'|'event'|'expand'|'won'|'lost';
export type Difficulty = 'easy'|'normal'|'hard';
export const DIFFICULTIES = {
  easy:{name:'轻松',hp:40,gold:26,recovery:4,rescues:1,attack:[0.75,0.85,0.95],description:'40 点生命，额外药剂；战后恢复 4 点，有一次濒死救援。'},
  normal:{name:'标准',hp:34,gold:20,recovery:2,rescues:1,attack:[0.9,1,1.1],description:'34 点生命；战后恢复 2 点，有一次濒死救援。敌人伤害比轻松更高。'},
  hard:{name:'挑战',hp:30,gold:16,recovery:0,rescues:0,attack:[1.05,1.2,1.35],description:'30 点生命；战后不回血，没有濒死救援。敌人伤害最高。'},
} as const;
export const difficultyOf = (run:Run) => DIFFICULTIES[run.difficulty??'easy'];
export type NodeKind = 'battle'|'elite'|'boss'|'shop'|'rest'|'event';
export type Item = { uid: number; def: string; x: number; y: number; rotation: number; used: number };
export type Enemy = { uid: number; def: string; hp: number; block: number; poison: number; broken?: boolean; stageTurn?: number };
export type ShopKind='weapon'|'build'|'supply'|'any';
export const REFRESH_PRICE=4;
export const priceOf=(run:Run,def:string)=>run.ruleset===2&&def==='potion'?14:run.ruleset===2&&def==='trailmix'?10:ITEM_MAP[def].price;
export type Run = {
  version: 1; seed: number; seq: number; phase: Phase; floor: number; step: number;
  hp: number; maxHp: number; gold: number; energy: number; block: number; poison: number;
  turn: number; xp: number; kills: number; bag: string[]; items: Item[]; loot: Item[];
  enemies: Enemy[]; offers: string[]; node: NodeKind; event: number; log: string[];
  discoveries: string[]; battles: number; savedAt: number;
  rescues?: number;
  difficulty?: Difficulty;
  stepsPerFloor?: 8;
  seenEvents?: number[];
  ruleset?: 2;
  shop?: {kinds:ShopKind[];refreshed:boolean;sold:string[]};
};
export type Action =
  | { type: 'node'; kind: NodeKind }
  | { type: 'place'; uid: number; x: number; y: number; rotation: number }
  | { type: 'stash'; uid: number }
  | { type: 'discard'; uid: number }
  | { type: 'start' }
  | { type: 'use'; uid: number; target?: number }
  | { type: 'end' }
  | { type: 'leave' }
  | { type: 'buy'; def: string }
  | { type: 'sell'; uid: number }
  | { type: 'refresh' }
  | { type: 'rest'; choice: 'heal'|'grow' }
  | { type: 'event'; accept: boolean }
  | { type: 'expand'; cell: string };

export const COLS = 7;
export const ROWS = 5;
export const key = (x: number,y: number) => `${x},${y}`;
export function shape(def: string, rotation = 0): [number,number][] {
  let cells = ITEM_MAP[def].shape;
  for (let i=0;i<((rotation%4)+4)%4;i++) cells = cells.map(([x,y])=>[-y,x]);
  const minX=Math.min(...cells.map(c=>c[0])), minY=Math.min(...cells.map(c=>c[1]));
  return cells.map(([x,y])=>[x-minX,y-minY]);
}
export const cellsOf = (item: Item): [number,number][] => shape(item.def,item.rotation).map(([x,y])=>[x+item.x,y+item.y]);
export function canPlace(run: Run, item: Item, x: number,y: number,rotation: number): boolean {
  const occupied = new Set(run.items.filter(i=>i.uid!==item.uid).flatMap(i=>cellsOf(i).map(([a,b])=>key(a,b))));
  return shape(item.def,rotation).every(([a,b])=>run.bag.includes(key(a+x,b+y))&&!occupied.has(key(a+x,b+y)));
}
export function swapPlan(run:Run,item:Item,x:number,y:number,rotation:number):Item[]|undefined {
  const moved={...item,x,y,rotation},destination=cellsOf(moved).map(([a,b])=>key(a,b));
  const targets=run.items.filter(i=>i.uid!==item.uid&&cellsOf(i).some(([a,b])=>destination.includes(key(a,b))));
  if(!targets.length)return;
  const cleared={...run,items:run.items.filter(i=>i.uid!==item.uid&&!targets.some(t=>t.uid===i.uid))};
  if(!canPlace(cleared,item,x,y,rotation))return;
  if(!run.items.some(i=>i.uid===item.uid))return targets.map(i=>({...i,x:-1,y:-1}));
  const fixed={...cleared,items:[...cleared.items,moved]};
  const freed=new Set(cellsOf(item).map(([a,b])=>key(a,b)).filter(c=>!destination.includes(c)));
  const options=targets.map(target=>{
    const choices:Array<{item:Item;cells:string[];returned:number;distance:number}>=[];
    for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){
      if(!canPlace(fixed,target,col,row,target.rotation))continue;
      const candidate={...target,x:col,y:row},cells=cellsOf(candidate).map(([a,b])=>key(a,b));
      choices.push({item:candidate,cells,returned:cells.filter(c=>freed.has(c)).length,distance:Math.abs(col-item.x)+Math.abs(row-item.y)});
    }
    return choices.sort((a,b)=>b.returned-a.returned||a.distance-b.distance);
  }).sort((a,b)=>a.length-b.length);
  // At most one target per destination cell; current item shapes occupy at most four cells.
  function fit(index:number,occupied:Set<string>):Item[]|undefined {
    if(index===options.length)return [];
    for(const candidate of options[index]){
      if(candidate.cells.some(c=>occupied.has(c)))continue;
      const rest=fit(index+1,new Set([...occupied,...candidate.cells]));
      if(rest)return [candidate.item,...rest];
    }
  }
  return fit(0,new Set());
}
export const stepsInFloor=(run:Run)=>run.stepsPerFloor??6;
export function adjacent(a: Item,b: Item): boolean {
  return cellsOf(a).some(([x,y])=>cellsOf(b).some(([u,v])=>Math.abs(x-u)+Math.abs(y-v)===1));
}
export function power(run: Run,item: Item): { value: number; sources: string[] } {
  const def=ITEM_MAP[item.def]; let value=def.power; const sources:string[]=[];
  if (def.kind==='weapon'&&def.effect!=='poison') for(const other of run.items) {
    const d=ITEM_MAP[other.def];
    const applies = d.kind==='charm' && ((d.effect==='adjacent'&&adjacent(item,other)) ||
      (def.effect==='row'&&d.effect==='row'&&cellsOf(item).some(c=>cellsOf(other).some(o=>o[1]===c[1]))));
    if (applies) { value+=d.power; sources.push(`${d.name} +${d.power}`); }
  }
  if(def.id==='forkblade'&&run.items.some(i=>ITEM_MAP[i.def].kind==='shield'&&adjacent(item,i))){value+=5;sources.push('相邻盾牌 +5');}
  if(def.id==='sproutshield'&&run.items.some(i=>ITEM_MAP[i.def].kind==='armor'&&adjacent(item,i))){value+=4;sources.push('相邻护甲 +4');}
  return {value,sources};
}
export function poisonOnHit(run:Run,item:Item){
  if(ITEM_MAP[item.def].effect==='poison')return 2;
  if(item.def!=='mossbow')return 0;
  const arrows=run.items.filter(i=>['arrows','barbedarrows','silverarrows'].includes(i.def)&&cellsOf(item).some(c=>cellsOf(i).some(p=>c[1]===p[1])));
  return arrows.length>=2?2:0;
}
function random(run: Run): number {
  let s=run.seed|0; s^=s<<13;s^=s>>>17;s^=s<<5;run.seed=s>>>0;
  return run.seed/4294967296;
}
function makeItem(run: Run,def: string,x=-1,y=-1): Item {
  if(!run.discoveries.includes(def)) run.discoveries.push(def);
  return {uid:run.seq++,def,x,y,rotation:0,used:0};
}
function log(run:Run,text:string) {run.log=[text,...run.log].slice(0,7);}
function heal(run:Run,n:number) {run.hp=Math.min(run.maxHp,run.hp+n);}
export function newRun(seed=Date.now(),difficulty:Difficulty='normal'): Run {
  const settings=DIFFICULTIES[difficulty];
  const run:Run={version:1,ruleset:2,difficulty,stepsPerFloor:8,seenEvents:[],seed:(seed>>>0)||1,seq:1,phase:'map',floor:1,step:0,hp:settings.hp,maxHp:settings.hp,gold:settings.gold,energy:3,block:0,poison:0,turn:1,xp:0,kills:0,
    bag:Array.from({length:24},(_,i)=>key(i%6,Math.floor(i/6))),items:[],loot:[],enemies:[],offers:[],node:'battle',event:0,log:['把行囊收拾好，再选一条路出发。'],discoveries:[],battles:0,savedAt:0,rescues:0};
  for(const [def,x,y] of [['staff',0,0],['shield',1,0],['potion',3,0],['bread',3,2],['flower',1,2]] as const)run.items.push(makeItem(run,def,x,y));
  if(difficulty==='easy')run.items.push(makeItem(run,'potion',4,0));
  run.items.push(makeItem(run,'dagger',3,1));
  return run;
}
export function routes(run:Run):NodeKind[] {
  if(stepsInFloor(run)===8)return ([['battle','event'],['shop','event'],['battle','elite'],['rest','event'],['event'],['shop','rest'],['battle','elite'],['boss']] as NodeKind[][])[run.step]??[];
  return ([['battle','event'],['shop','event'],['battle','elite'],['rest','event'],['battle','elite'],['boss']] as NodeKind[][])[run.step]??[];
}
export function expansionCells(run:Run):string[] {
  const result:string[]=[];
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(!run.bag.includes(key(x,y))&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>run.bag.includes(key(x+a,y+b))))result.push(key(x,y));
  return result;
}
const tactical=(run:Run,enemy:Enemy)=>run.ruleset===2&&run.difficulty==='hard'&&/^(elite|boss)/.test(enemy.def);
export function encounterHint(run:Run,enemy:Enemy):string {
  if(!tactical(run,enemy))return '';
  switch(enemy.def){
    case 'elite1':case 'boss1':return '破壳：打空护盾后，下一次攻击伤害 -4。举盾后会进攻，再休整一回合。';
    case 'elite2':case 'boss2':return '孢雾：施毒后进攻，再休整一回合。此敌人施毒最多使你达到 3 层中毒。';
    case 'elite3':return '重击：蓄力一回合后攻击，重击额外造成 6 点伤害，再休整一回合。提前准备盾牌与补给。';
    default:return enemy.stageTurn?(run.turn<enemy.stageTurn?'半血觉醒：下回合进入第二阶段，先蓄力，再重击；重击后仍会休整。':'第二阶段：蓄力重击与施毒交替，重击后休整；施毒最多达到 3 层。'):'古树：蓄力重击后休整。半血后从下一回合进入第二阶段，保留休整窗口。';
  }
}
export function intent(run:Run,enemy:Enemy):{kind:'attack'|'guard'|'poison'|'charge'|'rest';value:number;label:string} {
  const def=ENEMY_MAP[enemy.def];let kind:'attack'|'guard'|'poison'|'charge'|'rest'=def.pattern[(run.turn-1)%def.pattern.length];
  let bonus=0;
  if(tactical(run,enemy)){
    const patterns:Record<string,('attack'|'guard'|'poison'|'charge'|'rest')[]>={
      elite1:['guard','attack','rest'],boss1:['guard','attack','rest','attack'],
      elite2:['poison','attack','rest'],boss2:['poison','attack','rest','attack','guard'],
      elite3:['charge','attack','rest'],boss3:['charge','attack','rest','guard','attack','rest'],
    };
    const stage=enemy.def==='boss3'&&enemy.stageTurn!==undefined&&run.turn>=enemy.stageTurn;
    const pattern=stage?['charge','attack','rest','poison','attack','rest'] as const:patterns[enemy.def];
    kind=pattern[(stage?run.turn-enemy.stageTurn!:run.turn-1)%pattern.length];
    if(enemy.broken)bonus-=4;
    if(stage)bonus+=2;
    if(enemy.def==='elite3')bonus+=6;
    if(enemy.def==='boss3'&&pattern[((stage?run.turn-enemy.stageTurn!:run.turn-1)+pattern.length-1)%pattern.length]==='charge')bonus+=10;
  }
  const attack=Math.ceil(def.attack*difficultyOf(run).attack[run.floor-1]);
  const value=kind==='attack'?Math.max(1,attack+bonus):kind==='poison'?(run.floor===1?1:2):kind==='guard'?def.attack+2:kind==='charge'?attack+bonus+(enemy.def==='boss3'?10:0):0;
  return {kind,value,label:kind==='attack'?`攻击 ${value}${enemy.broken?' · 破壳减伤':''}`:kind==='guard'?`护盾 ${value}`:kind==='poison'?`中毒 ${value}${tactical(run,enemy)?' · 最多 3 层':''}`:kind==='charge'?(enemy.stageTurn===run.turn+1?'蓄力 · 下回合转入觉醒':`蓄力 · 下回合攻击 ${value}`):'休整 · 本回合不行动'};
}
function updateStage(run:Run){
  for(const e of run.enemies)if(tactical(run,e)&&e.def==='boss3'&&e.hp>0&&e.hp<=ENEMY_MAP[e.def].hp/2&&e.stageTurn===undefined){
    e.stageTurn=run.turn+1;log(run,'古树枝条开始震动。下回合进入第二阶段，先蓄力，再重击。');
  }
}
function resetTurn(run:Run) {
  run.energy=3+(run.items.some(i=>ITEM_MAP[i.def].effect==='energy')?1:0);
  run.block=run.items.reduce((n,i)=>n+(ITEM_MAP[i.def].kind==='armor'?ITEM_MAP[i.def].power:0),0);
  for(const i of run.items)i.used=0;
}
function rollItems(run:Run,n:number):string[] {
  const pool=ITEMS.filter(i=>!i.shopOnly&&i.rarity<=run.floor+1);
  const ids:string[]=[];
  for(let i=0;i<n;i++) {const choices=pool.filter(d=>!ids.includes(d.id));ids.push(choices[Math.floor(random(run)*choices.length)].id);}
  if(!ids.some(id=>ITEM_MAP[id].kind==='weapon')){
    const weapons=pool.filter(i=>i.kind==='weapon');ids[0]=weapons[Math.floor(random(run)*weapons.length)].id;
  }
  if(!ids.some(id=>['heal','shield','food'].includes(ITEM_MAP[id].kind))){
    const supplies=pool.filter(i=>['heal','shield','food'].includes(i.kind));
    const replaceIndex=ids.findIndex(id=>ITEM_MAP[id].kind!=='weapon');
    ids[replaceIndex<0?1:replaceIndex]=supplies[Math.floor(random(run)*supplies.length)].id;
  }
  return ids;
}
function rollShop(run:Run,kinds:ShopKind[],excluded:string[]=[]):string[]{
  const ids:string[]=[];
  for(const kind of kinds){
    const pool=ITEMS.filter(d=>!excluded.includes(d.id)&&!ids.includes(d.id)&&d.rarity<=run.floor+1&&(!d.shopOnly||run.floor>=2)&&
      (kind==='weapon'?d.kind==='weapon':kind==='build'?['charm','armor'].includes(d.kind)||d.id==='sproutshield':kind==='supply'?['heal','food','shield'].includes(d.kind)&&priceOf(run,d.id)<=16:true));
    ids.push(pool[Math.floor(random(run)*pool.length)].id);
  }
  return ids;
}
function wonBattle(run:Run) {
  if(run.phase!=='battle'||run.enemies.some(e=>e.hp>0))return;
  run.phase='loot';run.battles++;run.xp++;run.poison=0;
  const gold=run.node==='boss'?24:run.node==='elite'?17:10;
  run.gold+=gold;
  const recovery=difficultyOf(run).recovery;
  heal(run,recovery);
  const ids=rollItems(run,run.ruleset===2&&run.node==='elite'?4:3);
  if(run.ruleset===2&&run.node==='elite'){
    const last=ids.length-1,kind=ITEM_MAP[ids[last]].kind;
    const upgrades=ITEMS.filter(d=>!d.shopOnly&&d.kind===kind&&d.rarity===Math.min(3,run.floor+1)&&!ids.slice(0,last).includes(d.id));
    if(upgrades.length)ids[last]=upgrades[Math.floor(random(run)*upgrades.length)].id;
  }
  run.loot=ids.map(d=>makeItem(run,d));
  log(run,`战斗结束。恢复 ${recovery} 点生命，获得 ${gold} 枚金币。挑些用得上的东西带走。`);
}
function advance(run:Run) {
  run.loot=[];run.offers=[];run.enemies=[];delete run.shop;
  if(run.step===stepsInFloor(run)-1){
    if(run.floor===3){run.phase='won';log(run,'老树让开了道路。你带着装满的行囊，走出了遗庭。');return;}
    run.floor++;run.step=0;run.maxHp+=3;heal(run,Math.ceil(run.maxHp/2));log(run,'走入下一层遗迹。生命上限 +3，恢复一半最大生命。');
  }else run.step++;
  run.phase=run.node==='boss'||(run.node==='battle'||run.node==='elite')&&run.xp%2===0?'expand':'map';
  if(run.phase==='expand'&&!expansionCells(run).length)run.phase='map';
}
const editable=(phase:Phase)=>['map','prepare','loot','shop','rest','event'].includes(phase);
export function act(current:Run,action:Action):{run:Run;error?:string} {
  const run=structuredClone(current);
  const fail=(error:string)=>({run:current,error});
  if(['won','lost'].includes(run.phase))return fail('这次远征已经结束。');
  switch(action.type){
    case 'node': {
      if(run.phase!=='map'||!routes(run).includes(action.kind))return fail('这条路现在走不了。');
      run.node=action.kind;run.loot=[];
      if(['battle','elite','boss'].includes(action.kind)){
        const ids=action.kind==='boss'?[`boss${run.floor}`]:action.kind==='elite'?[`elite${run.floor}`]:
          [ENEMIES[(run.floor-1)*3+Math.floor(random(run)*3)].id,...(run.step>=2?[ENEMIES[(run.floor-1)*3+Math.floor(random(run)*3)].id]:[])];
        run.enemies=ids.map(def=>({uid:run.seq++,def,hp:ENEMY_MAP[def].hp,block:0,poison:0}));
        run.turn=1;run.poison=0;run.phase='prepare';resetTurn(run);log(run,'前面有动静。可以先整理装备，再开始战斗。');
      }else if(action.kind==='shop'){
        run.phase='shop';
        if(run.ruleset===2){run.shop={kinds:['weapon','build','supply','any'],refreshed:false,sold:[]};run.offers=rollShop(run,run.shop.kinds);}
        else run.offers=rollItems(run,4);
      }
      else if(action.kind==='event'){
        run.phase='event';
        let choices=EVENTS.map((_,i)=>i).filter(i=>!run.seenEvents?.includes(i));
        if(!choices.length){run.seenEvents=[];choices=EVENTS.map((_,i)=>i);}
        run.event=choices[Math.floor(random(run)*choices.length)];run.seenEvents=[...(run.seenEvents??[]),run.event];
      }
      else run.phase='rest';
      break;
    }
    case 'place': {
      if(!editable(run.phase))return fail('战斗中不能移动物品。');
      const item=[...run.items,...run.loot].find(i=>i.uid===action.uid);
      if(!item)return fail('找不到这件物品。');
      if(!Number.isInteger(action.x)||!Number.isInteger(action.y)||!Number.isInteger(action.rotation)||action.rotation<0||action.rotation>3)return fail('这里放不下，物品已留在原位。');
      const swap=swapPlan(run,item,action.x,action.y,action.rotation);
      if(!canPlace(run,item,action.x,action.y,action.rotation)&&!swap)return fail('这里放不下，物品已留在原位。');
      if(swap){
        const inBag=run.items.some(i=>i.uid===item.uid);
        run.items=run.items.filter(i=>!swap.some(t=>t.uid===i.uid));
        if(inBag)run.items.push(...swap);
        else run.loot.push(...swap);
      }
      run.items=run.items.filter(i=>i.uid!==item.uid);run.loot=run.loot.filter(i=>i.uid!==item.uid);
      run.items.push({...item,x:action.x,y:action.y,rotation:action.rotation});break;
    }
    case 'stash': {
      if(!editable(run.phase))return fail('战斗中不能移动物品。');
      const item=run.items.find(i=>i.uid===action.uid);if(!item)return fail('找不到这件物品。');
      run.items=run.items.filter(i=>i.uid!==item.uid);run.loot.push({...item,x:-1,y:-1});break;
    }
    case 'discard':
      if(!editable(run.phase)||![...run.items,...run.loot].some(i=>i.uid===action.uid))return fail('现在不能丢弃这件物品。');
      if([...run.items,...run.loot].some(i=>i.uid===action.uid&&ITEM_MAP[i.def].kind==='weapon')&&
        ![...run.items,...run.loot].some(i=>i.uid!==action.uid&&ITEM_MAP[i.def].kind==='weapon'))return fail('这是最后一件武器，先拿到替代武器再丢弃。');
      run.items=run.items.filter(i=>i.uid!==action.uid);
      run.loot=run.loot.filter(i=>i.uid!==action.uid);break;
    case 'start':
      if(run.phase!=='prepare')return fail('现在不能开始战斗。');
      if(!run.items.some(i=>ITEM_MAP[i.def].kind==='weapon'))return fail('至少带上一件武器再战斗。');
      if(run.loot.length)return fail('还有临时放下的物品，请先放回背包。');
      run.phase='battle';resetTurn(run);log(run,'轮到你了。先选装备，再选敌人。');break;
    case 'use': {
      if(run.phase!=='battle')return fail('只有战斗时才能使用物品。');
      const item=run.items.find(i=>i.uid===action.uid);if(!item)return fail('找不到这件物品。');
      const d=ITEM_MAP[item.def];
      if(['charm','armor'].includes(d.kind))return fail('这件装备会自动生效。');
      if(item.used>=1)return fail('这件物品本回合已经用过了。');
      if(run.energy<d.cost)return fail('能量不够了。可以使用干粮，或结束回合。');
      const target=run.enemies.find(e=>e.uid===action.target&&e.hp>0);
      if(d.kind==='weapon'&&!target)return fail('先选一个还活着的敌人。');
      run.energy-=d.cost;item.used++;
      if(target){
        const n=power(run,item).value,shield=target.block;
        target.hp=Math.max(0,target.hp-Math.max(0,n-target.block));target.block=Math.max(0,target.block-n);target.poison+=poisonOnHit(run,item);
        if(tactical(run,target)&&['elite1','boss1'].includes(target.def)&&shield>0&&target.block===0){target.broken=true;log(run,'护壳被打碎，敌人的下一次攻击伤害减少 4 点。');}
        log(run,`${d.name} 命中${ENEMY_MAP[target.def].name}，造成 ${n} 点伤害（护盾先抵挡）。`);if(!target.hp)run.kills++;
        updateStage(run);
      }
      if(d.kind==='shield')run.block+=power(run,item).value;
      if(d.kind==='heal'){heal(run,d.power);run.items=run.items.filter(i=>i.uid!==item.uid);log(run,`用了${d.name}，恢复 ${d.power} 点生命。`);}
      if(d.kind==='food'){run.energy+=d.power;run.items=run.items.filter(i=>i.uid!==item.uid);log(run,`吃了${d.name}，能量 +${d.power}。`);}
      wonBattle(run);break;
    }
    case 'end': {
      if(run.phase!=='battle')return fail('现在不能结束回合。');
      const usedShield=run.items.some(i=>ITEM_MAP[i.def].kind==='shield'&&i.used>0);
      const thorns=usedShield?run.items.reduce((n,i)=>n+(ITEM_MAP[i.def].effect==='thorns'?(ITEM_MAP[i.def].kind==='shield'?3:ITEM_MAP[i.def].power):0),0):0;
      for(const enemy of run.enemies){
        if(enemy.hp<=0)continue;
        const next=intent(run,enemy);enemy.block=0;
        if(next.kind==='guard'){enemy.block=next.value;log(run,`${ENEMY_MAP[enemy.def].name} 获得 ${next.value} 点护盾。`);}
        else if(next.kind==='charge'||next.kind==='rest')log(run,`${ENEMY_MAP[enemy.def].name}${next.kind==='charge'?'正在蓄力，下回合重击。':'正在休整，本回合不行动。'}`);
        else{
          if(next.kind==='poison'){run.poison=tactical(run,enemy)?Math.min(3,run.poison+next.value):run.poison+next.value;log(run,`${ENEMY_MAP[enemy.def].name} 施加 ${next.value} 层中毒。`);}
          else{const damage=Math.max(0,next.value-run.block);run.block=Math.max(0,run.block-next.value);run.hp=Math.max(0,run.hp-damage);delete enemy.broken;log(run,`${ENEMY_MAP[enemy.def].name} 攻击，你失去 ${damage} 点生命。`);}
          if(thorns&&next.kind==='attack'){enemy.hp=Math.max(0,enemy.hp-thorns);if(!enemy.hp)run.kills++;}
        }
        if(run.hp<=0)break;
      }
      if(run.hp>0){run.hp=Math.max(0,run.hp-run.poison);run.poison=Math.max(0,run.poison-1);}
      for(const enemy of run.enemies)if(enemy.hp>0&&enemy.poison){enemy.hp=Math.max(0,enemy.hp-enemy.poison);enemy.poison=Math.max(0,enemy.poison-1);if(!enemy.hp)run.kills++;}
      updateStage(run);
      if(run.hp<=0&&(run.rescues??0)<difficultyOf(run).rescues){
        run.rescues=1;run.hp=Math.ceil(run.maxHp/2);run.poison=0;run.turn++;resetTurn(run);
        log(run,'这次撑住了，恢复一半生命。每次远征只有一次缓冲机会。');wonBattle(run);
      }
      else if(run.hp<=0){run.phase='lost';log(run,'行囊还在，旅途暂时停在这里。下次换一种搭配再试试。');}
      else{wonBattle(run);if(run.phase==='battle'){run.turn++;resetTurn(run);}}
      break;
    }
    case 'leave':
      if(run.phase==='map'&&run.loot.length){run.loot=[];break;}
      if(!['loot','shop'].includes(run.phase))return fail('先完成眼前的事情。');
      advance(run);break;
    case 'buy': {
      if(run.phase!=='shop'||!run.offers.includes(action.def))return fail('这件物品已经不在摊位上了。');
      const d=ITEM_MAP[action.def],price=priceOf(run,action.def);if(run.gold<price)return fail('金币不够。可以先卖掉不需要的装备。');
      if(run.shop){run.shop.kinds.splice(run.offers.indexOf(d.id),1);run.shop.sold.push(d.id);}
      run.gold-=price;run.loot.push(makeItem(run,d.id));run.offers=run.offers.filter(id=>id!==d.id);log(run,`买下${d.name}，已放在地上，记得整理进行囊。`);break;
    }
    case 'refresh':{
      if(run.phase!=='shop'||!run.shop||run.shop.refreshed)return fail('这个摊位不能再换货了。');
      if(!run.offers.length)return fail('商品已经售空了。');
      if(run.gold<REFRESH_PRICE)return fail('换货需要 4 枚金币。');
      run.gold-=REFRESH_PRICE;run.offers=rollShop(run,run.shop.kinds,run.shop.sold);run.shop.refreshed=true;
      log(run,'花费 4 枚金币，摊主换下了还没卖出的商品。买过的货位不补回。');break;
    }
    case 'sell': {
      if(run.phase!=='shop')return fail('只有商店会收购装备。');
      const item=[...run.items,...run.loot].find(i=>i.uid===action.uid);if(!item)return fail('找不到这件物品。');
      if(ITEM_MAP[item.def].kind==='weapon'&&![...run.items,...run.loot].some(i=>i.uid!==item.uid&&ITEM_MAP[i.def].kind==='weapon'))return fail('这是最后一件武器，先买到替代武器再出售。');
      run.items=run.items.filter(i=>i.uid!==item.uid);run.loot=run.loot.filter(i=>i.uid!==item.uid);run.gold+=Math.floor(priceOf(run,item.def)/2);break;
    }
    case 'rest':
      if(run.phase!=='rest')return fail('现在没有营地可休息。');
      if(action.choice==='heal'){heal(run,12);log(run,'在树下歇了一阵，恢复 12 点生命。');}
      else{run.maxHp+=4;heal(run,4);log(run,'整理好补给，生命上限 +4。');}advance(run);break;
    case 'event': {
      if(run.phase!=='event')return fail('这件事情已经结束了。');
      const e=EVENTS[run.event];
      if(action.accept){
        const gold=e.costGold??(e.kind==='trade'?8:0),hp=e.costHp??0;
        if(run.gold<gold)return fail('金币不够，可以选择继续赶路。');
        if(run.hp<=hp)return fail('生命不足以安全完成这件事，可以选择继续赶路。');
        run.gold-=gold;run.hp-=hp;
        if(e.kind==='gold')run.gold+=e.value;
        else if(e.kind==='maxHp'){run.maxHp+=e.value;heal(run,e.value);}
        else if(e.kind!=='item')heal(run,e.value);
        log(run,e.action);
      }
      advance(run);
      if(action.accept&&e.kind==='item'&&e.item){run.loot.push(makeItem(run,e.item));log(run,`获得${ITEM_MAP[e.item].name}，已放在地上，装进行囊再走。`);}
      break;
    }
    case 'expand':
      if(run.phase!=='expand'||!expansionCells(run).includes(action.cell))return fail('选一格与背包边相邻的空位。');
      run.bag.push(action.cell);run.phase='map';log(run,'背包多出一格，可以带更多东西了。');break;
  }
  return {run};
}
