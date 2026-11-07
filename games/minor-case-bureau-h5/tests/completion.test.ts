import test from 'node:test';
import assert from 'node:assert/strict';
import { getSqlCompletions, getSqlHover, getSqlSignatureHelp } from '../src/completion.ts';
import type { DataTable } from '../src/types.ts';
const suspects: DataTable = { name: 'suspects', label: '嫌疑人资料', description: '公开登记', columns: [{ name: 'id', label: '人物编号', type: 'INTEGER' }, { name: 'name', label: '姓名', type: 'TEXT' }, { name: 'coat_color', label: '外套颜色', type: 'TEXT' }], rows: [[1, '不能泄露到提示的人名', '红色']] };
const orders: DataTable = { name: 'orders', label: '订单', description: '消费流水', columns: [{ name: 'id', label: '订单编号', type: 'INTEGER' }, { name: 'person_id', label: '人物编号', type: 'INTEGER' }, { name: 'amount', label: '金额', type: 'REAL' }], rows: [] };
const tables = [suspects, orders];
const suggestions = (sql: string, at = sql.length, schema = tables) => getSqlCompletions(sql, at, schema);
const columnNames = (sql: string, at = sql.length, schema = tables) => suggestions(sql, at, schema).filter(x => x.kind === 'column').map(x => x.insertText.replaceAll('"', '').split('.').at(-1));

test('FROM and JOIN provide only acquired table names and Chinese descriptions', () => {
  for (const sql of ['SELECT * FROM ', 'SELECT * FROM suspects s JOIN ']) {
    const items = suggestions(sql).filter(x => x.kind === 'table');
    assert(items.some(x => x.insertText === 'suspects')); assert(items.some(x => x.insertText === 'orders'));
    assert(items.find(x => x.insertText === 'suspects')?.documentation.includes('公开登记'));
  }
  assert.equal(suggestions('SELECT * FROM su').filter(x => x.kind === 'table').length, 1);
});
test('qualified fields use the actual table or alias and never another table', () => {
  assert.deepEqual(new Set(columnNames('SELECT * FROM suspects s WHERE s.')), new Set(['id', 'name', 'coat_color']));
  assert.deepEqual(new Set(columnNames('SELECT * FROM orders o WHERE o.')), new Set(['id', 'person_id', 'amount']));
  assert.equal(columnNames('SELECT * FROM orders o WHERE unknown.').length, 0);
  const sql = 'SELECT s. FROM suspects AS s'; assert(columnNames(sql, sql.indexOf('s.') + 2).includes('coat_color'));
});
test('inner query alias shadows outer alias and cannot leak unrelated columns', () => {
  const sql = 'SELECT * FROM suspects s WHERE EXISTS (SELECT 1 FROM orders s WHERE s.)';
  const at = sql.lastIndexOf('s.') + 2;
  assert(columnNames(sql, at).includes('amount')); assert(!columnNames(sql, at).includes('coat_color'));
});
test('CTE and derived-table fields follow the projection rather than exposing every source field', () => {
  const cte = 'WITH chosen AS (SELECT id,name FROM suspects) SELECT * FROM chosen c WHERE c.';
  assert.deepEqual(new Set(columnNames(cte)), new Set(['id', 'name']));
  const derived = 'SELECT * FROM (SELECT id,amount FROM orders) q WHERE q.';
  assert(columnNames(derived).includes('amount')); assert(!columnNames(derived).includes('person_id'));
});
test('comments, strings and unavailable tables cannot leak completions', () => {
  assert.equal(suggestions("SELECT * FROM suspects WHERE name='abc").length, 0);
  assert.equal(suggestions('SELECT * FROM suspects -- s.').length, 0);
  assert(!suggestions('SELECT * FROM ', 14, [orders]).some(x => x.insertText === 'suspects'));
  assert(!suggestions('SELECT * FROM suspects s WHERE s.').some(x => x.insertText.includes('不能泄露')));
});
test('hover and function parameter help explain meaning without running queries', () => {
  const sql = 'SELECT s.coat_color FROM suspects s';
  const hover = getSqlHover(sql, sql.indexOf('coat_color') + 3, tables);
  assert(hover && `${hover.detail}${hover.documentation}`.includes('外套颜色'));
  const signature = getSqlSignatureHelp('SELECT ROUND(amount,', 20);
  assert(signature); assert.equal(signature.activeParameter, 1);
});
