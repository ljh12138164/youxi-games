import assert from 'node:assert/strict';
import test from 'node:test';
import { freshProgress, readProgress } from '../src/storage.ts';
import { move, newBoard } from '../src/engine.ts';
import { LEVELS } from '../src/levels.ts';

test('missing, malformed, foreign version and out-of-range progress reset safely', () => {
  for (const raw of [null, '{', 'null', '{"version":9}', JSON.stringify({ ...freshProgress(), level: 99 }), JSON.stringify({ ...freshProgress(), unlocked: 99 })]) assert.deepEqual(readProgress(raw), freshProgress());
});
test('board and undo history survive reload without accepting changed entity types or coordinates', () => {
  const start = newBoard(LEVELS[0]), board = move(start, 'up').board;
  const saved = { ...freshProgress(), board, history: [start], muted: true };
  const loaded = readProgress(JSON.stringify(saved)); assert.deepEqual(loaded.board, board); assert.deepEqual(loaded.history, [start]); assert(loaded.muted);
  saved.board.entities[0].x = -1; assert.equal(readProgress(JSON.stringify(saved)).board, undefined);
});

test('completed original chapter unlocks the new chapter without resetting the current board', () => {
  const board = newBoard(LEVELS[7]);
  const upgraded = readProgress(JSON.stringify({ ...freshProgress(), level: 7, unlocked: 12, completed: Array.from({ length: 12 }, (_, i) => i), board }));
  assert.equal(upgraded.unlocked, 13); assert.deepEqual(upgraded.board, board); assert.equal(upgraded.completed.length, 12);
});

test('submerged entities remain absent on reload, while undo history retains them', () => {
  const start = newBoard(LEVELS[12]); let board = start;
  for (let i = 0; i < 3; i++) board = move(board, 'right').board;
  const loaded = readProgress(JSON.stringify({ ...freshProgress(), level: 12, unlocked: 13, board, history: [start] }));
  assert.deepEqual(loaded.board, board); assert.deepEqual(loaded.history, [start]);
});
