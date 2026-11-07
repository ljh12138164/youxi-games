import { openDatabase, queryDatabase, explainSqlError } from './database.ts';
import type { DataTable } from './types.ts';
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<{ id: number; tables: DataTable[]; sql: string }>) => void) | null; postMessage: (message: unknown) => void };
scope.onmessage = async ({ data }) => {
  let db;
  try {
    db = await openDatabase(data.tables);
    scope.postMessage({ id: data.id, result: queryDatabase(db, data.sql) });
  } catch (error) { scope.postMessage({ id: data.id, error: explainSqlError(error) }); }
  finally { db?.close(); }
};
