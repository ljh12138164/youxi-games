import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { TONES } from '../src/audio.ts';

const folder = path.dirname(fileURLToPath(import.meta.url)), out = path.resolve(folder, '../../../dist/douyin/rule-kitten-h5');
await build({ configFile: false, root: folder, publicDir: false, build: {
  outDir: out, emptyOutDir: true, target: 'es2020',
  lib: { entry: path.join(folder, 'game.ts'), name: 'RuleKitten', formats: ['iife'], fileName: () => 'game.js' },
} });
await mkdir(path.join(out, 'assets'), { recursive: true });
await copyFile(path.resolve(folder, '../src/assets/atlas-paper-v1.png'), path.join(out, 'assets/atlas-paper-v1.png'));
for (const [kind, frequency] of Object.entries(TONES)) {
  const samples = 3528, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(22050, 24); buffer.writeUInt32LE(44100, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * i / 22050) * Math.exp(-i / 650) * 6000), 44 + i * 2);
  await writeFile(path.join(out, `assets/${kind}.wav`), buffer);
}
await writeFile(path.join(out, 'game.json'), JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false }, null, 2) + '\n');
const appid = process.env.RULE_KITTEN_DOUYIN_APP_ID;
await writeFile(path.join(out, 'project.config.json'), JSON.stringify({ ...(appid ? { appid } : {}), projectname: 'rule-kitten', description: '文字世界：橘白小猫规则解谜', setting: { es6: true, urlCheck: true } }, null, 2) + '\n');
const code = await readFile(path.join(out, 'game.js'), 'utf8');
if (/\b(document|window|localStorage)\b|react-dom|YouxiGame/.test(code)) throw Error('小游戏产物包含浏览器运行时依赖');
console.log(JSON.stringify({ output: out, appid: appid ? 'configured' : 'not configured', bytes: (await stat(path.join(out, 'game.js'))).size, domFree: true }));
