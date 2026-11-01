import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

test('首页菜单与快捷键不启动战斗，继续与返回保留进度，窄屏可用',async()=>{
  const server=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto(`${server.resolvedUrls.local[0]}games/long-night-embers-h5/`);
    const home=page.getByRole('region',{name:'永夜余烬首页'}),root=page.locator('.lne-app');
    await page.getByRole('button',{name:'直接出击当前角色',exact:true}).waitFor();
    const tick=await root.getAttribute('data-tick');
    await page.keyboard.press('Space');await page.keyboard.press('Escape');await page.waitForTimeout(350);
    assert.equal(await root.getAttribute('data-running'),'false');assert.equal(await root.getAttribute('data-tick'),tick);
    await home.getByRole('button',{name:'选项',exact:true}).click();await page.keyboard.press('Escape');
    await home.waitFor();assert.equal(await root.getAttribute('data-running'),'false');
    await page.getByRole('combobox',{name:'新远征难度'}).selectOption('hard');
    await mkdir('reports/long-night-embers-h5',{recursive:true});await page.screenshot({path:'reports/long-night-embers-h5/home-desktop.png'});
    await page.getByRole('button',{name:'直接出击当前角色',exact:true}).click();
    await page.waitForTimeout(300);assert.equal(await root.getAttribute('data-running'),'true');
    await page.getByRole('button',{name:'首页',exact:true}).click();await home.waitFor();
    assert.equal(await root.getAttribute('data-running'),'false');
    await page.reload();await home.waitFor();
    await page.waitForFunction(()=>!document.querySelector('.lne-home-start-btn').disabled);
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'reports/long-night-embers-h5/home-mobile.png',fullPage:true});
    assert.equal(await home.evaluate(el=>el.scrollWidth>el.clientWidth),false);
  }finally{await browser.close();await server.close();}
});
