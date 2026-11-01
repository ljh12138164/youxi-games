import assert from 'node:assert/strict';

export async function readState({ frame }) {
  return frame.locator('.sl-app').evaluate(element => ({
    running: element.dataset.running === 'true',
    progress: Number(element.dataset.tick),
  }));
}

export async function start(context) {
  const { frame, page } = context;
  const home=frame.getByRole('button',{name:/^(进入牌桌|继续游戏)$/});
  if(await home.count())await home.click();
  await frame.getByRole('button', { name: '▶ 1x', exact: true }).click();
  const before = await readState(context);
  assert.equal(before.running, true);
  assert(Number.isFinite(before.progress));
  await page.waitForTimeout(250);
  assert((await readState(context)).progress > before.progress, 'Real simulation must advance before pause checks');
}

export async function setManualPaused({ frame }, paused) {
  await frame.getByRole('button', { name: paused ? '⏸ 暂停' : '▶ 1x', exact: true }).click();
}
