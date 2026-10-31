import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('战斗素材完整覆盖、冻结着色、命中闪白与弹体朝向', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    await page.goto(server.resolvedUrls.local[0]);
    const result = await page.evaluate(async () => {
      const { prepareApprovedArt, hasApprovedArt } = await import('/games/long-night-embers-h5/src/render/approvedArt.ts');
      await prepareApprovedArt();
      const art = await import('/games/long-night-embers-h5/src/render/pixelArt.ts');
      const { ENEMIES, WEAPON_MAP } = await import('/games/long-night-embers-h5/src/content/ledger.ts');
      const pickups = ['xp_blue','xp_green','xp_red','coin','coin_bag','rich_bag','roast_chicken','vacuum','rosary','orologion','chest','nduja_fritta','little_heart'];
      const pickupNames = ['蓝色经验晶石','绿色经验晶石','红色经验晶石','金币','钱袋','大钱袋','烤鸡腿','吸铁器','念珠','怀表','宝箱','烤香肠','生命之心'];
      const shots = ['arcane','fire','knife','rune','bone','frost','ice_spear','javelin'];
      const keys = [...ENEMIES.map(e => 'enemy_' + e.id), ...pickups.map(p => 'pickup_' + p), ...shots.map(p => 'projectile_' + p)];
      const read = texture => {
        const c = texture.source.resource;
        return c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      };
      const e = ENEMIES.find(e => e.id === 'skeleton');
      const normal = read(art.getEnemyTexture(e.id,e.color,false,false,0));
      const frozen = read(art.getEnemyTexture(e.id,'#38bdf8',false,false,0));
      const flash = read(art.getEnemyTexture(e.id,e.color,false,false,0,true));
      let flashCorrect = true, tintChanged = 0;
      for(let i=0;i<normal.length;i+=4) {
        if(normal[i+3] !== flash[i+3] || normal[i+3] !== frozen[i+3]) flashCorrect=false;
        if(flash[i+3]>240 && (flash[i]<250 || flash[i+1]<250 || flash[i+2]<250)) flashCorrect=false;
        if(normal[i+3]>240 && (normal[i]!==frozen[i] || normal[i+1]!==frozen[i+1])) tintChanged++;
      }
      document.body.replaceChildren();
      document.body.style.cssText='margin:0;padding:24px;background:#101913;color:#efe4c9;font:14px system-ui';
      const section=(title,entries)=>{
        const heading=document.createElement('h2');heading.textContent=title;document.body.append(heading);
        const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(8,1fr);gap:8px';document.body.append(grid);
        for(const [label,tex] of entries){
          const cell=document.createElement('div');cell.style.cssText='display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:10px;background:#19251e';
          const c=document.createElement('canvas');c.width=c.height=88;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
          const image=tex.source.resource;ctx.drawImage(image,(88-image.width*1.5)/2,(88-image.height*1.5)/2,image.width*1.5,image.height*1.5);
          const name=document.createElement('span');name.textContent=label;cell.append(c,name);grid.append(cell);
        }
      };
      section('敌人与首领',ENEMIES.map(e=>[e.nameZh,art.getEnemyTexture(e.id,e.color,e.isBoss,!!e.isReaper,0)]));
      section('拾取物',pickups.map((id,i)=>[pickupNames[i],art.getPickupTexture(id)]));
      const shotEntries = ['magic_wand','fire_wand','knife','runetracer','bone','clock_lancet','santa_javelin','glass_fandango'].map(id=>{
        const w=WEAPON_MAP[id];return [w.nameZh,art.getProjectileTexture(id,w.behavior,w.color)];
      });
      const horizontal = shotEntries.every(([,texture])=>{
        const p=read(texture);let left=48,right=0,top=48,bottom=0;
        for(let y=0;y<48;y++)for(let x=0;x<48;x++)if(p[(y*48+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        return right-left>(bottom-top)*1.5 && p[3]===0;
      });
      section('技能弹体',shotEntries);
      return { missing:keys.filter(k=>!hasApprovedArt(k)),flashCorrect,tintChanged,horizontal };
    });
    assert.deepEqual(result.missing,[]);
    assert.equal(result.flashCorrect,true);
    assert.ok(result.tintChanged>20);
    assert.equal(result.horizontal,true);
    await mkdir('reports',{recursive:true});
    await page.screenshot({path:'reports/battle-art-v3.png',fullPage:true});
    // Exercise the generated enemies and drops in the real Pixi scene, not just a contact sheet.
    await page.goto(server.resolvedUrls.local[0]);
    await page.evaluate(async()=>{
      const core=await import('/games/long-night-embers-h5/src/core/engine.ts');
      const { ENEMIES }=await import('/games/long-night-embers-h5/src/content/ledger.ts');
      const storage=await import('/games/long-night-embers-h5/src/persistence/storage.ts');
      const profile=core.createInitialProfile();
      const run=core.createInitialRun(1,{seed:42},profile);run.godMode=true;run.pickups={};
      run.weapons.forEach(w=>w.cooldownRemaining=9999);
      const stats=core.computeDerivedStats(run,profile);
      ENEMIES.forEach((e,i)=>{
        core.spawnEnemyInstance(run,stats,e.id,(i%8-3.5)*78,i<8?-110:110);
        const en=Object.values(run.enemies).at(-1);en.moveSpeed=0;en.vx=en.vy=0;
      });
      ['xp_blue','xp_green','xp_red','coin','coin_bag','rich_bag','roast_chicken','vacuum','rosary','orologion','chest','nduja_fritta','little_heart'].forEach((kind,i)=>{
        const id='preview_'+i;run.pickups[id]={pickupId:id,kind,x:(i-6)*44,y:195,value:1,attracted:false,spawnMinute:0};
      });
      await storage.saveSlotBundle(1,run,profile);
    });
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.resolvedUrls.local[0]+'games/long-night-embers-h5/');
    await page.getByRole('button',{name:/直接出击当前角色|继续进度/}).first().click();
    await page.waitForTimeout(180);
    await page.getByRole('button',{name:'⏸ 暂停',exact:true}).click();
    await page.addStyleTag({content:'.lne-pause-overlay {visibility:hidden}'});
    await page.screenshot({path:'reports/battle-art-v3-in-game.png'});
    assert.equal(await page.locator('.lne-webgl-error').count(),0);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await server.close();}
});
