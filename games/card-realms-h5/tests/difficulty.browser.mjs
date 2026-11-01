import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('新局选择三档难度，取消保留原档，确认与刷新保留难度',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(`${server.resolvedUrls.local[0]}games/card-realms-h5/`);
    await page.locator('.paper-card').first().waitFor();
    const read=()=>page.evaluate(async()=>{const s=await import('/games/card-realms-h5/src/persistence/storage.ts');return (await s.loadRunSlot(1)).run;});
    for(const id of ['easy','normal','hard']){
      await page.getByRole('button',{name:'新游戏',exact:true}).click();
      const before=await read();
      await page.getByRole('combobox',{name:'难度',exact:true}).selectOption(id);
      await page.getByRole('button',{name:'取消',exact:true}).click();
      assert.equal((await read()).difficulty,before.difficulty);
      await page.getByRole('button',{name:'新游戏',exact:true}).click();
      await page.getByRole('combobox',{name:'难度',exact:true}).selectOption(id);
      if(id==='normal'){await mkdir('reports/card-realms-h5',{recursive:true});await page.screenshot({path:'reports/card-realms-h5/difficulty.png'});}
      await page.getByRole('button',{name:'确认开局',exact:true}).click();
      await page.getByRole('heading',{name:'开始新游戏',exact:true}).waitFor({state:'hidden'});
      assert.equal((await read()).difficulty,id);
      await page.reload();await page.locator('.paper-card').first().waitFor();
      assert.equal((await read()).difficulty,id);
    }
  }finally{await browser.close();await server.close();}
});
