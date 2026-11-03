import assert from 'node:assert/strict';
import test from 'node:test';
import {createSaveStore,parseSave} from '../src/storage.ts';
import {newRun} from '../src/engine.ts';

test('H5 与 TT 复用存档校验、备份和并发覆盖保护，独立命名空间可跨端导入',()=>{
  const values=new Map<string,string>();
  const memory={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const h5=createSaveStore(memory,'h5'),tt=createSaveStore(memory,'tt');
  assert.deepEqual(h5.readSave(),{});assert.deepEqual(tt.readSave(),{});
  const run=newRun(42);assert(h5.writeSave(run).ok);assert.deepEqual(tt.readSave(),{});
  assert(tt.writeSave(parseSave(values.get('h5')!)).ok);assert.equal(tt.readSave().run?.seed,42);
  const secondWindow=createSaveStore(memory,'h5');secondWindow.readSave();
  const next={...run,gold:run.gold+1};assert(h5.writeSave(next).ok);
  assert.equal(h5.restoreBackup().gold,run.gold);
  assert.equal(secondWindow.writeSave({...run,gold:0}).ok,false);assert.equal(parseSave(values.get('h5')!).gold,next.gold);
  assert.equal(h5.writeSave({...run,hp:-1}).ok,false);assert.equal(parseSave(values.get('h5')!).gold,next.gold);
});
