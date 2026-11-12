import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../../frame/AppShell';
import { AppSidebar } from '../../frame/AppSidebar';
import { RouteOutlet } from '../../routing/RouteOutlet';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import '../BoardHost';
import { BOARD_LAYOUT_ENGINE_KEY } from '../layoutEngine';
import { loadBoard } from '../boardStore';
import { screens } from '../boardModel';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, v2Board, V1_KEY as KEY, V2_KEY } from '../__fixtures__/legacyBoard';

// #1702 (host-entry-contract §7): stored items of a menu the registry no longer lists are kept and never throw. The board
// loads a stored cell of an absent menu and shows it in its unregistered state (`더는 보드에서 열 수 없는 화면`) without
// writing anything back; the sidebar hides a stored recent visit of an absent menu instead of throwing on `menuById`.

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: ['tab'], ...over,
});
// No menu `ghost` exists anywhere in this registry.
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...entry('home', '/', { features: { ...features, board: false } }), primary: true },
    entry('alpha', '/alpha', { label: { ko: '알파', en: 'Alpha' } }),
  ],
});
/** A stored cell whose menu the registry does not list. */
const ghost = { menuId: 'ghost', params: {}, query: '' };

function mount(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
}
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
  // These suites pin the grid renderer, which stays the fallback (the default is the dock since ADR-0067 2c).
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('a stored board cell of a menu missing from the registry (#1702)', () => {
  it('loadBoard returns the cell and writes nothing', () => {
    const stored = v2Board(boardOf([sheet('a', { panes: [ghost] })]));
    const raw = JSON.stringify(stored);
    const storage = memoryStorage();
    storage.setItem(V2_KEY, raw);
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(screens(loaded.board.sheets[0]!)).toEqual([ghost]);
    expect(loaded.notice).toBe(null);
    expect(loaded.readOnly).toBe(false);
    // Reading the stored value back: byte-identical, and no other key appeared.
    expect(storage.getItem(V2_KEY)).toBe(raw);
    expect(storage.length).toBe(1);
  });

  it('renders the unregistered state without throwing and keeps the stored value byte-identical', async () => {
    const board = boardOf([sheet('a', { panes: [ghost] })]);
    seed(board);
    const raw = localStorage.getItem(KEY);
    mount('/board?sheet=a');
    await settle();
    const pane = screen.getByRole('group', { name: '칸 1' });
    expect(within(pane).getByText('더는 보드에서 열 수 없는 화면')).toBeInTheDocument();
    expect(within(pane).getAllByRole('button', { name: '비우기' })).toHaveLength(1);
    // A load writes nothing: the stored value is byte-identical and no V2 key appeared.
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(localStorage.getItem(V2_KEY)).toBe(null);
  });

  it('the sidebar hides a stored recent visit of the missing menu without throwing', async () => {
    localStorage.setItem('platform:recent:u1', JSON.stringify([{ menuId: 'ghost', url: '/ghost', at: 1 }, { menuId: 'alpha', url: '/alpha', at: 2 }]));
    window.history.replaceState(null, '', '/alpha');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><AppSidebar collapsed={false} onToggle={() => {}} /></PlatformProvider></I18nProvider>);
    const recents = await waitFor(() => screen.getByRole('region', { name: '최근 방문' }));
    expect(within(recents).getAllByRole('link')).toHaveLength(1);
    expect(within(recents).getByRole('link', { name: '최근 방문: 알파' })).toBeInTheDocument();
    expect(screen.queryByText(/ghost/)).toBeNull();
  });
});
