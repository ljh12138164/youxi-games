import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

test('首页暂停、菜单关闭、开始与返回、刷新及窄屏',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(`${server.resolvedUrls.local[0]}games/card-realms-h5/`);
    const home=page.getByRole('region',{name:'卡牌领地首页'}),root=page.locator('.sl-app');
    await page.getByRole('button',{name:'进入牌桌',exact:true}).waitFor();
    const tick=await root.getAttribute('data-tick');
    await page.keyboard.press('Space');await page.waitForTimeout(350);
    assert.equal(await root.getAttribute('data-running'),'false');assert.equal(await root.getAttribute('data-tick'),tick);
    await home.getByRole('button',{name:'设置',exact:true}).click();
    await page.getByRole('button',{name:'完成',exact:true}).click();
    assert.equal(await root.getAttribute('data-running'),'false');
    await mkdir('reports/card-realms-h5',{recursive:true});await page.screenshot({path:'reports/card-realms-h5/home-desktop.png'});
    await page.getByRole('button',{name:'进入牌桌',exact:true}).click();
    await page.waitForTimeout(300);assert.equal(await root.getAttribute('data-running'),'true');
    await page.getByRole('button',{name:'首页',exact:true}).click();
    await home.waitFor();assert.equal(await root.getAttribute('data-running'),'false');
    await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'reports/card-realms-h5/home-mobile.png',fullPage:true});
    assert.equal(await home.evaluate(el=>el.scrollWidth>el.clientWidth),false);
  }finally{await browser.close();await server.close();}
});
