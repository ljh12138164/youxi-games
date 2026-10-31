import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptState, decryptState, openCloudState, stateBranch } from '../scalia-cloud-state.mjs';

const repository = 'owner/repo';
const fixture = () => ({ version: 1, repository,
  credential: { accessToken: 'access-sensitive', refreshToken: 'refresh-sensitive' },
  releaseState: { version: 1, repository, bindings: {} } });

function server(key) {
  let encrypted = encryptState(fixture(), key, repository), sha = 'initial';
  let loseResponse = false, conflict = false;
  const writes = [];
  return { writes, loseResponse() { loseResponse = true; }, conflict() { conflict = true; },
    fetchImpl: async (url, options) => {
      if (options.method !== 'PUT') {
        assert(url.endsWith(`?ref=${stateBranch}`));
        return Response.json({ type: 'file', encoding: 'base64', sha, content: Buffer.from(encrypted).toString('base64') });
      }
      const body = JSON.parse(options.body);
      writes.push(body);
      assert.equal(body.branch, stateBranch);
      if (conflict) { sha = 'other-writer'; return new Response(null, { status: 409 }); }
      assert.equal(body.sha, sha);
      encrypted = Buffer.from(body.content, 'base64').toString('utf8');
      sha = `updated-${writes.length}`;
      if (loseResponse) { loseResponse = false; throw new Error('Response lost after accepted write'); }
      return Response.json({ content: { sha } });
    } };
}

test('cloud state encrypts tokens and bindings, and rejects tampering, wrong key or repository', () => {
  const key = randomBytes(32).toString('base64'), value = fixture();
  const encrypted = encryptState(value, key, repository);
  assert(!encrypted.includes(value.credential.accessToken));
  assert(!encrypted.includes(value.credential.refreshToken));
  assert.deepEqual(decryptState(encrypted, key, repository), value);
  assert.notEqual(encryptState(value, key, repository), encrypted);
  assert.throws(() => decryptState(encrypted, randomBytes(32).toString('base64'), repository), /Cannot decrypt/);
  assert.throws(() => decryptState(encrypted, key, 'other/repo'), /Cannot decrypt/);
  const tampered = JSON.parse(encrypted);
  tampered.data = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptState(JSON.stringify(tampered), key, repository), /Cannot decrypt/);
});

test('a fresh cloud job reloads rotated credentials and game UUIDs without local files', async () => {
  const key = randomBytes(32).toString('base64'), mock = server(key);
  const options = { repository, token: 'job-token', key, fetchImpl: mock.fetchImpl };
  const first = await openCloudState(options);
  first.value.credential.refreshToken = 'rotated-refresh';
  first.value.releaseState.bindings.first = { gameId: 'durable-game-id', createKey: 'durable-create-key' };
  await first.save();
  const second = await openCloudState(options);
  assert.deepEqual(second.value, first.value);
  assert(!JSON.stringify(mock.writes).includes('rotated-refresh'));
  second.value.releaseState.bindings.first.publishedVersionId = 'published';
  await second.save();
  assert.equal(mock.writes[1].sha, 'updated-1');
});

test('a lost cloud save response is recovered without overwriting concurrent state', async () => {
  const key = randomBytes(32).toString('base64'), mock = server(key);
  const options = { repository, token: 'job-token', key, fetchImpl: mock.fetchImpl };
  const cloud = await openCloudState(options);
  mock.loseResponse();
  cloud.value.credential.refreshToken = 'rotated';
  await cloud.save();
  assert.equal(mock.writes.length, 1);
  assert.deepEqual((await openCloudState(options)).value, cloud.value);
  mock.conflict();
  await assert.rejects(cloud.save(), /changed concurrently/);
});
