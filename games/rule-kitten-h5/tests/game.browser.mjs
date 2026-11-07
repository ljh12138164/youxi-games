import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { LEVELS } from '../src/levels.ts';

const screenshots = path.join(os.tmpdir(), 'rule-kitten-verification');
const state = page => page.evaluate(() => globalThis.__ruleKitten.getState());
const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
async function click(page, label) {
  const hit = await page.evaluate(label => globalThis.__ruleKitten.getHits().find(h => h.label === label), label);
  assert(hit?.enabled, 'Missing enabled control: ' + label);
  await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2);
}

test('feedback: blocked moves explain why, restart is reversible, and changed rules are named', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen(); const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(server.resolvedUrls.local[0] + 'games/rule-kitten-h5/'); await page.waitForFunction(() => globalThis.__ruleKitten?.getState().ready);
    await click(page, '开始解谜');
    await page.keyboard.press('ArrowUp'); const beforeBlocked = await state(page);
    await page.keyboard.press('ArrowUp');
    assert.deepEqual((await state(page)).board, beforeBlocked.board); assert.match((await state(page)).feedback.notice, /墙.*挡路/);
    await page.keyboard.press('r'); assert.equal((await state(page)).board.steps, 0); assert.match((await state(page)).feedback.notice, /可撤销返回/);
    await page.keyboard.press('z'); assert.deepEqual((await state(page)).board, beforeBlocked.board);
    await page.keyboard.press('z'); assert.equal((await state(page)).board.steps, 0);
    const undo = await page.evaluate(() => __ruleKitten.getHits().find(h => h.label === '重来'));
    await page.mouse.move(undo.x + undo.w / 2, undo.y + undo.h / 2); assert.equal(await page.locator('canvas').evaluate(c => c.style.cursor), 'pointer');
    for (let i = 0; i < 2; i++) { for (const direction of LEVELS[i].solution) await page.keyboard.press(keys[direction]); await click(page, '去下一关'); }
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
    const changed = await state(page); assert.match(changed.feedback.notice, /规则失效：墙 是 挡/);
    assert(changed.feedback.ruleChanges.removed.includes('墙 是 挡'));
    await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: path.join(screenshots, 'interaction-rule-feedback.png') });
    // Input remains available even while the preceding move is still animating.
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); assert.equal((await state(page)).board.steps, changed.board.steps + 2);
    await click(page, '设置'); await click(page, '动态效果：开'); await click(page, '返回游戏');
    assert((await state(page)).feedback.reducedMotion); await page.keyboard.press('z'); assert.equal((await state(page)).feedback.moving, false);
    await page.reload(); await page.waitForFunction(() => __ruleKitten?.getState().ready); assert((await state(page)).feedback.reducedMotion);
    await click(page, '继续解谜'); await click(page, '设置'); await click(page, '动态效果：关'); await click(page, '返回游戏');
    assert.equal((await state(page)).feedback.reducedMotion, false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => __ruleKitten.getState().feedback.reducedMotion);
    await click(page, '设置'); const system = await page.evaluate(() => __ruleKitten.getHits().find(h => h.label === '动态效果：系统已减少'));
    assert.equal(system.enabled, false); await click(page, '返回游戏');
    await page.keyboard.press('ArrowRight'); assert.equal((await state(page)).feedback.moving, false);
  } finally { await browser.close(); await server.close(); }
});

test('手机方向盘保持十字空间关系，并与辅助操作分区', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen(); const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
    await page.goto(server.resolvedUrls.local[0] + 'games/rule-kitten-h5/'); await page.waitForFunction(() => globalThis.__ruleKitten?.getState().ready);
    await click(page, '开始解谜');
    const hits = await page.evaluate(() => __ruleKitten.getHits().map(({ label, direction, x, y, w, h }) => ({ label, direction, x, y, w, h })));
    const direction = name => { const hit = hits.find(h => h.direction === name); return { ...hit, cx: hit.x + hit.w / 2, cy: hit.y + hit.h / 2 }; };
    const up = direction('up'), down = direction('down'), left = direction('left'), right = direction('right');
    assert.equal(up.cx, down.cx, '上下必须处于同一列，不能排成一行');
    assert.equal(left.cy, right.cy); assert(up.cy < left.cy && down.cy > left.cy);
    assert(left.cx < up.cx && right.cx > up.cx);
    for (const hit of [up, down, left, right]) assert(hit.w >= 44 && hit.h >= 44);
    for (const hit of hits.filter(h => ['撤销', '重来', '提示', '设置'].includes(h.label))) assert(hit.x + hit.w <= left.x - 8, '辅助操作在方向盘左侧独立成组');
  } finally { await browser.close(); await server.close(); }
});

test('desktop: all eighteen levels through real keys, win/undo/restart, saved progress and responsive menus', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen(); const browser = await chromium.launch();
  try {
    await mkdir(screenshots, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0] + 'games/rule-kitten-h5/');
    await page.waitForFunction(() => globalThis.__ruleKitten?.getState().ready);
    await page.screenshot({ path: path.join(screenshots, 'desktop-home.png') }); await click(page, '开始解谜');
    await page.keyboard.press('w'); assert.equal((await state(page)).board.steps, 1);
    await page.keyboard.press('z'); assert.equal((await state(page)).board.steps, 0);
    for (let i = 0; i < LEVELS.length; i++) {
      assert.equal((await state(page)).level, i);
      if (i === 2) await page.screenshot({ path: path.join(screenshots, 'desktop-level-03.png') });
      if (i >= 12) await page.screenshot({ path: path.join(screenshots, `challenge-${i + 1}.png`) });
      for (const direction of LEVELS[i].solution) await page.keyboard.press(keys[direction]);
      assert.equal((await state(page)).board.won, true, 'Desktop level ' + (i + 1));
      await page.keyboard.press('Escape'); assert.deepEqual((await state(page)).paused, []);
      if (i === 0) {
        await click(page, '撤销最后一步'); assert.equal((await state(page)).board.won, false);
        await page.keyboard.press('ArrowRight'); assert((await state(page)).board.won);
      }
      if (i < LEVELS.length - 1) await click(page, '去下一关');
    }
    assert.equal((await state(page)).completed.length, LEVELS.length);
    await page.screenshot({ path: path.join(screenshots, 'desktop-complete.png') });
    await click(page, '看看全部关卡');
    await click(page, '入门 · 12 关');
    await click(page, '03 · 已过'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    assert(!(await state(page)).rules.some(r => r.noun === 'wall' && r.property === 'stop'));
    const saved = await state(page); await page.reload(); await page.waitForFunction(() => globalThis.__ruleKitten?.getState().ready);
    await click(page, '继续解谜'); assert.deepEqual((await state(page)).board, saved.board); assert.equal((await state(page)).undoCount, saved.undoCount);
    await page.keyboard.press('z'); assert.equal((await state(page)).board.steps, 2);
    await page.keyboard.press('r'); assert.equal((await state(page)).board.steps, 0);
    await page.keyboard.press('Escape'); const paused = await state(page); await page.waitForTimeout(160);
    assert.equal((await state(page)).elapsed, paused.elapsed); await page.keyboard.press('Escape'); assert((await state(page)).running);
    await click(page, '设置'); await click(page, '音效：开'); await click(page, '返回游戏'); assert((await state(page)).muted);
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1280, 900]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(60);
      for (const hit of await page.evaluate(() => __ruleKitten.getHits().map(({ x, y, w, h }) => ({ x, y, w, h })))) assert(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= width + 1 && hit.y + hit.h <= height + 1);
      await page.screenshot({ path: path.join(screenshots, `play-${width}x${height}.png`) });
      if (height < 760 || width < 360) {
        const directionHits = await page.evaluate(() => __ruleKitten.getHits().filter(h => h.direction).map(h => ({ w: h.w, h: h.h })));
        assert(directionHits.every(h => h.w >= 44 && h.h >= 44), 'Compact touch targets must remain at least 44 CSS pixels');
        await click(page, '提示'); await page.screenshot({ path: path.join(screenshots, `hint-${width}x${height}.png`) }); await click(page, '收起提示');
      }
      await click(page, '选关'); await page.screenshot({ path: path.join(screenshots, `levels-${width}x${height}.png`) }); await click(page, '返回');
    }
    assert.deepEqual(errors, []); console.log('Screenshots:', screenshots);
  } finally { await browser.close(); await server.close(); }
});

test('mobile: actual touch swipes, held direction, cancellation and undo', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen(); const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.goto(server.resolvedUrls.local[0] + 'games/rule-kitten-h5/'); await page.waitForFunction(() => globalThis.__ruleKitten?.getState().ready);
    await click(page, '开始解谜'); const cdp = await page.context().newCDPSession(page), map = (await state(page)).layout.map;
    const start = { x: map.x + 2.5 * map.tile, y: map.y + 7.5 * map.tile };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: start.y - map.tile }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await state(page)).board.steps, 1);
    const hit = await page.evaluate(() => __ruleKitten.getHits().find(h => h.label === '向右'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 }] });
    await page.waitForTimeout(420); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const cancelled = await state(page); assert(cancelled.board.steps >= 3); await page.waitForTimeout(250); assert.equal((await state(page)).board.steps, cancelled.board.steps);
    await click(page, '撤销'); assert.equal((await state(page)).board.steps, cancelled.board.steps - 1);
  } finally { await browser.close(); await server.close(); }
});

test('built Douyin entry: all levels with touch, safe area, native storage, mute and lifecycle', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const atlas = (await readFile('games/rule-kitten-h5/src/assets/atlas-paper-v1.png')).toString('base64');
    await page.evaluate(atlas => {
      const handlers = {}, store = {}, audio = []; let now = 0;
      Date.now = () => now; globalThis.requestAnimationFrame = fn => { globalThis.__frame = fn; return 1; };
      globalThis.__ttHost = { handlers, store, audio, step: count => { for (let i = 0; i < count; i++) { now += 50; globalThis.__frame(); } } };
      globalThis.tt = {
        createCanvas: () => { const canvas = document.createElement('canvas'); document.body.style.margin = '0'; document.body.appendChild(canvas); return canvas; },
        createImage: () => { const image = new Image(); Object.defineProperty(image, 'src', { set() { Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set.call(image, 'data:image/png;base64,' + atlas); } }); return image; },
        getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 1, safeArea: { top: 24, bottom: 818 } }),
        getStorageSync: key => store[key], setStorageSync: (key, value) => { store[key] = value; },
        createInnerAudioContext: () => ({ src: '', volume: 0, play() { audio.push('play'); }, stop() { audio.push('stop'); } }),
        onTouchStart: fn => { handlers.down = fn; }, onTouchMove: fn => { handlers.move = fn; }, onTouchEnd: fn => { handlers.up = fn; }, onTouchCancel: fn => { handlers.cancel = fn; },
        onHide: fn => { handlers.hide = fn; }, onShow: fn => { handlers.show = fn; }, onWindowResize: fn => { handlers.resize = fn; },
      };
      globalThis.__tap = label => {
        const hit = __ruleKitten.getHits().find(h => h.label === label && h.enabled); if (!hit) throw Error('Missing enabled control ' + label);
        const point = { identifier: 1, clientX: hit.x + hit.w / 2, clientY: hit.y + hit.h / 2 };
        handlers.down({ touches: [point], changedTouches: [point] }); handlers.up({ touches: [], changedTouches: [point] }); __ttHost.step(3);
      };
    }, atlas);
    await page.addScriptTag({ content: await readFile('dist/douyin/rule-kitten-h5/game.js', 'utf8') });
    await page.waitForFunction(() => globalThis.__ruleKitten?.getState().ready);
    await page.evaluate(() => __tap('开始解谜'));
    const labels = { up: '向上', down: '向下', left: '向左', right: '向右' };
    for (let i = 0; i < LEVELS.length; i++) {
      for (const direction of LEVELS[i].solution) await page.evaluate(label => __tap(label), labels[direction]);
      assert((await state(page)).board.won, 'TT level ' + (i + 1));
      if (i < LEVELS.length - 1) await page.evaluate(() => __tap('去下一关'));
    }
    assert.equal((await state(page)).completed.length, LEVELS.length);
    assert.equal(await page.evaluate(() => JSON.parse(__ttHost.store['youxi:rule-kitten-h5:douyin:save:v1']).completed.length), LEVELS.length);
    await page.evaluate(() => { __tap('看看全部关卡'); __tap('入门 · 12 关'); __tap('01 · 已过'); __ttHost.handlers.hide(); });
    const hidden = await state(page); await page.evaluate(() => __ttHost.step(10)); assert.equal((await state(page)).elapsed, hidden.elapsed);
    await page.evaluate(() => { __ttHost.handlers.show(); __tap('设置'); __tap('音效：开'); __tap('动态效果：开'); __tap('返回游戏'); });
    assert((await state(page)).feedback.reducedMotion);
    const plays = await page.evaluate(() => __ttHost.audio.filter(s => s === 'play').length);
    await page.evaluate(() => __tap('向上')); assert.equal(await page.evaluate(() => __ttHost.audio.filter(s => s === 'play').length), plays);
    const beforeSwipe = (await state(page)).board.steps;
    await page.evaluate(() => {
      const { map } = __ruleKitten.getState().layout;
      const start = { identifier: 1, clientX: map.x + 2.5 * map.tile, clientY: map.y + 6.5 * map.tile };
      __ttHost.handlers.down({ touches: [start], changedTouches: [start] });
      __ttHost.handlers.up({ touches: [], changedTouches: [{ ...start, clientX: start.clientX + map.tile }] });
      __ttHost.step(5);
    });
    assert.equal((await state(page)).board.steps, beforeSwipe + 1, 'Fast swipes must use the final touch position even without a move event');
    assert.equal((await state(page)).feedback.moving, false);
    const map = (await state(page)).layout.map; assert(map.y > 60 && map.y + map.tile * 10 < 818);
    await page.screenshot({ path: path.join(screenshots, 'douyin-host-playing.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
