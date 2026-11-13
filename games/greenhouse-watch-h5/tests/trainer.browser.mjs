import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { clickCanvas, openGameMenu } from './platform-driver.mjs';

test('trainer modifies the normal profile and adventure, with local saves', { timeout: 150_000 }, async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false, hmr: false } });
  await server.listen();
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1000, height: 820 } });
    await page.addInitScript(() => {
      sessionStorage.setItem('greenhouse-watch-practice', JSON.stringify({ level: 26, coins: 640, sun: 175, unlock: true }));
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => window.greenhouseWatch.readState());
    const waitForTitle = () => page.locator('canvas[data-ready=true]').waitFor({ timeout: 40_000 });
    const restart = async action => {
      await Promise.all([page.waitForNavigation(), action()]);
      await waitForTitle();
    };
    const openTrainer = () => page.locator('#game-trainer').click();
    const closeTrainer = () => page.getByRole('button', { name: '关闭', exact: true }).click();
    const sampleTicks = async () => {
      const before = (await state()).boardTicks;
      await page.waitForTimeout(1_400);
      return (await state()).boardTicks - before;
    };
    const hasRoundSave = () => page.evaluate(() =>
      window.Module.FS.readdir('/greenhouse-full-saves/userdata').some(name => name.endsWith('.v4')),
    );

    await page.goto(server.resolvedUrls.local[0] + 'games/greenhouse-watch-h5/');
    await waitForTitle();
    assert.equal(await page.title(), '植物大战僵尸');
    assert.equal((await state()).language, 'zh-CN');
    assert.equal((await state()).scene, 0);
    await openTrainer();
    assert.equal(await page.getByText('开始练习', { exact: true }).count(), 0);
    assert.equal(await page.locator('#add-sun').isDisabled(), true);
    assert.equal(await page.locator('#jump-level').isDisabled(), true);
    await closeTrainer();
    await openGameMenu(page, page);
    await page.waitForFunction(() => window.Module._greenhouse_can_jump() === 1);
    await openTrainer();
    await page.locator('#trainer-coins').fill('640');
    await page.locator('#set-coins').click();
    assert.equal((await state()).coins, 640);
    await page.locator('#unlock-levels').click();
    assert.match(await page.locator('#trainer-status').textContent(), /已解锁/);
    await closeTrainer();
    await clickCanvas(page, 550, 225);
    await page.waitForFunction(() => window.greenhouseWatch.readState().scene === 7);
    await page.waitForTimeout(600);
    await clickCanvas(page, 554, 145);
    await page.waitForFunction(() => window.greenhouseWatch.readState().scene === 2);
    await restart(() => page.locator('#exit').click());
    assert.equal((await state()).coins, 640);
    await page.waitForTimeout(3_600);
    await clickCanvas(page, 400, 550);
    await page.waitForFunction(() => window.Module._greenhouse_can_jump() === 1);
    await openTrainer();
    await page.locator('#trainer-level').fill('2');
    await page.locator('#trainer-sun').fill('175');
    await page.locator('#jump-level').click();
    await page.waitForFunction(() => window.greenhouseWatch.readState().scene === 3, undefined, { timeout: 35_000 });
    assert.equal((await state()).level, 2);
    assert.ok((await state()).sun >= 175);

    await openTrainer();
    const previous = await state();
    await page.locator('#add-sun').click();
    assert.equal((await state()).sun, previous.sun + 100);
    await closeTrainer();
    const normal = await sampleTicks();

    await openTrainer();
    await page.locator('#game-speed').selectOption('2');
    assert.equal(await sampleTicks(), 0);
    await closeTrainer();
    const fast = await sampleTicks();
    assert.ok(fast > normal * 1.5, `2× board ticks: ${fast}, 1×: ${normal}`);
    await page.locator('#pause').click();
    assert.equal(await sampleTicks(), 0);

    await restart(() => page.locator('#exit').click());
    assert.equal(await hasRoundSave(), true);
    assert.equal((await state()).level, 2);
    assert.equal((await state()).coins, 640);
    await page.getByText('游戏语言与许可', { exact: true }).click();
    await page.locator('#game-language').selectOption('en');
    await restart(() => page.locator('#apply-language').click());
    assert.equal((await state()).language, 'en');
    assert.equal(await hasRoundSave(), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
