import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DetailDrawer } from '@ap/components';
import { House, ListTodo, MessagesSquare, MessageSquarePlus, Rocket, Star } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import type { FeatureSlot, PlatformSlots } from '@ap/kernel';
import { AppShell } from '../AppShell';
import { AppRail } from '../AppRail';
import { AppSidebar } from '../AppSidebar';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, menuPermission, spaceId, type GroupId, type Permission, type PlatformAdapter, type Session } from '@ap/contracts';
import { useEffect, useState, type ReactNode } from 'react';

function menu(id: string, group: GroupId, path: string, permission: Permission) {
  return { id, group, path, permission, primary: true, label: { ko: '운영 홈', en: 'Operations home' }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] };
}
const registry = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [testSpace({ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, subtitle: { ko: 'FeedbackOps 검사 전용 시스템 부제', en: 'FeedbackOps fixture system subtitle' }, homeMenuId: 'home' }), testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'ops', permission: 'console:access' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars'), hideLabelWhenSingle: true }, { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') }],
  menus: [menu('ops', groupId('admin'), '/ops', 'console:access'), { id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['focus', 'tab'] }],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function adapterWith(permissions: Session['user']['permissions'] = ['platform:view']): PlatformAdapter {
  const session = testSession(permissions);
  return testAdapter({
    session: () => session,
    getEntity: async () => forbidden,
    listAnnotations: async () => forbidden,
  });
}

function sidebarRegistry(groupId: GroupId, groupLabel: string, menuIds: string[], hideLabelWhenSingle = false) {
  const menus = menuIds.map((id, index) => ({
    ...menu(id, groupId, `/${id}`, 'platform:view'),
    label: { ko: `메뉴 ${index + 1}`, en: `Menu ${index + 1}` },
    primary: index === 0,
  }));
  return createRegistry({
    permissions: [menuPermission('equipment:view')],
    spaces: [testSpace({ homeMenuId: menuIds[0] })],
    groups: [{
      id: groupId,
      label: { ko: groupLabel, en: groupLabel },
      icon: House,
      space: spaceId('mars'),
      ...(hideLabelWhenSingle ? { hideLabelWhenSingle: true } : {}),
    }],
    menus,
  });
}


beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('localStorage', memoryStorage());
  // Admitted space routes now write platform:space-last. A shared jsdom sessionStorage would make a later
  // switchSpace resume that URL instead of the space home these tests assert.
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&lotIds=kept');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function FavoriteControl() {
  const { toggleFavorite } = useHostPlatform();
  return <button onClick={() => toggleFavorite('home')}>save favorite</button>;
}

function mount(permissions: Session['user']['permissions'] = ['platform:view'], shell = true, registryForRender = registry, slots: PlatformSlots = {}) {
  return render(<I18nProvider><PlatformProvider adapter={adapterWith(permissions)} registry={registryForRender} slots={{ topBarTools: <button>injected tool</button>, ...slots }}>
    {shell ? <AppShell><input aria-label="editor" /><FavoriteControl /></AppShell> : <><AppRail /><AppSidebar collapsed={false} onToggle={() => {}} /></>}
  </PlatformProvider></I18nProvider>);
}

function openSwitcher() {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  fireEvent.click(screen.getByRole('button', { name: /^시스템 및 플랫폼 메뉴/ }));
  return screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' });
}

async function openUserMenu() {
  await userEvent.setup().click(within(screen.getByRole('navigation', { name: '시스템 레일' })).getByRole('button', { name: '사용자 메뉴' }));
  return screen.getByRole('menu');
}

describe('rail space navigation', () => {
  it('omits all space buttons with only one accessible space and keeps global tools', () => {
    mount();
    expect(screen.queryByRole('button', { name: /^공간:/ })).toBeNull();
    const rail = screen.getByRole('navigation', { name: '시스템 레일' });
    expect(within(rail).getByRole('button', { name: '시스템 및 플랫폼 메뉴 · 현재: 분석' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '메뉴 검색…' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'injected tool' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '도움말' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '사용자 메뉴' })).toBeTruthy();
  });

  it('uses Kernel space navigation from the switcher, preserving globals and pushing history with aria-current', async () => {
    mount(['platform:view', 'console:access']);
    const push = vi.spyOn(window.history, 'pushState');
    const dialog = openSwitcher();
    expect(within(dialog).getByRole('button', { name: /분석/ }).getAttribute('aria-current')).toBe('true');
    expect(within(dialog).getByRole('button', { name: /운영 콘솔/ }).hasAttribute('aria-current')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: /운영 콘솔/ }));
    await waitFor(() => expect(window.location.pathname).toBe('/operations/ops'));
    expect(new URLSearchParams(window.location.search).get('lotIds')).toBe('kept');
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('MEM');
    expect(push).toHaveBeenCalledTimes(1);
    // pathname changes at pushState, before React re-renders the switcher label: wait for the DOM, not the URL.
    expect(await screen.findByRole('button', { name: '시스템 및 플랫폼 메뉴 · 현재: 운영 콘솔' })).toBeTruthy();
    const rail = screen.getByRole('navigation', { name: '시스템 레일' });
    expect(within(rail).getByRole('button', { name: '관리' }).getAttribute('aria-current')).toBe('true');
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).queryByRole('link', { name: '홈' })).toBeNull();
    expect(within(nav).getByRole('link', { name: '운영 홈' })).toBeTruthy();
  });
});

describe('light sidebar', () => {
  it('toggles with the button and [, persists the existing key, and ignores text editing', () => {
    localStorage.setItem('platform:sidebar-collapsed', '0');
    const view = mount();
    const sidebar = view.container.querySelector('aside')!;
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    expect(localStorage.getItem('platform:sidebar-collapsed')).toBe('1');
    expect(screen.getByRole('button', { name: /^Scope:/ })).toBeTruthy();
    expect(within(screen.getByRole('group', { name: '개요' })).getByRole('link', { name: '홈' })).toBeTruthy();
    fireEvent.keyDown(window, { key: '[' });
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    expect(localStorage.getItem('platform:sidebar-collapsed')).toBe('0');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'editor' }), { key: '[' });
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    cleanup();
    expect(mount().container.querySelector('aside')?.getAttribute('data-collapsed')).toBe('false');
  });

  it('uses the existing viewport default only when no persisted value exists', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1439 });
    expect(mount().container.querySelector('aside')?.getAttribute('data-collapsed')).toBe('true');
    cleanup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    expect(mount().container.querySelector('aside')?.getAttribute('data-collapsed')).toBe('false');
  });

  it('renders flat sections, planned menus, favorites and exact recent URLs without a menu filter', async () => {
    localStorage.setItem('platform:sidebar-collapsed', '0');
    localStorage.setItem('platform:favorites:u1', JSON.stringify(['ops']));
    localStorage.setItem('platform:recent:u1', JSON.stringify([{ menuId: 'ops', url: '/ops?v=1&scopeId=MEM' }]));
    mount();
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).queryByRole('link', { name: /운영 홈/ })).toBeNull();
    expect(within(nav).getByRole('group', { name: '개요' })).toBeTruthy();
    expect(within(nav).getAllByText('예정').length).toBeGreaterThan(0);
    expect(within(nav).queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'save favorite' }));
    const favorites = screen.getByRole('region', { name: '즐겨찾기' });
    expect(within(favorites).getByRole('link', { name: '홈' })).toBeTruthy();
    const recent = await screen.findByRole('region', { name: '최근 방문' });
    expect(within(recent).getByRole('link', { name: '최근 방문: 홈' }).getAttribute('href')).toContain('lotIds=kept');
  });
});

describe('declared single-menu sidebar group labels', () => {
  it('omits the label for a non-overview group when declared and showing one menu', () => {
    const view = sidebarRegistry(groupId('equipment'), '설비관리', ['equipment-home'], true);
    mount(['platform:view'], false, view);

    const group = screen.getByRole('group', { name: '설비관리' });
    expect(within(group).queryByText('설비관리')).toBeNull();
    expect(within(group).getByRole('link', { name: '메뉴 1' })).toBeTruthy();
  });

  it('shows the label for overview when the group has no declaration', () => {
    const view = sidebarRegistry(groupId('overview'), '운영 개요', ['overview-home']);
    mount(['platform:view'], false, view);

    const group = screen.getByRole('group', { name: '운영 개요' });
    expect(within(group).getByText('운영 개요')).toBeTruthy();
  });

  it('shows the label for a declared group when two menus are visible', () => {
    const view = sidebarRegistry(groupId('equipment'), '설비관리', ['equipment-home', 'equipment-list'], true);
    mount(['platform:view'], false, view);

    const group = screen.getByRole('group', { name: '설비관리' });
    expect(within(group).getByText('설비관리')).toBeTruthy();
    expect(within(group).getAllByRole('link')).toHaveLength(2);
  });
});


describe('primary navigation boundary (#194 FIX1)', () => {
  it.each([false, true])('keeps favorite and recent links outside the registry menu tree (collapsed=%s)', async collapsed => {
    localStorage.setItem('platform:sidebar-collapsed', collapsed ? '1' : '0');
    localStorage.setItem('platform:favorites:u1', JSON.stringify(['home', 'ops']));
    localStorage.setItem('platform:recent:u1', JSON.stringify([{ menuId: 'home', url: '/?v=1&scopeId=MEM&lotIds=previous' }, { menuId: 'ops', url: '/ops' }]));
    mount();
    const primary = screen.getByRole('navigation', { name: '주 메뉴' });
    if (collapsed) {
      expect(screen.queryByRole('region', { name: '즐겨찾기' })).toBeNull();
      expect(screen.queryByRole('region', { name: '최근 방문' })).toBeNull();
      expect(within(primary).getAllByRole('link', { name: /홈/ })).toHaveLength(1);
      expect(within(primary).getAllByRole('link')).toHaveLength(1);
      return;
    }
    const favorites = screen.getByRole('region', { name: '즐겨찾기' });
    const recent = await screen.findByRole('region', { name: '최근 방문' });
    expect(within(favorites).getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
    expect(favorites.querySelector('[data-current-marker]')).toBeNull();
    expect(recent.querySelector('[data-current-marker]')).toBeNull();
    // Only the primary nav marks the home menu (the rail has no logo link any more); favorites and recent still do not.
    expect(document.querySelectorAll('a[aria-current=page]')).toHaveLength(1);
    // Match by substring, like Playwright's default name matching in the contract suite.
    expect(within(primary).getAllByRole('link', { name: /홈/ })).toHaveLength(1);
    expect(within(primary).getAllByRole('link')).toHaveLength(1);
    expect(primary.contains(favorites)).toBe(false);
    expect(primary.contains(recent)).toBe(false);
    expect(within(primary).queryByRole('link', { name: /최근 방문/ })).toBeNull();
    expect(within(favorites).getByRole('link', { name: '홈' })).toBeTruthy();
    expect(within(recent).getByRole('link', { name: '최근 방문: 홈' })).toBeTruthy();
    expect(within(favorites).queryByRole('link', { name: /운영 홈/ })).toBeNull();
    expect(within(recent).queryByRole('link', { name: /운영 홈/ })).toBeNull();
  });
});


describe('shell accessibility (#194 FIX2)', () => {
  it('keeps the empty-state guidance for favorites and recent in the expanded sidebar (07 §3)', () => {
    window.history.replaceState(null, '', '/unregistered?v=1');
    localStorage.setItem('platform:sidebar-collapsed', '0');
    mount();
    const favorites = screen.getByRole('region', { name: '즐겨찾기' });
    expect(within(favorites).getByText('즐겨찾기가 없습니다. 화면 제목 옆 ☆로 추가하세요.')).toBeTruthy();
    expect(within(favorites).queryByRole('link')).toBeNull();
    const recent = screen.getByRole('region', { name: '최근 방문' });
    expect(within(recent).getByText('최근 방문한 화면이 없습니다.')).toBeTruthy();
    expect(within(recent).queryByRole('link')).toBeNull();
  });

  it('moves the language toggle into the user menu, which stays open after switching', async () => {
    mount();
    expect(within(screen.getByRole('navigation', { name: '시스템 레일' })).queryByRole('button', { name: /언어|Language/ })).toBeNull();
    const menu = await openUserMenu();
    const user = userEvent.setup();
    await user.click(within(menu).getByRole('menuitem', { name: /^언어/ }));
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Language/ })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });

  it('marks only the current menu and section with a persistent shape, and keeps groups out of region/headings', async () => {
    localStorage.setItem('platform:sidebar-collapsed', '0');
    mount(['platform:view', 'console:access']);
    const primary = screen.getByRole('navigation', { name: '주 메뉴' });
    const home = within(primary).getByRole('link', { name: '홈' });
    expect(home.querySelector('[data-current-marker]')).toHaveAttribute('aria-hidden', 'true');
    expect(home.querySelector('[data-current-marker]')).toHaveClass('w-0.5');
    expect(within(primary).getByText('예정')).toHaveClass('text-text-secondary');
    expect(within(primary).queryByRole('region')).toBeNull();
    expect(within(primary).queryByRole('heading')).toBeNull();
    const rail = screen.getByRole('navigation', { name: '시스템 레일' });
    // aria-current="page" is the current menu only; the section button says "true" (06 §26).
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(within(rail).getByRole('button', { name: '개요' }).getAttribute('aria-current')).toBe('true');
    expect(within(rail).getByRole('button', { name: '개요' }).querySelector('[data-current-marker]')).toHaveClass('w-0.5');
    expect(within(rail).queryByRole('button', { name: '관리' })).toBeNull();
    fireEvent.click(within(openSwitcher()).getByRole('button', { name: /운영 콘솔/ }));
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: '시스템 레일' })).getByRole('button', { name: '관리' }).querySelector('[data-current-marker]')).toBeTruthy());
    expect(within(screen.getByRole('navigation', { name: '시스템 레일' })).queryByRole('button', { name: '개요' })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '운영 홈' }).querySelector('[data-current-marker]')).toBeTruthy();
  });
});


describe('CommandPalette text pairings (DESIGN.md)', () => {
  it('keeps the sunken navigation hint readable', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '메뉴 검색…' }));
    const hint = await screen.findByText(/이동 시 전역 Context를 보존합니다/);
    expect(hint.className).toContain('bg-surface-sunken');
    expect(hint.className).toContain('text-text-secondary');
    expect(hint.className).not.toContain('text-text-muted');
  });

  it('keeps active option metadata readable through keyboard selection', async () => {
    mount(['platform:view', 'console:access']);
    fireEvent.click(screen.getByRole('button', { name: '메뉴 검색…' }));
    const input = await screen.findByRole('combobox');
    const activeMetadata = () => {
      const option = screen.getAllByRole('option').find(row => row.getAttribute('aria-selected') === 'true')!;
      expect(option.className).toContain('bg-accent-primary-soft');
      const metadata = within(option).getByText(/ · /);
      expect(metadata.className).toContain('text-text-secondary');
      expect(metadata.className).not.toContain('text-text-muted');
    };
    activeMetadata();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    activeMetadata();
  });
});

function DetailPage() {
  const { pageParam, setPage } = useHostPlatform();
  return <><button onClick={() => setPage({ focus: 'entity' })}>open detail</button>
    {pageParam('focus') && <DetailDrawer title="Detail" onClose={() => setPage({ focus: null })}
      tab={pageParam('tab') ?? undefined} onTabChange={tab => setPage({ tab })}
      tabs={[{ id: 'a', label: 'Attributes', content: 'content' }, { id: 'audit', label: 'Audit', content: 'audit content' }]} />}</>;
}

it('owns a full-height named aside beside main, with a clamped theme width and hidden host when empty', () => {
  const view = render(<I18nProvider><PlatformProvider adapter={adapterWith()} registry={registry}>
    <AppShell><DetailPage /></AppShell>
  </PlatformProvider></I18nProvider>);
  const slot = view.container.querySelector<HTMLElement>('aside[aria-label="상세 패널"]')!;
  expect(slot.hidden).toBe(true);
  expect(screen.queryByRole('complementary', { name: '상세 패널' })).toBeNull();
  const main = screen.getByRole('main');
  expect(slot.classList.contains('w-0')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'open detail' }));
  expect(slot.hidden).toBe(false);
  expect(screen.getByRole('complementary', { name: '상세 패널' })).toBe(slot);
  expect(slot.classList.contains('w-[clamp(360px,var(--detail-panel-width,440px),520px)]')).toBe(true);
  expect(slot.classList.contains('min-w-[360px]')).toBe(true);
  expect(slot.classList.contains('max-w-[520px]')).toBe(true);
  expect(slot.classList.contains('border-l')).toBe(true);
  expect(slot.classList.contains('h-full')).toBe(true);
  expect(slot.classList.contains('shrink-0')).toBe(true);
  expect(main.parentElement?.parentElement?.parentElement).toBe(slot.parentElement); // main sits in the board window's area box (893d2)
  expect(slot.contains(screen.getByRole('dialog', { name: 'Detail' }))).toBe(true);
  expect(main.contains(screen.getByRole('dialog'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
  expect(slot.classList.contains('w-0')).toBe(true);
  expect(slot.classList.contains('border-l-0')).toBe(true);
  expect(slot.childElementCount).toBe(0);
  expect(slot.hidden).toBe(true);
  expect(screen.queryByRole('complementary', { name: '상세 패널' })).toBeNull();
});

it('opens the named slot and selected tab from URL focus/tab and clears focus on Esc', () => {
  window.history.replaceState(null, '', '/?v=1&focus=entity&tab=audit');
  render(<I18nProvider><PlatformProvider adapter={adapterWith()} registry={registry}>
    <AppShell><DetailPage /></AppShell>
  </PlatformProvider></I18nProvider>);
  expect(screen.getByRole('tab', { name: 'Audit' }).getAttribute('aria-selected')).toBe('true');
  const close = screen.getByRole('button', { name: '상세 닫기' });
  // First load restores the panel and leaves focus where the browser put it (ADR-0032).
  expect(close).not.toBe(document.activeElement);
  close.focus();
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('main')).toBe(document.activeElement);
  for (const token of ['focus-visible:ring-2', 'focus-visible:ring-inset', 'focus-visible:ring-focus-ring']) {
    expect(screen.getByRole('main').classList.contains(token)).toBe(true);
  }
});

const feedbackSlot: FeatureSlot = {
  entriesFor: spaceId => spaceId === 'mars' ? [
    { key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Task' }, menuId: 'home' },
    { key: 'voc-create', icon: MessageSquarePlus, label: { ko: 'VOC 등록', en: 'File a VOC' }, menuId: 'home' },
  ] : spaceId === 'operations' ? [] : null,
};

function globalShellRegistry(equipmentPermission: Permission = 'platform:view') {
  return createRegistry({
    platformHomeMenuId: 'home',
    permissions: [menuPermission('equipment:view')],
    spaces: [
      testSpace({ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'equipment' }),
      testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'ops', permission: 'console:access' }),
    ],
    groups: [
      { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
      { id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('mars') },
      { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') },
    ],
    menus: [
      { id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] },
      menu('equipment', groupId('equipment'), '/equipment', equipmentPermission),
      menu('ops', groupId('admin'), '/ops', 'console:access'),
    ],
  });
}

function logoRegistry() {
  return createRegistry({
    platformHomeMenuId: 'home',
    permissions: [menuPermission('equipment:view')],
    spaces: [testSpace({ homeMenuId: 'equipment' })],
    groups: [
      { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
      { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notices' }, icon: House, space: null },
      { id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('mars') },
    ],
    menus: [
      { id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] },
      { id: 'notices', group: groupId('noticeVoc'), primary: true, label: { ko: '공지', en: 'Notices' }, description: { ko: '', en: '' }, path: '/notices', icon: House, permission: 'notice:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] },
      menu('equipment', groupId('equipment'), '/equipment', 'platform:view'),
    ],
  });
}

describe('workspace shell layout (15 §3.1)', () => {
  it('offers the platform home inside the switcher, not as a rail logo link, and shows a plain mark when / is unregistered', () => {
    mount(['platform:view'], true, logoRegistry());
    const rail = screen.getByRole('navigation', { name: '시스템 레일' });
    expect(within(rail).queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    const home = within(within(openSwitcher()).getByRole('navigation', { name: '플랫폼 메뉴' })).getByRole('link', { name: '홈' });
    expect(home.getAttribute('href')).toMatch(/^\//);
    expect(screen.queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    cleanup();
    mount(['platform:view'], false, sidebarRegistry(groupId('equipment'), '설비관리', ['equipment-home']));
    openSwitcher();
    expect(screen.queryByRole('link', { name: '홈' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: '플랫폼 메뉴' })).toBeNull();
  });

  it('omits the switcher home link when / is registered but cannot be opened', () => {
    window.history.replaceState(null, '', '/?v=1');
    mount(['notice:view'], true, logoRegistry());
    expect(screen.getByRole('button', { name: '시스템 및 플랫폼 메뉴' })).toBeTruthy();
    openSwitcher();
    expect(screen.queryByRole('link', { name: '홈' })).toBeNull();
    expect(screen.queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
  });

  it.each([
    ['home', '/?v=1', '시스템 및 플랫폼 메뉴'],
    ['notices', '/notices?v=1', '시스템 및 플랫폼 메뉴'],
    ['space', '/equipment?v=1', '시스템 및 플랫폼 메뉴 · 현재: 분석'],
  ])('names the switcher by the current system only inside a space (%s)', (_label, url, name) => {
    window.history.replaceState(null, '', url);
    mount(['platform:view', 'notice:view'], true, logoRegistry());
    const rail = screen.getByRole('navigation', { name: '시스템 레일' });
    expect(within(rail).getByRole('button', { name })).toBeTruthy();
    expect(within(rail).queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    expect(rail.querySelector('a[aria-current]')).toBeNull();
  });

  it('draws each FeedbackOps entry with the icon the slot passes, whatever its key (ADR-0072)', () => {
    mount(['platform:view'], true, registry, { features: { entriesFor: id => id === 'mars' ? [
      { key: 'first', icon: Star, label: { ko: '첫째', en: 'First' }, menuId: 'home' },
      { key: 'task', icon: Rocket, label: { ko: '둘째', en: 'Second' }, menuId: 'home' },
    ] : null } });
    const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
    const [first, second] = within(block).getAllByRole('link').map(link => link.querySelector('svg')!);

    expect(first.classList.contains('lucide-star')).toBe(true);
    expect(second.classList.contains('lucide-rocket')).toBe(true);
  });

  it('renders FeedbackOps entries in slot order outside the scroll region', () => {
    mount(['platform:view', 'features:access'], true, registry, { features: feedbackSlot });
    const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
    const scroll = document.querySelector('.shell-scroll');
    expect(scroll?.contains(block)).toBe(false);
    const links = within(block).getAllByRole('link');
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'Task — 분석, FeedbackOps',
      'VOC 등록 — 분석, FeedbackOps',
    ]);
    expect([block.getAttribute('aria-label'), ...links.map(link => link.getAttribute('aria-label'))].join(' ')).not.toContain('FeedbackOps 검사 전용 시스템 부제');
    for (const link of links) {
      expect(link.hasAttribute('target')).toBe(false);
      expect(link.hasAttribute('aria-current')).toBe(false);
      expect(link.querySelectorAll('svg')).toHaveLength(1);
    }
    expect(within(block).getByText('FeedbackOps로 이동합니다')).toBeTruthy();
  });

  it('shows only entry icons, in the same order, when the sidebar is collapsed', () => {
    localStorage.setItem('platform:sidebar-collapsed', '1');
    mount(['platform:view'], true, registry, { features: feedbackSlot });
    const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
    expect(block.textContent).not.toContain('FeedbackOps · 분석');
    const links = within(block).getAllByRole('link');
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'Task — 분석, FeedbackOps',
      'VOC 등록 — 분석, FeedbackOps',
    ]);
    for (const link of links) expect(link.querySelectorAll('svg')).toHaveLength(1);
  });

  describe('in-shell VOC entry (#760, ADR-0081 decision 7)', () => {
    const foRegistry = createRegistry({
      permissions: [menuPermission('equipment:view')],
      spaces: registry.spaces,
      groups: registry.groups,
      menus: [...registry.menus, { ...menu('fo-inbox', groupId('overview'), '/feedbackops/vocs', 'platform:view'), primary: false, pageKeys: ['managedSystem', 'returnTo'] }],
    });
    const SYSTEM = '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    const vocEntry = { key: 'voc', icon: MessagesSquare, label: { ko: 'VOC', en: 'VOC' }, menuId: 'fo-inbox', page: { managedSystem: SYSTEM } };
    const taskEntry = { key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Task' }, menuId: 'home' };
    const slotOf = (entries: FeatureSlot['entriesFor'] extends (...args: never[]) => infer R ? R : never, permission?: Permission): FeatureSlot => ({ entriesFor: id => id === 'mars' ? entries : null, ...(permission ? { permission } : {}) });

    it('opens VOC in the same tab with only v, managedSystem and returnTo; the in-shell caption shows', () => {
      window.history.replaceState(null, '', '/mars/home?v=1&from=2026-10-01T00:00:00&to=2026-10-02T00:00:00&scopeId=MEM');
      mount(['platform:view', 'features:access'], true, foRegistry, { features: slotOf([vocEntry, taskEntry], 'features:access') });
      const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
      const [voc, task] = within(block).getAllByRole('link');
      expect(voc.getAttribute('aria-label')).toBe('VOC — 분석, FeedbackOps');
      expect(voc.hasAttribute('target')).toBe(false);
      expect(voc.querySelectorAll('svg')).toHaveLength(1);
      const href = new URL(voc.getAttribute('href')!, 'http://x');
      expect(href.pathname).toBe('/mars/fo-inbox');
      expect([...href.searchParams.keys()].sort()).toEqual(['managedSystem', 'returnTo', 'v']);
      expect(href.searchParams.get('managedSystem')).toBe(SYSTEM);
      expect(href.searchParams.get('returnTo')).toBe('/mars/home?v=1&from=2026-10-01T00:00:00&to=2026-10-02T00:00:00&scopeId=MEM');
      expect(task.getAttribute('aria-label')).toBe('Task — 분석, FeedbackOps');
      expect(task.hasAttribute('target')).toBe(false);
      expect(within(block).getByText('FeedbackOps로 이동합니다')).toBeTruthy();
    });

    it('draws the in-shell caption and the VOC link opens the registered menu', () => {
      mount(['platform:view', 'features:access'], true, foRegistry, { features: slotOf([vocEntry]) });
      const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
      expect(within(block).getByText('FeedbackOps로 이동합니다')).toBeTruthy();
      expect(within(block).getByRole('link', { name: 'VOC — 분석, FeedbackOps' }).getAttribute('href')).toContain('/mars/fo-inbox');
    });

    it('draws no block at all without the slot permission, and keeps three icons with names when collapsed', () => {
      mount(['platform:view'], true, foRegistry, { features: slotOf([vocEntry, taskEntry], 'features:access') });
      expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
      cleanup();
      localStorage.setItem('platform:sidebar-collapsed', '1');
      mount(['platform:view', 'features:access'], true, foRegistry, { features: slotOf([vocEntry, taskEntry], 'features:access') });
      const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
      expect(within(block).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['VOC — 분석, FeedbackOps', 'Task — 분석, FeedbackOps']);
    });

    it('omits an in-shell entry whose menu the user cannot open', () => {
      mount(['platform:view'], true, foRegistry, { features: slotOf([{ ...vocEntry, menuId: 'ops' }, taskEntry]) });
      const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
      expect(within(block).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['Task — 분석, FeedbackOps']);
    });
  });

  it.each([
    ['null', null],
    ['empty', [] as const],
  ])('omits the block when entriesFor returns %s', (_label, entries) => {
    mount(['platform:view'], true, registry, { features: { entriesFor: () => entries } });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
  });

  it('hides the sidebar, the rail sections and the current card on a global screen', () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    mount(['platform:view', 'console:access'], true, globalShellRegistry());
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.queryByRole('group', { name: '시스템 섹션' })).toBeNull();
    const dialog = openSwitcher();
    expect(within(dialog).getByRole('button', { name: /분석/ }).hasAttribute('aria-current')).toBe(false);
    expect(within(dialog).getByRole('button', { name: /운영 콘솔/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('draws the platform sidebar instead of the business one when no space is accessible', () => {
    window.history.replaceState(null, '', '/?v=1');
    mount(['platform:view'], true, globalShellRegistry(menuPermission('equipment:view')));
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.getByRole('navigation', { name: '플랫폼 메뉴' })).toBeTruthy();
  });

  it('keeps the fallback sidebar on an unmatched path and still withholds the rail sections, the current card and the FeedbackOps block', () => {
    window.history.replaceState(null, '', '/unregistered?v=1');
    mount(['platform:view', 'console:access'], true, globalShellRegistry(), { features: feedbackSlot });
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: '시스템 섹션' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    const dialog = openSwitcher();
    expect(within(dialog).getByRole('button', { name: /분석/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('omits FeedbackOps on a space-denied direct URL and does not query that space', () => {
    const seen: string[] = [];
    window.history.replaceState(null, '', '/ops?v=1');
    mount(['platform:view'], true, registry, { features: {
      entriesFor: spaceId => { seen.push(spaceId); return [{ key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Task' }, menuId: 'home' }]; },
    } });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    expect(seen).not.toContain('operations');
  });

  it('drops the FeedbackOps block when space entry is revoked on the same route', () => {
    const listeners = new Set<() => void>();
    const seen: string[] = [];
    let session = testSession(['platform:view', 'console:access']);
    const adapter: PlatformAdapter = {
      ...adapterWith(['platform:view', 'console:access']),
      session: () => session,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    };
    window.history.replaceState(null, '', '/ops?v=1');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ features: {
      entriesFor: spaceId => { seen.push(spaceId); return [{ key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Task' }, menuId: 'home' }]; },
    } }}>
      <AppShell><input aria-label="editor" /></AppShell>
    </PlatformProvider></I18nProvider>);
    expect(screen.getByRole('navigation', { name: 'FeedbackOps · 운영 콘솔' })).toBeTruthy();
    seen.length = 0;
    act(() => {
      session = { ...session, user: { ...session.user, permissions: ['platform:view'] } };
      for (const listener of listeners) listener();
    });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    expect(seen).not.toContain('operations');
  });

  it('omits FeedbackOps on an unregistered path even when the fallback space has entries', () => {
    const seen: string[] = [];
    window.history.replaceState(null, '', '/unregistered?v=1');
    mount(['platform:view', 'console:access'], true, registry, { features: {
      entriesFor: spaceId => { seen.push(spaceId); return [{ key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Task' }, menuId: 'home' }]; },
    } });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    expect(seen).toEqual([]);
  });
});

// #304 F2: a toast can carry the server original as named detail; the shell draws it like StateMessage's 서버 세부.
describe('toast detail', () => {
  it('renders the toast detail as a note named 서버 세부, beneath the body text', () => {
    function DetailToastProbe() {
      const { toast } = useHostPlatform();
      return <button type="button" onClick={() => toast('내보내기를 수행하지 못했습니다. 다시 시도하고, 반복되면 관리자에게 문의하세요.', 'warning', '시간 도메인이 다른 실행을 함께 내보낼 수 없습니다 (correlationId: corr-7)')}>fire toast</button>;
    }
    render(<I18nProvider><PlatformProvider adapter={adapterWith()} registry={registry}>
      <AppShell><DetailToastProbe /></AppShell>
    </PlatformProvider></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'fire toast' }));
    const note = screen.getByRole('note', { name: '서버 세부' });
    expect(note.textContent).toContain('시간 도메인이 다른 실행을 함께 내보낼 수 없습니다');
    expect(note.textContent).toContain('correlationId: corr-7');
    expect(note.textContent).not.toContain('내보내기를 수행하지 못했습니다');
  });
});

describe('toast action and caller-driven dismiss (#761 k2)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  function ActionProbe({ onAction, durationMs, onId }: { onAction: () => void; durationMs?: number; onId?: (id: number) => void }) {
    const { toast, dismissToast } = useHostPlatform();
    const [id, setId] = useState(0);
    return <>
      <button type="button" onClick={() => { const n = toast('분류했습니다.', 'info', undefined, { action: { label: '되돌리기', onAction }, ...(durationMs === undefined ? {} : { durationMs }) }); setId(n); onId?.(n); }}>fire</button>
      <button type="button" onClick={() => dismissToast(id)}>dismiss by id</button>
    </>;
  }
  const mount = (probe: ReactNode) => render(<I18nProvider><PlatformProvider adapter={adapterWith()} registry={registry}><AppShell>{probe}</AppShell></PlatformProvider></I18nProvider>);

  it('runs onAction once and removes the toast', () => {
    const onAction = vi.fn();
    mount(<ActionProbe onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('분류했습니다.')).toBeNull();
  });
  it('dismissToast(id) with the returned id removes the toast', () => {
    mount(<ActionProbe onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('분류했습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'dismiss by id' }));
    expect(screen.queryByText('분류했습니다.')).toBeNull();
  });
  it('honours durationMs', () => {
    mount(<ActionProbe onAction={vi.fn()} durationMs={9000} />);
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText('분류했습니다.')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.queryByText('분류했습니다.')).toBeNull();
  });
  it('waits while the action button has focus and restarts after blur', () => {
    mount(<ActionProbe onAction={vi.fn()} durationMs={8000} />);
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    const action = screen.getByRole('button', { name: '되돌리기' });
    act(() => { action.focus(); });
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByText('분류했습니다.')).toBeInTheDocument();
    act(() => { action.blur(); });
    act(() => { vi.advanceTimersByTime(7900); });
    expect(screen.getByText('분류했습니다.')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('분류했습니다.')).toBeNull();
  });
  it('an action toast without durationMs never auto-dismisses and holds no timer (#886)', () => {
    mount(<ActionProbe onAction={vi.fn()} />);
    const base = vi.getTimerCount();
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(vi.getTimerCount()).toBe(base);
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(screen.getByText('분류했습니다.')).toBeInTheDocument();
    const action = screen.getByRole('button', { name: '되돌리기' });
    act(() => { action.focus(); });
    act(() => { action.blur(); });
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(screen.getByText('분류했습니다.')).toBeInTheDocument();
  });
  it('a plain toast pauses while the pointer is inside and restarts the full 5 s after (#886)', () => {
    function Plain() { const { toast } = useHostPlatform(); return <button type="button" onClick={() => toast('안내')}>plain</button>; }
    mount(<Plain />);
    fireEvent.click(screen.getByRole('button', { name: 'plain' }));
    const item = screen.getByText('안내').closest('[data-toast-item]')!;
    fireEvent.pointerEnter(item);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.getByText('안내')).toBeInTheDocument();
    fireEvent.pointerLeave(item);
    act(() => { vi.advanceTimersByTime(4900); });
    expect(screen.getByText('안내')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('안내')).toBeNull();
  });
  it('evicting a held toast by the 4-item cap leaves nothing that resurrects or lingers', () => {
    mount(<ActionProbe onAction={vi.fn()} durationMs={8000} />);
    const fire = screen.getByRole('button', { name: 'fire' });
    fireEvent.click(fire);
    act(() => { screen.getByRole('button', { name: '되돌리기' }).focus(); });
    for (let i = 0; i < 4; i += 1) fireEvent.click(fire);
    expect(screen.getAllByRole('button', { name: '되돌리기' })).toHaveLength(4);
    act(() => { vi.advanceTimersByTime(8100); });
    expect(screen.queryAllByRole('button', { name: '되돌리기' })).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.queryAllByRole('button', { name: '되돌리기' })).toHaveLength(0);
  });
  it('evicting an unheld long-duration toast retires its timer', () => {
    mount(<ActionProbe onAction={vi.fn()} durationMs={600000} />);
    const fire = screen.getByRole('button', { name: 'fire' });
    const base = vi.getTimerCount();
    for (let i = 0; i < 5; i += 1) fireEvent.click(fire);
    expect(vi.getTimerCount()).toBe(base + 4);
  });
  it('a held toast whose shell unmounts releases the hold and still expires', () => {
    function Host() {
      const [shown, setShown] = useState(true);
      return <I18nProvider><PlatformProvider adapter={adapterWith()} registry={registry}>
        <ActionProbe onAction={vi.fn()} durationMs={8000} />
        <button type="button" onClick={() => setShown(false)}>drop shell</button>
        {shown && <AppShell>{null}</AppShell>}
      </PlatformProvider></I18nProvider>;
    }
    render(<Host />);
    const base = vi.getTimerCount();
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    act(() => { screen.getByRole('button', { name: '되돌리기' }).focus(); });
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'drop shell' }));
    expect(vi.getTimerCount()).toBe(base + 1);
  });
  it('a toast without action still auto-dismisses after 5 s and has no action button', () => {
    function Plain() { const { toast } = useHostPlatform(); return <button type="button" onClick={() => toast('안내')}>plain</button>; }
    mount(<Plain />);
    fireEvent.click(screen.getByRole('button', { name: 'plain' }));
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByText('안내')).toBeNull();
  });
});

// #310: the palette scrim rose to z-60; the toast layer must stay above it or the scrim swallows Dismiss clicks.
describe('toast layer above palette scrim (#310)', () => {
  it('keeps the toast container above the open palette overlay', () => {
    function PaletteToastProbe() {
      const { toast, setPaletteOpen } = useHostPlatform();
      return <>
        <button type="button" onClick={() => setPaletteOpen(true)}>open palette</button>
        <button type="button" onClick={() => toast('내보내기를 시작합니다.')}>fire toast</button>
      </>;
    }
    render(<I18nProvider><PlatformProvider adapter={adapterWith()} registry={registry}>
      <AppShell><PaletteToastProbe /></AppShell>
    </PlatformProvider></I18nProvider>);
    // Radix's modal Dialog aria-hides outside content, so grab both buttons before opening.
    const fireToast = screen.getByRole('button', { name: 'fire toast' });
    fireEvent.click(screen.getByRole('button', { name: 'open palette' }));
    fireEvent.click(fireToast);
    const overlay = document.querySelector('[data-state="open"][class*="inset-0"]');
    expect(overlay).toBeInTheDocument();
    const toastHost = screen.getByText('내보내기를 시작합니다.').closest('[data-toast-stack]');
    expect(toastHost).toBeInTheDocument();
    expect(Number(toastHost!.className.match(/z-\[?(\d+)\]?/)![1])).toBeGreaterThan(Number(overlay!.className.match(/z-\[?(\d+)\]?/)![1]));
  });
});

function platformSidebarRegistry() {
  const entry = (id: string, group: GroupId, path: string, label: string, permission: Permission, primary: boolean) => ({ ...menu(id, group, path, permission), label: { ko: label, en: label }, primary });
  return createRegistry({
    platformHomeMenuId: 'home',
    permissions: [menuPermission('equipment:view')],
    spaces: [testSpace({ homeMenuId: 'equipment' })],
    groups: [
      { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null, hideLabelWhenSingle: true },
      { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: House, space: null },
      { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notices' }, icon: House, space: null, hideLabelWhenSingle: true },
      { id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('mars') },
    ],
    menus: [
      entry('notices', groupId('noticeVoc'), '/notices', '공지', 'notice:view', true),
      entry('alerts', groupId('myActivity'), '/alerts', '알림', 'platform:view', true),
      entry('surveys', groupId('myActivity'), '/surveys', '설문', menuPermission('equipment:view'), false),
      entry('home', groupId('overview'), '/', '플랫폼 홈', 'platform:view', true),
      entry('equipment', groupId('equipment'), '/equipment', '설비 목록', 'platform:view', true),
    ],
  });
}
const PLATFORM_PERMISSIONS: Permission[] = ['platform:view', 'notice:view', menuPermission('equipment:view')];

describe('platform sidebar (ADR-0070)', () => {
  beforeEach(() => { localStorage.setItem('platform:sidebar-collapsed', '0'); });

  it.each([['/?v=1'], ['/alerts?v=1'], ['/notices?v=1']])('replaces the business sidebar on the global screen %s', url => {
    window.history.replaceState(null, '', url);
    mount(PLATFORM_PERMISSIONS, true, platformSidebarRegistry());
    const nav = screen.getByRole('navigation', { name: '플랫폼 메뉴' });
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(within(nav).getAllByRole('group').map(group => group.getAttribute('aria-label'))).toEqual(['개요', '내 활동', '공지']);
    expect(within(nav).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['홈', '알림', '설문', '공지']);
    expect(within(nav).getByText('내 활동')).toBeTruthy();
    expect(within(nav).queryByText('개요')).toBeNull();
    expect(within(nav).getAllByText('공지')).toHaveLength(1);
    expect(within(nav).getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
    expect(within(nav).getByRole('link', { name: url.startsWith('/alerts') ? '알림' : url.startsWith('/notices') ? '공지' : '홈' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('region', { name: '즐겨찾기' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
  });

  it('omits a destination whose menu permission the user lacks', () => {
    window.history.replaceState(null, '', '/?v=1');
    mount(['platform:view', 'notice:view'], true, platformSidebarRegistry());
    const nav = screen.getByRole('navigation', { name: '플랫폼 메뉴' });
    expect(within(nav).queryByRole('link', { name: '설문' })).toBeNull();
    expect(within(nav).getByRole('link', { name: '알림' })).toBeTruthy();
  });

  it('keeps the business sidebar on a space screen and draws neither sidebar on the board', () => {
    window.history.replaceState(null, '', '/equipment?v=1');
    mount(PLATFORM_PERMISSIONS, true, platformSidebarRegistry());
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '플랫폼 메뉴' })).toBeNull();
    cleanup();
    window.history.replaceState(null, '', '/board');
    mount(PLATFORM_PERMISSIONS, true, platformSidebarRegistry());
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: '플랫폼 메뉴' })).toBeNull();
  });

  it('shares one collapse state with the business sidebar: button and [ key toggle platform:sidebar-collapsed', () => {
    window.history.replaceState(null, '', '/?v=1');
    const view = mount(PLATFORM_PERMISSIONS, true, platformSidebarRegistry());
    fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(localStorage.getItem('platform:sidebar-collapsed')).toBe('1');
    expect(view.container.querySelector('aside[data-collapsed]')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-keyshortcuts', '[');
    fireEvent.keyDown(document.body, { key: '[' });
    expect(localStorage.getItem('platform:sidebar-collapsed')).toBe('0');
    fireEvent.keyDown(document.body, { key: '[' });
    cleanup();
    window.history.replaceState(null, '', '/equipment?v=1');
    const space = mount(PLATFORM_PERMISSIONS, true, platformSidebarRegistry());
    expect(space.container.querySelector('aside[data-collapsed]')).toHaveAttribute('data-collapsed', 'true');
  });
});

// Sidebar sub-items, count badges and the space section (06 §8, #761). The fixture slots are module-level so their identity is stable.
function navViewsRegistry(second?: boolean) {
  const base = (id: string, path: string, over: object = {}) => ({ ...menu(id, groupId('overview'), path, 'platform:view'), label: { ko: id === 'inbox' ? '수신함' : '다른 메뉴', en: id === 'inbox' ? 'Inbox' : 'Other' }, primary: id === 'inbox', ...over });
  return createRegistry({
    spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'inbox' }), ...(second ? [testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'ops', permission: 'console:access' })] : [])],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }, ...(second ? [{ id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') }] : [])],
    menus: [
      base('inbox', '/inbox', { pageKeys: ['tab'], navViews: [{ id: 'mine', label: { ko: '내 것', en: 'Mine' }, page: { tab: 'mine' } }, { id: 'all', label: { ko: '전체', en: 'All' }, page: { tab: 'all' } }] }),
      base('other', '/other'),
      ...(second ? [{ ...menu('ops', groupId('admin'), '/ops', 'console:access') }] : []),
    ],
  });
}
// Holds a real hook so a slot component called inline in the sidebar (instead of rendered as an element) would change the sidebar's hook order.
const CountsA = ({ children }: { children: (counts: Readonly<Record<string, number>> | null) => ReactNode }) => {
  const [counts] = useState<Readonly<Record<string, number>>>({ inbox: 48, 'inbox/mine': 7, other: 0 });
  useEffect(() => {}, []);
  return <>{children(counts)}</>;
};
const CountsNull = ({ children }: { children: (counts: Readonly<Record<string, number>> | null) => ReactNode }) => <>{children(null)}</>;
const SectionBody = () => <p>saved views body</p>;

describe('sidebar navViews, navCounts and spaceNavSection (#761)', () => {
  beforeEach(() => { localStorage.setItem('platform:sidebar-collapsed', '0'); });
  const primary = () => screen.getByRole('navigation', { name: '주 메뉴' });

  it('draws views under their menu and marks only the matching view current', () => {
    window.history.replaceState(null, '', '/inbox?v=1&tab=mine');
    mount(['platform:view'], true, navViewsRegistry());
    expect(within(primary()).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['수신함', '내 것', '전체', '다른 메뉴']);
    expect(document.querySelectorAll('a[aria-current=page]')).toHaveLength(1);
    expect(within(primary()).getByRole('link', { name: '내 것' })).toHaveAttribute('aria-current', 'page');
    expect(within(primary()).getByRole('link', { name: '수신함' })).not.toHaveAttribute('aria-current');
    expect(within(primary()).getByRole('link', { name: '전체' })).toHaveAttribute('href', expect.stringContaining('tab=all'));
  });

  it('keeps the parent row current when no view matches', () => {
    window.history.replaceState(null, '', '/inbox?v=1&tab=other');
    mount(['platform:view'], true, navViewsRegistry());
    expect(document.querySelectorAll('a[aria-current=page]')).toHaveLength(1);
    expect(within(primary()).getByRole('link', { name: '수신함' })).toHaveAttribute('aria-current', 'page');
  });

  it('draws no sub-items in the collapsed sidebar', () => {
    localStorage.setItem('platform:sidebar-collapsed', '1');
    window.history.replaceState(null, '', '/inbox?v=1&tab=mine');
    mount(['platform:view'], true, navViewsRegistry(), { navCounts: { For: () => CountsA }, spaceNavSection: { For: () => ({ label: { ko: '저장된 보기', en: 'Saved' }, Body: SectionBody }) } });
    expect(within(primary()).getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /내 것/ })).toBeNull();
    expect(screen.queryByRole('region', { name: '저장된 보기' })).toBeNull();
    expect(document.querySelectorAll('a[aria-current=page]')).toHaveLength(1);
  });

  it('shows count badges inside the accessible name, with no collapsed dot, and nothing for a null or absent count', () => {
    window.history.replaceState(null, '', '/other?v=1');
    mount(['platform:view'], true, navViewsRegistry(), { navCounts: { For: () => CountsA } });
    const nav = within(primary());
    expect(nav.getByRole('link', { name: '수신함, 48건' })).toHaveTextContent('48');
    expect(nav.getByRole('link', { name: '내 것, 7건' })).toHaveTextContent('7');
    expect(nav.getByRole('link', { name: '전체' })).not.toHaveTextContent(/\d/);
    expect(nav.getByRole('link', { name: '다른 메뉴, 0건' })).toHaveTextContent('0');
    cleanup();
    mount(['platform:view'], true, navViewsRegistry(), { navCounts: { For: () => CountsNull } });
    expect(within(primary()).getByRole('link', { name: '수신함' })).not.toHaveTextContent(/\d/);
    cleanup();
    localStorage.setItem('platform:sidebar-collapsed', '1');
    const collapsed = mount(['platform:view'], true, navViewsRegistry(), { navCounts: { For: () => CountsA } });
    expect(collapsed.container.querySelector('a[aria-label="수신함, 48건"] [class*="bg-accent-danger"]')).toBeNull();
  });

  it('draws the space section only when expanded, after the primary menu and before favorites', () => {
    window.history.replaceState(null, '', '/other?v=1');
    mount(['platform:view'], true, navViewsRegistry(), { spaceNavSection: { For: () => ({ label: { ko: '저장된 보기', en: 'Saved' }, Body: SectionBody }) } });
    const section = screen.getByRole('region', { name: '저장된 보기' });
    expect(within(section).getByText('saved views body')).toBeTruthy();
    expect(primary().compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(screen.getByRole('region', { name: '즐겨찾기' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('switches space without a hook-order error when the next space has no counts or section', async () => {
    window.history.replaceState(null, '', '/other?v=1');
    const slots: PlatformSlots = {
      navCounts: { For: id => (id === 'mars' ? CountsA : null) },
      spaceNavSection: { For: id => (id === 'mars' ? { label: { ko: '저장된 보기', en: 'Saved' }, Body: SectionBody } : null) },
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(['platform:view', 'console:access'], true, navViewsRegistry(true), slots);
    expect(within(primary()).getByRole('link', { name: '수신함, 48건' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '저장된 보기' })).toBeTruthy();
    fireEvent.click(within(openSwitcher()).getByRole('button', { name: /운영 콘솔/ }));
    await waitFor(() => expect(screen.queryByRole('region', { name: '저장된 보기' })).toBeNull());
    expect(within(primary()).queryByRole('link', { name: /48건/ })).toBeNull();
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/hook|Rendered (more|fewer)/i);
    fireEvent.click(within(openSwitcher()).getByRole('button', { name: /분석/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: '저장된 보기' })).toBeTruthy());
    expect(within(primary()).getByRole('link', { name: '수신함, 48건' })).toBeTruthy();
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/hook|Rendered (more|fewer)/i);
  });

  it('removes and restores the slots on a mounted provider without a hook-order error', () => {
    window.history.replaceState(null, '', '/other?v=1');
    const registryForRender = navViewsRegistry();
    const withSlots: PlatformSlots = { navCounts: { For: () => CountsA }, spaceNavSection: { For: () => ({ label: { ko: '저장된 보기', en: 'Saved' }, Body: SectionBody }) } };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tree = (slots: PlatformSlots) => <I18nProvider><PlatformProvider adapter={adapterWith(['platform:view'])} registry={registryForRender} slots={slots}><AppShell><input aria-label="editor" /></AppShell></PlatformProvider></I18nProvider>;
    const view = render(tree(withSlots));
    expect(within(primary()).getByRole('link', { name: '수신함, 48건' })).toBeTruthy();
    view.rerender(tree({}));
    expect(within(primary()).getByRole('link', { name: '수신함' })).not.toHaveTextContent(/\d/);
    expect(screen.queryByRole('region', { name: '저장된 보기' })).toBeNull();
    view.rerender(tree(withSlots));
    expect(within(primary()).getByRole('link', { name: '수신함, 48건' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '저장된 보기' })).toBeTruthy();
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/hook|Rendered (more|fewer)/i);
  });

  describe('which row is current', () => {
    const nested = () => {
      const m = (id: string, path: string, over: object = {}) => ({ ...menu(id, groupId('overview'), path, 'platform:view'), label: { ko: id, en: id }, primary: id === 'a', ...over });
      const v = (id: string, page: Record<string, string>) => ({ id, label: { ko: `v-${id}`, en: id }, page });
      return createRegistry({
        spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'a' })],
        groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
        menus: [
          m('a', '/a', { pageKeys: ['tab', 'sub'], navViews: [v('broad', { tab: 'mine' }), v('narrow', { tab: 'mine', sub: 'x' })] }),
          m('b', '/b', { pageKeys: ['tab'], navViews: [v('b-mine', { tab: 'mine' })] }),
        ],
      });
    };
    it.each([
      ['/a?v=1&tab=mine&sub=x', 'v-narrow'],
      ['/a?v=1&tab=mine', 'v-broad'],
      ['/a?v=1&tab=other', 'a'],
      ['/b?v=1&tab=mine', 'v-b-mine'],
    ])('%s marks exactly %s', (url, name) => {
      window.history.replaceState(null, '', url);
      mount(['platform:view'], true, nested());
      const current = document.querySelectorAll('a[aria-current=page]');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute('aria-label', name);
    });
  });
});

// #886 UX-6: the stack is anchored in the content column, with one persistent live region per politeness and no nesting.
describe('toast stack placement and live regions (#886)', () => {
  function Fire() {
    const { toast } = useHostPlatform();
    const { setLang } = useI18n();
    return <>
      <button type="button" onClick={() => toast('안내', 'info')}>fire info</button>
      <button type="button" onClick={() => toast('실패', 'danger')}>fire danger</button>
      <button type="button" onClick={() => setLang('en')}>to english</button>
    </>;
  }
  const mount = () => render(<I18nProvider><PlatformProvider adapter={adapterWith()} registry={registry}>
    <AppShell><Fire /></AppShell>
  </PlatformProvider></I18nProvider>);

  it('keeps one never-remounting stack in the content column bottom anchor, outside the detail aside', () => {
    mount();
    const stack = document.querySelector('[data-toast-stack]')!;
    const anchor = stack.parentElement!;
    const column = anchor.parentElement!;
    expect(anchor).toHaveAttribute('data-toast-anchor');
    expect(anchor).toHaveClass('relative', 'h-0');
    expect(column).toHaveAttribute('data-shell-content');
    // The column itself stays unpositioned so absolute content inside main keeps main as its clip (#886 E2E PageFilterBar).
    expect(column).not.toHaveClass('relative');
    expect(column.contains(document.getElementById('platform-main'))).toBe(true);
    expect(stack).toHaveClass('absolute', 'inset-x-4', 'mx-auto', 'max-w-[420px]', 'bottom-4', 'z-[100]');
    expect(stack).not.toHaveClass('fixed');
    expect(stack.closest('aside')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'fire info' }));
    expect(document.querySelector('[data-toast-stack]')).toBe(stack);
  });
  it('announces each toast once: two persistent sr-only live regions, a non-live visible list', () => {
    mount();
    const live = () => [...document.querySelectorAll('[data-toast-stack] [aria-live]')];
    const before = live();
    expect(before.map(e => e.getAttribute('aria-live'))).toEqual(['polite', 'assertive']);
    for (const el of before) expect(el).toHaveClass('sr-only');
    fireEvent.click(screen.getByRole('button', { name: 'fire info' }));
    fireEvent.click(screen.getByRole('button', { name: 'fire danger' }));
    expect(live()).toEqual(before);
    expect(before[0]!.textContent).toBe('알림: 안내');
    expect(before[1]!.textContent).toBe('오류: 실패');
    // The visible list and its items carry no liveness, and nothing is announced inside another live region.
    const list = document.querySelector('[data-toast-item]')!.parentElement!;
    expect(list.closest('[aria-live]')).toBeNull();
    expect(list.querySelector('[aria-live], [role="alert"], [role="status"]')).toBeNull();
    expect(list.getAttribute('role')).toBeNull();
    // A dismissal re-announces nothing.
    fireEvent.click(screen.getAllByRole('button', { name: '닫기' })[0]!);
    expect(before[0]!.textContent).toBe('알림: 안내');
    expect(before[1]!.textContent).toBe('오류: 실패');
    // A language switch rewrites nothing already said; a toast raised after it is said in the new language (#886 G2).
    fireEvent.click(screen.getByRole('button', { name: 'to english' }));
    expect(before[0]!.textContent).toBe('알림: 안내');
    expect(before[1]!.textContent).toBe('오류: 실패');
    fireEvent.click(screen.getByRole('button', { name: 'fire info' }));
    expect(before[0]!.textContent).toBe('알림: 안내Notice: 안내');
  });
  it('hands focus to main when a focused toast closes, not to <body> (#886 UX-3)', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'fire info' }));
    const close = within(document.querySelector<HTMLElement>('[data-toast-item]')!).getByRole('button', { name: '닫기' });
    close.focus();
    fireEvent.click(close);
    expect(document.querySelector('[data-toast-item]')).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('platform-main'));
  });
  it('keeps newest at the bottom across tones: danger A then info B puts B below A', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'fire danger' }));
    fireEvent.click(screen.getByRole('button', { name: 'fire info' }));
    const items = [...document.querySelectorAll('[data-toast-item]')].map(e => e.textContent);
    expect(items[0]).toContain('실패');
    expect(items[1]).toContain('안내');
  });
});
