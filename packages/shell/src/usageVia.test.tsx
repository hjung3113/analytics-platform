import { lazy } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { AppShell } from './AppShell';
import { RouteOutlet } from './RouteOutlet';
import type { BoardV1 } from './board/boardMigrate';
import { groupId, spaceId, type UsageEvent } from '@ap/contracts';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import './board/BoardScreen';

// Navigation path (#605): each shell entry point marks the usage entry it leads to with its `via`.
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const Body = lazy(async () => ({ default: () => <PlatformPage><p>body</p></PlatformPage> }));
const entry = (id: string, path: string, label: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: label, en: label }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features, pageKeys: [], component: Body, ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'alpha' }), testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Ops' }, homeMenuId: 'ops' })],
  groups: [
    { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: House, space: null },
    { id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('analytics') },
    { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') },
  ],
  menus: [
    { ...entry('alerts', '/alerts', '알림', { primary: true }), group: groupId('myActivity') },
    entry('alpha', '/alpha', '알파', { primary: true }),
    entry('beta', '/beta', '베타'),
    { ...entry('ops', '/ops', '운영 홈', { features: { ...features, board: false } }), group: groupId('admin'), primary: true },
  ],
});

const events: UsageEvent[] = [];
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const entries = () => events.filter(e => e.name === 'entry' && e.source !== 'board').map(e => `${e.menuId}:${e.via}:${e.fromMenuId}`);

function mount(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session, recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; } });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
}

beforeEach(() => {
  events.length = 0;
  for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage());
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('shell navigation marks the usage entry (#605)', () => {
  it('a sidebar menu link is via sidebar', async () => {
    mount('/alpha');
    await settle();
    fireEvent.click(within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '베타' }));
    await settle();
    expect(entries()).toEqual(['alpha:direct:null', 'beta:sidebar:alpha']);
  });

  it('a command palette result is via palette', async () => {
    mount('/alpha');
    await settle();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    fireEvent.click(await screen.findByRole('option', { name: /베타/ }));
    await settle();
    expect(entries()).toEqual(['alpha:direct:null', 'beta:palette:alpha']);
  });

  it('a space card in the switcher is via switcher', async () => {
    mount('/alpha');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /^시스템 및 플랫폼 메뉴/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).getByRole('button', { name: /운영 콘솔/ }));
    await waitFor(() => expect(window.location.pathname).toBe('/ops'));
    await settle();
    expect(entries()).toEqual(['alpha:direct:null', 'ops:switcher:alpha']);
  });

  it('a platform-menu link in the switcher is via switcher', async () => {
    mount('/alpha');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /^시스템 및 플랫폼 메뉴/ }));
    fireEvent.click(within(within(screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).getByRole('navigation', { name: '플랫폼 메뉴' })).getByRole('link', { name: '알림' }));
    await waitFor(() => expect(window.location.pathname).toBe('/alerts'));
    await settle();
    expect(entries()).toEqual(['alpha:direct:null', 'alerts:switcher:alpha']);
  });

  it('leaving the board with a pane\'s 본 화면에서 열기 is via board, and the board is not a previous menu', async () => {
    const board: BoardV1 = { v: 1, activeSheetId: 'a', sheets: [{ id: 'a', name: 'a', layout: '1x1', selected: 0, panes: [{ menuId: 'beta', params: {}, query: '' }] }] };
    localStorage.setItem('platform:board:u1', JSON.stringify(board));
    // The pane's own `칸 1 동작` button inside the pane group is the grid head; the dock draws it in the group's strip.
    localStorage.setItem('platform:board-layout-engine', 'grid');
    mount('/alpha');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /분석 보드/ }));
    await settle();
    const group = screen.getByRole('group', { name: '칸 1' });
    act(() => { within(group).getByRole('button', { name: '칸 1 동작' }).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
    await settle();
    fireEvent.click(await screen.findByRole('menuitem', { name: '본 화면에서 열기' }));
    await settle();
    expect(entries()).toEqual(['alpha:direct:null', 'beta:board:null']);
  });
});
