import { describe, expect, it } from 'vitest';

import { validateItemInput } from '../domain/item-input.js';
import { ITEM_SUBJECTS_MAX, parseSubjects } from '../domain/item-subject-input.js';

const MODEL = '33333333-3333-4333-8333-333333333333';
const subject = (extra: Record<string, unknown> = {}) => ({ modelId: MODEL, targetKind: 'event', target: { module: 'Spindle', event: 'Start' }, ...extra });
const createBase = { ownerModelId: MODEL, typeCode: 'anomaly', title: 't', observation: 'o' };
const reviseBase = { id: MODEL, typeCode: 'anomaly', title: 't', observation: 'o', changeNote: 'n' };
const codes = (errors: readonly { path: readonly string[]; code: string }[]) => errors.map((e) => `${e.path.join('.')}:${e.code}`);

describe('item subjects input (#1196 f)', () => {
  it('treats an absent or null list as not sent, and an empty list as a clear', () => {
    expect(parseSubjects(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseSubjects(null)).toEqual({ ok: true, value: undefined });
    expect(parseSubjects([])).toEqual({ ok: true, value: [] });
  });

  it('normalises each subject to model + kind + stable key with the about relation by default', () => {
    expect(parseSubjects([subject(), subject({ targetKind: 'module', target: { module: 'Spindle' }, relation: 'context' })])).toEqual({
      ok: true,
      value: [
        { modelId: MODEL, targetKind: 'event', targetKey: 'SPINDLE/START', subjectRelation: 'about' },
        { modelId: MODEL, targetKind: 'module', targetKey: 'SPINDLE', subjectRelation: 'context' },
      ],
    });
  });

  it.each([
    ['a non-list', 'x', ['subjects:malformed']],
    ['more than the cap', Array.from({ length: ITEM_SUBJECTS_MAX + 1 }, () => subject()), ['subjects:too_long']],
    ['a non-object entry', [1], ['subjects.0:malformed']],
    ['a missing model', [{ targetKind: 'event', target: { module: 'a', event: 'b' } }], ['subjects.0.modelId:required']],
    ['a bad model id', [subject({ modelId: 'x' })], ['subjects.0.modelId:malformed']],
    ['a field kind', [subject({ targetKind: 'field' })], ['subjects.0.targetKind:malformed']],
    ['an unknown relation', [subject({ relation: 'main' })], ['subjects.0.relation:malformed']],
    ['a duplicate subject', [subject(), subject({ target: { module: 'spindle', event: 'START' } })], ['subjects.1:duplicate']],
  ])('refuses %s', (_label, raw, expected) => {
    const parsed = parseSubjects(raw);
    expect(parsed.ok ? [] : codes(parsed.errors)).toEqual(expected);
  });

  it.each([
    ['create', createBase],
    ['revise', reviseBase],
  ] as const)('%s validates subjects through the action schema', (op, input) => {
    expect(validateItemInput(op, input)).toEqual([]);
    expect(validateItemInput(op, { ...input, subjects: [subject()] })).toEqual([]);
    expect(codes(validateItemInput(op, { ...input, subjects: [subject({ modelId: 'x' })] }))).toEqual(['subjects.0.modelId:malformed']);
    expect(codes(validateItemInput(op, { ...input, subjects: [subject(), subject()] }))).toEqual(['subjects.1:duplicate']);
  });
});
