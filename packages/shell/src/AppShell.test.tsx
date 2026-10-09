import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DetailDrawer } from '@ap/components';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupId, Permission, PlatformAdapter, Session } from '@ap/contracts';
import type { FeedbackOpsSlot, PlatformSlots } from '@ap/kernel';
import { I18nProvider, PlatformProvider, usePlatform, createRegistry } from '@ap/kernel';
import { AppShell } from './AppShell';
import { AppRail } from './AppRail';
import { AppSidebar } from './AppSidebar';
import { noContext, testAdapter, testSpace } from './test-setup';

function menu(id: string, group: GroupId, path: string, permission: Permission) {
  return { id, group, path, permission, primary: true, label: { ko: '운영 홈', en: 'Operations home' }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] };
}
const registry = createRegistry({
  spaces: [testSpace(), testSpace({ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'ops', permission: 'console:access' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics', hideLabelWhenSingle: true }, { id: 'admin', label: { ko: '관리', en: 'Admin' }, icon: House, space: 'operations' }],
  menus: [menu('ops', 'admin', '/ops', 'console:access'), { id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['focus', 'tab'] }],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function adapterWith(permissions: Session['user']['permissions'] = ['platform:view']): PlatformAdapter {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
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
  const values = new Map<string, string>();
  const session = new Map<string, string>();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  // Admitted space routes now write platform:space-last. A shared jsdom sessionStorage would make a later
  // switchSpace resume that URL instead of the space home these tests assert.
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value), removeItem: (key: string) => session.delete(key), clear: () => session.clear() });
  window.history.replaceState(null, '', '/?v=1&scopeId=ICH&lotIds=kept');
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

describe('rail space navigation', () => {
  it('omits all space buttons with only one accessible space and keeps global tools', () => {
    mount();
    expect(screen.queryByRole('button', { name: /^공간:/ })).toBeNull();
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    expect(within(rail).getByRole('button', { name: '메뉴 검색…' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'injected tool' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Help' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '사용자 메뉴' })).toBeTruthy();
  });

  it('uses Kernel space navigation, preserving globals and pushing history with aria-current', async () => {
    mount(['platform:view', 'console:access']);
    const push = vi.spyOn(window.history, 'pushState');
    expect(screen.getByRole('button', { name: '공간: 분석' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: '공간: 분석' }).querySelector('[data-current-marker]')).toBeTruthy();
    expect(screen.getByRole('button', { name: '공간: 운영 콘솔' }).querySelector('[data-current-marker]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '공간: 운영 콘솔' }));
    expect(window.location.pathname).toBe('/ops');
    expect(new URLSearchParams(window.location.search).get('lotIds')).toBe('kept');
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('ICH');
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '공간: 운영 콘솔' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: '공간: 분석' }).hasAttribute('aria-current')).toBe(false);
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
    localStorage.setItem('platform:recent:u1', JSON.stringify([{ menuId: 'ops', url: '/ops?v=1&scopeId=ICH' }]));
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
    localStorage.setItem('platform:recent:u1', JSON.stringify([{ menuId: 'home', url: '/?v=1&scopeId=ICH&lotIds=previous' }, { menuId: 'ops', url: '/ops' }]));
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
    // Primary nav and the logo both mark the home menu; favorites and recent still do not.
    expect(document.querySelectorAll('a[aria-current=page]')).toHaveLength(2);
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

  it('names the language state and next action before and after a toggle', () => {
    mount();
    const toggle = screen.getByRole('button', { name: '언어: 한국어 — English로 전환' });
    expect(toggle).toHaveClass('text-text-secondary');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Language: English — 한국어로 전환' })).toBe(toggle);
  });

  it('marks only the current menu and space with a persistent shape, and keeps groups out of region/headings', () => {
    localStorage.setItem('platform:sidebar-collapsed', '0');
    mount(['platform:view', 'console:access']);
    const primary = screen.getByRole('navigation', { name: '주 메뉴' });
    const home = within(primary).getByRole('link', { name: '홈' });
    expect(home.querySelector('[data-current-marker]')).toHaveAttribute('aria-hidden', 'true');
    expect(home.querySelector('[data-current-marker]')).toHaveClass('w-0.5');
    expect(within(primary).getByText('예정')).toHaveClass('text-text-secondary');
    expect(within(primary).queryByRole('region')).toBeNull();
    expect(within(primary).queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: '공간: 분석' }).querySelector('[data-current-marker]')).toHaveClass('w-0.5');
    expect(screen.getByRole('button', { name: '공간: 운영 콘솔' }).querySelector('[data-current-marker]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '공간: 운영 콘솔' }));
    expect(screen.getByRole('button', { name: '공간: 분석' }).querySelector('[data-current-marker]')).toBeNull();
    expect(screen.getByRole('button', { name: '공간: 운영 콘솔' }).querySelector('[data-current-marker]')).toBeTruthy();
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
  expect(screen.getByRole('button', { name: '상세 닫기' })).toBe(document.activeElement);
  fireEvent.keyDown(screen.getByRole('button', { name: '상세 닫기' }), { key: 'Escape' });
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
  overall: { href: 'https://example.test/all' },
};

function globalShellRegistry(equipmentPermission: Permission = 'platform:view') {
  return createRegistry({
    spaces: [
      testSpace({ homeMenuId: 'equipment' }),
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
  it('marks the logo as the current page on the home menu, and keeps the plain logo when / is unregistered', () => {
    mount();
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    const home = within(rail).getByRole('link', { name: '플랫폼 홈' });
    expect(home.getAttribute('href')).toMatch(/^\//);
    expect(home.getAttribute('aria-current')).toBe('page');
    expect(home).toHaveClass('bg-surface-row-selected', 'text-accent-primary');
    expect(home.querySelector('[data-current-marker]')).toHaveClass('absolute', 'inset-y-2', 'left-0', 'w-0.5', 'rounded-pill', 'bg-accent-primary');
    cleanup();
    mount(['platform:view'], false, sidebarRegistry('equipment', '설비관리', ['equipment-home']));
    const plain = screen.getByRole('navigation', { name: '앱 레일' });
    expect(within(plain).queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    expect(within(plain).getByText('Analytics Platform')).toBeTruthy();
  });

  it('keeps the plain logo when / is registered but cannot be opened, and does not mark it current', () => {
    window.history.replaceState(null, '', '/?v=1');
    mount(['notice:view'], true, logoRegistry());
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    expect(within(rail).queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
    expect(within(rail).getByText('Analytics Platform')).toBeTruthy();
    expect(rail.querySelector('[data-current-marker]')).toBeNull();
  });

  it.each([
    ['home', '/?v=1', true],
    ['notices', '/notices?v=1', false],
    ['space', '/equipment?v=1', false],
  ])('marks the logo current only on the home menu (%s)', (_label, url, current) => {
    window.history.replaceState(null, '', url);
    mount(['platform:view', 'notice:view'], true, logoRegistry());
    const logo = within(screen.getByRole('navigation', { name: '앱 레일' })).getByRole('link', { name: '플랫폼 홈' });
    if (current) {
      expect(logo.getAttribute('aria-current')).toBe('page');
      expect(logo).toHaveClass('bg-surface-row-selected', 'text-accent-primary');
      expect(logo.querySelector('[data-current-marker]')).toHaveClass('absolute', 'inset-y-2', 'left-0', 'w-0.5', 'rounded-pill', 'bg-accent-primary');
    } else {
      expect(logo.hasAttribute('aria-current')).toBe(false);
      expect(logo.className).not.toContain('bg-surface-row-selected');
      expect(logo.querySelector('[data-current-marker]')).toBeNull();
    }
  });

  it('renders FeedbackOps entries in slot order outside the scroll region, and the overall rail link', () => {
    mount(['platform:view'], true, registry, { feedbackOps: feedbackSlot });
    const block = screen.getByRole('navigation', { name: 'FeedbackOps · 분석' });
    const scroll = document.querySelector('.shell-scroll');
    expect(scroll?.contains(block)).toBe(false);
    const links = within(block).getAllByRole('link');
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'Task — 분석, FeedbackOps, 새 탭',
      'VOC 등록 — 분석, FeedbackOps, 새 탭',
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link.hasAttribute('aria-current')).toBe(false);
      expect(link.querySelectorAll('svg')).toHaveLength(2);
    }
    expect(within(block).getByText('새 탭에서 열립니다')).toBeTruthy();
    const rail = screen.getByRole('navigation', { name: '앱 레일' });
    const overall = within(rail).getByRole('link', { name: 'FeedbackOps 전체 — 새 탭' });
    expect(overall).toHaveAttribute('href', 'https://example.test/all');
    expect(overall).toHaveAttribute('target', '_blank');
    expect(overall).toHaveAttribute('rel', 'noopener noreferrer');
    expect(overall.hasAttribute('aria-current')).toBe(false);
    expect(overall.compareDocumentPosition(within(rail).getByRole('button', { name: 'injected tool' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('keeps the overall rail link when the block is empty', () => {
    mount(['platform:view'], true, registry, { feedbackOps: { entriesFor: () => [], overall: { href: 'https://example.test/all' } } });
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: '앱 레일' })).getByRole('link', { name: 'FeedbackOps 전체 — 새 탭' })).toBeTruthy();
  });

  it('hides the sidebar and the rail marker on a global screen', () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    mount(['platform:view', 'console:access'], true, globalShellRegistry());
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.getByRole('button', { name: '공간: 분석' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.getByRole('button', { name: '공간: 운영 콘솔' }).hasAttribute('aria-current')).toBe(false);
  });

  it('hides the sidebar when no space is accessible', () => {
    window.history.replaceState(null, '', '/?v=1');
    mount(['platform:view'], true, globalShellRegistry('equipment:view'));
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('keeps the fallback sidebar on an unmatched path and still withholds the rail marker and FeedbackOps block', () => {
    window.history.replaceState(null, '', '/unregistered?v=1');
    mount(['platform:view', 'console:access'], true, globalShellRegistry(), { feedbackOps: feedbackSlot });
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '공간: 분석' }).hasAttribute('aria-current')).toBe(false);
    expect(screen.queryByRole('navigation', { name: /^FeedbackOps/ })).toBeNull();
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
    let session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view', 'console:access'] }, scopes: [] };
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
