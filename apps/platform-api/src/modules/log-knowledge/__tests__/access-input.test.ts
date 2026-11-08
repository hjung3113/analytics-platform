import { describe, expect, it } from 'vitest';

import { parseAccessInput, validateAccessInput } from '../domain/access-input.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const codes = (errors: readonly { path: readonly string[]; code: string }[]) => errors.map((e) => `${e.path.join('.')}:${e.code}`).sort();

describe('access input', () => {
  it('accessModeSet: a valid input parses, ids are lower-cased', () => {
    const r = parseAccessInput('accessModeSet', { targetKind: 'model', targetId: ID.toUpperCase(), mode: 'restricted' });
    expect(r).toEqual({ ok: true, value: { targetKind: 'model', targetId: ID, mode: 'restricted' } });
  });

  it.each([
    [{}, ['mode:required', 'targetId:required', 'targetKind:required']],
    [{ targetKind: 'vendor', targetId: ID, mode: 'restricted' }, ['targetKind:malformed']],
    [{ targetKind: 'item', targetId: 'x', mode: 'secret' }, ['mode:malformed', 'targetId:malformed']],
  ])('accessModeSet refuses %j', (input, expected) => {
    expect(codes(validateAccessInput('accessModeSet', input))).toEqual(expected);
  });

  it('accessRuleAdd: validUntil absent or null never expires; an offset instant parses; a date without offset is malformed', () => {
    const base = { targetKind: 'software', targetId: ID, granteeId: ID, effect: 'deny' };
    expect(parseAccessInput('accessRuleAdd', base)).toMatchObject({ ok: true, value: { validUntil: null } });
    expect(parseAccessInput('accessRuleAdd', { ...base, validUntil: null })).toMatchObject({ ok: true, value: { validUntil: null } });
    const ok = parseAccessInput('accessRuleAdd', { ...base, validUntil: '2030-01-01T00:00:00+09:00' });
    expect(ok.ok && ok.value.validUntil?.toISOString()).toBe('2029-12-31T15:00:00.000Z');
    expect(codes(validateAccessInput('accessRuleAdd', { ...base, validUntil: '2030-01-01' }))).toEqual(['validUntil:malformed']);
    expect(codes(validateAccessInput('accessRuleAdd', { ...base, validUntil: '2030-13-45T00:00:00Z' }))).toEqual(['validUntil:malformed']);
  });

  it('accessRuleAdd: only an effect of the closed set; a missing grantee is required', () => {
    expect(codes(validateAccessInput('accessRuleAdd', { targetKind: 'item', targetId: ID, effect: 'maybe' }))).toEqual(['effect:malformed', 'granteeId:required']);
  });

  it('accessRuleRevoke: a uuid rule id', () => {
    expect(validateAccessInput('accessRuleRevoke', { ruleId: ID })).toEqual([]);
    expect(codes(validateAccessInput('accessRuleRevoke', { ruleId: 'nope' }))).toEqual(['ruleId:malformed']);
  });
});
