// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { useConceptActions, useConceptMappings, useConceptSuggestions, useSpecSubjectItems } from './useConceptData';
import { useSubjectPickerSpec } from '../items/useSubjectData';
import { knowledgeRegistry } from '../test-support';

const registry = knowledgeRegistry(['knowledge:spec-publish', 'knowledge:catalog-manage'], { description: { ko: '로그 개발', en: 'Log development' }, homeMenuId: 'log-knowledge-models' });
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'hook' }) as ApiResponse<never>;
const row = (n: number) => ({ id: `m${n}` });
let queries: MenuQuery[], writes: MenuAction[];
afterEach(cleanup);
function mount() {
  queries = []; writes = [];
  window.history.replaceState(null, '', '/logDev/log-knowledge-spec/x?v=1');
  const session = testSession(['platform:view', 'knowledge:spec-publish']);
  const adapter = testAdapter({ session: () => session,
    menuQuery: async req => {
      queries.push(req);
      const p = req.params as Record<string, number>;
      if (req.endpoint === 'logKnowledge.conceptMappings') return ok({ rows: p.page === 0 ? Array.from({ length: 200 }, (_, i) => row(i)) : [row(200)], total: 201 });
      return ok({ rows: [], total: 0 });
    },
    menuAction: async req => { writes.push(req); return { outcome: 'ok', data: { mappingId: 'm1' }, version: '2' } as unknown as ActionResponse<never>; } });
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;
  return wrapper;
}

describe('concept data hooks', () => {
  it('reads every page of the mappings for the filter', async () => {
    const { result } = renderHook(() => useConceptMappings({ modelId: 'm', reviewState: 'proposed' }, true), { wrapper: mount() });
    await waitFor(() => expect(result.current.response?.outcome).toBe('ok'));
    expect((result.current.response!.data as { rows: unknown[] }).rows).toHaveLength(201);
    const sent = queries.filter(q => q.endpoint === 'logKnowledge.conceptMappings').map(q => q.params);
    expect(sent).toEqual([{ modelId: 'm', reviewState: 'proposed', page: 0, pageSize: 200 }, { modelId: 'm', reviewState: 'proposed', page: 1, pageSize: 200 }]);
  });
  it('sends no read while disabled, and none for an empty subject key', async () => {
    const wrapper = mount();
    renderHook(() => { useConceptMappings({}, false); useConceptSuggestions('m', undefined, false); useSpecSubjectItems('m', null, true); useSubjectPickerSpec(null); }, { wrapper });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(queries).toEqual([]);
  });
  it('reads suggestions, subject items and the picker spec with the declared params', async () => {
    const wrapper = mount();
    renderHook(() => { useConceptSuggestions('m', 'event', true); useSpecSubjectItems('m', 'A/B', true); useSubjectPickerSpec('m'); }, { wrapper });
    await waitFor(() => expect(queries.map(q => q.endpoint).sort()).toEqual(['logKnowledge.conceptSuggestions', 'logKnowledge.modelSpec', 'logKnowledge.specSubjectItems']));
    expect(queries.find(q => q.endpoint === 'logKnowledge.conceptSuggestions')!.params).toEqual({ modelId: 'm', kind: 'event', page: 0, pageSize: 200 });
    expect(queries.find(q => q.endpoint === 'logKnowledge.specSubjectItems')!.params).toEqual({ modelId: 'm', targetKey: 'A/B', page: 0, pageSize: 200 });
  });
  it('confirm and reject carry the row version as expectedVersion; propose carries none', async () => {
    const { result } = renderHook(() => useConceptActions(), { wrapper: mount() });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.confirm('m1', 3); });
    await act(async () => { await result.current.reject('m1', '다름', '4'); });
    await act(async () => { await result.current.propose({ modelId: 'm', targetKind: 'module', target: { module: 'R' }, canonicalLabel: 'L' }); });
    expect(writes.map(w => [w.action, w.expectedVersion, w.input])).toEqual([
      ['logKnowledge.conceptConfirm', '3', { mappingId: 'm1' }],
      ['logKnowledge.conceptReject', '4', { mappingId: 'm1', reason: '다름' }],
      ['logKnowledge.conceptPropose', undefined, { modelId: 'm', targetKind: 'module', target: { module: 'R' }, canonicalLabel: 'L' }]]);
  });
});
