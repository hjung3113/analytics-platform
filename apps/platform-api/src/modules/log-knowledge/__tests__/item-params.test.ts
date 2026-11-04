import { describe, expect, it } from 'vitest';

import { ITEM_FILTER_SPECS } from '../domain/item-filters.js';
import { parseListParams } from '../../../lib/list-params/list-params.js';
import { itemEndpoints } from '../item-endpoints.js';
import { ITEM_SORT_IDS } from '../repositories/item-read.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const parse = (params: Record<string, unknown>) =>
  parseListParams(params, ITEM_SORT_IDS, ITEM_FILTER_SPECS, { id: 'updatedAt', desc: true });
const endpoints = itemEndpoints({ db: {} as never, checkService: {} as never });
const judge = (id: string, params: Record<string, unknown>) => {
  const found = endpoints.find((e) => e.spec.id === id);
  return found?.validate?.(params);
};

describe('item list params', () => {
  it('defaults to updatedAt descending with no condition', () => {
    expect(parse({})).toMatchObject({ ok: true, value: { sorting: [{ id: 'updatedAt', desc: true }], conditions: {} } });
  });

  it('accepts every item filter field', () => {
    const result = parse({
      filters: [
        { id: 'ownerKind', op: 'in', value: ['model'] },
        { id: 'ownerModelId', op: 'in', value: [UUID] },
        { id: 'ownerSoftwareId', op: 'notIn', value: [UUID] },
        { id: 'includeSoftware', op: 'in', value: ['true'] },
        { id: 'typeCode', op: 'in', value: ['anomaly', 'guideline'] },
        { id: 'verificationState', op: 'in', value: ['disputed'] },
        { id: 'processingState', op: 'notIn', value: ['resolved'] },
        { id: 'publicationState', op: 'in', value: ['archived'] },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['unknown field', { filters: [{ id: 'title', op: 'in', value: ['x'] }] }],
    ['enum value outside the list', { filters: [{ id: 'typeCode', op: 'in', value: ['bug'] }] }],
    ['ownerKind outside the list', { filters: [{ id: 'ownerKind', op: 'in', value: ['vendor'] }] }],
    ['includeSoftware with notIn', { filters: [{ id: 'includeSoftware', op: 'notIn', value: ['true'] }] }],
    ['includeSoftware not boolean text', { filters: [{ id: 'includeSoftware', op: 'in', value: ['yes'] }] }],
    ['includeSoftware two values', { filters: [{ id: 'includeSoftware', op: 'in', value: ['true', 'false'] }] }],
    ['ownerModelId not a uuid', { filters: [{ id: 'ownerModelId', op: 'in', value: ['m1'] }] }],
    ['isEmpty on a scalar', { filters: [{ id: 'typeCode', op: 'isEmpty' }] }],
    ['duplicate field', { filters: [{ id: 'typeCode', op: 'in', value: ['anomaly'] }, { id: 'typeCode', op: 'in', value: ['guideline'] }] }],
    ['sort by a hidden column', { sorting: [{ id: 'verificationState', desc: false }] }],
  ])('refuses %s', (_name, params) => {
    expect(parse(params).ok).toBe(false);
  });
});

describe('item read declarations', () => {
  it('declares four reads on the two owning menus with the view right and no scope', () => {
    expect(endpoints.map((e) => [e.spec.id, e.spec.menuId, e.spec.permission, e.spec.requiresScope])).toEqual([
      ['logKnowledge.exploreModels', 'log-knowledge-models', 'platform:view', false],
      ['logKnowledge.modelProfile', 'log-knowledge-models', 'platform:view', false],
      ['logKnowledge.items', 'log-knowledge-items', 'platform:view', false],
      ['logKnowledge.itemDetail', 'log-knowledge-items', 'platform:view', false],
    ]);
  });

  it.each([
    ['logKnowledge.modelProfile', { modelId: UUID }, true],
    ['logKnowledge.modelProfile', {}, false],
    ['logKnowledge.modelProfile', { modelId: 'x' }, false],
    ['logKnowledge.itemDetail', { itemId: UUID }, true],
    ['logKnowledge.itemDetail', { itemId: UUID, revisionNo: 2 }, true],
    ['logKnowledge.itemDetail', { itemId: UUID, revisionNo: 0 }, false],
    ['logKnowledge.itemDetail', { itemId: UUID, revisionNo: 1.5 }, false],
    ['logKnowledge.itemDetail', { itemId: UUID, revisionNo: '1' }, false],
    ['logKnowledge.itemDetail', { itemId: UUID, revisionNo: null }, false],
    ['logKnowledge.itemDetail', { revisionNo: 1 }, false],
    ['logKnowledge.exploreModels', { filters: [{ id: 'processes', op: 'isEmpty' }] }, true],
    ['logKnowledge.exploreModels', { sorting: [{ id: 'modelItemCount', desc: true }] }, false],
    ['logKnowledge.items', { pageSize: 201 }, false],
  ])('%s %j -> ok=%s', (id, params, ok) => {
    expect(judge(id, params)?.ok).toBe(ok);
  });
});
