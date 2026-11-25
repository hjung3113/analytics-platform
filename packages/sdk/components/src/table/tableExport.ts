import { formatText } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';

/**
 * Table-owned export serialization (#173, 06 §15). Internal module: index.ts does not export it, so the
 * serializer stays a PlatformDataTable implementation detail — menus never build files themselves.
 * Export shows what the screen shows: a column whose cell turns a code into a label or formats a time
 * gives the same text via `exportValue`; numeric columns keep `number`.
 */
import { isDevelopment } from '@ap/ui';
import type { PlatformColumn } from './PlatformDataTable';
import { groupedOrder, groupedPins } from './columnOrder';
import { columnGroupLabel, type ColumnGroups } from './columnGroups';

type ExportPreferences = { visibility: Record<string, boolean>; pinning: { left?: string[] }; order?: string[] };

/**
 * Visible, exportable columns in export order = the displayed order (#556a): left-pinned first, then the rest; both in the saved column
 * order, which is the declaration order (pins: pinning order) while nobody has reordered.
 * The `_select`/`_action` system columns never join (they are not `PlatformColumn`s).
 */
export function exportColumns<T>(columns: PlatformColumn<T>[], { visibility, pinning, order = [] }: ExportPreferences): PlatformColumn<T>[] {
  const effective = groupedOrder(columns, order);
  const left = groupedPins(columns, pinning.left ?? [], effective, visibility, order.length > 0);
  const pinned = new Set(left);
  const visible = effective.flatMap(id => columns.filter(c => c.id === id && c.exportable !== false && visibility[c.id] !== false));
  return [
    ...left.flatMap(id => visible.filter(c => c.id === id)),
    ...visible.filter(c => !pinned.has(c.id)),
  ];
}

/** Backward-compatible flat headers, or multi-row headers with explicit merged-cell fills. */
export type ExportHeaderCell = string | { value: string; columnSpan: number } | null;
export type ExportHeaders = string[] | ExportHeaderCell[][];
const headerRows = (headers: ExportHeaders): ExportHeaderCell[][] => Array.isArray(headers[0]) ? headers as ExportHeaderCell[][] : [headers as string[]];

export function exportHeaders<T>(columns: PlatformColumn<T>[], labels: ColumnGroups = {}): { flat: string[]; rows: ExportHeaders } {
  const depth = Math.max(0, ...columns.map(c => c.columnGroup?.length ?? 0));
  if (depth === 0) { const flat = columns.map(c => c.header); return { flat, rows: flat }; }
  const rows: ExportHeaderCell[][] = Array.from({ length: depth }, (_, level) => {
    const row: ExportHeaderCell[] = [];
    for (let index = 0; index < columns.length;) {
      const id = columns[index].columnGroup?.[level];
      if (id === undefined) { row.push(''); index += 1; continue; }
      const path = JSON.stringify(columns[index].columnGroup?.slice(0, level + 1));
      let end = index + 1;
      while (end < columns.length && JSON.stringify(columns[end].columnGroup?.slice(0, level + 1)) === path) end += 1;
      row.push({ value: columnGroupLabel(labels, id), columnSpan: end - index }, ...Array<null>(end - index - 1).fill(null));
      index = end;
    }
    return row;
  });
  rows.push(columns.map(c => c.header));
  return { flat: columns.map(c => [...(c.columnGroup ?? []).map(id => columnGroupLabel(labels, id)), c.header].join(' › ')), rows };
}

/** One coerced cell value: `null`/`undefined`/`NaN`/`±Infinity` → '', boolean → TRUE/FALSE, number stays number, string stays string. */
export function exportCell<T>(column: PlatformColumn<T>, row: T): string | number {
  const raw = column.exportValue ? column.exportValue(row) : column.value ? column.value(row) : (row as Record<string, unknown>)[column.id];
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : '';
  if (typeof raw === 'boolean') return raw ? 'TRUE' : 'FALSE';
  if (typeof raw === 'string') return raw;
  // Object, array, Date: the column needs `exportValue`. Loud in dev so the missing mapping is caught before shipping; empty in production.
  if (isDevelopment()) {
    throw new Error(`Table export: column "${column.id}" produced a ${typeof raw} value — give it exportValue (06 §15: export shows what the screen shows).`);
  }
  return '';
}

/** A cell the SDK built itself (a wall-clock time such as `+010000-01-01T12:34:56.789`): RFC 4180 quoting, no formula prefix (#2792). */
export class CsvVerbatim { constructor(readonly text: string) {} }
type CsvCell = string | number | CsvVerbatim;

/** CSV cell: RFC 4180 quoting; formula-injection guard for string values only (numbers and SDK-built `CsvVerbatim` never get a prefix). */
function csvField(value: CsvCell, delimiter: ',' | '\t'): string {
  const text = typeof value === 'number' ? String(value) : value instanceof CsvVerbatim ? value.text : guardFormula(value);
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
  return toCsvDocument(null, headers, rows);
}

/** Chart CSV (#297): the same framing with one leading `#` meta line before the header. The meta line is quoted like any field, so a title holding a comma stays one cell. */
export function toCsvDocument(meta: string | null, headers: string[], rows: CsvCell[][]): string {
  return '\uFEFF' + (meta === null ? '' : csvField(meta, ',') + '\r\n')
    + [headers, ...rows].map(row => row.map(cell => csvField(cell, ',')).join(',')).join('\r\n') + '\r\n';
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

/**
 * The one XLSX cell rule for the table export and the workbook export (#891): a finite number stays a number cell; a non-finite number,
 * `''` or `null` is a blank cell; a string is a string cell as-is (no formula guard — a string cell is never evaluated; a wall-clock
 * `2026-09-25T09:00:00` is not parsed) cut at Excel's cell limit.
 */
export function xlsxCell(value: string | number | null): string | number | null {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return value === '' ? null : xlsxText(value);
}

/**
 * XLSX workbook: sheet 1 "데이터"/"Data" (header + rows from the same serializer as CSV), sheet 2 "조회 정보"/"Query info"
 * (key/value rows describing what was exported). Sheet names follow the UI language. `write-excel-file/browser` is loaded with a runtime `import()` so it lands in its
 * own chunk — pages that never export never download it.
 */
export async function toXlsx(headers: ExportHeaders, rows: (string | number)[][], info: [string, string | number][], lang: 'ko' | 'en' = 'ko'): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  return writeXlsxFile([
    { sheet: formatText(COMPONENTS_MESSAGES.tableSheetData, lang), data: [...headerRows(headers).map(row => row.map(cell => {
      if (cell === null) return null;
      return typeof cell === 'string' ? xlsxText(cell) : { ...cell, value: xlsxText(cell.value) };
    })), ...rows.map(row => row.map(xlsxCell))] },
    { sheet: formatText(COMPONENTS_MESSAGES.tableSheetInfo, lang), data: info.map(([key, value]) => [key, xlsxCell(value)]) },
  ]).toBlob();
}

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/**
 * Clipboard `text/html` (#174): a plain `<table>` of the same cells as the TSV. Spreadsheets paste this flavor when it
 * is present and re-read it like typed input, so string cells get the same formula guard as the TSV (review P1-2).
 * String cells also carry Excel's text format (`mso-number-format:"\@"`) so leading zeros and long numeric ids paste
 * as text; an in-cell newline becomes Excel's same-cell break (the TSV quotes it). Numbers stay numbers.
 */
export function toClipboardHtml(headers: ExportHeaders, rows: (string | number)[][]): string {
  const td = (value: string | number, tag: 'th' | 'td') => typeof value === 'number'
    ? `<${tag}>${value}</${tag}>`
    : `<${tag} style="mso-number-format:'\\@'">${escapeHtml(guardFormula(value)).replace(/\r\n|\r|\n/g, '<br style="mso-data-placement:same-cell">')}</${tag}>`;
  const head = headerRows(headers).map(row => `<tr>${row.map(cell => {
    if (cell === null) return '';
    if (typeof cell === 'string') return td(cell, 'th');
    return td(cell.value, 'th').replace('<th ', `<th colspan="${cell.columnSpan}" `);
  }).join('')}</tr>`).join('');
  return `<table><thead>${head}</thead><tbody>${rows.map(row => `<tr>${row.map(c => td(c, 'td')).join('')}</tr>`).join('')}</tbody></table>`;
}
