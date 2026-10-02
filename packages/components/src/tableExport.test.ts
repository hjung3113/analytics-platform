import { describe, expect, it } from 'vitest';
import type { PlatformColumn } from './PlatformDataTable';
import { exportCell, exportColumns, toCsv, toTsv } from './tableExport';

type Row = { id: string; label: string | null; count: number; flag: boolean; bad?: unknown };

const columns: PlatformColumn<Row>[] = [
  { id: 'id', header: 'ID' },
  { id: 'label', header: 'Label', exportValue: () => 'x' },
  { id: 'count', header: 'Count', align: 'right' },
  { id: 'flag', header: 'Flag' },
];

describe('exportColumns (#173)', () => {
  it('keeps visible columns in declaration order and drops hidden and exportable:false columns', () => {
    const withExtra: PlatformColumn<Row>[] = [...columns, { id: 'internal', header: 'Internal', exportable: false }];
    const out = exportColumns(withExtra, { visibility: { count: false }, pinning: {} });
    expect(out.map(c => c.id)).toEqual(['id', 'label', 'flag']);
    // visibility absent = visible; exportable defaults to true.
    expect(exportColumns(columns, { visibility: {}, pinning: {} }).map(c => c.id)).toEqual(['id', 'label', 'count', 'flag']);
  });

  it('puts left-pinned columns first in pinning order, then the rest in declaration order', () => {
    const out = exportColumns(columns, { visibility: {}, pinning: { left: ['flag', 'count'] } });
    expect(out.map(c => c.id)).toEqual(['flag', 'count', 'id', 'label']);
  });
});

describe('exportCell coercion (#173)', () => {
  it('empty for null/undefined/NaN/±Infinity, TRUE/FALSE for booleans, number stays number, string stays string', () => {
    const row: Row = { id: 'a', label: null, count: 3, flag: true };
    const cell = (value: unknown) => exportCell({ id: 'probe', header: 'P' }, { ...row, probe: value } as Row & { probe: unknown });
    expect(cell(null)).toBe('');
    expect(cell(undefined)).toBe('');
    expect(cell(Number.NaN)).toBe('');
    expect(cell(Number.POSITIVE_INFINITY)).toBe('');
    expect(cell(Number.NEGATIVE_INFINITY)).toBe('');
    expect(cell(true)).toBe('TRUE');
    expect(cell(false)).toBe('FALSE');
    expect(cell(3.5)).toBe(3.5);
    expect(cell('설비')).toBe('설비');
  });

  it('prefers exportValue, then value, then row[id]', () => {
    const row: Row = { id: 'a', label: null, count: 7, flag: false };
    expect(exportCell({ id: 'label', header: 'L', exportValue: r => r.count }, row)).toBe(7);
    expect(exportCell({ id: 'count', header: 'C', value: r => r.count * 2 }, row)).toBe(14);
    expect(exportCell({ id: 'id', header: 'I' }, row)).toBe('a');
  });

  it('throws in dev naming the column when the value is an object/array/Date — exportValue is required', () => {
    const row = { id: 'a', at: new Date('2026-10-02T00:00:00Z'), list: [1], obj: { x: 1 } } as unknown as Row;
    for (const id of ['at', 'list', 'obj']) {
      expect(() => exportCell({ id, header: 'X' }, row)).toThrow(id);
    }
  });
});

describe('toCsv (#173)', () => {
  it('emits UTF-8 BOM, CRLF line breaks and a trailing CRLF', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]]);
    expect(csv).toBe('\uFEFFa,b\r\n1,2\r\n');
  });

  it('quotes per RFC 4180 (quote, comma, CR, LF) and doubles inner quotes', () => {
    const csv = toCsv(['h'], [['has "quote"'], ['has,comma'], ['has\ncr-lf\r\nline'], ['plain']]);
    expect(csv).toBe('\uFEFFh\r\n"has ""quote"""\r\n"has,comma"\r\n"has\ncr-lf\r\nline"\r\nplain\r\n');
  });

  it('guards formula injection for string values only: = + - @ TAB CR get a leading quote, numbers never do', () => {
    const csv = toCsv(['s', 'n'], [['=1+1', 1], ['+CONCAT()', -2], ['@cmd', 0], ['-1', 3.25], ['\ttab', 42], ['\rCR', 7], ['safe', 0]]);
    // The guarded CR value still contains CR, so RFC 4180 quoting applies on top of the `'` prefix.
    expect(csv).toBe('\uFEFFs,n\r\n\'=1+1,1\r\n\'+CONCAT(),-2\r\n\'@cmd,0\r\n\'-1,3.25\r\n\'\ttab,42\r\n"\'\rCR",7\r\nsafe,0\r\n');
  });
});

describe('toTsv (#174 serialization ready)', () => {
  it('uses tabs and LF, quotes only values holding a quote, tab or newline, and keeps the formula guard', () => {
    const tsv = toTsv(['a', 'b'], [['x', '=SUM(A1)'], ['with\ttab', 4], ['with"quote', 5]]);
    expect(tsv).toBe('a\tb\nx\t\'=SUM(A1)\n"with\ttab"\t4\n"with""quote"\t5\n');
  });
});
