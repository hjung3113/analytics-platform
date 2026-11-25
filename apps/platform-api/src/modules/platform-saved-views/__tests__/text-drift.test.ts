import { isWellFormedText, malformedTextPath } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { isPgSafeDeep, isPgSafeString } from '../safe.js';

// The server may not import @ap/contracts at runtime, so it keeps its own copy of the text rule. The HTTP adapter guard,
// the mock store (`validateSavedView`) and the browser import use the shared one: both must answer alike (#2991).
const strings = ['', 'abc', '수율', '😀', '􏿿', 'a\u0000b', '\u0000', '\ud800', '\udc00', '\ud800x', 'x\udc00', '\udc00\ud800', '😀\ud800'];
const values: unknown[] = [
  { name: 'ok', page: { grain: ['hour'] } },
  { name: 'a\u0000' },
  { page: { ['k\ud800']: ['x'] } },
  { layout: [[1, 'ok'], [2, '\udc00']] },
  ['\ud800', 'ok'],
  { deep: { deeper: { deepest: 'a\u0000' } } },
];

describe('the server text rule matches the shared saved-view text rule (#2991)', () => {
  it.each(strings.map(s => [JSON.stringify(s), s]))('string %s', (_label, value) => {
    expect(isPgSafeString(value)).toBe(isWellFormedText(value));
  });
  it.each(values.map((v, i) => [i, v]))('value %i', (_i, value) => {
    expect(isPgSafeDeep(value)).toBe(malformedTextPath(value) === null);
  });
});
