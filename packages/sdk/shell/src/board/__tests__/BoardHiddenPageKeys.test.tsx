import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { groupId, spaceId } from '@ap/contracts';
import { AppShell } from '../../frame/AppShell';
import { RouteOutlet } from '../../routing/RouteOutlet';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import '../BoardHost';
import { BOARD_LAYOUT_ENGINE_KEY } from '../layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, storedLegacy as stored } from '../__fixtures__/legacyBoard';
import { OpenInBoardAction } from '../OpenInBoardAction';
import { resetBoardPresentationForTests } from '../boardPresentation';

/** Hidden page keys (ADR-0105) on the board (#2062): the pane and the return path keep them; the address bar never shows them. */
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
/** Shows the page state the screen reads, hidden pairs included. */
function Page() {
  const { pageParams, paneId } = useHostPlatform();
  return <PlatformPage><p data-testid={`filter-${paneId ?? 'main'}`}>{pageParams('filter').join(',')}</p></PlatformPage>;
}
const base = (id: string, path: string, over: Record<string, unknown>) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features, pageKeys: ['tab', 'filter'], ...over,
});
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => base(id, path, { component: Page, hiddenPageKeys: ['filter'], ...over });
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...entry('home', '/', { features: { ...features, board: false }, pageKeys: [], hiddenPageKeys: [] }), primary: true },
    entry('alpha', '/alpha', { label: { ko: '알파', en: 'Alpha' } }),
    entry('secret', '/secret', { navHidden: true, label: { ko: '숨김', en: 'Secret' } }),
  ],
});

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
function mount(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={{ boardEntry: <OpenInBoardAction /> }}>
    <AppShell><RouteOutlet /></AppShell>
  </PlatformProvider></I18nProvider>);
}
const mainFilter = () => screen.getByTestId('filter-main').textContent;

beforeEach(() => {
  resetBoardPresentationForTests();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('board and hidden page keys (#2062, ADR-0105)', () => {
  it('분석 보드에 열기…: the pane query holds the hidden pair and not the detail expansion', async () => {
    seed(boardOf([sheet('a')]));
    mount('/mars/alpha?tab=x&filter=a&expand=1');
    await settle();
    expect(window.location.search).not.toContain('filter');
    expect(window.location.search).toContain('expand=1');
    expect(mainFilter()).toBe('a');
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '분석 보드에 열기…' }));
    await settle();
    const dialog = await screen.findByRole('dialog', { name: '분석 보드에 열기' });
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    const pane = stored().sheets[1].panes[0];
    expect(pane).toMatchObject({ menuId: 'alpha', params: {} });
    expect(new URLSearchParams(pane!.query).getAll('filter')).toEqual(['a']);
    expect(new URLSearchParams(pane!.query).get('tab')).toBe('x');
    expect(new URLSearchParams(pane!.query).has('expand')).toBe(false);
  });

  it('open the board, then 최소화: the screen comes back with its hidden pair, and the address still has none', async () => {
    seed(boardOf([sheet('a')]));
    mount('/mars/alpha?tab=x&filter=a');
    await settle();
    expect(mainFilter()).toBe('a');
    const before = window.location.pathname + window.location.search;
    fireEvent.click(screen.getByRole('button', { name: '분석 보드' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    fireEvent.click(await screen.findByRole('button', { name: '최소화' }));
    await settle();
    expect(window.location.pathname + window.location.search).toBe(before);
    expect(window.location.search).not.toContain('filter');
    expect(mainFilter()).toBe('a');
  });

  it('a visible address safeReturnTo refuses is never gone back to, even when its hidden pair is harmless', async () => {
    seed(boardOf([sheet('a')]));
    mount('/mars/secret?tab=x&filter=a');
    await settle();
    expect(window.location.pathname).toBe('/mars/secret');
    expect(mainFilter()).toBe('a');
    fireEvent.click(screen.getByRole('button', { name: '분석 보드' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    fireEvent.click(await screen.findByRole('button', { name: '최소화' }));
    await settle();
    expect(window.location.pathname).not.toBe('/mars/secret');
    expect(window.location.search).not.toContain('filter');
  });
});
