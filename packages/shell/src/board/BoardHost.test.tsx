import { useState } from 'react';
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
import { BoardSurface } from './BoardSurface';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, V1_KEY } from './__fixtures__/legacyBoard';
import { resetBoardPresentationForTests } from './boardPresentation';
import { OpenInBoardAction } from './OpenInBoardAction';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
const Page = () => <PlatformPage><p>page body</p></PlatformPage>;
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...entry('home', '/', { component: Page, features: { ...features, board: false } }), primary: true },
    entry('alpha', '/alpha', { component: Page, label: { ko: '알파', en: 'Alpha' } }),
    entry('beta', '/beta', { component: Page, label: { ko: '베타', en: 'Beta' } }),
  ],
});

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
function Nav() {
  const { navigate } = useHostPlatform();
  return <nav aria-label="test nav">
    <button type="button" onClick={() => navigate('/beta')}>go beta</button>
    <button type="button" onClick={() => navigate('/', { focus: 'page' })}>go home focus</button>
  </nav>;
}
function mount(url: string, withNav = true) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={{ boardEntry: <OpenInBoardAction /> }}>
    {withNav && <Nav />}<AppShell><RouteOutlet /></AppShell>
  </PlatformProvider></I18nProvider>);
}
const rail = (name: string) => screen.getByRole('button', { name });
const host = () => document.querySelector<HTMLElement>('[data-board-host]');
const chip = () => screen.queryByRole('button', { name: /^분석 보드 · / });
const seedTwo = () => seed(boardOf([sheet('a'), sheet('b')]));

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('board host: minimize, restore, close (893c)', () => {
  it('C1/C2: a menu move minimizes with no extra step; the chip restores the same instance; the rail open and every restore are replaces', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    expect(host()).toBeNull();
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(rail('분석 보드'));
    await settle();
    expect(window.location.pathname + window.location.search).toBe('/board?sheet=a');
    expect(push).not.toHaveBeenCalled();
    const board = document.querySelector('[data-board]')!;
    fireEvent.click(screen.getByRole('tab', { name: 'b' }));
    await settle();
    expect(window.location.search).toBe('?sheet=b');

    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    expect(window.location.pathname).toBe('/beta');
    expect(host()).toHaveAttribute('hidden');
    expect(host()).toHaveAttribute('inert');
    expect(document.querySelector('[data-board]')).toBe(board);
    expect(chip()).toHaveTextContent('분석 보드 · b');
    expect(window.location.pathname).toBe('/beta');

    fireEvent.click(chip()!);
    await settle();
    expect(window.location.pathname + window.location.search).toBe('/board?sheet=b');
    expect(document.querySelector('[data-board]')).toBe(board);
    expect(host()).not.toHaveAttribute('hidden');
    expect(chip()).toBeNull();
    expect(screen.getByRole('tab', { name: 'b' })).toHaveAttribute('aria-selected', 'true');
    // Rail open and restore went through replaceState; the only push is the user's own move to /beta (and the tab press, a sheet change).
    expect(replace.mock.calls.length).toBeGreaterThan(0);
    expect(push.mock.calls.map(call => String(call[2]))).toEqual(['/board?sheet=b', '/beta']);
  });

  it('C2: the explicit minimize returns to the last ordinary path by replace, repeatedly, without duplicate entries', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    const push = vi.spyOn(window.history, 'pushState');
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(rail(i === 0 ? '분석 보드' : '분석 보드(최소화됨, 눌러 복원)'));
      await settle();
      expect(window.location.pathname).toBe('/board');
      fireEvent.click(screen.getByRole('button', { name: '최소화' }));
      await settle();
      expect(window.location.pathname).toBe('/alpha');
      expect(document.querySelectorAll('[data-board-host]')).toHaveLength(1);
    }
    expect(push).not.toHaveBeenCalled();
  });

  it('C2: a typed or Back/Forward arrival at /board opens the board; a Back between ordinary paths keeps it minimized', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    expect(host()).toBeNull();
    window.history.replaceState(null, '', '/board?sheet=b');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await settle();
    expect(screen.getByRole('tab', { name: 'b' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    expect(chip()).not.toBeNull();
    window.history.replaceState(null, '', '/alpha');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    await settle();
    expect(window.location.pathname).toBe('/alpha');
    expect(chip()).not.toBeNull();
  });

  it('C3: the hidden board never turns an ordinary path back into /board', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    fireEvent.click(rail('분석 보드'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    await settle();
    expect(window.location.pathname).toBe('/beta');
  });

  it('C8: close ends the live board, keeps the stored sheets, leaves /board and does not reopen; no return path means home', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    fireEvent.click(rail('분석 보드'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '보드 닫기' }));
    await settle();
    expect(window.location.pathname).toBe('/alpha');
    expect(host()).toBeNull();
    expect(chip()).toBeNull();
    expect(JSON.parse(localStorage.getItem(V1_KEY)!).sheets).toHaveLength(2);
    expect(rail('분석 보드')).not.toHaveAttribute('aria-current');
    cleanup();
    resetBoardPresentationForTests();
    mount('/board?sheet=a');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '보드 닫기' }));
    await settle();
    expect(window.location.pathname).toBe('/');
    expect(host()).toBeNull();
  });

  it('C9: a user who never opened the board loads nothing of it; another user does not inherit a live board', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    expect(document.querySelector('[data-board]')).toBeNull();
    cleanup();
    const session = testSession(['platform:view']);
    const other = { ...session, user: { ...session.user, id: 'u2' } };
    window.history.replaceState(null, '', '/board?sheet=a');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
    await settle();
    expect(host()).not.toBeNull();
    cleanup();
    window.history.replaceState(null, '', '/alpha');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => other })} registry={registry}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
    await settle();
    expect(host()).toBeNull();
    expect(chip()).toBeNull();
  });
});

describe('board host: chip and rail (893c)', () => {
  it('C6: the chip is one button named like its text, only while minimized, in a row below main, and toasts stack above it', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    expect(chip()).toBeNull();
    fireEvent.click(rail('분석 보드'));
    await settle();
    expect(chip()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    const button = screen.getByRole('button', { name: '분석 보드 · a' });
    expect(screen.getAllByRole('button', { name: /^분석 보드 · / })).toHaveLength(1);
    expect(button).toHaveAccessibleDescription('눌러 보드를 원래 자리로 복원합니다');
    const row = button.closest('[data-board-chip-row]')!;
    expect(row.previousElementSibling).toBe(document.getElementById('platform-main')!.parentElement); // the window's area box around main (893d2)
    expect(row.compareDocumentPosition(document.querySelector('[data-toast-anchor]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('[data-toast-stack]')!.className).toContain('bottom-16');
  });

  it('C7: the rail button says closed / open / minimized in words and a shape, and a press does the matching thing', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    expect(rail('분석 보드')).not.toHaveAttribute('aria-current');
    expect(document.querySelector('[data-board-minimized-mark]')).toBeNull();
    fireEvent.click(rail('분석 보드'));
    await settle();
    expect(rail('분석 보드(열림)')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(rail('분석 보드(열림)'));
    await settle();
    expect(window.location.pathname).toBe('/board');
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    const minimized = rail('분석 보드(최소화됨, 눌러 복원)');
    expect(minimized).not.toHaveAttribute('aria-current');
    expect(minimized.querySelector('[data-board-minimized-mark]')).not.toBeNull();
    fireEvent.click(minimized);
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(rail('분석 보드(열림)')).toBeInTheDocument();
  });
});

describe('board host: focus table (893c)', () => {
  it('C5: the explicit minimize hands focus to the chip and says so once', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    fireEvent.click(rail('분석 보드'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '최소화' }));
    await settle();
    expect(chip()).toHaveFocus();
    expect(document.querySelector('[data-board-status]')).toHaveTextContent('분석 보드를 최소화했습니다');
  });

  it('C5: a menu move keeps the destination arrival focus; the chip and the hidden board take none', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    fireEvent.click(rail('분석 보드'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'go home focus' }));
    await settle();
    expect(chip()).not.toBeNull();
    expect(chip()).not.toHaveFocus();
    expect(host()!.contains(document.activeElement)).toBe(false);
    expect(document.activeElement?.closest('[data-board-host]')).toBeNull();
  });

  it('C5: a restore puts focus back on the last valid element in the board, or the title; the scroll is not reset', async () => {
    seedTwo();
    mount('/alpha');
    await settle();
    fireEvent.click(rail('분석 보드'));
    await settle();
    const tab = screen.getByRole('tab', { name: 'a' });
    act(() => { tab.focus(); });
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);
    scrollTo.mockClear();
    fireEvent.click(chip()!);
    await settle();
    expect(screen.getByRole('tab', { name: 'a' })).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
    // Gone element → the title.
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '분석 보드(최소화됨, 눌러 복원)' }));
    await settle();
    expect(screen.getByRole('heading', { name: '분석 보드' })).toBeInTheDocument();
  });
});

describe('board surface while hidden (893c, issue §3)', () => {
  let width = 1000;
  const observers = new Set<(entries: { contentRect: { width: number } }[]) => void>();
  beforeEach(() => {
    width = 1000;
    observers.clear();
    vi.stubGlobal('ResizeObserver', class {
      callback: (entries: { contentRect: { width: number } }[]) => void;
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) { this.callback = callback; observers.add(callback); }
      observe() {} unobserve() {} disconnect() { observers.delete(this.callback); }
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 600, top: 0, left: 0, right: width, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }));
  });
  const resize = (next: number) => { width = next; act(() => { for (const callback of Array.from(observers)) callback([{ contentRect: { width: next } }]); }); };

  it('C4: a hidden (0 wide) container is not a narrow window: the drawn columns stay, and a valid width is measured again on return', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [null, null] })]));
    let setVisible: (visible: boolean) => void = () => {};
    function Wrapper() {
      const [visible, set] = useState(true);
      setVisible = set;
      return <BoardSurface sheetId="a" onSheetChange={() => {}} arrivalKey="x" Outlet={() => <p>pane</p>} visible={visible} />;
    }
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Wrapper /></PlatformProvider></I18nProvider>);
    await settle();
    const columns = () => document.querySelector('[data-board-grid]')!.getAttribute('data-columns');
    resize(500);
    expect(columns()).toBe('1');
    act(() => { setVisible(false); });
    resize(0);
    expect(columns()).toBe('1');
    act(() => { setVisible(true); });
    resize(1000);
    expect(columns()).toBe('2');
  });
});

describe('board host: head at narrow widths (893c FIX3 UX-5)', () => {
  it('keeps each head button named by its words and titled, and hides the words below the container width', async () => {
    seedTwo();
    mount('/board?sheet=a');
    await settle();
    expect(document.querySelector('[data-board]')).toHaveClass('@container');
    for (const label of ['이 브라우저에만 저장', '최소화', '보드 닫기']) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveAttribute('title', label);
      expect(button).not.toHaveAttribute('aria-label');
      expect(button.querySelector('span')).toHaveClass('@max-[760px]:sr-only');
    }
  });
});
