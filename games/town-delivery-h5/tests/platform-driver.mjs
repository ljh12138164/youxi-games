import assert from 'node:assert/strict';

export async function readState({ frame }) {
  return frame.evaluate(() => { const s = globalThis.__townGame.getState(); return { running: s.running, progress: s.elapsed }; });
}
async function clickControl(frame, label) {
  const hit = await frame.evaluate(label => globalThis.__townGame.getHits().find(hit => hit.label === label), label);
  assert(hit?.enabled, `Missing enabled Canvas control: ${label}`);
  await frame.locator('canvas').click({ position: { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 } });
}
export async function start({ frame, page }) {
  await frame.waitForFunction(() => globalThis.__townGame?.getHits().length);
  await clickControl(frame, '开始营业');
  const before = await readState({ frame }); await page.waitForTimeout(250);
  assert.equal(before.running, true); assert((await readState({ frame })).progress > before.progress);
}
export async function setManualPaused({ frame }, paused) {
  await clickControl(frame, paused ? '暂停规划' : '继续配送');
}
