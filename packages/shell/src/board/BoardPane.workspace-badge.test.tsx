import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PanelWorkspace, PlatformPage, type PanelWorkspaceLayout } from '@ap/components';
import { RouteOutlet } from '../RouteOutlet';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed } from './__fixtures__/legacyBoard';
import { groupId, spaceId } from '@ap/contracts';

// jsdom has no ResizeObserver and no geometry: every observed element reports the shared size.
function installResizeObserver() {
  class FakeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const rect = { width: 900, height: 600, top: 0, left: 0, right: 900, bottom: 600, x: 0, y: 0 };
      this.callback([{ target, contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  const previous = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
  return () => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previous; };
}
let restore = () => {};
beforeAll(() => { restore = installResizeObserver(); });
afterAll(() => { restore(); });

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
const group = (panels: string[], active?: string): PanelWorkspaceLayout => ({ type: 'group', panels, active });
const PRESETS = [
  { id: 'balanced', label: { ko: '기본', en: 'Balanced' }, layout: { type: 'branch' as const, dir: 'row' as const, sizes: [6, 4], children: [group(['main']), group(['side'])] } },
  { id: 'focus', label: { ko: '집중', en: 'Focus' }, layout: group(['main', 'side']) },
];
function Workspace() {
  return <PlatformPage>
    <PanelWorkspace persistKey="ws" label={{ ko: '작업 영역', en: 'Workspace' }} initialPreset="balanced" presets={PRESETS}
      panels={[{ id: 'main', title: { ko: '본문', en: 'Main' }, primary: true, render: () => <p>main panel</p> },
        { id: 'side', title: { ko: '곁', en: 'Side' }, render: () => <p>side panel</p>, badge: { count: 2, description: { ko: '행 2개 추가됨', en: '2 rows added' } } }]} />
  </PlatformPage>;
}
function Plain() { return <PlatformPage><p>plain body</p></PlatformPage>; }
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: ['tab'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('analytics') }],
  menus: [
    { ...entry('home', '/', { component: Plain, features: { ...features, board: false } }), primary: true },
    entry('ws', '/ws', { component: Workspace, label: { ko: '작업', en: 'Work' } }),
    entry('beta', '/beta', { component: Plain, label: { ko: '베타', en: 'Beta' } }),
  ],
});
const pane = (menuId: string) => ({ menuId, params: {}, query: '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00' });

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const openMenu = (trigger: HTMLElement) => { act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); }); };
function mount() {
  window.history.replaceState(null, '', '/board?sheet=a');
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);
}
const ready = async () => {
  // The board's lazy dock engine and the pane menu load on first render; ~0.85 s locally, over the 1 s default under CI load (PR #738).
  await waitFor(() => { expect(screen.getAllByRole('button', { name: /^칸 \d 동작$/ }).length).toBeGreaterThan(0); }, { timeout: 8000 });
  await settle();
};
const openActions = async (n: number) => { openMenu(screen.getAllByRole('button', { name: `칸 ${n} 동작` })[0]!); await settle(); };

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'dock');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });


describe('board pane menu carries a hidden panel badge', () => {
  it('lists 다시 보기 with the badge description of the hidden panel', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('ws'), pane('beta')] })]));
    mount();
    await ready();
    await screen.findByRole('tab', { name: '곁' });
    // The engine rebuilds tabs in a reconcile; the description is set again a render after the tab can be found (DockTab.a11y.test.tsx, #777); the tab is looked up again because a reconcile replaces it.
    await waitFor(() => { expect(screen.getByRole('tab', { name: '곁' })).toHaveAttribute('aria-description', '행 2개 추가됨'); });
    openMenu(await screen.findByRole('button', { name: '곁 동작' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '숨기기' }));
    await settle();
    await openActions(1);
    const item = await screen.findByRole('menuitem', { name: /곁 다시 보기/ });
    expect(item).toHaveTextContent('행 2개 추가됨');
  });
});
