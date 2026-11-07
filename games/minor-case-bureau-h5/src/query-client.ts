import SqlWorker from './sql-worker.ts?worker&inline';
import type { QueryResult } from './database.ts';
import type { DataTable } from './types.ts';

export class QueryClient {
  private worker: Worker | null = null;
  private sequence = 0;
  private cancelCurrent: (() => void) | undefined;
  run(tables: DataTable[], sql: string): Promise<QueryResult> {
    this.cancel();
    this.worker = new SqlWorker();
    const worker = this.worker;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); worker.terminate(); if (this.worker === worker) { this.worker = null; this.cancelCurrent = undefined; } };
      const timer = setTimeout(() => { finish(); reject(new Error('查询耗时过长，已停止执行。试着缩小筛选范围，或检查连接条件。')); }, 8000);
      this.cancelCurrent = () => { finish(); reject(new Error('查询已停止。输入内容仍然保留。')); };
      worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: QueryResult; error?: string }>) => {
        if (data.id !== id) return;
        finish();
        if (data.error || !data.result) reject(new Error(data.error ?? '查询没有返回结果。')); else resolve(data.result);
      };
      worker.onerror = () => { finish(); reject(new Error('查询引擎未能启动。请重试；仍无法运行时可导出存档后刷新页面。')); };
      worker.postMessage({ id, tables, sql });
    });
  }
  cancel() { this.cancelCurrent?.(); this.worker?.terminate(); this.worker = null; }
}
