import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('选角页选择三档难度，返回保留原档，出击与刷新保留难度',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const read=()=>page.evaluate(async()=>{const s=await import('/games/long-night-embers-h5/src/persistence/storage.ts');return (await s.loadSlotBundle(1)).run;});
    for(const id of ['easy','normal','hard']){
      await page.goto(`${server.resolvedUrls.local[0]}games/long-night-embers-h5/`);
      await page.getByRole('button',{name:'开始游戏',exact:true}).click();
      const before=await read();
      await page.getByRole('combobox',{name:'难度',exact:true}).selectOption(id);
      await page.locator('.lne-charselect-top-bar').getByRole('button',{name:'返回',exact:true}).click();
      assert.equal((await read()).difficulty,before.difficulty);
      await page.getByRole('button',{name:'开始游戏',exact:true}).click();
      await page.getByRole('combobox',{name:'难度',exact:true}).selectOption(id);
      if(id==='normal'){await mkdir('reports/long-night-embers-h5',{recursive:true});await page.screenshot({path:'reports/long-night-embers-h5/difficulty.png'});}
      await page.getByRole('button',{name:'确认出击 (START)',exact:true}).click();
      await page.locator('.lne-charselect-backdrop').waitFor({state:'hidden'});
      assert.equal((await read()).difficulty,id);
      await page.reload();await page.getByRole('button',{name:'开始游戏',exact:true}).waitFor();
      assert.equal((await read()).difficulty,id);
    }
  }finally{await browser.close();await server.close();}
});
