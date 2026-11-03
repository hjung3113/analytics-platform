import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_COLUMNS,
  IMPORT_MAX_ROWS,
  detectFileType,
  parseImportFile,
} from '../domain/import-file.js';

const enc = (s: string) => new TextEncoder().encode(s);
const csv = (s: string, name = 'in.csv') => parseImportFile(enc(s), name);

async function xlsx(build: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('import file: csv', () => {
  it('reads headers and rows as strings, strips a BOM, keeps quoted commas and newlines', async () => {
    const r = await parseImportFile(enc('﻿code,name\nA1,"Acme, Inc"\nB2,"two\nlines"\n'), 'v.csv');
    expect(r).toMatchObject({ ok: true, fileType: 'csv', headers: ['code', 'name'] });
    if (!r.ok) return;
    expect(r.rows.map((x) => x.cells)).toEqual([
      { code: 'A1', name: 'Acme, Inc' },
      { code: 'B2', name: 'two\nlines' },
    ]);
    expect(r.rows[0]?.parseErrors).toEqual([]);
  });

  it('refuses a ragged row as unreadable', async () => {
    expect(await csv('a,b\n1,2\n3\n')).toMatchObject({ ok: false, code: 'unreadable', status: 400 });
  });

  it('refuses invalid UTF-8 as encoding', async () => {
    expect(await parseImportFile(new Uint8Array([0x61, 0x2c, 0x62, 0x0a, 0xff, 0xfe, 0x2c, 0x31]), 'x.csv')).toMatchObject({
      ok: false,
      code: 'encoding',
    });
  });

  it('refuses a file with no data row or no bytes as empty', async () => {
    expect(await csv('a,b\n')).toMatchObject({ ok: false, code: 'empty' });
    expect(await csv('')).toMatchObject({ ok: false, code: 'empty' });
  });

  it('refuses blank or duplicate header names as invalid_headers, before any row object', async () => {
    expect(await csv('a,,c\n1,2,3\n')).toMatchObject({ ok: false, code: 'invalid_headers' });
    expect(await csv('a,b,a\n1,2,3\n')).toMatchObject({ ok: false, code: 'invalid_headers' });
  });

  it('accepts exactly 50 columns and refuses 51 as too_many_columns', async () => {
    const row = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`).join(',');
    const data = (n: number) => Array.from({ length: n }, () => 'x').join(',');
    expect(await csv(`${row(IMPORT_MAX_COLUMNS)}\n${data(IMPORT_MAX_COLUMNS)}\n`)).toMatchObject({ ok: true });
    expect(await csv(`${row(IMPORT_MAX_COLUMNS + 1)}\n${data(IMPORT_MAX_COLUMNS + 1)}\n`)).toMatchObject({
      ok: false,
      code: 'too_many_columns',
      status: 400,
    });
  });

  it('accepts exactly 5,000 data rows and refuses 5,001 as too_many_rows', async () => {
    const body = (n: number) => `a\n${Array.from({ length: n }, (_, i) => `r${i}`).join('\n')}\n`;
    expect(await csv(body(IMPORT_MAX_ROWS))).toMatchObject({ ok: true });
    expect(await csv(body(IMPORT_MAX_ROWS + 1))).toMatchObject({ ok: false, code: 'too_many_rows' });
  });

  it('refuses more than 5 MB as file_too_large (413)', async () => {
    expect(await parseImportFile(new Uint8Array(IMPORT_MAX_BYTES + 1), 'big.csv')).toMatchObject({
      ok: false,
      code: 'file_too_large',
      status: 413,
    });
  });
});

describe('import file: type by content', () => {
  it('decides by the zip signature and requires the extension to agree', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]);
    expect(detectFileType(zip, 'a.xlsx')).toBe('xlsx');
    expect(detectFileType(zip, 'a.csv')).toBeNull();
    expect(detectFileType(enc('a,b'), 'a.csv')).toBe('csv');
    expect(detectFileType(enc('a,b'), 'a.xlsx')).toBeNull();
    expect(detectFileType(enc('a,b'), 'a.txt')).toBeNull();
  });

  it('refuses a mismatched file as unsupported_type', async () => {
    expect(await csv('a\n1\n', 'a.txt')).toMatchObject({ ok: false, code: 'unsupported_type' });
    expect(await csv('a\n1\n', 'a.xlsx')).toMatchObject({ ok: false, code: 'unsupported_type' });
  });

  it('refuses garbage with a zip signature as unreadable', async () => {
    expect(await parseImportFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'a.xlsx')).toMatchObject({
      ok: false,
      code: 'unreadable',
    });
  });
});

describe('import file: xlsx', () => {
  it('reads one sheet; numbers and booleans become strings, a date becomes an ISO string', async () => {
    const date = new Date('2026-03-04T05:06:07.000Z');
    const bytes = await xlsx((wb) => {
      const ws = wb.addWorksheet('s');
      ws.addRow(['code', 'name', 'n', 'ok', 'when']);
      ws.addRow(['A1', 'Acme', 12, true, date]);
    });
    const r = await parseImportFile(bytes, 'v.xlsx');
    expect(r).toMatchObject({ ok: true, fileType: 'xlsx', headers: ['code', 'name', 'n', 'ok', 'when'] });
    if (!r.ok) return;
    expect(r.rows[0]?.cells).toEqual({ code: 'A1', name: 'Acme', n: '12', ok: 'true', when: '2026-03-04T05:06:07.000Z' });
  });

  it('refuses two worksheets as sheet_count', async () => {
    const bytes = await xlsx((wb) => {
      wb.addWorksheet('a').addRow(['x']);
      wb.addWorksheet('b').addRow(['x']);
    });
    expect(await parseImportFile(bytes, 'v.xlsx')).toMatchObject({ ok: false, code: 'sheet_count' });
  });

  it('turns formula, merged and rich-text cells into row parse errors and never evaluates', async () => {
    const bytes = await xlsx((wb) => {
      const ws = wb.addWorksheet('s');
      ws.addRow(['code', 'name', 'note', 'extra']);
      ws.addRow(['A1', { formula: '1+1', result: 2 }, 'plain', 'x']);
      ws.addRow(['B2', 'Beta', 'merged-top', '']);
      ws.mergeCells('C3:D3');
      ws.addRow(['C3', 'Gamma', { richText: [{ text: 'rich' }] }, 'y']);
    });
    const r = await parseImportFile(bytes, 'v.xlsx');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]?.parseErrors).toEqual([{ field: 'name', code: 'formula' }]);
    expect(r.rows[0]?.cells.name).toBe('');
    expect(r.rows[1]?.parseErrors.map((e) => e.code)).toEqual(['merged', 'merged']);
    expect(r.rows[2]?.parseErrors).toEqual([{ field: 'note', code: 'unsupported_cell' }]);
  });

  it('refuses a sheet with only a header as empty and a duplicate header as invalid_headers', async () => {
    expect(await parseImportFile(await xlsx((wb) => wb.addWorksheet('s').addRow(['a'])), 'v.xlsx')).toMatchObject({
      ok: false,
      code: 'empty',
    });
    const dup = await xlsx((wb) => {
      const ws = wb.addWorksheet('s');
      ws.addRow(['a', 'a']);
      ws.addRow([1, 2]);
    });
    expect(await parseImportFile(dup, 'v.xlsx')).toMatchObject({ ok: false, code: 'invalid_headers' });
  });
});
