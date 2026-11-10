import { describe, expect, it } from 'vitest';

import { checkAliasRules, checkBaseline, checkTypeDictionary, parseScope, toCoreScope, wallClockProblem } from '../domain/mapping-checks.js';

const V = '6f9619ff-8b86-4d11-b42d-00c04fc964ff';
const M = '7a9619ff-8b86-4d11-b42d-00c04fc964aa';

describe('parseScope (#1658)', () => {
  it.each([
    [{ level: 'global' }, { level: 'global' }],
    [{ level: 'maker', vendorId: V.toUpperCase() }, { level: 'maker', vendorId: V }],
    [{ level: 'model', vendorId: V, modelId: M }, { level: 'model', vendorId: V, modelId: M }],
    [{ level: 'equipment', equipmentId: 'eq-synth-1' }, { level: 'equipment', equipmentId: 'eq-synth-1' }],
  ])('accepts %j', (input, scope) => {
    expect(parseScope(input, true)).toEqual({ ok: true, scope });
  });

  it.each([
    [{ level: 'maker', vendorId: 'acme' }, [{ path: ['vendorId'], code: 'invalid' }]],
    [{ level: 'maker' }, [{ path: ['vendorId'], code: 'invalid' }]],
    [{ level: 'global', vendorId: V }, [{ path: ['vendorId'], code: 'unexpected' }]],
    [{ level: 'model', vendorId: V, modelId: M, equipmentId: 'x' }, [{ path: ['equipmentId'], code: 'unexpected' }]],
    [{ level: 'equipment', equipmentId: '' }, [{ path: ['equipmentId'], code: 'invalid' }]],
    [{ level: 'constructor' }, [{ path: ['level'], code: 'invalid' }]],
    [{}, [{ path: ['level'], code: 'invalid' }]],
  ])('refuses %j', (input, errors) => {
    expect(parseScope(input, true)).toEqual({ ok: false, errors });
  });

  it('refuses the equipment level where the caller does not allow it (Type Dictionary)', () => {
    expect(parseScope({ level: 'equipment', equipmentId: 'x' }, false)).toEqual({ ok: false, errors: [{ path: ['level'], code: 'invalid' }] });
  });

  it('spells Hub ids as core maker and model strings', () => {
    expect(toCoreScope({ level: 'model', vendorId: V, modelId: M })).toEqual({ level: 'model', maker: V, model: M });
  });
});

describe('document checks (#1658)', () => {
  const rules = (scope: unknown) => ({ schemaVersion: '0.4', scope, rules: [] });
  it('requires the document scope to equal the addressed scope', () => {
    expect(checkAliasRules({ level: 'maker', vendorId: V }, rules({ level: 'maker', maker: V })).ok).toBe(true);
    expect(checkAliasRules({ level: 'maker', vendorId: V }, rules({ level: 'maker', maker: 'acme' }))).toEqual({ ok: false, errors: [{ path: ['document', 'scope'], code: 'scope_mismatch' }] });
    expect(checkTypeDictionary({ level: 'global' }, { schemaVersion: '0.4', scope: { level: 'model', maker: V, model: M }, entries: [] }).ok).toBe(false);
  });

  it('returns code and path only, never a core message', () => {
    const result = checkAliasRules({ level: 'global' }, { schemaVersion: '0.4', scope: { level: 'global' }, rules: [{ id: 'Bad Id!' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) for (const e of result.errors) expect(Object.keys(e).sort()).toEqual(['code', 'path']);
  });

  it('judges a Baseline by the core schema and its equipment id', () => {
    const inv = { equipmentId: 'eq-synth-1', from: '2026-01-01T00:00:00.000', to: '2026-01-02T00:00:00.000', aliases: [], transfers: [] };
    expect(checkBaseline('eq-synth-1', inv).ok).toBe(true);
    expect(checkBaseline('eq-synth-2', inv)).toEqual({ ok: false, errors: [{ path: ['baseline', 'equipmentId'], code: 'equipment_mismatch' }] });
    expect(checkBaseline('eq-synth-1', { ...inv, from: '2026-01-01' }).ok).toBe(false);
  });
});

describe('wallClockProblem (EV ADR-0009: never truncate)', () => {
  it.each([
    ['2026-01-01T00:00:00.000', null],
    ['2026-01-01T00:00:00', 'fraction-missing'],
    ['2026-01-01T00:00:00.0001', 'fraction-too-long'],
    ['2026-01-01T00:00:00.000Z', 'offset'],
    ['2026-01-01', 'malformed'],
    ['2026-02-30T00:00:00.000', 'impossible'],
    [42, 'malformed'],
  ])('%j → %j', (value, problem) => {
    expect(wallClockProblem(value)).toBe(problem);
  });
});
