import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildQuery, emptyGlobal, groupId, spaceId, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewSupport } from '../../index';
import { useHostPlatform, useSavedViews, type SavedViews } from '../../host';
import { createFakeSavedViewStore as createFakeStore, noContext, testAdapter, testSavedView as viewOf, testSession, testSpace, type FakeSavedViewStore as FakeStore } from '../../testing';

/** Saved views on a menu whose `filter` page key is hidden (not in the address) and repeated (ADR-0105). */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time'], pageKeys: ['filter'] };
const base = { group: groupId('overview'), primary: true, icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, pageKeys: ['filter'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], query: { mode: 'apply' as const } };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: base.label, icon: House, space: spaceId('mars') }], menus: [{ ...base, id: 'home', path: '/mars/home', features: { export: false, savedView: true, annotate: false, compare: false, board: false } }] });
const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
const address = `/mars/home${buildQuery({ ...emptyGlobal, ...period })}`;
const menuView = (id: string, page: [string, string][]) => viewOf({ id, name: id, kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, context: { ...period }, page });
const session = testSession(['platform:view']);

let views: SavedViews; let host: ReturnType<typeof useHostPlatform>;
function Probe() { useSavedViewSupport(support); views = useSavedViews(); host = useHostPlatform(); return <p>{views.status}</p>; }
function mount(store: FakeStore, pairs: [string, string][]) {
  window.history.replaceState(pairs.length > 0 ? { apHidden: { v: 1, pairs } } : null, '', address);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
}
const stateHidden = () => (window.history.state as { apHidden?: { pairs: [string, string][] } } | null)?.apHidden?.pairs ?? [];
beforeEach(() => window.sessionStorage.clear());
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

it('restoring a view without the hidden pair clears the active hidden pair even though the address is unchanged (F2)', async () => {
  const store = createFakeStore([menuView('bare', []), menuView('full', [['filter', 'x'], ['filter', 'y']])]);
  mount(store, [['filter', 'a']]);
  await waitFor(() => expect(views.status).toBe('ready'));
  const push = vi.spyOn(window.history, 'pushState');
  await act(async () => { await views.select('bare'); });
  expect(host.pageParams('filter')).toEqual([]);
  expect(stateHidden()).toEqual([]);
  expect(push).toHaveBeenCalledTimes(1);
  expect(views.selected?.view.id).toBe('bare');
  await act(async () => { await views.select('full'); });
  expect(host.pageParams('filter')).toEqual(['x', 'y']);
  expect(window.location.pathname + window.location.search).toBe(address);
  expect(views.state.modified).toBe(false);
});

it('a pick whose read was overtaken by a hidden-only change is dropped (F9)', async () => {
  const store = createFakeStore([menuView('late', [['filter', 'z']])]);
  mount(store, [['filter', 'a']]);
  await waitFor(() => expect(views.status).toBe('ready'));
  const slow = deferred();
  store.getHold.set('late', slow.promise);
  let picking: Promise<unknown> | undefined;
  act(() => { picking = views.select('late'); });
  act(() => host.setPage({ filter: ['b'] }));
  await act(async () => { slow.release(); await picking; });
  expect(host.pageParams('filter')).toEqual(['b']);
  expect(views.selected).toBeNull();
});

it('a save that finishes after a hidden-only change does not select the saved snapshot (F9)', async () => {
  const store = createFakeStore();
  mount(store, [['filter', 'a']]);
  await waitFor(() => expect(views.status).toBe('ready'));
  const slow = deferred();
  store.saveHold = slow.promise;
  let saving: Promise<unknown> | undefined;
  act(() => { saving = views.saveAs({ name: 'mine', kind: 'menu-view' }); });
  act(() => host.setPage({ filter: ['b'] }));
  await act(async () => { slow.release(); await saving; });
  expect(views.selected).toBeNull();
});

it('capture keeps the order of a repeated key, so a view with filter z,a restores z,a and differs from a,z (F6)', async () => {
  const store = createFakeStore([menuView('za', [['filter', 'z'], ['filter', 'a']])]);
  mount(store, []);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('za'); });
  expect(host.pageParams('filter')).toEqual(['z', 'a']);
  expect(views.state.modified).toBe(false);
  act(() => host.setPage({ filter: ['a', 'z'] }));
  expect(views.state.modified).toBe(true);
});
