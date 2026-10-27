import { lazy, useEffect, useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { groupId, spaceId } from '@ap/contracts';
import { AppShell } from '../AppShell';
import { RouteOutlet } from '../RouteOutlet';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import './BoardHost';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed } from './__fixtures__/legacyBoard';
import { resetBoardPresentationForTests } from './boardPresentation';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const, scope: 'apply' as const };
const mounts = { count: 0, unmounts: 0, layout: 0, layoutCleanups: 0 };
/** The pane's menu: counts how many times its screen is mounted, so a remount of a hidden pane shows. */
function Counted() {
  useEffect(() => { mounts.count += 1; return () => { mounts.unmounts += 1; }; }, []);
  // A hidden Suspense sibling re-runs layout effects (not passive ones): this is what disposes an ECharts instance.
  useLayoutEffect(() => { mounts.layout += 1; return () => { mounts.layoutCleanups += 1; }; }, []);
  return <PlatformPage><button type="button">pane control</button></PlatformPage>;
}
const Plain = () => <PlatformPage><p>plain</p></PlatformPage>;
let releaseLazy: () => void = () => {};
const LazyPlain = lazy(() => new Promise<{ default: typeof Plain }>(resolve => { releaseLazy = () => resolve({ default: Plain }); }));
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...entry('home', '/', { component: Plain, features: { ...features, board: false } }), primary: true },
    entry('counted', '/counted', { component: Counted, requiresScope: true, label: { ko: '집계', en: 'Counted' } }),
    entry('lazy', '/lazy', { component: LazyPlain, requiresScope: true, label: { ko: '지연', en: 'Lazy' } }),
    entry('beta', '/beta', { component: Plain, requiresScope: true, label: { ko: '베타', en: 'Beta' } }),
  ],
});

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
function Nav() {
  const { navigate } = useHostPlatform();
  return <nav aria-label="test nav">
    <button type="button" onClick={() => navigate('/?v=1')}>go plain</button>
    <button type="button" onClick={() => navigate('/lazy?v=1&scopeId=MEM')}>go lazy</button>
    <button type="button" onClick={() => navigate('/beta?v=1&scopeId=MEM')}>go scoped</button>
  </nav>;
}
function mount(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
    <Nav /><AppShell><RouteOutlet /></AppShell>
  </PlatformProvider></I18nProvider>);
}
const rail = (name: string) => screen.getByRole('button', { name });
const chip = () => screen.getByRole('button', { name: /^분석 보드 · / });

beforeEach(() => {
  mounts.count = 0; mounts.unmounts = 0; mounts.layout = 0; mounts.layoutCleanups = 0;
  resetBoardPresentationForTests();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('board host: a pane screen survives minimizing by any path (893c, issue §2)', () => {
  it.each([['go scoped'], ['go plain']])('UX-1: %s and back keeps the same pane screen instance', async label => {
    seed(boardOf([sheet('a', { panes: [{ menuId: 'counted', params: {}, query: '?scopeId=MEM' }] })]));
    mount('/beta?scopeId=MEM');
    await settle();
    fireEvent.click(rail('분석 보드'));
    await settle();
    const control = await screen.findByRole('button', { name: 'pane control' });
    expect(mounts.count).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await settle();
    fireEvent.click(chip());
    await settle();
    expect(screen.getByRole('button', { name: 'pane control' })).toBe(control);
    expect(mounts).toEqual({ count: 1, unmounts: 0, layout: 1, layoutCleanups: 0 });
  });

  it('UX-1: a suspending lazy ordinary screen does not hide the minimized board (own Suspense boundary)', async () => {
    seed(boardOf([sheet('a', { panes: [{ menuId: 'counted', params: {}, query: '?scopeId=MEM' }] })]));
    mount('/beta?scopeId=MEM');
    await settle();
    fireEvent.click(rail('분석 보드'));
    await settle();
    const control = await screen.findByRole('button', { name: 'pane control' });
    fireEvent.click(screen.getByRole('button', { name: 'go lazy' }));
    await settle();
    // Suspended: the lazy page has not resolved, and the board's layout effects have not been cleaned up.
    expect(screen.queryByText('plain')).toBeNull();
    expect(mounts).toMatchObject({ layout: 1, layoutCleanups: 0 });
    await act(async () => { releaseLazy(); await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(screen.getByText('plain')).toBeTruthy();
    fireEvent.click(chip());
    await settle();
    expect(screen.getByRole('button', { name: 'pane control' })).toBe(control);
    expect(mounts).toEqual({ count: 1, unmounts: 0, layout: 1, layoutCleanups: 0 });
  });
});
