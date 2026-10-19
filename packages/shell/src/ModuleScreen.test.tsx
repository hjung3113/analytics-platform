import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, MenuQuery, ModuleHost, ModuleScreenProps, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, mountModule, usePlatform } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppSidebar } from './AppSidebar';
import { CommandPalette } from './CommandPalette';
import { ItemScreen, ListScreen, listEndpoint, manifest } from './__fixtures__/module-fixture';
import { RouteOutlet } from './RouteOutlet';

type Rows = { id: string }[];
type Call = { request: MenuQuery; signal: AbortSignal | undefined; resolve: (rows: Rows) => void };

const spy: { hosts: ModuleHost[] } = { hosts: [] };
const SpyList = (props: ModuleScreenProps) => { spy.hosts.push(props.host); return <ListScreen {...props} />; };
const BareItem = () => <p>bare item</p>;

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

function mount(url = '/fixture', options: { item?: (props: ModuleScreenProps) => React.ReactNode; extra?: React.ReactNode } = {}) {
  window.history.replaceState(null, '', url);
  const { menus, groups } = mountModule(manifest, { list: SpyList, item: options.item ?? ItemScreen }, {
    prefix: '/fixture', groupSpace: { 'fixture:main': 'analytics' }, config: { apiBase: 'https://api.example' },
    icons: { groups: { 'fixture:main': House }, screens: { list: House, item: House } },
  });
  const registry = createRegistry({
    spaces: [testSpace({ homeMenuId: 'home' })],
    groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }, ...groups],
    menus: [{
      id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House,
      permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', pageKeys: [],
      features: { export: false, savedView: false, annotate: false, compare: false },
      component: (({ params }: { params: Record<string, string> }) => <p>platform page {JSON.stringify(params)}</p>) as never,
    }, ...menus],
  });
  const calls: Call[] = [];
  const make = (id: string): Session => testSession(['platform:view', 'fixture:view'], { user: { id, name: id, title: { ko: id, en: id } } });
  let current = make('user-a');
  const listeners = new Set<() => void>();
  const adapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    menuQuery: vi.fn((request: MenuQuery, signal?: AbortSignal) => new Promise<ApiResponse<never>>(resolve => {
      calls.push({
        request, signal,
        resolve: rows => resolve({ outcome: 'ok', data: rows, assessments: [{ kind: 'collection', state: 'clear' }], trust: null, correlationId: 'c' } as unknown as ApiResponse<never>),
      });
    })),
  });
  const seen: { platform: ReturnType<typeof usePlatform> } = { platform: undefined as never };
  function Probe() { seen.platform = usePlatform(); return null; }
  const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>
    <main id="platform-main" tabIndex={-1}><Probe /><RouteOutlet />{options.extra}</main><SlotHost />
  </DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
  return {
    ...view, calls, seen,
    go: (to: string, focus?: 'page') => act(() => { seen.platform.navigate(to, focus ? { focus } : undefined); }),
    switchUser: () => act(() => { current = make('user-b'); listeners.forEach(l => l()); }),
  };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const asAbort = async (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);

beforeEach(() => {
  spy.hosts = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('ModuleScreen renders { params, host } (ADR-0053)', () => {
  it('gives an item screen its route params, declared page keys and config', () => {
    mount('/fixture/items/a1?v=1&tab=info&junk=1');
    expect(screen.getByRole('heading', { name: 'Fixture item a1' })).toBeTruthy();
    expect(screen.getByTestId('tab').textContent).toBe('info');
    expect(screen.getByTestId('api').textContent).toBe('https://api.example');
  });

  it('renders the list through host.query and moves the page with host.setPage', async () => {
    const view = mount('/fixture?v=1');
    expect(JSON.parse(screen.getByTestId('params').textContent!)).toEqual({});
    expect(screen.getByTestId('rows').textContent).toBe('loading');
    await act(async () => view.calls[0].resolve([{ id: 'r1' }, { id: 'r2' }]));
    expect(screen.getByTestId('rows').textContent).toBe('r1,r2');
    click('next page');
    expect(screen.getByTestId('page').textContent).toBe('2');
    expect(view.calls[1].request.params).toEqual({ page: 2 });
    expect(listEndpoint.id).toBe('fixture.items');
  });

  it('still renders a platform menu as <Page params>', () => {
    mount('/');
    expect(screen.getByText('platform page {}')).toBeTruthy();
  });
});

describe('ModuleScreen status', () => {
  it.each([
    ['sign-in lost', '다시 로그인이 필요합니다'],
    ['other user', '로그인한 사용자가 다릅니다'],
    ['server down', '지금 이 화면을 열 수 없습니다'],
  ])('%s shows its message instead of the screen and Retry recovers', (button, title) => {
    mount('/fixture?v=1');
    click(button);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Fixture list' })).toBeNull();
    click('다시 시도');
    expect(screen.queryByText(title)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Fixture list' })).toBeTruthy();
  });

  it('resets the status when the screen or the revision changes', () => {
    const view = mount('/fixture?v=1');
    click('server down');
    view.go('/fixture/items/a1?v=1');
    expect(screen.getByRole('heading', { name: 'Fixture item a1' })).toBeTruthy();
    view.go('/fixture?v=1');
    click('other user');
    expect(screen.getByText('로그인한 사용자가 다릅니다')).toBeTruthy();
    view.switchUser();
    expect(screen.getByRole('heading', { name: 'Fixture list' })).toBeTruthy();
  });

  it('releases the old instance on a non-ready status: signal, queries and subscriptions end, Retry brings a fresh host', async () => {
    const view = mount('/fixture?v=1');
    const old = spy.hosts.at(-1)!;
    const onChange = vi.fn();
    old.subscribe(onChange);
    const pending = asAbort(old.query!(listEndpoint, { page: 9 }));
    click('server down');
    expect(old.signal.aborted).toBe(true);
    expect(view.calls.every(call => call.signal?.aborted)).toBe(true);
    act(() => view.seen.platform.setGlobal({ roomNames: ['ETCH'] }));
    expect(onChange).not.toHaveBeenCalled();

    click('다시 시도');
    const fresh = spy.hosts.at(-1)!;
    expect(fresh).not.toBe(old);
    expect(fresh.signal.aborted).toBe(false);
    const freshQuery = fresh.query!(listEndpoint, { page: 1 });
    await act(async () => view.calls.at(-1)!.resolve([{ id: 'late' }]));
    expect((await freshQuery).data).toEqual([{ id: 'late' }]);
    await act(async () => view.calls[1].resolve([{ id: 'stale' }]));
    expect(await pending).toBeInstanceOf(DOMException);
    expect(screen.getByTestId('rows').textContent).not.toContain('stale');
  });

  it('ignores status, detail and focus calls from a released instance', () => {
    mount('/fixture?v=1');
    const old = spy.hosts.at(-1)!;
    click('server down');
    click('다시 시도');
    old.status('unavailable');
    old.detail!.show(<p>old detail</p>, 'old');
    old.focusTarget(document.body);
    expect(screen.getByRole('heading', { name: 'Fixture list' })).toBeTruthy();
    expect(screen.queryByText('old detail')).toBeNull();
  });

  it('drops host subscriptions on a normal unmount', () => {
    const view = mount('/fixture?v=1');
    const host = spy.hosts.at(-1)!;
    const onChange = vi.fn();
    host.subscribe(onChange);
    view.go('/');
    expect(host.signal.aborted).toBe(true);
    act(() => view.seen.platform.setGlobal({ roomNames: ['ETCH'] }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ModuleScreen detail slot', () => {
  const panel = () => screen.getByRole('complementary', { name: '상세 패널' });

  it('shows the node, clears on clear(), on a status change and on unmount', () => {
    const view = mount('/fixture?v=1');
    click('show detail');
    expect(within(panel()).getByText('detail of 1')).toBeTruthy();
    expect(within(panel()).getByRole('region', { name: 'Detail' })).toBeTruthy();
    click('clear detail');
    expect(within(panel()).queryByText('detail of 1')).toBeNull();

    click('show detail');
    click('server down');
    expect(within(panel()).queryByText('detail of 1')).toBeNull();
    click('다시 시도');
    expect(within(panel()).queryByText('detail of 1')).toBeNull();

    click('show detail');
    expect(within(panel()).getByText('detail of 1')).toBeTruthy();
    view.go('/');
    expect(within(panel()).queryByText('detail of 1')).toBeNull();
  });
});

describe('ModuleScreen arrival focus (06 §26, ADR-0032)', () => {
  it('moves nothing on the initial load without a request', () => {
    mount('/fixture?v=1');
    expect(document.body).toHaveFocus();
  });

  it('focuses the registered target after an explicit page arrival', () => {
    const view = mount('/?v=1');
    view.go('/fixture?v=1', 'page');
    expect(screen.getByRole('heading', { name: 'Fixture list' })).toHaveFocus();
  });

  it('falls back to the page content when no target is registered', () => {
    const view = mount('/?v=1', { item: BareItem });
    view.go('/fixture/items/a1?v=1', 'page');
    expect(document.getElementById('platform-main')).toHaveFocus();
  });

  it('waits while the palette blocks the arrival and lands on release', () => {
    const view = mount('/?v=1');
    act(() => view.seen.platform.setPaletteOpen(true));
    view.go('/fixture?v=1', 'page');
    expect(screen.getByRole('heading', { name: 'Fixture list' })).not.toHaveFocus();
    act(() => view.seen.platform.setPaletteOpen(false));
    expect(screen.getByRole('heading', { name: 'Fixture list' })).toHaveFocus();
  });

  it('subscribes for a delayed release and unsubscribes on unmount', () => {
    const view = mount('/?v=1');
    const stops: ReturnType<typeof vi.fn>[] = [];
    const subscribe = view.seen.platform.pageNavigation.subscribe;
    vi.spyOn(view.seen.platform.pageNavigation, 'subscribe').mockImplementation(listener => {
      const stop = vi.fn(subscribe(listener));
      stops.push(stop);
      return stop;
    });
    view.go('/fixture?v=1');
    expect(stops.length).toBeGreaterThan(0);
    view.go('/');
    expect(stops.every(stop => stop.mock.calls.length > 0)).toBe(true);
  });
});

describe('implemented badge', () => {
  it('shows no planned badge for a module entry in the sidebar and the palette', () => {
    function Open() { const { setPaletteOpen } = usePlatform(); return <button type="button" onClick={() => setPaletteOpen(true)}>open palette</button>; }
    mount('/fixture?v=1', { extra: <><AppSidebar collapsed={false} onToggle={() => {}} /><Open /><CommandPalette /></> });
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByRole('link', { name: /list/ })).toBeTruthy();
    expect(within(nav).queryByText('예정')).toBeNull();
    click('open palette');
    const option = screen.getAllByRole('option').find(el => el.textContent?.includes('list'));
    expect(option).toBeTruthy();
    expect(option!.textContent).not.toContain('예정');
  });
});
