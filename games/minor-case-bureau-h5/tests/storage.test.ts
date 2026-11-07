import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, parseSave, loadGame, persistGame, recoverGame, SAVE_KEY } from '../src/storage.ts';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }, configurable: true });

test('save round trip and revision guard prevent stale pages from overwriting newer progress', () => {
  data.clear(); const game = newGame(1280, 720);
  const r1 = persistGame(game, 0); const newer = { ...game, elapsed: 12 };
  assert.equal(persistGame(newer, r1), 2);
  assert.throws(() => persistGame({ ...game, elapsed: 3 }, r1), /另一页/);
  assert.equal(loadGame().save?.elapsed, 12);
});

test('damaged main save can be recovered from backup with explicit recovery and preserved original', () => {
  data.clear(); const game = newGame(); persistGame(game, 0); persistGame({ ...game, elapsed: 10 }, 1);
  localStorage.setItem(SAVE_KEY, '{broken');
  const recovered = loadGame(); assert(recovered.save); assert.match(recovered.warning ?? '', /备份/);
  assert.throws(() => persistGame(recovered.save!, recovered.revision), /损坏/);
  assert.equal(recoverGame(recovered.save), 1); assert.equal(localStorage.getItem(`${SAVE_KEY}:damaged`), '{broken');
});

test('invalid imports are rejected before current progress changes', () => {
  data.clear(); const game = newGame(); persistGame(game, 0); const before = localStorage.getItem(SAVE_KEY);
  for (const malformed of [null, {}, { ...game, version: 2 }, { ...game, caseId: 11 }, { ...game, settings: { ...game.settings, master: 3 } }]) assert.throws(() => parseSave(malformed));
  assert.equal(localStorage.getItem(SAVE_KEY), before);
});
