import { useEffect, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformMenuEntry, type PlatformSlots, type UndeclaredMenu } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../AppShell';

// #2201 (06 §7, operator exception): a section or a space whose menus are ALL undeclared is drawn dimmed, and not navigable, for the operator only.
const menu = (id: string, group: string, over: Partial<PlatformMenuEntry> = {}): PlatformMenuEntry => ({ id, group: groupId(group), path: `/${id}`, primary: false, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over });
const hidden = menuPermission('fixture:view');
const registry = () => createRegistry({
  spaces: [testSpace({ homeMenuId: 'fixture-home' }), testSpace({ id: spaceId('venus'), label: { ko: '금성', en: 'Venus' }, homeMenuId: 'venus-home' })],
  groups: [
    { id: groupId('g-open'), space: spaceId('mars'), label: { ko: '열린 섹션', en: 'Open' }, icon: House },
    { id: groupId('g-dark'), space: spaceId('mars'), label: { ko: '닫힌 섹션', en: 'Dark' }, icon: House },
    { id: groupId('g-venus'), space: spaceId('venus'), label: { ko: '금성 섹션', en: 'Venus section' }, icon: House },
  ],
  permissions: [hidden],
  menus: [menu('fixture-home', 'g-open', { primary: true }), menu('dark-a', 'g-dark', { primary: true, permission: hidden }), menu('dark-b', 'g-dark', { permission: hidden }), menu('venus-home', 'g-venus', { primary: true, permission: hidden })],
});
const LISTED: readonly UndeclaredMenu[] = [{ menuId: 'dark-a', permission: 'fixture:view' }, { menuId: 'dark-b', permission: 'fixture:view' }, { menuId: 'venus-home', permission: 'fixture:view' }];
const slot = (list: readonly UndeclaredMenu[]): PlatformSlots => ({ undeclaredMenus: { Read: ({ children }: { children: (l: readonly UndeclaredMenu[]) => ReactNode }) => <>{children(list)}</> } });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem('platform:sidebar-collapsed', '0');
  window.history.replaceState(null, '', '/mars/fixture-home');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(slots: PlatformSlots = {}, permissions: Parameters<typeof testSession>[0] = ['platform:view']) {
  const session = testSession(permissions);
  render(<I18nProvider><PlatformProvider registry={registry()} adapter={testAdapter({ session: () => session })} slots={{ topBarTools: <span>fixture tools</span>, ...slots }}>
    <AppShell><p>screen content</p></AppShell>
  </PlatformProvider></I18nProvider>);
}
const sectionButton = () => document.querySelector('[data-section-undeclared="g-dark"]') as HTMLElement | null;
const openSwitcher = () => fireEvent.click(screen.getByRole('button', { name: /시스템 및 플랫폼 메뉴/ }));

describe('section- and space-wide undeclared (#2201)', { timeout: 15_000 }, () => {
  it('draws an all-undeclared section on the rail as a dimmed, non-navigable button named with its permission', async () => {
    mount(slot(LISTED));
    await screen.findByText('screen content');
    const dim = sectionButton()!;
    expect(dim).toHaveAttribute('aria-disabled', 'true');
    expect(dim).toHaveAttribute('aria-label', '닫힌 섹션 · 권한 미선언 (fixture:view)');
    expect(dim.className).toContain('text-text-disabled');
    const before = window.location.pathname;
    fireEvent.click(dim);
    expect(window.location.pathname).toBe(before);
    const rail = within(document.querySelector('[role="group"][aria-label]') as HTMLElement);
    expect(rail.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['열린 섹션 · 예정', '닫힌 섹션 · 권한 미선언 (fixture:view)']);
  });

  it('shows an all-undeclared space as a dimmed switcher card that does not switch space', async () => {
    mount(slot(LISTED));
    await screen.findByText('screen content');
    openSwitcher();
    const card = (await screen.findByRole('dialog')).querySelector('[data-switcher-undeclared="venus"]') as HTMLElement;
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card).toHaveAttribute('aria-label', '금성 · 권한 미선언 (fixture:view)');
    fireEvent.click(card);
    expect(window.location.pathname).toBe('/mars/fixture-home');
  });

  it.each<[string, PlatformSlots]>([['no slot', {}], ['an empty list (ordinary user)', slot([])]])('is the same rail and switcher as before with %s', async (_label, slots) => {
    mount(slots);
    await screen.findByText('screen content');
    expect(sectionButton()).toBeNull();
    openSwitcher();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[data-switcher-undeclared]')).toBeNull();
    expect(dialog.querySelectorAll('[data-switcher-card]')).toHaveLength(1);
  });

  it('a section with a visible menu stays a normal button, and one listed menu is enough to draw an all-hidden section', async () => {
    mount(slot([{ menuId: 'dark-a', permission: 'fixture:view' }]));
    await screen.findByText('screen content');
    expect(sectionButton()).not.toBeNull();
    expect(screen.getByRole('button', { name: '열린 섹션 · 예정' })).not.toHaveAttribute('aria-disabled');
  });

  it('keeps focus inside the switcher when only dimmed cards are left, also when the list arrives after the dialog opened', async () => {
    mount(slot(LISTED), []);
    await screen.findByText('screen content');
    openSwitcher();
    const dialog = await screen.findByRole('dialog');
    await vi.waitFor(() => expect(dialog.querySelector('[data-switcher-undeclared]')).not.toBeNull());
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialog.querySelector('[data-switcher-card]')).toBeNull();
  });

  it('reads the slot once for the whole shell, however often the switcher opens', async () => {
    let mounts = 0;
    const Counting = ({ children }: { children: (l: readonly UndeclaredMenu[]) => ReactNode }) => { useEffect(() => { mounts += 1; }, []); return <>{children(LISTED)}</>; };
    mount({ undeclaredMenus: { Read: Counting } });
    await screen.findByText('screen content');
    openSwitcher();
    await screen.findByRole('dialog');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    openSwitcher();
    await screen.findByRole('dialog');
    expect(mounts).toBe(1);
  });
});
