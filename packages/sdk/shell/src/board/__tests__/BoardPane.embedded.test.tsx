import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformDataTable, PlatformPage } from '@ap/components';
import { RouteOutlet } from '../../routing/RouteOutlet';
import { BOARD_LAYOUT_ENGINE_KEY } from '../layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed } from '../__fixtures__/legacyBoard';
// RouteOutlet loads the board lazily (#821); evaluate it up front so the board itself is not what suspends.
import '../BoardHost';

// #1166: the pane owns the border, so a table inside draws none of its own at the page default density (compact since #1217), with its title still visible.
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
const entry = (id: string, path: string, over: Record<string, unknown>) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: [], contextResetKeys: [], ...over,
});
const loadPage = async () => ({ outcome: 'ok' as const, data: { rows: [{ id: 'r1' }], total: 1 }, assessments: [], trust: null, correlationId: 'c' });
function Screen() {
  return <PlatformPage><PlatformDataTable title="Pane table" ariaLabel="pane-table" columns={[{ id: 'id', header: 'ID', sortable: false }]} getRowId={r => r.id} loadPage={loadPage} filterKey="f" preferenceKey="pane-table" /></PlatformPage>;
}
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'table' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [{ ...entry('table', '/table', { component: Screen }), primary: true }],
});
const period = 'from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('a table inside a board pane (#1166)', () => {
  it('draws no border of its own at the default density and keeps its visible title', async () => {
    seed(boardOf([sheet('a', { layout: '1x1', panes: [{ menuId: 'table', params: {}, query: `?${period}` }] })]));
    window.history.replaceState(null, '', '/board?sheet=a');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);
    const section = (await screen.findByRole('table', { name: 'pane-table' })).closest('section')!;
    expect(section).toHaveClass('border-0', 'rounded-none');
    expect(screen.getByRole('heading', { name: 'Pane table' }).classList.contains('sr-only')).toBe(false);
  });
});
