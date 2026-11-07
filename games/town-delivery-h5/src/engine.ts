export const COLS = 9;
export const ROWS = 11;
export const BAKERY = 19;
export const ROAD_BUDGET = 44;
export const DURATION = 180;
export const GOAL = 24;
export const BRIDGES = [47, 51];
export const TREES = [3, 14, 54, 67, 74, 96];
export type House = { cell: number; orders: number[]; nextOrder: number };
export type Van = { path: number[]; position: number; target: number | null; returning: boolean };
export type Town = {
  roads: number[]; houses: House[]; vans: Van[]; elapsed: number;
  delivered: number; missed: number; coins: number; started: boolean; finished: boolean;
};
export function newTown(): Town {
  return { roads: [], houses: [{ cell: 24, orders: [0, 0], nextOrder: 17 }],
    vans: [newVan(), newVan()], elapsed: 0, delivered: 0, missed: 0, coins: 0, started: false, finished: false };
}
function newVan(): Van { return { path: [BAKERY], position: 0, target: null, returning: false }; }
export function neighbors(cell: number): number[] {
  const x = cell % COLS, y = Math.floor(cell / COLS);
  return [x > 0 ? cell - 1 : -1, x < COLS - 1 ? cell + 1 : -1,
    y > 0 ? cell - COLS : -1, y < ROWS - 1 ? cell + COLS : -1].filter(n => n >= 0);
}
export const isWater = (cell: number) => Math.floor(cell / COLS) === 5;
export const roadCost = (cell: number) => BRIDGES.includes(cell) ? 4 : 1;
export const roadsUsed = (town: Town) => town.roads.reduce((sum, cell) => sum + roadCost(cell), 0);
export function editRoad(town: Town, cell: number, erase = false): string | null {
  if (town.finished || cell < 0 || cell >= COLS * ROWS || !Number.isInteger(cell)) return null;
  if (cell === BAKERY || town.houses.some(h => h.cell === cell)) return null;
  if (erase) {
    if (!town.roads.includes(cell)) return null;
    town.roads = town.roads.filter(c => c !== cell);
    // Road editing returns affected vans safely, preserving undelivered orders.
    for (const van of town.vans) if (van.path.includes(cell)) Object.assign(van, newVan());
    return null;
  }
  if (town.roads.includes(cell)) return null;
  if (TREES.includes(cell)) return '这里有树，试着绕一下。';
  if (isWater(cell) && !BRIDGES.includes(cell)) return '河上只能在两处浅色桥位修桥。';
  if (roadsUsed(town) + roadCost(cell) > ROAD_BUDGET) return '道路用完了，擦掉闲置道路可以回收。';
  town.roads.push(cell);
  return null;
}
export function findPath(town: Town, destination: number): number[] | null {
  const walkable = new Set([BAKERY, destination, ...town.roads]);
  const parents = new Map<number, number>([[BAKERY, -1]]), queue = [BAKERY];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current === destination) {
      const path: number[] = [];
      for (let cell = current; cell !== -1; cell = parents.get(cell)!) path.push(cell);
      return path.reverse();
    }
    for (const next of neighbors(current)) if (walkable.has(next) && !parents.has(next)) {
      parents.set(next, current); queue.push(next);
    }
  }
  return null;
}
export function addVan(town: Town): boolean {
  if (town.finished || town.coins < 30 || town.vans.length >= 3) return false;
  town.coins -= 30; town.vans.push(newVan()); return true;
}
export function advance(town: Town, seconds: number) {
  if (!town.started || town.finished || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, .1);
  town.elapsed = Math.min(DURATION, town.elapsed + dt);
  const expansions = [{ at: 30, cell: 78 }, { at: 70, cell: 82 }, { at: 110, cell: 16 }];
  for (const expansion of expansions) if (town.elapsed >= expansion.at && !town.houses.some(h => h.cell === expansion.cell)) {
    town.roads = town.roads.filter(c => c !== expansion.cell);
    for (const van of town.vans) if (van.path.includes(expansion.cell)) Object.assign(van, newVan());
    town.houses.push({ cell: expansion.cell, orders: [town.elapsed, town.elapsed], nextOrder: town.elapsed + 20 });
  }
  for (const house of town.houses) {
    if (town.elapsed >= house.nextOrder) {
      if (house.orders.length < 4) house.orders.push(town.elapsed);
      house.nextOrder = town.elapsed + 17;
    }
    while (house.orders.length && town.elapsed - house.orders[0] > 65) { house.orders.shift(); town.missed++; }
  }
  for (const van of town.vans) {
    if (van.target === null && !van.returning) {
      const choices = town.houses.filter(h => h.orders.length > town.vans.filter(v => !v.returning && v.target === h.cell).length)
        .sort((a, b) => a.orders[0] - b.orders[0]);
      for (const house of choices) {
        const path = findPath(town, house.cell);
        if (path) { van.path = path; van.position = 0; van.target = house.cell; break; }
      }
    }
    if (van.target !== null || van.returning) {
      van.position = Math.min(van.path.length - 1, van.position + dt * 3.4);
      if (van.position >= van.path.length - 1) {
        if (!van.returning) {
          const house = town.houses.find(h => h.cell === van.target);
          if (house?.orders.length) { house.orders.shift(); town.delivered++; town.coins += 5; }
          van.path = [...van.path].reverse(); van.position = 0; van.returning = true; van.target = null;
        } else Object.assign(van, newVan());
      }
    }
  }
  if (town.elapsed >= DURATION) town.finished = true;
}
