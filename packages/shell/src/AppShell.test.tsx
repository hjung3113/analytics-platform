import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupId, Permission, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, usePlatform, createRegistry } from '@ap/kernel';
import { AppShell } from './AppShell';
import { AppRail } from './AppRail';
import { AppSidebar } from './AppSidebar';

function menu(id: string, group: GroupId, path: string, permission: Permission) {
  return { id, group, path, permission, primary: true, label: { ko: '운영 홈', en: 'Operations home' }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: none, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] };
}
const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }, { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'ops', permission: 'console:access' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics', hideLabelWhenSingle: true }, { id: 'admin', label: { ko: '관리', en: 'Admin' }, icon: House, space: 'operations' }],
  menus: [menu('ops', 'admin', '/ops', 'console:access'), { id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function adapterWith(permissions: Session['user']['permissions'] = ['platform:view']): PlatformAdapter {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
  return {
    menuQuery: async () => forbidden, session: () => session, validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [], defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => forbidden, auditTrail: async () => forbidden, entityAudit: async () => forbidden, accessDirectory: async () => forbidden,
    recordUsage: async () => ({ accepted: 0 }), usageSummary: async () => forbidden,
    listAnnotations: async () => forbidden, saveAnnotation: async () => forbidden,
    reportClientError: async () => ({ accepted: true }), subscribe: () => () => {},
  };
}

function sidebarRegistry(groupId: GroupId, groupLabel: string, menuIds: string[], hideLabelWhenSingle = false) {
  const menus = menuIds.map((id, index) => ({
    ...menu(id, groupId, `/${id}`, 'platform:view'),
    label: { ko: `메뉴 ${index + 1}`, en: `Menu ${index + 1}` },
    primary: index === 0,
  }));
  return createRegistry({
    spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: menuIds[0] }],
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
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  window.history.replaceState(null, '', '/?v=1&scopeId=ICH&lotIds=kept');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function FavoriteControl() {
  const { toggleFavorite } = usePlatform();
  return <button onClick={() => toggleFavorite('home')}>save favorite</button>;
}

function mount(permissions: Session['user']['permissions'] = ['platform:view'], shell = true, registryForRender = registry) {
  return render(<I18nProvider><PlatformProvider adapter={adapterWith(permissions)} registry={registryForRender} slots={{ topBarTools: <button>injected tool</button> }}>
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
