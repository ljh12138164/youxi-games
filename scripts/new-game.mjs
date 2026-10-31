import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from './games.mjs';

const [slug, title = slug] = process.argv.slice(2).filter((arg) => arg !== '--');

if (!slug || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('用法：pnpm run new:game -- <小写英文标识> "游戏名称"');
  process.exit(1);
}

const destination = resolve(projectRoot, 'games', slug);
if (existsSync(destination)) {
  console.error(`入口已存在，不会覆盖：${slug}`);
  process.exit(1);
}

cpSync(resolve(projectRoot, 'templates/game'), destination, { recursive: true });
writeFileSync(resolve(destination, 'game.json'), `${JSON.stringify({ title, description: '项目入口已就绪，尚未实现游戏玩法。' }, null, 2)}\n`);

const htmlPath = resolve(destination, 'index.html');
const escapedTitle = title.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('<title>游戏入口</title>', `<title>${escapedTitle}</title>`));

console.log(`已创建 games/${slug}/，开发地址：/games/${slug}/\n若开发服务正在运行，请重启以更新构建入口和目录。`);
