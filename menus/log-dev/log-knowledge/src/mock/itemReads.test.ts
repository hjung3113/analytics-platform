import { beforeEach, describe, expect, it } from 'vitest';
import { emptyGlobal, type ColumnFilter } from '@ap/contracts';
import { logKnowledgeMock, resetCatalog, resetItems } from './index';
import { allItems } from './items';

type Owner = { kind: string; modelId: string; softwareId?: string };
type Row = { id: string; itemNo: number; title: string; typeCode: string; owner: Owner; publicationState: string; updatedAt: string; revisionNo: number; observedAt: string; newState: string };
type Detail = {
  item: Record<string, unknown>; revision: { revisionNo: number; evidence: unknown[] }; revisions: Row[]; assessments: Row[]; links: Record<string, unknown>[];
};
type Params = Record<string, unknown>;
const endpoint = (id: string) => logKnowledgeMock.find(e => e.spec.id === `logKnowledge.${id}`)!;
const judge = (id: string, params: Params) => endpoint(id).validate?.({ context: emptyGlobal, params }) ?? null;
const call = (id: string, params: Params): unknown => {
  expect(judge(id, params)).toBeNull();
  return endpoint(id).handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' });
};
const list = (params: Params = {}) => call('items', { pageSize: 200, ...params }) as { rows: Row[]; total: number };
const detail = (params: Params) => call('itemDetail', params) as Detail | null;
const nos = (params: Params = {}) => list(params).rows.map(r => r.itemNo);
const f = (id: string, op: string, value?: string[]) => ({ id, op, ...(value ? { value } : {}) }) as ColumnFilter;

beforeEach(() => { resetCatalog(); resetItems(); });

describe('seed', () => {
  it('has ~30 items over both owner kinds, every type and state, one archived, one without evidence', () => {
    const items = allItems();
    expect(items).toHaveLength(30);
    expect(new Set(items.map(i => (i.ownerSoftwareId ? 'software' : 'model'))).size).toBe(2);
    expect(new Set(items.map(i => i.revisions.at(-1)!.typeCode)).size).toBe(4);
    expect(new Set(items.map(i => i.verificationState))).toEqual(new Set(['not_checked', 'observed', 'verified', 'disputed']));
    expect(new Set(items.map(i => i.processingState)).size).toBe(3);
    expect(items.filter(i => i.publicationState === 'archived')).toHaveLength(1);
    expect(items.some(i => i.revisions.at(-1)!.evidence.length === 0)).toBe(true);
    expect(items.some(i => i.revisions.length === 3)).toBe(true);
  });
});

describe('logKnowledge.items', () => {
  it('answers published items only without a publicationState condition, newest update first', () => {
    const { rows, total } = list();
    expect(total).toBe(29);
    expect(rows.every(r => r.publicationState === 'published')).toBe(true);
    const dates = rows.map(r => r.updatedAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });
  it('lets an explicit publicationState condition choose archived items', () => {
    expect(nos({ filters: [f('publicationState', 'in', ['archived'])] })).toEqual([3]);
    expect(list({ filters: [f('publicationState', 'in', ['published', 'archived'])] }).total).toBe(30);
  });
  it('filters by owner kind, type and the two state axes', () => {
    expect(list({ filters: [f('ownerKind', 'in', ['software'])] }).rows.every(r => r.owner.kind === 'software')).toBe(true);
    expect(list({ filters: [f('typeCode', 'in', ['guideline'])] }).rows.every(r => r.typeCode === 'guideline')).toBe(true);
    expect(nos({ filters: [f('verificationState', 'in', ['disputed']), f('processingState', 'in', ['under_investigation'])] })).toContain(1);
    expect(list({ filters: [f('typeCode', 'notIn', ['guideline'])] }).rows.some(r => r.typeCode === 'guideline')).toBe(false);
  });
  it('ownerModelId matches the model directly; includeSoftware widens it to its SW versions; notIn drops items without that owner', () => {
    const modelId = allItems()[0]!.ownerModelId!;
    const direct = list({ filters: [f('ownerModelId', 'in', [modelId])] }).rows;
    expect(direct.every(r => r.owner.kind === 'model' && r.owner.modelId === modelId)).toBe(true);
    const wide = list({ filters: [f('ownerModelId', 'in', [modelId]), f('includeSoftware', 'in', ['true'])] }).rows;
    expect(wide.length).toBeGreaterThan(direct.length);
    expect(wide.every(r => r.owner.modelId === modelId)).toBe(true);
    const swId = allItems().find(i => i.ownerSoftwareId)!.ownerSoftwareId!;
    expect(list({ filters: [f('ownerSoftwareId', 'notIn', [swId])] }).rows.every(r => r.owner.softwareId !== swId && r.owner.kind === 'software')).toBe(true);
  });
  it('searches the latest title and KI-<n> / KI<n>, not a bare number', () => {
    expect(nos({ q: 'ki-7' })).toEqual([7]);
    expect(nos({ q: 'KI7' })).toEqual([7]);
    expect(nos({ q: '7' })).toEqual([]);
    expect(nos({ q: '챔버 압력' })).toContain(1);
  });
  it('sorts by itemNo and title and pages', () => {
    expect(nos({ sorting: [{ id: 'itemNo', desc: false }] }).slice(0, 3)).toEqual([1, 2, 4]);
    expect(nos({ sorting: [{ id: 'itemNo', desc: true }] })[0]).toBe(30);
    expect(list({ pageSize: 10, page: 2 }).rows).toHaveLength(9);
  });
  it.each([
    ['an unknown param', { nope: 1 }],
    ['an unknown filter field', { filters: [f('owner', 'in', ['x'])] }],
    ['an operator outside the field', { filters: [f('typeCode', 'isEmpty')] }],
    ['an enum value outside the vocabulary', { filters: [f('typeCode', 'in', ['tip'])] }],
    ['a non-uuid owner id', { filters: [f('ownerModelId', 'in', ['abc'])] }],
    ['two values in includeSoftware', { filters: [f('includeSoftware', 'in', ['true', 'false'])] }],
    ['an unknown sort id', { sorting: [{ id: 'type', desc: false }] }],
    ['a page size over 200', { pageSize: 201 }],
    ['a q with NUL', { q: 'a\u0000b' }],
    ['a q with a lone high surrogate', { q: 'a\ud800b' }],
    ['a q with a lone low surrogate', { q: 'a\udc00' }],
  ])('refuses %s', (_, params) => { expect(judge('items', params as Params)).not.toBeNull(); });
});

describe('logKnowledge.itemDetail', () => {
  const id = (n: number) => allItems()[n - 1]!.id;
  it('answers the latest revision with evidence, the revision list newest first and assessments newest first', () => {
    const d = detail({ itemId: id(1) })!;
    expect(d.item).toMatchObject({ itemNo: 1, latestRevisionNo: 3, version: '1' });
    expect(d.revision.revisionNo).toBe(3);
    expect(d.revision.evidence.length).toBeGreaterThan(0);
    expect(d.revisions.map(r => r.revisionNo)).toEqual([3, 2, 1]);
    const at = d.assessments.map(a => a.observedAt);
    expect(at).toEqual([...at].sort().reverse());
    expect(d.assessments.some(a => a.newState === 'disputed')).toBe(true);
  });
  it('reads an older revision on request and answers null for a revision the item lacks', () => {
    expect(detail({ itemId: id(1), revisionNo: 1 })!.revision.revisionNo).toBe(1);
    expect(detail({ itemId: id(1), revisionNo: 9 })).toBeNull();
  });
  it('answers null for an unknown id and an item without evidence has an empty list', () => {
    expect(detail({ itemId: '00000005-0000-4000-8000-0000000000ff' })).toBeNull();
    expect(detail({ itemId: id(4) })!.revision.evidence).toEqual([]);
  });
  it('shows a derived_from pair with directions on both items', () => {
    const original = detail({ itemId: id(1) })!.links;
    const derived = detail({ itemId: id(5) })!.links;
    expect(original).toEqual([expect.objectContaining({ kind: 'derived_from', direction: 'incoming', itemNo: 5, sourceRevisionNo: 2 })]);
    expect(derived).toEqual([expect.objectContaining({ kind: 'derived_from', direction: 'outgoing', itemNo: 1, sourceRevisionNo: 2 })]);
  });
  it.each([
    ['a bad id', { itemId: 'x' }], ['revision 0', { itemId: '00000005-0000-4000-8000-000000000001', revisionNo: 0 }],
    ['an unknown param', { itemId: '00000005-0000-4000-8000-000000000001', extra: 1 }],
  ])('refuses %s', (_, params) => { expect(judge('itemDetail', params as Params)).not.toBeNull(); });
});
