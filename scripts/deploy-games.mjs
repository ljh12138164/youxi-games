import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { releaseGames, sha256 } from './scalia-release.mjs';
import { openCloudState } from './scalia-cloud-state.mjs';

const origin = 'https://scalia.ltd';
const required = name => {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  return process.env[name];
};
const sha = required('GITHUB_SHA');
const repository = required('GITHUB_REPOSITORY');
const artifactRoot = resolve(required('SCALIA_ARTIFACT_ROOT'));
const reportPath = resolve(required('SCALIA_DEPLOY_REPORT'));
const statePath = join(required('RUNNER_TEMP'), 'scalia-release-bindings.json');
const report = { sha, runId: required('GITHUB_RUN_ID'), games: [] };
if (!/^[a-f0-9]{40}$/.test(sha) || repository !== 'ljh12138164/youxi-games'
    || process.env.GITHUB_REF !== 'refs/heads/main'
    || !['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)) {
  throw new Error('Deployment requires the trusted repository main branch');
}
const cloud = await openCloudState({ repository, token: required('GH_TOKEN'), key: required('SCALIA_STATE_KEY') });
let credential = cloud.value.credential;
const mask = value => console.log(`::add-mask::${value}`);
mask(credential.accessToken);
mask(credential.refreshToken);
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, JSON.stringify(cloud.value.releaseState), { mode: 0o600 });
if (credential.origin !== origin || credential.absoluteExpiresAt <= Date.now()) {
  throw new Error('Scalia connection expired: reauthorize the release connection in a browser');
}

async function authHeaders() {
  if (credential.accessExpiresAt <= Date.now() + 60000) {
    const response = await fetch(`${origin}/api/connect/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credential.clientId,
        refresh_token: credential.refreshToken, resource: `${origin}/api/v1/manage` }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Scalia authorization refresh failed (${response.status})`);
    const data = await response.json();
    if (!data.access_token || !data.refresh_token || !data.expires_in) throw new Error('Invalid refresh response');
    credential = { ...credential, accessToken: data.access_token, refreshToken: data.refresh_token,
      accessExpiresAt: Date.now() + data.expires_in * 1000 };
    mask(credential.accessToken);
    mask(credential.refreshToken);
    cloud.value.credential = credential;
    // Persist rotated refresh tokens immediately, including when a later deployment fails.
    await cloud.save();
  }
  return { Authorization: `Bearer ${credential.accessToken}` };
}

async function api(action, input, key) {
  const response = await fetch(`${origin}/api/v1/manage`, {
    method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, input, requestId: randomUUID(), ...(key ? { idempotencyKey: key } : {}) }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok || (key && data.result !== 'ok')) throw new Error(`${action} failed (${response.status}, ${data.code ?? data.result})`);
  return key ? data.data : data;
}

async function isCurrentMain() {
  const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
    headers: { Authorization: `Bearer ${required('GH_TOKEN')}`, Accept: 'application/vnd.github+json',
      'User-Agent': 'youxi-games-release' }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Cannot resolve main (${response.status})`);
  return (await response.json()).object.sha === sha;
}

async function uploadFile(uploadId, file) {
  const response = await fetch(`${origin}/api/v1/manage/uploads/${uploadId}?path=${encodeURIComponent(file.path)}`, {
    method: 'PUT', headers: { ...await authHeaders(), 'Content-Type': 'application/octet-stream',
      'X-Youxi-Digest': sha256(file.bytes) }, body: file.bytes, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`File upload failed (${response.status})`);
}

async function liveFile(game, path) {
  const url = `https://game-${game.id}.scalia.ltd/v/${game.currentVersionId}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Cannot compare live package (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

try {
  await releaseGames({ registry: JSON.parse(readFileSync(new URL('../deploy/games.json', import.meta.url), 'utf8')),
    artifactRoot, statePath, repository, releaseId: `${sha}:${report.runId}:${required('GITHUB_RUN_ATTEMPT')}`,
    api, uploadFile, liveFile, isCurrentMain, report,
    persistState: async state => { cloud.value.releaseState = state; await cloud.save(); } });
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
