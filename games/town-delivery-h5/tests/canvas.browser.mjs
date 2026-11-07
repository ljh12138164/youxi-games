import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const state = page => page.evaluate(() => globalThis.__townGame.getState());
async function click(page, label) {
  const hit = await page.evaluate(label => globalThis.__townGame.getHits().find(h => h.label === label), label);
  assert(hit?.enabled, 'Control must be available: ' + label);
  await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2);
}
async function drag(page, cells) {
  const points = (await state(page)).cells;
  await page.mouse.move(points[cells[0]].x, points[cells[0]].y); await page.mouse.down();
  for (const cell of cells.slice(1)) await page.mouse.move(points[cell].x, points[cell].y, { steps: 4 });
  await page.mouse.up();
}
const artifacts = path.join(os.tmpdir(), 'town-delivery-verification');

test('H5: mouse and touch drawing, delivery, pause, refund, responsive controls, and no runtime errors', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen(); const browser = await chromium.launch();
  try {
    await mkdir(artifacts, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.resolvedUrls.local[0] + 'games/town-delivery-h5/'); await page.waitForFunction(() => globalThis.__townGame);
    const cdp = await page.context().newCDPSession(page), points = (await state(page)).cells;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[19]] });
    for (const cell of [20, 21, 22, 23, 24]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[cell]] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual((await state(page)).roads, [20, 21, 22, 23]);
    await click(page, '开始营业'); await page.waitForFunction(() => __townGame.getState().delivered >= 2);
    await click(page, '暂停规划'); const frozen = await state(page); await page.waitForTimeout(200);
    assert.equal((await state(page)).elapsed, frozen.elapsed);
    await click(page, '擦路'); await drag(page, [21]); assert.equal((await state(page)).roads.length, 3);
    await click(page, '画路'); await drag(page, [21]); assert.equal((await state(page)).roads.length, 4);
    await drag(page, [23, 32, 41, 50]); assert(!(await state(page)).roads.includes(50), 'Cannot build on water');
    await drag(page, [24, 33, 42, 51, 60, 69, 78]); assert((await state(page)).roads.includes(51));
    for (const [width, height] of [[320, 568], [390, 844], [1280, 900], [844, 390]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(50);
      const hits = await page.evaluate(() => __townGame.getHits().map(({ x, y, w, h }) => ({ x, y, w, h })));
      assert(hits.every(h => h.x >= 0 && h.y >= 0 && h.x + h.w <= width + 1 && h.y + h.h <= height + 1));
      await page.screenshot({ path: path.join(artifacts, `h5-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await click(page, '继续配送'); assert.equal((await state(page)).running, true);
    assert.deepEqual(errors, []);
    console.log('Screenshots:', artifacts);
  } finally { await browser.close(); await server.close(); }
});

test('built TT entry: touch cancellation, lifecycle pause, full run, restart and score persistence', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => {
      const handlers = {}, store = {}; let now = 0;
      Date.now = () => now;
      globalThis.requestAnimationFrame = fn => { globalThis.__frame = fn; return 1; };
      globalThis.__ttHost = { handlers, store, step: count => { for (let i = 0; i < count; i++) { now += 100; globalThis.__frame(); } } };
      globalThis.tt = {
        createCanvas: () => { const canvas = document.createElement('canvas'); document.body.style.margin = '0'; document.body.appendChild(canvas); return canvas; },
        getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 1, safeArea: { top: 24, bottom: 810 } }),
        getStorageSync: key => store[key], setStorageSync: (key, value) => { store[key] = value; },
        onTouchStart: fn => { handlers.down = fn; }, onTouchMove: fn => { handlers.move = fn; },
        onTouchEnd: fn => { handlers.up = fn; }, onTouchCancel: fn => { handlers.cancel = fn; },
        onHide: fn => { handlers.hide = fn; }, onShow: fn => { handlers.show = fn; }, onWindowResize: fn => { handlers.resize = fn; },
      };
      globalThis.__tap = label => {
        const hit = __townGame.getHits().find(h => h.label === label && h.enabled);
        if (!hit) throw Error('Missing control ' + label);
        const touch = { identifier: 1, clientX: hit.x + hit.w / 2, clientY: hit.y + hit.h / 2 };
        handlers.down({ changedTouches: [touch], touches: [touch] }); handlers.up({ changedTouches: [touch], touches: [] });
      };
      globalThis.__draw = cells => {
        const points = __townGame.getState().cells;
        const event = cell => ({ changedTouches: [{ identifier: 1, clientX: points[cell].x, clientY: points[cell].y }], touches: [] });
        handlers.down(event(cells[0])); for (const cell of cells.slice(1)) handlers.move(event(cell)); handlers.up(event(cells.at(-1)));
      };
    });
    await page.addScriptTag({ content: await readFile('dist/douyin/town-delivery-h5/game.js', 'utf8') });
    await page.evaluate(() => {
      __draw([19, 24]); // A fast swipe fills all intermediate road cells.
      __draw([24, 33, 42, 51, 60, 69, 78]);
      __draw([60, 59, 58, 57, 56, 55, 64, 73, 82]); __draw([24, 25, 16]);
      __ttHost.handlers.cancel(); __tap('开始营业'); __ttHost.step(35);
    });
    assert((await state(page)).delivered >= 2);
    await page.evaluate(() => { __tap('暂停规划'); __ttHost.handlers.hide(); __ttHost.step(5); __ttHost.handlers.show(); });
    const frozen = await state(page); await page.evaluate(() => __ttHost.step(10));
    assert.equal((await state(page)).elapsed, frozen.elapsed); assert.deepEqual((await state(page)).paused, ['manual']);
    await page.evaluate(() => { __tap('继续配送'); __ttHost.handlers.hide(); });
    const hidden = await state(page); await page.evaluate(() => __ttHost.step(10)); assert.equal((await state(page)).elapsed, hidden.elapsed);
    await page.evaluate(() => { __ttHost.handlers.show(); __ttHost.step(600); });
    assert((await state(page)).coins >= 30);
    await page.evaluate(() => __tap('加车  $30')); assert.equal((await state(page)).vans.length, 3);
    await page.screenshot({ path: path.join(artifacts, 'tt-host-playing.png') });
    await page.evaluate(() => __ttHost.step(1801));
    const result = await state(page); assert.equal(result.finished, true); assert(result.delivered >= 24);
    assert.equal(result.best, result.delivered);
    await page.screenshot({ path: path.join(artifacts, 'tt-host-result.png') });
    await page.evaluate(() => __tap('再开一家面包房'));
    assert.equal((await state(page)).elapsed, 0); assert.equal((await state(page)).best, result.delivered);
    assert.equal(await page.evaluate(() => __ttHost.store['youxi:town-delivery-h5:douyin:best:v1']), result.delivered);
    assert.deepEqual(errors, []);
    console.log('TT host result:', { delivered: result.delivered, missed: result.missed });
  } finally { await browser.close(); }
});
