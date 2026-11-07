import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCases } from '../src/content.ts';
import { manualChapters } from '../src/manual.ts';
import { openDatabase, queryDatabase } from '../src/database.ts';
import type { CaseDefinition } from '../src/types.ts';

function collectReachable(level: CaseDefinition) {
  const tables = new Set(level.initialTables);
  const visited = new Set<string>();
  const queue = [...level.initialSites];
  while (queue.length) {
    const addr = queue.shift()!;
    if (visited.has(addr)) continue;
    visited.add(addr);
    const site = level.websites.find(w => w.address === addr);
    assert(site, `Case ${level.id} references missing website ${addr}`);
    assert(site.body.trim().length > 10, `Case ${level.id} website ${addr} has empty body`);
    for (const t of site.downloadTables) tables.add(t);
    for (const t of site.form?.unlockTables ?? []) tables.add(t);
    for (const link of site.links) {
      if (!visited.has(link.address)) queue.push(link.address);
    }
  }
  return { tables, visited };
}

test('all 10 cases across 25 seeds have unique solutions, valid tables, reachable sites, and readable evidence', async () => {
  const firstRun = buildCases(1001);
  const repeatRun = buildCases(1001);
  const diffRun = buildCases(2002);
  assert.deepEqual(firstRun, repeatRun, 'Same seed must produce identical case definitions');
  assert.notDeepEqual(firstRun[0].tables[0].rows, diffRun[0].tables[0].rows, 'Different seeds must vary generated rows');
  assert.equal(manualChapters.length, 8, 'Manual must contain 8 chapters');

  const allAddresses = new Set<string>();
  for (const c of firstRun) for (const w of c.websites) allAddresses.add(w.address);
  assert(allAddresses.size >= 41, `Expected at least 41 unique website addresses across 10 cases, got ${allAddresses.size}`);

  for (let s = 1; s <= 25; s++) {
    const seed = s * 97 + 13;
    const cases = buildCases(seed);
    assert.equal(cases.length, 10);

    for (const level of cases) {
      assert(level.clues.length >= 1, `Case ${level.id} must have clues`);
      assert(level.clues.some(c => c.visual && c.visual.fields.length > 0), `Case ${level.id} must have structured visual evidence`);
      assert(level.hints.length >= 3, `Case ${level.id} must have at least 3 hints`);
      assert(level.sqlHints.length >= 3, `Case ${level.id} must have at least 3 sqlHints`);

      const { tables, visited } = collectReachable(level);
      assert.equal(visited.size, level.websites.length, `All websites in Case ${level.id} must be reachable from initialSites`);
      assert.equal(tables.size, level.tables.length, `All tables in Case ${level.id} must be initial or unlockable via websites`);

      const suspectTable = level.tables.find(t => t.name === level.suspectTable);
      assert(suspectTable, `Case ${level.id} missing suspectTable ${level.suspectTable}`);
      const idIdx = suspectTable.columns.findIndex(c => c.name === level.idColumn);
      assert(idIdx >= 0, `Case ${level.id} missing idColumn ${level.idColumn}`);
      assert(suspectTable.rows.some(r => r[idIdx] === level.culpritId), `Case ${level.id} culpritId not in suspectTable`);

      const db = await openDatabase(level.tables);
      try {
        const res = queryDatabase(db, level.solutionSql);
        assert.equal(res.values.length, 1, `Case ${level.id} (seed ${seed}) solutionSql must return exactly 1 row, got ${res.values.length}`);
        const outIdIdx = res.columns.indexOf(level.idColumn);
        assert(outIdIdx >= 0, `Case ${level.id} solutionSql result must include ${level.idColumn}`);
        assert.equal(res.values[0][outIdIdx], level.culpritId, `Case ${level.id} (seed ${seed}) solutionSql returned wrong culprit`);
      } finally {
        db.close();
      }

      if (level.id === 10) {
        assert(level.finale, 'Case 10 must define finale');
        assert.equal(level.finale.questions.length, 3);
        for (const q of level.finale.questions) assert(q.answer.trim().length > 0);
      }
    }
  }
});
