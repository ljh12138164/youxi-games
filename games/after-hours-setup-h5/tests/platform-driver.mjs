import assert from 'node:assert/strict';

export function readState({ frame }) {
  return frame.locator('.game-root').evaluate(el => ({
    running: el.dataset.running === 'true',
    progress: {
      cleared: Number(el.dataset.clearedCount ?? 0),
      balance: el.dataset.balance ?? '',
    },
  }));
}

export async function start(context) {
  const { frame } = context;
  await frame.getByText('Outhook Express').waitFor();
  await frame.locator('.mail-tree-item', { hasText: '先拿着这点咖啡钱顶一顶' }).click();
  await frame.getByRole('button', { name: /\$12\.00/ }).click();
  await frame.locator('[data-testid="balance"]').getByText('$12.21').waitFor();
  assert.equal((await readState(context)).running, true);
}

export async function setManualPaused({ frame }, paused) {
  const isPaused = (await frame.locator('.game-root').getAttribute('data-manual-paused')) === 'true';
  if (isPaused === paused) return;
  if (paused) {
    await frame.getByRole('button', { name: '暂停', exact: true }).click();
  } else {
    await frame.getByRole('button', { name: '继续值班', exact: true }).click();
  }
}
