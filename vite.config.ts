import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { discoverGames, projectRoot } from './scripts/games.mjs';
import { thirdPartyNoticesPlugin } from './scripts/third-party-notices.mjs';

export default defineConfig({
  root: projectRoot,
  base: './',
  appType: 'mpa',
  publicDir: false,
  plugins: [react(), thirdPartyNoticesPlugin(projectRoot)],
  resolve: {
    alias: { '@shared': resolve(projectRoot, 'shared') },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    outDir: resolve(projectRoot, 'dist/site'),
    emptyOutDir: true,
    rolldownOptions: {
      input: [resolve(projectRoot, 'index.html'), ...discoverGames().map((game) => game.entry)],
    },
  },
});
