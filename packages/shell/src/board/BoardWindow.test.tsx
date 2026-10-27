import { useEffect, useLayoutEffect } from 'react';
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
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed } from './__fixtures__/legacyBoard';
import { resetBoardPresentationForTests } from './boardPresentation';
import { toastBand } from './windowLayout';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const, scope: 'apply' as const };
const mounts = { count: 0, unmounts: 0 };
/** The pane's menu: counts mounts, so any remount of the board shows. */
function Counted() {
  useEffect(() => { mounts.count += 1; return () => { mounts.unmounts += 1; }; }, []);
  useLayoutEffect(() => undefined, []);
  return <PlatformPage><button type="button">pane control</button></PlatformPage>;
}
const Plain = () => <PlatformPage><p>plain</p></PlatformPage>;
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('analytics') }],
  menus: [
    { ...entry('home', '/', { component: Plain, features: { ...features, board: false } }), primary: true },
    entry('counted', '/counted', { component: Counted, requiresScope: true, label: { ko: '집계', en: 'Counted' } }),
    entry('beta', '/beta', { component: Plain, requiresScope: true, label: { ko: '베타', en: 'Beta' } }),
    entry('gamma', '/gamma', { component: Plain, requiresScope: true, label: { ko: '감마', en: 'Gamma' } }),
  ],
});

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
function Nav() {
  const { navigate } = useHostPlatform();
  return <nav aria-label="test nav">
    <button type="button" onClick={() => navigate('/beta?scopeId=MEM')}>go beta</button>
    <button type="button" onClick={() => navigate('/gamma?scopeId=MEM')}>go gamma</button>
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
const chip = () => screen.queryByRole('button', { name: /^분석 보드 · / });
const frame = () => document.querySelector<HTMLElement>('[data-floating-mode]');
const mode = () => frame()?.getAttribute('data-floating-mode');
const titleBar = () => screen.getByRole('group', { name: /분석 보드 창 제목줄/ });
const path = () => window.location.pathname + window.location.search;
/** The ordinary address the board was opened over (the shell normalizes the query, so it is read, not spelled). */
let BG = '';
const seedTwo = () => seed(boardOf([sheet('a', { panes: [{ menuId: 'counted', params: {}, query: '?scopeId=MEM' }] }), sheet('b')]));
const area = { width: 1200, height: 900 };

/** From a maximized board at `from` to the window over the ordinary screen it came from. */
async function openAsWindow(from = '/beta?scopeId=MEM') {
  seedTwo();
  mount(from);
  await settle();
  BG = path();
  fireEvent.click(rail('분석 보드'));
  fireEvent.click(await screen.findByRole('button', { name: '창으로 보기' }));
  await settle();
}

beforeEach(() => {
  mounts.count = 0; mounts.unmounts = 0;
  area.width = 1200; area.height = 900;
  resetBoardPresentationForTests();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-board-window-area') ? area.width : 0; });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-board-window-area') ? area.height : 0; });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('board window: transitions (893d2, issue §3.1/§4.2)', () => {
  it('maximized → window: the ordinary path comes back by replace, the rail says window, no chip, the window is not modal', async () => {
    seedTwo();
    mount('/beta?scopeId=MEM');
    await settle();
    BG = path();
    fireEvent.click(rail('분석 보드'));
    await screen.findByRole('button', { name: '창으로 보기' });
    expect(mode()).toBe('off');
    const push = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getByRole('button', { name: '창으로 보기' }));
    await settle();
    expect(path()).toBe(BG);
    expect(push).not.toHaveBeenCalled();
    expect(mode()).toBe('window');
    expect(screen.getByText('plain')).toBeTruthy();
    expect(chip()).toBeNull();
    expect(rail('분석 보드(창으로 열림, 눌러 앞으로)')).toHaveAttribute('data-board-state', 'floating');
    expect(frame()).not.toHaveAttribute('inert');
    expect(frame()).not.toHaveAttribute('aria-modal');
    expect(screen.getByRole('group', { name: '분석 보드 · a' })).toBeTruthy();
    // The board's own header gives its minimize/close to the window's title bar.
    expect(document.querySelector('[data-board-leave]')).toBeNull();
    expect(screen.getByRole('button', { name: '최소화' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '최대화' })).toBeTruthy();
  });

  it('window: a menu move pushes only the background and the window stays; the board owns no address', async () => {
    await openAsWindow();
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('button', { name: 'go gamma' }));
    await settle();
    expect(window.location.pathname).toBe('/gamma');
    expect(push.mock.calls.map(call => String(call[2]).split('?')[0])).toEqual(['/gamma']);
    expect(replace.mock.calls.filter(call => String(call[2]).startsWith('/board'))).toEqual([]);
    expect(mode()).toBe('window');
    expect(chip()).toBeNull();
  });

  it('B3: selecting a sheet in the window changes the active sheet and leaves the address and history alone', async () => {
    await openAsWindow();
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('tab', { name: 'b' }));
    await settle();
    expect(screen.getByRole('tab', { name: 'b' })).toHaveAttribute('aria-selected', 'true');
    expect(path()).toBe(BG);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: '분석 보드 · b' })).toBeTruthy();
    // Maximizing carries the sheet shown.
    fireEvent.click(screen.getByRole('button', { name: '최대화' }));
    await settle();
    expect(path()).toBe('/board?sheet=b');
  });

  it('window → minimize: no address change, focus to the chip; chip restore returns to the window, not the address', async () => {
    await openAsWindow();
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('button', { name: '최소화' }));
    await settle();
    expect(mode()).toBe('off');
    expect(path()).toBe(BG);
    expect(chip()).toHaveTextContent('분석 보드 · a');
    expect(document.activeElement).toBe(chip());
    expect(rail('분석 보드(최소화됨, 눌러 복원)')).toHaveAttribute('data-board-state', 'minimized');
    fireEvent.click(chip()!);
    await settle();
    expect(mode()).toBe('window');
    expect(path()).toBe(BG);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(chip()).toBeNull();
  });

  it('window → minimize → the rail restores to the window too', async () => {
    await openAsWindow();
    fireEvent.click(screen.getByRole('button', { name: '최소화' }));
    await settle();
    fireEvent.click(rail('분석 보드(최소화됨, 눌러 복원)'));
    await settle();
    expect(mode()).toBe('window');
    expect(path()).toBe(BG);
  });

  it('B6: window → minimize → restore → maximize → a menu move minimizes → restore goes back to maximized', async () => {
    await openAsWindow();
    fireEvent.click(screen.getByRole('button', { name: '최소화' }));
    await settle();
    fireEvent.click(chip()!);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '최대화' }));
    await settle();
    expect(path()).toBe('/board?sheet=a');
    fireEvent.click(screen.getByRole('button', { name: 'go gamma' }));
    await settle();
    expect(window.location.pathname).toBe('/gamma');
    expect(chip()).not.toBeNull();
    fireEvent.click(chip()!);
    await settle();
    expect(path()).toBe('/board?sheet=a');
    expect(mode()).toBe('off');
    expect(chip()).toBeNull();
  });

  it('window → maximize: /board?sheet= by replace; the next window opens at the same place and the rail reads open', async () => {
    await openAsWindow();
    const place = () => frame()!.style.getPropertyValue('--fw-left');
    fireEvent.keyDown(titleBar(), { key: 'ArrowRight', shiftKey: true });
    await settle();
    const moved = place();
    const push = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getByRole('button', { name: '최대화' }));
    await settle();
    expect(path()).toBe('/board?sheet=a');
    expect(push).not.toHaveBeenCalled();
    expect(rail('분석 보드(열림)')).toHaveAttribute('data-board-state', 'open');
    fireEvent.click(screen.getByRole('button', { name: '창으로 보기' }));
    await settle();
    expect(path()).toBe(BG);
    expect(mode()).toBe('window');
    expect(place()).toBe(moved);
  });

  it('B5: maximized → window is not undone by the address sync that runs while the address is still /board', async () => {
    await openAsWindow();
    expect(mode()).toBe('window');
    await settle();
    expect(mode()).toBe('window');
    expect(rail('분석 보드(창으로 열림, 눌러 앞으로)')).toBeTruthy();
  });

  it('window → close: the board is gone, the background address stays, and the rail reads closed', async () => {
    await openAsWindow();
    fireEvent.click(screen.getByRole('button', { name: '보드 닫기' }));
    await settle();
    expect(path()).toBe(BG);
    expect(frame()).toBeNull();
    expect(rail('분석 보드')).toHaveAttribute('data-board-state', 'closed');
    expect(chip()).toBeNull();
  });

  it('window: Back onto /board maximizes (floating is cleared on arrival) and returnHref is the last ordinary path', async () => {
    seedTwo();
    mount('/beta?scopeId=MEM');
    await settle();
    BG = path();
    fireEvent.click(rail('분석 보드'));
    fireEvent.click(await screen.findByRole('button', { name: '창으로 보기' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'go gamma' }));
    await settle();
    act(() => { window.history.back(); });
    await settle();
    // Back from /gamma lands on the history entry before it: /beta (ordinary), the window stays.
    expect(path()).toBe(BG);
    expect(mode()).toBe('window');
    act(() => { window.history.pushState(null, '', '/board?sheet=a'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await settle();
    expect(mode()).toBe('off');
    expect(rail('분석 보드(열림)')).toHaveAttribute('data-board-state', 'open');
    fireEvent.click(screen.getByRole('button', { name: '창으로 보기' }));
    await settle();
    expect(path()).toBe(BG);
    expect(mode()).toBe('window');
  });
});

describe('board window: one instance across every display (B1)', () => {
  it('maximized ↔ window ↔ fill ↔ minimized never remounts the board or its pane screen', async () => {
    await openAsWindow();
    const board = document.querySelector('[data-board]')!;
    const control = await screen.findByRole('button', { name: 'pane control', hidden: true });
    expect(mounts).toEqual({ count: 1, unmounts: 0 });
    const same = () => {
      expect(document.querySelector('[data-board]')).toBe(board);
      expect(screen.getByRole('button', { name: 'pane control', hidden: true })).toBe(control);
      expect(mounts).toEqual({ count: 1, unmounts: 0 });
    };
    // window → maximized
    fireEvent.click(screen.getByRole('button', { name: '최대화' })); await settle(); same();
    // maximized → window
    fireEvent.click(screen.getByRole('button', { name: '창으로 보기' })); await settle(); same();
    // window → fill (area narrower than 900) → window
    area.width = 800;
    fireEvent.click(screen.getByRole('button', { name: '최소화' })); await settle(); same();
    fireEvent.click(chip()!); await settle();
    expect(mode()).toBe('fill'); same();
    area.width = 1200;
    fireEvent.click(screen.getByRole('button', { name: '최소화' })); await settle(); same();
    fireEvent.click(chip()!); await settle();
    expect(mode()).toBe('window'); same();
    // window → minimized → window
    fireEvent.click(screen.getByRole('button', { name: '최소화' })); await settle(); same();
    fireEvent.click(chip()!); await settle(); same();
  });
});

describe('board window: narrow width, geometry, rail, toast strip', () => {
  it('under 900 wide the window is the maximized display with the note; the address does not become /board; the stored geometry is kept', async () => {
    seedTwo();
    mount('/beta?scopeId=MEM');
    await settle();
    BG = path();
    fireEvent.click(rail('분석 보드'));
    await screen.findByRole('button', { name: '창으로 보기' });
    area.width = 800;
    fireEvent.click(screen.getByRole('button', { name: '창으로 보기' }));
    await settle();
    expect(mode()).toBe('fill');
    expect(screen.getByText('창 대신 최대화 표시로 열립니다')).toBeTruthy();
    expect(path()).toBe(BG);
    expect(screen.getByRole('button', { name: '최소화' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '창으로 보기' })).toBeNull();
    // The chip comes back from the fill display too, and it returns to the same display.
    fireEvent.click(screen.getByRole('button', { name: '최소화' }));
    await settle();
    area.width = 1200;
    fireEvent.click(chip()!);
    await settle();
    expect(mode()).toBe('window');
    expect(screen.queryByText('창 대신 최대화 표시로 열립니다')).toBeNull();
  });

  it('geometry from a key is remembered; a shrunken area clamps the display and a larger one gets the stored value back', async () => {
    await openAsWindow();
    const left = () => Number.parseFloat(frame()!.style.getPropertyValue('--fw-left'));
    const width = () => Number.parseFloat(frame()!.style.getPropertyValue('--fw-width'));
    expect(width()).toBe(720); // 60% of 1200, the default
    fireEvent.keyDown(titleBar(), { key: 'ArrowRight', shiftKey: true });
    await settle();
    expect(left()).toBe(240 + 48);
    // Shrink the area: the shown window is clamped inside it ...
    fireEvent.click(screen.getByRole('button', { name: '최소화' })); await settle();
    area.width = 960;
    fireEvent.click(chip()!); await settle();
    expect(left() + width()).toBeLessThanOrEqual(960);
    // ... and the stored geometry was not rewritten: back at 1200 it is where the user left it.
    fireEvent.click(screen.getByRole('button', { name: '최소화' })); await settle();
    area.width = 1200;
    fireEvent.click(chip()!); await settle();
    expect(left()).toBe(288);
    expect(width()).toBe(720);
  });

  it('B7: the window area is reduced by the toast strip derived from the toast stack offset', async () => {
    await openAsWindow();
    const height = Number.parseFloat(frame()!.style.getPropertyValue('--fw-height'));
    expect(height).toBe(Math.round((area.height - toastBand('bottom-4')) * 0.7));
    expect(document.querySelector('[data-toast-stack]')!.className).toContain('bottom-4');
    expect(toastBand('bottom-4')).toBe(72);
  });

  it('rail on a window sends focus to its title bar and changes nothing else', async () => {
    await openAsWindow();
    (document.activeElement as HTMLElement | null)?.blur();
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(rail('분석 보드(창으로 열림, 눌러 앞으로)'));
    await settle();
    expect(document.activeElement).toBe(titleBar());
    expect(mode()).toBe('window');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('Escape does not close or minimize the window', async () => {
    await openAsWindow();
    fireEvent.keyDown(titleBar(), { key: 'Escape' });
    await settle();
    expect(mode()).toBe('window');
  });

  it('the English labels are used', async () => {
    seedTwo();
    window.history.replaceState(null, '', '/beta?scopeId=MEM');
    localStorage.setItem('platform:lang', 'en');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
    await settle();
    fireEvent.click(rail('Analysis board'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'View as window' }));
    await settle();
    expect(rail('Analysis board (open as a window, press to bring forward)')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Analysis board · a' })).toBeTruthy();
  });
});
