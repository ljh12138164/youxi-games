import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('角色、敌人和拾取物素材预览与透明边界', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
    await page.goto(server.resolvedUrls.local[0]);
    const result = await page.evaluate(async () => {
      const art = await import('/games/long-night-embers-h5/src/render/pixelArt.ts');
      const { prepareApprovedArt } = await import('/games/long-night-embers-h5/src/render/approvedArt.ts');
      await prepareApprovedArt();
      const data = await import('/games/long-night-embers-h5/src/content/ledger.ts');
      document.body.replaceChildren();
      document.body.style.cssText = 'margin:0;padding:28px;background:#101913;color:#efe4c9;font:14px system-ui';
      const signatures = {};
      const addSection = (title, entries) => {
        const heading = document.createElement('h2');
        heading.textContent = title;
        document.body.appendChild(heading);
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:8px';
        document.body.appendChild(grid);
        for (const [name, texture] of entries) {
          const source = texture.source.resource;
          const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
          const alpha = Array.from(pixels).filter((_, i) => i % 4 === 3);
          signatures[name] = { shape: alpha.join(','), image: source.toDataURL(), corner: pixels[3], visible: alpha.some(v => v > 0) };
          const cell = document.createElement('div');
          cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;background:#19251e';
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 88;
          canvas.style.imageRendering = 'pixelated';
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(source, (88 - source.width * 1.5) / 2, (88 - source.height * 1.5) / 2, source.width * 1.5, source.height * 1.5);
          const label = document.createElement('span');
          label.textContent = name;
          label.style.cssText = 'font-size:12px;text-align:center';
          cell.append(canvas, label);
          grid.appendChild(cell);
        }
      };
      addSection('永夜余烬 · 角色', data.CHARACTERS.filter(c => c.scope !== 'dlc_excluded').map(c => [c.nameZh, art.getCharacterTexture(c.id, 0)]));
      addSection('敌人与首领', data.ENEMIES.map(e => [e.nameZh, art.getEnemyTexture(e.id, e.color, e.isBoss, !!e.isReaper, 0)]));
      addSection('拾取物', ['xp_blue', 'xp_green', 'xp_red', 'coin', 'coin_bag', 'rich_bag', 'roast_chicken', 'vacuum', 'rosary', 'orologion', 'chest', 'nduja_fritta', 'little_heart'].map(k => [k, art.getPickupTexture(k)]));
      addSection('技能弹体', ['magic_wand', 'fire_wand', 'knife', 'runetracer', 'bone', 'clock_lancet', 'santa_javelin', 'glass_fandango'].map(id => {
        const w = data.WEAPON_MAP[id];
        return [w.nameZh, art.getProjectileTexture(id, w.behavior, w.color)];
      }));
      addSection('全部武器', data.WEAPONS.filter(w => w.scope !== 'dlc_excluded').map(w => [w.nameZh, art.getItemTexture(w.id)]));
      addSection('全部被动道具', data.PASSIVES.filter(w => w.scope !== 'dlc_excluded').map(w => [w.nameZh, art.getItemTexture(w.id)]));
      return signatures;
    });
    for (const [name, item] of Object.entries(result)) {
      assert.equal(item.corner, 0, `${name}: transparent corner`);
      assert.ok(item.visible, `${name}: visible pixels`);
    }
    await mkdir('reports', { recursive: true });
    await page.screenshot({ path: `reports/long-night-embers-assets-${process.env.ASSET_PREVIEW_VERSION || 'after'}.png`, fullPage: true });
  } finally {
    await browser?.close();
    await server.close();
  }
});

test('全部角色从存档进入真实战场，素材加载完成且可暂停', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const origin = server.resolvedUrls.local[0];
    await page.goto(origin);
    const characterIds = await page.evaluate(async () => {
      const { CHARACTERS, WEAPONS, PASSIVES } = await import('/games/long-night-embers-h5/src/content/ledger.ts');
      const { hasApprovedArt } = await import('/games/long-night-embers-h5/src/render/approvedArt.ts');
      const entries = [...CHARACTERS, ...WEAPONS, ...PASSIVES].filter(e => e.scope !== 'dlc_excluded');
      const missing = entries.filter(e => !hasApprovedArt(e.id));
      if (missing.length) throw Error('Missing art: ' + missing.map(e => e.id).join(', '));
      return CHARACTERS.filter(c => c.scope !== 'dlc_excluded').map(c => c.id);
    });
    assert.equal(characterIds.length, 17);
    for (const characterId of characterIds) {
      await page.goto(origin);
      await page.evaluate(async characterId => {
        const core = await import('/games/long-night-embers-h5/src/core/engine.ts');
        const storage = await import('/games/long-night-embers-h5/src/persistence/storage.ts');
        const profile = core.createInitialProfile();
        const run = core.createInitialRun(1, { seed: 42, characterId }, profile);
        await storage.saveSlotBundle(1, run, profile);
      }, characterId);
      await page.goto(origin + 'games/long-night-embers-h5/');
      await page.getByRole('button', { name: /直接出击当前角色|继续进度/ }).first().click();
      await page.waitForTimeout(180);
      await page.getByRole('button', { name: '⏸ 暂停', exact: true }).click();
      assert.equal(await page.locator('.lne-app').getAttribute('data-running'), 'false');
      assert.equal(await page.locator('.lne-webgl-error').count(), 0);
      await page.addStyleTag({ content: '.lne-pause-overlay { visibility:hidden }' });
      await page.screenshot({ path: `reports/approved-${characterId}.png` });
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
