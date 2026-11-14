import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformMenuEntry, type PlatformSlots, type UndeclaredMenu } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../AppShell';

// #1846: an operator sees a menu no server declaration grants to anyone as a greyed, non-navigable row in its own place; nobody else sees a change.
const menu = (id: string, over: Partial<PlatformMenuEntry> = {}): PlatformMenuEntry => ({ id, group: groupId('fixture-space'), path: `/${id}`, primary: false, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over });
const registry = () => createRegistry({
  spaces: [testSpace({ homeMenuId: 'fixture-home' })],
  groups: [{ id: groupId('fixture-space'), space: spaceId('mars'), label: { ko: '공간', en: 'Space' }, icon: House }],
  permissions: [menuPermission('fixture:view')],
  menus: [menu('fixture-home', { primary: true }), menu('fixture-hidden', { permission: menuPermission('fixture:view') }), menu('fixture-last')],
});
const LISTED: readonly UndeclaredMenu[] = [{ menuId: 'fixture-hidden', permission: 'fixture:view' }];
const slot = (list: readonly UndeclaredMenu[]): PlatformSlots => ({ undeclaredMenus: { Read: ({ children }: { children: (l: readonly UndeclaredMenu[]) => ReactNode }) => <>{children(list)}</> } });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem('platform:sidebar-collapsed', '0');
  window.history.replaceState(null, '', '/mars/fixture-home');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(slots: PlatformSlots = {}, collapsed = false) {
  localStorage.setItem('platform:sidebar-collapsed', collapsed ? '1' : '0');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry()} adapter={testAdapter({ session: () => session })} slots={{ topBarTools: <span>fixture tools</span>, ...slots }}>
    <AppShell><p>screen content</p></AppShell>
  </PlatformProvider></I18nProvider>);
}
const sidebar = () => screen.getByRole('navigation', { name: '주 메뉴' });
const row = () => sidebar().querySelector('[data-undeclared-menu="fixture-hidden"]') as HTMLElement | null;

describe('undeclared menu rows (#1846)', { timeout: 15_000 }, () => {
  it('draws a greyed, focusable, non-navigable row in its own place with the reason and permission key as its name', async () => {
    mount(slot(LISTED));
    await screen.findByText('screen content');
    const names = within(sidebar()).getAllByRole('link').map(el => el.getAttribute('aria-label') ?? el.textContent);
    expect(names).toEqual(['fixture-home', 'fixture-hidden · 권한 미선언 (fixture:view)', 'fixture-last']);
    const hidden = row()!;
    expect(hidden).toHaveAttribute('aria-disabled', 'true');
    expect(hidden).not.toHaveAttribute('href');
    expect(hidden).toHaveAttribute('tabindex', '0');
    expect(hidden.className).toContain('text-text-muted');
    expect(hidden.className).not.toMatch(/hover:bg|bg-surface-row-selected|opacity/);
    expect(hidden).not.toHaveAttribute('aria-current');
    const before = window.location.pathname;
    fireEvent.click(hidden);
    fireEvent.keyDown(hidden, { key: 'Enter' });
    expect(window.location.pathname).toBe(before);
  });

  it('collapsed, the icon alone carries the disabled colour and the row keeps its full name', async () => {
    mount(slot(LISTED), true);
    await screen.findByText('screen content');
    const hidden = row()!;
    expect(hidden.querySelector('svg')!.getAttribute('class')).toContain('text-text-disabled');
    expect(hidden).toHaveAttribute('aria-label', 'fixture-hidden · 권한 미선언 (fixture:view)');
    expect(hidden.textContent).toBe('');
  });

  it('shows the reason and permission key on keyboard focus', async () => {
    mount(slot(LISTED));
    await screen.findByText('screen content');
    row()!.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('fixture-hidden · 권한 미선언 (fixture:view)');
  });

  it.each<[string, PlatformSlots]>([['no slot', {}], ['an empty list (ordinary user)', slot([])]])('is the same sidebar as before with %s', async (_label, slots) => {
    mount(slots);
    await screen.findByText('screen content');
    expect(row()).toBeNull();
    expect(within(sidebar()).getAllByRole('link').map(el => el.getAttribute('aria-label') ?? el.textContent)).toEqual(['fixture-home', 'fixture-last']);
  });

  it('keeps the greyed row out of favorites, recents, the command palette and every link', async () => {
    mount(slot(LISTED));
    await screen.findByText('screen content');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = await screen.findByRole('dialog');
    expect(within(palette).queryByText(/fixture-hidden/)).toBeNull();
    expect(document.querySelectorAll('a[href*="fixture-hidden"]')).toHaveLength(0);
  });

  it('ignores a listed menu the actor can actually see and an unknown id', async () => {
    mount(slot([{ menuId: 'fixture-home', permission: 'platform:view' }, { menuId: 'ghost', permission: 'fixture:view' }]));
    await screen.findByText('screen content');
    expect(sidebar().querySelector('[data-undeclared-menu]')).toBeNull();
    expect(screen.getByRole('link', { name: 'fixture-home' })).toBeInTheDocument();
  });

  it('a throwing slot costs only its rows: the menu list still renders', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount({ undeclaredMenus: { Read: () => { throw new Error('fixture region failure'); } } });
    await screen.findByText('screen content');
    expect(screen.getByRole('link', { name: 'fixture-last' })).toBeInTheDocument();
    expect(row()).toBeNull();
  });
});
