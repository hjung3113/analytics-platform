import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PanelWorkspace, PlatformPage, type PanelWorkspaceLayout } from '@ap/components';
import { RouteOutlet } from '../../routing/RouteOutlet';
import { BOARD_LAYOUT_ENGINE_KEY } from '../layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed } from '../__fixtures__/legacyBoard';
import { groupId, spaceId } from '@ap/contracts';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import '../BoardHost';

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
      panels={[{ id: 'main', title: { ko: '본문', en: 'Main' }, primary: true, render: () => <p>main panel</p> }, { id: 'side', title: { ko: '곁', en: 'Side' }, render: () => <p>side panel</p> }]} />
  </PlatformPage>;
}
function Plain() { return <PlatformPage><p>plain body</p></PlatformPage>; }
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: ['tab'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
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
const openActions = async (n: number) => { openMenu(screen.getAllByRole('button', { name: `칸 ${n} 동작` })[0]); await settle(); };

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'dock');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('board pane hosts menu workspace commands (ADR-0067 decision 3)', () => {
  it('a workspace in the pane draws no toolbar and lists its presets as radios, then 기본 배치, in the pane menu', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('ws'), pane('beta')] })]));
    mount();
    await ready();
    expect(await screen.findByText('main panel')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await openActions(1);
    const radios = await screen.findAllByRole('menuitemradio');
    // Two groups, one checked item in each: the presets, then the height mode.
    expect(radios.map(radio => radio.textContent)).toEqual(['기본', '집중', '화면 맞춤', '아래로 쌓기']);
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true', 'false']);
    expect(screen.getAllByRole('group').length).toBeGreaterThanOrEqual(2);
    const items = screen.getAllByRole('menuitem').map(item => item.textContent);
    expect(items).toContain('기본 배치');
    expect(items.indexOf('기본 배치')).toBeGreaterThan(items.indexOf('비우기'));
    // The group is named by a label that is not an item and sits above the presets.
    const label = screen.getByText('화면 배치');
    expect(label.closest('[role="menuitem"], [role="menuitemradio"]')).toBeNull();
    expect(label.compareDocumentPosition(radios[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the height-mode group with a visible label of its own; the preset group keeps 화면 배치', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('ws'), pane('beta')] })]));
    mount();
    await ready();
    await openActions(1);
    const radios = await screen.findAllByRole('menuitemradio');
    const mode = radios[2]!.closest('[role="group"]')!;
    const label = screen.getByText('높이 방식');
    expect(label.closest('[role="menuitem"], [role="menuitemradio"]')).toBeNull();
    expect(mode).toHaveAttribute('aria-labelledby', label.id);
    expect(mode).toHaveAccessibleName('높이 방식');
    expect(label.compareDocumentPosition(radios[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label.compareDocumentPosition(radios[1]!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByText('화면 배치')).toBeInTheDocument();
  });

  it('choosing a preset item runs the workspace command', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('ws'), pane('beta')] })]));
    mount();
    await ready();
    await openActions(1);
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '집중' }));
    await settle();
    await openActions(1);
    expect(await screen.findByRole('menuitemradio', { name: '집중' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: '기본' })).toHaveAttribute('aria-checked', 'false');
  });

  it('choosing the height mode changes only the mode group, and the preset keeps its selection', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('ws'), pane('beta')] })]));
    mount();
    await ready();
    await openActions(1);
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '아래로 쌓기' }));
    await settle();
    await openActions(1);
    expect(await screen.findByRole('menuitemradio', { name: '아래로 쌓기' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: '화면 맞춤' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: '기본' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: '집중' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a pane without a workspace keeps its menu unchanged', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane('ws'), pane('beta')] })]));
    mount();
    await ready();
    await openActions(2);
    await screen.findAllByRole('menuitem');
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
    expect(screen.queryByRole('menuitem', { name: '기본 배치' })).toBeNull();
  });
});
