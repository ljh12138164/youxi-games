import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, queryDatabase, saveResultAsTable, explainSqlError } from '../src/database.ts';
import type { DataTable } from '../src/types.ts';

const table: DataTable = { name: 'visits', label: '访问记录', description: '测试数据', columns: [{ name: 'id', label: '编号', type: 'INTEGER' }, { name: 'name', label: '姓名', type: 'TEXT' }, { name: 'score', label: '分数', type: 'REAL' }], rows: [[1, '林苒', 9.5], [2, '周启', 8], [3, '林苒', null]] };

test('SQLite supports joins, CTEs, aggregation and equivalent queries', async () => {
  const db = await openDatabase([table]);
  try {
    const simple = queryDatabase(db, "SELECT id,name FROM visits WHERE name='林苒' AND score>9");
    const alternative = queryDatabase(db, "WITH chosen AS (SELECT * FROM visits WHERE score>9) SELECT id,name FROM chosen WHERE name LIKE '林%'");
    assert.deepEqual(simple.values, [[1, '林苒']]); assert.deepEqual(simple.values, alternative.values);
    assert.deepEqual(queryDatabase(db, 'SELECT a.name,COUNT(b.id) FROM visits a JOIN visits b ON a.id=b.id GROUP BY a.name HAVING COUNT(b.id)>1').values, [['林苒', 2]]);
  } finally { db.close(); }
});

test('read-only queries cannot modify original evidence and multiple statements are rejected', async () => {
  const db = await openDatabase([table]);
  try {
    for (const sql of ['DELETE FROM visits', 'PRAGMA query_only=OFF', 'SELECT 1; DELETE FROM visits', 'WITH a AS (SELECT 1) DELETE FROM visits']) assert.throws(() => queryDatabase(db, sql));
    assert.deepEqual(queryDatabase(db, 'SELECT COUNT(*) FROM visits').values, [[3]]);
    assert.throws(() => queryDatabase(db, 'SELECT 1; SELECT 2'), /一条查询/);
    assert.deepEqual(queryDatabase(db, "SELECT ';' AS marker").values, [[';']]);
  } finally { db.close(); }
});

test('empty results retain column names and null is distinct from an empty string', async () => {
  const db = await openDatabase([table]);
  try {
    const empty = queryDatabase(db, 'SELECT id,name FROM visits WHERE id<0');
    assert.deepEqual(empty.columns, ['id', 'name']); assert.deepEqual(empty.values, []);
    assert.deepEqual(queryDatabase(db, "SELECT NULL AS a,'' AS b").values, [[null, '']]);
    const saved = saveResultAsTable('空结果', empty, [table]);
    const next = await openDatabase([saved]); try { assert.deepEqual(queryDatabase(next, 'SELECT COUNT(*) FROM 空结果').values, [[0]]); } finally { next.close(); }
  } finally { db.close(); }
});

test('saved results are queryable, duplicate fields are unique, and name collisions cannot overwrite', async () => {
  const db = await openDatabase([table]);
  try {
    const result = queryDatabase(db, 'SELECT id AS item,id AS item FROM visits WHERE id=2');
    const saved = saveResultAsTable('my_result', result, [table]);
    assert.deepEqual(saved.columns.map(c => c.name), ['item', 'item_2']);
    const next = await openDatabase([table, saved]); try { assert.deepEqual(queryDatabase(next, 'SELECT item_2 FROM my_result').values, [[2]]); } finally { next.close(); }
    assert.throws(() => saveResultAsTable('VISITS', result, [table]), /已经/);
    assert.throws(() => saveResultAsTable('bad;drop', result, []), /表名/);
    assert.throws(() => saveResultAsTable('too_large', { ...result, truncated: true }, []), /1000/);
  } finally { db.close(); }
});

test('large results are capped without disguising incomplete results as complete', async () => {
  const db = await openDatabase([]);
  try { const result = queryDatabase(db, 'WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1100) SELECT x FROM n'); assert.equal(result.values.length, 1000); assert.equal(result.truncated, true); }
  finally { db.close(); }
  assert.match(explainSqlError(new Error('no such column: missing')), /字段.*missing/);
});
