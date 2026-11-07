import assert from 'node:assert/strict';
import test from 'node:test';
import { addVan, advance, BRIDGES, DURATION, editRoad, findPath, newTown, ROAD_BUDGET, roadsUsed } from '../src/engine.ts';

const run = (town: ReturnType<typeof newTown>, seconds: number) => { for (let i = 0; i < seconds * 10; i++) advance(town, .1); };

test('roads connect only through neighboring cells and deliveries need a return trip', () => {
  const town = newTown(); town.started = true;
  assert.equal(findPath(town, 24), null);
  run(town, 5); assert.equal(town.delivered, 0);
  for (const cell of [20, 21, 22, 23]) editRoad(town, cell);
  assert.deepEqual(findPath(town, 24), [19, 20, 21, 22, 23, 24]);
  run(town, 2); assert.equal(town.delivered, 2); assert.equal(town.coins, 10);
  assert(town.vans.every(v => v.returning));
});
test('bridges consume four road units; blocked river and trees cannot be built over', () => {
  const town = newTown();
  assert.match(editRoad(town, 45)!, /桥位/);
  assert.match(editRoad(town, 3)!, /树/);
  editRoad(town, BRIDGES[0]); assert.equal(roadsUsed(town), 4);
  editRoad(town, BRIDGES[0], true); assert.equal(roadsUsed(town), 0);
  for (let cell = 0; cell < 99; cell++) editRoad(town, cell);
  assert(roadsUsed(town) <= ROAD_BUDGET);
});
test('erasing a route safely recalls vans without consuming orders', () => {
  const town = newTown(); town.started = true;
  for (const cell of [20, 21, 22, 23]) editRoad(town, cell);
  run(town, .5); editRoad(town, 21, true);
  assert.equal(town.houses[0].orders.length, 2);
  assert(town.vans.every(v => v.target === null && v.path.length === 1));
  assert.equal(findPath(town, 24), null);
});
test('town grows gently, idle planning does not consume time, and late orders do not end a run', () => {
  const town = newTown(); run(town, 60); assert.equal(town.elapsed, 0);
  town.started = true; run(town, 112);
  assert.equal(town.houses.length, 4); assert(town.missed > 0); assert.equal(town.finished, false);
  assert(town.houses.every(h => h.orders.length <= 4));
});
test('run ends at three minutes, result freezes, and vehicle purchase spends earned coins', () => {
  const town = newTown(); assert.equal(addVan(town), false);
  town.coins = 30; assert.equal(addVan(town), true); assert.equal(town.coins, 0); assert.equal(addVan(town), false);
  town.started = true; run(town, DURATION + 1);
  assert.equal(town.finished, true); assert.equal(town.elapsed, DURATION);
  const result = JSON.stringify(town); run(town, 10); assert.equal(JSON.stringify(town), result);
});
