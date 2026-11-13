export async function clickCanvas(frame, x, y) {
  const canvas = frame.locator('#canvas');
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box.width * x / 800, y: box.height * y / 600 } });
}

export async function openGameMenu(frame, page) {
  await frame.locator('canvas[data-ready="true"]').waitFor({ timeout: 45000 });
  await page.waitForTimeout(3600);
  await clickCanvas(frame, 400, 550);
  await frame.waitForFunction(() => window.greenhouseWatch.readState().scene === 1);
  await page.waitForTimeout(1100);
  await page.keyboard.type('Playtest', { delay: 90 });
  await page.waitForTimeout(140);
  await page.keyboard.press('Enter');
}

export async function start({ frame, page }) {
  await openGameMenu(frame, page);
  await frame.waitForFunction(() => window.Module.FS.analyzePath('/greenhouse-full-saves/userdata/users.dat').exists);
  await clickCanvas(frame, 550, 145);
  await frame.waitForFunction(() => window.greenhouseWatch.readState().scene === 3, undefined, { timeout: 45000 });
}

export function readState({ frame }) {
  return frame.evaluate(() => window.greenhouseWatch.readState());
}

export async function setManualPaused({ frame }, paused) {
  const button = frame.locator('#pause');
  if ((await button.getAttribute('aria-pressed')) !== String(paused)) await button.click();
}
