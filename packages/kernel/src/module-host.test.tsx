import { StrictMode, useEffect, useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, type ApiResponse, type ContextKey, type EndpointSpec, type GlobalContext, type MenuQuery, type ModuleHost, type ModuleManifest, type ModuleScreenMeta, type Session } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { mountModule } from './module';
import { useModuleHost, type ModuleShellPorts } from './module-host';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';
import { noContext, testAdapter, testSession, testSpace } from './testing';

type Data = { from: string | null; roomNames: unknown };
const spec: EndpointSpec<{ page: number }, Data> = defineEndpoint<{ page: number }, Data>({
  id: 'fx.list', menuId: 'fx:list', paramKeys: { page: true }, permission: 'platform:view', requiresScope: false,
  context: { time: 'apply' }, kinds: ['collection'], mergeTimeDomain: false,
});

const meta = (id: string, path: string, over: Partial<ModuleScreenMeta> = {}): ModuleScreenMeta => ({
  id, group: 'fx:main', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, permission: 'fx:view', requiresScope: false,
  context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over,
});
const manifest = (over: Partial<ModuleManifest> = {}): ModuleManifest => ({
  module: { id: 'fx', label: { ko: '모듈', en: 'Module' }, contract: 1, languages: ['ko', 'en'] },
  requires: [], optional: ['query', 'detailSlot'], config: ['apiBase'], groups: [{ id: 'fx:main', label: { ko: '메인', en: 'Main' } }],
  screens: [
    meta('list', '', { primary: true, pageKeys: ['q'], context: { ...noContext, time: 'apply', roomNames: 'reference' } }),
    meta('item', 'items/:id', { navHidden: true, parent: 'list', pageKeys: ['tab'] }),
    meta('scoped', 'scoped', { requiresScope: true }),
  ], ...over,
});
const Noop = () => null;
function makeRegistry(m = manifest(), features?: Parameters<typeof mountModule>[2]['features'], lookalikes = false) {
  const { menus, groups } = mountModule(m, Object.fromEntries(m.screens.map(screen => [screen.id, Noop])), {
    prefix: '/fx', groupSpace: { 'fx:main': 'analytics' }, config: { apiBase: 'https://api.example' }, features,
    icons: { groups: { 'fx:main': House }, screens: Object.fromEntries(m.screens.map(screen => [screen.id, House])) },
  });
  if (!lookalikes) return createRegistry({ spaces: [testSpace({ homeMenuId: 'fx:list' })], groups, menus });
  // Ids that look like `fx:<screen>` but are not this module's screens: a nested module id and a platform menu.
  const nested = manifest({
    module: { id: 'fx:nested', label: { ko: '중첩', en: 'Nested' }, contract: 1, languages: ['ko', 'en'] }, optional: [], config: [],
    groups: [{ id: 'fx:nested:main', label: { ko: '메인', en: 'Main' } }],
    screens: [meta('list', '', { group: 'fx:nested:main', permission: 'fx:nested:view', primary: true })],
  });
  const mounted = mountModule(nested, { list: Noop }, { prefix: '/fxn', groupSpace: { 'fx:nested:main': 'analytics' }, config: {}, icons: { groups: { 'fx:nested:main': House }, screens: { list: House } } });
  const outside = {
    id: 'fx:outside', group: 'overview', primary: true, label: { ko: '밖', en: 'Outside' }, description: { ko: '', en: '' }, path: '/outside', icon: House,
    permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', pageKeys: [], features: { export: false, savedView: false, annotate: false, compare: false },
  } as never;
  return createRegistry({
    spaces: [testSpace({ homeMenuId: 'fx:list' })],
    groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }, ...groups, ...mounted.groups],
    menus: [...menus, ...mounted.menus, outside],
  });
}

type Call = { request: MenuQuery; signal: AbortSignal | undefined; resolve: (r: ApiResponse<Data>) => void };
const ok = (request: MenuQuery): ApiResponse<Data> => ({
  outcome: 'ok', data: { from: request.context.from ?? null, roomNames: request.context.roomNames }, assessments: [{ kind: 'collection', state: 'clear' }], trust: null, correlationId: 'c',
});

function setup(url = '/fx?v=1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00', m = manifest(), features?: Parameters<typeof mountModule>[2]['features'], lookalikes = false) {
  window.history.replaceState(null, '', url);
  const registry = makeRegistry(m, features, lookalikes);
  const calls: Call[] = [];
  const make = (id: string): Session => testSession(['fx:view'], { user: { id, name: id, title: { ko: id, en: id } } });
  let current = make('user-a');
  const listeners = new Set<() => void>();
  const adapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    menuQuery: vi.fn((request: MenuQuery, signal?: AbortSignal) => new Promise<ApiResponse<never>>(resolve => {
      calls.push({ request, signal, resolve: r => resolve(r as ApiResponse<never>) });
    })),
  });
  const ports = { status: vi.fn(), focusTarget: vi.fn(), detail: { show: vi.fn(), clear: vi.fn() } } satisfies ModuleShellPorts;
  const seen: { host: ModuleHost; hosts: ModuleHost[]; platform: ReturnType<typeof usePlatform> } = { host: undefined as never, hosts: [], platform: undefined as never };
  function Probe({ id }: { id: string }) {
    const host = useModuleHost(registry.menuById(id) as never, {}, ports);
    seen.platform = usePlatform();
    seen.host = host;
    if (seen.hosts.at(-1) !== host) seen.hosts.push(host);
    return null;
  }
  // `keyed` mirrors the shell: screen and revision are part of the instance identity.
  function Outlet({ id, show, keyed }: { id: string; show: boolean; keyed: boolean }) {
    const { revision } = usePlatform();
    return show ? <Probe key={keyed ? `${id}|${revision}` : id} id={id} /> : null;
  }
  const tree = (props: { id?: string; show?: boolean; keyed?: boolean }) => (
    <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Outlet id={props.id ?? 'fx:list'} show={props.show ?? true} keyed={props.keyed ?? false} /></PlatformProvider></I18nProvider>
  );
  const view = render(tree({}));
  return {
    adapter, calls, ports, seen, registry,
    rerender: (props: { id?: string; show?: boolean; keyed?: boolean }) => view.rerender(tree(props)),
    switchUser: () => act(() => { current = make('user-b'); listeners.forEach(l => l()); }),
    setGlobal: (patch: Partial<GlobalContext>) => act(() => seen.platform.setGlobal(patch)),
  };
}

/** Settles a promise into a value so a rejection is never unhandled. */
const settle = <T,>(promise: Promise<T>) => promise.then(value => ({ value }), (error: unknown) => ({ error }));
const isAbort = (outcome: object) => 'error' in outcome && outcome.error instanceof DOMException && outcome.error.name === 'AbortError';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('useModuleHost: reads', () => {
  it('serves config, session, lang and the matched params', () => {
    const { seen } = setup();
    expect(seen.host.contract).toBe(1);
    expect(seen.host.config('apiBase')).toBe('https://api.example');
    expect(seen.host.config('other')).toBeNull();
    expect(seen.host.session()).toEqual({ user: { id: 'user-a', name: 'user-a' }, generation: 0 });
    expect(seen.host.can('fx:view')).toBe(true);
    expect(seen.host.lang()).toBe('ko');
  });

  it.each<[ContextKey, string, Partial<GlobalContext>, Partial<GlobalContext>]>([
    ['time', 'time', { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' }, { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' }],
    ['roomNames', 'roomNames', { roomNames: ['ETCH'] }, { roomNames: ['ETCH'] }],
    ['condition', 'condition', { condition: { axis: 'team', id: 'T1' } }, { condition: { axis: 'team', id: 'T1' } }],
    ['selection', 'selection', { selection: ['E1'] }, { selection: ['E1'] }],
    ['lot', 'lot', { lotIds: ['L1'] }, { lotIds: ['L1'] }],
    ['ppid', 'ppid', { ppid: 'P1' }, { ppid: 'P1' }],
    ['recipe', 'recipe', { recipeIds: ['R1'] }, { recipeIds: ['R1'] }],
    ['metric', 'metric', { metricId: 'm1', metricVersion: '2' }, { metricId: 'm1', metricVersion: '2' }],
  ])('context() maps %s capability to its GlobalContext fields (apply and reference), omitting it when unsupported', (key, _label, global, expected) => {
    for (const capability of ['apply', 'reference'] as const) {
      const only = manifest({ screens: [meta('list', '', { primary: true, context: { ...noContext, [key]: capability } })] });
      const { seen } = setup('/fx', only);
      act(() => seen.platform.setGlobal(global, { silent: true }));
      expect(seen.host.context().values).toEqual(expected);
      expect(seen.host.context().unsupported).not.toContain(key);
      cleanup();
    }
    const none = setup('/fx', manifest({ screens: [meta('list', '', { primary: true })] }));
    act(() => none.seen.platform.setGlobal(global, { silent: true }));
    expect(none.seen.host.context().values).toEqual({});
    expect(none.seen.host.context().unsupported).toContain(key);
  });

  it('context() keeps explicit-empty sets and null, hides undeclared keys and carries scopeId only when requiresScope', () => {
    const { seen } = setup('/fx?v=1&roomSelection=none');
    expect(Object.keys(seen.host.context().values)).toEqual(['from', 'to', 'roomNames']);
    expect(seen.host.context().values.roomNames).toEqual([]);
    expect(seen.host.context().unsupported).toEqual(['condition', 'selection', 'lot', 'ppid', 'recipe', 'metric']);
    expect(seen.host.context().values).not.toHaveProperty('scopeId');
    cleanup();
    const scoped = setup('/fx/scoped?v=1&scopeId=S1');
    scoped.rerender({ id: 'fx:scoped' });
    expect(scoped.seen.host.context().values).toEqual({ scopeId: 'S1' });
  });

  it('page()/setPage() accept declared keys only; an undeclared key throws before navigating and inbound extras stay in the URL', () => {
    const { seen } = setup('/fx?v=1&q=a&junk=1');
    expect(seen.host.page('q')).toBe('a');
    expect(seen.host.page('junk')).toBeNull();
    const before = window.location.search;
    expect(() => seen.host.setPage({ junk: '2' })).toThrow(RangeError);
    expect(window.location.search).toBe(before);
    act(() => seen.host.setPage({ q: 'b' }));
    expect(window.location.search).toContain('q=b');
    expect(window.location.search).toContain('junk=1');
  });

  it('href({ screen }) stays inside the module, drops undeclared page keys and returns null for an unknown target', () => {
    const { seen } = setup();
    expect(seen.host.href({ screen: 'item', params: { id: '7' }, page: { tab: 'a', nope: 'x' } })?.href).toMatch(/^\/fx\/items\/7\?.*tab=a/);
    expect(seen.host.href({ screen: 'item', params: { id: '7' }, page: { nope: 'x' } })?.href).not.toContain('nope');
    expect(seen.host.href({ screen: 'missing' })).toBeNull();
    expect(seen.host.href({ screen: 'item' })).toBeNull();
    expect(seen.host.href({ menuId: 'fx:list' })?.href).toMatch(/^\/fx\?/);
    expect(seen.host.navigate({ screen: 'missing' })).toBe(false);
    let navigated = false;
    act(() => { navigated = seen.host.navigate({ screen: 'item', params: { id: '9' } }); });
    expect(navigated).toBe(true);
    expect(window.location.pathname).toBe('/fx/items/9');
  });

  it('href/navigate({ screen }) refuse an id that only looks like this module\'s screen (a nested module id, a platform menu)', () => {
    const { seen, registry } = setup('/fx?v=1', manifest(), undefined, true);
    expect(registry.menuById('fx:nested:list')).toBeDefined();
    expect(registry.menuById('fx:outside')).toBeDefined();
    for (const screen of ['nested:list', 'outside']) {
      expect(seen.host.href({ screen })).toBeNull();
      expect(seen.host.navigate({ screen })).toBe(false);
    }
    expect(window.location.pathname).toBe('/fx');
    expect(seen.host.href({ menuId: 'fx:nested:list' })?.href).toMatch(/^\/fxn/);
  });

  it('navigate requests arrival focus when the pathname changes and none for a same-screen move (06 §26)', () => {
    const { seen } = setup('/fx?v=1');
    act(() => { seen.host.navigate({ screen: 'list', page: { q: 'z' } }); });
    expect(window.location.search).toContain('q=z');
    expect(seen.platform.pageNavigation.consume('/fx')).toBeNull();
    act(() => { seen.host.navigate({ screen: 'item', params: { id: '3' } }, { replace: true }); });
    expect(window.location.pathname).toBe('/fx/items/3');
    expect(seen.platform.pageNavigation.consume('/fx/items/3')).toBe('page');
  });

  it('notify() raises a toast with the default tone for info', () => {
    const { seen } = setup();
    act(() => { seen.host.notify('hello'); seen.host.notify('careful', 'warning'); });
    expect(seen.platform.toasts.map(t => [t.text, t.tone])).toEqual([['hello', 'info'], ['careful', 'warning']]);
  });

  it('offers query and detail only for declared features the host provides', () => {
    expect(setup().seen.host.query).toBeTypeOf('function');
    expect(setup().seen.host.detail).toBeDefined();
    cleanup();
    const without = setup('/fx', manifest({ optional: [] }));
    expect(without.seen.host.query).toBeUndefined();
    expect(without.seen.host.detail).toBeUndefined();
    cleanup();
    const hostLacks = setup('/fx', manifest(), ['detailSlot']);
    expect(hostLacks.seen.host.query).toBeUndefined();
    expect(hostLacks.seen.host.detail).toBeDefined();
  });
});

describe('useModuleHost: release and subscriptions', () => {
  it.each([
    ['unmount', (s: ReturnType<typeof setup>) => s.rerender({ show: false })],
    ['screen change', (s: ReturnType<typeof setup>) => s.rerender({ id: 'fx:item', keyed: true })],
    ['revision change', (s: ReturnType<typeof setup>) => { s.rerender({ keyed: true }); return s.switchUser(); }],
  ])('aborts the signal on %s', async (_name, release) => {
    const s = setup();
    if (_name === 'revision change') s.rerender({ keyed: true });
    const { signal } = s.seen.host;
    expect(signal.aborted).toBe(false);
    await release(s);
    expect(signal.aborted).toBe(true);
  });

  it('subscribe fires on revision, route and global change and stops after unsubscribe or release', async () => {
    const s = setup();
    const onChange = vi.fn();
    const stop = s.seen.host.subscribe(onChange);
    s.setGlobal({ roomNames: ['ETCH'] });
    expect(onChange).toHaveBeenCalledTimes(1);
    await s.switchUser();
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => { s.seen.host.navigate({ screen: 'item', params: { id: '1' } }); });
    expect(onChange).toHaveBeenCalledTimes(3);
    stop();
    s.setGlobal({ roomNames: ['CVD'] });
    expect(onChange).toHaveBeenCalledTimes(3);

    const late = vi.fn();
    const host = s.seen.host;
    s.rerender({ show: false });
    host.subscribe(late)();
    const after = host.subscribe(late);
    expect(late).not.toHaveBeenCalled();
    after();
  });
});

describe('useModuleHost: query', () => {
  it('resolves to the not_ready envelope without an adapter call before the Scope is validated', async () => {
    const s = setup('/fx?v=1');
    const scoped = defineEndpoint<{ page: number }, Data>({ ...spec, id: 'fx.scoped', requiresScope: true });
    const outcome = await settle(s.seen.host.query!(scoped, { page: 1 }));
    expect(outcome).toMatchObject({ value: { outcome: 'error', message: expect.stringContaining('not_ready') } });
    expect(s.calls).toHaveLength(0);
  });

  it('delivers one response for a ready call', async () => {
    const s = setup();
    const pending = settle(s.seen.host.query!(spec, { page: 1 }));
    expect(s.calls).toHaveLength(1);
    await act(async () => s.calls[0].resolve(ok(s.calls[0].request)));
    expect(await pending).toMatchObject({ value: { outcome: 'ok', data: { from: '2026-09-25T09:00:00' } } });
  });

  it('rejects with AbortError when the caller aborts, and for an already-aborted caller without an adapter call', async () => {
    const s = setup();
    const controller = new AbortController();
    const pending = settle(s.seen.host.query!(spec, { page: 1 }, controller.signal));
    controller.abort();
    expect(isAbort(await pending)).toBe(true);
    expect(s.calls[0].signal?.aborted).toBe(true);
    expect(isAbort(await settle(s.seen.host.query!(spec, { page: 1 }, controller.signal)))).toBe(true);
    expect(s.calls).toHaveLength(1);
  });

  it('never delivers a result that started in an older generation, even when it resolves late', async () => {
    const s = setup();
    s.rerender({ keyed: false });
    const pending = settle(s.seen.host.query!(spec, { page: 1 }));
    await s.switchUser();
    expect(isAbort(await pending)).toBe(true);
    await act(async () => s.calls[0].resolve(ok(s.calls[0].request)));
  });

  it('rejects at once for a never-settling adapter that ignores cancellation when the screen is released', async () => {
    const s = setup();
    const pending = settle(s.seen.host.query!(spec, { page: 1 }));
    s.rerender({ show: false });
    expect(isAbort(await pending)).toBe(true);
    expect(isAbort(await settle(s.seen.host.query!(spec, { page: 2 })))).toBe(true);
    expect(s.calls).toHaveLength(1);
  });

  it('invalidates a call when its applied Context changes: A rejects, only the later B call delivers, whatever order the adapter answers', async () => {
    const s = setup();
    const a = settle(s.seen.host.query!(spec, { page: 1 }));
    s.setGlobal({ from: '2026-09-24T09:00:00' });
    // A is rejected at the Context change itself (the commit-time invalidation), before the adapter has answered anything.
    expect(isAbort(await a)).toBe(true);
    expect(s.calls[0].signal?.aborted).toBe(true);
    const b = settle(s.seen.host.query!(spec, { page: 1 }));
    expect(s.calls).toHaveLength(2);
    // The adapter ignores the AbortSignal and answers B, then the stale A.
    await act(async () => { s.calls[1].resolve(ok(s.calls[1].request)); s.calls[0].resolve(ok(s.calls[0].request)); });
    expect(await b).toMatchObject({ value: { data: { from: '2026-09-24T09:00:00' } } });
  });

  it('keeps independent concurrent calls, and a reference-only Context change does not invalidate them', async () => {
    const s = setup();
    const first = settle(s.seen.host.query!(spec, { page: 1 }));
    const second = settle(s.seen.host.query!(spec, { page: 2 }));
    s.setGlobal({ roomNames: ['ETCH'] });
    await act(async () => { s.calls[1].resolve(ok(s.calls[1].request)); s.calls[0].resolve(ok(s.calls[0].request)); });
    expect(await first).toMatchObject({ value: { outcome: 'ok' } });
    expect(await second).toMatchObject({ value: { outcome: 'ok' } });
  });
});

describe('useModuleHost: lifetime ordering', () => {
  const ports = { status: vi.fn(), focusTarget: vi.fn() } satisfies ModuleShellPorts;
  function harness(children: (registry: ReturnType<typeof makeRegistry>) => React.ReactNode, strict = false) {
    window.history.replaceState(null, '', '/fx?v=1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    const registry = makeRegistry();
    const calls: Call[] = [];
    const session = testSession(['fx:view']);
    const adapter = testAdapter({
      session: () => session,
      menuQuery: vi.fn((request: MenuQuery, signal?: AbortSignal) => new Promise<ApiResponse<never>>(resolve => {
        calls.push({ request, signal, resolve: r => resolve(r as ApiResponse<never>) });
      })),
    });
    const tree = (nodes: React.ReactNode) => {
      const inner = <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{nodes}</PlatformProvider></I18nProvider>;
      return strict ? <StrictMode>{inner}</StrictMode> : inner;
    };
    const view = render(tree(children(registry)));
    return { calls, registry, rerender: (nodes: React.ReactNode) => view.rerender(tree(nodes)) };
  }

  it('keeps the host usable for a descendant effect that re-runs in a StrictMode replay: its query reaches the adapter and its subscription survives', async () => {
    const queries: Promise<unknown>[] = [];
    const changes = vi.fn();
    let setGlobal: ((patch: Partial<GlobalContext>) => void) | undefined;
    function Consumer({ host }: { host: ModuleHost }) {
      // Like a screen: it depends on the generation it reads, not on the host object, so a replay is the only re-run.
      const { generation } = host.session();
      useEffect(() => {
        queries.push(settle(host.query!(spec, { page: 1 }, host.signal)));
        return host.subscribe(changes);
      }, [generation]);
      return null;
    }
    function Owner({ id }: { id: string }) {
      const platform = usePlatform();
      setGlobal = platform.setGlobal;
      return <Consumer host={useModuleHost(platform.registry.menuById(id) as never, {}, ports)} />;
    }
    const view = harness(() => <Owner id="fx:list" />, true);
    const last = view.calls.at(-1)!;
    expect(last.signal?.aborted).toBe(false);
    await act(async () => last.resolve(ok(last.request)));
    expect(await queries.at(-1)).toMatchObject({ value: { outcome: 'ok' } });
    act(() => setGlobal!({ roomNames: ['ETCH'] }));
    expect(changes).toHaveBeenCalled();
  });

  it('keeps the host usable for a descendant layout effect that re-runs in a StrictMode replay: its query delivers and its subscription is notified', async () => {
    const queries: Promise<unknown>[] = [];
    const changes = vi.fn();
    let setGlobal: ((patch: Partial<GlobalContext>) => void) | undefined;
    function Consumer({ host }: { host: ModuleHost }) {
      const { generation } = host.session();
      useLayoutEffect(() => {
        queries.push(settle(host.query!(spec, { page: 1 }, host.signal)));
        return host.subscribe(changes);
      }, [generation]);
      return null;
    }
    function Owner({ id }: { id: string }) {
      const platform = usePlatform();
      setGlobal = platform.setGlobal;
      return <Consumer host={useModuleHost(platform.registry.menuById(id) as never, {}, ports)} />;
    }
    const view = harness(() => <Owner id="fx:list" />, true);
    await act(async () => {});
    const last = view.calls.at(-1)!;
    expect(last.signal?.aborted).toBe(false);
    await act(async () => last.resolve(ok(last.request)));
    expect(await queries.at(-1)).toMatchObject({ value: { outcome: 'ok' } });
    act(() => setGlobal!({ roomNames: ['ETCH'] }));
    expect(changes).toHaveBeenCalled();
  });

  it('revokes the host when the screen is removed, before a replacement layout effect can use it', async () => {
    let retained: ModuleHost | undefined;
    const late: Promise<unknown>[] = [];
    function Owner() {
      const platform = usePlatform();
      retained = useModuleHost(platform.registry.menuById('fx:list') as never, {}, ports);
      return null;
    }
    function Replacement() {
      useLayoutEffect(() => { late.push(settle(retained!.query!(spec, { page: 1 }))); }, []);
      return null;
    }
    const view = harness(() => <Owner />);
    view.rerender(<Replacement />);
    expect(isAbort(await late[0] as object)).toBe(true);
    expect(view.calls).toHaveLength(0);
    expect(retained!.signal.aborted).toBe(true);
  });
});
