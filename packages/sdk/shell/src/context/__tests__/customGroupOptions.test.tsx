import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { buildQuery, defineEndpoint, groupId, spaceId } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, useMenuFetch } from '@ap/kernel';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSession, testSpace } from '@ap/kernel/testing';
import { useCustomGroupOptions } from '../customGroupOptions';

const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: { ...noContext, condition: 'apply' }, pageKeys: [], pageType: 'analysis', query: { mode: 'live' as const }, features: { export: false, savedView: false, annotate: false, compare: false } }] });

it('ignores a save that settles after the Scope moved on, so the new Scope keeps its groups and blockers (#2390)', async () => {
  const store = createFakeSavedViewStore([testSavedView({ id: 'b-1', kind: 'custom-group', savedScopeId: 'B', target: { fixed: ['E1'] } })]);
  const session = testSession(['platform:view']);
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session })}>{children}</PlatformProvider></I18nProvider>;
  const { result, rerender } = renderHook(({ scopeId }) => useCustomGroupOptions({ scopeId, selectedGroupIds: ['b-1', 'gone-9'], canEditCondition: true }), { wrapper, initialProps: { scopeId: 'A' } });
  await waitFor(() => expect(result.current.optionsById.get('gone-9')?.reason).toBe('not-found'));
  const rememberInA = result.current.remember;
  rerender({ scopeId: 'B' });
  await waitFor(() => expect(result.current.optionsById.get('b-1')?.target).toEqual({ fixed: ['E1'] }));
  const late = await store.save({ schemaVersion: 1, kind: 'custom-group', name: 'late', savedScopeId: 'A', target: { fixed: ['E2'] } });
  if (!late.ok) throw new Error('save failed');
  act(() => rememberInA(late.value));
  expect(result.current.optionsById.get('b-1')?.target).toEqual({ fixed: ['E1'] });
  expect(result.current.blocked).toEqual([{ id: 'gone-9', reason: '없는 그룹' }]);
});


it('shows a saved group immediately but rereads the list on the following query (#2470)', async () => {
  window.history.replaceState(null, '', '/' + buildQuery({ scopeId: 'MEM', from: '2026-01-01T00:00:00', to: '2026-01-02T00:00:00', roomNames: ['PHOTO'], lineNames: null, prcGroups: null, condition: { customGroup: ['g1'] }, membershipBasis: null, selection: null, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null }));
  const store = createFakeSavedViewStore();
  const list = vi.spyOn(store, 'list');
  const session = testSession(['platform:view']);
  const menuQuery = vi.fn(async () => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'ok' }));
  const endpoint = defineEndpoint<null, unknown>({ id: 'fixture.groups', menuId: 'home', permission: 'platform:view', requiresScope: true, paramKeys: {}, context: { condition: 'apply', selection: 'apply' }, kinds: [], mergeTimeDomain: false });
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session, menuQuery, listEquipmentFacts: async () => ({ version: '1', items: [{ equipmentId: 'E1', room: 'PHOTO', axes: {} }] }) })}>{children}</PlatformProvider></I18nProvider>;
  const { result } = renderHook(() => ({ groups: useCustomGroupOptions({ scopeId: 'MEM', selectedGroupIds: ['g1'], canEditCondition: true }), query: useMenuFetch(endpoint) }), { wrapper });
  await waitFor(() => expect(result.current.groups.optionsById.get('g1')?.reason).toBe('not-found'));
  await waitFor(() => expect(result.current.query.ready).toBe(true));
  const saved = await store.save({ schemaVersion: 1, kind: 'custom-group', name: 'new', savedScopeId: 'MEM', target: { fixed: ['E1'] } });
  if (!saved.ok) throw new Error('save failed');
  // The selected id exists only in the write response, not in a subsequent store list.
  const entry = { ...saved.value, view: { ...saved.value.view, id: 'g1' } };
  act(() => result.current.groups.remember(entry));
  await waitFor(() => expect(result.current.groups.optionsById.get('g1')?.target).toEqual({ fixed: ['E1'] }));
  expect(list).toHaveBeenCalledTimes(1);
  await act(async () => { expect((await result.current.query.fetch(null)).outcome).toBe('error'); });
  expect(list).toHaveBeenCalledTimes(2);
  expect(menuQuery).not.toHaveBeenCalled();
});

it('hides the previous Scope list until the new Scope read settles (#2470)', async () => {
  const store = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', savedScopeId: 'A', target: { fixed: ['E1'] } })]);
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={adapter}>{children}</PlatformProvider></I18nProvider>;
  const { result, rerender } = renderHook(({ scopeId, enabled }) => useCustomGroupOptions({ scopeId, selectedGroupIds: ['g1'], canEditCondition: enabled }), { wrapper, initialProps: { scopeId: 'A', enabled: true } });
  await waitFor(() => expect(result.current.optionsById.get('g1')?.target).toEqual({ fixed: ['E1'] }));
  let release!: () => void;
  store.listHold = new Promise<void>(resolve => { release = resolve; });
  rerender({ scopeId: 'B', enabled: true });
  expect(result.current.optionsById.get('g1')?.reason).toBe('loading');
  expect(result.current.blocked).toEqual([]);
  await act(async () => { release(); });
  await waitFor(() => expect(result.current.optionsById.get('g1')?.reason).toBe('scope-mismatch'));
  rerender({ scopeId: 'B', enabled: false });
  expect(result.current.optionsById.get('g1')?.reason).toBe('not-found');
  expect(result.current.blocked).toEqual([]);
});
