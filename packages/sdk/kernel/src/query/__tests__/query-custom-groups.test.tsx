import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { buildQuery, defineEndpoint, groupId, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, useQueryEngine } from '../../platform/platform';
import { useEquipmentFacts } from '../../scope/selection-ports';
import { menuRequest, useMenuQuery, type QueryState } from '../query';
import * as groupExpansion from '../../saved-view/expand-custom-groups';
import { createRegistry } from '../../registry/registry';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSession, testSpace } from '../../testing';

const group = { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') };
const context = { ...noContext, time: 'apply' as const, condition: 'apply' as const, selection: 'apply' as const };
const registry = createRegistry({ spaces: [testSpace()], groups: [group], menus: [{
  id: 'home', group: group.id, primary: true, path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: true, context, query: { mode: 'apply', required: { context: ['time'] } },
  pageType: 'overview', pageKeys: [], features: { export: false, savedView: false, annotate: false, compare: false },
}] });
const endpoint = defineEndpoint<null, { hits: number }>({
  id: 'analytics.custom-group-fixture', menuId: 'home', paramKeys: {}, permission: 'platform:view', requiresScope: true,
  context: { time: 'apply', condition: 'apply', selection: 'apply' }, kinds: [], mergeTimeDomain: false,
});
const facts = { version: 'facts-1', items: [
  { equipmentId: 'E1', room: 'PHOTO', axes: { maker: ['A'] } },
  { equipmentId: 'E2', room: 'ETCH', axes: { maker: ['B'] } },
] };
const session = testSession(['platform:view']);
const period = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
const queryAddress = (condition: Record<string, string[]>, selection: string[] | null = ['E1', 'E2']) => `/${buildQuery({
  scopeId: 'MEM', ...period, roomNames: null, lineNames: null, prcGroups: null, condition, membershipBasis: null,
  selection, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null,
})}`;

let state: QueryState<{ hits: number }> | undefined;
function QueryProbe() {
  const next = useMenuQuery(endpoint, null);
  useLayoutEffect(() => { state = next; });
  return null;
}
function FactsProbe() { useEquipmentFacts('MEM'); return null; }
function tree(adapter: Parameters<typeof testAdapter>[0], savedViews?: ReturnType<typeof createFakeSavedViewStore>, children = <QueryProbe />) {
  return <I18nProvider><PlatformProvider registry={registry} equipmentAxes={[{ id: 'maker', label: { ko: '제조사', en: 'Maker' }, membershipHistory: true }]} adapter={testAdapter(adapter)} savedViews={savedViews}>{children}</PlatformProvider></I18nProvider>;
}
function response(): ApiResponse<{ hits: number }> { return { outcome: 'ok', data: { hits: 1 }, assessments: [], trust: null, correlationId: 'query-ok' }; }
function menuQuerySpy() { return vi.fn(async (_request: MenuQuery) => response()); }
afterEach(() => { cleanup(); state = undefined; window.history.replaceState(null, '', '/'); });

it('expands groups into selection, strips the reserved axis, and shares equipment facts with the picker hook', async () => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g1'], maker: ['A'] }));
  const savedViews = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  const menuQuery = menuQuerySpy();
  const listEquipmentFacts = vi.fn(async () => facts);
  const adapter = testAdapter({ session: () => session, listEquipmentFacts, menuQuery });
  render(tree(adapter, savedViews, <><QueryProbe /><FactsProbe /></>));
  await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(state?.response?.outcome).toBe('ok'));
  expect(menuQuery.mock.calls[0]?.[0].context).toMatchObject({
    scopeId: 'MEM', ...period, condition: { maker: ['A'] }, selection: ['E1'],
  });
  expect(menuQuery.mock.calls[0]?.[0].context.condition).not.toHaveProperty('customGroup');
  expect(listEquipmentFacts).toHaveBeenCalledTimes(1);
});

it('keeps a group request pending while the saved-group list is loading', async () => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g1'] }, null));
  let release!: () => void;
  const savedViews = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  savedViews.listHold = new Promise<void>(resolve => { release = resolve; });
  const menuQuery = menuQuerySpy();
  render(tree(testAdapter({ session: () => session, menuQuery, listEquipmentFacts: async () => facts }), savedViews));
  await waitFor(() => expect(savedViews.reads).toContain('list'));
  expect(state).toMatchObject({ status: 'loading', response: null });
  expect(menuQuery).not.toHaveBeenCalled();
  await act(async () => { release(); });
  await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(state?.response?.outcome).toBe('ok'));
});

it('keeps a group request pending while current Scope facts are loading', async () => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g1'] }, null));
  const savedViews = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  let release!: (value: typeof facts) => void;
  const factsHold = new Promise<typeof facts>(resolve => { release = resolve; });
  const listEquipmentFacts = vi.fn(() => factsHold);
  const menuQuery = menuQuerySpy();
  render(tree(testAdapter({ session: () => session, menuQuery, listEquipmentFacts }), savedViews));
  await waitFor(() => expect(listEquipmentFacts).toHaveBeenCalledTimes(1));
  expect(state).toMatchObject({ status: 'loading', response: null });
  expect(menuQuery).not.toHaveBeenCalled();
  await act(async () => { release(facts); });
  await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(state?.response?.outcome).toBe('ok'));
});

it('blocks a denied group with its ID and reason without calling the menu endpoint', async () => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g-secret'] }, null));
  const savedViews = createFakeSavedViewStore();
  savedViews.list = async () => [{ id: 'g-secret', denied: true, reason: 'scope' }];
  const menuQuery = menuQuerySpy();
  const listEquipmentFacts = vi.fn(async () => facts);
  render(tree(testAdapter({ session: () => session, menuQuery, listEquipmentFacts }), savedViews));
  await waitFor(() => expect(state?.response?.outcome).toBe('error'));
  expect(state?.response?.message).toContain('g-secret (scope)');
  expect(menuQuery).not.toHaveBeenCalled();
  expect(listEquipmentFacts).not.toHaveBeenCalled();
});

it('reports a missing facts port without sending a group query', async () => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g1'] }, null));
  const savedViews = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  const menuQuery = menuQuerySpy();
  const adapter = testAdapter({ session: () => session, menuQuery, listEquipmentFacts: undefined });
  render(tree(adapter, savedViews));
  await waitFor(() => expect(state?.response?.outcome).toBe('error'));
  expect(state?.response?.message).toContain('listEquipmentFacts is not implemented');
  expect(menuQuery).not.toHaveBeenCalled();
});

it('blocks a failed current Scope facts request with a reason and does not call the menu endpoint', async () => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g1'] }, null));
  const savedViews = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  const menuQuery = menuQuerySpy();
  render(tree(testAdapter({ session: () => session, menuQuery, listEquipmentFacts: async () => { throw new Error('facts offline'); } }), savedViews));
  await waitFor(() => expect(state?.response?.outcome).toBe('error'));
  expect(state?.response?.message).toContain('equipment facts could not load');
  expect(state?.response?.message).toContain('listEquipmentFacts could not load current Scope facts');
  expect(menuQuery).not.toHaveBeenCalled();
});

it('leaves requests without customGroup unchanged and does not read groups or facts for expansion', async () => {
  window.history.replaceState(null, '', queryAddress({ maker: ['A'] }, ['E2']));
  const savedViews = createFakeSavedViewStore();
  const list = vi.spyOn(savedViews, 'list');
  const menuQuery = menuQuerySpy();
  const listEquipmentFacts = vi.fn(async () => facts);
  render(tree(testAdapter({ session: () => session, menuQuery, listEquipmentFacts }), savedViews));
  await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(1));
  expect(menuQuery.mock.calls[0]?.[0].context).toMatchObject({ condition: { maker: ['A'] }, selection: ['E2'] });
  expect(menuQuery.mock.calls[0]?.[0].context.condition).not.toHaveProperty('customGroup');
  expect(list).not.toHaveBeenCalled();
  expect(listEquipmentFacts).not.toHaveBeenCalled();
});

it.each([undefined, 'reference'] as const)('blocks custom groups when endpoint Selection is %s', async selection => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g1'] }, null));
  const savedViews = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  const menuQuery = menuQuerySpy();
  const unsupported = defineEndpoint<null, { hits: number }>({ ...endpoint, context: { time: 'apply', condition: 'apply', ...(selection ? { selection } : {}) } });
  function Probe() {
    const next = useMenuQuery(unsupported, null);
    useLayoutEffect(() => { state = next; });
    return null;
  }
  render(tree(testAdapter({ session: () => session, menuQuery, listEquipmentFacts: async () => facts }), savedViews, <Probe />));
  await waitFor(() => expect(state?.response?.outcome).toBe('error'));
  expect(state?.response?.message).toContain('endpoint cannot receive custom-group members');
  expect(menuQuery).not.toHaveBeenCalled();
});

it('does not send when aborted between group expansion and the transport continuation', async () => {
  window.history.replaceState(null, '', queryAddress({ customGroup: ['g1'] }, null));
  const savedViews = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  const menuQuery = menuQuerySpy();
  const controller = new AbortController();
  let send: (() => Promise<ApiResponse<{ hits: number }>>) | undefined;
  function Probe() {
    const platform = useHostPlatform();
    const queryEngine = useQueryEngine();
    useLayoutEffect(() => {
      const request = menuRequest(endpoint, { ...platform, queryEngine });
      send = request.ready ? () => request.send(null, controller.signal) : undefined;
    });
    return null;
  }
  render(tree(testAdapter({ session: () => session, menuQuery, listEquipmentFacts: async () => facts }), savedViews, <Probe />));
  await waitFor(() => expect(send).toBeDefined());
  const expand = groupExpansion.expandCustomGroups;
  const spy = vi.spyOn(groupExpansion, 'expandCustomGroups').mockImplementationOnce(input => {
    const result = expand(input);
    // This microtask runs after expansion resolves and before send's continuation.
    queueMicrotask(() => controller.abort());
    return result;
  });
  try {
    await expect(send!()).rejects.toMatchObject({ name: 'AbortError' });
    expect(spy).toHaveBeenCalledOnce();
    expect(menuQuery).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
