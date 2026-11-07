import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneBoard, controlled, move, newBoard, readRules } from '../src/engine.ts';
import type { Board, Entity } from '../src/engine.ts';
import { LEVELS } from '../src/levels.ts';

test('all eighteen authored levels are solvable through legal moves, with meaningful rule changes', () => {
  LEVELS.forEach((level, index) => {
    let board = newBoard(level), changed = 0;
    assert.equal(new Set(board.entities.map(e => `${e.x},${e.y}`)).size, board.entities.length, `No accidental overlaps in level ${index + 1}`);
    for (const direction of level.solution) {
      const result = move(board, direction);
      assert(result.moved, `Blocked authored move in level ${index + 1}: ${board.steps} ${direction}`);
      board = result.board; if (result.rulesChanged) changed++;
    }
    assert(board.won, `Level ${index + 1} must be solvable`);
    if (index >= 2 && index !== 12) assert(changed > 0, `Level ${index + 1} must teach changing rules`);
  });
});

test('challenge chapter combines positioning, sacrifice and multiple rule rewrites', () => {
  const requiredChanges = [0, 2, 1, 2, 2, 3];
  for (let i = 12; i < LEVELS.length; i++) {
    let board = newBoard(LEVELS[i]), changes = 0, sunk = 0;
    for (const direction of LEVELS[i].solution) { const result = move(board, direction); board = result.board; changes += Number(result.rulesChanged); sunk += result.removed; }
    assert(board.won); assert(board.steps >= 16); assert(changes >= requiredChanges[i - 12]);
    if ([12, 13, 15].includes(i)) assert(sunk >= 2, 'Sacrifice consumes both the obstacle and the water');
  }
});

test('SINK consumes the cat or a pushed rock, and undo snapshots preserve destroyed entities', () => {
  const start = newBoard(LEVELS[12]); let board = start;
  for (let i = 0; i < 3; i++) board = move(board, 'right').board;
  assert.equal(controlled(board).length, 0); assert.equal(board.entities.length, start.entities.length - 2);
  assert.equal(controlled(start).length, 1); assert.equal(start.entities.length, LEVELS[12].entities.length);
});

test('challenge 14 transports WIN to the left bank instead of accepting a shortcut on the right', () => {
  let board = newBoard(LEVELS[13]); const win = board.entities.find(e => e.word === 'win')!;
  for (const direction of LEVELS[13].solution) board = move(board, direction).board;
  assert(board.won); assert(board.entities.find(e => e.id === win.id)!.x < 4);
  const shortcut = 'RRRRDRDRUULLLLDDLL', directions = { R: 'right', L: 'left', U: 'up', D: 'down' } as const;
  board = newBoard(LEVELS[13]); for (const key of shortcut) board = move(board, directions[key as keyof typeof directions]).board;
  assert.equal(board.won, false);
});

test('movement is immutable, blocked pushes are atomic, and successful boards freeze', () => {
  let board = newBoard(LEVELS[1]); const original = cloneBoard(board);
  board = move(board, 'right').board; assert.deepEqual(newBoard(LEVELS[1]), original);
  for (let i = 0; i < 3; i++) board = move(board, 'right').board;
  assert(board.won); assert.equal(move(board, 'left').board, board);
  const entities: Entity[] = [
    { id: 0, kind: 'text', word: 'cat', x: 0, y: 0 }, { id: 1, kind: 'text', word: 'is', x: 1, y: 0 }, { id: 2, kind: 'text', word: 'you', x: 2, y: 0 },
    { id: 3, kind: 'cat', x: 6, y: 5 }, { id: 4, kind: 'text', word: 'push', x: 7, y: 5 }, { id: 5, kind: 'text', word: 'win', x: 8, y: 5 },
  ];
  const blocked: Board = { entities, steps: 0, won: false };
  assert.equal(move(blocked, 'right').board, blocked);
});

test('both horizontal and vertical rules parse, multiple YOU move, and control transfers immediately', () => {
  assert(readRules(newBoard(LEVELS[10]).entities).some(r => r.noun === 'cat' && r.property === 'you'));
  let board = newBoard(LEVELS[4]);
  for (const direction of LEVELS[4].solution.slice(0, 3)) board = move(board, direction).board;
  assert.equal(controlled(board).length, 2);
  board = newBoard(LEVELS[11]); for (let i = 0; i < 2; i++) board = move(board, 'down').board;
  assert.deepEqual(controlled(board).map(e => e.kind), ['rock']);
});

test('breaking YOU leaves a reversible state, and winning requires an active WIN rule', () => {
  let board = newBoard(LEVELS[10]);
  for (const direction of ['up', 'up', 'up'] as const) board = move(board, direction).board;
  const before = cloneBoard(board); board = move(board, 'left').board;
  assert.equal(controlled(board).length, 0); assert.equal(move(board, 'up').moved, false);
  assert.equal(controlled(before).length, 1);
  const incomplete = newBoard(LEVELS[3]); assert(!readRules(incomplete.entities).some(r => r.property === 'win'));
});
