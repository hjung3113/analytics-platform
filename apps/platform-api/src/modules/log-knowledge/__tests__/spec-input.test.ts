import { describe, expect, it } from 'vitest';

import { type DraftIndex, SPEC_BODY_MAX_BYTES, SPEC_ROWS_MAX, normalizeSpecName, parseSpecInput, planSpecRows, qualifiedKey, validateSpecInput } from '../domain/spec-input.js';

const REV = '33333333-3333-4333-8333-333333333333';
const empty: DraftIndex = { moduleKeys: new Set(), eventKeys: new Set() };
const field = { name: 'Temp', type: 'float', description: 'chamber temperature' };
const save = (extra: Record<string, unknown>) => ({ revisionId: REV, mode: 'append', ...extra });
const plan = (draft: DraftIndex, input: Record<string, unknown>) => {
  const parsed = parseSpecInput('draftSave', save(input));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return planSpecRows(draft, parsed.value);
};
const codes = (r: ReturnType<typeof plan>) => (r.ok ? [] : r.errors.map((e) => `${e.path.join('.')}:${e.code}`));

describe('spec input normalisation', () => {
  it('names are NFC-trimmed with inner whitespace collapsed', () => {
    expect(normalizeSpecName('  Load \t Port\n')).toBe('Load Port');
    expect(normalizeSpecName('é')).toBe('é');
  });

  it('keys come from toCodeKey of the name; references resolve the same way', () => {
    const r = plan(empty, { modules: [{ name: ' load  port ' }], events: [{ module: 'Load Port', name: 'wafer in', fields: [field] }] });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.modules[0]).toMatchObject({ key: 'LOAD PORT', name: 'load port' });
      expect(r.events[0]).toMatchObject({ moduleKey: 'LOAD PORT', key: 'WAFER IN' });
    }
  });
});

describe('spec input validation', () => {
  it.each([
    ['an unknown key on a row', save({ modules: [{ name: 'A', extra: 1 }] }), 'modules.0:malformed'],
    ['an unknown field key', save({ events: [{ module: 'A', name: 'E', fields: [{ ...field, extra: 1 }] }] }), 'events.0.fields.0:malformed'],
    ['an unknown field type', save({ events: [{ module: 'A', name: 'E', fields: [{ ...field, type: 'date' }] }] }), 'events.0.fields.0.type:malformed'],
    ['a blank module name', save({ modules: [{ name: '  ' }] }), 'modules.0.name:required'],
    ['a missing mode', { revisionId: REV }, 'mode:required'],
    ['a malformed revision id', save({ revisionId: 'x' }), 'revisionId:malformed'],
    ['a too-long predicate', save({ relations: [{ sourceModule: 'A', sourceEvent: 'E', predicate: 'p'.repeat(101), targetModule: 'A', targetEvent: 'F' }] }), 'relations.0.predicate:too_long'],
  ])('refuses %s', (_label, input, expected) => {
    expect(validateSpecInput('draftSave', input).map((e) => `${e.path.join('.')}:${e.code}`)).toContain(expected);
  });

  it('refuses more than 2,000 rows and a body over 512 KiB with too_large', () => {
    const modules = Array.from({ length: SPEC_ROWS_MAX + 1 }, (_, i) => ({ name: `M${i}` }));
    expect(validateSpecInput('draftSave', save({ modules }))).toEqual([{ path: ['input'], code: 'too_large' }]);
    const big = [{ module: 'A', name: 'E', triggerRule: 'x'.repeat(SPEC_BODY_MAX_BYTES) }];
    expect(validateSpecInput('draftSave', save({ events: big }))).toEqual([{ path: ['input'], code: 'too_large' }]);
  });

  it('accepts a full save, a create with a link and a reject reason of 500', () => {
    expect(validateSpecInput('draftSave', save({ modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E', fields: [field] }] }))).toEqual([]);
    expect(validateSpecInput('draftCreate', { modelId: REV, sourceDocRef: { docLabel: 'Log spec', docVersion: 'v3', link: 'https://x/y' } })).toEqual([]);
    expect(validateSpecInput('reject', { revisionId: REV, reason: 'r'.repeat(500) })).toEqual([]);
    expect(validateSpecInput('reject', { revisionId: REV, reason: 'r'.repeat(501) })).toEqual([{ path: ['reason'], code: 'too_long' }]);
  });
});

describe('spec dependency planning', () => {
  it('orders modules by parent depth whatever the call order, then events, then relations', () => {
    const r = plan(empty, {
      modules: [{ name: 'C', parentModule: 'B' }, { name: 'B', parentModule: 'A' }, { name: 'A' }],
      events: [{ module: 'C', name: 'E1' }, { module: 'A', name: 'E2' }],
      relations: [{ sourceModule: 'C', sourceEvent: 'E1', predicate: 'causes', targetModule: 'A', targetEvent: 'E2' }],
    });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.modules.map((m) => [m.key, m.depth])).toEqual([['A', 0], ['B', 1], ['C', 2]]);
  });

  it('a reference may point at a row already in the draft', () => {
    const draft: DraftIndex = { moduleKeys: new Set(['A']), eventKeys: new Set([qualifiedKey('A', 'E1')]) };
    const r = plan(draft, { modules: [{ name: 'B', parentModule: 'A' }], events: [{ module: 'B', name: 'E2' }], relations: [{ sourceModule: 'A', sourceEvent: 'E1', predicate: 'p', targetModule: 'B', targetEvent: 'E2' }] });
    expect(r.ok).toBe(true);
  });

  it.each([
    ['a dangling parent', { modules: [{ name: 'B', parentModule: 'Z' }] }, ['modules.0.parentModule:not_found']],
    ['a cycle', { modules: [{ name: 'A', parentModule: 'B' }, { name: 'B', parentModule: 'A' }] }, ['modules.0.parentModule:cycle', 'modules.1.parentModule:cycle']],
    ['a module that is its own parent', { modules: [{ name: 'A', parentModule: 'a' }] }, ['modules.0.parentModule:cycle']],
    ['a duplicate module key', { modules: [{ name: 'A' }, { name: ' a ' }] }, ['modules.1.name:duplicate']],
    ['an event of an unknown module', { events: [{ module: 'Z', name: 'E' }] }, ['events.0.module:not_found']],
    ['a duplicate qualified event key', { modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E' }, { module: 'A', name: 'e' }] }, ['events.1.name:duplicate']],
    ['a dangling relation end', { modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E' }], relations: [{ sourceModule: 'A', sourceEvent: 'E', predicate: 'p', targetModule: 'A', targetEvent: 'Q' }] }, ['relations.0.targetEvent:not_found']],
    ['a relation to itself', { modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E' }], relations: [{ sourceModule: 'A', sourceEvent: 'E', predicate: 'p', targetModule: 'A', targetEvent: 'E' }] }, ['relations.0.targetEvent:malformed']],
  ])('refuses %s with a row-numbered error', (_label, input, expected) => {
    expect(codes(plan(empty, input))).toEqual(expected);
  });

  it('the same event key under two modules is two events', () => {
    expect(plan(empty, { modules: [{ name: 'A' }, { name: 'B' }], events: [{ module: 'A', name: 'E' }, { module: 'B', name: 'E' }] }).ok).toBe(true);
  });
});
