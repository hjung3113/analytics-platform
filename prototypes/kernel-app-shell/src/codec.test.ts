import { describe, expect, it } from 'vitest';
import vectors from './parity-vectors.json';
import { ContractError, contextLink, parseUrl, restoreContext, serialize, type ContextState } from './codec';
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
  it.each([
    ['scope_id', { scope_id: '\ud800' }],
    ['room_names', { room_names: ['\ud800'] }],
    ['selection', { selection: ['\ud800'] }],
    ['destination', { route: 'equipment', destination: '\ud800' }],
  ] as [string, Partial<ContextState>][])('rejects a lone surrogate in %s as invalid_id, not URIError', (_field, patch) => {
    const state = parseUrl('/prototype/context');
    try { serialize({ ...state, ...patch }); throw new Error('accepted lone surrogate'); }
    catch (error) { expect(error).toBeInstanceOf(ContractError); expect((error as ContractError).code).toBe('invalid_id'); }
  });
  it('keeps known divergence #6: a lone surrogate in the Condition still round-trips', () => {
    const state = { ...parseUrl('/prototype/context'), condition: { axis: 'stgroup', values: ['\ud800'] } };
    expect(restoreContext(serialize(state))).toEqual(state);
  });
});
