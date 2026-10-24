import { describe, expect, it } from 'vitest';
import { formatTrendKey, parseTrendKey } from './trendKey';

describe('trend key', () => {
  it.each([
    [null, []],
    ['', []],
    ['EQ-001.H1,EQ-002.H4', ['EQ-001.H1', 'EQ-002.H4']],
    ['EQ-001.H1,EQ-1.H1,EQ-001.H5,EQ-001.MEG,bogus,EQ-001.H1', ['EQ-001.H1']],
    ['EQ-001,EQ-002.H2', ['EQ-002.H2']],
  ])('parses %j to %j', (raw, expected) => {
    expect(parseTrendKey(raw)).toEqual(expected);
  });

  it('keeps at most eight rows', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}.H1`);
    expect(parseTrendKey(ids.join(','))).toEqual(ids.slice(0, 8));
  });

  it('formats rows back, empty as absent', () => {
    expect(formatTrendKey([])).toBeNull();
    expect(formatTrendKey(['EQ-001.H1', 'EQ-002.H2'])).toBe('EQ-001.H1,EQ-002.H2');
  });
});
