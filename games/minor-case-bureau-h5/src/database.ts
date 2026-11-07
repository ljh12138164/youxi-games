import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import type { Database, SqlJsStatic } from 'sql.js';
import type { DataTable, SqlValue } from './types.ts';

export type QueryResult = { columns: string[]; values: SqlValue[][]; truncated: boolean; duration: number };
let sqlite: Promise<SqlJsStatic> | undefined;
export const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

export async function openDatabase(tables: DataTable[]): Promise<Database> {
  const SQL = await (sqlite ??= initSqlJs());
  const db = new SQL.Database();
  try {
    db.run('BEGIN');
    for (const table of tables) {
      db.run(`CREATE TABLE ${quoteIdentifier(table.name)} (${table.columns.map(c => `${quoteIdentifier(c.name)} ${c.type}`).join(', ')})`);
      const statement = db.prepare(`INSERT INTO ${quoteIdentifier(table.name)} VALUES (${table.columns.map(() => '?').join(',')})`);
      try { for (const row of table.rows) statement.run(row); } finally { statement.free(); }
    }
    db.run('COMMIT');
    db.run('PRAGMA query_only=ON');
    return db;
  } catch (error) { db.close(); throw error; }
}

export function queryDatabase(db: Database, sql: string): QueryResult {
  const start = performance.now();
  const clean = sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, '').trim();
  if (!/^(SELECT|WITH|EXPLAIN)\b/i.test(clean)) throw new Error('查询窗口只读取数据。保存、重命名和删除结果表，请使用表格工具。');
  db.run('PRAGMA query_only=ON');
  const statements: string[] = [];
  try { for (const statement of db.iterateStatements(sql)) statements.push(statement.getSQL()); }
  finally { db.run('PRAGMA query_only=ON'); }
  if (statements.length !== 1) throw new Error('一次运行一条查询。请把其他语句移到新页签。');
  const statement = db.prepare(statements[0]);
  try {
    const columns = statement.getColumnNames();
    const values: SqlValue[][] = [];
    while (statement.step()) {
      if (values.length === 1000) return { columns, values, truncated: true, duration: performance.now() - start };
      values.push(statement.get().map(value => value instanceof Uint8Array ? `[二进制数据：${value.byteLength} 字节]` : value));
    }
    return { columns, values, truncated: false, duration: performance.now() - start };
  } finally { statement.free(); }
}

export function explainSqlError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/no such table:/i.test(message)) return `找不到数据表 ${message.split(':').slice(1).join(':').trim()}。检查拼写，或先从内网下载这张表。`;
  if (/no such column:/i.test(message)) return `找不到字段 ${message.split(':').slice(1).join(':').trim()}。输入表名加点号，可以查看该表的字段。`;
  if (/ambiguous column name:/i.test(message)) return `字段 ${message.split(':').slice(1).join(':').trim()} 出现在多张表中，请在前面加上表名或别名。`;
  if (/incomplete input/i.test(message)) return '查询还没写完。检查 FROM 后的表名、条件和括号是否完整。';
  if (/syntax error/i.test(message)) return `语法有误：${message.replace('syntax error', '附近的写法不正确')}。请检查关键字、英文引号和逗号。`;
  if (/misuse of aggregate/i.test(message)) return '聚合函数的位置不正确。请检查 GROUP BY，以及条件应放在 WHERE 还是 HAVING。';
  if (/readonly|read-only/i.test(message)) return '原始案卷只允许查询。请把结果保存为新表，再用表格工具管理。';
  return message;
}

export function saveResultAsTable(name: string, result: QueryResult, existing: DataTable[]): DataTable {
  const trimmed = name.trim();
  if (!/^[\p{L}_][\p{L}\p{N}_]{0,39}$/u.test(trimmed)) throw new Error('表名用字母、汉字、数字或下划线，以字母、汉字或下划线开头，最多 40 个字符。');
  if (existing.some(table => table.name.toLowerCase() === trimmed.toLowerCase())) throw new Error('这个表名已经在使用，请换一个名字。');
  if (result.truncated) throw new Error('结果超过 1000 行，尚未完整显示。先缩小查询范围，再保存结果。');
  if (!result.columns.length) throw new Error('还没有可保存的查询结果。');
  const used = new Set<string>();
  return {
    name: trimmed, label: trimmed, description: '由查询结果保存。可在后续查询中使用。', source: 'saved',
    columns: result.columns.map((column, index) => {
      let key = column; let suffix = 2;
      while (used.has(key.toLowerCase())) key = `${column}_${suffix++}`;
      used.add(key.toLowerCase());
      const values = result.values.map(row => row[index]).filter(v => v !== null);
      const type = values.length && values.every(v => typeof v === 'number') ? (values.every(v => Number.isInteger(v)) ? 'INTEGER' : 'REAL') : 'TEXT';
      return { name: key, label: column, type };
    }),
    rows: result.values.map(row => [...row]),
  };
}
