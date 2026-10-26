import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { groupId, spaceId } from '@ap/contracts';
import { BoardSurface } from './BoardSurface';
import { addSheet, freshBoard } from './boardModel';

import { OpenInBoardAction } from './OpenInBoardAction';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { RouteOutlet } from '../RouteOutlet';
import { useBoardSession } from './boardSession';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const Page = () => <PlatformPage><p>page body</p></PlatformPage>;
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('analytics') }],
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
