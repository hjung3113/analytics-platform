import { describe, expect, it } from 'vitest';

import { validateItemInput } from '../domain/item-input.js';
import { ITEM_RELATIONS_MAX, parseRelations } from '../domain/item-relation-input.js';

const OWNER = '33333333-3333-4333-8333-333333333333';
const ev = (module: string, event: string) => ({ module, event });
const rel = (extra: Record<string, unknown> = {}) => ({ kind: 'observed', source: ev('Spindle', 'Start'), target: ev('Spindle', 'Stop'), ...extra });
const createBase = { ownerModelId: OWNER, typeCode: 'anomaly', title: 't', observation: 'o' };
const reviseBase = { id: OWNER, typeCode: 'anomaly', title: 't', observation: 'o', changeNote: 'n' };
const codes = (errors: readonly { path: readonly string[]; code: string }[]) => errors.map((e) => `${e.path.join('.')}:${e.code}`);

describe('item event relation records input (#1505)', () => {
  it('treats an absent or null list as not sent (carry), and an empty list as a clear', () => {
    expect(parseRelations(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseRelations(null)).toEqual({ ok: true, value: undefined });
    expect(parseRelations([])).toEqual({ ok: true, value: [] });
  });

  it('normalises to stable keys with before as the stored predicate', () => {
    expect(parseRelations([rel()])).toEqual({
      ok: true,
      value: [{ kind: 'observed', sourceKey: 'SPINDLE/START', predicate: 'before', targetKey: 'SPINDLE/STOP' }],
    });
  });

  it('stores `A after B` as the same row as the explicit `B before A`', () => {
    const swapped = parseRelations([rel({ predicate: 'after', source: ev('Spindle', 'Stop'), target: ev('Spindle', 'Start') })]);
    expect(swapped).toEqual(parseRelations([rel({ predicate: 'before' })]));
  });

  it('keeps the reverse pair as a different record', () => {
    const parsed = parseRelations([rel(), rel({ source: ev('Spindle', 'Stop'), target: ev('Spindle', 'Start') })]);
    expect(parsed.ok && parsed.value?.length).toBe(2);
  });

  it('lets the same pair exist once per kind', () => {
    const parsed = parseRelations([rel(), rel({ kind: 'expected' })]);
    expect(parsed.ok && parsed.value?.length).toBe(2);
  });

  it.each([
    ['a non-list', 'x', ['relations:malformed']],
    ['more than the cap', Array.from({ length: ITEM_RELATIONS_MAX + 1 }, () => rel()), ['relations:too_long']],
    ['a non-object entry', [1], ['relations.0:malformed']],
    ['a missing kind', [rel({ kind: undefined })], ['relations.0.kind:required']],
    ['an unknown kind', [rel({ kind: 'guess' })], ['relations.0.kind:malformed']],
    ['an unknown predicate', [rel({ predicate: 'during' })], ['relations.0.predicate:malformed']],
    ['a missing source', [rel({ source: undefined })], ['relations.0.source:required']],
    ['a module-only target', [rel({ target: { module: 'a' } })], ['relations.0.target.event:required']],
    ['an extra key', [rel({ source: { module: 'a', event: 'b', x: 1 } })], ['relations.0.source:malformed']],
    ['a self pair', [rel({ target: ev('SPINDLE', 'start') })], ['relations.0.target:self_relation']],
    ['a duplicate', [rel(), rel()], ['relations.1:duplicate']],
    ['a duplicate spelled with after', [rel(), rel({ predicate: 'after', source: ev('Spindle', 'Stop'), target: ev('Spindle', 'Start') })], ['relations.1:duplicate']],
  ])('refuses %s', (_label, raw, expected) => {
    const parsed = parseRelations(raw);
    expect(parsed.ok ? [] : codes(parsed.errors)).toEqual(expected);
  });

  it.each([
    ['create', createBase],
    ['revise', reviseBase],
  ] as const)('%s validates relations through the action schema', (op, input) => {
    expect(validateItemInput(op, input)).toEqual([]);
    expect(validateItemInput(op, { ...input, relations: [rel()] })).toEqual([]);
    expect(codes(validateItemInput(op, { ...input, relations: [rel({ kind: 'x' })] }))).toEqual(['relations.0.kind:malformed']);
    expect(codes(validateItemInput(op, { ...input, relations: [rel({ target: ev('Spindle', 'Start') })] }))).toEqual(['relations.0.target:self_relation']);
    expect(codes(validateItemInput(op, { ...input, relations: [rel(), rel()] }))).toEqual(['relations.1:duplicate']);
  });
});
