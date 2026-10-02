/**
 * Table-owned export serialization (#173, 06 §15). Internal module: index.ts does not export it, so the
 * serializer stays a PlatformDataTable implementation detail — menus never build files themselves.
 * Export shows what the screen shows: a column whose cell turns a code into a label or formats a time
 * gives the same text via `exportValue`; numeric columns keep `number`.
 */
import { isProductionEnv } from '@ap/ui';
import type { PlatformColumn } from './PlatformDataTable';

type ExportPreferences = { visibility: Record<string, boolean>; pinning: { left?: string[] } };

/**
 * Visible, exportable columns in export order: left-pinned first (pinning order), then declaration order.
 * The `_select`/`_action` system columns never join (they are not `PlatformColumn`s).
 */
export function exportColumns<T>(columns: PlatformColumn<T>[], { visibility, pinning }: ExportPreferences): PlatformColumn<T>[] {
  const visible = columns.filter(c => c.exportable !== false && visibility[c.id] !== false);
  const left = pinning.left ?? [];
  const pinned = new Set(left);
  return [
    ...left.flatMap(id => visible.filter(c => c.id === id)),
    ...visible.filter(c => !pinned.has(c.id)),
  ];
}

/** One coerced cell value: `null`/`undefined`/`NaN`/`±Infinity` → '', boolean → TRUE/FALSE, number stays number, string stays string. */
export function exportCell<T>(column: PlatformColumn<T>, row: T): string | number {
  const raw = column.exportValue ? column.exportValue(row) : column.value ? column.value(row) : (row as Record<string, unknown>)[column.id];
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : '';
  if (typeof raw === 'boolean') return raw ? 'TRUE' : 'FALSE';
  if (typeof raw === 'string') return raw;
  // Object, array, Date: the column needs `exportValue`. Loud in dev so the missing mapping is caught before shipping; empty in production.
  if (!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) {
    throw new Error(`Table export: column "${column.id}" produced a ${typeof raw} value — give it exportValue (06 §15: export shows what the screen shows).`);
  }
  return '';
}

/** CSV cell: RFC 4180 quoting; formula-injection guard for string values only (numbers never get a prefix). */
function csvField(value: string | number, delimiter: ',' | '\t'): string {
  const text = typeof value === 'number' ? String(value) : guardFormula(value);
  return text.includes('"') || text.includes(delimiter) || text.includes('\r') || text.includes('\n')
    ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Prefix `'` when a string value could be read as a formula (=, +, -, @, TAB, CR — OWASP CSV injection). */
function guardFormula(text: string): string {
  const first = text.charAt(0);
  return first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r' ? `'${text}` : text;
}

/** UTF-8 BOM + CRLF + RFC 4180. The BOM keeps Korean readable in Excel. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell => csvField(cell, ',')).join(',')).join('\r\n') + '\r\n';
}

/** Clipboard TSV (#174): same coercion and guard; quote a value only when it holds a quote, tab or newline. */
export function toTsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map(row => row.map(cell => csvField(cell, '\t')).join('\t')).join('\n') + '\n';
}

/** Excel's per-cell text limit; longer strings are cut and marked so the cut is visible in the sheet. */
export const XLSX_CELL_MAX = 32_767;
const XLSX_TRUNCATED = '…(잘림)';
export function xlsxText(text: string): string {
  if (text.length <= XLSX_CELL_MAX) return text;
  let cut = XLSX_CELL_MAX - XLSX_TRUNCATED.length;
  // `length`/`slice` count UTF-16 units: back off one unit when the cut would leave a lone high surrogate (emoji, astral chars).
  const unit = text.charCodeAt(cut - 1);
  if (unit >= 0xd800 && unit <= 0xdbff) cut -= 1;
  return text.slice(0, cut) + XLSX_TRUNCATED;
}
/** Numbers stay number cells; strings become string cells as-is — no formula guard, a string cell is never evaluated. Empty → blank cell. */
function xlsxCell(value: string | number): string | number | null {
  return typeof value === 'number' ? value : value === '' ? null : xlsxText(value);
}

/**
 * XLSX workbook: sheet 1 "데이터"/"Data" (header + rows from the same serializer as CSV), sheet 2 "조회 정보"/"Query info"
 * (key/value rows describing what was exported). Sheet names follow the UI language. `write-excel-file/browser` is loaded with a runtime `import()` so it lands in its
 * own chunk — pages that never export never download it.
 */
const SHEET_NAMES = { ko: { data: '데이터', info: '조회 정보' }, en: { data: 'Data', info: 'Query info' } } as const;
export async function toXlsx(headers: string[], rows: (string | number)[][], info: [string, string | number][], lang: 'ko' | 'en' = 'ko'): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  return writeXlsxFile([
    { sheet: SHEET_NAMES[lang].data, data: [headers.map(xlsxText), ...rows.map(row => row.map(xlsxCell))] },
    { sheet: SHEET_NAMES[lang].info, data: info.map(([key, value]) => [key, xlsxCell(value)]) },
  ]).toBlob();
}

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/**
 * Clipboard `text/html` (#174): a plain `<table>` of the same cells as the TSV. Spreadsheets paste this flavor when it
 * is present and re-read it like typed input, so string cells get the same formula guard as the TSV (review P1-2).
 * String cells also carry Excel's text format (`mso-number-format:"\@"`) so leading zeros and long numeric ids paste
 * as text; an in-cell newline becomes Excel's same-cell break (the TSV quotes it). Numbers stay numbers.
 */
export function toClipboardHtml(headers: string[], rows: (string | number)[][]): string {
  const td = (value: string | number, tag: 'th' | 'td') => typeof value === 'number'
    ? `<${tag}>${value}</${tag}>`
    : `<${tag} style="mso-number-format:'\\@'">${escapeHtml(guardFormula(value)).replace(/\r\n|\r|\n/g, '<br style="mso-data-placement:same-cell">')}</${tag}>`;
  return `<table><thead><tr>${headers.map(h => td(h, 'th')).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(c => td(c, 'td')).join('')}</tr>`).join('')}</tbody></table>`;
}
