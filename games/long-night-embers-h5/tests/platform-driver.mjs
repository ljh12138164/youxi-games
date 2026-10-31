import assert from 'node:assert/strict';

// 标题页（首页）上“直接出击当前角色 / 继续进度”才会解除菜单暂停并进入战斗。
const HOME_QUICK_START = /直接出击当前角色|继续进度/;

async function dismissAnyChoice(frame) {
  const choice = frame.locator('.lne-levelup-option').first();
  if (await choice.count().catch(() => 0)) {
    if (await choice.isVisible().catch(() => false)) {
      await choice.evaluate((el) => el.click()).catch(() => {});
    }
  }
}

export async function readState({ frame }) {
  await dismissAnyChoice(frame);
  return frame.locator('.lne-app').evaluate((element) => ({
    running: element.dataset.running === 'true',
    progress: Number(element.dataset.tick),
  }));
}

export async function start(context) {
  const { frame, page } = context;

  const quickStart = frame.getByRole('button', { name: HOME_QUICK_START });
  if (await quickStart.count()) {
    await quickStart.first().click();
  }

  const before = await readState(context);
  assert.equal(before.running, true);
  assert(Number.isFinite(before.progress));
  await page.waitForTimeout(250);
  assert(
    (await readState(context)).progress > before.progress,
    'Real simulation must advance before pause checks',
  );
}

export async function setManualPaused({ frame }, paused) {
  await dismissAnyChoice(frame);
  const targetLabel = paused ? '⏸ 暂停' : '▶ 战斗';
  await frame.getByRole('button', { name: targetLabel, exact: true }).click();
}
