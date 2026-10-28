import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildQuery, emptyGlobal, groupId, spaceId, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewSupport, usePlatform, type MenuPlatform } from '../../index';
import { useHostPlatform, useSavedViews, type SavedViews } from '../../host';
import { createFakeSavedViewStore as createFakeStore, noContext, testAdapter, testSavedView as viewOf, testSession, testSpace, type FakeSavedViewStore as FakeStore } from '../../testing';
/** A promise the test resolves by hand, to finish a store call out of order. */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time', 'line'], pageKeys: ['filter'] };
const base = { group: groupId('overview'), primary: true, icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, pageKeys: ['filter'], contextResetKeys: ['filter'], query: { mode: 'apply' as const } };
const menu = (id: string, path: string, savedView: boolean, primary = false) => ({ ...base, id, path, primary, features: { export: false, savedView, annotate: false, compare: false, board: false } });
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: base.label, icon: House, space: spaceId('mars') }], menus: [menu('home', '/', true, true), menu('plain', '/plain', false)] });
const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
const query = (lineNames: string[], filter?: string) => buildQuery({ ...emptyGlobal, ...period, lineNames }, filter ? [['filter', filter]] : []);
const L1 = viewOf({ id: 'l1', name: 'L1', context: { ...period, lineNames: ['L1'] } });
const L2 = viewOf({ id: 'l2', name: 'L2', context: { ...period, lineNames: ['L2'] } });
const session = testSession(['platform:view']);

let views: SavedViews; let host: ReturnType<typeof useHostPlatform>;
function Probe() { useSavedViewSupport(support); views = useSavedViews(); host = useHostPlatform(); return <p>{views.status}</p>; }
function mount(store: FakeStore | undefined, url = '/') {
  window.history.replaceState(null, '', url);
  const ui = (s: FakeStore | undefined) => <I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={s}><Probe /></PlatformProvider></I18nProvider>;
  return render(ui(store));
}
const KEY = 'platform:saved-view:selected:u1:home';
beforeEach(() => window.sessionStorage.clear());
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

it('is inactive without an injected store, and the store is a host value, not part of MenuPlatform', () => {
  mount(undefined);
  expect(views.status).toBe('disabled');
  expect(views.menuViews).toEqual([]);
  // @ts-expect-error the store is host-only (ADR-0076)
  const _menu: MenuPlatform['savedViewStore'] = undefined;
  void _menu; void usePlatform;
});
it('stays inactive for a menu that does not declare features.savedView', async () => {
  const store = createFakeStore([L1]);
  mount(store, '/plain');
  await act(async () => {});
  expect(views.status).toBe('disabled');
  expect(store.calls).toEqual([]);
  expect(store.reads).toEqual([]);
});

it('applies the personal default to a bare route with one replace that Back cannot return to', async () => {
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  const replace = vi.spyOn(window.history, 'replaceState');
  const push = vi.spyOn(window.history, 'pushState');
  const length = window.history.length;
  mount(store);
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
  expect(push).not.toHaveBeenCalled();
  expect(window.history.length).toBe(length);
  expect(replace.mock.calls.filter(([, , url]) => String(url).includes('line'))).toHaveLength(1);
  await waitFor(() => expect(views.selected?.view.id).toBe('l1'));
  expect(window.sessionStorage.getItem(KEY)).toBe('l1');
});
it.each([
  ['a Context key', query(['L2'])],
  ['a page key', '?filter=x'],
])('the personal default does not overwrite %s in an explicit address or fill other keys', async (_name, url) => {
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  mount(store, `/${url}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => {});
  expect(window.location.search).toBe(url);
  expect(views.selected).toBeNull();
});

it('picking a view writes its Context to the address and keeps the id in the tab, not in the link', async () => {
  const store = createFakeStore([L1, L2]);
  mount(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  let outcome: Awaited<ReturnType<SavedViews['select']>> | undefined;
  await act(async () => { outcome = await views.select('l2'); });
  expect(outcome).toEqual({ ok: true, unsupported: [] });
  expect(window.location.search).toBe(query(['L2']));
  expect(window.location.href).not.toContain('l2');
  expect(window.sessionStorage.getItem(KEY)).toBe('l2');
  expect(views.state).toEqual({ modified: false, unsaved: false, unapplied: false });
  // A copied link reproduces the materialized Context in a fresh tab (no selection there).
  const link = window.location.href;
  cleanup(); window.sessionStorage.clear();
  mount(store, link.slice(window.location.origin.length));
  await waitFor(() => expect(views.status).toBe('ready'));
  expect(host.global.lineNames).toEqual(['L2']);
  expect(views.selected).toBeNull();
});

it('a reload keeps the selection when the address still equals the saved copy', async () => {
  const store = createFakeStore([L1]);
  window.sessionStorage.setItem(KEY, 'l1');
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.selected?.view.id).toBe('l1'));
  expect(views.state.modified).toBe(false);
});
it('a reload drops the selection when the explicit address differs from the saved copy (the address wins)', async () => {
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  window.sessionStorage.setItem(KEY, 'l1');
  mount(store, `/${query(['L2'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull());
  expect(window.location.search).toBe(query(['L2']));
  expect(views.selected).toBeNull();
});
it('in-page changes after picking show 수정됨 and keep the selection; Back to a differing address drops it', async () => {
  const store = createFakeStore([L1]);
  mount(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  act(() => host.setGlobal({ lineNames: ['L2'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  expect(views.selected?.view.id).toBe('l1');
  act(() => window.history.back());
  await waitFor(() => expect(host.global.lineNames).toEqual(['L1']));
  expect(views.selected?.view.id).toBe('l1');
  act(() => window.history.forward());
  await waitFor(() => expect(host.global.lineNames).toEqual(['L2']));
  await waitFor(() => expect(views.selected).toBeNull());
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});

it.each([
  ['missing', (s: FakeStore) => void s.rows.delete('l2'), 'unavailable'],
  ['out of permission', (s: FakeStore) => void s.denied.add('l2'), 'denied'],
  ['unreadable', (s: FakeStore) => { s.failGet = true; }, 'unavailable'],
])('a failed restore (%s) leaves the applied address as it was and drops the selection', async (_name, break_, reason) => {
  const store = createFakeStore([L1, L2]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  break_(store);
  let outcome: Awaited<ReturnType<SavedViews['select']>> | undefined;
  await act(async () => { outcome = await views.select('l2'); });
  expect(outcome).toEqual({ ok: false, reason });
  expect(window.location.search).toBe(query(['L1']));
  expect(views.selected).toBeNull();
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});
it('a view saved for an older menu schema is refused without touching the address', async () => {
  const stale = viewOf({ id: 'old', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 0, context: {}, page: [], chartOptions: {}, layout: null, panels: null } as never);
  mount(createFakeStore([stale]), `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  let outcome: Awaited<ReturnType<SavedViews['select']>> | undefined;
  await act(async () => { outcome = await views.select('old'); });
  expect(outcome).toEqual({ ok: false, reason: 'stale-schema' });
  expect(window.location.search).toBe(query(['L1']));
});
it('lists the Context the menu cannot restore', async () => {
  const wide = viewOf({ id: 'w', context: { ...period, roomNames: ['R1'] } });
  mount(createFakeStore([wide]));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('w'); });
  expect(views.unsupported).toEqual([{ kind: 'context', key: 'roomNames' }]);
  expect(host.global.roomNames).toBeNull();
});

it('saves the APPLIED conditions and never the unapplied draft; a draft shows as 미적용 변경', async () => {
  const store = createFakeStore();
  mount(store, `/${query(['L1'], 'a')}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  act(() => host.queryDraft.setDraftGlobal({ lineNames: ['DRAFT'] }));
  await waitFor(() => expect(views.state.unapplied).toBe(true));
  let saved: Awaited<ReturnType<SavedViews['saveAs']>> | undefined;
  await act(async () => { saved = await views.saveAs({ name: 'mine', kind: 'menu-view' }); });
  expect(saved?.ok).toBe(true);
  const row = store.rows.get('v1');
  expect(row?.context).toEqual({ ...period, lineNames: ['L1'] });
  expect(JSON.stringify(row)).not.toContain('DRAFT');
  expect(row).toMatchObject({ kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, page: [['filter', 'a']] });
  await waitFor(() => expect(views.selected?.view.id).toBe('v1'));
});
it('saving to the selected view uses its version; a conflict reports it and changes nothing', async () => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  act(() => host.setGlobal({ lineNames: ['L2'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  store.rows.set('l1', { ...L1, version: 5 });
  let result: Awaited<ReturnType<SavedViews['saveToSelected']>> | undefined;
  await act(async () => { result = await views.saveToSelected(); });
  expect(result).toMatchObject({ ok: false, reason: 'conflict' });
  expect(store.rows.get('l1')?.context.lineNames).toEqual(['L1']);
  expect(host.global.lineNames).toEqual(['L2']);
});
it('rejects an unsavable draft before the store is called', async () => {
  const store = createFakeStore();
  mount(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  let result: Awaited<ReturnType<SavedViews['saveAs']>> | undefined;
  await act(async () => { result = await views.saveAs({ name: ' ', kind: 'condition-set' }); });
  expect(result).toMatchObject({ ok: false, reason: 'invalid' });
  expect(store.calls).not.toContain('save');
});

it.each([
  ['a one-sided period', '?from=2026-09-01T00%3A00%3A00'],
  ['an unsupported version', `?v=2&${query(['L2']).slice(1)}`],
])('an address the contract rejects (%s) is not overwritten by the personal default and disables selecting', async (_name, url) => {
  const store = createFakeStore([L1, L2], { 'u1:home': 'l1' });
  window.sessionStorage.setItem(KEY, 'l1');
  mount(store, `/${url}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => {});
  expect(host.contractError).not.toBeNull();
  expect(window.location.search).toBe(url);
  let outcome: Awaited<ReturnType<SavedViews['select']>> | undefined;
  await act(async () => { outcome = await views.select('l2'); });
  expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
  expect(window.location.search).toBe(url);
});

it.each([
  ['missing', (s: FakeStore) => void s.rows.delete('l1'), 'unavailable'],
  ['revoked', (s: FakeStore) => void s.denied.add('l1'), 'denied'],
  ['unreadable', (s: FakeStore) => { s.failGet = true; }, 'unavailable'],
])('reverting to the saved copy asks the store again: %s', async (_name, break_, reason) => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  act(() => host.setGlobal({ lineNames: ['L2'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  break_(store);
  let outcome: Awaited<ReturnType<SavedViews['revertToSaved']>> | undefined;
  await act(async () => { outcome = await views.revertToSaved(); });
  expect(outcome).toEqual({ ok: false, reason });
  expect(window.location.search).toBe(query(['L2']));
  expect(views.selected).toBeNull();
});

it('a late restore does not override a newer pick, and a late failure does not drop it', async () => {
  const store = createFakeStore([L1, L2]);
  mount(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  const slow = deferred();
  store.getHold.set('l1', slow.promise);
  let first: Promise<unknown> | undefined;
  act(() => { first = views.select('l1'); });
  await act(async () => { await views.select('l2'); });
  expect(window.location.search).toBe(query(['L2']));
  store.rows.delete('l1');
  await act(async () => { slow.release(); await first; });
  expect(window.location.search).toBe(query(['L2']));
  expect(views.selected?.view.id).toBe('l2');
  expect(window.sessionStorage.getItem(KEY)).toBe('l2');
});
it('a restore that finishes after the screen is gone writes nothing', async () => {
  const store = createFakeStore([L1]);
  const ui = mount(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  const slow = deferred();
  store.getHold.set('l1', slow.promise);
  let pending: Promise<unknown> | undefined;
  act(() => { pending = views.select('l1'); });
  ui.unmount();
  await act(async () => { slow.release(); await pending; });
  expect(window.location.search).toBe('');
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});
it('a save that finishes after another pick does not replace that pick', async () => {
  const store = createFakeStore([L2]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  const slow = deferred();
  store.saveHold = slow.promise;
  let saving: Promise<unknown> | undefined;
  act(() => { saving = views.saveAs({ name: 'mine', kind: 'condition-set' }); });
  await act(async () => { await views.select('l2'); });
  await act(async () => { slow.release(); await saving; });
  expect(views.selected?.view.id).toBe('l2');
  expect(window.sessionStorage.getItem(KEY)).toBe('l2');
});

it('hides the previous store rows at once when the store is replaced, and shows only the new store after it answers', async () => {
  const first = createFakeStore([L1]);
  const ui = mount(first);
  await waitFor(() => expect(views.menuViews.length + views.conditionSets.length).toBe(1));
  window.sessionStorage.setItem(KEY, 'l1');
  const second = createFakeStore([L2]);
  const hold = deferred();
  second.listHold = hold.promise;
  ui.rerender(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={second}><Probe /></PlatformProvider></I18nProvider>);
  expect(views.status).toBe('loading');
  expect(views.conditionSets).toEqual([]);
  expect(views.selected).toBeNull();
  await act(async () => { hold.release(); });
  await waitFor(() => expect(views.conditionSets.map(item => ('view' in item ? item.view.id : item.id))).toEqual(['l2']));
});
it('a session or permission change of the same user hides the old list until the store answers again', async () => {
  const store = createFakeStore([L1]);
  let current = testSession(['platform:view']);
  const listeners = new Set<() => void>();
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => current, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } })} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.conditionSets).toHaveLength(1));
  const hold = deferred();
  store.listHold = hold.promise;
  current = testSession([]);
  act(() => listeners.forEach(l => l()));
  expect(views.status).toBe('loading');
  expect(views.conditionSets).toEqual([]);
  await act(async () => { hold.release(); });
  await waitFor(() => expect(views.status).toBe('ready'));
});

it('after a menu without Saved Views, coming back to a bare route applies the personal default again', async () => {
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  mount(store);
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
  await act(async () => { host.navigate('/plain'); });
  expect(views.status).toBe('disabled');
  await act(async () => { host.navigate('/'); });
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
});
it('after a menu without Saved Views, a stored selection that no longer matches the new address is dropped', async () => {
  const store = createFakeStore([L1, L2]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  await act(async () => { host.navigate('/plain'); });
  await act(async () => { host.navigate(`/${query(['L2'])}`); });
  await waitFor(() => expect(views.status).toBe('ready'));
  await waitFor(() => expect(views.selected).toBeNull());
  expect(window.location.search).toBe(query(['L2']));
});

it('a condition set saved while a page key is applied is not 수정됨, also after a reload', async () => {
  const store = createFakeStore();
  const url = `/${query(['L1'], 'a')}`;
  mount(store, url);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.saveAs({ name: 'set', kind: 'condition-set' }); });
  await waitFor(() => expect(views.selected?.view.id).toBe('v1'));
  expect(views.state).toEqual({ modified: false, unsaved: false, unapplied: false });
  cleanup();
  mount(store, url);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => {});
  expect(views.selected?.view.id).toBe('v1');
  expect(views.state.modified).toBe(false);
});

it('a restored selection still reports the Context this menu cannot apply', async () => {
  const wide = viewOf({ id: 'w', context: { ...period, roomNames: ['R1'] } });
  window.sessionStorage.setItem(KEY, 'w');
  mount(createFakeStore([wide]), `/${buildQuery({ ...emptyGlobal, ...period }, [])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => {});
  expect(views.selected?.view.id).toBe('w');
  expect(views.unsupported).toEqual([{ kind: 'context', key: 'roomNames' }]);
});

// FIX2 (re-review C2, C3, C10, C11, C12)
function mountLive(store: FakeStore, url = '/') {
  const listeners = new Set<() => void>();
  window.history.replaceState(null, '', url);
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  const ui = render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  return { ui, notify: () => act(() => listeners.forEach(l => l())) };
}
const M3 = viewOf({ id: 'm3', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 3, context: { ...period, lineNames: ['L2'] }, page: [], chartOptions: {}, layout: null, panels: null } as never);

it.each([
  ['the revision changes', 'revision'],
  ['the screen is gone', 'unmount'],
])('a save callback kept from before %s sends nothing to the store', async (_name, how) => {
  const store = createFakeStore();
  const live = mountLive(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  const stale = views.saveAs;
  if (how === 'revision') { live.notify(); await waitFor(() => expect(views.status).toBe('ready')); } else live.ui.unmount();
  await act(async () => { await stale({ name: 'late', kind: 'condition-set' }); });
  expect(store.calls).not.toContain('save');
  expect(store.rows.size).toBe(0);
});
it('a save that finishes after the address moved to another explicit address does not select the saved view', async () => {
  const store = createFakeStore();
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  const slow = deferred();
  store.saveHold = slow.promise;
  let saving: Promise<unknown> | undefined;
  act(() => { saving = views.saveAs({ name: 'mine', kind: 'condition-set' }); });
  await act(async () => { host.navigate(`/${query(['L2'])}`); });
  await act(async () => { slow.release(); await saving; });
  expect(views.selected).toBeNull();
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});
it('saving to the selected view makes a slower pick started before it lose', async () => {
  const store = createFakeStore([L1, L2]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  const slow = deferred();
  store.getHold.set('l2', slow.promise);
  let picking: Promise<unknown> | undefined;
  act(() => { picking = views.select('l2'); });
  await act(async () => { await views.saveToSelected(); });
  await act(async () => { slow.release(); await picking; });
  expect(window.location.search).toBe(query(['L1']));
  expect(views.selected?.view.id).toBe('l1');
});
it('a delete that finishes after the screen is gone does not clear the stored selection', async () => {
  const store = createFakeStore([L1]);
  const ui = mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  const slow = deferred();
  store.removeHold = slow.promise;
  let removing: Promise<unknown> | undefined;
  act(() => { removing = views.remove('l1'); });
  ui.unmount();
  await act(async () => { slow.release(); await removing; });
  expect(window.sessionStorage.getItem(KEY)).toBe('l1');
});

it('a permission notification keeps a selection that is being edited and still shows 수정됨', async () => {
  const store = createFakeStore([L1]);
  const live = mountLive(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  act(() => host.setGlobal({ lineNames: ['L2'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  live.notify();
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => {});
  expect(views.selected?.view.id).toBe('l1');
  expect(views.state.modified).toBe(true);
  expect(window.sessionStorage.getItem(KEY)).toBe('l1');
});
it('a permission notification that revokes the selected view drops the selection', async () => {
  const store = createFakeStore([L1]);
  const live = mountLive(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  store.rows.delete('l1');
  live.notify();
  // `selected` is hidden while the new generation loads; the stored selection is dropped only when the list answer lacks the view.
  await waitFor(() => expect(views.selected).toBeNull());
  await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull());
});

it('a restore started under one menu declaration is dropped when the declaration is replaced meanwhile', async () => {
  function Extra() { useSavedViewSupport({ ...support, menuSchemaVersion: 3 }); return null; }
  const store = createFakeStore([M3]);
  window.history.replaceState(null, '', `/${query(['L1'])}`);
  const tree = (extra: boolean) => <I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={store}><Probe />{extra ? <Extra /> : null}</PlatformProvider></I18nProvider>;
  const ui = render(tree(false));
  await waitFor(() => expect(views.status).toBe('ready'));
  ui.rerender(tree(true));
  await waitFor(() => expect(views.status).toBe('ready'));
  await waitFor(() => expect(views.support?.menuSchemaVersion).toBe(3));
  const slow = deferred();
  store.getHold.set('m3', slow.promise);
  let picking: Promise<unknown> | undefined;
  act(() => { picking = views.select('m3'); });
  ui.rerender(tree(false));
  await waitFor(() => expect(views.support?.menuSchemaVersion).toBe(1));
  await act(async () => { slow.release(); await picking; });
  expect(window.location.search).toBe(query(['L1']));
  expect(views.selected).toBeNull();
});

it('reverting to a saved copy that changed in the store selects that new version', async () => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  store.rows.set('l1', { ...L1, version: 2, context: { ...period, lineNames: ['L2'] } });
  await act(async () => { await views.revertToSaved(); });
  expect(window.location.search).toBe(query(['L2']));
  expect(views.selected?.view.version).toBe(2);
  expect(views.state.modified).toBe(false);
  let saved: Awaited<ReturnType<SavedViews['saveToSelected']>> | undefined;
  await act(async () => { saved = await views.saveToSelected(); });
  expect(saved?.ok).toBe(true);
});

// FIX4: a default restore dropped by a newer generation or a moved address is tried again on the new one
it('a personal default whose read is overtaken by a permission notification is applied on the new generation', async () => {
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  const slow = deferred();
  store.getHold.set('l1', slow.promise);
  const live = mountLive(store);
  await waitFor(() => expect(store.reads).toContain('get'));
  live.notify();
  await waitFor(() => expect(views.status).toBe('ready'));
  store.getHold.delete('l1');
  await act(async () => { slow.release(); });
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
  await waitFor(() => expect(views.selected?.view.id).toBe('l1'));
});
it('a personal default whose read is overtaken by an address change is applied on the new address', async () => {
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  const slow = deferred();
  store.getHold.set('l1', slow.promise);
  mount(store);
  await waitFor(() => expect(store.reads).toContain('get'));
  store.getHold.delete('l1');
  await act(async () => { host.navigate('/?v=1'); });
  await act(async () => { slow.release(); });
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
  await waitFor(() => expect(views.selected?.view.id).toBe('l1'));
});
it('a personal default overtaken by the user\'s own pick is not applied again', async () => {
  const store = createFakeStore([L1, L2], { 'u1:home': 'l1' });
  const slow = deferred();
  store.getHold.set('l1', slow.promise);
  const live = mountLive(store);
  await waitFor(() => expect(store.reads).toContain('get'));
  await act(async () => { await views.select('l2'); });
  live.notify();
  await waitFor(() => expect(views.status).toBe('ready'));
  store.getHold.delete('l1');
  await act(async () => { slow.release(); });
  await act(async () => {});
  expect(window.location.search).toBe(query(['L2']));
  expect(views.selected?.view.id).toBe('l2');
});

// No server anchor (defaultRangeTo null, ADR-0098): a relative period has nothing to count back from.
function mountNoAnchor(store: FakeStore, url = '/') {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, defaultRangeTo: () => null })} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
}
it('without a server anchor a relative view is unavailable and writes nothing; an absolute view still restores', async () => {
  const relative = viewOf({ id: 'rel', name: 'Last 24h', context: { relativePeriod: { hours: 24 }, lineNames: ['L1'] } });
  const store = createFakeStore([relative, L2]);
  mountNoAnchor(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  const before = window.location.href;
  let outcome: Awaited<ReturnType<SavedViews['select']>> | undefined;
  await act(async () => { outcome = await views.select('rel'); });
  expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
  expect(window.location.href).toBe(before);
  await act(async () => { outcome = await views.select('l2'); });
  expect(outcome).toEqual({ ok: true, unsupported: [] });
  expect(window.location.search).toBe(query(['L2']));
});
