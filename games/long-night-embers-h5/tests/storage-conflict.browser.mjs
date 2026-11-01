import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('旧窗口不能覆盖另一窗口已保存的进度，重新读取后可继续保存', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const a = await context.newPage();
    const b = await context.newPage();
    for (const page of [a, b]) {
      await page.goto(server.resolvedUrls.local[0]);
      await page.evaluate(async () => {
        window.storage = await import('/games/long-night-embers-h5/src/persistence/storage.ts');
        window.engine = await import('/games/long-night-embers-h5/src/core/engine.ts');
      });
    }
    await a.evaluate(async () => {
      const profile = window.engine.createInitialProfile(1);
      const run = window.engine.createInitialRun(1, {}, profile);
      await window.storage.saveSlotBundle(1, run, profile);
    });
    for (const page of [a, b]) {
      await page.evaluate(async () => { window.loaded = await window.storage.loadSlotBundle(1); });
    }
    assert.equal((await a.evaluate(async () => {
      window.loaded.profile.gold = 123;
      return window.storage.saveSlotBundle(1, window.loaded.run, window.loaded.profile);
    })).ok, true);
    assert.equal((await b.evaluate(async () => {
      window.loaded.profile.gold = 999;
      return window.storage.saveSlotBundle(1, window.loaded.run, window.loaded.profile);
    })).ok, false);
    const blocked = await b.evaluate(async () => ({
      imported: await window.storage.importJsonToSlot(1, window.storage.serializeExportBundle(window.loaded.run, window.loaded.profile)),
      restored: await window.storage.restoreSlotBackup(1),
    }));
    assert.equal(blocked.imported.ok, false);
    assert.equal(blocked.restored.run, null);
    assert.equal(await b.evaluate(async () => {
      window.loaded = await window.storage.loadSlotBundle(1);
      return window.loaded.profile.gold;
    }), 123);
    assert.equal((await b.evaluate(() => window.storage.saveSlotBundle(1, window.loaded.run, window.loaded.profile))).ok, true);
    for (const page of [a, b]) {
      await page.evaluate(async () => { window.loaded = await window.storage.loadSlotBundle(1); });
    }
    const raced = await Promise.all([a, b].map(page => page.evaluate(() =>
      window.storage.saveSlotBundle(1, window.loaded.run, window.loaded.profile))));
    assert.equal(raced.filter(r => r.ok).length, 1, '同时写入只能有一个窗口提交');
  } finally {
    await browser.close();
    await server.close();
  }
});
