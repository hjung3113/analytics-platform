import { describe, expect, it } from 'vitest';

import { toCodeKey } from '../domain/code-key.js';

describe('toCodeKey (ADR-0107 decision 2)', () => {
  it.each([
    ['full-width letters, digits and hyphen fold to ASCII (NFKC)', 'ＡＢ－１００', 'AB-100'],
    ['trims and collapses inner whitespace, upper-cases', ' ab  100 ', 'AB 100'],
    ['collapses tabs and ideographic spaces', 'ab\t　 100', 'AB 100'],
    ['keeps the hyphen', 'ab-100', 'AB-100'],
    ['leaves Korean unchanged', '가나다 장비', '가나다 장비'],
    ['upper-cases without locale: ß becomes SS (String#toUpperCase)', 'straße', 'STRASSE'],
    ['is not locale dependent: i stays I, the dotless ı folds to I too (root-locale toUpperCase)', 'iı', 'II'],
    ['an already normalized key is stable', 'AB-100', 'AB-100'],
  ])('%s', (_name, input, expected) => {
    expect(toCodeKey(input)).toBe(expected);
  });

  it('is idempotent', () => {
    for (const value of [' Ｘ y ', 'straße', 'ab-100']) {
      expect(toCodeKey(toCodeKey(value))).toBe(toCodeKey(value));
    }
  });
});
