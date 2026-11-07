import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const folder = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(folder, '../../../dist/douyin/town-delivery-h5');
await build({ configFile: false, root: folder, publicDir: false, build: {
  outDir: out, emptyOutDir: true, target: 'es2020',
  lib: { entry: path.join(folder, 'game.ts'), name: 'TownDelivery', formats: ['iife'], fileName: () => 'game.js' },
} });
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'game.json'), JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false }, null, 2) + '\n');
const appid = process.env.TOWN_DELIVERY_DOUYIN_APP_ID;
await writeFile(path.join(out, 'project.config.json'), JSON.stringify({
  ...(appid ? { appid } : {}), projectname: 'town-delivery', description: '小镇配送员 Canvas MVP', setting: { es6: true, urlCheck: true },
}, null, 2) + '\n');
const code = await readFile(path.join(out, 'game.js'), 'utf8');
if (/\b(document|window|localStorage)\b|react-dom|YouxiGame/.test(code)) throw Error('小游戏产物包含浏览器运行时依赖');
console.log(JSON.stringify({ output: out, appid: appid ? 'configured' : 'not configured', gameJsBytes: (await stat(path.join(out, 'game.js'))).size, domFree: true }));
