import { describe, expect, it } from 'vitest';
import { XLSX_CELL_MAX } from './tableExport';
import { checkWorkbook, toWorkbookXlsx, WorkbookError, WORKBOOK_LIMITS, type WorkbookSheet } from './workbook';
import { readXlsx } from './xlsxTestReader';

const sheet = (name: string, rows: WorkbookSheet['rows'] = [[1]]): WorkbookSheet => ({ name, rows });
const codeOf = (sheets: WorkbookSheet[]) => {
  try { checkWorkbook(sheets); return null; } catch (error) { return error instanceof WorkbookError ? error.code : String(error); }
};

describe('checkWorkbook sheet names (#860)', () => {
  it('accepts names Excel accepts, including Korean and 31 characters', () => {
    expect(codeOf([sheet('차트'), sheet('요약 (설비별)'), sheet('a'.repeat(31))])).toBeNull();
  });

  it.each([
    ['', 'sheet-name-empty'], ['   ', 'sheet-name-empty'], ['a'.repeat(32), 'sheet-name-too-long'],
    ['a:b', 'sheet-name-invalid'], ['a\\b', 'sheet-name-invalid'], ['a/b', 'sheet-name-invalid'], ['a?b', 'sheet-name-invalid'],
    ['a*b', 'sheet-name-invalid'], ['[a]', 'sheet-name-invalid'], ['a\u0001', 'sheet-name-invalid'], ["'a", 'sheet-name-invalid'], ["a'", 'sheet-name-invalid'], ['History', 'sheet-name-invalid'],
  ])('rejects %j as %s', (name, code) => {
    expect(codeOf([sheet(name)])).toBe(code);
  });

  it('rejects a duplicate name ignoring case and names the sheet', () => {
    expect(() => checkWorkbook([sheet('Raw'), sheet('raw')])).toThrow(expect.objectContaining({ code: 'sheet-name-duplicate', sheet: 'raw' }));
  });
});

describe('checkWorkbook limits (#860)', () => {
  it('needs at least one sheet and at most the sheet limit', () => {
    expect(codeOf([])).toBe('no-sheets');
    expect(codeOf(Array.from({ length: WORKBOOK_LIMITS.sheets }, (_, i) => sheet(`s${i}`)))).toBeNull();
    expect(codeOf(Array.from({ length: WORKBOOK_LIMITS.sheets + 1 }, (_, i) => sheet(`s${i}`)))).toBe('too-many-sheets');
  });

  it('caps rows per sheet and the cell total across sheets', () => {
    const rows = (count: number, width = 1) => Array.from({ length: count }, () => Array.from({ length: width }, () => 1));
    expect(codeOf([sheet('a', rows(WORKBOOK_LIMITS.rowsPerSheet))])).toBeNull();
    expect(codeOf([sheet('a', rows(WORKBOOK_LIMITS.rowsPerSheet + 1))])).toBe('too-many-rows');
    // Each sheet is under the row cap; together they pass the cell total.
    const wide = rows(WORKBOOK_LIMITS.rowsPerSheet, 10);
    expect(codeOf([sheet('a', wide), sheet('b', wide), sheet('c', [[1]])])).toBe('too-many-cells');
  });

  it('caps the row width at Excel\'s 16,384 columns', () => {
    const row = (width: number) => Array.from({ length: width }, () => 1);
    expect(codeOf([sheet('a', [row(WORKBOOK_LIMITS.columns)])])).toBeNull();
    expect(codeOf([sheet('a', [row(WORKBOOK_LIMITS.columns + 1)])])).toBe('too-many-columns');
    expect(codeOf([{ name: 'a', header: row(WORKBOOK_LIMITS.columns + 1).map(String), rows: [] }])).toBe('too-many-columns');
  });
});

describe('toWorkbookXlsx (#860)', () => {
  it('writes the sheets in order with their names, header and cells', async () => {
    const long = 'x'.repeat(XLSX_CELL_MAX + 5);
    const blob = await toWorkbookXlsx([
      { name: '요약', header: ['설비', '가동률', ''], rows: [['EQ-1', 0.93], ['EQ-2', null]] },
      { name: '원본', rows: [['=SUM(A1)', 42], ['2026-09-25T09:00:00', Number.NaN], ['', Number.POSITIVE_INFINITY], [long, -1.5]] },
      { name: '조회 정보', rows: [['기간', '2026-09-25 09:00 – 2026-09-26 09:00']] },
    ]);
    const { sheetNames, sheets: [summary, raw, info], sheetXml } = await readXlsx(blob);
    expect(sheetNames).toEqual(['요약', '원본', '조회 정보']);
    expect(summary).toEqual({ A1: '설비', B1: '가동률', A2: 'EQ-1', B2: 0.93, A3: 'EQ-2' });
    expect(raw.A1).toBe('=SUM(A1)'); // a string cell, never evaluated
    expect(raw.B1).toBe(42);
    expect(raw.A2).toBe('2026-09-25T09:00:00'); // wall-clock text kept as written, not a date cell
    expect(raw.B2).toBeUndefined(); // NaN → blank
    expect(raw.A3).toBeUndefined(); // '' → blank
    expect(raw.B3).toBeUndefined(); // Infinity → blank
    expect((raw.A4 as string).length).toBe(XLSX_CELL_MAX);
    expect(raw.B4).toBe(-1.5);
    expect(info.B1).toBe('2026-09-25 09:00 – 2026-09-26 09:00');
    // No formula element anywhere in the sheets.
    expect(sheetXml.join('')).not.toContain('<f>');
  });

  it('rejects a broken workbook before loading the writer, and an aborted signal with AbortError', async () => {
    await expect(toWorkbookXlsx([sheet('a/b')])).rejects.toMatchObject({ code: 'sheet-name-invalid' });
    const controller = new AbortController();
    controller.abort();
    await expect(toWorkbookXlsx([sheet('a')], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
