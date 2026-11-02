import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

test('拖到物品上先预览双方可否交换，松手提交；不能回填时原样返回，支持地上换入',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${server.resolvedUrls.local[0]}games/backpack-expedition-h5/`);
    await page.evaluate(async()=>{
      const {newRun}=await import('/games/backpack-expedition-h5/src/engine.ts');const run=newRun(42);
      run.items=[['flower',0,0],['bread',3,0],['potion',0,2],['shield',3,2],['ring',4,1]].map(([def,x,y],i)=>({uid:i+1,def,x,y,rotation:0,used:0}));
      localStorage.setItem('youxi:backpack-expedition-h5:v1',JSON.stringify(run));
    });
    await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('youxi:backpack-expedition-h5:v1')));
    const drag=async(name,x,y)=>{const bag=await page.locator('.bag-grid').boundingBox(),cell=bag.width/7,box=await page.getByRole('button',{name,exact:true}).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(bag.x+x*cell,bag.y+y*cell,{steps:8});};
    const before=await read();
    await drag('雏菊护符，背包内，0 能量',3.5,.5);
    assert.equal(await page.locator('.swap-target').getAttribute('aria-label'),'麦香面包，背包内，0 能量');
    assert.equal(await page.locator('.drag-ghost>span').innerText(),'松开与麦香面包交换');
    assert.deepEqual((await read()).items,before.items,'预览不能改变存档');
    await mkdir('reports/backpack-expedition-h5',{recursive:true});await page.screenshot({path:'reports/backpack-expedition-h5/swap-preview.png'});
    await page.mouse.up();
    assert.equal((await read()).items.find(i=>i.def==='flower').x,3);assert.equal((await read()).items.find(i=>i.def==='bread').x,0);
    await page.getByRole('button',{name:'麦香面包，背包内，0 能量',exact:true}).click();
    await page.getByRole('button',{name:'放到地上，腾出位置',exact:true}).click();
    await drag('麦香面包，待整理，0 能量',4,.5);
    assert.equal(await page.locator('.drag-ghost>span').innerText(),'松开与雏菊护符交换');
    await page.mouse.up();assert.equal((await read()).loot[0].def,'flower');assert.equal((await read()).items.find(i=>i.def==='bread').x,3);
    for(const mode of ['shift','multiple','blocked']){
      await page.evaluate(async mode=>{
        const {newRun}=await import('/games/backpack-expedition-h5/src/engine.ts');const run=newRun(42);
        run.bag=Array.from({length:8},(_,i)=>`${i%4},${Math.floor(i/4)}`);
        const defs=mode==='shift'?[['shield',2,0],['potion',1,0]]:[['shield',2,0],['flower',0,0],['potion',1,0],['ring',0,1],['dagger',1,1]];
        if(mode==='blocked'){run.bag=['0,0','1,0','3,0','4,0','3,1','4,1'];defs.splice(0,defs.length,['bread',0,0],['boots',3,0],['boots',4,0]);}
        run.items=defs.map(([def,x,y],i)=>({uid:i+1,def,x,y,rotation:0,used:0}));
        localStorage.setItem('youxi:backpack-expedition-h5:v1',JSON.stringify(run));
      },mode);
      await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
      const stable=await read();
      await drag(mode==='blocked'?'麦香面包，背包内，0 能量':'橡木盾，背包内，1 能量',mode==='shift'?2:mode==='multiple'?1:4,mode==='blocked'?.5:1);
      if(mode==='blocked'){
        assert.equal(await page.locator('.swap-target').count(),0);assert.equal(await page.locator('.swap-blocked').count(),2);
        assert.equal(await page.locator('.drag-ghost>span').innerText(),'无法交换，松开会回到原位');
      }else{
        assert.equal(await page.locator('.swap-target').count(),mode==='shift'?1:4);
        assert.equal(await page.locator('.swap-return').count(),mode==='shift'?1:4);
        assert.equal(await page.locator('.drag-ghost>span').innerText(),mode==='shift'?'松开与草药露交换':'松开与 4 件物品交换');
        await page.screenshot({path:`reports/backpack-expedition-h5/swap-${mode}.png`});
      }
      assert.deepEqual((await read()).items,stable.items);
      await page.mouse.up();
      const after=await read();
      if(mode==='blocked')assert.deepEqual(after.items,stable.items);
      else{
        assert.equal(after.items.find(i=>i.def==='shield').x,mode==='shift'?1:0);
        assert.ok(after.items.filter(i=>i.def!=='shield').every(i=>i.x>=(mode==='shift'?3:2)));
      }
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await server.close();}
});
