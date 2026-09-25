import { describe, expect, it } from 'vitest';
import vectors from './parity-vectors.json';
import { ContractError, contextLink, parseUrl, restoreContext, serialize } from './codec';
describe('Python codec parity — 합성 fixture, 실제 메뉴 아님', () => {
  it.each(vectors)('$url', vector => {
    if ('error' in vector) {
      try { parseUrl(vector.url); throw new Error('accepted invalid URL'); }
      catch (error) { expect(error).toBeInstanceOf(ContractError); expect((error as ContractError).code).toBe(vector.error); }
    } else {
      const state = parseUrl(vector.url);
      expect(state).toEqual(vector.state);
      expect(serialize(state)).toBe(vector.canonical);
      expect(contextLink(state, 'reference')).toBe(vector.reference);
      expect(contextLink(state, 'equipment', 'ID/공백 +?&')).toBe(vector.detail);
      expect(restoreContext(serialize(state))).toEqual(state);
    }
  });
  it('rejects constructed state injection into extras or opaque globals', () => {
    const state = parseUrl('/prototype/context');
    expect(() => serialize({ ...state, extras: [['scopeId', 'x']] })).toThrow();
    expect(() => serialize({ ...state, unapplied_globals: [['unknown', 'x']] })).toThrow();
    expect(() => serialize({ ...state, route: 'equipment' })).toThrow();
    expect(() => serialize({ ...state, condition: { axis: 'makerModel', values: ['M'] } })).toThrow();
  });
});
