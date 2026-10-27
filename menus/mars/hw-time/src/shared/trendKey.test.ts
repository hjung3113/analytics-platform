import { describe, expect, it } from 'vitest';
import { formatTrendKey, parseTrendKey } from './trendKey';

const ids = (count: number) => Array.from({ length: count }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}.H1`);

describe('trend key', () => {
  it.each([
    [null, []],
    ['EQ-001.H1', ['EQ-001.H1']],
    ['EQ-001.H1,EQ-002.H4', ['EQ-001.H1', 'EQ-002.H4']],
    [ids(8).join(','), ids(8)],
  ])('accepts %j', (raw, rows) => {
    expect(parseTrendKey(raw)).toEqual({ ok: true, rows });
  });

  it.each([
    ['empty value', ''],
    ['unknown entry', 'EQ-001.H1,bogus'],
    ['equipment id', 'EQ-001,EQ-002.H2'],
    ['short equipment number', 'EQ-001.H1,EQ-1.H1'],
    ['unknown sub item', 'EQ-001.H1,EQ-001.H5'],
    ['duplicate', 'EQ-001.H1,EQ-002.H2,EQ-001.H1'],
    ['empty part', 'EQ-001.H1,,EQ-002.H2'],
    ['trailing comma', 'EQ-001.H1,'],
    ['more than eight rows', ids(9).join(',')],
  ])('rejects the whole key for %s', (_name, raw) => {
    expect(parseTrendKey(raw)).toEqual({ ok: false });
  });

  it('formats rows back, empty as absent', () => {
    expect(formatTrendKey([])).toBeNull();
    expect(formatTrendKey(['EQ-001.H1', 'EQ-002.H2'])).toBe('EQ-001.H1,EQ-002.H2');
  });
});
