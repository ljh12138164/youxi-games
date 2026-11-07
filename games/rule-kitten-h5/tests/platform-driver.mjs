import assert from 'node:assert/strict';

export async function readState({ frame }) {
  return frame.evaluate(() => { const s = globalThis.__ruleKitten.getState(); return { running: s.running, progress: { elapsed: s.elapsed, board: s.board } }; });
}
export async function start({ frame, page }) {
  await frame.waitForFunction(() => globalThis.__ruleKitten?.getState().ready);
  const hit = await frame.evaluate(() => __ruleKitten.getHits().find(h => /开始解谜|继续解谜/.test(h.label)));
  const canvas = frame.locator('canvas'); await canvas.click({ position: { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 } });
  const before = await readState({ frame }); await page.waitForTimeout(200);
  assert(before.running); assert((await readState({ frame })).progress.elapsed > before.progress.elapsed);
}
export async function setManualPaused({ frame }, paused) {
  const state = await frame.evaluate(() => __ruleKitten.getState());
  if (state.paused.includes('manual') !== paused) await frame.locator('canvas').press('Escape');
}
