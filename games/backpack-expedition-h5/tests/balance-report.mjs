import {mkdir,writeFile} from 'node:fs/promises';
import {playBuild} from './journey-driver.ts';

const legacy=process.argv.includes('--legacy'),elites=process.argv.includes('--elites'),midTier=process.argv.includes('--mid-tier');
const name=`balance-${legacy?'legacy':'v2'}${elites?'-elites':''}${midTier?'-mid-tier':''}`;
const rows=[];
for(const build of ['melee','bow','thorns','weak']){
  const samples=Array.from({length:12},(_,i)=>playBuild(i+1,build,'hard',legacy,elites,midTier));
  rows.push(...samples);
  const fights=samples.flatMap(r=>r.fights),formed=samples.filter(r=>r.fights.some(f=>f.synergy));
  console.log(JSON.stringify({build,won:samples.filter(r=>r.phase==='won').length,lost:samples.filter(r=>r.phase==='lost').length,stalled:samples.filter(r=>r.stalled).length,formed:formed.length,formedWins:formed.filter(r=>r.phase==='won').length,meanTurns:Number((fights.reduce((a,f)=>a+f.turns,0)/fights.length).toFixed(2))}));
}
await mkdir('reports/backpack-expedition-h5',{recursive:true});
await writeFile(`reports/backpack-expedition-h5/${name}.json`,JSON.stringify(rows,null,2));
