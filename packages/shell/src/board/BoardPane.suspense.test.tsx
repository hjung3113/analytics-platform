import { lazy, type ComponentType } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { RouteOutlet } from '../RouteOutlet';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed } from './__fixtures__/legacyBoard';
// RouteOutlet loads the board lazily (#821); evaluate it up front so the board itself is not what suspends.
import './BoardHost';

// #915: a pane whose menu screen is a lazy chunk still loading shows its own skeleton. Without the pane's own boundary it suspended to the
// board's outer boundary, covering every pane (and, in the dock, the tab strips) with the page skeleton and waiting out React's fallback
// throttle once more.
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
// `over` is loose like the other board suites': a test menu component is a plain function, not the lazy type a manifest declares.
const entry = (id: string, path: string, over: Record<string, unknown>) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: [], contextResetKeys: [], ...over,
});
function Ready() {
  return <PlatformPage><p>ready pane</p></PlatformPage>;
}
// A chunk that never arrives during the test.
const Loading = lazy(() => new Promise<{ default: ComponentType }>(() => {}));
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'ready' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [{ ...entry('ready', '/ready', { component: Ready }), primary: true }, entry('loading', '/loading', { component: Loading })],
});
const period = 'from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('a board pane whose screen is still loading (#915)', () => {
  it('shows the skeleton in that pane only and keeps the other panes drawn', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [
      { menuId: 'ready', params: {}, query: `?${period}` },
      { menuId: 'loading', params: {}, query: `?${period}` },
    ] })]));
    window.history.replaceState(null, '', '/board?sheet=a');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);

    expect(await screen.findByText('ready pane')).toBeInTheDocument();
    const loadingPane = screen.getByRole('group', { name: '칸 2' });
    expect(within(loadingPane).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(within(screen.getByRole('group', { name: '칸 1' })).queryByRole('status')).toBeNull();
  });
});
