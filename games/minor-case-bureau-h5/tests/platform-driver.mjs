import assert from 'node:assert/strict';

export async function readState({ frame }) {
  return frame.evaluate(() => {
    const s = globalThis.__minorBureau.getState();
    return {
      running: s.running,
      progress: { elapsed: s.elapsed, caseId: s.caseId, seed: s.seed },
    };
  });
}

export async function start({ frame, page }) {
  await frame.waitForFunction(() => globalThis.__minorBureau?.getState().ready === true);
  const started = await frame.evaluate(() => globalThis.__minorBureau.getState().started);
  if (!started) {
    await frame.getByRole('button', { name: '开始值班' }).click();
  }
  const before = await readState({ frame });
  assert.equal(before.running, true, 'Game must be running after starting shift');
  await page.waitForTimeout(260);
  const after = await readState({ frame });
  assert(after.progress.elapsed > before.progress.elapsed, 'Elapsed time must advance while running');
}

export async function setManualPaused({ frame }, paused) {
  const isManual = await frame.evaluate(() =>
    globalThis.__minorBureau.getState().paused.includes('manual'),
  );
  if (isManual === paused) return;
  if (paused) {
    await frame.locator('.system-bar').getByRole('button', { name: '暂停' }).click();
  } else {
    await frame.locator('.pause-overlay').getByRole('button', { name: '继续调查' }).click();
  }
}
