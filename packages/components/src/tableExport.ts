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
