import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { lazy } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, useSavedViewSupport } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSavedView, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { DetailPanelFullscreenContext } from '@ap/ui';
import { buildQuery, emptyGlobal, groupId, spaceId, type SavedViewSupport } from '@ap/contracts';
import { BoardSurface } from '../BoardSurface';
import { addSheet, freshBoard, setLayout, setPane, closePane, type Board } from '../boardModel';

import { OpenInBoardAction } from '../OpenInBoardAction';
import { BOARD_LAYOUT_ENGINE_KEY } from '../layoutEngine';
import { RouteOutlet } from '../../routing/RouteOutlet';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import '../BoardHost';
import { useBoardSession } from '../boardSession';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const Page = () => <PlatformPage><p>page body</p></PlatformPage>;
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { id: 'home', group: groupId('equipment'), label: { ko: 'home', en: 'home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, query: { mode: 'live' as const }, features: { ...features, board: false }, pageKeys: [], ...({ component: Page } as Record<string, unknown>), primary: true },
    { id: 'alpha', group: groupId('equipment'), label: { ko: '알파', en: 'Alpha' }, description: { ko: '', en: '' }, path: '/alpha', icon: House, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, query: { mode: 'live' as const }, features, pageKeys: [], ...({ component: Page } as Record<string, unknown>) },
  ],
});

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const provide = (children: React.ReactNode, boardEntry?: React.ReactNode) => {
  const session = testSession(['platform:view']);
  return <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={boardEntry ? { boardEntry } : undefined}>{children}</PlatformProvider></I18nProvider>;
};
const Outlet = () => <p>pane</p>;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('BoardSurface (893b)', () => {
  it('waits for mount-time Saved View support on a lazy main screen', async () => {
    const [home, alpha] = registry.menus;
    if (alpha.module !== undefined) throw new Error('Expected a platform menu');
    let release = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const loading = vi.fn(async () => { await held; return { default: SupportedPage }; });
    const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
    const query = buildQuery({ ...emptyGlobal, ...period }, []);
    const support: SavedViewSupport = { menuId: alpha.id, menuSchemaVersion: 1, contextKeys: ['time'], pageKeys: [] };
    function SupportedPage() {
      useSavedViewSupport(support);
      const { global } = usePlatform();
      return <p>{global.from ?? 'idle'}</p>;
    }
    const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
      home, { ...alpha, component: lazy(loading), query: { mode: 'apply', autoApplyDefault: true }, features: { ...alpha.features, savedView: true } },
    ] });
    const session = testSession(['platform:view']);
    const store = createFakeSavedViewStore([testSavedView({ id: 'view', menuId: alpha.id, context: period })], { [`${session.user.id}:${alpha.id}`]: 'view' });
    const path = chosen.canonicalHref(alpha.path);
    window.history.replaceState(null, '', path);
    const replace = vi.spyOn(window.history, 'replaceState');
    try {
      render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={chosen} savedViews={store}>
        <RouteOutlet />
      </PlatformProvider></I18nProvider>);
      await waitFor(() => expect(loading).toHaveBeenCalledTimes(1));
      expect(replace).not.toHaveBeenCalled();
      await act(async () => release());
      await screen.findByText(period.from);
      expect(replace.mock.calls.map(call => call[2])).toEqual([path + query]);
    } finally {
      replace.mockRestore();
    }
  });

  it('focuses the page title after a personal default replaces a held lazy arrival', async () => {
    const [home, alpha] = registry.menus;
    if (alpha.module !== undefined) throw new Error('Expected a platform menu');
    let release = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const loading = vi.fn(async () => { await held; return { default: Page }; });
    const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
    const query = buildQuery({ ...emptyGlobal, ...period }, []);
    const support: SavedViewSupport = { menuId: alpha.id, menuSchemaVersion: 1, contextKeys: ['time'], pageKeys: [] };
    const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
      home, { ...alpha, component: lazy(loading), query: { mode: 'apply', autoApplyDefault: true }, savedViewSupport: support, features: { ...alpha.features, savedView: true } },
    ] });
    const session = testSession(['platform:view']);
    const store = createFakeSavedViewStore([testSavedView({ id: 'view', menuId: alpha.id, context: period })], { [`${session.user.id}:${alpha.id}`]: 'view' });
    const path = chosen.canonicalHref(alpha.path);
    function Open() {
      const { navigate } = useHostPlatform();
      return <button onClick={() => navigate(path, { focus: 'page' })}>Open Alpha</button>;
    }
    window.history.replaceState(null, '', chosen.canonicalHref(home.path));
    const replace = vi.spyOn(window.history, 'replaceState');
    try {
      render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={chosen} savedViews={store}>
        <Open /><RouteOutlet />
      </PlatformProvider></I18nProvider>);
      const open = screen.getByRole('button', { name: 'Open Alpha' });
      open.focus();
      fireEvent.click(open);
      await waitFor(() => expect(window.location.search).toBe(query));
      expect(loading).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('heading', { name: '알파' })).toBeNull();
      expect(replace.mock.calls.map(call => call[2]).filter(url => String(url).startsWith(path))).toEqual([path + query]);
      await act(async () => release());
      expect(await screen.findByRole('heading', { name: '알파' })).toHaveFocus();
    } finally {
      replace.mockRestore();
    }
  });

  it('closes the live period editor when switching between editable panes', async () => {
    const start = freshBoard('시트');
    const id = start.sheets[0].id;
    const pane = { menuId: 'alpha', params: {}, query: '' };
    const seeded = setPane(setPane(setLayout(start, id, '1x2'), id, 0, pane), id, 1, pane);
    localStorage.setItem(`platform:board:v2:${testSession(['platform:view']).user.id}`, JSON.stringify(seeded));
    render(provide(<BoardSurface sheetId={id} onSheetChange={() => {}} arrivalKey="x" Outlet={Outlet} />));
    fireEvent.click(await screen.findByRole('button', { name: /^기간:/ }));
    expect(await screen.findByRole('dialog', { name: '기간' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '칸 2 선택' }));
    expect(screen.getByRole('group', { name: '칸 2' })).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByRole('dialog', { name: '기간' })).toBeNull();
  });

  it('applies the bare pane period immediately and leaves the controls enabled without Saved View reads', async () => {
    const [home, alpha] = registry.menus;
    if (alpha.module !== undefined) throw new Error('Expected a platform menu');
    const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
      home, { ...alpha, query: { mode: 'apply', autoApplyDefault: true }, features: { ...alpha.features, savedView: true },
        savedViewSupport: { menuId: alpha.id, menuSchemaVersion: 1, contextKeys: ['time'], pageKeys: [] } },
    ] });
    const session = testSession(['platform:view']);
    const start = freshBoard('시트');
    const id = start.sheets[0].id;
    const seeded = setPane(start, id, 0, { menuId: alpha.id, params: {}, query: '' });
    localStorage.setItem(`platform:board:v2:${session.user.id}`, JSON.stringify(seeded));
    window.history.replaceState(null, '', '/board');
    const store = createFakeSavedViewStore();
    const lookup = vi.spyOn(store, 'getDefaultId').mockReturnValue(new Promise(() => {}));
    const get = vi.spyOn(store, 'get');
    const list = vi.spyOn(store, 'list');
    function AppliedOutlet() {
      const { global } = usePlatform();
      return <p>{global.from ?? 'idle'}</p>;
    }
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={chosen} savedViews={store}>
      <BoardSurface sheetId={id} onSheetChange={() => {}} arrivalKey="x" Outlet={AppliedOutlet} />
    </PlatformProvider></I18nProvider>);
    expect(screen.getByText('2026-09-25T09:00:00')).toBeVisible();
    const expand = screen.getByRole('button', { name: '조회 조건 펼치기' });
    expect(expand).toBeEnabled();
    expect(screen.queryByRole('button', { name: '적용' })).toBeNull();
    fireEvent.click(expand);
    expect(screen.getByLabelText('시작 시각')).toBeEnabled();
    expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
    await act(async () => {});
    expect(lookup).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('settles both bare pane entries without selecting the second pane or restoring a default view', async () => {
    const [home, alpha] = registry.menus;
    const chosen = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
      home, { ...alpha, query: { mode: 'apply', autoApplyDefault: true }, features: { ...alpha.features, savedView: true } },
    ] });
    const session = testSession(['platform:view']);
    const start = freshBoard('시트');
    const id = start.sheets[0].id;
    const bare = { menuId: 'alpha', params: {}, query: '' };
    const seeded = setPane(setPane(setLayout(start, id, '1x2'), id, 0, bare), id, 1, bare);
    localStorage.setItem(`platform:board:v2:${session.user.id}`, JSON.stringify(seeded));
    window.history.replaceState(null, '', '/board');
    const store = createFakeSavedViewStore();
    const getDefaultId = vi.spyOn(store, 'getDefaultId');
    const support: SavedViewSupport = { menuId: 'alpha', menuSchemaVersion: 1, contextKeys: ['time'], pageKeys: [] };
    function AppliedOutlet() {
      useSavedViewSupport(support);
      const { global } = usePlatform();
      return <p>{global.from ?? 'idle'}</p>;
    }
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={chosen} savedViews={store}>
      <BoardSurface sheetId={id} onSheetChange={() => {}} arrivalKey="x" Outlet={AppliedOutlet} />
    </PlatformProvider></I18nProvider>);
    await waitFor(() => expect(screen.getAllByText('2026-09-25T09:00:00')).toHaveLength(2));
    expect(screen.getByRole('group', { name: '칸 2' })).toHaveAttribute('data-selected', 'false');
    expect(within(screen.getByRole('group', { name: '칸 2' })).queryByText('idle')).toBeNull();
    expect(getDefaultId).not.toHaveBeenCalled();
  });

  it('draws the sheet it is given without an address, and reports a tab press as a sheet change', async () => {
    const two = addSheet(freshBoard('시트'), '시트');
    localStorage.setItem(`platform:board:v2:${testSession(['platform:view']).user.id}`, JSON.stringify(two));
    window.history.replaceState(null, '', '/nowhere');
    const onSheetChange = vi.fn();
    render(provide(<BoardSurface sheetId={two.sheets[1].id} onSheetChange={onSheetChange} arrivalKey="x" Outlet={Outlet} />));
    await settle();
    expect(screen.getByRole('tab', { name: '시트 2' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '시트 1' }));
    expect(onSheetChange).toHaveBeenCalledWith(two.sheets[0].id);
    expect(window.location.pathname).toBe('/nowhere');
  });

  it('browses layouts with arrow keys without choosing one (#2552)', async () => {
    const board = freshBoard('시트');
    localStorage.setItem(`platform:board:v2:${testSession(['platform:view']).user.id}`, JSON.stringify(board));
    render(provide(<BoardSurface sheetId={board.sheets[0].id} onSheetChange={vi.fn()} arrivalKey="x" Outlet={Outlet} />));
    await settle();
    const layouts = screen.getAllByRole('radio', { name: /^\d×\d 레이아웃$/ });
    const current = layouts.find(radio => radio.getAttribute('aria-checked') === 'true')!;
    const next = layouts[(layouts.indexOf(current) + 1) % layouts.length]!;
    current.focus();
    fireEvent.keyDown(current, { key: 'ArrowRight' });
    await settle();
    expect(next).toHaveFocus();
    expect(current).toHaveAttribute('aria-checked', 'true');
    expect(next).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('BoardSurface under an expanded detail (#1459)', () => {
  it('makes the board-owned body (Context bar, panes, sheet tabs) inert but not its header', async () => {
    const view = (expanded: boolean) => provide(<DetailPanelFullscreenContext.Provider value={{ expanded, toggle: () => {} }}><BoardSurface sheetId="" onSheetChange={() => {}} arrivalKey="x" Outlet={Outlet} /></DetailPanelFullscreenContext.Provider>);
    const mounted = render(view(false));
    await settle();
    const tab = screen.getAllByRole('tab')[0];
    const heading = document.querySelector('[data-board-heading]')!;
    expect(tab.closest('[inert]')).toBeNull();
    mounted.rerender(view(true));
    await settle();
    expect(tab.closest('[inert]')).not.toBeNull();
    expect(document.querySelector('[role="tabpanel"]')!.closest('[inert]')).not.toBeNull();
    expect(document.querySelector('[data-board-body]')!.querySelector('[data-board-context-bar], [role="toolbar"], button')).not.toBeNull();
    expect(heading.closest('[inert]')).toBeNull();
  });
});

describe('BoardScreen as the URL adapter (893b)', () => {
  it('replaces a missing or unknown ?sheet= with the stored active sheet and saves a matched one as active', async () => {
    const two = addSheet(freshBoard('시트'), '시트');
    const userId = testSession(['platform:view']).user.id;
    localStorage.setItem(`platform:board:v2:${userId}`, JSON.stringify({ ...two, activeSheetId: two.sheets[1].id }));
    window.history.replaceState(null, '', '/board?sheet=unknown');
    const pushed = vi.spyOn(window.history, 'pushState');
    render(provide(<RouteOutlet />));
    await settle();
    expect(window.location.search).toBe(`?sheet=${two.sheets[1].id}`);
    expect(pushed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: '시트 1' }));
    await settle();
    expect(window.location.search).toBe(`?sheet=${two.sheets[0].id}`);
    expect(JSON.parse(localStorage.getItem(`platform:board:v2:${userId}`)!).activeSheetId).toBe(two.sheets[0].id);
  });
});

describe('분석 보드에 열기… with the board mounted (893b, issue §4.3)', () => {
  it('a sheet added from the dialog survives a later edit made on the open board', async () => {
    let edit: ((name: string) => void) | null = null;
    function Probe() {
      const { user } = useHostPlatform();
      const { board, update } = useBoardSession(user.id, '시트');
      edit = name => update(b => ({ ...b, sheets: b.sheets.map((s, i) => (i === 0 ? { ...s, name } : s)) }));
      return <p data-testid="names">{board.sheets.map(s => s.name).join(',')}</p>;
    }
    window.history.replaceState(null, '', '/alpha');
    render(provide(<><RouteOutlet /><Probe /></>, <OpenInBoardAction />));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '분석 보드에 열기…' }));
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: '열기' }));
    await settle();
    expect(screen.getByTestId('names')).toHaveTextContent('시트 1,시트 2');
    act(() => { edit!('renamed'); });
    expect(screen.getByTestId('names')).toHaveTextContent('renamed,시트 2');
    const userId = testSession(['platform:view']).user.id;
    expect(JSON.parse(localStorage.getItem(`platform:board:v2:${userId}`)!).sheets.map((s: { name: string }) => s.name)).toEqual(['renamed', '시트 2']);
  });
});

describe('BoardSurface against a stale copy (#2019)', () => {
  it('adding a sheet after another tab saved without its storage event keeps the other tab\'s sheet', async () => {
    const userId = testSession(['platform:view']).user.id;
    const key = `platform:board:v2:${userId}`;
    render(provide(<BoardSurface sheetId="" onSheetChange={() => {}} arrivalKey="x" Outlet={Outlet} />));
    await settle();
    const theirs = addSheet(JSON.parse(localStorage.getItem(key) ?? JSON.stringify(freshBoard('시트'))), '시트');
    localStorage.setItem(key, JSON.stringify(theirs));
    fireEvent.click(screen.getByRole('button', { name: '시트 추가' }));
    await settle();
    const stored = JSON.parse(localStorage.getItem(key)!) as { sheets: { id: string }[] };
    expect(stored.sheets).toHaveLength(3);
    expect(stored.sheets.map(s => s.id)).toContain(theirs.sheets[1].id);
  });
});

it.each([false, true])('ignores an unmounted pane writer after clear (and close: %s) (#2065)', async close => {
  const start = freshBoard('시트');
  const id = start.sheets[0].id;
  const shot = { menuId: 'alpha', params: {}, query: '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00' };
  const seeded = setPane(setPane(setLayout(start, id, '1x2'), id, 0, shot), id, 1, shot);
  const userId = testSession(['platform:view']).user.id;
  const key = `platform:board:v2:${userId}`;
  localStorage.setItem(key, JSON.stringify(seeded));
  const writers: (() => void)[] = [];
  function WritingOutlet() {
    const { setGlobal } = usePlatform();
    writers.push(() => setGlobal({ from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00' }));
    return <p>writer</p>;
  }
  let change: (fn: (board: Board) => Board) => void = () => { throw new Error('Probe not mounted'); };
  function Probe() {
    const { update } = useBoardSession(userId, '시트');
    change = update;
    return null;
  }
  render(provide(<><BoardSurface sheetId={id} onSheetChange={() => {}} arrivalKey="x" Outlet={WritingOutlet} /><Probe /></>));
  await settle();
  expect(writers.length).toBeGreaterThan(0);
  const late = writers[0];
  act(() => change(board => {
    const cleared = setPane(board, id, 0, null);
    return close ? closePane(cleared, id, 0)!.board : cleared;
  }));
  const before = JSON.parse(localStorage.getItem(key)!);
  act(() => late());
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(before);
});
