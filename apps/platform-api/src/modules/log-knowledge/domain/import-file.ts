// Reads an uploaded catalog import file (#1195 a, design v0.6 §6.2 ①): decides the type by content, enforces the
// limits and turns the file into `{headers, rows}`. Pure apart from the exceljs/csv-parse reads; nothing here
// touches a database. A file-level refusal creates no job; a cell the importer cannot take as plain text becomes
// a row-level parse error (`formula`, `merged`, `unsupported_cell`) kept with the row. Formulas are never evaluated.

import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_COLUMNS = 50;

export type ImportFileType = 'csv' | 'xlsx';

export type ImportFileRefusal =
  | 'file_too_large'
  | 'too_many_rows'
  | 'too_many_columns'
  | 'invalid_headers'
  | 'unsupported_type'
  | 'encoding'
  | 'sheet_count'
  | 'empty'
  | 'unreadable';

export interface ParseError {
  field: string;
  code: 'formula' | 'merged' | 'unsupported_cell';
}

export interface ParsedImportRow {
  /** `{<header>: <string>}`; a cell that could not be read as text is `''` and carries a `parseErrors` entry. */
  cells: Record<string, string>;
  parseErrors: ParseError[];
}

export type ParsedImportFile =
  | { ok: true; fileType: ImportFileType; headers: string[]; rows: ParsedImportRow[] }
  | { ok: false; code: ImportFileRefusal; status: 400 | 413 };

const REFUSAL_STATUS: Record<ImportFileRefusal, 400 | 413> = {
  file_too_large: 413,
  too_many_rows: 400,
  too_many_columns: 400,
  invalid_headers: 400,
  unsupported_type: 400,
  encoding: 400,
  sheet_count: 400,
  empty: 400,
  unreadable: 400,
};

const refuse = (code: ImportFileRefusal): ParsedImportFile => ({ ok: false, code, status: REFUSAL_STATUS[code] });

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/** The type is decided by content (zip signature = xlsx, anything else = text); the extension must agree. */
export function detectFileType(bytes: Uint8Array, fileName: string): ImportFileType | null {
  const lower = fileName.toLowerCase();
  const isZip = ZIP_SIGNATURE.every((b, i) => bytes[i] === b);
  if (isZip) return lower.endsWith('.xlsx') ? 'xlsx' : null;
  return lower.endsWith('.csv') ? 'csv' : null;
}

/** Header names: counted first (columns), then blank/duplicate checked; neither refusal builds any row object. */
function checkHeaders(headers: string[]): ImportFileRefusal | null {
  if (headers.length > IMPORT_MAX_COLUMNS) return 'too_many_columns';
  if (headers.length === 0) return 'empty';
  const seen = new Set<string>();
  for (const header of headers) {
    if (header === '' || seen.has(header)) return 'invalid_headers';
    seen.add(header);
  }
  return null;
}

function parseCsvBytes(bytes: Uint8Array): ParsedImportFile {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return refuse('encoding');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let records: string[][];
  try {
    records = parseCsv(text, { relax_column_count: false, skip_empty_lines: true, bom: false }) as string[][];
  } catch {
    return refuse('unreadable');
  }
  const [headerRow, ...dataRows] = records;
  if (!headerRow) return refuse('empty');
  const headers = headerRow.map((h) => h.trim());
  const headerRefusal = checkHeaders(headers);
  if (headerRefusal) return refuse(headerRefusal);
  if (dataRows.length === 0) return refuse('empty');
  if (dataRows.length > IMPORT_MAX_ROWS) return refuse('too_many_rows');
  const rows = dataRows.map((record) => ({
    cells: Object.fromEntries(headers.map((header, i) => [header, record[i] ?? ''])),
    parseErrors: [],
  }));
  return { ok: true, fileType: 'csv', headers, rows };
}

type CellRead = { text: string; error: ParseError['code'] | null };

function readCell(cell: ExcelJS.Cell): CellRead {
  if (cell.isMerged) return { text: '', error: 'merged' };
  const value = cell.value;
  if (value === null || value === undefined) return { text: '', error: null };
  if (typeof value === 'string') return { text: value, error: null };
  if (typeof value === 'number') return { text: String(value), error: null };
  if (typeof value === 'boolean') return { text: value ? 'true' : 'false', error: null };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { text: '', error: 'unsupported_cell' }
      : { text: value.toISOString(), error: null };
  }
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    return { text: '', error: 'formula' };
  }
  return { text: '', error: 'unsupported_cell' };
}

async function parseXlsxBytes(bytes: Uint8Array): Promise<ParsedImportFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    return refuse('unreadable');
  }
  if (workbook.worksheets.length !== 1) return refuse(workbook.worksheets.length === 0 ? 'empty' : 'sheet_count');
  const sheet = workbook.worksheets[0];
  if (!sheet) return refuse('empty');

  const headerRow = sheet.getRow(1);
  const headerCount = Math.max(headerRow.cellCount, headerRow.actualCellCount, 0);
  const columns = Math.max(sheet.columnCount, headerCount);
  const headers: string[] = [];
  let headerBad = false;
  for (let c = 1; c <= columns; c += 1) {
    const read = readCell(headerRow.getCell(c));
    if (read.error) headerBad = true;
    headers.push(read.text.trim());
  }
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  const refusal = checkHeaders(headers);
  if (refusal) return refuse(refusal);
  if (headerBad) return refuse('invalid_headers');

  const rows: ParsedImportRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: Record<string, string> = {};
    const parseErrors: ParseError[] = [];
    let any = false;
    headers.forEach((header, i) => {
      const cell = row.getCell(i + 1);
      const read = readCell(cell);
      cells[header] = read.text;
      if (read.error) {
        parseErrors.push({ field: header, code: read.error });
        any = true;
      } else if (read.text !== '') any = true;
    });
    if (!any) continue;
    rows.push({ cells, parseErrors });
    if (rows.length > IMPORT_MAX_ROWS) return refuse('too_many_rows');
  }
  if (rows.length === 0) return refuse('empty');
  return { ok: true, fileType: 'xlsx', headers, rows };
}

export async function parseImportFile(bytes: Uint8Array, fileName: string): Promise<ParsedImportFile> {
  if (bytes.byteLength > IMPORT_MAX_BYTES) return refuse('file_too_large');
  if (bytes.byteLength === 0) return refuse('empty');
  const fileType = detectFileType(bytes, fileName);
  if (!fileType) return refuse('unsupported_type');
  return fileType === 'csv' ? parseCsvBytes(bytes) : parseXlsxBytes(bytes);
}

export const refusalStatus = (code: ImportFileRefusal): 400 | 413 => REFUSAL_STATUS[code];
