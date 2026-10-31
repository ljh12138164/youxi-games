import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, readdirSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function snapshot(input) {
  const limits = { title: 100, summary: 500, description: 10000, instructions: 5000 };
  const value = { description: '', instructions: '', categories: [], coverId: null, ...input };
  if (!input || Object.keys(value).some(key => ![...Object.keys(limits), 'devices', 'categories', 'coverId'].includes(key))
      || Object.entries(limits).some(([key, max]) => typeof value[key] !== 'string' || value[key].length > max)
      || !value.title.trim() || !value.summary.trim() || !value.instructions.trim()
      || !Array.isArray(value.devices) || value.devices.length < 1 || value.devices.length > 2
      || value.devices.some(device => !['desktop', 'mobile'].includes(device))
      || new Set(value.devices).size !== value.devices.length
      || !Array.isArray(value.categories) || value.categories.length > 30 || value.categories.some(id => !uuid(id))
      || (value.coverId !== null && !uuid(value.coverId))) throw new Error('Invalid first-release metadata');
  return value;
}

function packageFiles(directory, prefix = '') {
  return readdirSync(directory).sort().flatMap(name => {
    const absolute = join(directory, name);
    const path = prefix + name;
    const info = lstatSync(absolute);
    if (info.isSymbolicLink()) throw new Error(`Symlink in package: ${path}`);
    if (info.isDirectory()) return packageFiles(absolute, `${path}/`);
    if (!info.isFile() || /[\\?#]/.test(path)) throw new Error(`Invalid package path: ${path}`);
    return [{ path, bytes: readFileSync(absolute) }];
  });
}

function checkedPackage(root, slug) {
  const files = packageFiles(join(root, 'dist', 'games', slug));
  const digest = createHash('sha256');
  for (const file of files) digest.update(file.path).update('\0').update(String(file.bytes.length)).update('\0').update(file.bytes);
  const artifactHash = digest.digest('hex');
  const selftest = JSON.parse(readFileSync(join(root, 'reports', slug, 'platform.json'), 'utf8'));
  if (!files.some(file => file.path === 'index.html') || selftest.automatedStatus !== 'passed'
      || selftest.summary.failed !== 0 || selftest.summary.blocked !== 0
      || selftest.artifact.sha256 !== artifactHash || selftest.artifact.entry !== 'index.html') {
    throw new Error(`${slug}: exact package must have a passing automated platform report`);
  }
  return { files, artifactHash };
}

// State contains only bindings/create intents, never access or refresh tokens.
export async function releaseGames({ registry, artifactRoot, statePath, repository, releaseId,
  api, uploadFile, liveFile, isCurrentMain, report, persistState = async () => {}, log = console.log }) {
  if (!await isCurrentMain()) { report.status = 'skipped-stale'; return; }
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8'))
    : { version: 1, repository, bindings: {} };
  if (state.version !== 1 || state.repository !== repository || !state.bindings || typeof state.bindings !== 'object' || Array.isArray(state.bindings)) {
    throw new Error('Invalid release state; restore its deployment receipt instead of resetting bindings');
  }
  const saveState = async () => {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flush: true });
    renameSync(`${statePath}.tmp`, statePath);
    await persistState(state);
  };
  report.deploymentState = state;
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) throw new Error('Deployment registry must be an object');
  const ids = new Set();
  // Validate every registered package before any platform write, including creation.
  const plans = Object.entries(registry).map(([slug, target]) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || target.slug !== slug
        || Object.keys(target).some(key => !['slug', 'gameId', 'create'].includes(key))
        || (Object.hasOwn(target, 'gameId') === Object.hasOwn(target, 'create'))) throw new Error('Invalid deployment registry');
    const initialSnapshot = Object.hasOwn(target, 'create') ? snapshot(target.create) : null;
    const binding = Object.hasOwn(state.bindings, slug) ? state.bindings[slug] : null;
    if (binding && target.gameId && target.gameId !== binding.gameId) throw new Error(`${slug}: registered UUID differs from saved binding`);
    const id = target.gameId ?? binding?.gameId;
    if ((Object.hasOwn(target, 'gameId') && !uuid(target.gameId)) || (id && (!uuid(id) || ids.has(id)))) throw new Error('Invalid/duplicate deployment UUID');
    if (id) ids.add(id);
    return { slug, target, initialSnapshot, ...checkedPackage(artifactRoot, slug) };
  });
  for (const { slug, target, initialSnapshot, files, artifactHash } of plans) {
    const result = { slug, artifactHash, status: 'pending' };
    report.games.push(result);
    let binding = Object.hasOwn(state.bindings, slug) ? state.bindings[slug] : null;
    let gameId = target.gameId ?? binding?.gameId;
    if (!gameId) {
      if (!await isCurrentMain()) throw new Error('New main commit arrived; refusing to create a stale game');
      const input = { slug, snapshot: initialSnapshot };
      if (!binding) {
        const games = await api('list_games', {});
        if (games.some(game => game.slug === slug)) throw new Error(`${slug}: slug already exists; bind its verified UUID explicitly`);
        binding = { createKey: `ci-create-${randomUUID()}`, createInput: input };
        state.bindings[slug] = binding;
        // Persist the intent BEFORE create_game. A lost response replays exactly this key/input.
        await saveState();
      } else if (!binding.createKey || !isDeepStrictEqual(binding.createInput, input)) {
        throw new Error(`${slug}: pending create metadata changed; recover the original intent first`);
      }
      const created = await api('create_game', binding.createInput, binding.createKey);
      if (!uuid(created.gameId) || ids.has(created.gameId)) throw new Error('Unexpected created game UUID');
      gameId = created.gameId;
      ids.add(gameId);
      binding.gameId = gameId;
      await saveState();
      result.created = true;
    }
    result.gameId = gameId;
    const game = await api('get_game', { gameId });
    const firstRelease = !game.currentVersionId;
    if (game.id !== gameId || game.slug !== slug || (firstRelease
      ? !binding?.createInput || game.stateRevision !== 0 || game.availability !== 'disabled'
      : game.availability !== 'enabled')) throw new Error(`${slug}: unexpected game identity/availability; refusing to publish`);
    const current = game.versions.find(version => version.id === game.currentVersionId);
    const expectedSnapshot = firstRelease ? binding.createInput.snapshot : current?.snapshot;
    if (firstRelease && !isDeepStrictEqual(initialSnapshot, expectedSnapshot)) throw new Error(`${slug}: first-release metadata differs from saved create intent`);
    if (!expectedSnapshot || !isDeepStrictEqual(expectedSnapshot, game.draft.snapshot)) {
      throw new Error(`${slug}: unpublished metadata changes must be resolved before automatic file updates`);
    }
    result.previousVersionId = game.currentVersionId;
    let unchanged = !firstRelease;
    if (!firstRelease) {
      for (const file of files) {
        const bytes = await liveFile(game, file.path);
        if (bytes === null || sha256(bytes) !== sha256(file.bytes)) { unchanged = false; break; }
      }
    }
    if (unchanged) { result.status = 'unchanged'; log(`${slug}: unchanged`); continue; }
    if (!await isCurrentMain()) throw new Error('New main commit arrived; this release is stale');
    const key = action => `ci-${sha256(`${releaseId}:${slug}:${action}`)}`;
    const upload = await api('begin_upload', { gameId, expectedDraftRevision: game.draft.revision,
      kind: 'game', entry: 'index.html' }, key('begin'));
    for (const file of files) await uploadFile(upload.uploadId, file);
    const finished = await api('finish_upload', { uploadId: upload.uploadId }, key('finish'));
    const candidate = await api('create_game_preview', { gameId, expectedDraftRevision: finished.draftRevision }, key('preview'));
    if (!isDeepStrictEqual(candidate.snapshot, expectedSnapshot) || candidate.baseStateRevision !== game.stateRevision) {
      throw new Error(`${slug}: candidate changed metadata/state; refusing to publish`);
    }
    if (!await isCurrentMain()) throw new Error('New main commit arrived; candidate retained without publishing');
    const published = await api('publish_game', { gameId, candidateId: candidate.candidateId,
      expectedStateRevision: candidate.baseStateRevision }, key('publish'));
    result.status = 'published';
    result.currentVersionId = published.currentVersionId;
    if (binding) { binding.publishedVersionId = published.currentVersionId; await saveState(); }
    log(`${slug}: published ${published.currentVersionId}`);
  }
  report.status = 'success';
}
