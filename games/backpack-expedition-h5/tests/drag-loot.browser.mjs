import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('拿住长物品末端旋转后仍落在鼠标对应格；旧装备可以直接丢弃腾位',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(`${server.resolvedUrls.local[0]}games/backpack-expedition-h5/`);
    await page.evaluate(async()=>{
      const {newRun}=await import('/games/backpack-expedition-h5/src/engine.ts');
      const run=newRun(42);run.phase='loot';run.bag=Array.from({length:20},(_,i)=>`${i%5},${Math.floor(i/5)}`);
      run.items=run.items.filter(i=>['staff','shield','flower'].includes(i.def));
      run.loot=[{uid:run.seq++,def:'barkshield',x:-1,y:-1,rotation:0,used:0}];
      localStorage.setItem('youxi:backpack-expedition-h5:v1',JSON.stringify(run));
    });
    await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('youxi:backpack-expedition-h5:v1')));
    const bag=await page.locator('.bag-grid').boundingBox(),cell=bag.width/7;
    const staff=page.getByRole('button',{name:'嫩枝杖，背包内，1 能量',exact:true});
    const beforeOutside=(await read()).items;
    await page.mouse.move(bag.x+cell/2,bag.y+cell/2);await page.mouse.down();
    await page.mouse.move(1278,898,{steps:6});
    assert.equal(await page.locator('.bag-cell.valid,.bag-cell.invalid').count(),0,'背包外不能产生格子吸附预览');
    assert.equal(await page.locator('.drag-ghost').count(),0,'背包外不显示拖拽物品，只有放到地上区域接受移出');
    await page.mouse.up();assert.deepEqual((await read()).items,beforeOutside);
    await page.mouse.move(bag.x+cell/2,bag.y+cell*2.5);await page.mouse.down();
    await page.mouse.move(bag.x+cell/2+8,bag.y+cell*2.5,{steps:3});
    await page.keyboard.press('r');
    await page.mouse.move(bag.x+cell/2,bag.y+cell*3.5,{steps:6});await page.mouse.up();
    const moved=(await read()).items.find(i=>i.def==='staff');
    assert.deepEqual([moved.x,moved.y,moved.rotation],[0,3,1]);
    assert.equal(await page.locator('.drag-ghost').count(),0);
    await page.getByRole('button',{name:'橡木盾，背包内，1 能量',exact:true}).click();
    await page.getByRole('button',{name:'丢弃这件物品',exact:true}).click();
    await page.getByRole('button',{name:'确认丢弃',exact:true}).click();
    assert.equal((await read()).items.some(i=>i.def==='shield'),false);
    await page.getByRole('button',{name:'厚树皮盾，待整理，1 能量',exact:true}).click();
    await page.getByRole('button',{name:'格子 2,1',exact:true}).click();
    assert.equal((await read()).items.some(i=>i.def==='barkshield'&&i.x===1&&i.y===0),true);
    assert.equal(await staff.count(),1);
    const flower=page.getByRole('button',{name:'雏菊护符，背包内，0 能量',exact:true});
    const flowerBox=await flower.boundingBox(),ground=await page.getByRole('region',{name:'地上物品',exact:true}).boundingBox();
    await page.mouse.move(flowerBox.x+flowerBox.width/2,flowerBox.y+flowerBox.height/2);await page.mouse.down();
    await page.mouse.move(ground.x+ground.width/2,ground.y+ground.height/2,{steps:5});await page.mouse.up();
    assert.ok((await read()).loot.some(i=>i.def==='flower'));
    assert.equal((await read()).items.some(i=>i.def==='flower'),false);
    await page.getByRole('button',{name:'雏菊护符，待整理，0 能量',exact:true}).click();
    await page.getByRole('button',{name:'格子 5,3',exact:true}).click();
    assert.ok((await read()).items.some(i=>i.def==='flower'&&i.x===4&&i.y===2));
    const shield=page.getByRole('button',{name:'厚树皮盾，背包内，1 能量',exact:true});
    await shield.click();await page.keyboard.press('r');
    assert.equal((await read()).items.find(i=>i.def==='barkshield').rotation,1);
    // Cancel a drag without committing, then the next item click must still work.
    const shieldBox=await shield.boundingBox();
    const beforeCancel=(await read()).items;
    await page.mouse.move(shieldBox.x+10,shieldBox.y+10);await page.mouse.down();await page.mouse.move(shieldBox.x+35,shieldBox.y+35);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.locator('.drag-ghost').count(),0);assert.deepEqual((await read()).items,beforeCancel);
    await shield.click();assert.equal(await page.locator('.inspect-title h2').innerText(),'厚树皮盾');
    await mkdir('reports/backpack-expedition-h5',{recursive:true});
    await page.screenshot({path:'reports/backpack-expedition-h5/drag-loot-fixed.png',fullPage:true});
  }finally{await browser.close();await server.close();}
});
