import { describe, expect, it } from 'vitest';
import { formatNumber } from '@ap/contracts';

// #1890: the one language-following number formatter; the digits match what the menus' own `toLocaleString` calls printed.
describe('formatNumber', () => {
  it.each([
    [0, 'ko', '0'], [0, 'en', '0'],
    [7, 'ko', '7'], [-7, 'en', '-7'],
    [1234, 'ko', '1,234'], [1234, 'en', '1,234'],
    [1234567, 'ko', '1,234,567'], [-1234567, 'en', '-1,234,567'],
  ] as const)('groups an integer %s in %s as %s', (value, lang, expected) => {
    expect(formatNumber(value, lang)).toBe(expected);
  });

  it.each([
    [1234.5, 2, '1,234.50'], [0, 2, '0.00'], [-3.14159, 2, '-3.14'], [12.34, 1, '12.3'], [2.5, 0, '3'], [1234.5, 0, '1,235'], [1.25, 1, '1.3'], [0.05, 1, '0.1'],
  ] as const)('prints %s with decimals %s as %s in both languages', (value, decimals, expected) => {
    expect(formatNumber(value, 'ko', { decimals })).toBe(expected);
    expect(formatNumber(value, 'en', { decimals })).toBe(expected);
  });

  it('takes separate minimum and maximum fraction digits', () => {
    expect(formatNumber(1.5, 'en', { minimumFractionDigits: 0, maximumFractionDigits: 2 })).toBe('1.5');
    expect(formatNumber(1.256, 'ko', { maximumFractionDigits: 1 })).toBe('1.3');
  });

  it('prints non-finite values as Intl does', () => {
    expect(formatNumber(Number.NaN, 'en')).toBe('NaN');
    expect(formatNumber(Number.POSITIVE_INFINITY, 'ko')).toBe('∞');
  });
});
