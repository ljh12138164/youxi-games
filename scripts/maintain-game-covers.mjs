import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { openCloudState } from './scalia-cloud-state.mjs';

const repository = 'ljh12138164/youxi-games';
assert.equal(process.env.GITHUB_REPOSITORY, repository);
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
const origin = 'https://scalia.ltd';
const targets = [
  ['card-realms-h5', '6ea05ad2-1350-479c-9b2a-4bcb61fd8386'],
  ['long-night-embers-h5', '8b7f8c7a-56f6-4e54-9d06-58695a3284df'],
];
const oldId = 'ec08f6cf-59a9-4c9a-b917-f1bc90ad492b';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const cloud = await openCloudState({ repository, token: process.env.GH_TOKEN, key: process.env.SCALIA_STATE_KEY });
let credential = cloud.value.credential;
const report = { sha: process.env.GITHUB_SHA, games: [], oldGame: null };
const mask = value => console.log(`::add-mask::${value}`);
mask(credential.accessToken); mask(credential.refreshToken);
assert.equal(credential.origin, origin);
assert.ok(credential.absoluteExpiresAt > Date.now(), 'Scalia connection expired');

async function headers() {
  if (credential.accessExpiresAt <= Date.now() + 60000) {
    const response = await fetch(`${origin}/api/connect/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credential.clientId,
        refresh_token: credential.refreshToken, resource: `${origin}/api/v1/manage` }),
      signal: AbortSignal.timeout(30000),
    });
    assert.ok(response.ok, `Authorization refresh HTTP ${response.status}`);
    const data = await response.json();
    assert.ok(data.access_token && data.refresh_token && data.expires_in);
    credential = { ...credential, accessToken: data.access_token, refreshToken: data.refresh_token,
      accessExpiresAt: Date.now() + data.expires_in * 1000 };
    mask(credential.accessToken); mask(credential.refreshToken);
    cloud.value.credential = credential;
    await cloud.save();
  }
  return { Authorization: `Bearer ${credential.accessToken}` };
}

async function api(action, input, key) {
  const response = await fetch(`${origin}/api/v1/manage`, {
    method: 'POST', headers: { ...await headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, input, requestId: randomUUID(), ...(key ? { idempotencyKey: key } : {}) }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  assert.ok(response.ok && (!key || data.result === 'ok'), `${action} HTTP ${response.status}: ${data.code ?? data.result}`);
  return key ? data.data : data;
}

try {
  // Narrow maintenance operation: no delete, create, site-config, or game-file actions.
  const old = await api('get_game', { gameId: oldId });
  assert.equal(old.id, oldId); assert.equal(old.slug, 'stacklands-h5');
  if (old.availability === 'enabled') {
    await api('set_game_availability', { gameId: oldId, available: false, expectedStateRevision: old.stateRevision },
      `retire-stacklands-${old.stateRevision}`);
  }
  const retired = await api('get_game', { gameId: oldId });
  assert.equal(retired.availability, 'disabled');
  report.oldGame = { gameId: oldId, slug: retired.slug, status: 'disabled', permanentlyDeleted: false };

  for (const [slug, gameId] of targets) {
    const bytes = readFileSync(new URL(`../deploy/covers/${slug}.jpg`, import.meta.url));
    assert.ok(bytes.length <= 512000, 'Cover exceeds platform limit');
    assert.equal(cloud.value.releaseState.bindings[slug]?.gameId, gameId);
    const game = await api('get_game', { gameId });
    assert.equal(game.id, gameId); assert.equal(game.slug, slug); assert.equal(game.availability, 'enabled');
    const current = game.versions.find(v => v.id === game.currentVersionId);
    assert.ok(current?.snapshot);
    assert.deepEqual(game.draft.snapshot, current.snapshot, 'Unpublished metadata changed; refusing overwrite');
    const hash = digest(bytes);
    const saved = cloud.value.coverMaintenance?.[slug];
    if (saved?.hash === hash && game.draft.snapshot.coverId === saved.coverId) {
      report.games.push({ slug, gameId, coverId: saved.coverId, status: 'unchanged' });
      continue;
    }
    const key = action => `cover-${slug}-${hash.slice(0,16)}-${game.draft.revision}-${action}`;
    const upload = await api('begin_upload', { gameId, expectedDraftRevision: game.draft.revision, kind: 'cover', entry: 'cover.jpg' }, key('begin'));
    const response = await fetch(`${origin}/api/v1/manage/uploads/${upload.uploadId}?path=cover.jpg`, {
      method: 'PUT', headers: { ...await headers(), 'Content-Type': 'application/octet-stream', 'X-Youxi-Digest': hash },
      body: bytes, signal: AbortSignal.timeout(60000),
    });
    assert.ok(response.ok, `Cover upload HTTP ${response.status}`);
    const finished = await api('finish_upload', { uploadId: upload.uploadId }, key('finish'));
    const updated = await api('get_game', { gameId });
    const expected = { ...current.snapshot, coverId: updated.draft.snapshot.coverId };
    assert.ok(expected.coverId && expected.coverId !== current.snapshot.coverId);
    assert.ok(isDeepStrictEqual(updated.draft.snapshot, expected), 'Cover upload modified unrelated metadata');
    const candidate = await api('create_game_preview', { gameId, expectedDraftRevision: finished.draftRevision }, key('preview'));
    assert.deepEqual(candidate.snapshot, expected);
    assert.equal(candidate.baseStateRevision, game.stateRevision);
    const published = await api('publish_game', { gameId, candidateId: candidate.candidateId, expectedStateRevision: candidate.baseStateRevision }, key('publish'));
    const verified = await api('get_game', { gameId });
    assert.equal(verified.currentVersionId, published.currentVersionId);
    const live = verified.versions.find(v => v.id === verified.currentVersionId);
    assert.equal(live.snapshot.coverId, expected.coverId);
    cloud.value.coverMaintenance ??= {};
    cloud.value.coverMaintenance[slug] = { hash, coverId: expected.coverId };
    cloud.value.releaseState.bindings[slug].publishedVersionId = published.currentVersionId;
    await cloud.save();
    report.games.push({ slug, gameId, status: 'published', coverId: expected.coverId, versionId: published.currentVersionId });
  }
  report.status = 'success';
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
  console.error(error.message);
} finally {
  writeFileSync(process.env.MAINTENANCE_REPORT, JSON.stringify(report, null, 2));
}
