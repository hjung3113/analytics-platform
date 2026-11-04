import { describe, expect, it } from 'vitest';

import { ITEM_INPUT_KEYS, parseItemInput, validateItemInput } from '../domain/item-input.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const codes = (op: Parameters<typeof validateItemInput>[0], input: Record<string, unknown>) =>
  validateItemInput(op, input).map((e) => `${e.path.join('.')}:${e.code}`);

describe('improvement item write input (DB-free)', () => {
  it('normalises create text and keeps absent optionals absent', () => {
    const parsed = parseItemInput('itemCreate', { problem: '  p  ', action: '  ', origin: { menuId: ' m ', context: {} } });
    expect(parsed).toMatchObject({ ok: true, value: { problem: 'p', action: null, origin: { menuId: 'm' } } });
    expect(parseItemInput('itemUpdate', { itemId: ID, problem: 'p' })).toMatchObject({ ok: true, value: { problem: 'p' } });
    expect((parseItemInput('itemUpdate', { itemId: ID, problem: 'p' }) as { value: object }).value).not.toHaveProperty('action');
  });

  it('flags a duplicate (kind, externalKey) at the index of the second one', () => {
    const t = (k: string) => ({ kind: 'equipment', externalKey: k, displayName: k });
    expect(codes('itemUpdate', { itemId: ID, targets: [t('a'), t('b'), t('a')] })).toEqual(['targets.2:duplicate']);
    expect(codes('itemUpdate', { itemId: ID, targets: [t('a'), { ...t('a'), kind: 'process' }] })).toEqual([]);
  });

  it.each([
    ['https://x.example/a', 1],
    ['//x.example', 1],
    ['/ok/path?x=1', 0],
  ])('compareLink %s → %i error', (compareLink, count) => {
    expect(codes('itemSetStatus', { itemId: ID, status: 'verified', effect: { result: 'effective', compareLink } })).toHaveLength(count);
  });

  it('requires the quest pair together and a reason on reopen', () => {
    expect(codes('itemLinkQuest', { itemId: ID, questId: 'q', questTitle: null })).toContain('questTitle:required');
    expect(codes('itemReopen', { itemId: ID, reason: ' ' })).toEqual(['reason:required']);
  });

  it('lists every key the schemas accept', () => {
    for (const keys of Object.values(ITEM_INPUT_KEYS)) expect(new Set(keys).size).toBe(keys.length);
  });
});
