import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House, ListTodo } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, mountModule, type FeedbackOpsSlot } from '@ap/kernel';
import { PaneScreenProvider, useHostPlatform, type PaneScreen } from '@ap/kernel/host';
import { DetailPanelSlotProvider } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppSidebar } from './AppSidebar';
import { ItemScreen, ListScreen, manifest } from './__fixtures__/module-fixture';
import { RouteOutlet, ScreenOutlet } from './RouteOutlet';
import { groupId, spaceId, type ActionResponse, type ApiResponse, type ClientErrorReport, type MenuAction, type MenuQuery, type ModuleHost, type ModuleScopedId, type ModuleScreenProps, type Permission, type PlatformAdapter } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const menu = (id: string, path: string, over: object = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features, pageKeys: ['tab'], ...over,
});
function Crash(): never { throw new Error('boom'); }

const { menus: moduleMenus, groups: moduleGroups } = mountModule(manifest, { list: (props: ModuleScreenProps) => <ProbeList {...props} />, item: ItemScreen }, {
  prefix: '/fixture', groupSpace: { 'fixture:main': spaceId('analytics') }, config: { apiBase: 'https://api.example' },
  icons: { groups: { 'fixture:main': House }, screens: { list: House, item: House } },
});
const registry = createRegistry({
  spaces: [
    testSpace({ homeMenuId: 'home' }),
    testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations' }, permission: 'console:access', homeMenuId: 'ops' }),
  ],
  groups: [
    { id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('analytics') },
    { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') },
    ...moduleGroups,
  ],
  menus: [
    { ...menu('home', '/', { component: () => <p>home page</p>, features: { ...features, board: false } }), primary: true },
    menu('plain', '/plain', { component: () => <p>plain page</p> }),
    menu('locked', '/locked', { permission: 'console:access', component: () => <p>locked page</p> }),
    menu('crash', '/crash', { component: Crash }),
    menu('planned', '/planned'),
    menu('scoped', '/scoped', { context: { ...noContext, roomNames: 'apply' as const }, component: () => <p>scoped page</p> }),
    { ...menu('ops', '/ops', { permission: 'console:access', component: () => <p>ops page</p> }), group: groupId('admin'), primary: true },
    { ...menu('ops-child', '/ops/child', { component: () => <p>ops child page</p> }), group: groupId('admin') },
    ...moduleMenus.map(m => ({ ...m, features: { ...m.features, board: true } })),
  ],
});

const state: { hosts: ModuleHost[]; platforms: Map<string, ReturnType<typeof useHostPlatform>>; pageSeen: string[]; subscribed: number; changes: number } = { hosts: [], platforms: new Map(), pageSeen: [], subscribed: 0, changes: 0 };
function ProbeList(props: ModuleScreenProps) {
  state.hosts.push(props.host);
  state.pageSeen.push(props.host.page('page') ?? '-');
  return <>
    <ListScreen {...props} />
    <Subscriber host={props.host} />
  </>;
}
function Subscriber({ host }: { host: ModuleHost }) {
  const [, setN] = useState(0);
  useStateEffect(host, () => { state.changes += 1; setN(n => n + 1); });
  return <button type="button" onClick={() => host.reportError(new Error('x'))}>report</button>;
}
function useStateEffect(host: ModuleHost, onChange: () => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the test counts one subscription per host; the callback is read at call time
  useEffect(() => { state.subscribed += 1; return host.subscribe(onChange); }, [host]);
}
function Probe({ id }: { id: string }) { state.platforms.set(id, useHostPlatform()); return null; }
const at = (id: string) => state.platforms.get(id)!;

type Pending = { request: MenuQuery; signal: AbortSignal | undefined; resolve: (rows: { id: string }[]) => void };
const ANALYST: readonly (Permission | ModuleScopedId)[] = ['platform:view', 'fixture:view'];

function fixtureAdapter(permissions: readonly (Permission | ModuleScopedId)[], extra: Partial<PlatformAdapter> = {}) {
  const session = testSession(permissions);
  const queries: Pending[] = [];
  const reports: ClientErrorReport[] = [];
  const adapter = testAdapter({
    session: () => session,
    reportClientError: async report => { reports.push(report); return { accepted: true }; },
    menuQuery: vi.fn((request: MenuQuery, signal?: AbortSignal) => new Promise<ApiResponse<never>>(resolve => {
      queries.push({ request, signal, resolve: rows => resolve({ outcome: 'ok', data: rows, assessments: [{ kind: 'collection', state: 'clear' }], trust: null, correlationId: 'c' } as unknown as ApiResponse<never>) });
    })),
    ...extra,
  });
  return { adapter, queries, reports };
}

type PaneSpec = { id: string; screen: PaneScreen; echo?: boolean };
function mount(mainUrl: string, panes: PaneSpec[], adapter: PlatformAdapter, options: { strict?: boolean; outside?: ReactNode; slots?: Parameters<typeof PlatformProvider>[0]['slots'] } = {}) {
  window.history.replaceState(null, '', mainUrl);
  const changes: Record<string, ReturnType<typeof vi.fn>> = {};
  const leaves: Record<string, ReturnType<typeof vi.fn>> = {};
  function ControlledPane({ spec }: { spec: PaneSpec }) {
    const [current, setCurrent] = useState(spec.screen);
    changes[spec.id] ??= vi.fn();
    leaves[spec.id] ??= vi.fn();
    return <div data-pane-id={spec.id} data-testid={`pane-${spec.id}`} tabIndex={-1}>
      <PaneScreenProvider paneId={spec.id} screen={current} onLeave={href => leaves[spec.id]!(href)}
        onChange={(next, how) => { changes[spec.id]!(next, how); if (spec.echo !== false) setCurrent(next); }}>
        <Probe id={spec.id} /><ScreenOutlet />
      </PaneScreenProvider>
    </div>;
  }
  const tree = <I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={options.slots}><DetailPanelSlotProvider>
    <Probe id="main" />{options.outside}
    <main id="platform-main" tabIndex={-1} data-testid="main"><RouteOutlet /></main>
    {panes.map(spec => <ControlledPane key={spec.id} spec={spec} />)}
  </DetailPanelSlotProvider></PlatformProvider></I18nProvider>;
  const view = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  const pane = (id: string) => within(screen.getByTestId(`pane-${id}`));
  return { ...view, pane, changes, leaves };
}
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

beforeEach(() => {
  state.hosts = []; state.platforms = new Map(); state.pageSeen = []; state.subscribed = 0; state.changes = 0;
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const win = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const paneOf = (menuId: string, query = '?', params: Record<string, string> = {}): PaneScreen => ({ menuId, params, query });

describe('ScreenOutlet renders the pane screen with the same gates (ADR-0049)', () => {
  it('renders the pane menu while main renders its own, and a planned menu draws content without a page header', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    const view = mount('/', [{ id: 'a', screen: paneOf('plain') }, { id: 'b', screen: paneOf('planned') }], adapter);
    await flush();
    expect(screen.getByTestId('main').textContent).toContain('home page');
    expect(view.pane('a').getByText('plain page')).toBeTruthy();
    expect(view.pane('b').queryByRole('heading', { level: 1 })).toBeNull();
    expect(view.pane('b').getAllByText(/\S/).length).toBeGreaterThan(0);
  });

  it('a menu the user may not open shows its denial inside the pane only', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    const view = mount('/', [{ id: 'a', screen: paneOf('locked') }, { id: 'b', screen: paneOf('plain') }], adapter);
    await flush();
    expect(view.pane('a').getByText('이 메뉴에 대한 권한이 없습니다')).toBeTruthy();
    expect(view.pane('a').queryByText('locked page')).toBeNull();
    expect(view.pane('b').getByText('plain page')).toBeTruthy();
    expect(screen.getByTestId('main').textContent).toContain('home page');
  });

  it('checks the pane space, not the main space, in both directions', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    const denied = mount('/', [{ id: 'ops', screen: paneOf('ops-child') }], adapter);
    await flush();
    expect(denied.pane('ops').getByText('이 공간에 들어갈 수 없습니다')).toBeTruthy();
    expect(denied.pane('ops').queryByText('ops child page')).toBeNull();
    expect(screen.getByTestId('main').textContent).toContain('home page');
    cleanup();
    const reverse = mount('/ops/child', [{ id: 'ok', screen: paneOf('plain') }], adapter);
    await flush();
    expect(within(screen.getByTestId('main')).getByText('이 공간에 들어갈 수 없습니다')).toBeTruthy();
    expect(reverse.pane('ok').getByText('plain page')).toBeTruthy();
  });

  it('a contract error is drawn inside its pane and Reset writes that pane only', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    const view = mount('/', [{ id: 'bad', screen: paneOf('plain', '?from=nonsense&to=x'), echo: false }, { id: 'ok', screen: paneOf('plain') }], adapter);
    await flush();
    expect(view.pane('bad').getByText('주소에 쓸 수 없는 값이 있습니다')).toBeTruthy();
    expect(view.pane('ok').getByText('plain page')).toBeTruthy();
    await act(async () => { view.pane('bad').getByRole('button', { name: '조건 초기화' }).click(); });
    expect(view.changes.bad).toHaveBeenCalledTimes(1);
    expect(view.changes.ok).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('a render failure is reported against the pane menu and caught inside the pane', async () => {
    const { adapter, reports } = fixtureAdapter(ANALYST);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = mount('/', [{ id: 'c', screen: paneOf('crash') }], adapter);
    await flush();
    expect(reports.map(r => r.menuId)).toEqual(['crash']);
    expect(view.pane('c').queryByText('crash')).toBeNull();
    expect(screen.getByTestId('main').textContent).toContain('home page');
  });
});

describe('shell chrome outside a pane keeps following the main screen', () => {
  const feedback = (returns: (string | undefined)[]): FeedbackOpsSlot => ({
    entriesFor: (_space, platformReturn) => { returns.push(platformReturn); return [{ key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Task' }, href: `https://fo.example/?return=${encodeURIComponent(platformReturn ?? '')}` }]; },
    overall: null,
  });

  it('pane Context changes leave the sidebar links, FeedbackOps return URLs and the main Context untouched', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    const returns: (string | undefined)[] = [];
    mount(`/plain?${win}&scopeId=MEM`, [{ id: 'a', screen: paneOf('scoped', `?scopeId=S1&${win}`) }], adapter, {
      slots: { feedbackOps: feedback(returns) }, outside: <AppSidebar collapsed={false} onToggle={() => {}} />,
    });
    await flush();
    const links = () => screen.getAllByRole('link').map(a => a.getAttribute('href')).join('\n');
    const before = links();
    const returnBefore = returns.at(-1);
    expect(before).toContain('scopeId=MEM');
    expect(returnBefore).toContain('/plain');
    await act(async () => { at('a').setGlobal({ scopeId: 'S2', roomNames: ['R1'] }); });
    await flush();
    expect(at('a').global.scopeId).toBe('S2');
    expect(links()).toBe(before);
    expect(returns.at(-1)).toBe(returnBefore);
    expect(at('main').global.scopeId).toBe('MEM');
    expect(at('main').global.roomNames).toBeNull();
  });

  it('a notification raised by a pane reads that pane: clearing its site-bound sets leaves the main sets alone', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    mount(`/plain?${win}&scopeId=MEM&roomNames=M1`, [{ id: 'a', screen: paneOf('scoped', `?scopeId=S1&roomNames=R1&${win}`) }], adapter);
    await flush();
    act(() => { at('a').setGlobal({ scopeId: 'S2' }); });
    expect(at('a').global.roomNames).toBeNull();
    expect(at('main').global.roomNames).toEqual(['M1']);
    expect(at('main').global.scopeId).toBe('MEM');
  });
});

describe('a module screen mounted in a pane (ADR-0053 host over a pane)', () => {
  const modulePane = (query = '?page=2'): PaneSpec => ({ id: 'm', screen: paneOf('fixture:list', query) });

  it('reads and writes the pane: page, setPage, href, navigate, error attribution and subscriptions', async () => {
    const { adapter, reports } = fixtureAdapter(ANALYST);
    const view = mount('/', [modulePane()], adapter);
    await flush();
    expect(view.pane('m').getByTestId('page').textContent).toBe('2');
    expect(screen.getByTestId('main').textContent).toContain('home page');
    const host = state.hosts.at(-1)!;
    expect(host.page('page')).toBe('2');
    expect(host.href({ screen: 'item', params: { id: 'a1' }, page: { tab: 'info' } })?.href).toContain('/fixture/items/a1');
    const subscribedBefore = state.changes;
    fireEvent.click(view.pane('m').getByRole('button', { name: 'next page' }));
    const [written, how] = view.changes.m!.mock.calls.at(-1)!;
    expect([written.menuId, new URLSearchParams(written.query).get('page'), how]).toEqual(['fixture:list', '3', 'push']);
    expect(window.location.search).toBe('');
    await flush();
    expect(view.pane('m').getByTestId('page').textContent).toBe('3');
    expect(state.changes).toBeGreaterThan(subscribedBefore);
    fireEvent.click(view.pane('m').getByRole('button', { name: 'report' }));
    await flush();
    expect(reports.map(r => r.menuId)).toEqual(['fixture:list']);
    fireEvent.click(view.pane('m').getByRole('link', { name: 'open item' }));
    const [opened, openHow] = view.changes.m!.mock.calls.at(-1)!;
    expect([opened.menuId, opened.params, openHow]).toEqual(['fixture:item', { id: 'a1' }, 'push']);
  });

  it('draws no page head, no Context bar and takes no arrival focus in the pane (#804)', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    const view = mount('/', [modulePane()], adapter, { slots: { contextBar: <div data-testid="context-bar" /> } });
    await flush();
    expect(view.pane('m').getByTestId('page').textContent).toBe('2');
    expect(view.pane('m').queryByRole('heading', { name: 'list' })).toBeNull();
    expect(view.pane('m').queryByTestId('context-bar')).toBeNull();
    expect(document.body).toHaveFocus();
  });

  it('keeps focus outside the pane when a page navigation request lands on a pane module screen (#804)', async () => {
    const { adapter } = fixtureAdapter(ANALYST);
    const view = mount('/', [modulePane()], adapter, { outside: <button type="button">outside control</button> });
    await flush();
    const outside = screen.getByRole('button', { name: 'outside control' });
    outside.focus();
    act(() => { at('m').navigate('/fixture/items/a1', { focus: 'page' }); });
    await flush();
    expect(view.pane('m').getByRole('heading', { name: 'Fixture item a1' })).toBeTruthy();
    expect(outside).toHaveFocus();
  });

  it('keeps the host query lifecycle: StrictMode replay leaves it alive, unmount aborts the call and drops its late result', async () => {
    const { adapter, queries } = fixtureAdapter(ANALYST);
    const view = mount('/', [modulePane()], adapter, { strict: true });
    await flush();
    const live = queries.at(-1)!;
    expect(live.signal?.aborted).toBe(false);
    expect(state.hosts.at(-1)!.signal.aborted).toBe(false);
    await act(async () => live.resolve([{ id: 'r1' }]));
    expect(view.pane('m').getByTestId('rows').textContent).toBe('r1');
    fireEvent.click(view.pane('m').getByRole('button', { name: 'next page' }));
    await flush();
    const next = queries.at(-1)!;
    expect(next.request.params).toEqual({ page: 3 });
    view.unmount();
    expect(next.signal?.aborted).toBe(true);
    expect(state.hosts.at(-1)!.signal.aborted).toBe(true);
  });

  it('an item pane save refreshes an already mounted list pane without a URL or generation change', async () => {
    let answerAction!: (response: ActionResponse<unknown>) => void;
    const sent: MenuAction[] = [];
    const { adapter, queries } = fixtureAdapter(ANALYST, {
      menuAction: vi.fn((request: MenuAction) => { sent.push(request); return new Promise<ActionResponse<unknown>>(resolve => { answerAction = resolve; }); }),
    });
    const view = mount('/', [{ id: 'l', screen: paneOf('fixture:list', '') }, { id: 'i', screen: { menuId: 'fixture:item', params: { id: 'a1' }, query: '' } }], adapter);
    await flush();
    await act(async () => queries.at(-1)!.resolve([{ id: 'r1' }]));
    expect(view.pane('l').getByTestId('rows').textContent).toBe('r1');
    const queriesBefore = queries.length;
    const search = window.location.search;
    const generation = at('l').revision;
    fireEvent.click(view.pane('i').getByRole('button', { name: 'save' }));
    await act(async () => answerAction({ outcome: 'ok', data: null, version: 'v2', fieldErrors: [], replayed: false, correlationId: 'c' }));
    await flush();
    expect(sent).toHaveLength(1);
    expect(queries).toHaveLength(queriesBefore + 1);
    // The prior rows stay until the refreshed answer arrives.
    expect(view.pane('l').getByTestId('rows').textContent).toBe('r1');
    await act(async () => queries.at(-1)!.resolve([{ id: 'r1' }, { id: 'r2' }]));
    expect(view.pane('l').getByTestId('rows').textContent).toBe('r1,r2');
    expect(window.location.search).toBe(search);
    expect(at('l').revision).toBe(generation);
  });
});
