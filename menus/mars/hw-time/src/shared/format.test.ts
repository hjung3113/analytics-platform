import { describe, expect, it } from 'vitest';
import { formatSeconds, rowIdLabel } from './format';

describe('rowIdLabel', () => {
  it('reads a row id the way the detail labels and the trend legend do', () => {
    expect(rowIdLabel('EQ-001.H1')).toBe('EQ-001 · H1');
  });
});

describe('formatSeconds', () => {
  // #1890: it now follows the user's language (it was fixed to en-US); for these magnitudes both languages print the same digits.
  it.each([[1234.5, '1,234.50'], [0, '0.00'], [12.345, '12.35'], [98765.4321, '98,765.43'], [-0.5, '-0.50']] as const)('prints %s as %s in ko and en', (value, expected) => {
    expect(formatSeconds(value, 'ko')).toBe(expected);
    expect(formatSeconds(value, 'en')).toBe(expected);
  });
});
