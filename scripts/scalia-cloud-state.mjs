import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const stateBranch = 'scalia-ci-state';
export const stateFile = 'release-state.enc.json';
const aad = repository => Buffer.from(`scalia-ci-state:v1:${repository}`);
const encryptionKey = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('Invalid SCALIA_STATE_KEY');
  return Buffer.from(value, 'base64');
};

export function encryptState(value, key, repository) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(aad(repository));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}

export function decryptState(encrypted, key, repository) {
  try {
    const envelope = JSON.parse(encrypted);
    if (envelope.version !== 1) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(aad(repository));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
    if (value.version !== 1 || value.repository !== repository || !value.credential || !value.releaseState) throw new Error();
    return value;
  } catch { throw new Error('Cannot decrypt cloud release state; restore its key/state instead of resetting bindings'); }
}

// GitHub stores only authenticated ciphertext. The key comes from an Actions secret.
export async function openCloudState({ repository, token, key, fetchImpl = fetch }) {
  encryptionKey(key);
  const url = `https://api.github.com/repos/${repository}/contents/${stateFile}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json', 'User-Agent': 'youxi-games-release' };
  const read = async () => {
    const response = await fetchImpl(`${url}?ref=${stateBranch}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Cannot read encrypted cloud state (${response.status})`);
    const file = await response.json();
    if (file.type !== 'file' || file.encoding !== 'base64' || !file.sha) throw new Error('Invalid cloud state file');
    return { sha: file.sha, encrypted: Buffer.from(file.content, 'base64').toString('utf8') };
  };
  let current = await read();
  const value = decryptState(current.encrypted, key, repository);
  return { value, async save() {
    const encrypted = encryptState(value, key, repository);
    // Keep the same bytes across retries so an accepted-but-lost response can be recognized.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchImpl(url, { method: 'PUT', headers, signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ branch: stateBranch, sha: current.sha, message: 'ci: persist encrypted release state',
            content: Buffer.from(encrypted).toString('base64') }) });
        if (response.ok) {
          const result = await response.json();
          current = { sha: result.content.sha, encrypted };
          return;
        }
        if (response.status < 500 && ![409, 429].includes(response.status)) throw new Error('Cloud state write rejected');
      } catch (error) {
        if (error.message === 'Cloud state write rejected') throw error;
      }
      const remote = await read();
      if (remote.encrypted === encrypted) { current = remote; return; }
      if (remote.sha !== current.sha) throw new Error('Cloud state changed concurrently; refusing to overwrite bindings');
    }
    throw new Error('Cannot persist cloud state; stopping before the next platform operation');
  } };
}
