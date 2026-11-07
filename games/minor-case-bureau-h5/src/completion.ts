import type { Column, DataTable } from './types.ts';

export type CompletionItemKind = 'table' | 'column' | 'keyword' | 'function';

export interface SqlCompletionItem {
  label: string;
  insertText: string;
  kind: CompletionItemKind;
  detail: string;
  documentation: string;
  sortText: string;
  tableName?: string;
  columnType?: Column['type'];
}

export interface SqlHoverInfo {
  title: string;
  detail: string;
  documentation: string;
  range?: {
    startOffset: number;
    endOffset: number;
  };
}

export interface SqlFunctionParameter {
  label: string;
  documentation: string;
}

export interface SqlFunctionSignature {
  name: string;
  label: string;
  documentation: string;
  parameters: SqlFunctionParameter[];
}

export interface SqlSignatureHelp {
  signatures: SqlFunctionSignature[];
  activeSignature: number;
  activeParameter: number;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

interface ScopeSource {
  table: DataTable;
  alias?: string;
}

interface ParsedScope {
  text: string;
  cursorInScope: number;
  isSubquery: boolean;
  hasFromClause: boolean;
  sources: ScopeSource[];
  availableTables: DataTable[];
}

const SQL_KEYWORDS: ReadonlyArray<{ keyword: string; detail: string; documentation: string }> = [
  { keyword: 'SELECT', detail: 'SQL 关键字 · 查询列', documentation: '指定要从数据表中查询并返回的字段或表达式。' },
  { keyword: 'FROM', detail: 'SQL 关键字 · 数据来源', documentation: '指定查询的目标数据表、视图或子查询。' },
  { keyword: 'WHERE', detail: 'SQL 关键字 · 筛选条件', documentation: '按条件筛选符合线索的数据行。' },
  { keyword: 'JOIN', detail: 'SQL 关键字 · 关联表', documentation: '根据关联条件连接两张数据表。' },
  { keyword: 'LEFT JOIN', detail: 'SQL 关键字 · 左连接', documentation: '保留左表全部记录，并连接右表中满足条件的记录。' },
  { keyword: 'INNER JOIN', detail: 'SQL 关键字 · 内连接', documentation: '仅返回两张表中同时满足连接条件的记录。' },
  { keyword: 'ON', detail: 'SQL 关键字 · 连接条件', documentation: '指定 JOIN 表之间的字段匹配条件。' },
  { keyword: 'GROUP BY', detail: 'SQL 关键字 · 分组汇总', documentation: '按一个或多个字段对结果集进行分组，常配合聚合函数使用。' },
  { keyword: 'HAVING', detail: 'SQL 关键字 · 分组筛选', documentation: '对 GROUP BY 分组后的聚合结果进行条件筛选。' },
  { keyword: 'ORDER BY', detail: 'SQL 关键字 · 排序', documentation: '按指定字段对查询结果进行升序（ASC）或降序（DESC）排列。' },
  { keyword: 'LIMIT', detail: 'SQL 关键字 · 限制行数', documentation: '限制查询返回的最大记录条数。' },
  { keyword: 'OFFSET', detail: 'SQL 关键字 · 跳过行数', documentation: '跳过指定数量的前置记录后再开始返回结果。' },
  { keyword: 'DISTINCT', detail: 'SQL 关键字 · 去重', documentation: '去除结果集中重复的数据行。' },
  { keyword: 'AS', detail: 'SQL 关键字 · 别名', documentation: '为表或字段指定简短易读的别名。' },
  { keyword: 'AND', detail: 'SQL 关键字 · 逻辑与', documentation: '同时满足前后两个筛选条件。' },
  { keyword: 'OR', detail: 'SQL 关键字 · 逻辑或', documentation: '满足任意一个筛选条件即可。' },
  { keyword: 'NOT', detail: 'SQL 关键字 · 逻辑非', documentation: '对筛选条件取反，排除满足条件的记录。' },
  { keyword: 'IN', detail: 'SQL 关键字 · 集合匹配', documentation: '判断字段值是否包含在给定的列表或子查询结果中。' },
  { keyword: 'EXISTS', detail: 'SQL 关键字 · 存在判断', documentation: '判断子查询是否返回至少一条记录。' },
  { keyword: 'BETWEEN', detail: 'SQL 关键字 · 区间匹配', documentation: '判断数值或时间是否处于闭区间 [起始值, 结束值] 内。' },
  { keyword: 'LIKE', detail: 'SQL 关键字 · 模糊匹配', documentation: '使用 %（任意多字符）或 _（单字符）进行文本模式匹配。' },
  { keyword: 'IS NULL', detail: 'SQL 关键字 · 空值判断', documentation: '筛选字段值为缺失（NULL）的记录。' },
  { keyword: 'IS NOT NULL', detail: 'SQL 关键字 · 非空判断', documentation: '筛选字段值不为空（非 NULL）的记录。' },
  { keyword: 'WITH', detail: 'SQL 关键字 · 公用表表达式 (CTE)', documentation: '定义当前查询作用域内可复用的临时命名结果集。' },
  { keyword: 'UNION', detail: 'SQL 关键字 · 合并结果集', documentation: '合并两个查询的结果集并自动去除重复行。' },
  { keyword: 'UNION ALL', detail: 'SQL 关键字 · 合并全部结果', documentation: '合并两个查询的结果集并保留所有重复行。' },
  { keyword: 'ASC', detail: 'SQL 关键字 · 升序', documentation: '按从小到大（或字母先后）顺序排列。' },
  { keyword: 'DESC', detail: 'SQL 关键字 · 降序', documentation: '按从大到小（或时间从新到旧）顺序排列。' },
  { keyword: 'CASE', detail: 'SQL 关键字 · 条件分支', documentation: '根据不同条件返回对应的值，以 END 结束。' },
  { keyword: 'WHEN', detail: 'SQL 关键字 · 条件分支项', documentation: '在 CASE 表达式中指定判断条件。' },
  { keyword: 'THEN', detail: 'SQL 关键字 · 分支结果', documentation: '在 CASE 表达式中指定满足 WHEN 条件时的返回值。' },
  { keyword: 'ELSE', detail: 'SQL 关键字 · 默认分支', documentation: '在 CASE 表达式中指定其余情况的默认返回值。' },
  { keyword: 'END', detail: 'SQL 关键字 · 分支结束', documentation: '结束 CASE 条件表达式。' },
];

export const SQL_FUNCTIONS: ReadonlyArray<SqlFunctionSignature> = [
  {
    name: 'COUNT',
    label: 'COUNT(expr)',
    documentation: '统计满足条件的记录行数或非空字段值数量。',
    parameters: [{ label: 'expr', documentation: '要计数的字段名或 *（统计所有行）。' }],
  },
  {
    name: 'SUM',
    label: 'SUM(column)',
    documentation: '计算数值字段的总和。',
    parameters: [{ label: 'column', documentation: '参与求和的数值字段或表达式。' }],
  },
  {
    name: 'AVG',
    label: 'AVG(column)',
    documentation: '计算数值字段的平均值。',
    parameters: [{ label: 'column', documentation: '参与计算平均值的数值字段或表达式。' }],
  },
  {
    name: 'MIN',
    label: 'MIN(column)',
    documentation: '获取字段中的最小值或最早时间。',
    parameters: [{ label: 'column', documentation: '目标字段或表达式。' }],
  },
  {
    name: 'MAX',
    label: 'MAX(column)',
    documentation: '获取字段中的最大值或最晚时间。',
    parameters: [{ label: 'column', documentation: '目标字段或表达式。' }],
  },
  {
    name: 'COALESCE',
    label: 'COALESCE(val1, val2, ...)',
    documentation: '按顺序返回参数中第一个非 NULL 的值，常用于填充默认线索值。',
    parameters: [
      { label: 'val1', documentation: '优先检查的字段或表达式。' },
      { label: 'val2', documentation: '当 val1 为 NULL 时返回的备选值。' },
    ],
  },
  {
    name: 'IFNULL',
    label: 'IFNULL(expr, fallback)',
    documentation: '若第一个表达式为 NULL，则返回第二个替代值。',
    parameters: [
      { label: 'expr', documentation: '要检查是否为空的字段或表达式。' },
      { label: 'fallback', documentation: '为空时的替代返回值。' },
    ],
  },
  {
    name: 'ROUND',
    label: 'ROUND(number, decimals)',
    documentation: '将数值四舍五入到指定的小数位数。',
    parameters: [
      { label: 'number', documentation: '要四舍五入的数值或字段。' },
      { label: 'decimals', documentation: '保留的小数位数（默认 0）。' },
    ],
  },
  {
    name: 'ABS',
    label: 'ABS(number)',
    documentation: '返回数值的绝对值。',
    parameters: [{ label: 'number', documentation: '数值字段或表达式。' }],
  },
  {
    name: 'LENGTH',
    label: 'LENGTH(text)',
    documentation: '返回文本字符串的字符长度。',
    parameters: [{ label: 'text', documentation: '文本字段或字符串。' }],
  },
  {
    name: 'SUBSTR',
    label: 'SUBSTR(text, start, length)',
    documentation: '截取文本子串（起始位置从 1 开始计数）。',
    parameters: [
      { label: 'text', documentation: '原始文本字段或字符串。' },
      { label: 'start', documentation: '起始字符位置（从 1 开始，负数表示从末尾倒数）。' },
      { label: 'length', documentation: '可选，截取的字符个数。' },
    ],
  },
  {
    name: 'LOWER',
    label: 'LOWER(text)',
    documentation: '将英文字符转换为小写。',
    parameters: [{ label: 'text', documentation: '文本字段或字符串。' }],
  },
  {
    name: 'UPPER',
    label: 'UPPER(text)',
    documentation: '将英文字符转换为大写。',
    parameters: [{ label: 'text', documentation: '文本字段或字符串。' }],
  },
  {
    name: 'TRIM',
    label: 'TRIM(text, chars)',
    documentation: '去除文本首尾的空白字符或指定字符。',
    parameters: [
      { label: 'text', documentation: '要清理的文本字段。' },
      { label: 'chars', documentation: '可选，指定要移除的字符集合。' },
    ],
  },
  {
    name: 'REPLACE',
    label: 'REPLACE(text, pattern, replacement)',
    documentation: '将文本中的指定子串替换为新内容。',
    parameters: [
      { label: 'text', documentation: '原始文本字段。' },
      { label: 'pattern', documentation: '要查找并替换的目标子串。' },
      { label: 'replacement', documentation: '替换后的新文本。' },
    ],
  },
  {
    name: 'INSTR',
    label: 'INSTR(text, substring)',
    documentation: '查找子串在文本中首次出现的位置（未找到返回 0）。',
    parameters: [
      { label: 'text', documentation: '被检索的文本字段。' },
      { label: 'substring', documentation: '要查找的目标子串。' },
    ],
  },
  {
    name: 'GROUP_CONCAT',
    label: 'GROUP_CONCAT(expr, separator)',
    documentation: '将分组内的多行文本拼接为一个字符串。',
    parameters: [
      { label: 'expr', documentation: '要拼接的字段或表达式。' },
      { label: 'separator', documentation: '可选，分隔符（默认为逗号）。' },
    ],
  },
  {
    name: 'STRFTIME',
    label: 'STRFTIME(format, timestring)',
    documentation: '按指定格式提取或格式化日期时间（如 %Y-%m-%d、%H:%M）。',
    parameters: [
      { label: 'format', documentation: '格式模板，例如 "%Y-%m-%d" 或 "%H"。' },
      { label: 'timestring', documentation: '时间字段或时间字符串。' },
    ],
  },
];

const RESERVED_KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'NATURAL',
  'ON',
  'USING',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'UNION',
  'ALL',
  'INTERSECT',
  'EXCEPT',
  'DISTINCT',
  'AS',
  'AND',
  'OR',
  'NOT',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'IS',
  'NULL',
  'WITH',
  'RECURSIVE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
  'INTO',
  'VALUES',
  'SET',
  'UPDATE',
  'DELETE',
  'INSERT',
  'CREATE',
  'DROP',
  'ALTER',
  'TABLE',
  'VIEW',
  'WINDOW',
]);

export function positionToOffset(sql: string, position: CursorPosition): number {
  const lines = sql.split('\n');
  const targetLine = Math.max(1, Math.min(position.lineNumber, lines.length));
  let offset = 0;
  for (let i = 0; i < targetLine - 1; i++) {
    offset += lines[i].length + 1;
  }
  const lineText = lines[targetLine - 1] ?? '';
  const targetCol = Math.max(1, Math.min(position.column, lineText.length + 1));
  return offset + targetCol - 1;
}

/**
 * Replaces comments and string literal bodies with spaces while keeping exact character offsets.
 * Also reports whether `cursorOffset` sits inside an unclosed/closed string or comment.
 */
function maskSqlCommentsAndStrings(sql: string, cursorOffset: number): { masked: string; cursorInStringOrComment: boolean } {
  const chars = sql.split('');
  let i = 0;
  let cursorInStringOrComment = false;

  while (i < chars.length) {
    const ch = chars[i];
    const next = chars[i + 1];

    // Single-line comment: -- ...
    if (ch === '-' && next === '-') {
      const start = i;
      while (i < chars.length && chars[i] !== '\n') {
        chars[i] = ' ';
        i++;
      }
      if (cursorOffset >= start + 2 && cursorOffset <= i) {
        cursorInStringOrComment = true;
      }
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && next === '*') {
      const start = i;
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) {
        if (chars[i] !== '\n') chars[i] = ' ';
        i++;
      }
      const closed = i < chars.length;
      const end = closed ? i + 2 : i;
      if (i < chars.length) {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 2;
      }
      if (cursorOffset >= start + 2 && (cursorOffset < end || (!closed && cursorOffset === end))) {
        cursorInStringOrComment = true;
      }
      continue;
    }

    // Single-quoted string literal: '...'
    if (ch === "'") {
      const start = i;
      let closed = false;
      chars[i] = ' ';
      i++;
      while (i < chars.length) {
        if (chars[i] === "'" && chars[i + 1] === "'") {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          continue;
        }
        if (chars[i] === "'") {
          closed = true;
          chars[i] = ' ';
          i++;
          break;
        }
        if (chars[i] !== '\n') chars[i] = ' ';
        i++;
      }
      if (cursorOffset > start && (cursorOffset < i || (!closed && cursorOffset === i))) {
        cursorInStringOrComment = true;
      }
      continue;
    }

    i++;
  }

  return { masked: chars.join(''), cursorInStringOrComment };
}

function isolateCurrentStatement(sql: string, cursorOffset: number): { statement: string; cursorInStatement: number; baseOffset: number } {
  let depth = 0;
  let stmtStart = 0;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === ';' && depth === 0) {
      if (i < cursorOffset) {
        stmtStart = i + 1;
      } else {
        return {
          statement: sql.slice(stmtStart, i),
          cursorInStatement: cursorOffset - stmtStart,
          baseOffset: stmtStart,
        };
      }
    }
  }

  return {
    statement: sql.slice(stmtStart),
    cursorInStatement: cursorOffset - stmtStart,
    baseOffset: stmtStart,
  };
}

function findMatchingCloseParen(text: string, openParenIndex: number): number {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function startsWithSelectOrWith(textAfterOpenParen: string): boolean {
  return /^\s*(?:SELECT|WITH)\b/i.test(textAfterOpenParen);
}

/**
 * Extracts CTE definitions from a leading `WITH ...` clause.
 * Also detects if the cursor itself is inside one of the CTE subquery bodies.
 */
function parseLeadingCtes(
  stmt: string,
  cursorInStmt: number,
  physicalTables: DataTable[],
): {
  ctes: DataTable[];
  mainQueryStart: number;
  activeCteSubquery?: { body: string; cursorInBody: number; availableTables: DataTable[] };
} {
  const ctes: DataTable[] = [];
  const withMatch = /^\s*WITH\s+(?:RECURSIVE\s+)?/i.exec(stmt);
  if (!withMatch) {
    return { ctes, mainQueryStart: 0 };
  }

  let idx = withMatch[0].length;

  while (idx < stmt.length) {
    const ws = /^\s*/.exec(stmt.slice(idx))?.[0].length ?? 0;
    idx += ws;

    const nameMatch = /^([A-Za-z_][\w$]*)/.exec(stmt.slice(idx));
    if (!nameMatch) break;
    const cteName = nameMatch[1];
    if (RESERVED_KEYWORDS.has(cteName.toUpperCase())) break;
    idx += nameMatch[0].length;

    let explicitCols: string[] | undefined;
    const afterNameWs = /^\s*/.exec(stmt.slice(idx))?.[0].length ?? 0;
    idx += afterNameWs;

    if (stmt[idx] === '(') {
      const closeColParen = findMatchingCloseParen(stmt, idx);
      if (closeColParen === -1) break;
      const rawCols = stmt.slice(idx + 1, closeColParen);
      explicitCols = rawCols
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      idx = closeColParen + 1;
    }

    const asMatch = /^\s*AS\s*\(/i.exec(stmt.slice(idx));
    if (!asMatch) break;
    const openParenIdx = idx + asMatch[0].length - 1;
    const closeParenIdx = findMatchingCloseParen(stmt, openParenIdx);
    const bodyEnd = closeParenIdx === -1 ? stmt.length : closeParenIdx;
    const cteBody = stmt.slice(openParenIdx + 1, bodyEnd);

    const availableSoFar = [...physicalTables, ...ctes];
    if (cursorInStmt > openParenIdx && cursorInStmt <= bodyEnd) {
      return {
        ctes,
        mainQueryStart: idx,
        activeCteSubquery: {
          body: cteBody,
          cursorInBody: cursorInStmt - (openParenIdx + 1),
          availableTables: availableSoFar,
        },
      };
    }

    const inferredColumns = inferSelectColumns(cteBody, availableSoFar, explicitCols);
    ctes.push({
      name: cteName,
      label: `${cteName}（CTE 临时表）`,
      description: `由 WITH 子句定义的临时查询视图 ${cteName}`,
      columns: inferredColumns,
      rows: [],
    });

    if (closeParenIdx === -1) {
      return { ctes, mainQueryStart: stmt.length };
    }

    idx = closeParenIdx + 1;
    const commaMatch = /^\s*,\s*/.exec(stmt.slice(idx));
    if (commaMatch) {
      idx += commaMatch[0].length;
      continue;
    }
    break;
  }

  return { ctes, mainQueryStart: idx };
}

/**
 * Collapses balanced top-level parentheses in a select scope into exact-length placeholders,
 * so inner `FROM`/`JOIN`/`WHERE` clauses of subqueries never leak into the outer scope
 * while preserving 1-to-1 character offsets.
 */
function collapseParentheses(scopeText: string): {
  collapsed: string;
  subqueries: Map<string, string>;
} {
  const subqueries = new Map<string, string>();
  let result = '';
  let i = 0;
  let subIdx = 0;

  while (i < scopeText.length) {
    if (scopeText[i] === '(') {
      const closeIdx = findMatchingCloseParen(scopeText, i);
      const endIdx = closeIdx === -1 ? scopeText.length : closeIdx;
      const totalLen = endIdx - i + (closeIdx === -1 ? 0 : 1);
      const inner = scopeText.slice(i + 1, endIdx);
      if (startsWithSelectOrWith(inner)) {
        const token = `__SQ${subIdx++}__`;
        subqueries.set(token, inner);
        result += token.padEnd(totalLen, ' ').slice(0, totalLen);
      } else {
        result += ' '.repeat(totalLen);
      }
      i = closeIdx === -1 ? scopeText.length : closeIdx + 1;
      continue;
    }
    result += scopeText[i];
    i++;
  }

  return { collapsed: result, subqueries };
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && depth > 0) depth--;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function extractSourcesFromSelectBlock(
  scopeText: string,
  availableTables: DataTable[],
): { hasFromClause: boolean; sources: ScopeSource[] } {
  const { collapsed, subqueries } = collapseParentheses(scopeText);
  const fromMatch = /\bFROM\b/i.exec(collapsed);
  if (!fromMatch) {
    return { hasFromClause: false, sources: [] };
  }

  const afterFrom = collapsed.slice(fromMatch.index + fromMatch[0].length);
  const endClauseMatch = /\b(?:WHERE|GROUP|HAVING|ORDER|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|WINDOW)\b/i.exec(afterFrom);
  const fromAndJoins = endClauseMatch ? afterFrom.slice(0, endClauseMatch.index) : afterFrom;

  const joinSplitRegex = /\b(?:NATURAL\s+)?(?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN\b/gi;
  const pieces = fromAndJoins.split(joinSplitRegex);
  const sources: ScopeSource[] = [];

  for (const piece of pieces) {
    const withoutCondition = piece.replace(/\b(?:ON|USING)\b[\s\S]*$/i, '');
    const tableRefs = withoutCondition.split(',');

    for (const rawRef of tableRefs) {
      const trimmed = rawRef.trim();
      if (!trimmed) continue;

      const refMatch = /^([A-Za-z_][\w$]*)(?:\s+AS\s+([A-Za-z_][\w$]*)|\s+([A-Za-z_][\w$]*))?/i.exec(trimmed);
      if (!refMatch) continue;

      const rawTarget = refMatch[1];
      const rawAlias = refMatch[2] ?? refMatch[3];
      const alias =
        rawAlias && !RESERVED_KEYWORDS.has(rawAlias.toUpperCase()) && !rawAlias.startsWith('__PAREN_')
          ? rawAlias
          : undefined;

      if (subqueries.has(rawTarget)) {
        const subSql = subqueries.get(rawTarget)!;
        const subCols = inferSelectColumns(subSql, availableTables);
        const subName = alias ?? rawTarget;
        sources.push({
          alias,
          table: {
            name: subName,
            label: alias ? `子查询 ${alias}` : '子查询结果集',
            description: '来自 FROM/JOIN 子查询的字段集合',
            columns: subCols,
            rows: [],
          },
        });
        continue;
      }

      if (RESERVED_KEYWORDS.has(rawTarget.toUpperCase()) || rawTarget.startsWith('__PAREN_')) {
        continue;
      }

      const matchedTable = availableTables.find((t) => t.name.toLowerCase() === rawTarget.toLowerCase());
      if (matchedTable) {
        sources.push({ table: matchedTable, alias });
      }
    }
  }

  return { hasFromClause: true, sources };
}

function inferSelectColumns(
  selectSql: string,
  availableTables: DataTable[],
  explicitNames?: string[],
): Column[] {
  const { ctes, mainQueryStart } = parseLeadingCtes(selectSql, -1, availableTables);
  const body = selectSql.slice(mainQueryStart);
  const allTables = [...availableTables, ...ctes];

  const { hasFromClause, sources } = extractSourcesFromSelectBlock(body, allTables);
  const { collapsed } = collapseParentheses(body);

  const selectMatch = /^\s*SELECT\s+(?:DISTINCT\s+|ALL\s+)?/i.exec(collapsed);
  if (!selectMatch) return [];

  const afterSelect = body.slice(selectMatch[0].length);
  const afterSelectCollapsed = collapsed.slice(selectMatch[0].length);
  const fromMatch = /\bFROM\b/i.exec(afterSelectCollapsed);
  const selectListRaw = fromMatch ? afterSelect.slice(0, fromMatch.index) : afterSelect;

  const items = splitTopLevelCommas(selectListRaw);
  const columns: Column[] = [];

  for (const rawItem of items) {
    const item = rawItem.trim();
    if (!item) continue;

    if (item === '*') {
      for (const src of sources) {
        for (const col of src.table.columns) {
          columns.push(col);
        }
      }
      continue;
    }

    const starQualMatch = /^([A-Za-z_][\w$]*)\.\*$/.exec(item);
    if (starQualMatch) {
      const qual = starQualMatch[1].toLowerCase();
      const src = sources.find(
        (s) => s.alias?.toLowerCase() === qual || s.table.name.toLowerCase() === qual,
      );
      if (src) {
        columns.push(...src.table.columns);
      }
      continue;
    }

    const asMatch = /^([\s\S]+?)\s+AS\s+([A-Za-z_][\w$]*)$/i.exec(item);
    const bareAliasMatch = !asMatch ? /^([A-Za-z_][\w$.()*]+)\s+([A-Za-z_][\w$]*)$/.exec(item) : null;
    const exprPart = (asMatch ? asMatch[1] : bareAliasMatch ? bareAliasMatch[1] : item).trim();
    const aliasName = asMatch
      ? asMatch[2]
      : bareAliasMatch && !RESERVED_KEYWORDS.has(bareAliasMatch[2].toUpperCase())
        ? bareAliasMatch[2]
        : undefined;

    const colRefMatch = /^(?:([A-Za-z_][\w$]*)\.)?([A-Za-z_][\w$]*)$/.exec(exprPart);
    if (colRefMatch) {
      const qual = colRefMatch[1]?.toLowerCase();
      const colName = colRefMatch[2];
      let matchedCol: Column | undefined;

      if (qual) {
        const src = sources.find(
          (s) => s.alias?.toLowerCase() === qual || s.table.name.toLowerCase() === qual,
        );
        matchedCol = src?.table.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
      } else {
        for (const src of sources) {
          const found = src.table.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
          if (found) {
            matchedCol = found;
            break;
          }
        }
      }

      if (matchedCol) {
        columns.push({
          ...matchedCol,
          name: aliasName ?? matchedCol.name,
        });
        continue;
      }
    }

    if (aliasName && (!hasFromClause || sources.length > 0)) {
      const isCountOrInt = /^\s*COUNT\s*\(/i.test(exprPart);
      const isNumericAgg = /^\s*(?:SUM|AVG|ROUND|ABS)\s*\(/i.test(exprPart);
      columns.push({
        name: aliasName,
        label: aliasName,
        type: isCountOrInt ? 'INTEGER' : isNumericAgg ? 'REAL' : 'TEXT',
        description: `表达式 ${exprPart} 的结果列`,
      });
    }
  }

  if (explicitNames && explicitNames.length > 0) {
    return explicitNames.map((name, i) => ({
      name,
      label: columns[i]?.label ?? name,
      type: columns[i]?.type ?? 'TEXT',
      description: columns[i]?.description,
    }));
  }

  return columns;
}

/**
 * Finds the innermost query scope enclosing `cursorInStmt` and resolves its active table sources.
 */
function resolveActiveScope(
  stmt: string,
  cursorInStmt: number,
  physicalTables: DataTable[],
  isSubquery = false,
): ParsedScope {
  const { ctes, mainQueryStart, activeCteSubquery } = parseLeadingCtes(stmt, cursorInStmt, physicalTables);

  if (activeCteSubquery) {
    return resolveActiveScope(
      activeCteSubquery.body,
      activeCteSubquery.cursorInBody,
      activeCteSubquery.availableTables,
      true,
    );
  }

  const availableTables = [...physicalTables, ...ctes];
  const body = stmt.slice(mainQueryStart);
  const cursorInBody = Math.max(0, cursorInStmt - mainQueryStart);

  // Check if cursor is inside a nested `(SELECT ...)` or `(WITH ...)` subquery within `body`
  let i = 0;
  while (i < body.length && i < cursorInBody) {
    if (body[i] === '(') {
      const closeIdx = findMatchingCloseParen(body, i);
      const endIdx = closeIdx === -1 ? body.length : closeIdx;
      const inner = body.slice(i + 1, endIdx);

      if (cursorInBody > i && cursorInBody <= endIdx && startsWithSelectOrWith(inner)) {
        return resolveActiveScope(inner, cursorInBody - (i + 1), availableTables, true);
      }

      if (closeIdx !== -1 && closeIdx < cursorInBody) {
        i = closeIdx + 1;
        continue;
      }
    }
    i++;
  }

  // Split by top-level UNION / INTERSECT / EXCEPT so each branch has its own scope
  const branch = isolateSetOperationBranch(body, cursorInBody);
  const { hasFromClause, sources } = extractSourcesFromSelectBlock(branch.text, availableTables);

  return {
    text: branch.text,
    cursorInScope: branch.cursorInBranch,
    isSubquery,
    hasFromClause,
    sources,
    availableTables,
  };
}

function isolateSetOperationBranch(text: string, cursorOffset: number): { text: string; cursorInBranch: number } {
  const { collapsed } = collapseParentheses(text);
  const regex = /\b(?:UNION(?:\s+ALL)?|INTERSECT|EXCEPT)\b/gi;
  let lastStart = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(collapsed)) !== null) {
    if (cursorOffset < match.index) {
      return {
        text: text.slice(lastStart, match.index),
        cursorInBranch: cursorOffset - lastStart,
      };
    }
    lastStart = match.index + match[0].length;
  }

  return {
    text: text.slice(lastStart),
    cursorInBranch: Math.max(0, cursorOffset - lastStart),
  };
}

type CursorContext =
  | { kind: 'dot'; qualifier: string; prefix: string }
  | { kind: 'table'; prefix: string }
  | { kind: 'after_table'; prefix: string }
  | { kind: 'clause_expression'; clause: string; prefix: string };

function detectCursorContext(scopeText: string, cursorInScope: number): CursorContext {
  const { collapsed } = collapseParentheses(scopeText);
  const beforeCursorRaw = scopeText.slice(0, cursorInScope);
  const beforeCursorCollapsed = collapsed.slice(0, cursorInScope);

  // 1. Check dot completion: `table.colPrefix` or `alias.colPrefix`
  const dotMatch = /([A-Za-z_][\w$]*)\.([A-Za-z_][\w$]*)?$/.exec(beforeCursorRaw);
  if (dotMatch) {
    return {
      kind: 'dot',
      qualifier: dotMatch[1],
      prefix: dotMatch[2] ?? '',
    };
  }

  // Extract current partial identifier word at cursor
  const wordMatch = /([A-Za-z_][\w$]*)$/.exec(beforeCursorRaw);
  const prefix = wordMatch ? wordMatch[1] : '';
  const beforeWordCollapsed = beforeCursorCollapsed.slice(0, beforeCursorCollapsed.length - prefix.length);

  // 2. Directly after FROM or JOIN keyword: `FROM |` or `LEFT JOIN ord|`
  if (
    /\b(?:FROM|(?:NATURAL\s+)?(?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN)\s*$/i.test(
      beforeWordCollapsed,
    )
  ) {
    return { kind: 'table', prefix };
  }

  // Find the last top-level clause keyword before the cursor
  const clauseRegex =
    /\b(SELECT|FROM|JOIN|ON|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|SET|VALUES)\b/gi;
  let lastClause = '';
  let lastClauseEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = clauseRegex.exec(beforeWordCollapsed)) !== null) {
    lastClause = m[1].toUpperCase().replace(/\s+/g, ' ');
    lastClauseEnd = m.index + m[0].length;
  }

  if (lastClause === 'FROM' || lastClause === 'JOIN') {
    const tailAfterClause = beforeWordCollapsed.slice(lastClauseEnd);
    // Comma-separated table in FROM clause: `FROM suspects s, |`
    if (lastClause === 'FROM' && /,\s*$/.test(tailAfterClause)) {
      return { kind: 'table', prefix };
    }
    // Right after table name (e.g. `FROM suspects |`): user may type alias or next clause keyword
    return { kind: 'after_table', prefix };
  }

  return {
    kind: 'clause_expression',
    clause: lastClause || 'START',
    prefix,
  };
}

function buildTableCompletionItem(table: DataTable, sortIndex: number): SqlCompletionItem {
  const colSummary = table.columns.map((c) => `${c.name} (${c.label} · ${c.type})`).join('、');
  return {
    label: table.name,
    insertText: table.name,
    kind: 'table',
    detail: `${table.label}（数据表）`,
    documentation: `${table.description}${colSummary ? `\n包含字段：${colSummary}` : ''}`,
    sortText: `0_table_${String(sortIndex).padStart(3, '0')}_${table.name}`,
    tableName: table.name,
  };
}

function buildColumnCompletionItem(
  col: Column,
  table: DataTable,
  insertName: string,
  sortIndex: number,
): SqlCompletionItem {
  const desc = col.description ? `${col.description}` : col.label;
  return {
    label: insertName,
    insertText: insertName,
    kind: 'column',
    detail: `${col.label} (${col.type})`,
    documentation: `${desc}\n所属表：${table.label} (${table.name}) · 类型：${col.type}`,
    sortText: `0_col_${String(sortIndex).padStart(3, '0')}_${insertName}`,
    tableName: table.name,
    columnType: col.type,
  };
}

function matchesPrefix(candidate: string, prefix: string): boolean {
  if (!prefix) return true;
  return candidate.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * Pure SQL completion resolver for unit tests and Monaco CompletionItemProvider.
 * Never leaks data values (`rows`) or out-of-scope tables.
 */
export function getSqlCompletions(
  sql: string,
  cursorPositionOrOffset: number | CursorPosition = sql.length,
  tables: DataTable[] = [],
): SqlCompletionItem[] {
  const offset =
    typeof cursorPositionOrOffset === 'number'
      ? Math.max(0, Math.min(cursorPositionOrOffset, sql.length))
      : positionToOffset(sql, cursorPositionOrOffset);

  const { masked, cursorInStringOrComment } = maskSqlCommentsAndStrings(sql, offset);
  if (cursorInStringOrComment) {
    return [];
  }

  const { statement, cursorInStatement } = isolateCurrentStatement(masked, offset);
  const scope = resolveActiveScope(statement, cursorInStatement, tables, false);
  const context = detectCursorContext(scope.text, scope.cursorInScope);

  // 1. Dot completion: `table.` or `alias.`
  if (context.kind === 'dot') {
    const qualLower = context.qualifier.toLowerCase();
    const matchedSources = scope.sources.filter(
      (s) =>
        s.alias?.toLowerCase() === qualLower ||
        (!s.alias && s.table.name.toLowerCase() === qualLower) ||
        s.table.name.toLowerCase() === qualLower,
    );

    let targetTable: DataTable | undefined = matchedSources[0]?.table;

    // Top-level snippet convenience: `SELECT suspects.` before writing `FROM suspects`
    if (!targetTable && !scope.isSubquery && !scope.hasFromClause && scope.sources.length === 0) {
      targetTable = scope.availableTables.find((t) => t.name.toLowerCase() === qualLower);
    }

    if (!targetTable) {
      return [];
    }

    return targetTable.columns
      .filter((col) => matchesPrefix(col.name, context.prefix))
      .map((col, idx) => buildColumnCompletionItem(col, targetTable, col.name, idx));
  }

  // 2. FROM / JOIN table completion
  if (context.kind === 'table') {
    return scope.availableTables
      .filter((t) => matchesPrefix(t.name, context.prefix))
      .map((t, idx) => buildTableCompletionItem(t, idx));
  }

  // 3. Immediately after table name in FROM/JOIN (e.g. `FROM suspects |`): only clause keywords
  if (context.kind === 'after_table') {
    return getKeywordAndFunctionCompletions(context.prefix, false);
  }

  // 4. Expression clauses (SELECT, WHERE, ON, GROUP BY, HAVING, ORDER BY, etc.)
  const items: SqlCompletionItem[] = [];

  // Conservative rule: only suggest columns from resolved sources in the current query scope.
  // If the statement/subquery has no valid FROM/JOIN source yet, do NOT guess or leak outer/other table columns.
  if (scope.sources.length > 0 && context.clause !== 'START') {
    const colFrequency = new Map<string, number>();
    for (const src of scope.sources) {
      const seenInTable = new Set<string>();
      for (const col of src.table.columns) {
        const key = col.name.toLowerCase();
        if (!seenInTable.has(key)) {
          seenInTable.add(key);
          colFrequency.set(key, (colFrequency.get(key) ?? 0) + 1);
        }
      }
    }

    let colSortIdx = 0;
    const emittedLabels = new Set<string>();

    for (const src of scope.sources) {
      const qualifier = src.alias ?? src.table.name;
      for (const col of src.table.columns) {
        const isDuplicate = (colFrequency.get(col.name.toLowerCase()) ?? 0) > 1;
        const candidateName = isDuplicate && qualifier ? `${qualifier}.${col.name}` : col.name;

        const matches =
          matchesPrefix(candidateName, context.prefix) ||
          (isDuplicate && matchesPrefix(col.name, context.prefix));

        if (matches && !emittedLabels.has(candidateName.toLowerCase())) {
          emittedLabels.add(candidateName.toLowerCase());
          items.push(buildColumnCompletionItem(col, src.table, candidateName, colSortIdx++));
        }
      }
    }
  }

  items.push(...getKeywordAndFunctionCompletions(context.prefix, true));
  return items;
}

function getKeywordAndFunctionCompletions(prefix: string, includeFunctions: boolean): SqlCompletionItem[] {
  const results: SqlCompletionItem[] = [];

  if (includeFunctions) {
    SQL_FUNCTIONS.forEach((fn, idx) => {
      if (matchesPrefix(fn.name, prefix)) {
        results.push({
          label: fn.name,
          insertText: fn.name,
          kind: 'function',
          detail: `${fn.label} · SQL 函数`,
          documentation: fn.documentation,
          sortText: `1_fn_${String(idx).padStart(3, '0')}_${fn.name}`,
        });
      }
    });
  }

  SQL_KEYWORDS.forEach((kw, idx) => {
    if (matchesPrefix(kw.keyword, prefix)) {
      results.push({
        label: kw.keyword,
        insertText: kw.keyword,
        kind: 'keyword',
        detail: kw.detail,
        documentation: kw.documentation,
        sortText: `2_kw_${String(idx).padStart(3, '0')}_${kw.keyword}`,
      });
    }
  });

  return results;
}

/**
 * Resolves Chinese hover documentation for tables, columns, SQL functions, or keywords at `cursorPositionOrOffset`.
 */
export function getSqlHover(
  sql: string,
  cursorPositionOrOffset: number | CursorPosition,
  tables: DataTable[] = [],
): SqlHoverInfo | null {
  const offset =
    typeof cursorPositionOrOffset === 'number'
      ? Math.max(0, Math.min(cursorPositionOrOffset, sql.length))
      : positionToOffset(sql, cursorPositionOrOffset);

  const { masked, cursorInStringOrComment } = maskSqlCommentsAndStrings(sql, offset);
  if (cursorInStringOrComment) return null;

  // Extract token around offset (including optional `qualifier.identifier`)
  let start = offset;
  while (start > 0 && /[\w$.]/.test(sql[start - 1])) start--;
  let end = offset;
  while (end < sql.length && /[\w$]/.test(sql[end])) end++;

  const fullToken = sql.slice(start, end);
  if (!fullToken) return null;

  const { statement, cursorInStatement } = isolateCurrentStatement(masked, offset);
  const scope = resolveActiveScope(statement, cursorInStatement, tables, false);

  const parts = fullToken.split('.');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const qualLower = parts[0].toLowerCase();
    const colLower = parts[1].toLowerCase();
    const src =
      scope.sources.find(
        (s) => s.alias?.toLowerCase() === qualLower || s.table.name.toLowerCase() === qualLower,
      ) ??
      (!scope.isSubquery
        ? scope.availableTables
            .filter((t) => t.name.toLowerCase() === qualLower)
            .map((table) => ({ table, alias: undefined }))[0]
        : undefined);

    const col = src?.table.columns.find((c) => c.name.toLowerCase() === colLower);
    if (src && col) {
      return {
        title: `${src.table.name}.${col.name}`,
        detail: `${col.label} (${col.type})`,
        documentation: `${col.description ?? col.label}\n数据表：${src.table.label} (${src.table.name})`,
        range: { startOffset: start, endOffset: end },
      };
    }
  }

  const wordLower = parts[parts.length - 1].toLowerCase();

  // Check column in active scope sources
  for (const src of scope.sources) {
    const col = src.table.columns.find((c) => c.name.toLowerCase() === wordLower);
    if (col) {
      return {
        title: `${src.table.name}.${col.name}`,
        detail: `${col.label} (${col.type})`,
        documentation: `${col.description ?? col.label}\n数据表：${src.table.label} (${src.table.name})`,
        range: { startOffset: start, endOffset: end },
      };
    }
  }

  // Check table in available tables
  const matchedTable = scope.availableTables.find((t) => t.name.toLowerCase() === wordLower);
  if (matchedTable) {
    const colList = matchedTable.columns.map((c) => `${c.name} (${c.label}: ${c.type})`).join('、');
    return {
      title: matchedTable.name,
      detail: `${matchedTable.label}（数据表）`,
      documentation: `${matchedTable.description}${colList ? `\n字段：${colList}` : ''}`,
      range: { startOffset: start, endOffset: end },
    };
  }

  // Check SQL function
  const matchedFn = SQL_FUNCTIONS.find((fn) => fn.name.toLowerCase() === wordLower);
  if (matchedFn) {
    return {
      title: matchedFn.label,
      detail: 'SQL 内置函数',
      documentation: matchedFn.documentation,
      range: { startOffset: start, endOffset: end },
    };
  }

  // Check SQL keyword
  const matchedKw = SQL_KEYWORDS.find((kw) => kw.keyword.toLowerCase() === wordLower);
  if (matchedKw) {
    return {
      title: matchedKw.keyword,
      detail: matchedKw.detail,
      documentation: matchedKw.documentation,
      range: { startOffset: start, endOffset: end },
    };
  }

  return null;
}

/**
 * Resolves SQL function signature parameter hints when the cursor is inside a function call `FN(arg1, arg2)`.
 */
export function getSqlSignatureHelp(
  sql: string,
  cursorPositionOrOffset: number | CursorPosition,
): SqlSignatureHelp | null {
  const offset =
    typeof cursorPositionOrOffset === 'number'
      ? Math.max(0, Math.min(cursorPositionOrOffset, sql.length))
      : positionToOffset(sql, cursorPositionOrOffset);

  const { masked, cursorInStringOrComment } = maskSqlCommentsAndStrings(sql, offset);
  if (cursorInStringOrComment) return null;

  // Walk backwards from offset to find the nearest enclosing open parenthesis `(`
  let depth = 0;
  let commaCount = 0;
  let openParenPos = -1;

  for (let i = offset - 1; i >= 0; i--) {
    const ch = masked[i];
    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        openParenPos = i;
        break;
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      commaCount++;
    } else if (ch === ';' && depth === 0) {
      break;
    }
  }

  if (openParenPos === -1) return null;

  const beforeParen = masked.slice(0, openParenPos);
  const fnMatch = /([A-Za-z_][\w$]*)\s*$/.exec(beforeParen);
  if (!fnMatch) return null;

  const fnNameUpper = fnMatch[1].toUpperCase();
  const signature = SQL_FUNCTIONS.find((fn) => fn.name === fnNameUpper);
  if (!signature) return null;

  const activeParameter = Math.min(commaCount, Math.max(0, signature.parameters.length - 1));
  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter,
  };
}

/**
 * Translates common SQLite engine execution errors into clear Chinese explanations while keeping identifiers.
 */
export function formatSqlErrorToChinese(rawError: string): string {
  const trimmed = rawError.trim();
  if (!trimmed) return '';

  // Already contains Chinese characters
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return trimmed;
  }

  const noSuchTable = /no such table:\s*([^\s:]+)/i.exec(trimmed);
  if (noSuchTable) {
    return `找不到数据表 "${noSuchTable[1]}"，请检查 FROM 或 JOIN 后的表名是否属于本案已解锁的数据表。`;
  }

  const noSuchCol = /no such column:\s*([^\s:]+)/i.exec(trimmed);
  if (noSuchCol) {
    return `找不到字段 "${noSuchCol[1]}"，请核对当前查询表中的字段名或表别名是否正确。`;
  }

  const ambiguousCol = /ambiguous column name:\s*([^\s:]+)/i.exec(trimmed);
  if (ambiguousCol) {
    return `字段名 "${ambiguousCol[1]}" 存在同名歧义，请在多表关联查询中使用 "表名.${ambiguousCol[1]}" 或 "别名.${ambiguousCol[1]}" 限定来源。`;
  }

  const syntaxNear = /near\s+"([^"]+)":\s*syntax error/i.exec(trimmed);
  if (syntaxNear) {
    return `SQL 语法错误（靠近 "${syntaxNear[1]}"），请检查关键字顺序、逗号、括号或引号是否完整配对。`;
  }

  const incompleteInput = /incomplete input/i.exec(trimmed);
  if (incompleteInput) {
    return 'SQL 语句尚未写完（括号、引号未闭合或子句不完整），请补全后再执行。';
  }

  const misuseOfAggregate = /misuse of aggregate:\s*([^\s:]+)/i.exec(trimmed);
  if (misuseOfAggregate) {
    return `聚合函数 "${misuseOfAggregate[1]}" 使用位置有误：WHERE 中不能直接使用聚合函数，请改用 GROUP BY 配合 HAVING 筛选。`;
  }

  return `查询执行失败：${trimmed}`;
}
