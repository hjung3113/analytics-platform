import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useMenuQuery, usePlatform } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { RouteOutlet } from '../RouteOutlet';
import { addPane, freshBoard, parseBoardV2, setPane, setTree, type Board, type LayoutNode } from './boardModel';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, V2_KEY } from './__fixtures__/legacyBoard';

// jsdom has no ResizeObserver and no geometry: every observed element reports the shared size, and `resize` re-reports it.
function installResizeObserver() {
  const size = { width: 900, height: 600 };
  const observers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>();
  const report = (observer: { callback: ResizeObserverCallback }, target: Element) => {
    const rect = { width: size.width, height: size.height, top: 0, left: 0, right: size.width, bottom: size.height, x: 0, y: 0 };
    observer.callback([{ target, contentRect: rect } as ResizeObserverEntry], observer as unknown as ResizeObserver);
  };
  class FakeResizeObserver {
    private entry = { callback: undefined as unknown as ResizeObserverCallback, targets: new Set<Element>() };
    constructor(callback: ResizeObserverCallback) { this.entry.callback = callback; observers.add(this.entry); }
    observe(target: Element) { this.entry.targets.add(target); report(this.entry, target); }
    unobserve(target: Element) { this.entry.targets.delete(target); }
    disconnect() { this.entry.targets.clear(); observers.delete(this.entry); }
  }
  const previous = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
  return {
    resize(width: number, height = size.height) {
      size.width = width; size.height = height;
      act(() => { observers.forEach(observer => { observer.targets.forEach(target => { report(observer, target); }); }); });
    },
    restore() { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previous; },
  };
}
const observer = installResizeObserver();
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
const endpoint = defineEndpoint<{ page: number }, { text: string }>({
  id: 'dock.rows', menuId: 'alpha', paramKeys: { page: true }, permission: 'console:access', requiresScope: false, context: { time: 'apply' }, kinds: ['collection'], mergeTimeDomain: false,
});
let queries = 0;
function Rows() {
  const query = useMenuQuery(endpoint, { page: 1 });
  return <PlatformPage><p data-testid="rows">{query.response?.data?.text ?? query.status}</p></PlatformPage>;
}
function Plain() {
  const { paneId } = usePlatform();
  return <PlatformPage><p data-testid="pane">{paneId ?? 'main'}</p></PlatformPage>;
}
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: 'equipment' as const, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: ['tab'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: 'equipment', label: { ko: '그룹', en: 'Group' }, icon: House, space: 'analytics' }],
  menus: [
    { ...entry('home', '/', { component: Plain, features: { ...features, board: false } }), primary: true },
    entry('alpha', '/alpha', { component: Rows, label: { ko: '알파', en: 'Alpha' }, permission: 'console:access' }),
    entry('beta', '/beta', { component: Plain, label: { ko: '베타', en: 'Beta' } }),
  ],
});

const alpha = (query = '') => ({ menuId: 'alpha', params: {}, query });
const beta = (query = '') => ({ menuId: 'beta', params: {}, query });
const w1 = '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
const w2 = '?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00';

let session: Session;
const listeners = new Set<() => void>();
const menuQuery = vi.fn(async () => {
  queries += 1;
  return { outcome: 'ok' as const, data: { text: `ROW-${queries}` }, assessments: [{ kind: 'collection' as const, state: 'clear' as const }], trust: null, correlationId: `c${queries}` };
});
function mount(url = '/board', permissions: Session['user']['permissions'] = ['platform:view', 'console:access'], adapterOver: Partial<PlatformAdapter> = {}) {
  window.history.replaceState(null, '', url);
  session = testSession(permissions);
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; }, menuQuery: menuQuery as unknown as PlatformAdapter['menuQuery'], ...adapterOver });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);
}
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const openMenu = (trigger: HTMLElement) => { act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); }); };

// The engine positions its content overlays a frame after mounting; until then the visible panels are still `visibility: hidden`.
const ready = async () => {
  await waitFor(() => { expect(paneTabs().length).toBeGreaterThan(0); });
  await waitFor(() => {
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-dock-visible="true"]'));
    expect(visible.length).toBeGreaterThan(0);
    visible.forEach(element => { expect(element.closest<HTMLElement>('.dv-render-overlay')?.style.visibility).not.toBe('hidden'); });
  });
  await settle();
};
const paneTabs = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]'));
// A tab is named by the engine (`칸 n · 메뉴명`); its content is the badge, the name and the X.
const tabLabels = () => paneTabs().map(tab => tab.getAttribute('aria-label'));
const tabOf = (label: string) => paneTabs().find(tab => tab.getAttribute('aria-label') === label)!;
const badgeOf = (label: string) => tabOf(label).querySelector('[data-pane-badge]')!;
const paneRoot = (n: number) => document.querySelector<HTMLElement>(`[data-pane-index="${n - 1}"]`)!;
// The head of the pane that is its group's active tab sits in that group's strip: one `칸 N 동작` menu with the content and the layout actions.
const paneMenu = (n: number) => screen.getAllByRole('button', { name: `칸 ${n} 동작` })[0];
const chooseGroupItem = async (n: number, item: string) => {
  openMenu(paneMenu(n));
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
  await settle();
};
const v2 = (): Board => parseBoardV2(JSON.parse(localStorage.getItem(V2_KEY)!))!;
const tree = (): LayoutNode => v2().sheets[0].tree;
const seedV2 = (board: Board) => { localStorage.setItem(V2_KEY, JSON.stringify(board)); };
const group = (panes: string[], active = panes[0]!): LayoutNode => ({ type: 'group', panes, active });

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'dock');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  queries = 0;
  menuQuery.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); listeners.clear(); window.history.replaceState(null, '', '/'); });

describe('dock renderer: tabs, selection and the Context bar', () => {
  it('names every tab `칸 n · 메뉴명` (`빈 칸` when empty) and the header has 칸 추가 and 기본 배치 but no layout toggle or 크기 초기화', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), null] })]));
    mount('/board?sheet=a');
    await ready();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 빈 칸']);
    expect(screen.getByRole('button', { name: '칸 추가' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '기본 배치' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /레이아웃/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '크기 초기화' })).toBeNull();
  });

  it('shows the Context bar of the selected pane, and a click on a background tab selects that pane and makes it its group\'s active tab', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    expect(screen.getByRole('region', { name: '칸 1 · 분석 Context' })).toBeInTheDocument();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    expect(tabLabels()).toEqual(['칸 2 · 베타', '칸 1 · 알파']);
    expect(tabOf('칸 1 · 알파')).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(tabOf('칸 2 · 베타'));
    await settle();
    expect(screen.getByRole('region', { name: '칸 2 · 분석 Context' })).toBeInTheDocument();
    expect(tabOf('칸 2 · 베타')).toHaveAttribute('aria-selected', 'true');
    expect(tabOf('칸 1 · 알파')).toHaveAttribute('aria-selected', 'false');
    const [p1, p2] = v2().sheets[0].panes;
    expect(tree()).toEqual(group([p2.id, p1.id], p2.id));
  });

  it('fills the selected pane\'s tab badge like the Context bar\'s (no dot), and keeps the numbers after a move', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    expect(badgeOf('칸 1 · 알파')).toHaveAttribute('data-selected', 'true');
    expect(badgeOf('칸 2 · 베타')).toHaveAttribute('data-selected', 'false');
    expect(document.querySelector('[data-pane-tab-mark]')).toBeNull();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    expect(tabLabels().sort()).toEqual(['칸 1 · 알파', '칸 2 · 베타']);
    expect(paneRoot(1)).toHaveAttribute('data-pane-index', '0');
    // Only the pane that is its group's active tab draws a head; the one in the background has none until it is in front.
    expect(document.querySelector('[data-pane-head-slot]')).toHaveAttribute('data-pane-head-slot', v2().sheets[0].panes[0].id);
    expect(screen.queryAllByRole('button', { name: '칸 2 동작' })).toHaveLength(0);
  });

  it('gives every pane the Kernel id `<sheet>.<slot id>`, unchanged by a move', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), alpha(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    const before = [1, 2].map(n => paneRoot(n).dataset.paneId);
    expect(before.every(id => /^a\.p\w+$/.test(id ?? ''))).toBe(true);
    expect(before[0]).not.toBe(before[1]);
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    expect([1, 2].map(n => paneRoot(n).dataset.paneId)).toEqual(before);
    expect(v2().sheets[0].panes.map(p => `a.${p.id}`)).toEqual(before);
  });
});

describe('dock renderer: Delete = 비우기, X, 칸 추가, 칸 닫기, 복제', () => {
  it('Delete on a content tab empties the pane, raises the undo toast, and 실행 취소 restores it; the engine closes nothing', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    tabOf('칸 2 · 베타').focus();
    await userEvent.keyboard('{Delete}');
    await settle();
    expect(await screen.findByText('칸 2을 비웠습니다')).toBeInTheDocument();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 빈 칸']);
    expect(v2().sheets[0].panes[1].screen).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 베타']);
    expect(v2().sheets[0].panes[1].screen).toEqual(beta(w2));
  });

  it('Delete on an empty tab does nothing', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), null] })]));
    mount('/board?sheet=a');
    await ready();
    tabOf('칸 2 · 빈 칸').focus();
    await userEvent.keyboard('{Delete}');
    await userEvent.keyboard('{Backspace}');
    await settle();
    expect(screen.queryByText(/비웠습니다/)).toBeNull();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 빈 칸']);
    expect(localStorage.getItem(V2_KEY)).toBeNull();
  });

  it('the tab\'s X is shown only for a pane with content and does the same as 비우기', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), null] })]));
    mount('/board?sheet=a');
    await ready();
    expect(screen.queryByRole('button', { name: '칸 2 비우기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '칸 1 비우기' }));
    await settle();
    expect(await screen.findByText('칸 1을 비웠습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '칸 1 비우기' })).toBeNull();
    expect(tabLabels()).toEqual(['칸 1 · 빈 칸', '칸 2 · 빈 칸']);
  });

  it('칸 추가 adds pane 3 on a 2-pane sheet and is disabled with its reason at 4 panes', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '칸 추가' }));
    await waitFor(() => { expect(tabLabels()).toHaveLength(3); });
    expect(tabLabels()).toContain('칸 3 · 빈 칸');
    expect(v2().sheets[0].panes).toHaveLength(3);
    expect(v2().sheets[0].selectedPaneId).toBe(v2().sheets[0].panes[2].id);
    fireEvent.click(screen.getByRole('button', { name: '칸 추가' }));
    await waitFor(() => { expect(tabLabels()).toHaveLength(4); });
    const add = screen.getByRole('button', { name: '칸 추가' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('칸은 시트당 4개까지입니다.');
  });

  it('칸 닫기 on the empty pane 2 of 3 renumbers pane 3 to 2 without re-querying, and 실행 취소 puts it back', async () => {
    let board = freshBoard('시트');
    const id = board.sheets[0].id;
    board = addPane(addPane(board, id), id);
    board = setPane(setPane(setPane(board, id, 0, alpha(w1)), id, 1, null), id, 2, alpha(w2));
    seedV2(board);
    mount(`/board?sheet=${id}`);
    await ready();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 빈 칸', '칸 3 · 알파']);
    const calls = menuQuery.mock.calls.length;
    openMenu(paneMenu(2));
    fireEvent.click(await screen.findByRole('menuitem', { name: '칸 2 닫기' }));
    await settle();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 알파']);
    expect(await screen.findByText('칸 2를 닫았습니다. 칸 3은 칸 2가 됩니다.')).toBeInTheDocument();
    expect(v2().sheets[0].panes.map(p => p.screen?.query)).toEqual([w1, w2]);
    expect(menuQuery.mock.calls.length).toBe(calls);
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 빈 칸', '칸 3 · 알파']);
    expect(v2().sheets[0].panes.map(p => p.screen?.query ?? null)).toEqual([w1, null, w2]);
    expect(menuQuery.mock.calls.length).toBe(calls);
  });

  it('offers 칸 닫기 only for an empty pane that is not the sheet\'s only pane, and always the layout actions', async () => {
    seed(boardOf([sheet('a')]));
    mount('/board?sheet=a');
    await ready();
    openMenu(paneMenu(1));
    expect(await screen.findByRole('menuitem', { name: '칸 1 최대화' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '칸 1 닫기' })).toBeNull();
    cleanup();
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), null] })]));
    mount('/board?sheet=a');
    await ready();
    openMenu(paneMenu(1));
    expect(await screen.findByRole('menuitem', { name: '복제' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '칸 1 닫기' })).toBeNull();
  });

  it('복제 with no empty pane creates pane 3 holding the copy, and 실행 취소 takes the new pane away again', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    openMenu(paneMenu(1));
    const item = await screen.findByRole('menuitem', { name: '복제' });
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    await settle();
    expect(tabLabels()).toContain('칸 3 · 알파');
    expect(v2().sheets[0].panes[2].screen).toEqual(alpha(w1));
    expect(await screen.findByText('칸 1을 칸 3에 복제했습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 베타']);
    expect(v2().sheets[0].panes).toHaveLength(2);
  });

  it('복제 stays off at four panes with no empty pane', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), beta(w1), alpha(w2), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    openMenu(paneMenu(1));
    const item = await screen.findByRole('menuitem', { name: /복제/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('빈 칸이 없습니다');
  });
});

describe('dock renderer: group commands', () => {
  it('merge, split right and split down produce the expected trees', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    const [p1, p2] = v2().sheets[0].panes.map(p => p.id);
    expect(tree()).toEqual(group([p2, p1], p1));
    await chooseGroupItem(1, '아래로 나누기');
    expect(tree()).toEqual({ type: 'branch', dir: 'column', sizes: [50, 50], children: [group([p2]), group([p1])] });
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    expect(tree()).toEqual(group([p2, p1], p1));
    await chooseGroupItem(1, '오른쪽으로 나누기');
    expect(tree()).toEqual({ type: 'branch', dir: 'row', sizes: [50, 50], children: [group([p2]), group([p1])] });
  });

  it('offers split only for a group with two or more panes', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    openMenu(paneMenu(1));
    expect(await screen.findByRole('menuitem', { name: '칸 2 묶음으로 옮기기' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '오른쪽으로 나누기' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '아래로 나누기' })).toBeNull();
  });

  it('기본 배치 puts the default tree back', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await settle();
    const [p1, p2] = v2().sheets[0].panes.map(p => p.id);
    expect(tree()).toEqual({ type: 'branch', dir: 'row', sizes: [50, 50], children: [group([p1]), group([p2])] });
    await waitFor(() => { expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 베타']); });
  });
});

describe('dock renderer: no re-query', () => {
  it('tab switch, group move, 기본 배치, maximize and restore leave the per-pane menuQuery count unchanged', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), alpha(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    const initial = menuQuery.mock.calls.length;
    expect(initial).toBe(2);
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    expect(menuQuery.mock.calls.length).toBe(initial);
    await userEvent.click(tabOf('칸 2 · 알파'));
    await settle();
    expect(menuQuery.mock.calls.length).toBe(initial);
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    await settle();
    expect(menuQuery.mock.calls.length).toBe(initial);
    await chooseGroupItem(1, '칸 1 최대화');
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).not.toBeNull(); });
    await chooseGroupItem(1, '원래 크기로');
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).toBeNull(); });
    expect(menuQuery.mock.calls.length).toBe(initial);
  });
});

describe('dock renderer: permission revoke', () => {
  it('a pane in a background tab shows no previous data the moment its screen can no longer be mounted', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), alpha(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    const background = paneRoot(2);
    expect(background.closest('[data-dock-panel]')).toHaveAttribute('data-dock-visible', 'false');
    expect(within(background).getByTestId('rows')).toHaveTextContent(/^ROW-\d+$/);
    session = testSession(['platform:view']);
    act(() => { listeners.forEach(l => l()); });
    await settle();
    expect(within(paneRoot(2)).queryByTestId('rows')).toBeNull();
    expect(within(paneRoot(1)).queryByTestId('rows')).toBeNull();
    expect(document.body.textContent).not.toMatch(/ROW-\d+/);
  });
});

describe('dock renderer: maximize, Escape and the narrow display', () => {
  it('maximize from the pane menu hides the other panes; Escape restores and focuses the maximize toggle', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(2, '칸 2 최대화');
    await waitFor(() => { expect(paneRoot(1).closest('[inert]')).not.toBeNull(); });
    expect(paneRoot(2).closest('[inert]')).toBeNull();
    expect(v2().sheets[0].selectedPaneId).toBe(v2().sheets[0].panes[1].id);
    const toggle = () => screen.getByRole('button', { name: '원래 크기로' });
    act(() => { toggle().focus(); });
    fireEvent.keyDown(toggle(), { key: 'Escape' });
    await waitFor(() => { expect(paneRoot(1).closest('[inert]')).toBeNull(); });
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '칸 2 최대화' }));
  });

  it('below 692px every pane sits in one tab group, and nothing is stored', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(document.querySelector('[data-dock-narrow="true"]')).not.toBeNull(); });
    await waitFor(() => { expect(document.querySelectorAll('.dv-groupview')).toHaveLength(1); });
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 베타']);
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    observer.resize(900);
    await waitFor(() => { expect(document.querySelectorAll('.dv-groupview')).toHaveLength(2); });
  });
});

describe('dock renderer: narrow display follows the selected pane (C1, U9)', () => {
  afterEach(() => { observer.resize(900, 600); });
  const visibleFlag = (n: number) => paneRoot(n).closest('[data-dock-panel]')?.getAttribute('data-dock-visible');

  it('shows the selected pane, not the first group\'s, and a tab chosen there selects that pane (the Context bar follows)', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await userEvent.click(tabOf('칸 2 · 베타'));
    await settle();
    observer.resize(600);
    await waitFor(() => { expect(document.querySelectorAll('.dv-groupview')).toHaveLength(1); });
    await waitFor(() => { expect(visibleFlag(2)).toBe('true'); });
    expect(visibleFlag(1)).toBe('false');
    expect(tabOf('칸 2 · 베타')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: '칸 2 · 분석 Context' })).toBeInTheDocument();
    await userEvent.click(tabOf('칸 1 · 알파'));
    await settle();
    expect(screen.getByRole('region', { name: '칸 1 · 분석 Context' })).toBeInTheDocument();
    expect(visibleFlag(1)).toBe('true');
    expect(v2().sheets[0].selectedPaneId).toBe(v2().sheets[0].panes[0].id);
  });

  it('칸 추가 in the narrow display shows the new pane it selects', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    observer.resize(600);
    await waitFor(() => { expect(document.querySelectorAll('.dv-groupview')).toHaveLength(1); });
    fireEvent.click(screen.getByRole('button', { name: '칸 추가' }));
    await waitFor(() => { expect(tabLabels()).toHaveLength(3); });
    await waitFor(() => { expect(visibleFlag(3)).toBe('true'); });
    expect(screen.getByRole('region', { name: '칸 3 · 분석 Context' })).toBeInTheDocument();
    expect(tabOf('칸 3 · 빈 칸')).toHaveAttribute('aria-selected', 'true');
  });

  it('lists the tabs in pane-number order, whatever the wide arrangement is', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), beta(w1), alpha(w2), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 3 · 알파', '칸 2 · 베타', '칸 4 · 베타']);
    observer.resize(600);
    await waitFor(() => { expect(document.querySelectorAll('.dv-groupview')).toHaveLength(1); });
    await waitFor(() => { expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 베타', '칸 3 · 알파', '칸 4 · 베타']); });
  });
});

describe('dock renderer: 칸 추가 (C2, U4)', () => {
  it('while a pane is maximized it ends the maximize first, so the new selected pane is on screen', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 1 최대화');
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).not.toBeNull(); });
    fireEvent.click(screen.getByRole('button', { name: '칸 추가' }));
    await waitFor(() => { expect(tabLabels()).toHaveLength(3); });
    await waitFor(() => { expect(paneRoot(3).closest('[inert]')).toBeNull(); });
    expect(paneRoot(1).closest('[inert]')).toBeNull();
    expect(paneRoot(2).closest('[inert]')).toBeNull();
    expect(v2().sheets[0].selectedPaneId).toBe(v2().sheets[0].panes[2].id);
    expect(screen.getByRole('region', { name: '칸 3 · 분석 Context' })).toBeInTheDocument();
  });

  it('builds the default arrangement of one pane more: four panes via 칸 추가 are 2×2', async () => {
    seed(boardOf([sheet('a')]));
    mount('/board?sheet=a');
    await ready();
    for (let n = 2; n <= 4; n++) {
      fireEvent.click(screen.getByRole('button', { name: '칸 추가' }));
      await waitFor(() => { expect(tabLabels()).toHaveLength(n); });
    }
    const [p1, p2, p3, p4] = v2().sheets[0].panes.map(p => p.id);
    expect(tree()).toEqual({
      type: 'branch', dir: 'row', sizes: [50, 50],
      children: [
        { type: 'branch', dir: 'column', sizes: [50, 50], children: [group([p1!]), group([p3!])] },
        { type: 'branch', dir: 'column', sizes: [50, 50], children: [group([p2!]), group([p4!])] },
      ],
    });
    expect(v2().sheets[0].selectedPaneId).toBe(p4);
  });
});

describe('dock renderer: clearing a pane keeps focus on its tab (U1, U5)', () => {
  it('Delete on a tab leaves focus on that tab, and a second Delete does nothing to another pane', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), beta(w2), alpha(w2), beta(w1)] })]));
    mount('/board?sheet=a');
    await ready();
    tabOf('칸 2 · 베타').focus();
    await userEvent.keyboard('{Delete}');
    await waitFor(() => { expect(tabLabels()).toContain('칸 2 · 빈 칸'); });
    await settle();
    expect(document.activeElement).toBe(tabOf('칸 2 · 빈 칸'));
    await userEvent.keyboard('{Delete}');
    await settle();
    expect(v2().sheets[0].panes.map(p => p.screen === null)).toEqual([false, true, false, false]);
  });

  it('the X clears on the first click whether or not the pane is selected, selects it, and focus stays on its tab', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), beta(w2), alpha(w2), beta(w1)] })]));
    mount('/board?sheet=a');
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '칸 4 비우기' }));
    await waitFor(() => { expect(tabLabels()).toContain('칸 4 · 빈 칸'); });
    await settle();
    expect(await screen.findByText('칸 4을 비웠습니다')).toBeInTheDocument();
    expect(v2().sheets[0].selectedPaneId).toBe(v2().sheets[0].panes[3].id);
    expect(document.activeElement).toBe(tabOf('칸 4 · 빈 칸'));
    expect(v2().sheets[0].panes.map(p => p.screen === null)).toEqual([false, false, false, true]);
  });
});

describe('dock renderer: undo addresses panes by slot (C3)', () => {
  it('undoing a clear after an earlier pane was closed restores the cleared pane and leaves the one now at its old number empty', async () => {
    let board = freshBoard('시트');
    const id = board.sheets[0].id;
    board = addPane(addPane(board, id), id);
    board = setPane(board, id, 1, alpha(w1));
    seedV2(board);
    mount(`/board?sheet=${id}`);
    await ready();
    expect(tabLabels()).toEqual(['칸 1 · 빈 칸', '칸 2 · 알파', '칸 3 · 빈 칸']);
    fireEvent.click(screen.getByRole('button', { name: '칸 2 비우기' }));
    await settle();
    openMenu(paneMenu(1));
    fireEvent.click(await screen.findByRole('menuitem', { name: '칸 1 닫기' }));
    await settle();
    expect(tabLabels()).toEqual(['칸 1 · 빈 칸', '칸 2 · 빈 칸']);
    const toast = (await screen.findByText('칸 2을 비웠습니다')).closest<HTMLElement>('[data-sonner-toast]')!;
    fireEvent.click(within(toast).getByRole('button', { name: '실행 취소' }));
    await settle();
    expect(v2().sheets[0].panes.map(p => p.screen?.query ?? null)).toEqual([w1, null]);
    expect(tabLabels()).toEqual(['칸 1 · 알파', '칸 2 · 빈 칸']);
  });
});

describe('dock renderer: keyboard order and focus (U2, U3)', () => {
  it('Tab on a tab goes through the buttons of its head into its pane, Shift+Tab returns the same way, and Tab out of a pane reaches the next group\'s tab', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    const panelOf = (n: number) => paneRoot(n).closest<HTMLElement>('[data-dock-panel]')!;
    const slot = (n: number) => document.querySelector<HTMLElement>(`[data-pane-head-slot="${paneRoot(n).dataset.paneId?.replace(/^a\./, '')}"]`)!;
    tabOf('칸 1 · 알파').focus();
    await userEvent.tab();
    expect(slot(1).contains(document.activeElement)).toBe(true);
    for (let step = 0; step < 6 && slot(1).contains(document.activeElement); step++) await userEvent.tab();
    expect(panelOf(1).contains(document.activeElement)).toBe(true);
    await userEvent.tab({ shift: true });
    expect(slot(1).contains(document.activeElement)).toBe(true);
    for (let step = 0; step < 6 && slot(1).contains(document.activeElement); step++) await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tabOf('칸 1 · 알파'));
    // From the last stop of pane 1 the next stop is pane 2's tab; Shift+Tab from that tab is back in pane 1.
    const stops = Array.from(panelOf(1).querySelectorAll<HTMLElement>('button, [tabindex="0"], a[href], input')).filter(el => el.tabIndex >= 0);
    act(() => { (stops[stops.length - 1] ?? panelOf(1)).focus(); });
    await userEvent.tab();
    expect(document.activeElement).toBe(tabOf('칸 2 · 베타'));
    await userEvent.tab({ shift: true });
    expect(panelOf(1).contains(document.activeElement)).toBe(true);
  });

  it('on the default 2×2 Tab visits the tab groups in reading order: 칸 1, 2, 3, 4', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), beta(w2), alpha(w2), beta(w1)] })]));
    mount('/board?sheet=a');
    await ready();
    const visited: string[] = [];
    tabOf('칸 1 · 알파').focus();
    visited.push(document.activeElement?.getAttribute('aria-label') ?? '');
    for (let step = 0; step < 60 && visited.length < 4; step++) {
      await userEvent.tab();
      const tab = document.activeElement?.closest('[role="tab"]');
      if (tab && document.activeElement === tab) visited.push(tab.getAttribute('aria-label') ?? '');
    }
    expect(visited).toEqual(['칸 1 · 알파', '칸 2 · 베타', '칸 3 · 알파', '칸 4 · 베타']);
  });

  it('after a group ⋯ command focus lands on the moved pane\'s tab (merge, split right, split down)', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    await waitFor(() => { expect(document.activeElement).toBe(tabOf('칸 1 · 알파')); });
    await chooseGroupItem(1, '아래로 나누기');
    await waitFor(() => { expect(document.activeElement).toBe(tabOf('칸 1 · 알파')); });
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    await chooseGroupItem(1, '오른쪽으로 나누기');
    await waitFor(() => { expect(document.activeElement).toBe(tabOf('칸 1 · 알파')); });
  });
});

describe('dock renderer: assistive technology and names (U7, Noticed)', () => {
  it('the selected pane\'s tab says it is the editing target, and tabs advertise the keys that act', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), null] })]));
    mount('/board?sheet=a');
    await ready();
    await waitFor(() => { expect(tabOf('칸 1 · 알파')).toHaveAttribute('aria-description', '편집 대상 칸'); });
    expect(tabOf('칸 2 · 빈 칸')).not.toHaveAttribute('aria-description');
    expect(tabOf('칸 1 · 알파')).toHaveAttribute('aria-keyshortcuts', 'Delete Shift+F10');
    expect(tabOf('칸 2 · 빈 칸')).toHaveAttribute('aria-keyshortcuts', 'Shift+F10');
    await userEvent.click(tabOf('칸 2 · 빈 칸'));
    await waitFor(() => { expect(tabOf('칸 2 · 빈 칸')).toHaveAttribute('aria-description', '편집 대상 칸'); });
    expect(tabOf('칸 1 · 알파')).not.toHaveAttribute('aria-description');
  });

  it('names every separator by the two panes it sits between, with 와/과 by the number\'s final consonant', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), beta(w2), alpha(w2), beta(w1)] })]));
    mount('/board?sheet=a');
    await ready();
    await waitFor(() => { expect(screen.getAllByRole('separator')).toHaveLength(3); });
    expect(screen.getAllByRole('separator').map(item => item.getAttribute('aria-label') ?? item.textContent).sort())
      .toEqual(['칸 1과 칸 2 너비 조절', '칸 1과 칸 3 높이 조절', '칸 2와 칸 4 높이 조절']);
  });
});

describe('dock renderer: the pane head is one strip per group (ADR-0067 2c)', () => {
  const menuNames = () => {
    const menu = screen.getByRole('menu');
    return Array.from(menu.querySelectorAll('[role="menuitem"], [role="separator"]')).map(element => (element.getAttribute('role') === 'separator' ? '---' : element.textContent ?? ''));
  };
  const indexOfItem = (names: string[], text: string) => names.findIndex(name => name.startsWith(text));

  it('one 칸 N 동작 menu per group: the content actions, a separator, then the layout actions; there is no group menu', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    expect(screen.queryByRole('button', { name: /묶음 동작/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^칸 \d 동작$/ })).toHaveLength(2);
    openMenu(paneMenu(1));
    await screen.findByRole('menuitem', { name: '복제' });
    const names = menuNames();
    // The pane menu always had a separator before `비우기`; the layout group starts after the one that follows it.
    const separator = names.indexOf('---', indexOfItem(names, '비우기'));
    expect(indexOfItem(names, '이 조건을 시트의 모든 칸에 적용')).toBeLessThan(separator);
    expect(indexOfItem(names, '본 화면에서 열기')).toBeLessThan(separator);
    expect(indexOfItem(names, '바꾸기')).toBeLessThan(separator);
    expect(indexOfItem(names, '복제')).toBeLessThan(separator);
    expect(indexOfItem(names, '비우기')).toBeLessThan(separator);
    expect(indexOfItem(names, '비우기')).toBeGreaterThan(names.indexOf('---'));
    expect(indexOfItem(names, '칸 1 최대화')).toBeGreaterThan(separator);
    expect(indexOfItem(names, '칸 2 묶음으로 옮기기')).toBeGreaterThan(indexOfItem(names, '칸 1 최대화'));
    expect(names.some(name => name.startsWith('오른쪽으로 나누기'))).toBe(false);
  });

  it('lists the moves into other groups by ascending pane number', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), beta(w2), alpha(w2), beta(w1)] })]));
    mount('/board?sheet=a');
    await ready();
    openMenu(paneMenu(4));
    await screen.findByRole('menu');
    const moves = menuNames().filter(name => name.endsWith('묶음으로 옮기기'));
    expect(moves).toEqual(['칸 1 묶음으로 옮기기', '칸 2 묶음으로 옮기기', '칸 3 묶음으로 옮기기']);
  });

  it('while maximized the layout group keeps only 원래 크기로 and the content group stays', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 1 최대화');
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).not.toBeNull(); });
    openMenu(paneMenu(1));
    await screen.findByRole('menuitem', { name: '복제' });
    const names = menuNames();
    expect(indexOfItem(names, '원래 크기로')).toBeGreaterThan(names.indexOf('---'));
    expect(names.some(name => name.startsWith('칸 1 최대화'))).toBe(false);
    expect(names.some(name => name.endsWith('묶음으로 옮기기'))).toBe(false);
    expect(names.some(name => name.endsWith('나누기'))).toBe(false);
  });

  it('an empty pane offers 칸 N 닫기 then the layout actions, and the only pane has no 닫기', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), null] })]));
    mount('/board?sheet=a');
    await ready();
    await userEvent.click(tabOf('칸 2 · 빈 칸'));
    await settle();
    openMenu(paneMenu(2));
    await screen.findByRole('menuitem', { name: '칸 2 닫기' });
    const names = menuNames();
    expect(names.indexOf('칸 2 닫기')).toBeLessThan(names.indexOf('---'));
    expect(indexOfItem(names, '칸 2 최대화')).toBeGreaterThan(names.indexOf('---'));
    expect(names.some(name => name === '복제')).toBe(false);
  });

  it('the maximize toggle is in the head; its name flips, and the toggle, Escape and the menu each restore with focus on the toggle', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    const toggle = (name: string) => screen.getByRole('button', { name });
    // The toggle itself.
    await userEvent.click(toggle('칸 1 최대화'));
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).not.toBeNull(); });
    await userEvent.click(toggle('원래 크기로'));
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).toBeNull(); });
    await waitFor(() => { expect(document.activeElement).toBe(toggle('칸 1 최대화')); });
    // Escape.
    await userEvent.click(toggle('칸 1 최대화'));
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).not.toBeNull(); });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).toBeNull(); });
    await waitFor(() => { expect(document.activeElement).toBe(toggle('칸 1 최대화')); });
    // The menu.
    await userEvent.click(toggle('칸 1 최대화'));
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).not.toBeNull(); });
    await chooseGroupItem(1, '원래 크기로');
    await waitFor(() => { expect(paneRoot(2).closest('[inert]')).toBeNull(); });
    await waitFor(() => { expect(document.activeElement).toBe(toggle('칸 1 최대화')); });
  });

  it('Shift+F10 on a tab opens 칸 N 동작 with the first item focused; a right-click opens the same menu', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    tabOf('칸 1 · 알파').focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await screen.findByRole('menuitem', { name: '복제' });
    await waitFor(() => { expect(document.activeElement?.getAttribute('role')).toBe('menuitem'); });
    expect(document.activeElement).toBe(screen.getByRole('menu').querySelector('[role="menuitem"]:not([data-disabled])'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull(); });
    fireEvent.contextMenu(tabOf('칸 2 · 베타'));
    expect(await screen.findByRole('menuitem', { name: '칸 2 최대화' })).toBeInTheDocument();
  });

  it('Shift+F10 on a background tab makes it the active, selected tab first, then opens its menu', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    expect(tabOf('칸 1 · 알파')).toHaveAttribute('aria-selected', 'true');
    tabOf('칸 2 · 베타').focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(await screen.findByRole('menuitem', { name: '칸 2 최대화' })).toBeInTheDocument();
    expect(tabOf('칸 2 · 베타')).toHaveAttribute('aria-selected', 'true');
    // The open menu hides the rest of the page from role queries; the store says which pane the Context bar reads.
    expect(v2().sheets[0].selectedPaneId).toBe(v2().sheets[0].panes[1].id);
    await waitFor(() => { expect(document.activeElement?.getAttribute('role')).toBe('menuitem'); });
  });

  it('changing the active tab of a group closes the open 같음 popover and ⋯ menu of the head it leaves', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), alpha(w1)] })]));
    mount('/board?sheet=a');
    await ready();
    await chooseGroupItem(1, '칸 2 묶음으로 옮기기');
    await userEvent.click(screen.getByRole('button', { name: /^칸 1의 같은 조건/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.click(tabOf('칸 2 · 알파'));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    openMenu(paneMenu(2));
    await screen.findByRole('menu');
    await userEvent.click(tabOf('칸 1 · 알파'), { pointerEventsCheck: 0 });
    await settle();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryAllByRole('button', { name: '칸 2 동작' })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: '칸 1 동작' })).toHaveLength(1);
  });

  it('칸 추가 puts focus on the new pane\'s tab at 3 and at 4 panes, where the button disables', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), beta(w2)] })]));
    mount('/board?sheet=a');
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '칸 추가' }));
    await waitFor(() => { expect(tabLabels()).toContain('칸 3 · 빈 칸'); });
    await waitFor(() => { expect(document.activeElement).toBe(tabOf('칸 3 · 빈 칸')); });
    await userEvent.click(screen.getByRole('button', { name: '칸 추가' }));
    await waitFor(() => { expect(tabLabels()).toContain('칸 4 · 빈 칸'); });
    await waitFor(() => { expect(document.activeElement).toBe(tabOf('칸 4 · 빈 칸')); });
    expect(screen.getByRole('button', { name: '칸 추가' })).toBeDisabled();
  });
});

describe('dock renderer: the head narrows against its tabs at 340px (docs/16 §4)', () => {
  const STRIP = 340;
  /** Measured parts of the head: the system chip 43px, the toggle and ⋯ 60px, a chip 107px, `+N` 27px, `같음 N` 50px. */
  const measure = (strip: number) => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('dv-tabs-and-actions-container') ? strip
      : this.dataset.headFixed === 'actions' ? 60
        : this.hasAttribute('data-head-fixed') ? 43
          : this.dataset.chipMeasure === 'chip' ? 107
            : this.dataset.chipMeasure === 'same' ? 50
              : this.dataset.chipMeasure === 'more' ? 27 : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
  });
  /** `count` content panes: the first `together` in one tab group (pane 1 active), the rest each alone. The time differs between panes. */
  const seedGroup = (count: number, together: number) => {
    let board = freshBoard('시트');
    const id = board.sheets[0].id;
    for (let n = 1; n < count; n++) board = addPane(board, id);
    for (let n = 0; n < count; n++) board = setPane(board, id, n, alpha(n % 2 === 0 ? w1 : w2));
    const ids = board.sheets[0].panes.map(pane => pane.id);
    const grouped: LayoutNode = { type: 'group', panes: ids.slice(0, together), active: ids[0]! };
    const rest = ids.slice(together).map(pane => group([pane]));
    const tree: LayoutNode = rest.length === 0 ? grouped : { type: 'branch', dir: 'row', sizes: [grouped, ...rest].map(() => 100 / (rest.length + 1)), children: [grouped, ...rest] };
    seedV2(setTree(board, id, tree));
    return id;
  };
  const head = () => screen.getByRole('group', { name: '칸 1 머리' });
  const slotAttributes = () => ({ compact: head().hasAttribute('data-dock-compact'), wrap: head().hasAttribute('data-dock-wrap') });

  it.each([
    { tabs: 1, compact: false, wrap: false },
    { tabs: 2, compact: true, wrap: false },
    { tabs: 3, compact: true, wrap: true },
  ])('with $tabs tab(s): background tabs shrink to their badge $compact, the head moves to its own row $wrap; differing chips fold into +N until it does', async ({ tabs, compact, wrap }) => {
    const id = seedGroup(3, tabs);
    measure(STRIP);
    mount(`/board?sheet=${id}`);
    await ready();
    await waitFor(() => { expect(slotAttributes()).toEqual({ compact, wrap }); });
    const more = within(head()).queryByRole('button', { name: /조건 \d+개 더 보기/ });
    // Three tabs leave no room for the folded row beside them: the head takes a row of its own, wide enough for every chip.
    expect(more === null).toBe(wrap);
    expect(head().querySelector('[data-pane-chip="time"]') !== null).toBe(wrap);
  });

  it('a strip wide enough for the tabs at their minimum and every chip keeps them all', async () => {
    const id = seedGroup(3, 2);
    measure(900);
    mount(`/board?sheet=${id}`);
    await ready();
    await waitFor(() => { expect(head().querySelector('[data-pane-chip="time"]')).not.toBeNull(); });
    expect(slotAttributes()).toEqual({ compact: false, wrap: false });
    expect(within(head()).queryByRole('button', { name: /더 보기/ })).toBeNull();
  });
});
