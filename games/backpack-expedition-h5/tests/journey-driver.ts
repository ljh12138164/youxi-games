import {act,adjacent,canPlace,cellsOf,expansionCells,intent,newRun,power,routes,type Action,type Difficulty,type Item} from '../src/engine.ts';
import {ITEM_MAP} from '../src/content.ts';

export type Build='melee'|'bow'|'thorns'|'weak';
export function playBuild(seed:number,build:Build,difficulty:Difficulty='hard',legacy=false,elites=false,midTier=false){
  let run=newRun(seed,difficulty);
  if(legacy)delete run.ruleset;
  const fights:Array<{floor:number;node:string;turns:number;hpBefore:number;hpAfter:number;items:string[];layout:Item[];synergy:boolean;consumed:string[]}>=[];
  const shops:Array<{floor:number;goldBefore:number;goldAfter:number;bought:string[]}>=[];
  const acquired=new Set(run.items.map(i=>i.def));
  let pending:typeof fights[number]|undefined,stalled=false;
  const send=(action:Action)=>{
    const result=act(run,action);
    if(result.error)return false;
    run=result.run;
    for(const i of [...run.items,...run.loot])acquired.add(i.def);
    return true;
  };
  function value(item:Item){
    const d=ITEM_MAP[item.def];
    if(midTier&&d.rarity>2)return -1000;
    if(build==='weak')return d.power;
    if(d.kind==='weapon'){
      const preferred=build==='bow'?d.effect==='row':build==='thorns'?d.effect==='poison':d.effect==='adjacent';
      return d.power/(d.cost||0.7)+8+(preferred?12:0);
    }
    if(d.kind==='shield')return d.power+(build==='thorns'?22:8)+(d.effect==='thorns'?6:0);
    if(d.kind==='armor')return d.power*2+12;
    if(d.kind==='heal')return d.power+4;
    if(d.kind==='food')return d.power*2+3;
    if(d.effect==='energy')return 30;
    if(d.effect==='thorns')return d.power*3+(build==='thorns'?30:0);
    if(d.effect==='row')return d.power*3+(build==='bow'?25:0);
    return d.power*3+(build==='melee'?23:0);
  }
  function arrange(){
    // Only public stash/place actions: no fabricated items or unlocked cells.
    for(const i of run.items)send({type:'stash',uid:i.uid});
    const pool=[...run.loot].sort((a,b)=>value(b)-value(a));
    const picked:Item[]=[],counts:Record<string,number>={};
    const limits:Record<string,number>={weapon:build==='weak'?4:build==='bow'?2:3,shield:build==='thorns'?2:1,armor:build==='bow'?1:2,charm:5,heal:3,food:2};
    for(const item of pool){
      if(value(item)<0)continue;
      const kind=ITEM_MAP[item.def].kind;
      if((counts[kind]??0)>=(limits[kind]??1))continue;
      picked.push(item);counts[kind]=(counts[kind]??0)+1;
    }
    picked.sort((a,b)=>{
      const order=(i:Item)=>{
        const d=ITEM_MAP[i.def];
        if(build==='bow'&&d.kind==='charm'&&d.effect==='row')return 1;
        return {weapon:0,shield:2,armor:3,charm:4,heal:5,food:6}[d.kind];
      };
      return order(a)-order(b)||value(b)-value(a);
    });
    for(const item of picked){
      let best:{x:number;y:number;rotation:number;score:number}|undefined;
      for(let rotation=0;rotation<4;rotation++)for(let y=0;y<5;y++)for(let x=0;x<7;x++){
        if(!canPlace(run,item,x,y,rotation))continue;
        const candidate={...item,x,y,rotation};let score=-y*0.1-x*0.01;
        if(build!=='weak')for(const other of run.items){
          const d=ITEM_MAP[item.def],o=ITEM_MAP[other.def];
          if(d.kind==='charm'&&d.effect==='adjacent'&&o.kind==='weapon'&&adjacent(candidate,other))score+=10;
          if(d.effect==='row'&&o.kind==='weapon'&&o.effect==='row'&&cellsOf(candidate).some(c=>cellsOf(other).some(p=>c[1]===p[1])))score+=12;
          if(d.kind==='armor'&&other.def==='sproutshield'&&adjacent(candidate,other))score+=15;
        }
        if(!best||score>best.score)best={x,y,rotation,score};
      }
      if(best)send({type:'place',uid:item.uid,x:best.x,y:best.y,rotation:best.rotation});
    }
    // Keep a weapon even when the preferred build has not appeared.
    if(!run.items.some(i=>ITEM_MAP[i.def].kind==='weapon'))throw Error('Journey packing lost every weapon');
  }
  for(let tick=0;tick<2400&&!['won','lost'].includes(run.phase);tick++){
    if(pending&&run.phase!=='battle'&&run.phase!=='prepare'){
      pending.turns=run.turn;pending.hpAfter=run.hp;fights.push(pending);pending=undefined;
    }
    switch(run.phase){
      case 'map':{
        if(run.loot.length){arrange();for(const i of run.loot)send({type:'discard',uid:i.uid});}
        const options=routes(run);
        const kind=options.includes('shop')?'shop':options.includes('rest')?'rest':elites&&options.includes('elite')?'elite':options.includes('battle')?'battle':options[0];
        send({type:'node',kind});break;
      }
      case 'prepare':{
        arrange();
        for(const i of run.loot)send({type:'discard',uid:i.uid});
        const synergy=build==='melee'?run.items.some(i=>ITEM_MAP[i.def].kind==='weapon'&&ITEM_MAP[i.def].effect==='adjacent'&&power(run,i).sources.length>0):
          build==='bow'?run.items.some(i=>ITEM_MAP[i.def].effect==='row'&&ITEM_MAP[i.def].kind==='weapon'&&run.items.some(a=>['arrows','barbedarrows','silverarrows'].includes(a.def)&&cellsOf(i).some(c=>cellsOf(a).some(p=>c[1]===p[1])))):
          build==='thorns'?run.items.some(i=>ITEM_MAP[i.def].kind==='shield')&&run.items.some(i=>ITEM_MAP[i.def].effect==='thorns'):false;
        pending={floor:run.floor,node:run.node,turns:0,hpBefore:run.hp,hpAfter:run.hp,items:run.items.map(i=>i.def),layout:structuredClone(run.items),synergy,consumed:[]};
        send({type:'start'});break;
      }
      case 'battle':{
        for(const i of run.items)if(ITEM_MAP[i.def].kind==='heal'&&run.hp<=run.maxHp-ITEM_MAP[i.def].power){
          if(send({type:'use',uid:i.uid}))pending?.consumed.push(i.def);
        }
        for(const i of run.items)if(ITEM_MAP[i.def].kind==='food'&&run.turn===1){
          if(send({type:'use',uid:i.uid}))pending?.consumed.push(i.def);
        }
        const incoming=run.enemies.filter(e=>e.hp>0).reduce((n,e)=>n+(intent(run,e).kind==='attack'?intent(run,e).value:0),0);
        // Defend first only when needed; thorns needs at least one shield use.
        for(const i of [...run.items].filter(i=>ITEM_MAP[i.def].kind==='shield').sort((a,b)=>power(run,b).value-power(run,a).value)){
          if(run.phase==='battle'&&(run.block<incoming||build==='thorns'))send({type:'use',uid:i.uid});
        }
        for(const i of [...run.items].filter(i=>ITEM_MAP[i.def].kind==='weapon').sort((a,b)=>power(run,b).value/(ITEM_MAP[b.def].cost||0.5)-power(run,a).value/(ITEM_MAP[a.def].cost||0.5))){
          const target=run.enemies.filter(e=>e.hp>0).sort((a,b)=>a.hp-b.hp)[0];
          if(run.phase==='battle'&&target)send({type:'use',uid:i.uid,target:target.uid});
        }
        if(run.phase==='battle')send({type:'end'});break;
      }
      case 'loot':arrange();send({type:'leave'});break;
      case 'shop':{
        const record={floor:run.floor,goldBefore:run.gold,goldAfter:0,bought:[] as string[]};
        for(const id of [...run.offers].sort((a,b)=>value({def:b} as Item)-value({def:a} as Item))){
          const d=ITEM_MAP[id];
          const same=run.items.filter(i=>ITEM_MAP[i.def].kind===d.kind);
          if(value({def:id} as Item)>=0&&(!same.length||d.kind==='heal'||value({def:id} as Item)>Math.min(...same.map(value)))){
            if(send({type:'buy',def:id}))record.bought.push(id);
          }
        }
        arrange();
        for(const i of run.loot)send({type:'sell',uid:i.uid});
        record.goldAfter=run.gold;shops.push(record);send({type:'leave'});break;
      }
      case 'rest':send({type:'rest',choice:run.hp<run.maxHp-4?'heal':'grow'});break;
      case 'event':if(!send({type:'event',accept:true}))send({type:'event',accept:false});break;
      case 'expand':send({type:'expand',cell:expansionCells(run)[0]});break;
    }
    if(tick===2399)stalled=true;
  }
  if(pending){pending.turns=run.turn;pending.hpAfter=run.hp;fights.push(pending);}
  return {seed,build,difficulty,elites,midTier,phase:run.phase,floor:run.floor,hp:run.hp,stalled,acquired:[...acquired],finalItems:run.items.map(i=>i.def),fights,shops};
}
