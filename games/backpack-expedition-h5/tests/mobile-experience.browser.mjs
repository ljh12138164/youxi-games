import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

test('触屏滑动、点击旋转与交换、商店说明购买落地、快捷攻击及手机横竖屏',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=`${server.resolvedUrls.local[0]}games/backpack-expedition-h5/`;
    await page.goto(url);
    const seed=async(phase='map')=>{
      await page.evaluate(async phase=>{
        const {newRun,act}=await import('/games/backpack-expedition-h5/src/engine.ts');
        let run=newRun(42);run.gold=200;
        if(phase==='shop'){run.step=1;run=act(run,{type:'node',kind:'shop'}).run;}
        if(phase==='battle'){run.step=2;run=act(act(run,{type:'node',kind:'battle'}).run,{type:'start'}).run;}
        localStorage.setItem('youxi:backpack-expedition-h5:v1',JSON.stringify(run));
      },phase);
      await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).tap();
    };
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('youxi:backpack-expedition-h5:v1')));
    const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await mkdir('reports/backpack-expedition-h5',{recursive:true});
    for(const width of [320,390,768,820]){
      await page.setViewportSize({width,height:844});await noOverflow();
    }
    await page.setViewportSize({width:390,height:844});await seed();
    const inventory=page.getByRole('region',{name:'背包整理',exact:true});await inventory.scrollIntoViewIfNeeded();
    const flower=page.getByRole('button',{name:'雏菊护符，背包内，0 能量',exact:true});
    await flower.tap();await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
    await page.getByRole('button',{name:'格子 5,4',exact:true}).tap();
    assert.equal((await read()).items.find(i=>i.def==='flower').x,4);
    const bread=page.getByRole('button',{name:'麦香面包，背包内，0 能量',exact:true});
    await bread.tap();await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
    await page.getByRole('button',{name:/^旋转/}).tap();assert.equal((await read()).items.find(i=>i.def==='bread').rotation,1);
    await seed();
    const potion=page.getByRole('button',{name:'草药露，背包内，0 能量',exact:true});
    await potion.tap();await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();await flower.tap();
    assert.equal((await read()).items.find(i=>i.def==='potion').x,1);
    assert.equal((await read()).items.find(i=>i.def==='flower').x,3);
    await seed('shop');
    const offer=page.locator('.shop-grid article').first();assert.ok((await offer.locator('p').innerText()).length>4);
    const beforeBuy=await read(),def=beforeBuy.offers[0];await offer.getByRole('button',{name:/购买/}).tap();
    const bought=await read();assert.equal(bought.loot[0].def,def);assert.equal(bought.items.length,beforeBuy.items.length);assert.ok(bought.gold<beforeBuy.gold);
    await page.screenshot({path:'reports/backpack-expedition-h5/shop-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'收好行囊，继续走',exact:true}).tap();await page.getByRole('button',{name:'再整理一下',exact:true}).tap();assert.equal((await read()).phase,'shop');
    await seed('battle');
    assert.equal((await read()).enemies.length,2);
    const staff=page.getByRole('button',{name:'嫩枝杖，背包内，1 能量',exact:true});
    await staff.tap();await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
    const beforeAttack=await read();await page.locator('.quick-targets button').nth(1).tap();
    assert.ok((await read()).enemies[1].hp<beforeAttack.enemies[1].hp);assert.equal((await read()).energy,beforeAttack.energy-1);
    await page.getByRole('button',{name:'林间短刀，背包内，0 能量',exact:true}).tap();await page.keyboard.press('Digit1');
    assert.ok((await read()).enemies[0].hp<beforeAttack.enemies[0].hp);
    await page.screenshot({path:'reports/backpack-expedition-h5/battle-mobile.png',fullPage:true});
    for(const size of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:820,height:1180},{width:1280,height:900}]){
      await page.setViewportSize(size);await noOverflow();
      await page.getByRole('button',{name:'存档',exact:true}).tap();
      const modal=await page.getByRole('dialog',{name:'游戏菜单',exact:true}).boundingBox();
      assert.ok(modal.x>=0&&modal.y>=0&&modal.x+modal.width<=size.width&&modal.y+modal.height<=size.height);
      await page.getByRole('button',{name:'关闭',exact:true}).tap();
    }
    await page.setViewportSize({width:390,height:844});await seed();await inventory.scrollIntoViewIfNeeded();
    // CDP touch input verifies the browser's pan handling, rather than dispatching pointer events in JS.
    const cdp=await context.newCDPSession(page),bag=await page.locator('.bag-grid').boundingBox();
    const beforeScroll=await page.evaluate(()=>scrollY),beforeItems=(await read()).items;
    const x=bag.x+bag.width/2,y=Math.min(bag.y+bag.height/2,650);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=6;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*20}]});
      await page.waitForTimeout(50);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(800);
    assert.ok(await page.evaluate(()=>scrollY)>beforeScroll,'在背包上滑动也能翻页');assert.deepEqual((await read()).items,beforeItems);
    await flower.tap();await page.getByRole('dialog',{name:'雏菊护符详情',exact:true}).waitFor({timeout:3000});
    await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
    await seed('battle');await page.setViewportSize({width:1280,height:900});
    await staff.tap();await page.getByRole('button',{name:'关闭物品详情',exact:true}).tap();
    await page.screenshot({path:'reports/backpack-expedition-h5/battle-experience-desktop.png',fullPage:true});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await server.close();}
});
