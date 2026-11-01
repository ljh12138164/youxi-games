import assert from 'node:assert/strict';

export async function readState({frame}){
  return frame.locator('.forest-game').evaluate(el=>({running:el.dataset.running==='true',progress:Number(el.dataset.idleFrame)}));
}
export async function start(context){
  const {frame,page}=context;
  await frame.getByRole('button',{name:'收拾好，出发',exact:true}).click();
  await frame.getByRole('button',{name:/林间遭遇/}).first().click();
  await frame.getByRole('button',{name:/开始战斗/}).click();
  const before=await readState(context);assert.equal(before.running,true);
  await page.waitForTimeout(400);
  assert((await readState(context)).progress>before.progress,'Actual hero idle frames must advance before checking pause.');
}
export async function setManualPaused({frame},paused){
  await frame.getByRole('button',{name:paused?'暂停':'继续远征',exact:true}).click();
}
