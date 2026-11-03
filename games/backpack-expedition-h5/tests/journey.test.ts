import assert from 'node:assert/strict';
import test from 'node:test';
import {ITEM_MAP} from '../src/content.ts';
import {playBuild,type Build} from './journey-driver.ts';

for(const build of ['melee','bow','thorns'] as Build[])test(`挑战档 ${build} 从正常获取走完三层，不使用顶级装备`,()=>{
  const result=playBuild(1,build,'hard',false,false,true);
  assert.equal(result.stalled,false);assert.equal(result.phase,'won');
  assert.equal(result.fights.at(-1)?.synergy,true,'最终 Boss 战保留本构筑的配合，不能靠换成其他流派冒充成型');
  assert.equal(result.fights.filter(f=>f.node==='boss').length,3);
  assert.ok(result.fights.flatMap(f=>f.items).every(id=>ITEM_MAP[id].rarity<=2));
});
