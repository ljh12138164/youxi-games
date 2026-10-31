import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { releaseGames } from '../scalia-release.mjs';

const metadata = { title: 'Test game', summary: 'A game', description: '', instructions: 'Move with arrows.',
  devices: ['desktop'], categories: [], coverId: null };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'scalia-release-test-'));
  t.after(() => {
    if (!root.startsWith(join(tmpdir(), 'scalia-release-test-'))) throw new Error('Unexpected test cleanup path');
    rmSync(root, { recursive: true, force: true });
  });
  const statePath = join(root, 'state', 'bindings.json');
  const registry = {};
  const games = new Map(), versions = new Map(), sessions = new Map(), candidates = new Map(), creates = new Map();
  const calls = [];
  let loseCreate = false, failPublish = false, attempt = 0;
  const addPackage = (slug, body = '<html>new</html>', blocked = 0) => {
    const bytes = Buffer.from(body);
    const directory = join(root, 'dist', 'games', slug);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'index.html'), bytes);
    const digest = createHash('sha256').update('index.html').update('\0').update(String(bytes.length)).update('\0').update(bytes).digest('hex');
    mkdirSync(join(root, 'reports', slug), { recursive: true });
    writeFileSync(join(root, 'reports', slug, 'platform.json'), JSON.stringify({ automatedStatus: blocked ? 'blocked' : 'passed',
      summary: { failed: 0, blocked }, artifact: { sha256: digest, entry: 'index.html' } }));
  };
  const seed = (slug, body = '<html>old</html>') => {
    const id = randomUUID(), version = randomUUID();
    games.set(id, { id, slug, availability: 'enabled', stateRevision: 1, currentVersionId: version,
      draft: { revision: 1, snapshot: structuredClone(metadata) }, versions: [{ id: version, snapshot: structuredClone(metadata) }] });
    versions.set(version, new Map([['index.html', Buffer.from(body)]]));
    return id;
  };
  const api = async (action, input, key) => {
    calls.push({ action, input: structuredClone(input), key });
    if (action === 'list_games') return [...games.values()].map(game => ({ id: game.id, slug: game.slug }));
    if (action === 'create_game') {
      if (creates.has(key)) {
        assert.deepEqual(creates.get(key).input, input);
        return creates.get(key).output;
      }
      assert(![...games.values()].some(game => game.slug === input.slug), 'server rejects duplicate slug');
      const id = randomUUID();
      games.set(id, { id, slug: input.slug, availability: 'disabled', stateRevision: 0, currentVersionId: null,
        draft: { revision: 0, snapshot: structuredClone(input.snapshot) }, versions: [] });
      const output = { gameId: id };
      creates.set(key, { input: structuredClone(input), output });
      if (loseCreate) { loseCreate = false; throw new Error('Create response lost'); }
      return output;
    }
    if (action === 'get_game') return structuredClone(games.get(input.gameId));
    if (action === 'begin_upload') {
      assert.equal(games.get(input.gameId).draft.revision, input.expectedDraftRevision);
      const id = randomUUID();
      sessions.set(id, { gameId: input.gameId, files: new Map() });
      return { uploadId: id };
    }
    if (action === 'finish_upload') {
      const game = games.get(sessions.get(input.uploadId).gameId);
      game.draft.revision++;
      game.draft.artifactId = input.uploadId;
      return { draftRevision: game.draft.revision };
    }
    if (action === 'create_game_preview') {
      const game = games.get(input.gameId), id = randomUUID();
      assert.equal(game.draft.revision, input.expectedDraftRevision);
      const candidate = { candidateId: id, gameId: game.id, snapshot: structuredClone(game.draft.snapshot), baseStateRevision: game.stateRevision };
      candidates.set(id, candidate);
      return candidate;
    }
    if (action === 'publish_game') {
      if (failPublish) { failPublish = false; throw new Error('Publish unavailable'); }
      const game = games.get(input.gameId), candidate = candidates.get(input.candidateId);
      assert.equal(game.stateRevision, input.expectedStateRevision);
      game.versions.push({ id: candidate.candidateId, snapshot: structuredClone(candidate.snapshot) });
      versions.set(candidate.candidateId, sessions.get(game.draft.artifactId).files);
      game.currentVersionId = candidate.candidateId;
      game.availability = 'enabled';
      game.stateRevision++;
      return { currentVersionId: game.currentVersionId };
    }
    throw new Error(`Unexpected API action ${action}`);
  };
  const run = async (isCurrentMain = async () => true, persistState) => {
    const report = { games: [] };
    await releaseGames({ registry, artifactRoot: root, statePath, repository: 'owner/repo', releaseId: `run-${++attempt}`,
      api, uploadFile: async (id, file) => { sessions.get(id).files.set(file.path, file.bytes); },
      liveFile: async (game, path) => versions.get(game.currentVersionId).get(path) ?? null,
      isCurrentMain, report, persistState, log() {} });
    return report;
  };
  return { root, statePath, registry, games, calls, addPackage, seed, run,
    loseCreate() { loseCreate = true; }, failPublish() { failPublish = true; } };
}

test('first release persists UUID, reruns skip unchanged and later packages update the same game', async t => {
  const f = fixture(t);
  const unrelated = f.seed('unrelated');
  const before = structuredClone(f.games.get(unrelated));
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  const first = await f.run();
  const id = first.games[0].gameId;
  assert.equal(first.games[0].status, 'published');
  assert.equal(JSON.parse(readFileSync(f.statePath)).bindings.first.gameId, id);
  assert.equal((await f.run()).games[0].status, 'unchanged');
  f.addPackage('first', '<html>updated</html>');
  assert.equal((await f.run()).games[0].gameId, id);
  assert.equal(f.calls.filter(call => call.action === 'create_game').length, 1);
  assert.deepEqual(f.games.get(unrelated), before);
});

test('lost create response replays its durable intent and never adopts a game by slug', async t => {
  const f = fixture(t);
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  f.loseCreate();
  await assert.rejects(f.run(), /Create response lost/);
  assert.equal(f.games.size, 1);
  const pending = JSON.parse(readFileSync(f.statePath)).bindings.first;
  assert(pending.createKey);
  assert.equal(pending.gameId, undefined);
  await f.run();
  assert.equal(f.games.size, 1);
  const requests = f.calls.filter(call => call.action === 'create_game');
  assert.equal(requests[0].key, requests[1].key);
  assert.deepEqual(requests[0].input, requests[1].input);
});

test('cloud persistence is awaited before creation, upload and successful completion', async t => {
  const f = fixture(t);
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  let saves = 0;
  await f.run(async () => true, async state => {
    await new Promise(resolve => setTimeout(resolve, 5));
    const writes = f.calls.filter(call => call.key).map(call => call.action);
    if (++saves === 1) {
      assert(state.bindings.first.createKey);
      assert.deepEqual(writes, []);
    } else if (saves === 2) {
      assert(state.bindings.first.gameId);
      assert.deepEqual(writes, ['create_game']);
    } else {
      assert(state.bindings.first.publishedVersionId);
      assert.equal(writes.at(-1), 'publish_game');
    }
  });
  assert.equal(saves, 3);
});

test('failed cloud intent persistence prevents creating a game', async t => {
  const f = fixture(t);
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  await assert.rejects(f.run(async () => true, async () => { throw new Error('Cloud unavailable'); }), /Cloud unavailable/);
  assert.equal(f.calls.some(call => call.key), false);
  assert.equal(f.games.size, 0);
});

test('slug collision without saved intent stops before any platform write', async t => {
  const f = fixture(t);
  const id = f.seed('first');
  const before = structuredClone(f.games.get(id));
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  await assert.rejects(f.run(), /slug already exists/);
  assert.equal(f.calls.some(call => call.key), false);
  assert.equal(existsSync(f.statePath), false);
  assert.deepEqual(f.games.get(id), before);
});

test('publish failure retains UUID and a later run completes the first release', async t => {
  const f = fixture(t);
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  f.failPublish();
  await assert.rejects(f.run(), /Publish unavailable/);
  const id = JSON.parse(readFileSync(f.statePath)).bindings.first.gameId;
  assert.equal(f.games.get(id).currentVersionId, null);
  assert.equal((await f.run()).games[0].gameId, id);
  assert.equal(f.calls.filter(call => call.action === 'create_game').length, 1);
});

test('multiple games can mix updates and first releases with independent UUIDs', async t => {
  const f = fixture(t);
  const id = f.seed('existing');
  f.registry.existing = { slug: 'existing', gameId: id };
  f.registry.second = { slug: 'second', create: metadata };
  f.addPackage('existing');
  f.addPackage('second');
  const result = await f.run();
  assert.deepEqual(result.games.map(game => game.status), ['published', 'published']);
  assert.equal(result.games[0].gameId, id);
  assert.notEqual(result.games[1].gameId, id);
});

test('blocked reports and malformed creation metadata fail before any platform action', async t => {
  const f = fixture(t);
  f.registry.first = { slug: 'first', create: metadata };
  f.registry.second = { slug: 'second', create: metadata };
  f.addPackage('first');
  f.addPackage('second', '<html>second</html>', 1);
  await assert.rejects(f.run(), /passing automated platform report/);
  assert.equal(f.calls.length, 0);
  f.addPackage('second');
  f.registry.second.create = { ...metadata, instructions: '' };
  await assert.rejects(f.run(), /metadata/);
  assert.equal(f.calls.length, 0);
});

test('disabled existing games and unpublished metadata are never overwritten', async t => {
  const f = fixture(t), id = f.seed('existing');
  f.registry.existing = { slug: 'existing', gameId: id };
  f.addPackage('existing');
  f.games.get(id).availability = 'disabled';
  await assert.rejects(f.run(), /identity\/availability/);
  f.games.get(id).availability = 'enabled';
  f.games.get(id).draft.snapshot.title = 'Owner draft';
  await assert.rejects(f.run(), /unpublished metadata/);
  assert.equal(f.calls.some(call => call.key), false);
});

test('stale main stops creation or leaves an uploaded candidate unpublished', async t => {
  const f = fixture(t);
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  assert.equal((await f.run(async () => false)).status, 'skipped-stale');
  assert.equal(f.calls.length, 0);
  let checks = 0;
  await assert.rejects(f.run(async () => ++checks < 4), /candidate retained/);
  assert.equal(f.calls.some(call => call.action === 'publish_game'), false);
  assert(JSON.parse(readFileSync(f.statePath)).bindings.first.gameId);
});

test('a saved creation cannot be rebound or silently changed during first release', async t => {
  const f = fixture(t);
  f.registry.first = { slug: 'first', create: metadata };
  f.addPackage('first');
  f.failPublish();
  await assert.rejects(f.run(), /Publish unavailable/);
  const writes = f.calls.filter(call => call.key).length;
  f.registry.first.create = { ...metadata, title: 'Changed before first release' };
  await assert.rejects(f.run(), /differs from saved create intent/);
  f.registry.first = { slug: 'first', gameId: randomUUID() };
  await assert.rejects(f.run(), /differs from saved binding/);
  assert.equal(f.calls.filter(call => call.key).length, writes);
});

test('tampered packages and duplicate UUIDs stop before any platform action', async t => {
  const f = fixture(t), id = f.seed('first');
  f.registry.first = { slug: 'first', gameId: id };
  f.addPackage('first');
  writeFileSync(join(f.root, 'dist', 'games', 'first', 'index.html'), 'unverified changes');
  await assert.rejects(f.run(), /passing automated platform report/);
  f.addPackage('first');
  f.registry.second = { slug: 'second', gameId: id };
  f.addPackage('second');
  await assert.rejects(f.run(), /duplicate deployment UUID/);
  delete f.registry.second;
  f.registry.first.gameId = null;
  await assert.rejects(f.run(), /Invalid\/duplicate deployment UUID/);
  assert.equal(f.calls.length, 0);
});
