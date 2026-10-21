import { describe, expect, it } from 'vitest';

import { canonicalJson, sessionVersionOf } from '../session-version.js';

describe('sessionVersionOf', () => {
  it('ignores key order at every depth and is a hex SHA-256', () => {
    const a = { user: { id: '1', permissions: ['a'] }, scopes: [] };
    const b = { scopes: [], user: { permissions: ['a'], id: '1' } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(sessionVersionOf(a)).toBe(sessionVersionOf(b));
    expect(sessionVersionOf(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a value changes', () => {
    expect(sessionVersionOf({ p: ['a'] })).not.toBe(sessionVersionOf({ p: ['a', 'b'] }));
  });
});
