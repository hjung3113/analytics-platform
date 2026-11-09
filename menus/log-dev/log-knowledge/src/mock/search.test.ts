import { beforeEach, describe, expect, it } from 'vitest';
import type { KnowledgeSearchData, ItemDetail } from '../endpoints';
import { logKnowledgeActionsMock, logKnowledgeMock, resetCatalog, resetItems, resetSpecs } from './index';
import { all } from './store';

const read = async <T,>(name: string, params: Record<string, unknown>): Promise<T> => {
  const endpoint = logKnowledgeMock.find(e => e.spec.id === `logKnowledge.${name}`)!;
  expect(endpoint).toBeTruthy();
  return await endpoint.handle({ params } as never) as T;
};
const write = async (name: string, input: Record<string, unknown>) => {
  const action = logKnowledgeActionsMock.find(a => a.spec.id === `logKnowledge.${name}`)!;
  expect(action.validate?.(input) ?? []).toEqual([]);
  return await action.handle({ input, actor: 'admin', scopeId: null }) as { data: { id: string } };
};
beforeEach(() => { resetCatalog(); resetSpecs(); resetItems(); });
describe('knowledge search preview contract', () => {
  it.each(['STEP_PROCESS→PROCESS_START', 'STEP_PROCESS →PROCESS_START', 'STEP_PROCESS→ PROCESS_START'])('interprets the server-recognized arrow in %s', async q => {
    const result = await read<KnowledgeSearchData>('search', { q });
    expect(result.interpretation.direction).toMatchObject({ origin: 'operator', source: 'STEP_PROCESS', target: 'PROCESS_START' });
    expect(result.interpretation.tokens).toEqual([]);
  });
  it.each(['step before process', 'BEFORE before PROCESS_START', 'STEP_PROCESS after AFTER'])('keeps ordinary words out of direction interpretation: %s', async q => {
    expect((await read<KnowledgeSearchData>('search', { q })).interpretation.direction).toBeNull();
  });
  it('keeps reverse-only records separate and distinguishes observed from expected', async () => {
    const normal = await read<KnowledgeSearchData>('search', { q: 'STEP_PROCESS before PROCESS_START' });
    expect(normal.opposite).toBeNull();
    expect(normal.items.map(i => i.itemNo)).toContain(1);
    expect(normal.items.map(i => i.itemNo)).not.toContain(6);
    const both = await read<KnowledgeSearchData>('search', { q: 'STEP_PROCESS before PROCESS_START', includeOpposite: true });
    expect(both.opposite?.map(i => i.itemNo)).toContain(6);
    expect(both).not.toHaveProperty('total');
    const expected = await read<KnowledgeSearchData>('search', { q: 'STEP_PROCESS before PROCESS_START', kind: 'expected' });
    expect(expected.items.every(i => i.expectedOnly)).toBe(true);
  });
  it('serves suggestions and the indexing capture without exposing N/N counters', async () => {
    const suggestions = await read<{ suggestions: { text: string }[] }>('searchSuggest', { q: 'STEP' });
    expect(suggestions.suggestions.some(s => s.text.includes('STEP_PROCESS'))).toBe(true);
    const indexing = await read<KnowledgeSearchData>('search', { q: 'mock-indexing' });
    expect(indexing.indexLag.backfill).toEqual({ state: 'running', percent: 48 });
    expect(indexing.indexLag).not.toHaveProperty('total');
  });
  it('has deterministic fixtures for the four supported match-reason presentations', async () => {
    const result = await read<KnowledgeSearchData>('search', { q: 'mock-reasons' });
    expect(new Set(result.items.flatMap(i => i.reasons))).toEqual(new Set(['observed_same_direction', 'expected_same_direction', 'exact_token', 'concept_mapping']));
  });
  it('round trips free relation keys through create, detail, revise and search', async () => {
    const model = all('model').find(m => m.code === 'A-100')!.id;
    const content = { title: '관계 검색 round trip', typeCode: 'anomaly', observation: '관찰된 순서' };
    const created = await write('itemCreate', { ownerModelId: model, ...content, relations: [{ kind: 'observed', source: { module: 'CUSTOM', event: 'B' }, predicate: 'after', target: { module: 'CUSTOM', event: 'A' } }] });
    const detail = await read<ItemDetail>('itemDetail', { itemId: created.data.id });
    expect(detail.relations).toMatchObject([{ source: 'CUSTOM/A', predicate: 'before', target: 'CUSTOM/B', resolved: false }]);
    const found = await read<KnowledgeSearchData>('search', { q: 'CUSTOM/A before CUSTOM/B' });
    expect(found.items.map(i => i.itemId)).toContain(created.data.id);
    await write('itemRevise', { id: created.data.id, ...content, changeNote: '기록 제거', relations: [] });
    expect((await read<ItemDetail>('itemDetail', { itemId: created.data.id })).relations).toEqual([]);
    expect((await read<KnowledgeSearchData>('search', { q: 'CUSTOM/A before CUSTOM/B' })).items.map(i => i.itemId)).not.toContain(created.data.id);
  });
});
