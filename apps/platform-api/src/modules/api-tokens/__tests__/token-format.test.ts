import { describe, expect, it } from 'vitest';

import { bearerValue, generateToken, hashToken, hashesEqual, parseTokenPrefix } from '../token-format.js';

describe('API token format (v0)', () => {
  it('generates ap_<8 hex>_<43 base64url> and stores only the SHA-256 of the whole value', () => {
    const t = generateToken();
    expect(t.value).toMatch(/^ap_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
    expect(t.value.startsWith(`ap_${t.prefix}_`)).toBe(true);
    expect(t.hash).toBe(hashToken(t.value));
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken().value).not.toBe(t.value);
  });

  it('parses only well-formed values and exposes the prefix, never the secret', () => {
    const t = generateToken();
    expect(parseTokenPrefix(t.value)).toBe(t.prefix);
    for (const bad of ['', 'ap_x_y', `${t.value}!`, t.value.replace('ap_', 'xx_'), `ap_${t.prefix}_short`]) {
      expect(parseTokenPrefix(bad)).toBeNull();
    }
  });

  it('compares hashes in constant time shape (length-checked) and rejects mismatches', () => {
    const a = hashToken('a');
    expect(hashesEqual(a, hashToken('a'))).toBe(true);
    expect(hashesEqual(a, hashToken('b'))).toBe(false);
    expect(hashesEqual(a, 'zz')).toBe(false);
  });

  it.each([
    ['Bearer abc', 'abc'],
    ['bearer   abc  ', 'abc'],
    ['Bearer ', ''],
    ['Bearer', ''],
    ['bearer \t', ''],
  ])('reads %j as a Bearer header', (header, value) => {
    expect(bearerValue(header)).toBe(value);
  });

  it.each(['Basic abc', undefined, 42, 'Bearerabc'])('ignores a non-Bearer header %j', (header) => {
    expect(bearerValue(header)).toBeNull();
  });
});
