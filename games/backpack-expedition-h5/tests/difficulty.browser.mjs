import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('标题选择三档难度，刷新保留规则，取消重开不改变已有进度',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    for(const [id,name,hp] of [['easy','轻松',40],['normal','标准',34],['hard','挑战',30]]){
      const context=await browser.newContext({viewport:{width:600,height:900}});
      const page=await context.newPage();
      await page.goto(`${server.resolvedUrls.local[0]}games/backpack-expedition-h5/`);
      assert.equal(await page.getByRole('button',{name:'标准 · 推荐',exact:true}).getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:name==='标准'?'标准 · 推荐':name,exact:true}).click();
      if(id==='normal'){
        await mkdir('reports/backpack-expedition-h5',{recursive:true});
        await page.screenshot({path:'reports/backpack-expedition-h5/difficulty-title.png',fullPage:true});
      }
      await page.getByRole('button',{name:'收拾好，出发',exact:true}).click();
      const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('youxi:backpack-expedition-h5:v1')));
      assert.equal((await read()).difficulty,id);assert.equal((await read()).hp,hp);
      await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
      const before=await read();assert.equal(before.difficulty,id);
      await page.getByRole('button',{name:`难度 · ${name}`,exact:true}).click();
      await page.getByRole('button',{name:'挑战',exact:true}).click();
      await page.getByRole('button',{name:'关闭',exact:true}).click();
      assert.deepEqual(await read(),before);
      await page.getByRole('button',{name:`难度 · ${name}`,exact:true}).click();
      await page.getByRole('button',{name:'挑战',exact:true}).click();
      await page.getByRole('button',{name:'收拾行囊，重新出发',exact:true}).click();
      assert.equal((await read()).difficulty,'hard');assert.equal((await read()).hp,30);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await context.close();
    }
  }finally{await browser.close();await server.close();}
});
