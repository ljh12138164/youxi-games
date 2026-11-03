import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

test('新商店确认换货、旧档续玩、Boss 预告与阶段、43 张物品图及手机布局',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url=`${server.resolvedUrls.local[0]}games/backpack-expedition-h5/`;
    await page.goto(url);
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('youxi:backpack-expedition-h5:v1')));
    // These fixtures isolate UI boundaries; full journeys use journey-driver.ts without injections.
    const seed=async kind=>{
      await page.evaluate(async kind=>{
        const {newRun,act}=await import('/games/backpack-expedition-h5/src/engine.ts');
        const {ITEMS}=await import('/games/backpack-expedition-h5/src/content.ts');
        let run=newRun(42,'hard');run.discoveries=ITEMS.map(d=>d.id);
        if(kind==='shop'||kind==='legacy'){
          if(kind==='legacy')delete run.ruleset;
          run.floor=2;run.step=1;run.gold=100;run=act(run,{type:'node',kind:'shop'}).run;
          if(kind==='shop')run.offers=['forkblade','sproutshield','potion','mossbow'];
        }else{
          const def=kind==='shell'?'boss1':'boss3';run.floor=Number(def.at(-1));run.phase='battle';run.node='boss';run.turn=2;
          run.enemies=[{uid:run.seq++,def,hp:kind==='shell'?60:63,block:kind==='shell'?5:0,poison:0}];
        }
        localStorage.setItem('youxi:backpack-expedition-h5:v1',JSON.stringify(run));
      },kind);
      await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
    };
    await mkdir('reports/backpack-expedition-h5',{recursive:true});
    await seed('shop');
    assert.equal(await page.locator('.shop-grid article').count(),4);
    assert.match(await page.locator('.shop-grid').innerText(),/商店专属/);
    await page.getByRole('button',{name:'图鉴',exact:true}).click();
    const sprites=await page.locator('.codex-grid svg').evaluateAll(es=>es.map(e=>e.dataset.sprite));
    assert.equal(sprites.length,43);assert.equal(new Set(sprites).size,43);assert.ok(sprites.every(Boolean));
    await page.screenshot({path:'reports/backpack-expedition-h5/iteration-codex.png',fullPage:true});
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.locator('.shop-grid article').filter({has:page.getByRole('heading',{name:'岔枝重刃',exact:true})}).getByRole('button',{name:/购买/}).click();
    const bought=await read();assert.equal(bought.gold,76);assert.equal(bought.loot[0].def,'forkblade');
    await page.getByRole('button',{name:'请摊主换货 · 4 金币',exact:true}).click();
    await page.getByRole('button',{name:'先看看',exact:true}).click();assert.deepEqual(await read(),bought);
    await page.getByRole('button',{name:'请摊主换货 · 4 金币',exact:true}).click();
    assert.match(await page.getByRole('dialog').innerText(),/当前 3 件未售商品/);
    await page.getByRole('button',{name:'确认换货 · 4 金币',exact:true}).click();
    const refreshed=await read();assert.equal(refreshed.gold,72);assert.equal(refreshed.offers.length,3);assert.ok(!refreshed.offers.includes('forkblade'));assert.deepEqual(refreshed.loot,bought.loot);
    await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
    assert.ok(await page.getByRole('button',{name:'本店已换过货',exact:true}).isDisabled());
    await seed('shop');await page.screenshot({path:'reports/backpack-expedition-h5/iteration-shop-desktop.png',fullPage:true});
    await page.locator('.shop-grid article').filter({has:page.getByRole('heading',{name:'岔枝重刃',exact:true})}).getByRole('button',{name:/购买/}).click();
    await page.getByRole('button',{name:'岔枝重刃，待整理，2 能量',exact:true}).click();
    await page.getByRole('button',{name:'关闭物品详情',exact:true}).click();
    await page.getByRole('button',{name:'格子 5,1',exact:true}).click();
    assert.ok((await read()).items.some(i=>i.def==='forkblade'&&i.x===4&&i.y===0));
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(width===390)await page.screenshot({path:'reports/backpack-expedition-h5/iteration-shop-mobile.png',fullPage:true});
    }
    await seed('legacy');assert.equal(await page.getByRole('button',{name:/请摊主换货/}).count(),0);
    const old=await read();assert.equal(old.ruleset,undefined);assert.equal(old.shop,undefined);
    await seed('shell');
    assert.equal(await page.locator('.hero svg').getAttribute('data-actor'),'hero');
    assert.equal(await page.locator('.enemy svg').getAttribute('data-actor'),'boss1');
    assert.match(await page.locator('.enemy .intent').innerText(),/攻击 9/);
    const attack=async()=>{
      await page.getByRole('button',{name:'嫩枝杖，背包内，1 能量',exact:true}).click();
      await page.getByRole('button',{name:'关闭物品详情',exact:true}).click();
      await page.locator('.quick-targets button').first().click();
    };
    await attack();assert.match(await page.locator('.enemy .intent').innerText(),/攻击 5.*破壳/);
    await page.getByRole('button',{name:/结束回合/}).click();assert.equal((await read()).hp,25);
    assert.match(await page.locator('.encounter-note').innerText(),/休整/);
    await seed('tree');assert.equal(await page.locator('.enemy svg').getAttribute('data-actor'),'boss3');await attack();assert.match(await page.locator('.encounter-note').innerText(),/下回合进入第二阶段/);
    assert.match(await page.locator('.enemy .intent').innerText(),/攻击 29/);
    await page.getByRole('button',{name:/结束回合/}).click();assert.match(await page.locator('.enemy .intent').innerText(),/蓄力/);
    await page.screenshot({path:'reports/backpack-expedition-h5/iteration-boss-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const scene=await page.locator('.forest-scene').boundingBox(),label=await page.locator('.enemy .intent').boundingBox();
    assert.ok(label.y>=scene.y&&label.y+label.height<=scene.y+scene.height,'完整行动预告必须留在战场内');
    await page.screenshot({path:'reports/backpack-expedition-h5/iteration-boss-mobile.png',fullPage:true});
    await page.reload();await page.getByRole('button',{name:'继续远征',exact:true}).click();
    assert.match(await page.locator('.enemy .intent').innerText(),/蓄力/);
    await page.getByRole('button',{name:'暂停',exact:true}).click();const paused=await read();
    assert.equal(await page.locator('.forest-game').getAttribute('data-running'),'false');assert.deepEqual(await read(),paused);
    assert.deepEqual(errors,[]);await context.close();
  }finally{await browser.close();await server.close();}
});
