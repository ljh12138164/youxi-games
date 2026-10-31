import { resolve } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { discoverGames, projectRoot } from './games.mjs';
import { thirdPartyNoticesPlugin } from './third-party-notices.mjs';

const [slug] = process.argv.slice(2).filter((arg) => arg !== '--');
const games = discoverGames();
const game = games.find((entry) => entry.slug === slug);

if (!game) {
  console.error(`用法：pnpm run build:game -- <slug>\n可用入口：${games.map((entry) => entry.slug).join(', ')}`);
  process.exit(1);
}

await build({
  configFile: false,
  root: game.root,
  base: './',
  publicDir: false,
  plugins: [react(), viteSingleFile(), thirdPartyNoticesPlugin(projectRoot)],
  resolve: {
    alias: { '@shared': resolve(projectRoot, 'shared') },
  },
  build: {
    outDir: resolve(projectRoot, 'dist/games', game.slug),
    emptyOutDir: true,
  },
});
