#!/usr/bin/env node
// Local checks authored from Scalia protocol v1. Not an official Scalia tool.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, lstat, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: {
  help: { type: 'boolean' }, dir: { type: 'string' }, entry: { type: 'string', default: 'index.html' },
  report: { type: 'string' }, 'playwright-module': { type: 'string' },
  'browser-executable': { type: 'string' }, channel: { type: 'string' },
  driver: { type: 'string' }, 'start-selector': { type: 'string' },
  timeout: { type: 'string', default: '10000' }, 'boss-running': { type: 'string', default: 'paused' },
  'sidebar-running': { type: 'string', default: 'paused' },
} });
if (args.help) {
  console.log(`Local Scalia protocol v1 self-test (not an official tool)
node platform-selftest.mjs --dir <built-game-directory> [--entry index.html]
  --report <json-path>          Default: timestamped JSON in current directory
  --playwright-module <path>    Optional installed playwright/core module entry
  --browser-executable <path>   Optional installed Chromium/Chrome/Edge binary
  --channel <name>              Alternative Playwright browser channel, e.g. msedge
  --driver <module.mjs>         Optional game-specific start/readState/setManualPaused
  --start-selector <selector>   Optional click to enter playable scene
  --timeout <milliseconds>      Default 10000
  --boss-running paused|running Match the game's documented boss behavior
  --sidebar-running paused|running Match documented sidebar simulation behavior
Exit: 0 automated checks passed; 1 failed/setup error; 2 blocked automated checks.
Exit 0 does not certify manual checks or production shell. All browser requests
are intercepted locally in a fresh context; no upload/login/publish is performed.`);
  process.exit(0);
}

const checks = [];
const reportPath = path.resolve(args.report ?? `scalia-selftest-${Date.now()}.json`);
let mayWriteReport = true;
const report = {
  tool: 'scalia-game-workflow/local-platform-selftest', toolVersion: '1.0.1',
  official: false, specification: 'https://scalia.ltd/docs/game-integration',
  specificationReadDate: '2026-10-31', executedAt: new Date().toISOString(),
  environment: 'isolated browser with locally intercepted HTTPS origins; not production',
  command: [process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
  workingDirectory: process.cwd(), checks,
  manualChecks: [
    { id: 'ready-means-actually-playable', status: 'not-run' },
    { id: 'identity-display-and-save-preserved', status: 'not-run' },
    { id: 'actual-audio-existing-and-new-sources-user-volume', status: 'not-run' },
    { id: 'real-shell-shortcuts-focus-fullscreen-pointer-lock', status: 'not-run' },
    { id: 'production-origin-recent-play-and-updated-save', status: 'not-run' },
    { id: 'normal-play-save-performance-and-declared-devices', status: 'not-run' },
  ],
};
const check = async (id, fn) => {
  const started = Date.now();
  try { await fn(); checks.push({ id, status: 'passed', durationMs: Date.now() - started }); }
  catch (error) { checks.push({ id, status: 'failed', detail: String(error.message), durationMs: Date.now() - started }); }
};
const blocked = (id, reason) => checks.push({ id, status: 'blocked', detail: reason });
let browser;
try {
  assert(args.dir, '--dir is required');
  const timeout = Number(args.timeout);
  assert(Number.isFinite(timeout) && timeout > 0, '--timeout must be positive');
  assert(['paused', 'running'].includes(args['boss-running']), 'Invalid --boss-running');
  assert(['paused', 'running'].includes(args['sidebar-running']), 'Invalid --sidebar-running');
  const root = await realpath(path.resolve(args.dir));
  const reportRelative = path.relative(root, reportPath);
  if (reportRelative === '' || (!reportRelative.startsWith(`..${path.sep}`) && reportRelative !== '..' && !path.isAbsolute(reportRelative))) {
    mayWriteReport = false;
    throw new Error('--report must be outside the game release directory; no file was written');
  }
  const entry = args.entry.replaceAll('\\', '/');
  assert(!path.isAbsolute(entry) && !entry.split('/').some(p => p === '..' || p === ''), 'Entry must be a relative file path');
  const files = new Map();
  const walk = async (directory) => {
    for (const item of (await readdir(directory)).sort()) {
      const absolute = path.join(directory, item);
      const info = await lstat(absolute);
      assert(!info.isSymbolicLink(), 'Release package contains a symlink');
      if (info.isDirectory()) await walk(absolute);
      else {
        assert(info.isFile(), 'Release package contains a non-file entry');
        const name = path.relative(root, absolute).split(path.sep).join('/');
        files.set(name, { size: info.size, absolute });
      }
    }
  };
  await walk(root);
  assert(files.has(entry), 'Entry does not exist inside release directory');
  report.artifact = { directory: root, entry, fileCount: files.size,
    totalBytes: [...files.values()].reduce((n, f) => n + f.size, 0) };
  report.toolSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
  await check('static-package-limits', async () => {
    assert(files.size <= 10000, 'Too many files');
    assert(report.artifact.totalBytes <= 500 * 1024 ** 2, 'Expanded package exceeds 500 MiB');
    assert([...files.values()].every(f => f.size <= 64 * 1024 ** 2), 'File exceeds 64 MiB');
    assert(![...files.keys()].some(n => /(^|\/)(\.env($|\.)|[^/]+\.(pem|key)$)/i.test(n)), 'Possible private configuration/key in release');
  });
  assert(checks.at(-1).status === 'passed', 'Static release preflight failed; browser checks not run');
  const hash = createHash('sha256');
  for (const [name, info] of files) {
    hash.update(name).update('\0').update(String(info.size)).update('\0');
    info.body = await readFile(info.absolute);
    hash.update(info.body);
  }
  report.artifact.sha256 = hash.digest('hex');

  const require = createRequire(path.join(process.cwd(), 'package.json'));
  let playwright;
  if (args['playwright-module']) playwright = await import(pathToFileURL(path.resolve(args['playwright-module'])).href);
  else {
    for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
      try { playwright = require(name); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
    }
  }
  assert(playwright?.chromium, 'Install/use an existing Playwright tool, or supply --playwright-module; no dependencies were installed automatically');
  const driver = args.driver ? await import(pathToFileURL(path.resolve(args.driver)).href) : {};
  browser = await playwright.chromium.launch({ headless: true,
    ...(args.channel ? { channel: args.channel } : {}),
    ...(args['browser-executable'] ? { executablePath: path.resolve(args['browser-executable']) } : {}),
  });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(timeout);
  const platformOrigin = 'https://scalia.ltd';
  const gameOrigin = 'https://game.scalia-selftest.invalid';
  const gameUrl = `${gameOrigin}/v/local/${entry.split('/').map(encodeURIComponent).join('/')}`;
  const hostUrl = `${platformOrigin}/__local_game_selftest__`;
  const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
  const host = `<!doctype html><meta charset="utf-8"><title>Local Scalia test host</title><script>
  const gameOrigin=${json(gameOrigin)}, instance=crypto.randomUUID();
  const messages=[]; let loads=0;
  const preferences={shortcuts:{sidebar:{code:'KeyM',shift:false},enter:{code:'KeyQ',shift:false},exit:{code:'KeyQ',shift:true}}};
  const iframe=document.createElement('iframe'); iframe.style='width:1200px;height:680px';
  const send=(type,payload,overrides={})=>{
    const message={protocol_version:1,instance_id:instance,request_id:crypto.randomUUID(),type,payload,...overrides};
    iframe.contentWindow.postMessage(message,gameOrigin); return message;
  };
  window.__scaliaSelftest={messages,send,preferences,get loads(){return loads;}};
  window.addEventListener('message',event=>{
    if(event.source!==iframe.contentWindow||event.origin!==gameOrigin)return;
    const m=event.data;if(!m||m.protocol_version!==1)return;
    const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    try{if(new TextEncoder().encode(JSON.stringify(m)).length>4096)return;}catch{return;}
    if(m.type!=='game.hello'&&(m.instance_id!==instance||!uuid(m.request_id)))return;
    messages.push(m);
    if(m.type==='game.hello')send('platform.init',{identity:{guest:true,user:null},state:{sidebar:false,boss:false},preferences});
  });
  iframe.addEventListener('load',()=>loads++);
  window.addEventListener('DOMContentLoaded',()=>{iframe.src=${json(gameUrl)};document.body.appendChild(iframe);});
  </script>`;
  const problems = [];
  assert(typeof context.routeWebSocket === 'function', 'A Playwright version with routeWebSocket is required for network isolation');
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    problems.push({ type: 'blocked-websocket', url: `${url.origin}${url.pathname}` });
    socket.close({ code: 1008, reason: 'Local self-test blocks external sockets' });
  });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === hostUrl) return route.fulfill({ status: 200, contentType: 'text/html', body: host });
    if (url.origin === gameOrigin && url.pathname.startsWith('/v/local/')) {
      let name;
      try { name = decodeURIComponent(url.pathname.slice('/v/local/'.length)); } catch { name = ''; }
      const file = files.get(name);
      if (file) return route.fulfill({ status: 200, contentType: mime[path.extname(name).toLowerCase()] ?? 'application/octet-stream', body: file.body });
    }
    problems.push({ type: 'blocked-or-missing-resource', url: `${url.origin}${url.pathname}` });
    await route.abort('blockedbyclient');
  });
  const watch = page => page.on('pageerror', error => problems.push({ type: 'pageerror', message: error.message }));
  await check('standalone-top-level-startup', async () => {
    const standalone = await context.newPage(); watch(standalone);
    try { await standalone.goto(gameUrl); await standalone.waitForTimeout(250); }
    finally { await standalone.close(); }
  });
  const page = await context.newPage(); watch(page);
  await page.goto(hostUrl);
  const count = type => page.evaluate(type => window.__scaliaSelftest.messages.filter(m => m.type === type).length, type);
  const waitMessage = (type, number) => page.waitForFunction(({ type, number }) =>
    window.__scaliaSelftest.messages.filter(m => m.type === type).length >= number, { type, number }, { timeout });
  const send = (type, payload, overrides = {}) => page.evaluate(({ type, payload, overrides }) =>
    window.__scaliaSelftest.send(type, payload, overrides), { type, payload, overrides });
  await check('protocol-handshake', () => waitMessage('game.hello', 1));
  const frame = page.frames().find(f => f.url() === gameUrl);
  assert(frame, 'Game iframe did not load');
  const driverContext = { page, frame };
  if (driver.start) await check('game-driver-start', () => driver.start(driverContext));
  else if (args['start-selector']) await check('game-start-selection', () => frame.locator(args['start-selector']).click());
  await check('protocol-ready-received', () => waitMessage('game.ready', 1));
  const baselineLoads = await page.evaluate(() => window.__scaliaSelftest.loads);
  const noReload = async () => {
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__scaliaSelftest.loads), baselineLoads, 'Game iframe reloaded');
  };
  await check('identity-change-no-reload', async () => {
    await send('identity.changed', { guest: false, user: { id: randomUUID(), nickname: '游隙自测玩家', revision: 1 } });
    await noReload();
    await send('identity.changed', { guest: true, user: null });
    await noReload();
  });
  await check('sidebar-no-reload', async () => {
    await send('sidebar.changed', { sidebar: true, boss: false }); await noReload();
    await send('sidebar.changed', { sidebar: false, boss: false }); await noReload();
  });
  await check('boss-enter-ack', async () => {
    const before = await count('boss.ack');
    await send('boss.enter', { sidebar: false, boss: true });
    await waitMessage('boss.ack', before + 1);
    const ack = await page.evaluate(() => window.__scaliaSelftest.messages.filter(m => m.type === 'boss.ack').at(-1));
    assert.equal(ack.payload.muted, true, 'Adapter did not acknowledge synchronous mute');
    assert.equal(ack.payload.running, args['boss-running'], 'Unexpected running-state acknowledgment');
  });
  await check('boss-exit-ack', async () => {
    const before = await count('boss.ack');
    await send('boss.exit', { sidebar: false, boss: false }); await waitMessage('boss.ack', before + 1);
    const ack = await page.evaluate(() => window.__scaliaSelftest.messages.filter(m => m.type === 'boss.ack').at(-1));
    assert.equal(ack.payload.muted, false);
  });
  await check('duplicate-request-ignored', async () => {
    const before = await count('boss.ack');
    const message = await send('boss.exit', { sidebar: false, boss: false });
    await waitMessage('boss.ack', before + 1);
    await send(message.type, message.payload, message);
    await page.waitForTimeout(200); assert.equal(await count('boss.ack'), before + 1);
  });
  await check('wrong-instance-no-ack', async () => {
    const before = await count('boss.ack');
    await send('boss.enter', { sidebar: false, boss: true }, { instance_id: randomUUID() });
    await page.waitForTimeout(200); assert.equal(await count('boss.ack'), before);
  });
  await check('non-parent-self-origin-no-ack', async () => {
    const before = await count('boss.ack');
    const message = await send('boss.exit', { sidebar: false, boss: false });
    await waitMessage('boss.ack', before + 1);
    await frame.evaluate(message => window.postMessage({ ...message, request_id: crypto.randomUUID(), type: 'boss.enter', payload: { sidebar: false, boss: true } }, location.origin), message);
    await page.waitForTimeout(200); assert.equal(await count('boss.ack'), before + 1);
  });
  await check('shortcut-and-updated-preferences-forwarding', async () => {
    // body is not focusable by default; keyboard input otherwise stays in the host.
    await frame.locator('body').evaluate(body => {
      if (!body.hasAttribute('tabindex')) body.tabIndex = -1;
      body.focus();
    });
    let before = await count('shortcut.triggered');
    await frame.locator('body').press('Alt+m'); await waitMessage('shortcut.triggered', before + 1);
    const preferences = await page.evaluate(() => window.__scaliaSelftest.preferences);
    preferences.shortcuts.sidebar.code = 'KeyN';
    await send('preferences.changed', preferences); await page.waitForTimeout(100);
    before = await count('shortcut.triggered');
    await frame.locator('body').press('Alt+m'); await page.waitForTimeout(150);
    assert.equal(await count('shortcut.triggered'), before, 'Old shortcut remained active');
    await frame.locator('body').press('Alt+n'); await waitMessage('shortcut.triggered', before + 1);
    const last = await page.evaluate(() => window.__scaliaSelftest.messages.filter(m => m.type === 'shortcut.triggered').at(-1));
    assert.equal(last.payload.action, 'sidebar');
  });
  if (driver.readState) {
    const simulationPolicy = async (panel, expected) => {
      const initial = await driver.readState(driverContext); assert.equal(initial.running, true, 'Driver must enter a running scene');
      const enterType = panel === 'boss' ? 'boss.enter' : 'sidebar.changed';
      const exitType = panel === 'boss' ? 'boss.exit' : 'sidebar.changed';
      try {
        await send(enterType, { sidebar: panel === 'sidebar', boss: panel === 'boss' }); await page.waitForTimeout(100);
        const a = await driver.readState(driverContext);
        assert.equal(a.running, expected === 'running');
        assert.notEqual(a.progress, undefined, 'readState must expose real progress');
        if (expected === 'paused') {
          const progress = structuredClone(a.progress);
          await page.waitForTimeout(250);
          assert.deepEqual((await driver.readState(driverContext)).progress, progress, `Simulation progressed under ${panel}`);
        }
      } finally { await send(exitType, { sidebar: false, boss: false }); }
      await page.waitForTimeout(100);
      assert.equal((await driver.readState(driverContext)).running, true);
    };
    await check('actual-sidebar-simulation-policy', () => simulationPolicy('sidebar', args['sidebar-running']));
    await check('actual-boss-simulation-policy', () => simulationPolicy('boss', args['boss-running']));
  } else {
    blocked('actual-sidebar-simulation-policy', 'Provide a game driver readState returning real running and progress');
    blocked('actual-boss-simulation-policy', 'Provide a game driver readState returning real running and progress');
  }
  if (driver.readState && driver.setManualPaused) {
    await check('actual-manual-pause-preserved', async () => {
      try {
        await driver.setManualPaused(driverContext, true);
        const paused = await driver.readState(driverContext);
        assert.equal(paused.running, false, 'Manual pause did not stop simulation');
        assert.notEqual(paused.progress, undefined, 'readState must expose real progress');
        const progress = structuredClone(paused.progress);
        await send('boss.enter', { sidebar: false, boss: true }); await page.waitForTimeout(100);
        await send('boss.exit', { sidebar: false, boss: false }); await page.waitForTimeout(100);
        const after = await driver.readState(driverContext);
        assert.equal(after.running, false, 'Platform recovery cleared manual pause');
        assert.deepEqual(after.progress, progress, 'Simulation progressed despite manual pause');
      } finally { await driver.setManualPaused(driverContext, false); }
    });
  } else blocked('actual-manual-pause-preserved', 'Provide readState and setManualPaused game-driver functions');
  await check('resource-and-runtime-errors', async () => { assert.deepEqual(problems, [], 'Missing/external resources or browser runtime errors'); });
  report.browserProblems = problems;
  report.messages = await page.evaluate(() => window.__scaliaSelftest.messages.map(m => ({ type: m.type, payload: m.type === 'boss.ack' || m.type === 'shortcut.triggered' ? m.payload : undefined })));
} catch (error) {
  checks.push({ id: 'setup-or-runner', status: 'failed', detail: String(error.message) });
} finally {
  await browser?.close();
  report.summary = Object.fromEntries(['passed', 'failed', 'blocked'].map(status => [status, checks.filter(c => c.status === status).length]));
  report.automatedStatus = report.summary.failed ? 'failed' : report.summary.blocked ? 'blocked' : 'passed';
  report.overall = report.summary.failed ? 'failed' : 'incomplete';
  if (mayWriteReport) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ report: mayWriteReport ? reportPath : null, automatedStatus: report.automatedStatus, overall: report.overall, ...report.summary }));
  process.exitCode = report.summary.failed ? 1 : report.summary.blocked ? 2 : 0;
}
