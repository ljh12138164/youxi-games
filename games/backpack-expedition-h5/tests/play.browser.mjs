import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('实际拖放、非法回退、回合战斗、领奖续玩、暂停和小窗口',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url=`${server.resolvedUrls.local[0]}games/backpack-expedition-h5/`;
    await page.goto(url);
    await page.evaluate(async()=>{
      const {newRun}=await import('/games/backpack-expedition-h5/src/engine.ts');
      localStorage.setItem('youxi:backpack-expedition-h5:v1',JSON.stringify(newRun(42)));
    });
    await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('youxi:backpack-expedition-h5:v1')));
    const flower=page.getByRole('button',{name:'雏菊护符，背包内，0 能量',exact:true});
    const box=await flower.boundingBox(),cell=await page.getByRole('button',{name:'格子 5,4',exact:true}).boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(cell.x+cell.width/2,cell.y+cell.height/2,{steps:8});await page.mouse.up();
    assert.equal((await read()).items.find(i=>i.def==='flower').x,4);
    assert.equal((await read()).items.find(i=>i.def==='flower').y,3);
    const stable=await read();
    const moved=await flower.boundingBox();await page.mouse.move(moved.x+10,moved.y+10);await page.mouse.down();await page.mouse.move(15,15,{steps:6});await page.mouse.up();
    assert.deepEqual((await read()).items,stable.items);
    await page.getByRole('button',{name:/林间遭遇/}).first().click();await page.getByRole('button',{name:/开始战斗/}).click();
    const staff=page.getByRole('button',{name:'嫩枝杖，背包内，1 能量',exact:true}),shield=page.getByRole('button',{name:'橡木盾，背包内，1 能量',exact:true});
    for(let n=0;n<12&&(await page.locator('main').getAttribute('data-phase'))==='battle';n++){
      await staff.click();await page.getByRole('button',{name:/^攻击/}).first().click();
      if((await page.locator('main').getAttribute('data-phase'))==='battle'){await shield.click();await page.getByRole('button',{name:/结束回合/}).click();}
    }
    assert.equal(await page.locator('main').getAttribute('data-phase'),'loot');
    const rewards=(await read()).loot;
    await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
    assert.deepEqual((await read()).loot,rewards,'刷新不能重抽奖励');
    await page.getByRole('button',{name:'继续前进',exact:false}).click();
    await page.getByRole('button',{name:'放弃剩余物品，继续前进',exact:true}).click();
    assert.equal(await page.locator('main').getAttribute('data-phase'),'map');
    await page.getByRole('button',{name:'暂停',exact:true}).click();assert.equal(await page.locator('main').getAttribute('data-running'),'false');
    await page.getByRole('button',{name:'继续远征',exact:true}).click();
    await mkdir('reports/backpack-expedition-h5',{recursive:true});
    await page.screenshot({path:'reports/backpack-expedition-h5/play-verified.png',fullPage:true});
    await page.setViewportSize({width:600,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'reports/backpack-expedition-h5/narrow-verified.png',fullPage:true});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await server.close();}
});
