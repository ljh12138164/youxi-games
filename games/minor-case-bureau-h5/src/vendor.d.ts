declare module 'sql.js/dist/sql-wasm-inline.js' {
  import type { SqlJsStatic, SqlJsConfig } from 'sql.js';
  const init: (config?: SqlJsConfig) => Promise<SqlJsStatic>;
  export default init;
}
