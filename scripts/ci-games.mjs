import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { discoverGames, projectRoot } from './games.mjs';

// Local artifact checks only. This script has no platform credentials or write API.
let failed = false;
for (const game of discoverGames()) {
  const build = spawnSync(process.execPath, ['scripts/build-game.mjs', game.slug], {
    cwd: projectRoot, stdio: 'inherit',
  });
  if (build.status !== 0) {
    failed = true;
    continue;
  }
  const driver = resolve(game.root, 'tests/platform-driver.mjs');
  const test = spawnSync(process.execPath, [
    'scripts/platform-selftest.mjs',
    '--dir', resolve(projectRoot, 'dist/games', game.slug),
    '--report', resolve(projectRoot, 'reports', game.slug, 'platform.json'),
    ...(existsSync(driver) ? ['--driver', driver] : []),
  ], { cwd: projectRoot, stdio: 'inherit' });
  if (test.status === 2) {
    console.warn(`::warning::${game.slug}: actual-state checks are blocked; see report. This package is not approved for release.`);
  } else if (test.status !== 0) {
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
