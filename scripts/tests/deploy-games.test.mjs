import test from 'node:test';
import assert from 'node:assert/strict';
import { transferTimeoutMs, fetchLiveBytes } from '../deploy-games.mjs';

test('transferTimeoutMs enforces floor and scales generously for large bundles', () => {
  assert.equal(transferTimeoutMs(0, 60_000), 60_000);
  assert.equal(transferTimeoutMs(500_000, 120_000), 120_000);
  assert(transferTimeoutMs(46_544_056, 60_000) >= 310_000);
});

test('fetchLiveBytes retries transient timeouts/5xx and preserves file context on failure', async () => {
  let attempts = 0;
  const bytes = await fetchLiveBytes({
    url: 'https://example.invalid/yard.pak',
    label: 'greenhouse-watch-h5/yard.pak',
    timeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: async () => {
      attempts++;
      if (attempts === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return new Response('ok');
    },
  });
  assert.equal(attempts, 2);
  assert.equal(bytes.toString(), 'ok');

  let missingAttempts = 0;
  const missing = await fetchLiveBytes({
    url: 'https://example.invalid/missing',
    label: 'slug/missing',
    timeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: async () => {
      missingAttempts++;
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(missing, null);
  assert.equal(missingAttempts, 1);

  let forbiddenAttempts = 0;
  await assert.rejects(
    fetchLiveBytes({
      url: 'https://example.invalid/forbidden',
      label: 'slug/forbidden',
      timeoutMs: 1000,
      retryDelayMs: 0,
      fetchImpl: async () => {
        forbiddenAttempts++;
        return new Response(null, { status: 403 });
      },
    }),
    /slug\/forbidden: 403/,
  );
  assert.equal(forbiddenAttempts, 1);

  await assert.rejects(
    fetchLiveBytes({
      url: 'https://example.invalid/slow.pak',
      label: 'greenhouse-watch-h5/slow.pak',
      timeoutMs: 1000,
      retryDelayMs: 0,
      fetchImpl: async () => new Response(null, { status: 504 }),
    }),
    /greenhouse-watch-h5\/slow\.pak: 504/,
  );
});
