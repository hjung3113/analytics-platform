// Reads an uploaded catalog import file (#1195 a, design v0.6 §6.2 ①): decides the type by content, enforces the
// limits and turns the file into `{headers, rows}`. Pure apart from the exceljs/csv-parse reads; nothing here
// touches a database. A file-level refusal creates no job; a cell the importer cannot take as plain text becomes
// a row-level parse error (`formula`, `merged`, `unsupported_cell`) kept with the row. Formulas are never evaluated.

import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_COLUMNS = 50;
/** A row index above this is refused: a sparse sheet must not make the parser walk or allocate a huge gap. */
export const IMPORT_MAX_SHEET_ROW = 100_000;
/** XLSX zip budgets, counted on the bytes the inflater actually emits (header sizes are never trusted). */
export const IMPORT_ZIP_MAX_ENTRIES = 200;
export const IMPORT_ZIP_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
export const IMPORT_ZIP_MAX_ENTRY_BYTES = 25 * 1024 * 1024;

export type ImportFileType = 'csv' | 'xlsx';

export type ImportFileRefusal =
  | 'file_too_large'
  | 'too_many_rows'
  | 'too_many_columns'
  | 'invalid_headers'
  | 'missing_header'
  | 'duplicate_header'
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
  | { ok: false; code: ImportFileRefusal; status: 400 | 413; detail?: string[] };

/** A header-level refusal decided by the caller (a model upload recognizes its headers; #1195 b2). */
export interface HeaderFailure {
  code: 'missing_header' | 'duplicate_header';
  /** The header texts (or, for a missing header, the expected names) the answer names. */
  headers: string[];
}
export interface ParseOptions {
  /** Runs after the blank-header check and replaces the identical-header refusal (`invalid_headers`) when set. */
  recognizeHeaders?: (headers: string[]) => HeaderFailure | null;
}

const REFUSAL_STATUS: Record<ImportFileRefusal, 400 | 413> = {
  file_too_large: 413,
  too_many_rows: 400,
  too_many_columns: 400,
  invalid_headers: 400,
  missing_header: 400,
  duplicate_header: 400,
  unsupported_type: 400,
  encoding: 400,
  sheet_count: 400,
  empty: 400,
  unreadable: 400,
};

const refuse = (code: ImportFileRefusal, detail?: string[]): ParsedImportFile => ({
  ok: false,
  code,
  status: REFUSAL_STATUS[code],
  ...(detail ? { detail } : {}),
});

type HeaderRefusal = { code: ImportFileRefusal; detail?: string[] };
const refuseHeaders = (r: HeaderRefusal): ParsedImportFile => refuse(r.code, r.detail);

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/** The type is decided by content (zip signature = xlsx, anything else = text); the extension must agree. */
export function detectFileType(bytes: Uint8Array, fileName: string): ImportFileType | null {
  const lower = fileName.toLowerCase();
  const isZip = ZIP_SIGNATURE.every((b, i) => bytes[i] === b);
  if (isZip) return lower.endsWith('.xlsx') ? 'xlsx' : null;
  return lower.endsWith('.csv') ? 'csv' : null;
}

/** Header names: counted first (columns), then blank/duplicate checked; neither refusal builds any row object. */
function checkHeaders(headers: string[], options?: ParseOptions): HeaderRefusal | null {
  if (headers.length > IMPORT_MAX_COLUMNS) return { code: 'too_many_columns' };
  if (headers.length === 0) return { code: 'empty' };
  if (headers.some((header) => header === '')) return { code: 'invalid_headers' };
  const failure = options?.recognizeHeaders?.(headers);
  if (failure) return { code: failure.code, detail: failure.headers };
  if (new Set(headers).size !== headers.length) return { code: 'invalid_headers' };
  return null;
}

function parseCsvBytes(bytes: Uint8Array, options?: ParseOptions): ParsedImportFile {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return refuse('encoding');
  }
  return parseCsvText(text, { delimiter: ',', maxRows: IMPORT_MAX_ROWS }, options);
}

/**
 * The one CSV parser: an upload and pasted text both end here, differing only in the delimiter and the row limit.
 * A leading BOM is dropped.
 */
function parseCsvText(
  input: string,
  limits: { delimiter: ',' | '\t'; maxRows: number },
  options?: ParseOptions,
): ParsedImportFile {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  let records: string[][];
  try {
    // `to` stops the reader one record past the limit (header + rows + 1) instead of materializing the whole file.
    records = parseCsv(text, {
      delimiter: limits.delimiter,
      relax_column_count: false,
      skip_empty_lines: true,
      bom: false,
      to: limits.maxRows + 2,
      max_record_size: IMPORT_MAX_BYTES,
    }) as string[][];
  } catch {
    return refuse('unreadable');
  }
  const [headerRow, ...dataRows] = records;
  if (!headerRow) return refuse('empty');
  const headers = headerRow.map((h) => h.trim());
  const headerRefusal = checkHeaders(headers, options);
  if (headerRefusal) return refuseHeaders(headerRefusal);
  if (dataRows.length === 0) return refuse('empty');
  if (dataRows.length > limits.maxRows) return refuse('too_many_rows');
  const rows = dataRows.map((record) => ({
    cells: Object.fromEntries(headers.map((header, i) => [header, record[i] ?? ''])),
    parseErrors: [],
  }));
  return { ok: true, fileType: 'csv', headers, rows };
}

/** Pasted text (from Excel, or a CSV the browser read; #1195 b3): at most 256 KiB of UTF-8 and 1,000 data rows. */
export const PASTE_MAX_BYTES = 256 * 1024;
export const PASTE_MAX_ROWS = 1000;

/** Tab when the first non-empty line holds a tab (Excel copies tab-separated), else comma. */
export function pasteDelimiter(text: string): ',' | '\t' {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const first = body.split(/\r\n|\n|\r/).find((line) => line.trim() !== '');
  return first?.includes('\t') ? '\t' : ',';
}

/** Never looks at a file name or extension: the text is CSV-shaped by construction. Same refusals as an upload. */
export function parsePastedText(text: string, options?: ParseOptions): ParsedImportFile {
  if (Buffer.byteLength(text, 'utf8') > PASTE_MAX_BYTES) return refuse('file_too_large');
  if (text.trim() === '') return refuse('empty');
  return parseCsvText(text, { delimiter: pasteDelimiter(text), maxRows: PASTE_MAX_ROWS }, options);
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

class ImportLimit extends Error {
  constructor(readonly code: ImportFileRefusal) {
    super(code);
  }
}

/** JSZip's streaming read of one entry; it exists at runtime but is missing from the package's typings. */
interface EntryStream {
  on(event: 'data', cb: (chunk: Uint8Array) => void): EntryStream;
  on(event: 'error', cb: (err: unknown) => void): EntryStream;
  on(event: 'end', cb: () => void): EntryStream;
  pause(): EntryStream;
  resume(): EntryStream;
}
type StreamableEntry = JSZip.JSZipObject & { internalStream(type: 'uint8array'): EntryStream };

/**
 * Opens the zip and streams every entry through the inflater, counting the bytes it really emits and aborting at the
 * budget. Runs before ExcelJS sees the file, so a small archive that inflates hugely never reaches it.
 */
async function checkZipBudgets(bytes: Uint8Array): Promise<ImportFileRefusal | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return 'unreadable';
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (Object.keys(zip.files).length > IMPORT_ZIP_MAX_ENTRIES) return 'file_too_large';
  let total = 0;
  for (const entry of entries) {
    let entryBytes = 0;
    const outcome = await new Promise<ImportFileRefusal | null>((resolve) => {
      let stopped = false;
      let stream: EntryStream | null = (entry as StreamableEntry).internalStream('uint8array');
      stream
        .on('data', (chunk: Uint8Array) => {
          if (stopped) return;
          entryBytes += chunk.byteLength;
          total += chunk.byteLength;
          if (entryBytes > IMPORT_ZIP_MAX_ENTRY_BYTES || total > IMPORT_ZIP_MAX_TOTAL_BYTES) {
            // Bound: the pako call already running finishes its current compressed block (JSZip feeds at most
            // 16 KiB of compressed input per block); that output is only counted, never kept. No further block is
            // read: the stream is paused, its handlers turn inert (JSZip has no way to remove them) and the
            // reference is dropped.
            stopped = true;
            stream?.pause();
            stream = null;
            resolve('file_too_large');
          }
        })
        .on('error', () => {
          if (!stopped) resolve('unreadable');
        })
        .on('end', () => {
          if (!stopped) resolve(null);
        })
        .resume();
    });
    if (outcome) return outcome;
  }
  return null;
}

/** A cell that carries something: any value, except a string of only whitespace. */
const hasContent = (cell: ExcelJS.Cell): boolean => {
  const value = cell.value;
  if (value === null || value === undefined) return false;
  return typeof value !== 'string' || value.trim() !== '';
};

async function parseXlsxBytes(bytes: Uint8Array, options?: ParseOptions): Promise<ParsedImportFile> {
  const budget = await checkZipBudgets(bytes);
  if (budget) return refuse(budget);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    return refuse('unreadable');
  }
  if (workbook.worksheets.length !== 1) return refuse(workbook.worksheets.length === 0 ? 'empty' : 'sheet_count');
  const sheet = workbook.worksheets[0];
  if (!sheet) return refuse('empty');

  // Walk only rows that exist and hold a value (never the gaps), stopping at the first limit.
  const dataRows: ExcelJS.Row[] = [];
  let width = 0;
  try {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > IMPORT_MAX_SHEET_ROW) throw new ImportLimit('too_many_rows');
      let populated = false;
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (col > width && hasContent(cell)) width = col;
        const read = readCell(cell);
        if (read.error || read.text !== '') populated = true;
      });
      // Same empty-row rule as the row loop below: a row of empty strings never counts toward the limit.
      if (rowNumber > 1 && populated) {
        dataRows.push(row);
        if (dataRows.length > IMPORT_MAX_ROWS) throw new ImportLimit('too_many_rows');
      }
    });
  } catch (err) {
    if (err instanceof ImportLimit) return refuse(err.code);
    throw err;
  }
  // The used width is judged before any trimming: data in column 51 is too wide, not silently dropped.
  if (width > IMPORT_MAX_COLUMNS) return refuse('too_many_columns');

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  let headerBad = false;
  for (let c = 1; c <= width; c += 1) {
    const read = readCell(headerRow.getCell(c));
    if (read.error) headerBad = true;
    headers.push(read.text.trim());
  }
  // A blank header inside the used width (so over a column that holds data) is refused by checkHeaders;
  // trailing columns that hold nothing but formatting never count toward the width.
  const refusal = checkHeaders(headers, options);
  if (refusal) return refuseHeaders(refusal);
  if (headerBad) return refuse('invalid_headers');

  const rows: ParsedImportRow[] = [];
  for (const row of dataRows) {
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
  }
  if (rows.length === 0) return refuse('empty');
  return { ok: true, fileType: 'xlsx', headers, rows };
}

export async function parseImportFile(
  bytes: Uint8Array,
  fileName: string,
  options?: ParseOptions,
): Promise<ParsedImportFile> {
  if (bytes.byteLength > IMPORT_MAX_BYTES) return refuse('file_too_large');
  if (bytes.byteLength === 0) return refuse('empty');
  const fileType = detectFileType(bytes, fileName);
  if (!fileType) return refuse('unsupported_type');
  return fileType === 'csv' ? parseCsvBytes(bytes, options) : parseXlsxBytes(bytes, options);
}

export const refusalStatus = (code: ImportFileRefusal): 400 | 413 => REFUSAL_STATUS[code];

export const IMPORT_FILE_NAME_MAX = 255;

/** Control characters and path separators become `_`; at most 255 characters. Shared by the upload and `importPaste`. */
export const sanitizeImportFileName = (name: string): string =>
  [...name]
    .map((ch) => (ch.charCodeAt(0) < 0x20 || ch === '\u007f' || ch === '/' || ch === '\\' ? '_' : ch))
    .join('')
    .slice(0, IMPORT_FILE_NAME_MAX);
