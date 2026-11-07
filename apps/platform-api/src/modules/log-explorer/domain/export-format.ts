// The two export formats (design log-explorer §4.1): CSV and JSONL, one row of the Source per line, columns `EXPORT_COLUMNS`. Pure.
// CSV is a spreadsheet's input, so a text cell that a spreadsheet would run as a formula is neutralised: a cell that starts with
// `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe. (OWASP "CSV injection".) JSONL needs no such step.

import { EXPORT_COLUMNS, type SourceRow } from '@ap/contract-schemas';

type Format = 'csv' | 'jsonl';

const FORMULA_START = /^[=+\-@\t\r]/;

/** The cell text of one value: formula-safe and quoted when it holds a separator, a quote or a line break. */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const cellsOf = (row: SourceRow) => EXPORT_COLUMNS.map((column) => row[column]);

export function exportHeader(format: Format): string {
  return format === 'csv' ? `${EXPORT_COLUMNS.join(',')}\r\n` : '';
}

export function exportLine(format: Format, row: SourceRow): string {
  if (format === 'csv') return `${cellsOf(row).map(csvCell).join(',')}\r\n`;
  const record: Record<string, string | number | boolean | null> = {};
  for (const column of EXPORT_COLUMNS) record[column] = row[column];
  return `${JSON.stringify(record)}\n`;
}
