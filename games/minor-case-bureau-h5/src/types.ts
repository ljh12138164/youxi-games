export type SqlValue = string | number | null;
export type Column = { name: string; label: string; type: 'TEXT' | 'INTEGER' | 'REAL'; description?: string };
export type DataTable = { name: string; label: string; description: string; columns: Column[]; rows: SqlValue[][]; source?: string };
export type EvidenceVisual = { kind: 'identity' | 'camera' | 'receipt' | 'luggage' | 'chat' | 'timeline' | 'bank' | 'ledger' | 'letter'; heading: string; fields: { label: string; value: string }[]; columns?: string[]; rows?: string[][]; items?: { label: string; count: number }[]; footer?: string; frame?: number };
export type Clue = { id: string; title: string; kind: 'text' | 'photo' | 'document'; body: string; asset?: string; visual?: EvidenceVisual };
export type SiteForm = { kind: 'comment' | 'quiz' | 'publish'; label: string; question?: string; answer?: string; successText: string; unlockTables?: string[] };
export type WebPage = {
  address: string; title: string; category: string; intro: string; body: string;
  links: { label: string; address: string }[]; downloadTables: string[];
  login?: { username: string; password: string; body: string };
  search?: { table: string; fields: string[] };
  form?: SiteForm;
};
export type Finale = { headlines: string[]; correctHeadline: number; questions: { id: string; label: string; answer: string }[]; goodEnding: string; badEnding: string };
export type CaseDefinition = {
  id: number; title: string; subtitle: string; briefing: string; clues: Clue[];
  tables: DataTable[]; initialTables: string[]; websites: WebPage[]; initialSites: string[];
  hints: string[]; sqlHints: string[]; solutionSql: string;
  culpritId: SqlValue; suspectTable: string; idColumn: string; nameColumn: string;
  finale?: Finale;
};
export type ManualChapter = { title: string; intro: string; sections: { title: string; body: string; code?: string }[] };
