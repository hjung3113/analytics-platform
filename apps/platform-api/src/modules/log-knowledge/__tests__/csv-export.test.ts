import { describe, expect, it } from 'vitest';

import { csvField, guardFormula, toCsvDocument } from '../domain/csv-export.js';

describe('csv export', () => {
  it.each([['=1+1'], ['+x'], ['-x'], ['@x'], ['\tx'], ['\rx']])('guards %j', (v) => {
    expect(guardFormula(v)).toBe(`'${v}`);
  });
  it('leaves plain text, quotes and commas to RFC 4180', () => {
    expect(guardFormula('abc')).toBe('abc');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('l1\nl2')).toBe('"l1\nl2"');
    expect(csvField('\rx')).toBe('"\'\rx"');
  });
  it('writes BOM, CRLF and guards every cell', () => {
    const doc = toCsvDocument(['h1', '=h2'], [['a', '@b'], ['c,d', '']]);
    expect(doc).toBe("﻿h1,'=h2\r\na,'@b\r\n\"c,d\",\r\n");
  });
});
