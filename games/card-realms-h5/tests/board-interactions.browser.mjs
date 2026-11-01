import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('中键平移、双击整堆拖动、取消拖动与开包反馈', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${server.resolvedUrls.local[0]}games/card-realms-h5/`);
    await page.getByRole('button',{name:'进入牌桌',exact:true}).click();
    await page.locator('.paper-card').first().waitFor();
    const world = page.locator('.board-world');
    const initial = await world.getAttribute('style');
    await page.mouse.move(700, 180);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(760, 210);
    await page.mouse.up({ button: 'middle' });
    assert.notEqual(await world.getAttribute('style'), initial);

    const goldStack = page.locator('.card-stack').filter({ has: page.locator('.paper-card-title', { hasText: /^金币$/ }) }).first();
    assert.equal(await goldStack.locator('.paper-card').count(), 3);
    const top = goldStack.locator('.paper-card').last();
    await top.click(); // A stationary click must not split the stack.
    assert.equal(await goldStack.locator('.paper-card').count(), 3);
    const box = await top.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 55);
    assert.equal(await page.locator('.card-stack-dragging .paper-card').count(), 3);
    await page.locator('.board-viewport').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    assert.equal(await page.locator('.card-stack-dragging').count(), 0);
    assert.equal(await goldStack.locator('.paper-card').count(), 3);

    await page.locator('.pack-btn:enabled').first().click();
    assert.ok(await page.locator('.paper-card-revealed').count() > 0);
    assert.equal(await page.locator('.paper-card-revealed').first().evaluate(el => getComputedStyle(el).animationName), 'card-pack-reveal');
  } finally {
    await browser.close();
    await server.close();
  }
});
