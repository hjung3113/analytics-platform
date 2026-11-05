import { describe, expect, it } from 'vitest';

import { ITEM_DEFAULT_SORT, ITEM_SORT_IDS, parseDetailParams, parseEventParams, parseItemListParams } from '../domain/item-params.js';
import { IMPROVEMENT_ITEMS_MENU_ID } from '../menu.js';
import { itemEndpoints } from '../item-endpoints.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const endpoints = itemEndpoints({ db: {} as never, checkService: {} as never, notify: {} as never });
const judge = (id: string, params: Record<string, unknown>) => endpoints.find((e) => e.spec.id === id)?.validate(params);

describe('improvement read declarations', () => {
  it('declares three reads on the direct list menu with the view right and no scope', () => {
    expect(IMPROVEMENT_ITEMS_MENU_ID).toBe('improvement-items');
    expect(
      endpoints.map((e) => [e.spec.id, e.spec.menuId, e.spec.permission, e.spec.requiresScope, e.spec.context, e.spec.mergeTimeDomain]),
    ).toEqual([
      ['improvement.items', 'improvement-items', 'platform:view', false, {}, false],
      ['improvement.itemDetail', 'improvement-items', 'platform:view', false, {}, false],
      ['improvement.itemEvents', 'improvement-items', 'platform:view', false, {}, false],
    ]);
  });

  it.each([
    ['improvement.items', {}, true],
    ['improvement.items', { targetKind: 'equipment', targetKey: 'EQ-1' }, true],
    ['improvement.items', { targetKind: 'equipment' }, false],
    ['improvement.items', { targetKey: 'EQ-1' }, false],
    ['improvement.items', { targetKind: 'line', targetKey: 'EQ-1' }, false],
    ['improvement.items', { targetKind: 'process', targetKey: ' ' }, false],
    ['improvement.items', { pageSize: 201 }, false],
    ['improvement.itemDetail', { itemId: UUID }, true],
    ['improvement.itemDetail', { itemNo: 12 }, true],
    ['improvement.itemDetail', { itemNo: 'IM-12' }, true],
    ['improvement.itemDetail', { itemId: UUID, itemNo: 12 }, false],
    ['improvement.itemDetail', {}, false],
    ['improvement.itemDetail', { itemNo: 0 }, false],
    ['improvement.itemDetail', { itemNo: 1.5 }, false],
    ['improvement.itemDetail', { itemNo: 'KI-12' }, false],
    ['improvement.itemDetail', { itemId: 'x' }, false],
    ['improvement.itemEvents', { itemId: UUID }, true],
    ['improvement.itemEvents', { itemId: UUID, order: 'asc', page: 1, pageSize: 5 }, true],
    ['improvement.itemEvents', { itemId: UUID, order: 'up' }, false],
    ['improvement.itemEvents', {}, false],
    ['improvement.itemEvents', { itemId: UUID, pageSize: 0 }, false],
  ])('%s %j -> ok=%s', (id, params, ok) => {
    expect(judge(id, params)?.ok).toBe(ok);
  });
});

describe('improvement list params', () => {
  it('defaults to createdAt descending', () => {
    expect(ITEM_DEFAULT_SORT).toEqual({ id: 'createdAt', desc: true });
    expect(ITEM_SORT_IDS).toEqual(['itemNo', 'createdAt', 'updatedAt', 'status']);
    expect(parseItemListParams({})).toMatchObject({ ok: true, value: { sorting: [{ id: 'createdAt', desc: true }], target: null } });
  });

  it('accepts every filter field, the me literal and a target', () => {
    const parsed = parseItemListParams({
      filters: [
        { id: 'status', op: 'in', value: ['open', 'done'] },
        { id: 'assignee', op: 'in', value: ['me', UUID] },
        { id: 'questId', op: 'notIn', value: ['Q-1'] },
        { id: 'questLinked', op: 'in', value: ['false'] },
        { id: 'origin', op: 'in', value: ['mars-trend'] },
      ],
      targetKind: 'process',
      targetKey: 'CVD',
    });
    expect(parsed).toMatchObject({ ok: true, value: { target: { kind: 'process', externalKey: 'CVD' } } });
  });

  it.each([
    ['unknown status', { filters: [{ id: 'status', op: 'in', value: ['closed'] }] }],
    ['assignee that is neither uuid nor me', { filters: [{ id: 'assignee', op: 'in', value: ['you'] }] }],
    ['status isEmpty', { filters: [{ id: 'status', op: 'isEmpty' }] }],
    ['questLinked two values', { filters: [{ id: 'questLinked', op: 'in', value: ['true', 'false'] }] }],
    ['questLinked notIn', { filters: [{ id: 'questLinked', op: 'notIn', value: ['true'] }] }],
    ['blank questId', { filters: [{ id: 'questId', op: 'in', value: [' '] }] }],
    ['unknown field', { filters: [{ id: 'problem', op: 'in', value: ['x'] }] }],
    ['sort by a hidden column', { sorting: [{ id: 'problem', desc: false }] }],
  ])('refuses %s', (_name, params) => {
    expect(parseItemListParams(params).ok).toBe(false);
  });
});

describe('detail and event params', () => {
  it('reads IM-12, 12 and 12 as the same number', () => {
    for (const itemNo of ['IM-12', 'im12', '12', 12]) {
      expect(parseDetailParams({ itemNo })).toEqual({ ok: true, value: { itemNo: 12 } });
    }
  });
  it('defaults events to newest first, page 0, 50 rows', () => {
    expect(parseEventParams({ itemId: UUID })).toEqual({ ok: true, value: { itemId: UUID, page: 0, pageSize: 50, order: 'desc' } });
  });
});
