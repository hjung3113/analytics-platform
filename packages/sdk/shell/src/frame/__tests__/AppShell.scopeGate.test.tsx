import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { PlatformPage } from '@ap/components';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../AppShell';
import { groupId, spaceId } from '@ap/contracts';

const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'a-home' })],
  groups: [{ id: groupId('ga'), label: { ko: 'A', en: 'A' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'a-home', group: groupId('ga'), path: '/mars/a', permission: 'platform:view', primary: true, label: { ko: 'A 홈', en: 'A home' }, description: { ko: '', en: '' }, icon: House,
    requiresScope: true, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  }],
});
const scopes = [{ id: 'MEM', label: 'MEM · 청주', grantedRooms: 3, totalRooms: 5 }];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('localStorage', memoryStorage());
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(collapsed: boolean) {
  window.history.replaceState(null, '', '/mars/a?v=1');
  localStorage.setItem('platform:sidebar-collapsed', collapsed ? '1' : '0');
  const session = testSession(['platform:view'], { scopes });
  const adapter = testAdapter({ session: () => session, validateScope: async () => ({ status: 'valid', grantedRooms: [] }) });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><AppShell><PlatformPage><p>page body</p></PlatformPage></AppShell></PlatformProvider></I18nProvider>);
}

describe('Scope gate `Scope 선택` opens the shell selector (#1938)', () => {
  it.each([[false], [true]])('opens the Scope list with focus inside, then Escape returns focus to the button (collapsed=%s)', async collapsed => {
    const view = mount(collapsed);
    const open = await screen.findByRole('button', { name: 'Scope 선택' });
    const sidebar = view.container.querySelector('aside[data-collapsed]')!;
    expect(sidebar.getAttribute('data-collapsed')).toBe(String(collapsed));

    open.focus();
    fireEvent.keyDown(open, { key: 'Enter' });
    fireEvent.click(open);

    // A collapsed sidebar is expanded first, so the selector shows its name.
    await waitFor(() => expect(sidebar.getAttribute('data-collapsed')).toBe('false'));
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    expect(screen.getByRole('menuitemradio', { name: /MEM · 청주/ })).toBeInTheDocument();
    // Opening never applies a Scope: the gate is still there.
    expect(screen.queryByText('page body')).toBeNull();

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scope 선택' })).toHaveFocus());
  }, 20_000); // the first AppShell mount in a worker loads its lazy regions

  it('applies the Scope only when the person picks it in the opened list', async () => {
    mount(false);
    act(() => screen.getByRole('button', { name: 'Scope 선택' }).click());
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /MEM · 청주/ }));
    expect(await screen.findByText('page body')).toBeInTheDocument();
  });

  it('after a pick and a return to the Scope-less address, Escape still returns focus to the button', async () => {
    mount(false);
    act(() => screen.getByRole('button', { name: 'Scope 선택' }).click());
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /MEM · 청주/ }));
    expect(await screen.findByText('page body')).toBeInTheDocument();

    act(() => { window.history.back(); });
    const open = await screen.findByRole('button', { name: 'Scope 선택' });
    open.focus();
    fireEvent.keyDown(open, { key: 'Enter' });
    fireEvent.click(open);
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scope 선택' })).toHaveFocus());
  }, 20_000);
});
