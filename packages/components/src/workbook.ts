/**
 * Menu-declared multi-sheet Excel workbook (#860, 06 §15): the menu names the sheets and their rows (chart, summary, raw data,
 * query info…), the SDK checks Excel's sheet-name rules and the size limits and writes the file in the browser. The table's own
 * export (`tableExport.ts`) shares the cell rules. `write-excel-file/browser` stays a lazy chunk.
 */
import { EXPORT_ROW_CAP } from './tableMessages';
import { xlsxText } from './tableExport';

/** One cell: a number stays a number cell, a string stays a string cell (never a formula), `null` is a blank cell. */
export type WorkbookCell = string | number | null;
export type WorkbookSheet = {
  /** Sheet tab name: 1–31 characters, none of `: \ / ? * [ ]`, not starting or ending with `'`, unique ignoring case. */
  name: string;
  /** Optional header row written above `rows`. */
  header?: readonly string[];
  rows: readonly (readonly WorkbookCell[])[];
};

/**
 * Size limits of one browser-built workbook. The file is built in memory on the user's machine, so the limits bound memory,
 * not Excel: rows per sheet match the table export cap, and the cell total keeps a many-sheet workbook from multiplying it.
 * Larger exports belong to the server export (#555).
 */
export const WORKBOOK_LIMITS = { sheets: 20, rowsPerSheet: EXPORT_ROW_CAP, cells: 2_000_000, columns: 16_384 } as const;

export type WorkbookErrorCode =
  | 'no-sheets' | 'too-many-sheets' | 'too-many-rows' | 'too-many-columns' | 'too-many-cells'
  | 'sheet-name-empty' | 'sheet-name-too-long' | 'sheet-name-invalid' | 'sheet-name-duplicate';

/** A workbook the SDK refuses to write. Row, column and cell codes are the data's (tell the user to narrow); the rest are the menu's declaration bug. */
export class WorkbookError extends Error {
  constructor(readonly code: WorkbookErrorCode, readonly sheet?: string) {
    super(`Workbook: ${code}${sheet === undefined ? '' : ` (sheet "${sheet}")`}`);
    this.name = 'WorkbookError';
  }
}

const SHEET_NAME_MAX = 31;
// C0 controls too: the writer strips them silently, so `'a\u0001'` and `'a'` would collide in the file.
const FORBIDDEN = /[:\\/?*[\]\u0000-\u001f]/;

/** Throws `WorkbookError` for the first rule the sheets break; returns normally when Excel and the limits accept them. */
export function checkWorkbook(sheets: readonly WorkbookSheet[]): void {
  if (sheets.length === 0) throw new WorkbookError('no-sheets');
  if (sheets.length > WORKBOOK_LIMITS.sheets) throw new WorkbookError('too-many-sheets');
  const seen = new Set<string>();
  let cells = 0;
  for (const sheet of sheets) {
    const { name } = sheet;
    if (name.trim() === '') throw new WorkbookError('sheet-name-empty', name);
    if (name.length > SHEET_NAME_MAX) throw new WorkbookError('sheet-name-too-long', name);
    // 'History' is reserved by Excel (its change-tracking sheet).
    if (FORBIDDEN.test(name) || name.startsWith("'") || name.endsWith("'") || name.toLowerCase() === 'history') throw new WorkbookError('sheet-name-invalid', name);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new WorkbookError('sheet-name-duplicate', name);
    seen.add(key);
    if (sheet.rows.length > WORKBOOK_LIMITS.rowsPerSheet) throw new WorkbookError('too-many-rows', name);
    // Excel's sheet width (XFD); a wider row makes a file Excel has to repair.
    if ((sheet.header?.length ?? 0) > WORKBOOK_LIMITS.columns || sheet.rows.some(row => row.length > WORKBOOK_LIMITS.columns)) throw new WorkbookError('too-many-columns', name);
    cells += (sheet.header?.length ?? 0) + sheet.rows.reduce((sum, row) => sum + row.length, 0);
    if (cells > WORKBOOK_LIMITS.cells) throw new WorkbookError('too-many-cells', name);
  }
}

/** A non-finite number or `''` becomes a blank cell; strings keep their text (a wall-clock `2026-09-25T09:00:00` is not parsed) and are cut at Excel's cell limit. */
export function workbookCell(value: WorkbookCell): string | number | null {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return value === '' ? null : xlsxText(value);
}

const aborted = () => new DOMException('Aborted', 'AbortError');

/** Checks and writes the workbook (`.xlsx` Blob). Rejects with `WorkbookError`, or with an `AbortError` once `signal` aborts. */
export async function toWorkbookXlsx(sheets: readonly WorkbookSheet[], signal?: AbortSignal): Promise<Blob> {
  checkWorkbook(sheets);
  if (signal?.aborted) throw aborted();
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  if (signal?.aborted) throw aborted();
  const blob = await writeXlsxFile(sheets.map(sheet => ({
    sheet: sheet.name,
    data: [...(sheet.header ? [sheet.header.map(workbookCell)] : []), ...sheet.rows.map(row => row.map(workbookCell))],
  }))).toBlob();
  if (signal?.aborted) throw aborted();
  return blob;
}
