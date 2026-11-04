import assert from 'node:assert/strict';

export async function readState({frame}){
  return frame.locator('.forest-game').evaluate(el=>({running:el.dataset.running==='true',progress:Number(el.dataset.idleFrame)}));
}
export async function start(context){
  const {frame,page}=context;
  await click(frame,'收拾好，出发');
  await click(frame,'林间遭遇');
  await click(frame,'开始战斗');
  const before=await readState(context);assert.equal(before.running,true);
  await page.waitForTimeout(400);
  assert((await readState(context)).progress>before.progress,'Actual hero idle frames must advance before checking pause.');
}
export async function setManualPaused({frame},paused){
  if(paused){await click(frame,'菜单');await click(frame,'暂停');}
  else await click(frame,'继续远征');
}
async function click(frame,label){
  const canvas=frame.locator('canvas');
  const point=await canvas.evaluate((canvas,label)=>{
    const hit=globalThis.__backpackGame.getHits().find(h=>h.enabled&&h.label===label);
    if(!hit)throw Error('Missing Canvas control: '+label);
    const ratio=canvas.getBoundingClientRect().width/Math.max(320,Math.min(1120,innerWidth));
    return {x:(hit.x+hit.w/2)*ratio,y:(hit.y+hit.h/2)*ratio};
  },label);
  await canvas.click({position:point});
}
