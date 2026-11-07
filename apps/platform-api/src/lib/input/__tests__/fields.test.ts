import { describe, expect, it } from 'vitest';

import { bounded, clearableText, isUuid, requiredText, uuid } from '../fields.js';

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }): string[] =>
  (r.error?.issues ?? []).map((i) => i.message);

describe('isUuid', () => {
  it('accepts the 8-4-4-4-12 hex spelling in either case and nothing else', () => {
    expect(isUuid('0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10')).toBe(true);
    expect(isUuid('0F2C1C0E-8A53-4C43-9D0B-6A7F3A1D2E10')).toBe(true);
    expect(isUuid('0f2c1c0e8a534c439d0b6a7f3a1d2e10')).toBe(false);
    expect(isUuid('0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e1g')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('uuid', () => {
  it('answers required for absent, null and a wrong type, and malformed for a non-uuid string', () => {
    expect(messages(uuid.safeParse(undefined))).toEqual(['required']);
    expect(messages(uuid.safeParse(null))).toEqual(['required']);
    expect(messages(uuid.safeParse(5))).toEqual(['required']);
    expect(messages(uuid.safeParse('nope'))).toEqual(['malformed']);
    expect(uuid.safeParse('0F2C1C0E-8A53-4C43-9D0B-6A7F3A1D2E10').success).toBe(true);
  });
});

describe('bounded', () => {
  it('counts code points, not UTF-16 units', () => {
    const max = 5;
    // Five astral characters are 5 code points but 10 UTF-16 units: passes only if counting code points.
    expect(bounded(max).safeParse('👍👍👍👍👍').success).toBe(true);
    expect(bounded(max).safeParse('한글테스트👍').success).toBe(false);
    expect(messages(bounded(max).safeParse('한글테스트👍'))).toEqual(['too_long']);
  });

  it('allows blank and answers malformed for a control character, too_long past max, required for a wrong type', () => {
    expect(bounded(10).safeParse('   ').success).toBe(true);
    expect(messages(bounded(10).safeParse('a\u0000b'))).toEqual(['malformed']);
    expect(messages(bounded(10).safeParse('a\ud800b'))).toEqual(['malformed']);
    expect(messages(bounded(10).safeParse('x'.repeat(11)))).toEqual(['too_long']);
    expect(messages(bounded(10).safeParse(5))).toEqual(['required']);
  });
});

describe('requiredText', () => {
  it('trims, refuses blank as required and a wrong type or control character as required/malformed', () => {
    expect(requiredText(10).parse('  x  ')).toBe('x');
    expect(messages(requiredText(10).safeParse('   '))).toEqual(['required']);
    expect(messages(requiredText(10).safeParse(undefined))).toEqual(['required']);
    expect(messages(requiredText(10).safeParse(5))).toEqual(['required']);
    expect(messages(requiredText(10).safeParse('a\u0000b'))).toEqual(['malformed']);
  });
});

describe('clearableText', () => {
  it('keeps absent absent, turns null and blank into null, and trims the rest', () => {
    expect(clearableText(10).safeParse(undefined)).toMatchObject({ success: true, data: undefined });
    expect(clearableText(10).parse(null)).toBeNull();
    expect(clearableText(10).parse('   ')).toBeNull();
    expect(clearableText(10).parse('  x  ')).toBe('x');
  });

  it('answers required for a wrong type and malformed for a control character', () => {
    expect(messages(clearableText(10).safeParse(5))).toEqual(['required']);
    expect(messages(clearableText(10).safeParse('a\u0000b'))).toEqual(['malformed']);
  });
});
