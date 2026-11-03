import {mkdir,copyFile,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {SOUND_TONES} from '../src/audio.ts';

const folder=path.dirname(fileURLToPath(import.meta.url)),game=path.resolve(folder,'..'),root=path.resolve(game,'../..');
const out=path.join(root,'dist/douyin/backpack-expedition-h5');
await build({configFile:false,root:folder,publicDir:false,build:{outDir:out,emptyOutDir:true,target:'es2020',lib:{entry:path.join(folder,'game.ts'),name:'BackpackDouyin',formats:['iife'],fileName:()=> 'game.js'},minify:false}});
await mkdir(path.join(out,'assets'),{recursive:true});
for(const file of ['actors-pixel-v1.png','weapons-pixel-v1.png','equipment-pixel-v1.png','forest-pixel-v2.png'])await copyFile(path.join(game,'src/assets',file),path.join(out,'assets',file));
for(const [kind,frequency] of Object.entries(SOUND_TONES)){
  const samples=3748,buffer=Buffer.alloc(44+samples*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(22050,24);buffer.writeUInt32LE(44100,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  let phase=0;
  for(let i=0;i<samples;i++){const t=i/22050,progress=Math.min(1,t/.12),hz=frequency*Math.pow((kind==='reward'?880:110)/frequency,progress);phase+=hz/22050;const triangle=2/Math.PI*Math.asin(Math.sin(phase*Math.PI*2));buffer.writeInt16LE(Math.round(triangle*Math.pow(.001/.8,Math.min(1,t/.16))*.8*20000),44+i*2);}
  await writeFile(path.join(out,`assets/${kind}.wav`),buffer);
}
await writeFile(path.join(out,'game.json'),JSON.stringify({deviceOrientation:'portrait',showStatusBar:false},null,2)+'\n');
const appid=process.env.DOUYIN_APP_ID;
await writeFile(path.join(out,'project.config.json'),JSON.stringify({...(appid?{appid}:{}),projectname:'backpack-expedition',description:'背包远征，共享 Canvas 游戏入口',setting:{es6:true,urlCheck:true}},null,2)+'\n');
const code=await readFile(path.join(out,'game.js'),'utf8');if(/\b(document|window|localStorage)\b|react-dom|YouxiGame/.test(code))throw Error('小游戏产物包含浏览器运行时依赖');
console.log(JSON.stringify({output:out,appid:appid?'configured':'not configured',gameJsBytes:(await stat(path.join(out,'game.js'))).size,domFree:true}));
