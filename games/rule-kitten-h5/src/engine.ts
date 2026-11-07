export type Noun = 'cat' | 'rock' | 'wall' | 'flag' | 'water';
export type Property = 'you' | 'push' | 'stop' | 'win' | 'sink';
export type Word = Noun | Property | 'is';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Entity = { id: number; x: number; y: number; kind: Noun | 'text'; word?: Word };
export type Board = { entities: Entity[]; steps: number; won: boolean };
export type Level = { title: string; intro: string; hint: string; entities: Entity[]; solution: Direction[] };
export type Rule = { noun: Noun; property: Property; ids: number[] };
export const WIDTH = 9, HEIGHT = 10;
export const LABELS: Record<Word, string> = { cat: '小猫', rock: '石头', wall: '墙', flag: '旗子', water: '水', is: '是', you: '你', push: '推', stop: '挡', win: '赢', sink: '沉' };
const nouns: Noun[] = ['cat', 'rock', 'wall', 'flag', 'water'];
const properties: Property[] = ['you', 'push', 'stop', 'win', 'sink'];
export const DELTAS: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const cloneBoard = (board: Board): Board => ({ ...board, entities: board.entities.map(e => ({ ...e })) });
export function newBoard(level: Level): Board { return { entities: level.entities.map(e => ({ ...e })), steps: 0, won: false }; }
export function readRules(entities: Entity[]): Rule[] {
  const rules: Rule[] = [];
  for (const noun of entities.filter(e => e.kind === 'text' && nouns.includes(e.word as Noun))) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const joins = entities.filter(e => e.kind === 'text' && e.word === 'is' && e.x === noun.x + dx && e.y === noun.y + dy);
      const ends = entities.filter(e => e.kind === 'text' && properties.includes(e.word as Property) && e.x === noun.x + dx * 2 && e.y === noun.y + dy * 2);
      for (const join of joins) for (const end of ends) rules.push({ noun: noun.word as Noun, property: end.word as Property, ids: [noun.id, join.id, end.id] });
    }
  }
  return rules;
}
export function hasProperty(entity: Entity, property: Property, rules: Rule[]): boolean {
  return entity.kind === 'text' ? property === 'push' : rules.some(r => r.noun === entity.kind && r.property === property);
}
export function controlled(board: Board): Entity[] { const rules = readRules(board.entities); return board.entities.filter(e => hasProperty(e, 'you', rules)); }
function isWon(entities: Entity[], rules: Rule[]): boolean {
  return entities.some(e => hasProperty(e, 'you', rules) && entities.some(other => other.x === e.x && other.y === e.y && hasProperty(other, 'win', rules)));
}
export function move(board: Board, direction: Direction): { board: Board; moved: boolean; rulesChanged: boolean; removed: number } {
  if (board.won) return { board, moved: false, rulesChanged: false, removed: 0 };
  const rules = readRules(board.entities), [dx, dy] = DELTAS[direction];
  const next = cloneBoard(board), movedIds = new Set<number>();
  const actors = board.entities.filter(e => hasProperty(e, 'you', rules)).sort((a, b) => (b.x - a.x) * dx + (b.y - a.y) * dy);
  for (const actor of actors) {
    if (movedIds.has(actor.id)) continue;
    const plan = new Map<number, [number, number]>();
    function attempt(id: number): boolean {
      if (plan.has(id)) return true;
      const entity = next.entities.find(e => e.id === id)!;
      const x = entity.x + dx, y = entity.y + dy;
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return false;
      const blockers = next.entities.filter(e => {
        const p = plan.get(e.id); return e.id !== id && (p?.[0] ?? e.x) === x && (p?.[1] ?? e.y) === y;
      });
      for (const other of blockers) {
        if (hasProperty(other, 'push', rules)) { if (!attempt(other.id)) return false; }
        else if (hasProperty(other, 'stop', rules)) return false;
      }
      plan.set(id, [x, y]); return true;
    }
    if (attempt(actor.id)) for (const [id, [x, y]] of plan) {
      Object.assign(next.entities.find(e => e.id === id)!, { x, y }); movedIds.add(id);
    }
  }
  if (!movedIds.size) return { board, moved: false, rulesChanged: false, removed: 0 };
  const submerged = new Set<number>(), rulesAfterMove = readRules(next.entities);
  for (const entity of next.entities) if (hasProperty(entity, 'sink', rulesAfterMove)) {
    const touching = next.entities.filter(other => other.x === entity.x && other.y === entity.y);
    if (touching.length > 1) for (const other of touching) submerged.add(other.id);
  }
  next.entities = next.entities.filter(entity => !submerged.has(entity.id));
  const after = readRules(next.entities);
  next.steps++; next.won = isWon(next.entities, after);
  const signature = (list: Rule[]) => list.map(r => `${r.noun}:${r.property}`).sort().join('|');
  return { board: next, moved: true, rulesChanged: signature(rules) !== signature(after), removed: submerged.size };
}
