// CSV document for the import report (#1195 b). The same rules as the SDK table export
// (`packages/sdk/components/src/table/tableExport.ts` `guardFormula`/`csvField`/`toCsvDocument`), copied because the
// server must not depend on the SDK: RFC 4180 quoting, CRLF, a UTF-8 BOM so Excel reads Korean, and every cell
// guarded against formula injection (OWASP CSV injection).

/** Prefix `'` when a cell could be read as a formula: it starts with = + - @ TAB or CR. */
export function guardFormula(text: string): string {
  const first = text.charAt(0);
  return first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r'
    ? `'${text}`
    : text;
}

export function csvField(value: string): string {
  const text = guardFormula(value);
  return text.includes('"') || text.includes(',') || text.includes('\r') || text.includes('\n')
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

export function toCsvDocument(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}
