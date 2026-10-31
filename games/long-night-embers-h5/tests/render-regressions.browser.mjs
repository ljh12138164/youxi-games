import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('战场贴图边角透明，菜单图标保留槽位底色', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(server.resolvedUrls?.local[0]);
    const result = await page.evaluate(async () => {
      const art = await import('/games/long-night-embers-h5/src/render/pixelArt.ts');
      const { prepareApprovedArt } = await import('/games/long-night-embers-h5/src/render/approvedArt.ts');
      await prepareApprovedArt();
      const ids = ['fire_wand', 'magic_wand', 'knife', 'king_bible', 'cross', 'axe'];
      return Promise.all(ids.map(async (id) => {
        const canvas = art.getItemTexture(id).source.resource;
        const context = canvas.getContext('2d');
        const pixels = context.getImageData(0, 0, 48, 48).data;
        const icon = new Image();
        icon.src = art.getItemIconUrl(id);
        await icon.decode();
        const copy = document.createElement('canvas');
        copy.width = copy.height = 48;
        const ctx = copy.getContext('2d');
        ctx.drawImage(icon, 0, 0);
        return { id, alpha: pixels[3], visible: pixels.some((v, i) => i % 4 === 3 && v > 0), menuAlpha: ctx.getImageData(0, 0, 1, 1).data[3] };
      }));
    });
    for (const item of result) {
      assert.equal(item.alpha, 0, `${item.id} 战场贴图不应带黑色方底`);
      assert.ok(item.visible);
      assert.equal(item.menuAlpha, 255);
    }
    const projectiles = await page.evaluate(async () => {
      const art = await import('/games/long-night-embers-h5/src/render/pixelArt.ts');
      const { prepareApprovedArt } = await import('/games/long-night-embers-h5/src/render/approvedArt.ts');
      await prepareApprovedArt();
      const { WEAPONS } = await import('/games/long-night-embers-h5/src/content/ledger.ts');
      return WEAPONS.filter(w => w.scope !== 'dlc_excluded').map(w => {
        const canvas = art.getProjectileTexture(w.id, w.behavior, w.color).source.resource;
        const pixels = canvas.getContext('2d').getImageData(0, 0, 48, 48).data;
        return { id: w.id, alpha: pixels[3], visible: pixels.some((v, i) => i % 4 === 3 && v > 0) };
      });
    });
    for (const projectile of projectiles) {
      assert.equal(projectile.alpha, 0, projectile.id);
      assert.ok(projectile.visible, projectile.id);
    }
  } finally {
    await browser.close();
    await server.close();
  }
});

// Run explicitly after installing Chromium; ordinary unit tests need no browser.
test('真实 WebGL 宽屏裁剪、存档加载与暂停恢复', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 540 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const origin = server.resolvedUrls.local[0];
    await page.goto(origin);
    const save = await page.evaluate(async () => {
      const core = await import('/games/long-night-embers-h5/src/core/engine.ts');
      const storage = await import('/games/long-night-embers-h5/src/persistence/storage.ts');
      const profile = core.createInitialProfile();
      const run = core.createInitialRun(1, { seed: 42 }, profile);
      run.godMode = true;
      run.weapons = ['whip', 'fire_wand', 'magic_wand', 'knife', 'king_bible', 'phaser'].map(weaponId => ({ ...run.weapons[0], weaponId, cooldownRemaining: 9999 }));
      const stats = core.computeDerivedStats(run, profile);
      for (const weapon of run.weapons) core.fireWeaponOnce(run, weapon, stats);
      Object.values(run.projectiles).filter(p => p.vx || p.vy).forEach((p, i) => {
        p.x = p.prevX = 140 + i * 55;
        p.y = p.prevY = -80 + i * 35;
        p.ticksRemaining = 9999;
      });
      run.pickups.marker = { pickupId: 'marker', kind: 'xp_blue', x: 500, y: 0, value: 1, attracted: false, spawnMinute: 0 };
      return storage.saveSlotBundle(1, run, profile);
    });
    assert.equal(save.ok, true);
    await page.goto(origin + 'games/long-night-embers-h5/');
    await page.getByRole('button', { name: /直接出击当前角色|继续进度/ }).first().click();
    await page.getByRole('button', { name: '⏸ 暂停', exact: true }).click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.lne-app').getAttribute('data-running'), 'false');
    assert.equal(await page.locator('.lne-webgl-error').count(), 0);
    // Keep simulation paused while inspecting the battlefield beneath the pause menu.
    await page.addStyleTag({ content: '.lne-pause-overlay { visibility:hidden }' });
    await mkdir('reports', { recursive: true });
    await page.screenshot({ path: 'reports/long-night-embers-wide-fixed.png' });
    const box = await page.locator('canvas.lne-canvas').boundingBox();
    const size = await page.locator('canvas.lne-canvas').evaluate(c => ({ w: c.width, h: c.height }));
    const sx = box.x + (size.w / 2 + 500) / size.w * box.width;
    const sy = box.y + box.height / 2;
    const crop = await page.screenshot({ clip: { x: sx - 14, y: sy - 14, width: 28, height: 28 } });
    const bluePixels = await page.evaluate(async data => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 28;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, 28, 28).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 2] > 140 && pixels[i + 1] > 100 && pixels[i] < 100) count++;
      }
      return count;
    }, crop.toString('base64'));
    assert.ok(bluePixels > 10, `right-edge XP gem missing: ${bluePixels}`);
    await page.getByRole('button', { name: '▶ 战斗', exact: true }).click();
    const before = Number(await page.locator('.lne-app').getAttribute('data-tick'));
    await page.keyboard.down('d');
    await page.waitForTimeout(180);
    await page.keyboard.up('d');
    await page.getByRole('button', { name: '⏸ 暂停', exact: true }).click();
    assert.ok(Number(await page.locator('.lne-app').getAttribute('data-tick')) > before);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
