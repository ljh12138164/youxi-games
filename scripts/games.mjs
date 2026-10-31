import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function discoverGames() {
  return readdirSync(resolve(projectRoot, 'games'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      slug: entry.name,
      root: resolve(projectRoot, 'games', entry.name),
      entry: resolve(projectRoot, 'games', entry.name, 'index.html'),
    }))
    .filter((game) => existsSync(game.entry))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
