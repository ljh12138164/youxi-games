import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const KEY='youxi:backpack-expedition-h5:v1';
const state=page=>page.evaluate(()=>globalThis.__backpackGame.getState());
async function click(page,label,{touch=false,scroll=true}={}){
  for(let attempt=0;attempt<30;attempt++){
    const hit=await page.evaluate(label=>globalThis.__backpackGame.getHits().find(h=>h.enabled&&(h.label===label||h.label.startsWith(label))),label);
    if(hit){const width=page.viewportSize().width,ratio=width/Math.max(360,Math.min(1120,width)),x=(hit.x+hit.w/2)*ratio,y=(hit.y+hit.h/2)*ratio;if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);return hit;}
    if(!scroll)throw Error('Missing enabled control: '+label);
    await page.mouse.wheel(0,240);await page.waitForTimeout(20);
  }throw Error('Control not reachable: '+label+' '+JSON.stringify(await page.evaluate(()=>({state:__backpackGame.getState(),hits:__backpackGame.getHits()}))));
}
async function ready(page){await page.waitForFunction(()=>globalThis.__backpackGame?.getState().ready);}
async function touchDrag(cdp,page,from,to,cancel=false){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});await page.waitForTimeout(450);
  for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/6,y:from.y+(to.y-from.y)*i/6}]});await page.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
}
async function fixture(page,phase,options={}){
  await page.evaluate(async({phase,options,KEY})=>{
    const {newRun,act}=await import('/games/backpack-expedition-h5/src/engine.ts');let run=newRun(42,options.difficulty??'normal');
    if(options.legacy){delete run.ruleset;delete run.stepsPerFloor;delete run.seenEvents;}
    if(phase==='shop'){run.gold=100;run.step=1;run=act(run,{type:'node',kind:'shop'}).run;}
    if(phase==='battle'||phase==='prepare'){run.step=2;run=act(run,{type:'node',kind:'battle'}).run;if(phase==='battle')run=act(run,{type:'start'}).run;}
    if(phase==='event')run=act(run,{type:'node',kind:'event'}).run;
    if(phase==='rest'){run.step=3;run=act(run,{type:'node',kind:'rest'}).run;}
    if(phase==='expand')run.phase='expand';
    localStorage.setItem(KEY,JSON.stringify(run));
  },{phase,options,KEY});
  await page.reload();await ready(page);await click(page,'继续上次远征');return state(page);
}
test('共享 Canvas：正常首战、旋转拖放、交换、地上物品、商店、事件、旧档、暂停、动画和响应布局',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false,open:false}});await server.listen();const browser=await chromium.launch();
  try{
    await mkdir('reports/backpack-expedition-h5',{recursive:true});
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const url=server.resolvedUrls.local[0]+'games/backpack-expedition-h5/';await page.goto(url);await ready(page);
    await click(page,'收拾好，出发');await click(page,'林间遭遇');await click(page,'开始战斗');assert.equal((await state(page)).run.phase,'battle');
    const before=await state(page);await page.waitForTimeout(180);assert((await state(page)).frame>before.frame);
    await click(page,'物品 嫩枝杖');const selected=await state(page);assert.equal(selected.run.energy,3);
    const target=selected.run.enemies.find(e=>e.hp>0);await click(page,'1 ');let current=await state(page);assert(current.run.enemies.find(e=>e.uid===target.uid).hp<target.hp);assert(current.motion?.result.includes('命中'));
    await page.keyboard.press('Space');const frozen=await state(page);await page.waitForTimeout(200);assert.deepEqual((await state(page)).motion,frozen.motion);assert.equal((await state(page)).frame,frozen.frame);
    await click(page,'继续远征');await page.waitForTimeout(900);assert.equal((await state(page)).motion,null);
    // Finish the first encounter using only real controls and available equipment.
    for(let turn=0;turn<20&&(await state(page)).run.phase==='battle';turn++){
      for(const name of ['林间短刀','嫩枝杖','橡木盾']){
        current=await state(page);const item=current.run.items.find(i=>({dagger:'林间短刀',staff:'嫩枝杖',shield:'橡木盾'})[i.def]===name&&!i.used);if(!item||current.run.phase!=='battle')continue;
        await click(page,'物品 '+name);if(name!=='橡木盾'){const hits=await page.evaluate(()=>__backpackGame.getHits());if(hits.some(h=>h.enabled&&h.label.startsWith('1 ')))await click(page,'1 ');}
      }
      if((await state(page)).run.phase==='battle')await click(page,'结束回合');
    }
    assert.equal((await state(page)).run.phase,'loot');const reward=await state(page);await page.reload();await ready(page);await click(page,'继续上次远征');assert.deepEqual((await state(page)).run.loot,reward.run.loot);
    await click(page,'收好行囊，继续走');assert.equal((await state(page)).screen,'confirm');await click(page,'再想想');assert.equal((await state(page)).run.phase,'loot');
    await fixture(page,'map');
    const startItems=(await state(page)).run.items;await click(page,'物品 草药露');await click(page,'格子 6,4');assert.equal((await state(page)).run.items.find(i=>i.def==='potion').x,5);
    await click(page,'物品 草药露');await click(page,'放到地上');assert.equal((await state(page)).run.loot[0].def,'potion');
    await click(page,'地上 草药露');await click(page,'格子 4,1');assert.equal((await state(page)).run.loot.length,0);
    // Four-cell shield shifts one column left and moves all displaced pieces atomically.
    const shieldHit=await page.evaluate(()=>__backpackGame.getHits().find(h=>h.label==='物品 橡木盾'));
    const cell=shieldHit.w,ratio=1280/1120;await page.mouse.move((shieldHit.x+cell/2)*ratio,(shieldHit.y+cell/2)*ratio);await page.mouse.down();
    await page.mouse.move((shieldHit.x)*ratio,(shieldHit.y+cell)*ratio,{steps:8});await page.mouse.up();
    assert.equal((await state(page)).run.items.length,startItems.length);assert.equal((await state(page)).run.items.find(i=>i.def==='shield').x,0);
    await fixture(page,'map');
    const staff=await page.evaluate(()=>__backpackGame.getHits().find(h=>h.label==='物品 嫩枝杖'));
    await page.mouse.move((staff.x+staff.w/2)*ratio,(staff.y+staff.h/2)*ratio);await page.mouse.down();await page.mouse.move((staff.x+staff.w*4)*ratio,(staff.y+staff.w*3.5)*ratio,{steps:8});await page.mouse.click((staff.x+staff.w*4)*ratio,(staff.y+staff.w*3.5)*ratio,{button:'right'});await page.mouse.up();
    const rotated=(await state(page)).run.items.find(i=>i.def==='staff');assert.equal(rotated.rotation,1);assert.equal(rotated.y,3);
    await fixture(page,'shop');const shopBefore=await state(page),offer=shopBefore.run.offers[0];await click(page,'购买');current=await state(page);assert.equal(current.run.offers.length,3);assert(current.run.loot.some(i=>i.def===offer));assert(current.run.gold<shopBefore.run.gold);
    await click(page,'请摊主换货');await click(page,'再想想');assert.equal((await state(page)).run.shop.refreshed,false);await click(page,'请摊主换货');await click(page,'确认换货');assert.equal((await state(page)).run.shop.refreshed,true);
    const refreshed=(await state(page)).run.offers;await page.reload();await ready(page);await click(page,'继续上次远征');assert.deepEqual((await state(page)).run.offers,refreshed);
    await page.screenshot({path:'reports/backpack-expedition-h5/canvas-shop-desktop.png'});
    for(const phase of ['event','rest','expand']){
      await fixture(page,phase);const old=await state(page);
      if(phase==='event')await click(page,'不打扰，继续走');else if(phase==='rest')await click(page,'整理补给');else await click(page,'格子 7,1');
      const after=await state(page);assert.equal(after.run.phase,'map');if(phase==='expand')assert.equal(after.run.bag.length,old.run.bag.length+1);else assert.equal(after.run.step,old.run.step+1);
    }
    await fixture(page,'map',{legacy:true});assert.equal((await state(page)).run.ruleset,undefined);await click(page,'林间遭遇');assert.equal((await state(page)).run.stepsPerFloor,undefined);
    await click(page,'菜单');await click(page,'图鉴');await page.mouse.wheel(0,1200);await click(page,'关闭');await click(page,'菜单');await click(page,'存档');await click(page,'导出当前进度');await page.getByRole('button',{name:'完成',exact:true}).click();
    assert.equal((await state(page)).screen,'saves');
    const importBefore=await state(page);await click(page,'导入存档');await page.getByRole('textbox',{name:'粘贴存档 JSON'}).fill('{"version":999}');await page.getByRole('button',{name:'校验存档'}).click();assert.equal((await state(page)).run.seed,importBefore.run.seed);assert.match((await state(page)).notice,/格式不匹配/);
    await click(page,'导入存档');await page.getByRole('textbox',{name:'粘贴存档 JSON'}).fill(JSON.stringify(importBefore.run));await page.getByRole('button',{name:'校验存档'}).click();await click(page,'确认导入');assert.equal((await state(page)).run.seed,importBefore.run.seed);
    await click(page,'菜单');await click(page,'重新开始 / 更改难度');await click(page,'挑战');await click(page,'收拾行囊，重新出发');assert.equal((await state(page)).run.hp,30);assert.equal((await state(page)).run.difficulty,'hard');
    // Touch, small portrait, tablet and landscape share the exact same scene.
    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),mp=await mobile.newPage();mp.on('pageerror',error=>errors.push(error.message));await mp.goto(url);await ready(mp);
    await mp.setViewportSize({width:844,height:390});await mp.waitForFunction(()=>document.querySelector('canvas').width===Math.round(innerWidth*Math.min(devicePixelRatio||1,3)));await click(mp,'收拾好，出发',{touch:true,scroll:false});assert.equal((await state(mp)).started,true);await mp.setViewportSize({width:390,height:844});
    await fixture(mp,'shop');const cdp=await mobile.newCDPSession(mp);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:680}]});
    for(let y=650;y>=250;y-=40){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300,y}]});await mp.waitForTimeout(12);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert((await state(mp)).scroll>300);
    for(const viewport of [{width:320,height:640},{width:390,height:844},{width:660,height:844},{width:844,height:390}]){
      await mp.setViewportSize(viewport);await fixture(mp,'battle');await click(mp,'物品 嫩枝杖',{touch:true,scroll:false});await click(mp,'1 ',{touch:true,scroll:false});assert((await state(mp)).run.enemies.some(e=>e.hp<24));
      await click(mp,'物品 嫩枝杖',{touch:true});await click(mp,'详情 ·',{touch:true});await click(mp,'关闭',{touch:true});assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await mp.screenshot({path:`reports/backpack-expedition-h5/canvas-battle-${viewport.width}.png`});
    }
    assert.deepEqual(errors,[]);await mobile.close();await context.close();
  }finally{await browser.close();await server.close();}
});

test('抖音 TT 接口集成：同一游戏界面、原生触摸、独立存档、前后台暂停和静音（浏览器宿主替身）',async()=>{
  const browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true}),page=await context.newPage();
    await page.route('http://tt.test/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{width:100vw;height:100vh;touch-action:none}</style><body><script src="/game.js"></script></body>'});
      assert(/^\/(game\.js|assets\/[\w.-]+)$/.test(path));await route.fulfill({body:await readFile('dist/douyin/backpack-expedition-h5'+path),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.png')?'image/png':'audio/wav'});
    });
    await page.addInitScript(()=>{
      const handlers={};globalThis.__ttHost={handlers,audio:{plays:0,pauses:0},clipboard:''};
      globalThis.tt={createCanvas:()=>{const c=document.createElement('canvas');document.body.append(c);for(const [event,key]of[['pointerdown','start'],['pointermove','move'],['pointerup','end']])c.addEventListener(event,e=>{const touch={clientX:e.clientX,clientY:e.clientY};handlers[key]?.({touches:[touch],changedTouches:[touch]});});return c;},createImage:()=>new Image(),getSystemInfoSync:()=>({windowWidth:393,windowHeight:852,pixelRatio:1,safeArea:{top:24,bottom:828}}),getStorageSync:key=>localStorage.getItem(key),setStorageSync:(key,value)=>localStorage.setItem(key,value),createInnerAudioContext:()=>({play:()=>__ttHost.audio.plays++,pause:()=>__ttHost.audio.pauses++}),onTouchStart:fn=>handlers.start=fn,onTouchMove:fn=>handlers.move=fn,onTouchEnd:fn=>handlers.end=fn,onTouchCancel:fn=>handlers.cancel=fn,onHide:fn=>handlers.hide=fn,onShow:fn=>handlers.show=fn,onWindowResize:fn=>handlers.resize=fn,setClipboardData:({data,success})=>{__ttHost.clipboard=data;success();},getClipboardData:({success})=>success({data:__ttHost.clipboard}),showModal:({success})=>success()};
    });
    await page.goto('http://tt.test/');await ready(page);await click(page,'收拾好，出发',{touch:true});
    const cdp=await context.newCDPSession(page);
    const source=await page.evaluate(()=>__backpackGame.getHits().find(h=>h.label==='物品 草药露'));
    const destination=await page.evaluate(()=>__backpackGame.getHits().find(h=>h.label==='格子 6,4'));
    const sx=source.x+source.w/2,sy=source.y+source.h/2,dx=destination.x+destination.w/2,dy=destination.y+destination.h/2;
    await touchDrag(cdp,page,{x:sx,y:sy},{x:dx,y:dy});
    const moved=(await state(page)).run.items.find(i=>i.def==='potion');assert.equal(moved.x,5,'TT 长按物品后拖动应真实改变列');assert.equal(moved.y,3,'TT 长按拖动不应变成页面滚动');
    const shield=await page.evaluate(()=>__backpackGame.getHits().find(h=>h.label==='物品 橡木盾'));
    await touchDrag(cdp,page,{x:shield.x+shield.w/2,y:shield.y+shield.h/2},{x:shield.x,y:shield.y+shield.h});
    assert.equal((await state(page)).run.items.find(i=>i.def==='shield').x,0,'触摸拖动也应使用同一套交换规则');
    const staff=await page.evaluate(()=>__backpackGame.getHits().find(h=>h.label==='物品 嫩枝杖'));
    const itemsBefore=(await state(page)).run.items;
    await touchDrag(cdp,page,{x:staff.x+staff.w/2,y:staff.y+staff.h/2},{x:8,y:180},true);assert.deepEqual((await state(page)).run.items,itemsBefore,'系统取消触摸不得提交拖放');
    await touchDrag(cdp,page,{x:staff.x+staff.w/2,y:staff.y+staff.h/2},{x:8,y:180});assert.deepEqual((await state(page)).run.items,itemsBefore,'包外非法落点应保留全部物品');
    await click(page,'林间遭遇',{touch:true});await click(page,'开始战斗',{touch:true});
    await click(page,'物品 嫩枝杖',{touch:true});await click(page,'1 ',{touch:true});const before=await state(page);assert(before.motion);assert(before.run.energy<3);
    await page.evaluate(()=>__ttHost.handlers.hide());const frozen=await state(page);await page.waitForTimeout(160);assert.equal((await state(page)).frame,frozen.frame);assert.deepEqual((await state(page)).motion,frozen.motion);assert(await page.evaluate(()=>__ttHost.audio.pauses>0));
    await page.evaluate(()=>__ttHost.handlers.show());await page.waitForTimeout(100);assert((await state(page)).frame>frozen.frame);
    assert.equal(await page.evaluate(()=>localStorage.getItem('youxi:backpack-expedition-h5:v1')),null);
    await page.reload();await ready(page);await click(page,'继续上次远征',{touch:true});assert.deepEqual((await state(page)).run.enemies,before.run.enemies);
    await click(page,'菜单',{touch:true});await click(page,'声音开',{touch:true});await click(page,'关闭',{touch:true});assert.equal(await page.evaluate(()=>__backpackGame.isMuted()),true);
    await context.close();
  }finally{await browser.close();}
});
