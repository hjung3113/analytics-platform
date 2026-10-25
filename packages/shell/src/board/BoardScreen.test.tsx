import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useRecentVisits } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { DetailDrawer, PlatformPage } from '@ap/components';
import { Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { BoardScreen } from './BoardScreen';
import { GRID_GAP, PANE_HEADER_HEIGHT, STACKED_PANE_MIN_HEIGHT } from './layout';
import { RouteOutlet } from '../RouteOutlet';
import { AppRail } from '../AppRail';
import { AppShell } from '../AppShell';
import { MAX_SHEETS } from './boardModel';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, storedLegacy as stored, V1_KEY as KEY, V2_KEY } from './__fixtures__/legacyBoard';
import { groupId, spaceId, type PlatformAdapter, type Session } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: ['tab'], ...over,
});
function Body() {
  const { global, pageParam, paneId } = useHostPlatform();
  return <PlatformPage><p data-testid="from">{global.from ?? 'none'}</p><p data-testid="tab">{pageParam('tab') ?? 'no-tab'}</p><p data-testid="pane">{paneId ?? 'main'}</p></PlatformPage>;
}
function makeRegistry(over: { board?: boolean } = {}) {
  return createRegistry({
    spaces: [testSpace({ homeMenuId: 'home' }), testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Ops' }, permission: 'console:access', homeMenuId: 'ops' })],
    groups: [
      { id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('analytics') },
      { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') },
    ],
    menus: [
      { ...entry('home', '/', { component: Body, features: { ...features, board: over.board ?? false } }), primary: true },
      entry('alpha', '/alpha', { component: Body, label: { ko: '알파', en: 'Alpha' }, features: { ...features, board: over.board ?? true } }),
      entry('beta', '/beta', { component: Body, label: { ko: '베타', en: 'Beta' }, features: { ...features, board: over.board ?? true } }),
      entry('item', '/item/:id', { component: Body, navHidden: true }),
      entry('plain', '/plain', { component: Body, features: { ...features, board: false } }),
      { ...entry('ops', '/ops', { component: Body, permission: 'console:access', features: { ...features, board: false } }), group: groupId('admin'), primary: true },
      entry('locked', '/locked', { component: Body, permission: 'console:access', label: { ko: '잠김', en: 'Locked' } }),
    ],
  });
}

const alpha = (query = '') => ({ menuId: 'alpha', params: {}, query });
const w1 = '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
const w2 = '?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00';

let session: Session;
const listeners = new Set<() => void>();
function mount(url = '/board?sheet=a', permissions: Session['user']['permissions'] = ['platform:view'], registry = makeRegistry(), adapterOver: Partial<PlatformAdapter> = {}) {
  window.history.replaceState(null, '', url);
  session = testSession(permissions);
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; }, ...adapterOver });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);
}
const openMenu = (trigger: HTMLElement) => { act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); }); };
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const paneGroup = (n: number) => screen.getByRole('group', { name: `칸 ${n}` });
/** The Kernel pane id the mounted board gave pane `n`: `<sheet>.<slot id>`; a migrated V1 seed mints random slot ids, so tests read it instead of spelling it. */
const paneIdOf = (n: number) => document.querySelector(`[data-pane-index="${n - 1}"]`)!.getAttribute('data-pane-id')!;

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
  // These suites pin the grid renderer, which stays the fallback (the default is the dock since ADR-0067 2c).
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); listeners.clear(); window.history.replaceState(null, '', '/'); });

describe('storage (docs/16 §7)', () => {
  it('first visit is one empty 1×1 sheet named 시트 1, and nothing is written until an edit', async () => {
    mount('/board');
    await settle();
    expect(screen.getByRole('tab', { name: '시트 1' })).toHaveAttribute('aria-selected', 'true');
    expect(within(paneGroup(1)).getByRole('button', { name: '분석 화면 넣기' })).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    expect(window.location.search).toMatch(/^\?sheet=s/);
    fireEvent.click(screen.getByRole('button', { name: '시트 추가' }));
    await settle();
    expect(stored().sheets.map(s => s.name)).toEqual(['시트 1', '시트 2']);
  });

  it('shows comparison guidance once above a sheet when every pane is empty', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [null, null] })]));
    mount();
    await settle();
    expect(screen.getAllByText('분석 화면 두 개를 넣어 나란히 비교하세요')).toHaveLength(1);
    expect(screen.getByText('시트 — 비교 작업 하나를 담는 탭')).toBeInTheDocument();
    expect(screen.getByText('칸 — 시트 안에 놓는 분석 화면 한 개')).toBeInTheDocument();
    expect(within(paneGroup(1)).getByRole('button', { name: '분석 화면 넣기' })).toBeInTheDocument();
    expect(within(paneGroup(2)).getByRole('button', { name: '분석 화면 넣기' })).toBeInTheDocument();
  });

  it('hides comparison guidance when one pane has a screen and keeps the empty pane action', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(), null] })]));
    mount();
    await settle();
    expect(screen.queryByText('분석 화면 두 개를 넣어 나란히 비교하세요')).toBeNull();
    expect(within(paneGroup(2)).getByRole('button', { name: '분석 화면 넣기' })).toBeInTheDocument();
  });

  it('opens the browser storage notice with Enter and Space, closes with Escape, and restores trigger focus', async () => {
    mount('/board');
    await settle();
    const trigger = screen.getByRole('button', { name: '이 브라우저에만 저장' });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyUp(trigger, { key: 'Enter' });
    fireEvent.click(trigger);
    let notice = await screen.findByRole('dialog', { name: '이 브라우저에만 저장' });
    expect(within(notice).getByText('보드와 배치는 이 브라우저의 저장 공간에 보관됩니다. 다른 컴퓨터나 기기에서는 보이지 않습니다.')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '이 브라우저에만 저장' })).toBeNull());
    expect(trigger).toHaveFocus();

    fireEvent.keyDown(trigger, { key: ' ' });
    fireEvent.keyUp(trigger, { key: ' ' });
    fireEvent.click(trigger);
    notice = await screen.findByRole('dialog', { name: '이 브라우저에만 저장' });
    expect(notice).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '이 브라우저에만 저장' })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it.each([['not JSON', '{nope'], ['a newer version', JSON.stringify({ v: 2, anything: true })], ['a wrong shape', JSON.stringify({ v: 1, activeSheetId: 'x', sheets: [] })]])('starts a fresh board on %s and leaves the stored value alone until the first edit', async (_name, raw) => {
    localStorage.setItem(KEY, raw);
    mount('/board');
    await settle();
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(localStorage.getItem(KEY)).toBe(raw);
    fireEvent.click(screen.getByRole('button', { name: '시트 추가' }));
    await settle();
    expect(JSON.parse(localStorage.getItem(V2_KEY)!).v).toBe(2);
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(stored().sheets).toHaveLength(2);
  });

  it('says once that a board saved by a newer build is not saved here, and never writes it', async () => {
    const newer = JSON.stringify({ v: 3, anything: true });
    localStorage.setItem(V2_KEY, newer);
    mount('/board');
    await settle();
    expect(await screen.findByText('더 새 버전에서 저장한 보드라 이 화면에서는 저장하지 않습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '시트 추가' }));
    await settle();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(localStorage.getItem(V2_KEY)).toBe(newer);
  });

  it('says that an unreadable board was set aside, and keeps the original value', async () => {
    localStorage.setItem(V2_KEY, '{nope');
    mount('/board');
    await settle();
    expect(await screen.findByText('저장된 보드를 읽을 수 없어 새 보드로 시작했습니다. 원래 값은 따로 보관했습니다.')).toBeInTheDocument();
    expect(localStorage.getItem('platform:board:corrupt-backup:v2:u1')).toBe('{nope');
  });

  it('re-reads the board when the signed-in user changes', async () => {
    seed(boardOf([sheet('a', { name: '내 시트' })]));
    localStorage.setItem('platform:board:u2', JSON.stringify(boardOf([sheet('z', { name: '남의 시트' })])));
    mount('/board?sheet=a');
    await settle();
    expect(screen.getByRole('tab', { name: '내 시트' })).toBeInTheDocument();
    session = testSession(['platform:view'], { user: { id: 'u2' } });
    act(() => { listeners.forEach(l => l()); });
    await settle();
    expect(screen.getByRole('tab', { name: '남의 시트' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '내 시트' })).toBeNull();
  });
});

describe('saved pane admission (docs/16 §7)', () => {
  it.each([
    ['an unregistered menu', { menuId: 'ghost', params: {}, query: '' }],
    ['a menu without board support', { menuId: 'plain', params: {}, query: '' }],
    ['params the path needs but lacks', { menuId: 'item', params: {}, query: '' }],
    ['params that are a dot segment', { menuId: 'item', params: { id: '..' }, query: '' }],
    ['params the path does not take', { menuId: 'alpha', params: { id: '1' }, query: '' }],
  ])('%s shows 더는 보드에서 열 수 없는 화면 with 비우기 and is not deleted', async (_name, saved) => {
    seed(boardOf([sheet('a', { panes: [saved] })]));
    mount();
    await settle();
    const pane = paneGroup(1);
    expect(within(pane).getByText('더는 보드에서 열 수 없는 화면')).toBeInTheDocument();
    expect(within(pane).getAllByRole('button', { name: '비우기' })).toHaveLength(1);
    expect(stored().sheets[0].panes[0]).toEqual(saved);
    fireEvent.click(within(pane).getByRole('button', { name: '비우기' }));
    await settle();
    expect(stored().sheets[0].panes[0]).toBeNull();
  });

  it('a registered board menu the user cannot open is mounted and shows the permission state, not the unavailable state', async () => {
    const registry = makeRegistry();
    seed(boardOf([sheet('a', { panes: [{ menuId: 'locked', params: {}, query: '' }] })]));
    mount('/board?sheet=a', ['platform:view'], registry);
    await settle();
    expect(within(paneGroup(1)).getByText('이 메뉴에 대한 권한이 없습니다')).toBeInTheDocument();
    expect(within(paneGroup(1)).queryByText('더는 보드에서 열 수 없는 화면')).toBeNull();
  });
});

describe('panes', () => {
  it('two panes of one menu with different Context render independently, each under its own pane id', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), alpha(w2)] })]));
    mount();
    await settle();
    expect(within(paneGroup(1)).getByTestId('from')).toHaveTextContent('2026-09-01T00:00:00');
    expect(within(paneGroup(2)).getByTestId('from')).toHaveTextContent('2026-08-01T00:00:00');
    expect(within(paneGroup(2)).getByTestId('pane')).toHaveTextContent(`${paneIdOf(2)}`);
    expect(paneIdOf(2)).toMatch(/^a\.p\w+$/);
    expect(paneIdOf(2)).not.toBe(paneIdOf(1));
  });

  it('editing the selected pane through the Context bar changes only that pane\'s stored screen', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), alpha(w2)] })]));
    mount();
    await settle();
    fireEvent.click(within(paneGroup(2)).getByRole('button', { name: '칸 2 선택' }));
    await settle();
    const bar = screen.getByRole('region', { name: '칸 2 · 분석 Context' });
    fireEvent.click(within(bar).getByRole('button', { name: /기간/ }));
    fireEvent.click(await screen.findByRole('radio', { name: '7일' }));
    await settle();
    const [first, second] = stored().sheets[0].panes;
    expect(first).toEqual(alpha(w1));
    expect(second?.query).not.toBe(w2);
    expect(second?.query).toContain('from=');
  });

  it('shows 칸 N on every pane, the selected one marked by an accent bar and a pressed title button, never by colour alone', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [null, alpha(w1)] })]));
    mount();
    await settle();
    fireEvent.click(within(paneGroup(2)).getByRole('button', { name: '칸 2 선택' }));
    await settle();
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1 선택' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(paneGroup(2)).getByRole('button', { name: '칸 2 선택' })).toHaveAttribute('aria-pressed', 'true');
    expect(paneGroup(2).querySelector('[data-pane-selected-bar]')).not.toBeNull();
    expect(paneGroup(1).querySelector('[data-pane-selected-bar]')).toBeNull();
    expect(paneGroup(1)).toHaveAttribute('data-pane-id', expect.stringMatching(/^a\.p\w+$/));
    expect(paneGroup(1)).toHaveAttribute('tabindex', '-1');
  });

  it('opens with the first pane selected; a click, focus inside, and a header control each select their pane first', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), alpha(w1), alpha(w1), alpha(w1)] })]));
    mount();
    await settle();
    expect(stored().sheets[0].selected).toBe(0);
    fireEvent.pointerDown(within(paneGroup(2)).getByTestId('from'));
    await settle();
    expect(stored().sheets[0].selected).toBe(1);
    act(() => { within(paneGroup(3)).getByRole('button', { name: '칸 3 동작' }).focus(); });
    await settle();
    expect(stored().sheets[0].selected).toBe(2);
    openMenu(within(paneGroup(4)).getByRole('button', { name: '칸 4 동작' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '비우기' }));
    await settle();
    expect(stored().sheets[0].selected).toBe(3);
    expect(stored().sheets[0].panes[3]).toBeNull();
  });

  it('opens on the first pane of the shown sheet even when another pane was selected when the board was left (docs/16 §4)', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', selected: 3, panes: [alpha(w1), alpha(w1), alpha(w1), alpha(w1)] })]));
    mount();
    await settle();
    expect(within(paneGroup(1)).getByRole('button', { name: '칸 1 선택' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(paneGroup(4)).getByRole('button', { name: '칸 4 선택' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('region', { name: '칸 1 · 분석 Context' })).toBeInTheDocument();
  });

  it('shows the disabled 48px bar and makes no Context request for a selected pane whose menu the role cannot open', async () => {
    const contextOptions = vi.fn(async () => ({ stgroup: [], team: [], makerModel: [] }));
    const evaluateSelection = vi.fn(async () => ({ inCondition: [], outOfCondition: [] }));
    seed(boardOf([sheet('a', { panes: [{ menuId: 'locked', params: {}, query: '' }] })]));
    mount('/board?sheet=a', ['platform:view'], makeRegistry(), { contextOptions, evaluateSelection });
    await settle();
    expect(within(paneGroup(1)).getByText('이 메뉴에 대한 권한이 없습니다')).toBeInTheDocument();
    const bar = screen.getByRole('region', { name: '칸 1 · 분석 Context' });
    expect(bar).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: /^Scope/ })).toBeNull();
    expect(document.querySelector('[data-board-context-row]')).toHaveClass('h-12');
    expect(contextOptions).not.toHaveBeenCalled();
    expect(evaluateSelection).not.toHaveBeenCalled();
  });

  it('disables the Context bar, keeping its 48px row and the 칸 N name, while an empty pane is selected', async () => {
    seed(boardOf([sheet('a')]));
    mount();
    await settle();
    const bar = screen.getByRole('region', { name: '칸 1 · 분석 Context' });
    expect(bar).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: /^Scope/ })).toBeNull();
    expect(document.querySelector('[data-board-context-row]')).toHaveClass('h-12');
  });

  it('places a screen from the list of openable board menus, starting from the latest screen\'s Context', async () => {
    seed(boardOf([sheet('a')]));
    mount('/board?sheet=a', ['platform:view']);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '분석 화면 넣기' }));
    const dialog = await screen.findByRole('dialog');
    const names = within(dialog).getAllByRole('button').map(b => b.textContent);
    expect(names).toContain('알파');
    expect(names).toContain('베타');
    expect(names).not.toContain('plain');
    expect(names).not.toContain('item');
    expect(names).not.toContain('잠김');
    expect(within(dialog).getByRole('heading', { name: '분석' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '알파' }));
    await settle();
    expect(stored().sheets[0].panes[0]?.menuId).toBe('alpha');
    expect(paneGroup(1)).toHaveFocus();
  });
});

describe('layout (docs/16 §4)', () => {
  const full = () => boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), alpha(w1), alpha(w2), alpha(w2)] }), sheet('b', { name: 'B' })]);

  it('asks before a shrink that empties panes (first focus 취소), then offers undo that restores only that sheet\'s panes', async () => {
    seed(full());
    mount();
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: '1×2 레이아웃' }));
    const alert = await screen.findByRole('alertdialog');
    expect(within(alert).getByText('칸 2개가 비워집니다')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: '취소' })).toHaveFocus();
    fireEvent.click(within(alert).getByRole('button', { name: '비우고 줄이기' }));
    await settle();
    expect(stored().sheets[0].layout).toBe('1x2');
    expect(stored().sheets[0].panes).toHaveLength(2);
    // Another sheet changes while the toast is up.
    fireEvent.click(await screen.findByRole('tab', { name: 'B' }));
    await settle();
    openMenu(screen.getByRole('button', { name: '시트 동작: B' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '왼쪽으로 이동' }));
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    const first = 'a';
    const a = stored().sheets.find(s => s.id === first)!;
    expect(a.layout).toBe('2x2');
    expect(a.panes.map(p => p?.query)).toEqual([w1, w1, w2, w2]);
    expect(stored().sheets.map(s => s.id)).toEqual(['b', 'a']);
  });

  it('cancelling the shrink changes nothing', async () => {
    seed(full());
    mount();
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: '1×1 레이아웃' }));
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    await settle();
    expect(stored().sheets[0].layout).toBe('2x2');
  });

  it('shrinks over empty panes only without asking', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), alpha(w1), null, null] })]));
    mount();
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: '1×2 레이아웃' }));
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(stored().sheets[0].layout).toBe('1x2');
    expect(screen.queryByRole('button', { name: '실행 취소' })).toBeNull();
  });

  it('says nothing was restored when the shrunk sheet was edited after the shrink, and restores nothing', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), alpha(w1), alpha(w2), alpha(w2)] })]));
    mount();
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: '1×2 레이아웃' }));
    fireEvent.click(await screen.findByRole('button', { name: '비우고 줄이기' }));
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: '2×2 레이아웃' }));
    await settle();
    fireEvent.click(within(paneGroup(4)).getByRole('button', { name: '칸 4 선택' }));
    fireEvent.click(within(paneGroup(4)).getByRole('button', { name: '분석 화면 넣기' }));
    fireEvent.click(await screen.findByRole('button', { name: '베타' }));
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    expect(await screen.findByText('실행 취소할 수 없습니다 — 그 뒤에 바뀌었습니다')).toBeInTheDocument();
    const a = stored().sheets[0];
    expect(a.layout).toBe('2x2');
    expect(a.panes.map(p => p?.menuId ?? null)).toEqual(['alpha', 'alpha', null, 'beta']);
    expect(a.selected).toBe(3);
  });

  it('undoes a pane clear without overwriting a screen placed meanwhile', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha(w1), alpha(w2)] })]));
    mount();
    await settle();
    openMenu(within(paneGroup(1)).getByRole('button', { name: '칸 1 동작' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '비우기' }));
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    expect(stored().sheets[0].panes[0]).toEqual(alpha(w1));
  });
});

describe('sheet strip (docs/16 §4)', () => {
  it('sits outside the page content and the detail slot, 40px plus a 1px top border', async () => {
    seed(boardOf([sheet('a')]));
    mount();
    await settle();
    const strip = document.querySelector('[data-board-sheet-strip]')!;
    expect(strip).toHaveClass('h-[41px]', 'border-t');
    expect(strip.closest('[data-platform-page-content]')).toBeNull();
    expect(screen.getByRole('tablist', { name: '시트' })).toBeInTheDocument();
  });

  it('←/→ move between tabs; no button sits inside a tab', async () => {
    seed(boardOf([sheet('a'), sheet('b'), sheet('c')]));
    mount();
    await settle();
    const tabs = screen.getAllByRole('tab');
    act(() => { tabs[0].focus(); });
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(tabs[2]).toHaveFocus();
    for (const tab of tabs) expect(within(tab).queryAllByRole('button')).toHaveLength(0);
  });

  it('reorders through the menu items 왼쪽으로 이동 / 오른쪽으로 이동', async () => {
    seed(boardOf([sheet('a'), sheet('b'), sheet('c')], 'b'));
    mount('/board?sheet=b');
    await settle();
    openMenu(screen.getByRole('button', { name: '시트 동작: b' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '오른쪽으로 이동' }));
    await settle();
    expect(stored().sheets.map(s => s.id)).toEqual(['a', 'c', 'b']);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['a', 'c', 'b']);
  });

  it('reorders by dragging a tab onto another', async () => {
    seed(boardOf([sheet('a'), sheet('b'), sheet('c')]));
    mount();
    await settle();
    const [a, , c] = screen.getAllByRole('tab');
    fireEvent.dragStart(c, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    fireEvent.dragOver(a);
    fireEvent.drop(a);
    await settle();
    expect(stored().sheets.map(s => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('renames by double-click and by the menu', async () => {
    seed(boardOf([sheet('a'), sheet('b')]));
    mount();
    await settle();
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'b' }));
    const field = await screen.findByRole('textbox', { name: '시트 이름' });
    fireEvent.change(field, { target: { value: '지난달' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(stored().sheets[1].name).toBe('지난달');
    openMenu(screen.getByRole('button', { name: '시트 동작: a' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이름 바꾸기' }));
    const again = await screen.findByRole('textbox', { name: '시트 이름' });
    fireEvent.change(again, { target: { value: '이번달' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    await settle();
    expect(stored().sheets[0].name).toBe('이번달');
  });

  it('ignores an Enter that belongs to an IME composition while renaming (isComposing, keyCode 229)', async () => {
    seed(boardOf([sheet('a'), sheet('b')]));
    mount();
    await settle();
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'b' }));
    const field = await screen.findByRole('textbox', { name: '시트 이름' });
    fireEvent.change(field, { target: { value: '지난' } });
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    await settle();
    expect(screen.getByRole('textbox', { name: '시트 이름' })).toBeInTheDocument();
    expect(stored().sheets[1].name).toBe('b');
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(stored().sheets[1].name).toBe('지난');
  });

  it('deletes with undo, and deleting the last sheet leaves one empty sheet', async () => {
    seed(boardOf([sheet('a', { panes: [alpha(w1)] }), sheet('b')]));
    mount();
    await settle();
    openMenu(screen.getByRole('button', { name: '시트 동작: a' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '시트 삭제' }));
    await settle();
    expect(stored().sheets.map(s => s.id)).toEqual(['b']);
    expect(window.location.search).toBe('?sheet=b');
    fireEvent.click(await screen.findByRole('button', { name: '실행 취소' }));
    await settle();
    expect(stored().sheets.map(s => s.id)).toEqual(['a', 'b']);
    expect(stored().sheets[0].panes[0]).toEqual(alpha(w1));
    expect(window.location.search).toBe('?sheet=a');
    // Last sheet.
    seed(boardOf([sheet('only', { panes: [alpha(w1)] })]));
    cleanup();
    mount('/board?sheet=only');
    await settle();
    openMenu(screen.getByRole('button', { name: '시트 동작: only' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '시트 삭제' }));
    await settle();
    expect(stored().sheets).toHaveLength(1);
    expect(stored().sheets[0].panes).toEqual([null]);
    expect(stored().sheets[0].id).not.toBe('only');
  });

  it('stops adding at 20 sheets and says why', async () => {
    seed(boardOf(Array.from({ length: MAX_SHEETS }, (_, i) => sheet(`s${i}`))));
    mount('/board?sheet=s0');
    await settle();
    const add = screen.getByRole('button', { name: '시트 추가 — 시트는 최대 20장입니다' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(add);
    await settle();
    expect(stored().sheets).toHaveLength(MAX_SHEETS);
  });
});

describe('?sheet= (docs/16 §7)', () => {
  it('pushes on a sheet switch, back returns to the previous sheet, and an unknown id falls back with a replace', async () => {
    seed(boardOf([sheet('a'), sheet('b')], 'a'));
    mount('/board?sheet=a');
    await settle();
    const before = window.history.length;
    fireEvent.click(screen.getByRole('tab', { name: 'b' }));
    await settle();
    expect(window.location.search).toBe('?sheet=b');
    expect(window.history.length).toBe(before + 1);
    expect(screen.getByRole('tab', { name: 'b' })).toHaveAttribute('aria-selected', 'true');
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'a' })).toHaveAttribute('aria-selected', 'true'));
    expect(window.location.search).toBe('?sheet=a');
  });

  it('falls back to the stored active sheet for an unknown or missing id without adding a history entry', async () => {
    seed(boardOf([sheet('a'), sheet('b')], 'b'));
    const before = window.history.length;
    mount('/board?sheet=nope');
    await settle();
    expect(window.location.search).toBe('?sheet=b');
    expect(window.history.length).toBe(before);
    expect(screen.getByRole('tab', { name: 'b' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps pane state out of the URL', async () => {
    seed(boardOf([sheet('a', { selected: 0, panes: [alpha(w1)] })]));
    mount();
    await settle();
    fireEvent.click(within(screen.getByRole('region', { name: '칸 1 · 분석 Context' })).getByRole('button', { name: /기간/ }));
    fireEvent.click(await screen.findByRole('radio', { name: '7일' }));
    await settle();
    expect(window.location.search).toBe('?sheet=a');
  });
});

describe('narrow stacking (docs/16 §4)', () => {
  let width = 764;
  let notify: (w: number) => void = () => {};
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: ResizeObserverCallback) { notify = w => this.callback([{ contentRect: { width: w } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('uses the stacked minimum for expanded panes and header-only tracks when collapsed', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [null, null, null, null] })]));
    mount(); await settle();
    act(() => { notify(600); });
    const stackedHeight = `${STACKED_PANE_MIN_HEIGHT}px`;
    expect([1, 2, 3, 4].map(n => paneGroup(n).style.getPropertyValue('--pane-height'))).toEqual([stackedHeight, stackedHeight, stackedHeight, stackedHeight]);
    expect(document.querySelector('[data-board-grid]')).toHaveStyle({ '--board-height': `${STACKED_PANE_MIN_HEIGHT * 4 + GRID_GAP * 3}px` });
    fireEvent.click(screen.getByRole('button', { name: '칸 1 접기' }));
    expect([1, 2, 3, 4].map(n => paneGroup(n).style.getPropertyValue('--pane-height'))).toEqual([`${PANE_HEADER_HEIGHT}px`, stackedHeight, stackedHeight, stackedHeight]);
    expect(document.querySelector('[data-board-grid]')).toHaveStyle({ '--board-height': `${PANE_HEADER_HEIGHT + STACKED_PANE_MIN_HEIGHT * 3 + GRID_GAP * 3}px` });
  });

  it('recovers the focused restore button to the same pane when stacking cancels maximize', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [null, null, null, null] })]));
    mount(); await settle();
    fireEvent.click(screen.getByRole('button', { name: '칸 2 최대화' }));
    expect(screen.getByRole('button', { name: '원래 크기로' })).toHaveFocus();
    act(() => { notify(600); });
    expect(paneGroup(2)).toHaveFocus();
    act(() => { notify(764); });
    expect(paneGroup(2)).toHaveFocus();
    expect(screen.getByRole('button', { name: '칸 2 최대화' })).toBeInTheDocument();
  });

  it('does not steal focus on stacking from a surviving control or an outgoing sheet', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [null, null, null, null] }), sheet('b')]));
    mount(); await settle();
    fireEvent.click(screen.getByRole('button', { name: '칸 2 최대화' }));
    const collapse = screen.getByRole('button', { name: '칸 2 선택' });
    act(() => { collapse.focus(); notify(600); });
    expect(collapse).toHaveFocus();
    act(() => { notify(764); });
    fireEvent.click(screen.getByRole('button', { name: '칸 2 최대화' }));
    const oldPane = paneGroup(2);
    fireEvent.click(screen.getByRole('tab', { name: 'b' }));
    await settle();
    expect(oldPane).not.toBeInTheDocument();
    expect(document.activeElement?.closest('[data-pane-id]')).toBeNull();
  });

  it('stacks by the grid container width, not the viewport, and never changes the stored layout', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [null, null, null, null] })]));
    mount();
    await settle();
    const grid = () => document.querySelector('[data-board-grid]')!;
    expect(grid()).toHaveAttribute('data-columns', '2');
    act(() => { notify(600); });
    expect(grid()).toHaveAttribute('data-columns', '1');
    act(() => { notify(764); });
    expect(grid()).toHaveAttribute('data-columns', '2');
    expect(localStorage.getItem(KEY)).toContain('"layout":"2x2"');
    expect(localStorage.getItem(V2_KEY)).toBeNull();
  });
  it('keeps saved unequal ratios through the actual 692px boundary and logical-column collapse while stacked', async () => {
    const arrangement = { columns: [20, 80], rows: [[40, 60], [70, 30]], collapsed: [] };
    seed(boardOf([sheet('a', { layout: '2x2', panes: [null, null, null, null], arrangement: { '2x2': arrangement } })]));
    mount(); await settle();
    act(() => { notify(691); });
    expect(document.querySelector('[data-board-grid]')).toHaveAttribute('data-columns', '1');
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.queryByRole('button', { name: '칸 1 최대화' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '칸 1 접기' }));
    expect(screen.getByRole('button', { name: '칸 3 접기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '칸 2 접기' })).toBeEnabled();
    act(() => { notify(692); });
    expect(document.querySelector('[data-board-grid]')).toHaveAttribute('data-columns', '2');
    expect(screen.getByRole('separator', { name: '열 너비 조절' })).toHaveAttribute('aria-valuenow', '50');
    expect(stored().sheets[0].arrangement?.['2x2']).toEqual({ ...arrangement, collapsed: [0] });
    act(() => { notify(3412); });
    expect(Number(screen.getByRole('separator', { name: '열 너비 조절' }).getAttribute('aria-valuenow'))).toBeCloseTo(20);
  });

});

describe('shell entry (docs/16 §4, §8)', () => {
  it('shows the rail entry only when the user can open a placeable board menu', () => {
    const withBoard = (registry: ReturnType<typeof makeRegistry>, permissions: Session['user']['permissions'] = ['platform:view']) => {
      window.history.replaceState(null, '', '/alpha');
      const s = testSession(permissions);
      const view = render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => s })} registry={registry}><AppRail /></PlatformProvider></I18nProvider>);
      return view;
    };
    let view = withBoard(makeRegistry({ board: false }));
    expect(screen.queryByRole('button', { name: '분석 보드' })).toBeNull();
    view.unmount();
    view = withBoard(makeRegistry());
    expect(screen.getByRole('button', { name: '분석 보드' })).toBeInTheDocument();
    view.unmount();
    withBoard(makeRegistry(), []);
    expect(screen.queryByRole('button', { name: '분석 보드' })).toBeNull();
  });

  it('draws no business-system sidebar on /board and puts the page-arrival focus on the board title', async () => {
    seed(boardOf([sheet('a')]));
    window.history.replaceState(null, '', '/alpha');
    const s = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => s })} registry={makeRegistry()}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
    await settle();
    expect(document.querySelector('aside[data-collapsed]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '분석 보드' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(document.querySelector('aside[data-collapsed]')).toBeNull();
    expect(screen.getByRole('heading', { name: '분석 보드' })).toHaveFocus();
    expect(screen.getByRole('button', { name: '분석 보드' })).toHaveAttribute('aria-current', 'page');
  });

  it('never writes the board screen into the main screen\'s recent list or last screen', async () => {
    seed(boardOf([sheet('a', { panes: [alpha(w1)] })]));
    window.history.replaceState(null, '', '/beta?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00');
    const s = testSession(['platform:view']);
    let seenRecent: string[] = [];
    function Spy() { seenRecent = useRecentVisits().map(r => r.menuId); return null; }
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => s })} registry={makeRegistry()}><Spy /><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
    await settle();
    expect(seenRecent).toEqual(['beta']);
    fireEvent.click(screen.getByRole('button', { name: '분석 보드' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(seenRecent).toEqual(['beta']);
    const last = JSON.parse(sessionStorage.getItem('platform:space-last:u1')!) as Record<string, string>;
    expect(Object.keys(last)).toEqual(['analytics']);
    expect(last.analytics.startsWith('/beta?')).toBe(true);
  });
});

describe('pane sizing and retained presentation', () => {
  beforeEach(() => { vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 600, x: 0, y: 0, top: 0, left: 0, bottom: 600, right: 1000, toJSON: () => ({}) }); });
  afterEach(() => { vi.restoreAllMocks(); });
  it('resizes, collapses logical columns, maximizes and restores with focus without changing pane Context', async () => {
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(w1), alpha(w2), null, null] })]));
    mount();
    await settle();
    const splitter = screen.getByRole('separator', { name: '열 너비 조절' });
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(stored().sheets[0].arrangement?.['2x2']?.columns).toEqual([55, 45]);
    fireEvent.click(screen.getByRole('button', { name: '칸 1 접기' }));
    expect(screen.getByRole('button', { name: '칸 3 접기' })).toBeDisabled();
    expect(paneGroup(1).querySelector('[data-pane-body]')).toHaveAttribute('inert');
    const trigger = screen.getByRole('button', { name: '칸 2 최대화' });
    const firstPaneId = paneIdOf(1);
    fireEvent.click(trigger);
    expect(paneGroup(2)).toHaveAttribute('data-maximized', 'true');
    expect(screen.queryByRole('group', { name: '칸 1' })).toBeNull();
    expect(document.querySelector(`[data-pane-id="${firstPaneId}"]`)).toHaveAttribute('inert');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await settle();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('button', { name: '칸 1 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    expect(stored().sheets[0].panes[0]?.query).toBe(w1);
    fireEvent.click(screen.getByRole('button', { name: '크기 초기화' }));
    expect(stored().sheets[0].arrangement).toBeUndefined();
  });
  it('temporarily shows a collapsed maximized body, disables collapse, and restores its saved collapse flag', async () => {
    seed(boardOf([sheet('a', { layout: '2x1', panes: [alpha(w1), null] })]));
    mount(); await settle();
    fireEvent.click(screen.getByRole('button', { name: '칸 1 접기' }));
    fireEvent.click(screen.getByRole('button', { name: '칸 1 최대화' }));
    expect(paneGroup(1).querySelector('[data-pane-body]')).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: '칸 1 펼치기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '원래 크기로' }));
    expect(paneGroup(1).querySelector('[data-pane-body]')).toHaveAttribute('inert');
  });
  it('1×1 has no pane sizing controls and 1×2 cannot collapse either logical column', async () => {
    seed(boardOf([sheet('a')])); mount(); await settle();
    expect(screen.queryByRole('button', { name: '칸 1 최대화' })).toBeNull();
    expect(screen.queryByRole('button', { name: '칸 1 접기' })).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '1×2 레이아웃' }));
    expect(screen.getByRole('button', { name: '칸 1 접기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '칸 2 접기' })).toBeDisabled();
  });
});

describe('stateful Outlet presentation lifetime', () => {
  it('retains input, DOM, scroll and mounts in collapse/maximize/stacking both directions, but unmounts on sheet/user changes', async () => {
    const mounted = vi.fn(); const unmounted = vi.fn();
    function Stateful() {
      const { paneId } = useHostPlatform();
      const [value, setValue] = useState('initial');
      useEffect(() => { mounted(paneId); return () => { unmounted(paneId); }; }, [paneId]);
      return <input aria-label={`local ${paneId}`} value={value} onChange={e => setValue(e.target.value)} />;
    }
    let resize: (width: number) => void = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: HTMLElement) { if (element.hasAttribute('data-board-grid')) resize = width => this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {} unobserve() {}
    });
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(), alpha(), alpha(), alpha()] }), sheet('b', { panes: [alpha()] })]));
    window.history.replaceState(null, '', '/board?sheet=a');
    let current = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => current, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } })} registry={makeRegistry()}><BoardScreen Outlet={Stateful} /></PlatformProvider></I18nProvider>);
    await settle();
    const input = screen.getByRole('textbox', { name: `local ${paneIdOf(1)}` });
    const body = input.closest('[data-pane-body]') as HTMLElement;
    body.scrollTop = 75;
    fireEvent.change(input, { target: { value: 'kept' } });
    fireEvent.click(screen.getByRole('button', { name: '칸 1 접기' }));
    fireEvent.click(screen.getByRole('button', { name: '칸 1 펼치기' }));
    fireEvent.click(screen.getByRole('button', { name: '칸 2 최대화' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '원래 크기로' }), { key: 'Escape' });
    act(() => { resize(600); });
    expect(screen.queryByRole('button', { name: '칸 2 최대화' })).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
    act(() => { resize(764); });
    expect(screen.getByRole('textbox', { name: `local ${paneIdOf(1)}` })).toBe(input);
    expect(input).toHaveValue('kept'); expect(body.scrollTop).toBe(75);
    expect(mounted).toHaveBeenCalledTimes(4); expect(unmounted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: '1×2 레이아웃' }));
    fireEvent.click(screen.getByRole('button', { name: '비우고 줄이기' })); await settle();
    expect(unmounted).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox', { name: `local ${paneIdOf(1)}` })).toBe(input);
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' })); await settle();
    expect(mounted).toHaveBeenCalledTimes(6);
    expect(screen.getByRole('textbox', { name: `local ${paneIdOf(1)}` })).toBe(input);
    expect(body.scrollTop).toBe(75);
    fireEvent.click(screen.getByRole('tab', { name: 'b' })); await settle();
    expect(unmounted).toHaveBeenCalledTimes(6); expect(mounted).toHaveBeenCalledTimes(7);
    fireEvent.click(screen.getByRole('tab', { name: 'a' })); await settle();
    expect(screen.getByRole('textbox', { name: `local ${paneIdOf(1)}` })).toHaveValue('initial');
    expect(mounted).toHaveBeenCalledTimes(11);
    localStorage.setItem('platform:board:u2', JSON.stringify(boardOf([sheet('a', { panes: [alpha()] })])));
    current = { ...current, user: { ...current.user, id: 'u2' } };
    act(() => { listeners.forEach(l => l()); }); await settle();
    expect(unmounted).toHaveBeenCalledTimes(11);
    expect(mounted).toHaveBeenCalledTimes(12);
    expect(screen.getByRole('textbox', { name: `local ${paneIdOf(1)}` })).toHaveValue('initial');
  });
});

describe('docked detail overlay lifetime', () => {
  it.each(['collapse owner', 'maximize sibling'])('keeps detail popovers usable after %s', async transition => {
    function DetailOwner() {
      const { paneId } = useHostPlatform();
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>detail {paneId}</button>{open && <DetailDrawer title="owned detail" onClose={() => setOpen(false)} tabs={[{
        id: 'a', label: 'Attributes', content: <Popover><PopoverTrigger>detail options</PopoverTrigger><PopoverContent>detail popup</PopoverContent></Popover>,
      }]} />}</>;
    }
    seed(boardOf([sheet('a', { layout: '2x2', panes: [alpha(), alpha(), null, null] })]));
    window.history.replaceState(null, '', '/board?sheet=a');
    const current = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => current })} registry={makeRegistry()}><AppShell><BoardScreen Outlet={DetailOwner} /></AppShell></PlatformProvider></I18nProvider>);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: `detail ${paneIdOf(1)}` }));
    expect(screen.getByRole('dialog', { name: 'owned detail' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: transition === 'collapse owner' ? '칸 1 접기' : '칸 2 최대화' }));
    fireEvent.click(screen.getByRole('button', { name: 'detail options' }));
    expect(screen.getByText('detail popup')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText('detail popup'), { key: 'Escape' });
    await settle();
    expect(screen.queryByText('detail popup')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'owned detail' })).toBeInTheDocument();
    if (transition === 'maximize sibling') expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
  });
});

describe('shell-only state does not wake a pane (#824)', () => {
  let paneRenders = 0;
  let host: ReturnType<typeof useHostPlatform>;
  function PaneProbe() { paneRenders++; return <p>pane probe</p>; }
  function Controls() { host = useHostPlatform(); return null; }
  const probeRegistry = () => createRegistry({
    spaces: [testSpace({ homeMenuId: 'beta' })],
    groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('analytics') }],
    menus: [
      { ...entry('beta', '/beta', { component: () => null, label: { ko: '베타', en: 'Beta' } }), primary: true },
      entry('alpha', '/alpha', { component: PaneProbe, label: { ko: '알파', en: 'Alpha' } }),
    ],
  });
  const mountProbe = (url: string, ui: React.ReactNode) => {
    window.history.replaceState(null, '', url);
    const s = testSession(['platform:view']);
    return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => s })} registry={probeRegistry()}>{ui}</PlatformProvider></I18nProvider>);
  };

  it('a toast, a dismiss, a palette open and a palette close render no pane', async () => {
    seed(boardOf([sheet('a', { panes: [alpha(w1)] })]));
    mountProbe('/board?sheet=a', <><Controls /><RouteOutlet /></>);
    await settle();
    expect(screen.getByText('pane probe')).toBeInTheDocument();
    const before = paneRenders;
    let id = 0;
    act(() => { id = host.toast('hello'); });
    act(() => { host.dismissToast(id); });
    act(() => { host.setPaletteOpen(true); });
    act(() => { host.setPaletteOpen(false); });
    expect(paneRenders - before).toBe(0);
  });

  it('inserting into a pane after a main-screen visit starts from the newest recent visit\'s Context', async () => {
    seed(boardOf([sheet('a')]));
    mountProbe('/beta?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00', <AppShell><RouteOutlet /></AppShell>);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '분석 보드' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '분석 화면 넣기' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '알파' }));
    await settle();
    expect(stored().sheets[0].panes[0]?.query).toContain('from=2026-09-01T00%3A00%3A00');
  });
});
