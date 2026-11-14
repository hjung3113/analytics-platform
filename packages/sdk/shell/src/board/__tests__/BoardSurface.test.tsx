import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { DetailPanelFullscreenContext } from '@ap/ui';
import { groupId, spaceId } from '@ap/contracts';
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
    { id: 'home', group: groupId('equipment'), label: { ko: 'home', en: 'home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features: { ...features, board: false }, pageKeys: [], ...({ component: Page } as Record<string, unknown>), primary: true },
    { id: 'alpha', group: groupId('equipment'), label: { ko: '알파', en: 'Alpha' }, description: { ko: '', en: '' }, path: '/alpha', icon: House, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features, pageKeys: [], ...({ component: Page } as Record<string, unknown>) },
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
