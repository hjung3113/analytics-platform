import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { lazy, Suspense, useLayoutEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildQuery, emptyGlobal, groupId, spaceId, type MenuViewPanels, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewPanels, useSavedViewSupport, usePlatform, type MenuPlatform, type SavedViewPanelsOutcome } from '../../index';
import { PaneScreenProvider, useHoldsPanels, useHostPlatform, useSavedViews, type SavedViews } from '../../host';
import { ScreenSavedViews, type InitialSavedView } from '../useSavedViews';
import { createFakeSavedViewStore as createFakeStore, noContext, testAdapter, testSavedView as viewOf, testSession, testSpace, testViewCapabilities, ToastProbe, type FakeSavedViewStore as FakeStore } from '../../testing';
/** A promise the test resolves by hand, to finish a store call out of order. */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time', 'line'], pageKeys: ['filter'] };
const base = { group: groupId('overview'), primary: true, icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, pageKeys: ['filter'], contextResetKeys: ['filter'], query: { mode: 'apply' as const } };
const menu = (id: string, path: string, savedView: boolean, primary = false) => ({ ...base, id, path, primary, savedViews: savedView ? 'screen' as const : undefined, features: { export: false, savedView, annotate: false, compare: false, board: false } });
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: base.label, icon: House, space: spaceId('mars') }], menus: [menu('home', '/', true, true), menu('plain', '/plain', false)] });
const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
const query = (lineNames: string[], filter?: string) => buildQuery({ ...emptyGlobal, ...period, lineNames }, filter ? [['filter', filter]] : []);
const L1 = viewOf({ id: 'l1', name: 'L1', context: { ...period, lineNames: ['L1'] } });
const L2 = viewOf({ id: 'l2', name: 'L2', context: { ...period, lineNames: ['L2'] } });
const session = testSession(['platform:view']);

let views: SavedViews; let host: ReturnType<typeof useHostPlatform>;
function Probe() { useSavedViewSupport(support); views = useSavedViews(); host = useHostPlatform(); return <p>{views.status}</p>; }
function NoSupportProbe() { views = useSavedViews(); host = useHostPlatform(); return <p>{views.status}</p>; }
function mount(store: FakeStore | undefined, url = '/') {
  window.history.replaceState(null, '', url);
  const ui = (s: FakeStore | undefined) => <I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={s}><Probe /></PlatformProvider></I18nProvider>;
  return render(ui(store));
}

function mountAutoApply(store: FakeStore, Content = Probe, search = '', adapterOverrides: Parameters<typeof testAdapter>[0] = {}) {
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{ ...menu('home', '/', true, true), pageKeys: [...base.pageKeys, 'returnTo'], query: { mode: 'apply', autoApplyDefault: true } }] });
  window.history.replaceState(null, '', chosen.menus[0].path + search);
  const replace = vi.spyOn(window.history, 'replaceState');
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session, ...adapterOverrides })} savedViews={store}><Content /></PlatformProvider></I18nProvider>);
  return replace;
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
it('ignores a custom group returned by a store and refuses selecting it as a view', async () => {
  const group = { schemaVersion: 1, kind: 'custom-group', name: 'Targets', savedScopeId: 'S', target: { fixed: ['e1'] }, id: 'g1', ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none' } as const;
  const store = createFakeStore([L1, group]);
  const get = await store.get('g1');
  if (!get) throw new Error('missing group');
  vi.spyOn(store, 'list').mockResolvedValue([get]);
  mount(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  expect(views.conditionSets).toEqual([]);
  expect(views.menuViews).toEqual([]);
  await act(async () => { expect(await views.select('g1')).toEqual({ ok: false, reason: 'wrong-menu' }); });
  expect(views.selected).toBeNull();
  expect(window.location.search).toBe('');
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

it('restores both non-midnight bounds of a legacy Saved View to the URL', async () => {
  const from = '2026-09-01T08:12:34';
  const to = '2026-09-02T13:45:56';
  const legacy = viewOf({ id: 'legacy', context: { from, to, lineNames: ['L1'] } });
  mount(createFakeStore([legacy]), '/' + query(['L2']));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('legacy'); });
  const params = new URLSearchParams(window.location.search);
  expect(params.get('from')).toBe(from);
  expect(params.get('to')).toBe(to);
});

it('lets the personal default win while its restore is still pending on an auto Apply entry', async () => {
  const held = deferred();
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  store.getHold.set('l1', held.promise);
  const replace = mountAutoApply(store);
  await waitFor(() => expect(store.reads).toContain('get'));
  expect(window.location.search).toBe('');
  await act(async () => held.release());
  await waitFor(() => expect(views.selected?.view.id).toBe('l1'));
  expect(window.location.search).toBe(query(['L1']));
  expect(replace.mock.calls.filter(([, , url]) => String(url).includes('from='))).toHaveLength(1);
});

it('restores an auto Apply default when the host omits the Saved View control', async () => {
  function Screen() { useSavedViewSupport(support); return <p>Custom context bar</p>; }
  const replace = mountAutoApply(createFakeStore([L1], { 'u1:home': 'l1' }), Screen);
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
  expect(replace.mock.calls.filter(([, , url]) => String(url).includes('from='))).toHaveLength(1);
});

it('loads the non-opt-in board pane’s Saved Views without requesting the main screen’s lists', async () => {
  const board = menu('board-menu', '/board-menu', true);
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
    { ...menu('home', '/', true, true), savedViews: undefined, query: { mode: 'apply', autoApplyDefault: true }, savedViewSupport: support },
    { ...board, features: { ...board.features, board: true } },
  ] });
  const paneView = viewOf({ id: 'pane-view', kind: 'menu-view', menuId: board.id, menuSchemaVersion: 1, page: [] });
  const store = createFakeStore([L1, paneView], { 'u1:home': 'l1' });
  const list = vi.spyOn(store, 'list');
  const paneSupport = { ...support, menuId: board.id };
  function PaneControl() {
    useSavedViewSupport(paneSupport);
    const { menuViews } = useSavedViews();
    return <p>{menuViews.map(item => item.denied ? item.id : item.view.id).join(', ')}</p>;
  }
  window.history.replaceState(null, '', '/');
  const mounted = render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}>
    <PaneScreenProvider paneId="background" screen={{ menuId: board.id, params: {}, query: query(['L2']) }} onChange={() => {}} onLeave={() => {}}>
      <PaneControl />
    </PaneScreenProvider>
  </PlatformProvider></I18nProvider>);
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
  expect(list.mock.calls.map(([key]) => key.menuId)).toEqual([board.id, null]);
  expect(await mounted.findByText(paneView.id)).toBeInTheDocument();
});

it('restores a declared default through a held lazy main screen with one replace', async () => {
  const held = deferred();
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  function Screen() { useSavedViewSupport(support); return <p>Lazy screen</p>; }
  const component = lazy(async () => { await held.promise; return { default: Screen }; });
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [{
    ...menu('home', '/', true, true), savedViews: undefined, features: { ...menu('home', '/', true).features, board: true },
    query: { mode: 'apply', autoApplyDefault: true }, savedViewSupport: support, component,
  }] });
  window.history.replaceState(null, '', chosen.canonicalHref('/'));
  const replace = vi.spyOn(window.history, 'replaceState');
  const Page = component;
  const content = <Suspense fallback={<p>Loading screen</p>}><Page /></Suspense>;
  const mounted = render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}>
    {content}
  </PlatformProvider></I18nProvider>);
  await act(async () => {});
  expect(mounted.queryByText('Lazy screen')).toBeNull();
  await act(async () => held.release());
  expect(window.location.search).toBe(query(['L1']));
  expect(replace).toHaveBeenCalledTimes(1);
});

it('checks a recovered selection on a new parameterized pathname and preserves it on query edits', async () => {
  const chosen = createRegistry({ spaces: [testSpace({ homeMenuId: 'plain' })], groups: registry.groups, menus: [
    menu('plain', '/', false, true), { ...menu('home', '/items/:id', true), query: { mode: 'apply', autoApplyDefault: true } },
  ] });
  window.history.replaceState(null, '', '/items/a' + query(['L1']));
  window.sessionStorage.setItem(KEY, 'l1');
  const store = createFakeStore([L1]);
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.selected?.view.id).toBe('l1'));
  act(() => { host.setGlobal({ lineNames: ['L2'] }); });
  expect(views.selected?.view.id).toBe('l1');
  act(() => { host.navigate('/items/b' + query(['L2'])); });
  await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull());
  expect(views.selected).toBeNull();
});

it('keeps the full-screen selection when a background pane materializes its period', async () => {
  const home = menu('home', '/', true, true);
  const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
    { ...home, savedViews: undefined, features: { ...home.features, board: true }, query: { mode: 'apply', autoApplyDefault: true }, savedViewSupport: support },
  ] });
  window.history.replaceState(null, '', '/board');
  window.sessionStorage.setItem(KEY, 'l2');
  const store = createFakeStore([L1, L2], { 'u1:home': 'l1' });
  const onChange = vi.fn();
  const getDefaultId = vi.spyOn(store, 'getDefaultId');
  function Body() {
    const platform = useHostPlatform();
    host = platform;
    return platform.route?.menu.id === 'home' ? <Probe /> :
      <PaneScreenProvider paneId="background" screen={{ menuId: 'home', params: {}, query: '' }} onChange={onChange} onLeave={() => {}}>{null}</PaneScreenProvider>;
  }
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><Body /></PlatformProvider></I18nProvider>);
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    menuId: 'home', params: {}, query: buildQuery({ ...emptyGlobal, from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00' }, []),
  }, 'replace');
  expect(getDefaultId).not.toHaveBeenCalled();
  expect(store.reads).toEqual([]);
  act(() => { host.navigate('/' + query(['L2'])); });
  await waitFor(() => expect(views.status).toBe('ready'));
  expect(views.selected?.view.id).toBe('l2');
  expect(window.sessionStorage.getItem(KEY)).toBe('l2');
});

it('resolves the new Scope default while the old Scope read is still held', async () => {
  const held = deferred();
  const store = createFakeStore([L1, L2], { 'u1:home': 'l1' });
  store.getHold.set('l1', held.promise);
  mountAutoApply(store, Probe, '?scopeId=MEM');
  await waitFor(() => {
    expect(host.scope).toMatchObject({ scopeId: 'MEM', status: 'valid' });
    expect(store.reads).toContain('get');
  });
  await store.setDefault({ userId: 'u1', menuId: 'home' }, 'l2');
  act(() => host.setGlobal({ scopeId: 'FDRY' }));
  await waitFor(() => {
    expect(host.scope).toMatchObject({ scopeId: 'FDRY', status: 'valid' });
    expect(host.global).toMatchObject({ scopeId: 'FDRY', lineNames: ['L2'] });
  });
  await act(async () => held.release());
  expect(host.global.lineNames).toEqual(['L2']);
});

it.each(['list', 'get'] as const)('discards a personal default when the %s read outlasts the deadline', async read => {
  vi.useFakeTimers();
  try {
    const held = deferred();
    const store = createFakeStore([L1], { 'u1:home': 'l1' });
    if (read === 'list') store.listHold = held.promise;
    else store.getHold.set('l1', held.promise);
    const replace = mountAutoApply(store);
    await act(async () => {});
    expect(store.reads).toContain(read);
    expect(host.queryPolicy.autoApplyingDefault).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      held.release();
    });
    expect(host.global).toMatchObject({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00', lineNames: null });
    expect(host.queryPolicy.autoApplyingDefault).toBeFalsy();
    expect(replace).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the original auto Apply deadline when detail expansion changes', async () => {
  vi.useFakeTimers();
  try {
    const held = deferred();
    const store = createFakeStore([L1], { 'u1:home': 'l1' });
    store.getHold.set('l1', held.promise);
    const replace = mountAutoApply(store);
    await act(async () => {});
    expect(store.reads).toContain('get');

    await act(async () => vi.advanceTimersByTimeAsync(2900));
    act(() => host.setDetailExpanded(true));
    expect(host.queryPolicy.autoApplyingDefault).toBe(true);
    expect(host.detailExpanded).toBe(true);
    expect(host.global.from).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(host.global).toMatchObject({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00', lineNames: null });
    expect(new URLSearchParams(window.location.search).get('expand')).toBe('1');
    await act(async () => held.release());
    expect(replace).toHaveBeenCalledTimes(2);
    expect(host.global.lineNames).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('keeps both the personal default and current detail expansion on a single materialization before expiry', async () => {
  vi.useFakeTimers();
  try {
    const held = deferred();
    const store = createFakeStore([L1], { 'u1:home': 'l1' });
    store.getHold.set('l1', held.promise);
    function WithToasts() { return <><Probe /><ToastProbe /></>; }
    const replace = mountAutoApply(store, WithToasts);
    await act(async () => {});
    expect(store.reads).toContain('get');

    await act(async () => vi.advanceTimersByTimeAsync(2900));
    act(() => host.setDetailExpanded(true));
    expect(host.detailExpanded).toBe(true);
    expect(host.global.from).toBeNull();

    await act(async () => held.release());
    expect(host.global).toMatchObject({ ...period, lineNames: ['L1'] });
    expect(host.detailExpanded).toBe(true);
    expect(new URLSearchParams(window.location.search).get('expand')).toBe('1');
    expect(views.selected?.view.id).toBe('l1');
    expect(replace.mock.calls.filter(([, , url]) => String(url).includes('from='))).toHaveLength(1);
    expect(replace).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByRole('list', { name: 'toasts' })).toBeEmptyDOMElement();
  } finally {
    vi.useRealTimers();
  }
});

it('emits zero timeout notices when a held get writes its default just before expiry and the timer runs before the queued render', async () => {
  vi.useFakeTimers();
  try {
    const held = deferred();
    const store = createFakeStore([L1], { 'u1:home': 'l1' });
    store.getHold.set('l1', held.promise);
    function WithToasts() { return <><Probe /><ToastProbe /></>; }
    mountAutoApply(store, WithToasts);
    await act(async () => {});
    expect(store.reads).toContain('get');

    await act(async () => vi.advanceTimersByTimeAsync(2999));
    held.release();
    for (let i = 0; i < 6 && window.location.search === ''; i += 1) await Promise.resolve();
    expect(window.location.search).toBe(query(['L1']));

    vi.advanceTimersByTime(1);
    await act(async () => {});
    expect(screen.getByRole('list', { name: 'toasts' })).toBeEmptyDOMElement();
    expect(host.global).toMatchObject({ ...period, lineNames: ['L1'] });
  } finally {
    vi.useRealTimers();
  }
});

it('emits zero timeout notices when a no-write settlement lands just before expiry and the timer runs before the queued render', async () => {
  vi.useFakeTimers();
  try {
    const held = deferred();
    const store = createFakeStore([]);
    const getDefaultId = store.getDefaultId.bind(store);
    vi.spyOn(store, 'getDefaultId').mockImplementation(async owner => {
      await held.promise;
      return getDefaultId(owner);
    });
    function WithToasts() { return <><Probe /><ToastProbe /></>; }
    mountAutoApply(store, WithToasts);
    await act(async () => {});

    await act(async () => vi.advanceTimersByTimeAsync(2999));
    held.release();
    for (let i = 0; i < 6; i += 1) await Promise.resolve();

    vi.advanceTimersByTime(1);
    await act(async () => {});
    expect(screen.getByRole('list', { name: 'toasts' })).toBeEmptyDOMElement();
    expect(host.global).toMatchObject({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00', lineNames: null });
  } finally {
    vi.useRealTimers();
  }
});

it('emits no notice when the owner tears down while the deadline timer is due', async () => {
  vi.useFakeTimers();
  try {
    const held = deferred();
    const store = createFakeStore([L1], { 'u1:home': 'l1' });
    store.getHold.set('l1', held.promise);
    const chosen = createRegistry({
      spaces: registry.spaces, groups: registry.groups,
      menus: [{ ...menu('home', '/', true, true), query: { mode: 'apply', autoApplyDefault: true } }],
    });
    // Use an explicit query so the outer MainScreenProvider does not arm its own initial timer.
    window.history.replaceState(null, '', `${chosen.menus[0].path}?lineNames=L2`);
    const settle = vi.fn();
    const initial: InitialSavedView = { settle, materialize: () => true };
    let setMounted: (value: boolean) => void = () => {};
    function AfterOwner() {
      // Fires in the layout-cleanup phase while the owner is torn down and before passive useEffect cleanup runs.
      useLayoutEffect(() => () => { vi.advanceTimersByTime(1); }, []);
      return null;
    }
    function OwnerGate() {
      const [mounted, update] = useState(true);
      setMounted = update;
      return mounted ? <><ScreenSavedViews initial={initial}><Probe /></ScreenSavedViews><AfterOwner /></> : null;
    }
    render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><OwnerGate /><ToastProbe /></PlatformProvider></I18nProvider>);
    await act(async () => {});
    expect(store.reads).toContain('get');

    await act(async () => vi.advanceTimersByTimeAsync(2999));
    await act(async () => setMounted(false));
    expect(settle).not.toHaveBeenCalled();
    expect(screen.getByRole('list', { name: 'toasts' })).toBeEmptyDOMElement();
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  { clock: 'with a clock', overrides: {}, from: '2026-09-25T00:00:00', notice: '개인 기본 뷰를 불러오지 못해 기본 기간을 적용했습니다.' },
  { clock: 'without a clock', overrides: { defaultRangeTo: () => null }, from: null, notice: '개인 기본 뷰를 불러오지 못했습니다. 조회 조건을 입력할 수 있습니다.' },
])('shows exactly one timeout notice $clock when the default get is held', async ({ overrides, from, notice }) => {
  vi.useFakeTimers();
  try {
    const held = deferred();
    const store = createFakeStore([L1], { 'u1:home': 'l1' });
    store.getHold.set('l1', held.promise);
    function WithToasts() { return <><Probe /><ToastProbe /></>; }
    mountAutoApply(store, WithToasts, '', overrides);
    await act(async () => {});
    expect(store.reads).toContain('get');
    expect(screen.queryByText(notice)).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(host.queryPolicy.autoApplyingDefault).toBeFalsy();
    expect(screen.getAllByText(notice)).toHaveLength(1);
    await act(async () => held.release());
    expect(screen.getAllByText(notice)).toHaveLength(1);
    expect(views.selected).toBeNull();
    expect(host.global.from).toBe(from);
  } finally {
    vi.useRealTimers();
  }
});

it('resumes the auto Apply default after a denied pick while the old read is held', async () => {
  const held = deferred();
  const store = createFakeStore([L1, L2], { 'u1:home': 'l1' });
  store.getHold.set('l1', held.promise);
  mountAutoApply(store);
  await waitFor(() => expect(store.reads).toContain('get'));
  store.getHold.delete('l1');
  store.denied.add('l2');
  await act(async () => { expect(await views.select('l2')).toEqual({ ok: false, reason: 'denied' }); });
  await waitFor(() => expect(window.location.search).toBe(query(['L1'])));
  await act(async () => held.release());
  expect(window.location.search).toBe(query(['L1']));
});

it('preserves an explicit return address when an auto Apply menu has a personal default', async () => {
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  const search = '?returnTo=%2Fplain';
  mountAutoApply(store, Probe, search);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => {});
  expect(window.location.search).toBe(search);
  expect(views.selected).toBeNull();
});

it.each(['no default', 'missing default', 'unavailable list'] as const)(
  'applies the default period only after the saved-view decision settles with %s',
  async outcome => {
    const held = deferred();
    const get = deferred();
    const store = createFakeStore([], outcome === 'missing default' ? { 'u1:home': 'missing' } : {});
    store.listHold = held.promise;
    store.getHold.set('missing', get.promise);
    if (outcome === 'unavailable list') vi.spyOn(store, 'list').mockImplementation(async () => {
      await held.promise;
      throw new Error('unavailable');
    });
    const replace = mountAutoApply(store);
    expect(views.status).toBe('loading');
    expect(window.location.search).toBe('');
    await act(async () => held.release());
    if (outcome === 'missing default') {
      await waitFor(() => expect(store.reads).toContain('get'));
      expect(window.location.search).toBe('');
      await act(async () => get.release());
    }
    await waitFor(() => expect(host.global.from).toBe('2026-09-25T00:00:00'));
    expect(replace.mock.calls.filter(([, , url]) => String(url).includes('from='))).toHaveLength(1);
  },
);
it('applies the default period when the saved-view controller is disabled', () => {
  const store = createFakeStore();
  const replace = mountAutoApply(store, NoSupportProbe);
  expect(views.status).toBe('disabled');
  expect(store.reads).toEqual([]);
  expect(host.global.from).toBe('2026-09-25T00:00:00');
  expect(replace).toHaveBeenCalledTimes(1);
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
  expect(outcome).toEqual({ ok: true, unsupported: [], excludedByScope: [] });
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
  const row = store.rows.get('v1') as ReturnType<typeof viewOf> | undefined;
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
  expect((store.rows.get('l1') as ReturnType<typeof viewOf> | undefined)?.context.lineNames).toEqual(['L1']);
  expect(host.global.lineNames).toEqual(['L2']);
});
// #2046: a conflict rereads the list, so the next save goes at the store's current version instead of conflicting forever.
it('after a conflict the selection stays as 수정됨, and the second save sends the current version and succeeds', async () => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  act(() => host.setGlobal({ lineNames: ['L2'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  store.rows.set('l1', { ...L1, version: 5 });
  const update = vi.spyOn(store, 'update');
  let first: Awaited<ReturnType<SavedViews['saveToSelected']>> | undefined;
  await act(async () => { first = await views.saveToSelected(); });
  expect(first).toMatchObject({ ok: false, reason: 'conflict' });
  await waitFor(() => expect(views.selected?.view.version).toBe(5));
  expect(views.selected?.view.id).toBe('l1');
  expect(window.sessionStorage.getItem(KEY)).toBe('l1');
  expect(views.state.modified).toBe(true);
  expect(host.global.lineNames).toEqual(['L2']);
  let second: Awaited<ReturnType<SavedViews['saveToSelected']>> | undefined;
  await act(async () => { second = await views.saveToSelected(); });
  expect(second?.ok).toBe(true);
  expect(update).toHaveBeenLastCalledWith('l1', expect.anything(), { expectedVersion: 5 });
  expect(store.rows.get('l1')).toMatchObject({ version: 6, context: { lineNames: ['L2'] } });
  expect(views.selected?.view.id).toBe('l1');
});
it.each([['conflict', true], ['forbidden', false], ['unavailable', false], ['invalid', false]] as const)('saveToSelected answered %s rereads the view list: %s', async (reason, rereads) => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  act(() => host.setGlobal({ lineNames: ['L2'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  store.update = vi.fn(async () => ({ ok: false as const, reason }));
  const before = store.reads.filter(read => read === 'list').length;
  await act(async () => { await views.saveToSelected(); });
  await act(async () => {});
  const after = () => store.reads.filter(read => read === 'list').length;
  if (rereads) await waitFor(() => expect(after()).toBeGreaterThan(before)); else expect(after()).toBe(before);
  expect(views.selected?.view.id).toBe('l1');
  expect(host.global.lineNames).toEqual(['L2']);
});
// #2031: 현재 뷰에 저장 replaces only what this menu supports; stores replace `context`/`page` wholesale, so the patch carries the rest.
async function saveSelected(store: FakeStore, id: string, change: () => void) {
  mount(store);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select(id); });
  act(change);
  await waitFor(() => expect(views.state.modified).toBe(true));
  let result: Awaited<ReturnType<SavedViews['saveToSelected']>> | undefined;
  await act(async () => { result = await views.saveToSelected(); });
  expect(result?.ok).toBe(true);
  // The kept fields are not on this screen: the selected view reads clean after the save.
  await waitFor(() => expect(views.state.modified).toBe(false));
  return store.rows.get(id) as ReturnType<typeof viewOf> | undefined;
}
const relative = viewOf({ id: 'rel', name: 'Last 24h', context: { relativePeriod: { hours: 24 }, lineNames: ['L1'] } });
it('saving to a condition set keeps the Context this menu does not support (condition with its membershipBasis)', async () => {
  const set = viewOf({ id: 'cs', context: { ...period, lineNames: ['L1'], condition: { fab: ['F1'] }, membershipBasis: 'asOf', roomNames: ['R1'] } });
  const row = await saveSelected(createFakeStore([set]), 'cs', () => host.setGlobal({ lineNames: ['L2'] }));
  expect(row?.context).toEqual({ ...period, lineNames: ['L2'], condition: { fab: ['F1'] }, membershipBasis: 'asOf', roomNames: ['R1'] });
});
it('saving to a relative-period view whose period was not changed keeps the relative period and writes no absolute window', async () => {
  const row = await saveSelected(createFakeStore([relative]), 'rel', () => host.setGlobal({ lineNames: ['L2'] }));
  expect(row?.context).toEqual({ relativePeriod: { hours: 24 }, lineNames: ['L2'] });
});
it('saving to a relative-period view whose period was changed stores the absolute window and drops the relative period', async () => {
  const row = await saveSelected(createFakeStore([relative]), 'rel', () => host.setGlobal(period));
  expect(row?.context).toEqual({ ...period, lineNames: ['L1'] });
});
it('saving to a view clears a supported Context key the user emptied instead of keeping the saved value', async () => {
  const row = await saveSelected(createFakeStore([L1]), 'l1', () => host.setGlobal({ lineNames: null }));
  expect(row?.context).toEqual(period);
});
it('saving to a menu view keeps the page keys this menu does not declare and replaces the declared ones', async () => {
  const mv = viewOf({ id: 'mv', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, context: { ...period, lineNames: ['L1'] }, page: [['filter', 'a'], ['other', 'x']], chartOptions: {}, layout: null, panels: null } as never);
  const row = await saveSelected(createFakeStore([mv]), 'mv', () => host.setPage({ filter: 'b' }));
  expect(row).toMatchObject({ context: { ...period, lineNames: ['L1'] }, page: [['filter', 'b'], ['other', 'x']] });
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
  expect(outcome).toEqual({ ok: true, unsupported: [], excludedByScope: [] });
  expect(window.location.search).toBe(query(['L2']));
});

// Shell writes (#1105): the seven store writes the shell used to call directly go through the hook.
const writes = {
  update: ['l1', { name: 'renamed' }, { expectedVersion: 1 }],
  setVisibility: ['l1', { kind: 'people', userIds: ['u2'] }, { expectedVersion: 1 }],
  requestOfficial: ['l1', { expectedVersion: 1 }],
  decide: ['l1', 'approve', 'ok', { expectedVersion: 1 }],
  revoke: ['l1', { expectedVersion: 1 }],
  createGroup: [{ name: 'g', memberIds: ['u2'] }],
  updateGroup: ['g1', { name: 'n' }],
} as const;
type WriteName = keyof typeof writes;
const writeNames = Object.keys(writes) as WriteName[];
const entryWriteNames: WriteName[] = ['update', 'setVisibility', 'requestOfficial', 'decide', 'revoke'];
const call = (name: WriteName) => (views[name] as (...args: unknown[]) => Promise<unknown>)(...writes[name]);
const stub = (store: FakeStore, name: WriteName, impl: (...args: unknown[]) => Promise<unknown>) => { const spy = vi.fn(impl); (store as unknown as Record<string, unknown>)[name] = spy; return spy; };
const listCount = (store: FakeStore) => store.reads.filter(read => read === 'list').length;
const entryAt = (version: number, id = 'l1') => ({ ok: true as const, value: { view: { ...L1, id, version }, capabilities: testViewCapabilities } });

it.each(writeNames)('%s passes its arguments to the store and returns the store Result unchanged', async name => {
  const store = createFakeStore([L1]);
  const answer = { ok: false, reason: 'conflict' };
  const spy = stub(store, name, async () => answer);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  let result: unknown;
  await act(async () => { result = await call(name); });
  expect(spy).toHaveBeenCalledWith(...writes[name]);
  expect(result).toBe(answer);
});
it.each(writeNames)('%s turns a thrown store call into unavailable instead of rejecting', async name => {
  const store = createFakeStore([L1]);
  stub(store, name, async () => { throw new Error('offline'); });
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  let result: unknown;
  await act(async () => { result = await call(name); });
  expect(result).toEqual({ ok: false, reason: 'unavailable' });
});
it.each(writeNames)('%s sends nothing without an enabled Saved View screen', async name => {
  const store = createFakeStore([L1]);
  const spy = stub(store, name, async () => ({ ok: true, value: null }));
  mount(store, '/plain');
  await act(async () => {});
  let result: unknown;
  await act(async () => { result = await call(name); });
  expect(result).toEqual({ ok: false, reason: 'unavailable' });
  expect(spy).not.toHaveBeenCalled();
});
it.each(writeNames.flatMap(name => (['revision', 'unmount'] as const).map(how => [name, how] as const)))('%s kept from before a %s change sends nothing', async (name, how) => {
  const store = createFakeStore([L1]);
  const spy = stub(store, name, async () => ({ ok: true, value: null }));
  const live = mountLive(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  const kept = (views[name] as (...args: unknown[]) => Promise<unknown>);
  if (how === 'revision') { live.notify(); await waitFor(() => expect(views.status).toBe('ready')); } else live.ui.unmount();
  let result: unknown;
  await act(async () => { result = await kept(...writes[name]); });
  expect(result).toEqual({ ok: false, reason: 'unavailable' });
  expect(spy).not.toHaveBeenCalled();
});
// #2046: a conflict rereads the list too, so a retry goes at the current version; other failures do not.
it.each(entryWriteNames.flatMap(name => (['ok', 'conflict'] as const).map(answer => [name, answer] as const)))('%s refreshes the view list after a current %s', async (name, answer) => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  stub(store, name, async () => (answer === 'ok' ? entryAt(2) : { ok: false, reason: 'conflict' }));
  const before = listCount(store);
  await act(async () => { await call(name); });
  await waitFor(() => expect(listCount(store)).toBeGreaterThan(before));
});
it.each(entryWriteNames.flatMap(name => (['forbidden', 'unavailable', 'invalid'] as const).map(reason => [name, reason] as const)))('%s answered %s does not refresh the view list', async (name, reason) => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  stub(store, name, async () => ({ ok: false, reason }));
  const before = listCount(store);
  await act(async () => { await call(name); });
  await act(async () => {});
  expect(listCount(store)).toBe(before);
});
it.each(['createGroup', 'updateGroup'] as const)('%s does not refresh the view list', async name => {
  const store = createFakeStore([L1]);
  stub(store, name, async () => ({ ok: true, value: { group: { id: 'g1' } } }));
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  const before = listCount(store);
  await act(async () => { await call(name); });
  await act(async () => {});
  expect(listCount(store)).toBe(before);
});
it.each(entryWriteNames)('a late %s result after the generation changed is returned as is but refreshes and selects nothing', async name => {
  const store = createFakeStore([L1]);
  const slow = deferred();
  const answer = entryAt(5);
  stub(store, name, async () => { await slow.promise; return answer; });
  const live = mountLive(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  let pending: Promise<unknown> | undefined;
  act(() => { pending = call(name); });
  live.notify();
  await waitFor(() => expect(views.status).toBe('ready'));
  const before = listCount(store);
  let result: unknown;
  await act(async () => { slow.release(); result = await pending; });
  expect(result).toBe(answer);
  expect(listCount(store)).toBe(before);
  expect(views.selected?.view.version).toBe(1);
});
it('a completed write for the selected view shows its returned version until the list answers, and never rolls a newer one back', async () => {
  const store = createFakeStore([L1]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  store.listHold = deferred().promise;
  stub(store, 'update', async () => entryAt(3));
  stub(store, 'setVisibility', async () => entryAt(2));
  await act(async () => { await views.update('l1', { name: 'a' }, { expectedVersion: 1 }); });
  expect(views.selected?.view.version).toBe(3);
  await act(async () => { await views.setVisibility('l1', { kind: 'private' }, { expectedVersion: 1 }); });
  expect(views.selected?.view.version).toBe(3);
});
it('a completed write for another view than the selected one leaves the selection alone', async () => {
  const store = createFakeStore([L1, L2]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  store.listHold = deferred().promise;
  stub(store, 'requestOfficial', async () => entryAt(4, 'l2'));
  await act(async () => { await views.requestOfficial('l2', { expectedVersion: 1 }); });
  expect(views.selected?.view.id).toBe('l1');
  expect(views.selected?.view.version).toBe(1);
});
it('a write is not a selection intent: an in-flight pick still wins afterwards', async () => {
  const store = createFakeStore([L1, L2]);
  mount(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('l1'); });
  const slow = deferred();
  store.getHold.set('l2', slow.promise);
  let picking: Promise<unknown> | undefined;
  act(() => { picking = views.select('l2'); });
  stub(store, 'revoke', async () => entryAt(2));
  await act(async () => { await views.revoke('l1', { expectedVersion: 1 }); });
  await act(async () => { slow.release(); await picking; });
  expect(window.location.search).toBe(query(['L2']));
  expect(views.selected?.view.id).toBe('l2');
});

// FIX1 (C1): a completed group Result and a callback kept across a user change.
it.each(['createGroup', 'updateGroup'] as const)('a late %s result after the revision changed is returned as is', async name => {
  const store = createFakeStore([L1]);
  const slow = deferred();
  const answer = { ok: true, value: { group: { id: 'g9' } } };
  stub(store, name, async () => { await slow.promise; return answer; });
  const live = mountLive(store, `/${query(['L1'])}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  let pending: Promise<unknown> | undefined;
  act(() => { pending = call(name); });
  live.notify();
  await waitFor(() => expect(views.status).toBe('ready'));
  const before = listCount(store);
  let result: unknown;
  await act(async () => { slow.release(); result = await pending; });
  expect(result).toBe(answer);
  expect(listCount(store)).toBe(before);
});
it.each(['update', 'createGroup'] as const)('%s kept from before a user change sends nothing, and a response held across it is returned as is without a refresh', async name => {
  const store = createFakeStore([L1]);
  const slow = deferred();
  const answer = name === 'update' ? entryAt(4) : { ok: true, value: { group: { id: 'g9' } } };
  const spy = stub(store, name, async () => { await slow.promise; return answer; });
  let current = testSession(['platform:view']);
  const listeners = new Set<() => void>();
  window.history.replaceState(null, '', `/${query(['L1'])}`);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => current, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } })} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.status).toBe('ready'));
  const kept = views[name] as (...args: unknown[]) => Promise<unknown>;
  let pending: Promise<unknown> | undefined;
  act(() => { pending = kept(...writes[name]); });
  expect(spy).toHaveBeenCalledTimes(1);
  current = testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } });
  act(() => listeners.forEach(l => l()));
  await waitFor(() => expect(views.status).toBe('ready'));
  const before = listCount(store);
  let again: unknown;
  await act(async () => { again = await kept(...writes[name]); });
  expect(again).toEqual({ ok: false, reason: 'unavailable' });
  expect(spy).toHaveBeenCalledTimes(1);
  let result: unknown;
  await act(async () => { slow.release(); result = await pending; });
  expect(result).toBe(answer);
  expect(listCount(store)).toBe(before);
});

// #2175: a view records the Scope its content was saved in; another Scope leaves the Site-bound values out and the surface says so.
const inScope = (scopeId: string, lineNames: string[] = [], filter?: string) => `/${buildQuery({ ...emptyGlobal, scopeId, ...period, lineNames: lineNames.length ? lineNames : null }, filter ? [['filter', filter]] : [])}`;
const MEM_VIEW = viewOf({ id: 'm1', name: 'MEM 뷰', context: { ...period, lineNames: ['L1'] }, savedScopeId: 'MEM' });

it('a view saved in another Scope opens without its Line, says why, and is not 수정됨 (#2175)', async () => {
  const store = createFakeStore([MEM_VIEW]);
  mount(store, inScope('FDRY'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('m1'); });
  expect(host.global.lineNames).toBeNull();
  expect(host.global.scopeId).toBe('FDRY');
  expect(window.location.search).not.toContain('lineNames');
  expect(views.scopeExcluded).toEqual({ savedScopeId: 'MEM', keys: ['line'] });
  expect(views.unsupported).toEqual([]);
  expect(views.state.modified).toBe(false);
  act(() => host.setGlobal({ lineNames: ['L7'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
});

it('the same Scope and a view with no recorded Scope apply everything and report nothing excluded (#2175)', async () => {
  const store = createFakeStore([MEM_VIEW, viewOf({ id: 'old', name: '옛 뷰', context: { ...period, lineNames: ['L2'] } })]);
  mount(store, inScope('MEM'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('m1'); });
  await waitFor(() => expect(host.global.lineNames).toEqual(['L1']));
  expect(views.scopeExcluded).toBeNull();
  act(() => host.setGlobal({ scopeId: 'FDRY' }));
  await waitFor(() => expect(host.global.scopeId).toBe('FDRY'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('old'); });
  await waitFor(() => expect(host.global.lineNames).toEqual(['L2']));
  expect(views.scopeExcluded).toBeNull();
});

it('switching Scope while a view is selected gives the same answer as opening it there (#2175)', async () => {
  const store = createFakeStore([MEM_VIEW]);
  mount(store, inScope('MEM'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('m1'); });
  expect(views.scopeExcluded).toBeNull();
  act(() => host.setGlobal({ scopeId: 'FDRY' }));
  await waitFor(() => expect(views.scopeExcluded).toEqual({ savedScopeId: 'MEM', keys: ['line'] }));
  expect(views.state.modified).toBe(false);
});

it('both save paths record the current Scope, and an overwrite across Scopes asks first and writes the new Scope (#2175)', async () => {
  const store = createFakeStore([MEM_VIEW]);
  mount(store, inScope('MEM', ['L1'], 'a'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.saveAs({ name: '새 뷰', kind: 'menu-view' }); });
  expect(store.rows.get('v2')?.savedScopeId).toBe('MEM');
  await act(async () => { await views.saveAs({ name: '새 조건', kind: 'condition-set' }); });
  expect(store.rows.get('v3')?.savedScopeId).toBe('MEM');

  act(() => host.setGlobal({ scopeId: 'FDRY' }));
  await waitFor(() => expect(host.global.scopeId).toBe('FDRY'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('m1'); });
  expect(views.crossScopeSave).toEqual({ savedScopeId: 'MEM', keys: ['line'] });
  act(() => host.setGlobal({ lineNames: ['L7'] }));
  await waitFor(() => expect(host.global.lineNames).toEqual(['L7']));
  await act(async () => { await views.saveToSelected(); });
  expect(store.rows.get('m1')).toMatchObject({ savedScopeId: 'FDRY', context: { lineNames: ['L7'] } });
  await waitFor(() => expect(views.crossScopeSave).toBeNull());
});

it('a save made with no current Scope records none, and an overwrite with none clears the recorded one (#2175)', async () => {
  const store = createFakeStore([MEM_VIEW]);
  mount(store, `/${query(['L1'], 'a')}`);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.saveAs({ name: '무 Scope', kind: 'menu-view' }); });
  expect(store.rows.get('v2')).not.toHaveProperty('savedScopeId');
  await act(async () => { await views.select('m1'); });
  act(() => host.setGlobal({ lineNames: ['L7'] }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  await act(async () => { await views.saveToSelected(); });
  expect(store.rows.get('m1')).not.toHaveProperty('savedScopeId');
});

it.each(['drill', 'same-path-link'] as const)('switches a pending bare arrival to an explicit legacy candidate on %s and ignores the stale personal default', async action => {
  const chosen = createRegistry({
    spaces: registry.spaces,
    groups: registry.groups,
    menus: [{
      ...menu('home', '/', true, true),
      savedViews: undefined,
      context: { ...noContext, time: 'apply' as const, line: 'apply' as const },
      query: { mode: 'apply', autoApplyDefault: true, applyPeriodOnLegacyEntry: true },
      savedViewSupport: support,
    }],
  });
  const held = deferred();
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  store.getHold.set('l1', held.promise);
  window.history.replaceState(null, '', chosen.menus[0].path);
  const replace = vi.spyOn(window.history, 'replaceState');
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><NoSupportProbe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(store.reads).toContain('get'));
  expect(host.global.from).toBeNull();
  if (action === 'drill') act(() => host.setPage({ filter: 'linked' }));
  else act(() => { host.navigate(chosen.menus[0].path + '?lineNames=L2'); });
  await waitFor(() => expect(host.global).toMatchObject({ from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00' }));
  await act(async () => held.release());
  if (action === 'drill') {
    expect(host.pageParam('filter')).toBe('linked');
    expect(host.global.lineNames).toBeNull();
  } else {
    expect(host.global.lineNames).toEqual(['L2']);
  }
  expect(views.selected).toBeNull();
  expect(replace.mock.calls.filter(([, , url]) => String(url).includes('from='))).toHaveLength(1);
});

it('keeps completed-then-reset, invalid, and history-restored legacy entries exact during or after bare arrival', async () => {
  const chosen = createRegistry({
    spaces: registry.spaces,
    groups: registry.groups,
    menus: [{
      ...menu('home', '/', true, true),
      savedViews: undefined,
      context: { ...noContext, time: 'apply' as const, line: 'apply' as const },
      query: { mode: 'apply', autoApplyDefault: true, applyPeriodOnLegacyEntry: true },
      savedViewSupport: support,
    }],
  });
  const held = deferred();
  const store = createFakeStore([L1], { 'u1:home': 'l1' });
  store.getHold.set('l1', held.promise);
  window.history.replaceState(null, '', chosen.menus[0].path);
  const ui = render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><NoSupportProbe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(store.reads).toContain('get'));
  act(() => {
    window.history.replaceState(null, '', chosen.menus[0].path + '?v=1&lineNames=L2');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await act(async () => held.release());
  expect(window.location.search).toBe('?v=1&lineNames=L2');
  expect(host.global.from).toBeNull();

  ui.unmount();
  store.getHold.clear();
  window.history.replaceState(null, '', chosen.menus[0].path + '?from=invalid&lineNames=L2');
  const uiInvalid = render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><NoSupportProbe /></PlatformProvider></I18nProvider>);
  await act(async () => {});
  expect(window.location.search).toBe('?from=invalid&lineNames=L2');
  expect(host.global.from).toBeNull();

  uiInvalid.unmount();
  window.history.replaceState(null, '', chosen.menus[0].path);
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><NoSupportProbe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(host.global.lineNames).toEqual(['L1']));
  act(() => host.resetContext());
  await act(async () => {});
  expect(host.global).toMatchObject({ from: null, to: null, lineNames: null });
});

// #2862 (R2862C): held panel sets follow the Scope rule on a Scope switch, an overwrite with no panel slot, and only on the main screen.
const heldPanels: MenuViewPanels = { version: 1, instances: [
  { id: 'src', source: { kind: 'declared', panel: 'src' }, inputs: [], outputs: [{ key: 'room', dimension: 'room', shape: 'set' }] },
  { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [], inputs: [{ key: 'room', from: 'src.room', mode: 'hold', value: { shape: 'set', values: ['R1'] } }] },
] };
const followingPanels: MenuViewPanels = { ...heldPanels, instances: [heldPanels.instances[0]!, { ...heldPanels.instances[1]!, inputs: [{ key: 'room', from: 'src.room', mode: 'follow' }] }] };
const menuView = (over: Parameters<typeof viewOf>[0]) => viewOf({ kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, context: period, page: [], chartOptions: {}, layout: null, savedScopeId: 'MEM', panels: heldPanels, ...over });
const HELD_VIEW = menuView({ id: 'h1', name: '붙잡은 뷰' });
let screenPanels: MenuViewPanels | null = null;
let setScreen: (value: MenuViewPanels | null) => void = () => {};
let holdsNow: (() => boolean) | undefined;
let paneHolds: (() => boolean) | undefined;
const openedPanels = vi.fn();
const panelSelectionChanged = vi.fn();
function PanelScreen() {
  useSavedViewSupport(support); views = useSavedViews(); host = useHostPlatform();
  const [value, update] = useState<MenuViewPanels | null>(null);
  screenPanels = value;
  setScreen = update;
  holdsNow = useHoldsPanels();
  useSavedViewPanels({
    value,
    onOpen: (outcome: SavedViewPanelsOutcome, viewId) => {
      openedPanels(outcome, viewId);
      if (outcome !== 'unreadable') update(outcome);
    },
    onSelectionChange: panelSelectionChanged,
  });
  return null;
}
function PaneHolds() { paneHolds = useHoldsPanels(); return null; }
function mountPanels(store: FakeStore, url: string, Content: () => ReactNode = PanelScreen) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={store}><Content /></PlatformProvider></I18nProvider>);
}

it('a Scope switch with a view selected hands the new Scope the view panels with held sets following (#2862 R2862C C1)', async () => {
  const store = createFakeStore([HELD_VIEW]);
  mountPanels(store, inScope('MEM'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('h1'); });
  expect(screenPanels).toEqual(heldPanels);
  openedPanels.mockClear();
  panelSelectionChanged.mockClear();
  act(() => host.setGlobal({ scopeId: 'FDRY' }));
  await waitFor(() => expect(views.scopeExcluded).toEqual({ savedScopeId: 'MEM', keys: ['room'], panelKeys: ['room'] }));
  await waitFor(() => expect(screenPanels).toEqual(followingPanels));
  expect(openedPanels).toHaveBeenLastCalledWith(followingPanels, 'h1');
  expect(panelSelectionChanged.mock.calls.flat()).not.toContain('h1');
  expect(views.state.modified).toBe(false);
  await act(async () => { await views.saveToSelected(); });
  expect(store.rows.get('h1')).toMatchObject({ savedScopeId: 'FDRY', panels: followingPanels });
});

it('an overwrite with no panel slot saves held sets of another Scope as following, and keeps panels otherwise (#2862 R2862C C2)', async () => {
  const store = createFakeStore([HELD_VIEW, menuView({ id: 'h2', name: '같은 Scope' })]);
  mount(store, inScope('FDRY'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('h1'); });
  expect(views.crossScopeSave).toEqual({ savedScopeId: 'MEM', keys: ['room'], panelKeys: ['room'] });
  await act(async () => { await views.saveToSelected(); });
  expect(store.rows.get('h1')).toMatchObject({ savedScopeId: 'FDRY', panels: followingPanels });
  // Like the server, the fake store keeps the stored panels when a patch carries none.
  act(() => host.setGlobal({ scopeId: 'MEM' }));
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('h2'); });
  await act(async () => { await views.saveToSelected(); });
  expect(store.rows.get('h2')).toMatchObject({ savedScopeId: 'MEM', panels: heldPanels });
});

it('reports held panels only for the main screen, not a board pane of the same menu and Scope (#2862 R2862C C3)', async () => {
  function Both() {
    return <><PanelScreen /><PaneScreenProvider paneId="background" screen={{ menuId: 'home', params: {}, query: buildQuery({ ...emptyGlobal, scopeId: 'MEM', ...period }, []) }} onChange={() => {}} onLeave={() => {}}><PaneHolds /></PaneScreenProvider></>;
  }
  mountPanels(createFakeStore([HELD_VIEW]), inScope('MEM'), Both);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('h1'); });
  expect(holdsNow?.()).toBe(true);
  expect(paneHolds?.()).toBe(false);
});

it('a kept selection of another menu schema hands no panels, so it lists no held keys and compares no panels (#2862 R2862C C8)', async () => {
  const stale = menuView({ id: 'h3', name: '옛 스키마', menuSchemaVersion: 0 });
  window.sessionStorage.setItem(KEY, 'h3');
  mountPanels(createFakeStore([stale]), inScope('FDRY'));
  await waitFor(() => expect(views.status).toBe('ready'));
  await waitFor(() => expect(views.selected?.view.id).toBe('h3'));
  expect(screenPanels).toBeNull();
  expect(views.scopeExcluded).toBeNull();
  expect(views.state.modified).toBe(false);
});

it('a Scope switch turns the screen held sets to following at once, so a new view saved before the list answers carries none (#2862 R2862C-2 C1)', async () => {
  const store = createFakeStore([]);
  mountPanels(store, inScope('MEM'));
  await waitFor(() => expect(views.status).toBe('ready'));
  act(() => setScreen(heldPanels));
  // The list of the new Scope never answers.
  vi.spyOn(store, 'list').mockReturnValue(new Promise(() => {}));
  act(() => host.setGlobal({ scopeId: 'FDRY' }));
  await waitFor(() => expect(host.global.scopeId).toBe('FDRY'));
  expect(screenPanels).toEqual(followingPanels);
  await act(async () => { await views.saveAs({ name: '새 Scope', kind: 'menu-view' }); });
  expect([...store.rows.values()].find(row => row.name === '새 Scope')).toMatchObject({ savedScopeId: 'FDRY', panels: followingPanels });
});

it('a screen with no saved-view list still drops held sets on a Scope switch (#2862 R2862C-2 C1)', async () => {
  function Bare() {
    useSavedViewSupport(support); host = useHostPlatform();
    const [value, update] = useState<MenuViewPanels | null>(heldPanels);
    screenPanels = value;
    useSavedViewPanels({ value, onOpen: (outcome: SavedViewPanelsOutcome) => { if (outcome !== 'unreadable') update(outcome); } });
    return null;
  }
  mountPanels(createFakeStore([]), inScope('MEM'), Bare);
  await waitFor(() => expect(screenPanels).toEqual(heldPanels));
  act(() => host.setGlobal({ scopeId: 'FDRY' }));
  await waitFor(() => expect(host.global.scopeId).toBe('FDRY'));
  expect(screenPanels).toEqual(followingPanels);
});
