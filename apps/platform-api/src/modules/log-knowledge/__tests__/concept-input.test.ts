import { describe, expect, it } from 'vitest';

import { parseConceptConfirm, parseConceptPropose, parseConceptReject, validateConcept } from '../domain/concept-input.js';

const MODEL = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const base = { modelId: MODEL, targetKind: 'event', target: { module: 'Spindle', event: 'Start' }, canonicalLabel: 'Spindle start' };
const codes = (op: Parameters<typeof validateConcept>[0], input: Record<string, unknown>) => validateConcept(op, input).map((e) => `${e.path.join('.')}:${e.code}`);

describe('conceptPropose input', () => {
  it('normalises the target to its stable key and defaults the relation to equivalent', () => {
    const parsed = parseConceptPropose(base);
    expect(parsed.ok && parsed.value).toMatchObject({ targetKey: 'SPINDLE/START', relationKind: 'equivalent', conceptId: null, canonicalLabel: 'Spindle start', pairWith: null });
  });

  it('takes a module target and an existing concept', () => {
    const parsed = parseConceptPropose({ modelId: MODEL, targetKind: 'module', target: { module: 'Spindle / Motor' }, conceptId: OTHER, relationKind: 'related' });
    expect(parsed.ok && parsed.value).toMatchObject({ targetKey: 'SPINDLE %2F MOTOR', conceptId: OTHER, relationKind: 'related' });
  });

  it.each([
    ['both a concept id and a label', { ...base, conceptId: OTHER }, ['concept:required_one']],
    ['neither', { modelId: MODEL, targetKind: 'event', target: { module: 'a', event: 'b' } }, ['concept:required_one']],
    ['an event target without its event', { ...base, target: { module: 'Spindle' } }, ['target.event:required']],
    ['a module target with an event', { ...base, targetKind: 'module' }, ['target:malformed']],
    ['field as target kind', { ...base, targetKind: 'field' }, ['targetKind:malformed']],
    ['a bad model id', { ...base, modelId: 'x' }, ['modelId:malformed']],
    ['an unknown relation', { ...base, relationKind: 'same' }, ['relationKind:malformed']],
    ['a control character in the label', { ...base, canonicalLabel: 'a\u0000b' }, ['canonicalLabel:malformed']],
    ['a pair of the target with itself', { ...base, pairWith: { modelId: MODEL, targetKind: 'event', target: { module: 'spindle', event: 'start' } } }, ['pairWith:same_target']],
    ['a pair of another kind', { ...base, pairWith: { modelId: OTHER, targetKind: 'module', target: { module: 'a' } } }, ['pairWith.targetKind:malformed']],
  ])('refuses %s', (_label, input, expected) => {
    expect(codes('conceptPropose', input as Record<string, unknown>)).toEqual(expected);
  });

  it('accepts a pair in another model', () => {
    const parsed = parseConceptPropose({ ...base, pairWith: { modelId: OTHER, targetKind: 'event', target: { module: 'Spindle', event: 'Start' } } });
    expect(parsed.ok && parsed.value.pairWith).toMatchObject({ modelId: OTHER, targetKey: 'SPINDLE/START' });
  });
});

describe('conceptConfirm / conceptReject input', () => {
  it('needs a mapping id; reject also needs a non-blank reason within 500 characters', () => {
    expect(parseConceptConfirm({ mappingId: MODEL }).ok).toBe(true);
    expect(codes('conceptConfirm', { mappingId: 'x' })).toEqual(['mappingId:malformed']);
    expect(codes('conceptConfirm', {})).toEqual(['mappingId:required']);
    expect(parseConceptReject({ mappingId: MODEL, reason: '  different thing  ' })).toMatchObject({ ok: true, value: { reason: 'different thing' } });
    expect(codes('conceptReject', { mappingId: MODEL })).toEqual(['reason:required']);
    expect(codes('conceptReject', { mappingId: MODEL, reason: '   ' })).toEqual(['reason:required']);
    expect(codes('conceptReject', { mappingId: MODEL, reason: 'x'.repeat(501) })).toEqual(['reason:too_long']);
  });
});
