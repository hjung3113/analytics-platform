import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed } from './__fixtures__/legacyBoard';
import { resetBoardPresentationForTests } from './boardPresentation';
import './BoardScreen';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const, roomNames: 'apply' as const, lot: 'apply' as const };
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
const pane = (query: string) => ({ menuId: 'alpha', params: {}, query });
const w1 = 'from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
const w2 = 'from=2026-08-01T00:00:00&to=2026-08-02T00:00:00';

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const provide = (children: React.ReactNode) => {
  const session = testSession(['platform:view']);
  return <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>{children}</PlatformProvider></I18nProvider>;
};

let width = 1000;
const observers = new Set<(entries: { contentRect: { width: number } }[]) => void>();
beforeEach(() => {
  width = 1000;
  observers.clear();
  resetBoardPresentationForTests();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class {
    callback: (entries: { contentRect: { width: number } }[]) => void;
    constructor(callback: (entries: { contentRect: { width: number } }[]) => void) { this.callback = callback; observers.add(callback); }
    observe() {} unobserve() {} disconnect() { observers.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 600, top: 0, left: 0, right: width, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
const resize = (next: number) => { width = next; act(() => { for (const callback of Array.from(observers)) callback([{ contentRect: { width: next } }]); }); };

describe('a hidden grid board keeps its inner maximize (893c fix 1)', () => {
  let setVisible: (visible: boolean) => void = () => {};
  function Wrapper() {
    const [visible, set] = useState(true);
    setVisible = set;
    return <BoardSurface sheetId="a" onSheetChange={() => {}} arrivalKey="x" Outlet={() => <p>pane</p>} visible={visible} />;
  }
  const mountBoard = async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?${w1}`), pane(`?${w2}`)] })]));
    render(provide(<Wrapper />));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '칸 1 최대화' }));
    await settle();
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
  };

  it('F1: Escape pressed while the board is minimized is not taken by it, and the restore finds the pane still maximized', async () => {
    await mountBoard();
    act(() => { setVisible(false); });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    act(() => { setVisible(true); });
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
    const shown = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(shown); });
    expect(shown.defaultPrevented).toBe(true);
    expect(screen.queryByRole('button', { name: '원래 크기로' })).toBeNull();
  });

  it('F3: restoring into a narrow window only stacks the board; the maximize intent comes back when it is wide again', async () => {
    await mountBoard();
    act(() => { setVisible(false); });
    width = 500;
    act(() => { setVisible(true); });
    await settle();
    expect(document.querySelector('[data-board-grid]')!.getAttribute('data-columns')).toBe('1');
    expect(screen.queryByRole('button', { name: '원래 크기로' })).toBeNull();
    resize(1000);
    await settle();
    expect(screen.getByRole('button', { name: '원래 크기로' })).toBeInTheDocument();
  });
});

describe('restore through the host (893c fix 1)', () => {
  function Nav() {
    const { navigate } = useHostPlatform();
    return <button type="button" onClick={() => navigate('/beta')}>go beta</button>;
  }
  const mountHost = () => {
    window.history.replaceState(null, '', '/board?sheet=a');
    return render(provide(<><Nav /><AppShell><RouteOutlet /></AppShell></>));
  };
  const chip = () => screen.getByRole('button', { name: /^분석 보드 · / });
  const status = () => document.querySelector<HTMLElement>('[data-board-status]')!;

  it('F2: a Context-edit request handled once is not replayed by a restore over the remembered focus', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [pane(`?scopeId=S1&${w1}`), pane(`?scopeId=S1&${w2}`)] })]));
    mountHost();
    await settle();
    const group = screen.getByRole('group', { name: '칸 2' });
    fireEvent.click(within(group).getByRole('button', { name: '칸 2의 조건 2개 더 보기' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Context 바에서 편집' }));
    await settle();
    const bar = screen.getByRole('region', { name: '칸 2 · 분석 Context' }).closest('[data-board-context-row]')!;
    expect(bar.contains(document.activeElement)).toBe(true);
    const tab = screen.getByRole('tab', { name: 'a' });
    act(() => { tab.focus(); });
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    fireEvent.click(chip());
    await settle();
    expect(screen.getByRole('tab', { name: 'a' })).toHaveFocus();
  });

  it('F4: two restore announcements with the same words are two changes in the status region', async () => {
    seed(boardOf([sheet('a', { panes: [null] })]));
    mountHost();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    fireEvent.click(chip());
    await settle();
    const first = status().firstElementChild;
    expect(status()).toHaveTextContent('분석 보드를 복원했습니다');
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    fireEvent.click(chip());
    await settle();
    expect(status()).toHaveTextContent('분석 보드를 복원했습니다');
    expect(status().firstElementChild).not.toBe(first);
  });

  it('Noticed: the board close button says that saved sheets stay', async () => {
    seed(boardOf([sheet('a', { panes: [null] })]));
    mountHost();
    await settle();
    expect(screen.getByRole('button', { name: '보드 닫기' })).toHaveAccessibleDescription('저장된 시트는 남습니다');
  });

  it('UX-4: the chip row is tall enough for the chip and its focus ring (32 + 2 × (offset 2 + ring 2) = 40 ≤ 44), and toasts clear it', async () => {
    seed(boardOf([sheet('a', { panes: [null] })]));
    mountHost();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    expect(chip().closest('[data-board-chip-row]')!.className).toContain('h-11');
    expect(document.querySelector('[data-toast-stack]')!.className).toContain('bottom-16');
  });
});
