import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DetailDrawer } from '@ap/components';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupId, Permission, PlatformAdapter, Session } from '@ap/contracts';
import type { FeedbackOpsSlot, PlatformSlots } from '@ap/kernel';
import { I18nProvider, PlatformProvider, usePlatform, createRegistry } from '@ap/kernel';
import { AppShell } from './AppShell';
import { AppRail } from './AppRail';
import { AppSidebar } from './AppSidebar';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';

function menu(id: string, group: GroupId, path: string, permission: Permission) {
  return { id, group, path, permission, primary: true, label: { ko: '운영 홈', en: 'Operations home' }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] };
}
const registry = createRegistry({
  spaces: [testSpace({ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, subtitle: { ko: 'FeedbackOps 검사 전용 시스템 부제', en: 'FeedbackOps fixture system subtitle' }, homeMenuId: 'home' }), testSpace({ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'ops', permission: 'console:access' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics', hideLabelWhenSingle: true }, { id: 'admin', label: { ko: '관리', en: 'Admin' }, icon: House, space: 'operations' }],
  menus: [menu('ops', 'admin', '/ops', 'console:access'), { id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['focus', 'tab'] }],
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
    spaces: [testSpace({ homeMenuId: menuIds[0] })],
    groups: [{
      id: groupId,
      label: { ko: groupLabel, en: groupLabel },
      icon: House,
      space: 'analytics',
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
  const { toggleFavorite } = usePlatform();
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
  await userEvent.setup().click(within(screen.getByRole('navigation', { name: '앱 레일' })).getByRole('button', { name: '사용자 메뉴' }));
  return screen.getByRole('menu');
}
const overallItem = () => screen.queryByRole('menuitem', { name: 'FeedbackOps 전체 — 새 탭' });

describe('rail space navigation', () => {
  it('omits all space buttons with only one accessible space and keeps global tools', () => {
    mount();
    expect(screen.queryByRole('button', { name: /^공간:/ })).toBeNull();
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
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
    await waitFor(() => expect(window.location.pathname).toBe('/ops'));
    expect(new URLSearchParams(window.location.search).get('lotIds')).toBe('kept');
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('MEM');
    expect(push).toHaveBeenCalledTimes(1);
    // pathname changes at pushState, before React re-renders the switcher label: wait for the DOM, not the URL.
    expect(await screen.findByRole('button', { name: '시스템 및 플랫폼 메뉴 · 현재: 운영 콘솔' })).toBeTruthy();
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
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
    const view = sidebarRegistry('equipment', '설비관리', ['equipment-home'], true);
    mount(['platform:view'], false, view);

    const group = screen.getByRole('group', { name: '설비관리' });
    expect(within(group).queryByText('설비관리')).toBeNull();
    expect(within(group).getByRole('link', { name: '메뉴 1' })).toBeTruthy();
  });

  it('shows the label for overview when the group has no declaration', () => {
    const view = sidebarRegistry('overview', '운영 개요', ['overview-home']);
    mount(['platform:view'], false, view);

    const group = screen.getByRole('group', { name: '운영 개요' });
    expect(within(group).getByText('운영 개요')).toBeTruthy();
  });

  it('shows the label for a declared group when two menus are visible', () => {
    const view = sidebarRegistry('equipment', '설비관리', ['equipment-home', 'equipment-list'], true);
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
    expect(within(screen.getByRole('navigation', { name: '앱 레일' })).queryByRole('button', { name: /언어|Language/ })).toBeNull();
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
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    // aria-current="page" is the current menu only; the section button says "true" (06 §26).
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(within(rail).getByRole('button', { name: '개요' }).getAttribute('aria-current')).toBe('true');
    expect(within(rail).getByRole('button', { name: '개요' }).querySelector('[data-current-marker]')).toHaveClass('w-0.5');
    expect(within(rail).queryByRole('button', { name: '관리' })).toBeNull();
    fireEvent.click(within(openSwitcher()).getByRole('button', { name: /운영 콘솔/ }));
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: '앱 레일' })).getByRole('button', { name: '관리' }).querySelector('[data-current-marker]')).toBeTruthy());
    expect(within(screen.getByRole('navigation', { name: '앱 레일' })).queryByRole('button', { name: '개요' })).toBeNull();
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
  const { pageParam, setPage } = usePlatform();
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
  expect(main.parentElement?.parentElement).toBe(slot.parentElement);
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

const feedbackSlot: FeedbackOpsSlot = {
  entriesFor: spaceId => spaceId === 'analytics' ? [
    { id: 'task', label: { ko: 'Task', en: 'Task' }, href: 'https://example.test/task' },
    { id: 'voc-create', label: { ko: 'VOC 등록', en: 'File a VOC' }, href: 'https://example.test/new' },
  ] : spaceId === 'operations' ? [] : null,
  overall: { href: 'https://example.test/all', permission: 'feedbackops:access' },
};

function globalShellRegistry(equipmentPermission: Permission = 'platform:view') {
  return createRegistry({
    spaces: [
      testSpace({ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'equipment' }),
      testSpace({ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'ops', permission: 'console:access' }),
    ],
    groups: [
      { id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
      { id: 'equipment', label: { ko: '설비', en: 'Equipment' }, icon: House, space: 'analytics' },
      { id: 'admin', label: { ko: '관리', en: 'Admin' }, icon: House, space: 'operations' },
    ],
    menus: [
      { id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] },
      menu('equipment', 'equipment', '/equipment', equipmentPermission),
      menu('ops', 'admin', '/ops', 'console:access'),
    ],
  });
}

function logoRegistry() {
  return createRegistry({
    spaces: [testSpace({ homeMenuId: 'equipment' })],
    groups: [
      { id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
      { id: 'noticeVoc', label: { ko: '공지', en: 'Notices' }, icon: House, space: null },
      { id: 'equipment', label: { ko: '설비', en: 'Equipment' }, icon: House, space: 'analytics' },
    ],
    menus: [
      { id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] },
      { id: 'notices', group: 'noticeVoc', primary: true, label: { ko: '공지', en: 'Notices' }, description: { ko: '', en: '' }, path: '/notices', icon: House, permission: 'notice:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] },
      menu('equipment', 'equipment', '/equipment', 'platform:view'),
    ],
  });
}

describe('workspace shell layout (15 §3.1)', () => {
  it('offers the platform home inside the switcher, not as a rail logo link, and shows a plain mark when / is unregistered', () => {
    mount(['platform:view'], true, logoRegistry());
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    expect(within(rail).queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    const home = within(within(openSwitcher()).getByRole('navigation', { name: '플랫폼 메뉴' })).getByRole('link', { name: '홈' });
    expect(home.getAttribute('href')).toMatch(/^\//);
    expect(screen.queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    cleanup();
    mount(['platform:view'], false, sidebarRegistry('equipment', '설비관리', ['equipment-home']));
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
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    expect(within(rail).getByRole('button', { name })).toBeTruthy();
    expect(within(rail).queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    expect(rail.querySelector('a[aria-current]')).toBeNull();
  });

  it('renders FeedbackOps entries in slot order outside the scroll region, and the overall link in the user menu', async () => {
    mount(['platform:view', 'feedbackops:access'], true, registry, { feedbackOps: feedbackSlot });
    const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
    const scroll = document.querySelector('.shell-scroll');
    expect(scroll?.contains(block)).toBe(false);
    const links = within(block).getAllByRole('link');
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'Task — 분석, FeedbackOps, 새 탭',
      'VOC 등록 — 분석, FeedbackOps, 새 탭',
    ]);
    expect([block.getAttribute('aria-label'), ...links.map(link => link.getAttribute('aria-label'))].join(' ')).not.toContain('FeedbackOps 검사 전용 시스템 부제');
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link.hasAttribute('aria-current')).toBe(false);
      expect(link.querySelectorAll('svg')).toHaveLength(2);
    }
    expect(within(block).getByText('새 탭에서 열립니다')).toBeTruthy();
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    expect(within(rail).queryByRole('link', { name: /FeedbackOps 전체/ })).toBeNull();
    await openUserMenu();
    const overall = overallItem()!;
    expect(overall).toHaveAttribute('href', 'https://example.test/all');
    expect(overall).toHaveAttribute('target', '_blank');
    expect(overall).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows only entry icons, in the same order, when the sidebar is collapsed', () => {
    localStorage.setItem('platform:sidebar-collapsed', '1');
    mount(['platform:view'], true, registry, { feedbackOps: feedbackSlot });
    const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
    expect(within(block).queryByText('새 탭에서 열립니다')).toBeNull();
    expect(block.textContent).not.toContain('FeedbackOps · 분석');
    const links = within(block).getAllByRole('link');
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'Task — 분석, FeedbackOps, 새 탭',
      'VOC 등록 — 분석, FeedbackOps, 새 탭',
    ]);
    for (const link of links) expect(link.querySelectorAll('svg')).toHaveLength(1);
  });

  it.each([
    ['null', null],
    ['empty', [] as const],
  ])('omits the block when entriesFor returns %s', (_label, entries) => {
    mount(['platform:view'], true, registry, { feedbackOps: { entriesFor: () => entries, overall: null } });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: '앱 레일' })).queryByRole('link', { name: /FeedbackOps 전체/ })).toBeNull();
  });

  it('keeps the overall user-menu link when the block is empty', async () => {
    mount(['platform:view', 'feedbackops:access'], true, registry, { feedbackOps: { entriesFor: () => [], overall: { href: 'https://example.test/all', permission: 'feedbackops:access' } } });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    await openUserMenu();
    expect(overallItem()).toBeTruthy();
  });

  it.each([
    ['held', ['platform:view', 'feedbackops:access'] as Permission[], feedbackSlot, true],
    ['not held', ['platform:view'] as Permission[], feedbackSlot, false],
    ['slot overall null', ['platform:view', 'feedbackops:access'] as Permission[], { entriesFor: () => [], overall: null } as FeedbackOpsSlot, false],
  ])('shows FeedbackOps 전체 only in the user menu and only when the permission is held (%s)', async (_label, permissions, slot, shown) => {
    mount(permissions, true, registry, { feedbackOps: slot });
    expect(within(screen.getByRole('navigation', { name: '앱 레일' })).queryByRole('link', { name: /FeedbackOps 전체/ })).toBeNull();
    await openUserMenu();
    if (shown) expect(overallItem()).toHaveAttribute('href', 'https://example.test/all');
    else expect(overallItem()).toBeNull();
  });

  it.each([
    ['ko', 'FeedbackOps 주소가 설정되지 않아 열 수 없습니다'],
    ['en', 'FeedbackOps address is not configured'],
  ])('draws an entry with a null href as a focusable disabled link (%s)', (lang, reason) => {
    localStorage.setItem('platform:lang', lang);
    mount(['platform:view'], true, registry, { feedbackOps: { entriesFor: id => id === 'analytics' ? [
      { id: 'task', label: { ko: 'Task', en: 'Task' }, href: null },
      { id: 'voc-create', label: { ko: 'VOC 등록', en: 'File a VOC' }, href: 'https://example.test/new' },
    ] : null, overall: null } });
    const block = screen.getByRole('navigation', { name: /^FeedbackOps/ });
    const disabled = within(block).getAllByRole('link').find(link => link.getAttribute('aria-disabled') === 'true')!;
    expect(disabled.tagName).toBe('SPAN');
    expect(disabled.matches('a[href]')).toBe(false);
    expect(disabled.getAttribute('tabindex')).toBe('0');
    expect(disabled.getAttribute('aria-label')).toMatch(/^Task — .*FeedbackOps — /);
    expect(disabled.getAttribute('aria-label')?.endsWith(reason)).toBe(true);
    expect(disabled.className).toContain('text-text-muted');
    expect(disabled.querySelectorAll('svg')).toHaveLength(1);
    expect(block.querySelectorAll('a[href]')).toHaveLength(1);
  });

  it('drops the new-tab caption when every entry is disabled (UX-1)', () => {
    localStorage.setItem('platform:sidebar-collapsed', '0');
    mount(['platform:view'], true, registry, { feedbackOps: { entriesFor: id => id === 'analytics' ? [
      { id: 'voc-create', label: { ko: 'VOC 등록', en: 'File a VOC' }, href: null },
      { id: 'task', label: { ko: 'Task', en: 'Task' }, href: null },
    ] : null, overall: null } });
    const block = screen.getByRole('navigation', { name: /^FeedbackOps/ });
    expect(within(block).getAllByRole('link')).toHaveLength(2);
    expect(within(block).queryByText('새 탭에서 열립니다')).toBeNull();
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
    mount(['platform:view'], true, globalShellRegistry('equipment:view'));
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.getByRole('navigation', { name: '플랫폼 메뉴' })).toBeTruthy();
  });

  it('keeps the fallback sidebar on an unmatched path and still withholds the rail sections, the current card and the FeedbackOps block', () => {
    window.history.replaceState(null, '', '/unregistered?v=1');
    mount(['platform:view', 'console:access'], true, globalShellRegistry(), { feedbackOps: feedbackSlot });
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: '시스템 섹션' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    const dialog = openSwitcher();
    expect(within(dialog).getByRole('button', { name: /분석/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('hands entriesFor the absolute URL of the page it draws as platformReturn (FO ADR-0071)', () => {
    const returns: (string | undefined)[] = [];
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&focus=entity');
    mount(['platform:view'], true, registry, { feedbackOps: {
      entriesFor: (spaceId, platformReturn) => { returns.push(platformReturn); return feedbackSlot.entriesFor(spaceId); },
      overall: null,
    } });
    expect(screen.getByRole('navigation', { name: /^FeedbackOps/ })).toBeTruthy();
    expect(window.location.search).toContain('focus=entity');
    expect(returns.at(-1)).toBe(window.location.href);
  });

  it('omits FeedbackOps on a space-denied direct URL and does not query that space', () => {
    const seen: string[] = [];
    window.history.replaceState(null, '', '/ops?v=1');
    mount(['platform:view'], true, registry, { feedbackOps: {
      entriesFor: spaceId => { seen.push(spaceId); return [{ id: 'task', label: { ko: 'Task', en: 'Task' }, href: 'https://example.test/task' }]; },
      overall: null,
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
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ feedbackOps: {
      entriesFor: spaceId => { seen.push(spaceId); return [{ id: 'task', label: { ko: 'Task', en: 'Task' }, href: 'https://example.test/task' }]; },
      overall: null,
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
    mount(['platform:view', 'console:access'], true, registry, { feedbackOps: {
      entriesFor: spaceId => { seen.push(spaceId); return [{ id: 'task', label: { ko: 'Task', en: 'Task' }, href: 'https://example.test/task' }]; },
      overall: null,
    } });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    expect(seen).toEqual([]);
  });
});

// #304 F2: a toast can carry the server original as named detail; the shell draws it like StateMessage's 서버 세부.
describe('toast detail', () => {
  it('renders the toast detail as a note named 서버 세부, beneath the body text', () => {
    function DetailToastProbe() {
      const { toast } = usePlatform();
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

// #310: the palette scrim rose to z-60; the toast layer must stay above it or the scrim swallows Dismiss clicks.
describe('toast layer above palette scrim (#310)', () => {
  it('keeps the toast container above the open palette overlay', () => {
    function PaletteToastProbe() {
      const { toast, setPaletteOpen } = usePlatform();
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
    const toastHost = screen.getByText('내보내기를 시작합니다.').closest('[aria-live="polite"]');
    expect(toastHost).toBeInTheDocument();
    expect(Number(toastHost!.className.match(/z-\[?(\d+)\]?/)![1])).toBeGreaterThan(Number(overlay!.className.match(/z-\[?(\d+)\]?/)![1]));
  });
});

function platformSidebarRegistry() {
  const entry = (id: string, group: GroupId, path: string, label: string, permission: Permission, primary: boolean) => ({ ...menu(id, group, path, permission), label: { ko: label, en: label }, primary });
  return createRegistry({
    spaces: [testSpace({ homeMenuId: 'equipment' })],
    groups: [
      { id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: null, hideLabelWhenSingle: true },
      { id: 'myActivity', label: { ko: '내 활동', en: 'My activity' }, icon: House, space: null },
      { id: 'noticeVoc', label: { ko: '공지', en: 'Notices' }, icon: House, space: null, hideLabelWhenSingle: true },
      { id: 'equipment', label: { ko: '설비', en: 'Equipment' }, icon: House, space: 'analytics' },
    ],
    menus: [
      entry('notices', 'noticeVoc', '/notices', '공지', 'notice:view', true),
      entry('alerts', 'myActivity', '/alerts', '알림', 'platform:view', true),
      entry('surveys', 'myActivity', '/surveys', '설문', 'equipment:view', false),
      entry('home', 'overview', '/', '플랫폼 홈', 'platform:view', true),
      entry('equipment', 'equipment', '/equipment', '설비 목록', 'platform:view', true),
    ],
  });
}
const PLATFORM_PERMISSIONS: Permission[] = ['platform:view', 'notice:view', 'equipment:view'];

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
