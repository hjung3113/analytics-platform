/** The SQL dialects whose lexical rules differ here: `[ ]` quotes an identifier only in mssql (in postgres it is an array
 * constructor or subscript, which may hold a live placeholder), and `$tag$` dollar quoting exists only in postgres. */
export type SqlDialect = 'postgres' | 'mssql';

/** Lexical skipping only; this is not a SQL parser or a read-only security boundary. */
function skippedEnd(sql: string, at: number, dialect: SqlDialect): number | undefined {
  const char = sql[at];
  if (char === "'" || char === '"' || (char === '[' && dialect === 'mssql')) {
    const close = char === '[' ? ']' : char;
    let i = at + 1;
    while (i < sql.length) {
      if (sql[i] === close) {
        if (sql[i + 1] === close) i += 2;
        else return i + 1;
      } else i++;
    }
    return sql.length;
  }
  if (sql.startsWith('--', at)) {
    const end = sql.indexOf('\n', at + 2);
    return end < 0 ? sql.length : end + 1;
  }
  if (sql.startsWith('/*', at)) {
    let depth = 1;
    let i = at + 2;
    while (i < sql.length && depth > 0) {
      if (sql.startsWith('/*', i)) { depth++; i += 2; }
      else if (sql.startsWith('*/', i)) { depth--; i += 2; }
      else i++;
    }
    return i;
  }
  if (char === '$' && dialect === 'postgres') {
    const tag = /^(?:\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/.exec(sql.slice(at))?.[0];
    if (tag) {
      const end = sql.indexOf(tag, at + tag.length);
      return end < 0 ? sql.length : end + tag.length;
    }
  }
  return undefined;
}

/** Unique placeholder names in appearance order; quoted text, comments and casts are ignored. */
export function sqlPlaceholders(sql: string, dialect: SqlDialect): string[] {
  const names = new Set<string>();
  for (let i = 0; i < sql.length;) {
    const end = skippedEnd(sql, i, dialect);
    if (end !== undefined) { i = end; continue; }
    if (sql.startsWith('::', i)) { i += 2; continue; }
    const match = sql[i] === ':' ? /^:([A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(i)) : null;
    if (match?.[1]) { names.add(match[1]); i += match[0].length; }
    else i++;
  }
  return [...names];
}

export function startsReadStatement(sql: string, dialect: SqlDialect): boolean {
  let i = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i] ?? '')) { i++; continue; }
    if (sql.startsWith('--', i) || sql.startsWith('/*', i)) {
      i = skippedEnd(sql, i, dialect) ?? sql.length;
      continue;
    }
    return /^(SELECT|WITH)\b/i.test(sql.slice(i));
  }
  return false;
}
