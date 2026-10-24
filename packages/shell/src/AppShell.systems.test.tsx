import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Boxes, House, Wrench } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformLink, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from './AppShell';
import { groupId, spaceId, type GroupId, type Permission } from '@ap/contracts';

function menu(id: string, group: GroupId, path: string, label: string, over: object = {}) {
  return { id, group, path, permission: 'platform:view' as const, primary: false, label: { ko: label, en: label }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over };
}
const registry = createRegistry({
  spaces: [
    testSpace({ id: spaceId('analytics'), label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, homeMenuId: 'cycle-list' }),
    testSpace({ id: spaceId('metrics'), label: { ko: 'BRAVO', en: 'BRAVO' }, subtitle: { ko: '지표관리', en: 'Metrics' }, homeMenuId: 'catalog' }),
    testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'roles', permission: 'console:access' }),
  ],
  groups: [
    { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
    { id: groupId('analytics'), label: { ko: '사이클', en: 'Cycle' }, icon: Boxes, space: spaceId('analytics') },
    { id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: Wrench, space: spaceId('analytics') },
    { id: groupId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, icon: House, space: spaceId('metrics') },
    { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: Wrench, space: spaceId('operations') },
  ],
  menus: [
    menu('start', groupId('overview'), '/', '플랫폼 홈', { primary: true }),
    menu('cycle-list', groupId('analytics'), '/cycle', '사이클 목록', { primary: true }),
    menu('cycle-detail', groupId('analytics'), '/cycle/:id', '사이클 상세', { navHidden: true, parent: 'cycle-list' }),
    menu('equip-list', groupId('equipment'), '/equip', '설비 목록', { primary: true }),
    menu('equip-master', groupId('equipment'), '/equip/master', '설비 마스터'),
    menu('catalog', groupId('metrics'), '/metrics', '지표 카탈로그', { primary: true }),
    menu('roles', groupId('admin'), '/ops', '권한', { primary: true, permission: 'console:access' }),
  ],
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('localStorage', memoryStorage());
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  sessionStorage.clear();
  localStorage.setItem('platform:sidebar-collapsed', '0');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(url: string, permissions: Permission[] = ['platform:view', 'console:access'], useRegistry = registry) {
  window.history.replaceState(null, '', url);
  const session = testSession(permissions);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={useRegistry}>
    <AppShell><PlatformLink href="/cycle?v=1">back to cycle</PlatformLink></AppShell>
  </PlatformProvider></I18nProvider>);
}
const rail = () => screen.getByRole('navigation', { name: '앱 레일' });
const sections = () => within(rail()).queryByRole('group', { name: '시스템 섹션' });

describe('rail sections (15 §3.2)', () => {
  it('lists the visible sections of the current system in order and marks only the current one with aria-current=true', () => {
    mount('/cycle?v=1&scopeId=MEM');
    const group = sections()!;
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['사이클', '설비']);
    expect(buttons[0]).toHaveAttribute('aria-current', 'true');
    expect(buttons[1].hasAttribute('aria-current')).toBe(false);
    expect(rail().querySelector('[aria-current="page"]')).toBeNull();
  });

  it('keeps a hidden detail screen on its parent section', () => {
    mount('/cycle/C1?v=1');
    const [cycle, equip] = within(sections()!).getAllByRole('button');
    expect(cycle).toHaveAttribute('aria-current', 'true');
    expect(equip.hasAttribute('aria-current')).toBe(false);
    expect(within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '사이클 목록' })).toHaveAttribute('aria-current', 'page');
  });

  it('does nothing when the current section is pressed', () => {
    mount('/cycle?v=1&scopeId=MEM');
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(within(sections()!).getByRole('button', { name: '사이클' }));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/cycle');
  });

  it('opens the first visible menu of another section through a Kernel link that keeps the global Context', async () => {
    mount('/cycle?v=1&scopeId=MEM&lotIds=kept');
    const push = vi.spyOn(window.history, 'pushState');
    fireEvent.click(within(sections()!).getByRole('button', { name: '설비' }));
    await waitFor(() => expect(window.location.pathname).toBe('/equip'));
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('MEM');
    expect(new URLSearchParams(window.location.search).get('lotIds')).toBe('kept');
    expect(push).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(sections()!).getByRole('button', { name: '설비' })).toHaveAttribute('aria-current', 'true'));
  });

  it('is not a toolbar and reaches each section with Tab (plain buttons, no roving tabindex)', () => {
    mount('/cycle?v=1');
    expect(within(rail()).queryByRole('toolbar')).toBeNull();
    for (const button of within(sections()!).getAllByRole('button')) expect(button.hasAttribute('tabindex')).toBe(false);
  });

  it.each([
    ['platform home', '/?v=1'],
    ['unmatched path', '/nowhere?v=1'],
  ])('has no sections outside a system (%s)', (_label, url) => {
    mount(url);
    expect(sections()).toBeNull();
    expect(rail().querySelector('[aria-current]')).toBeNull();
  });
});

describe('sidebar of the current section (15 §3.2)', () => {
  it('draws only the current section menus, drops the same-named group title and keeps the rest', () => {
    mount('/cycle?v=1');
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByRole('link', { name: '사이클 목록' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: '설비 목록' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: '사이클 상세' })).toBeNull();
    expect(within(nav).getByRole('group', { name: '사이클' }).querySelector('p')).toBeNull();
    expect(screen.getByRole('region', { name: '즐겨찾기' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '최근 방문' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Scope/ })).toBeTruthy();
  });

  it('shows the system name and, on a second line, the section name', () => {
    const view = mount('/equip?v=1');
    const head = view.container.querySelector('aside > div')!;
    expect(Array.from(head.querySelectorAll('p')).map(p => p.textContent)).toEqual(['MARS', '설비']);
    expect(head.querySelectorAll('p')[1]).toHaveClass('text-caption', 'text-text-muted');
  });

  it('shows the system name and the same-named group on two lines once the labels differ (BRAVO / 지표관리), never the subtitle', () => {
    const view = mount('/metrics?v=1');
    const head = view.container.querySelector('aside > div')!;
    expect(Array.from(head.querySelectorAll('p')).map(p => p.textContent)).toEqual(['BRAVO', '지표관리']);
  });

  it('omits the second line when the section is named like the system', () => {
    const equalLabels = createRegistry({
      spaces: [testSpace({ id: spaceId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, subtitle: { ko: '부제', en: 'Subtitle' }, homeMenuId: 'catalog' })],
      groups: [{ id: groupId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, icon: House, space: spaceId('metrics') }],
      menus: [menu('catalog', groupId('metrics'), '/metrics', '지표 카탈로그', { primary: true })],
    });
    const view = mount('/metrics?v=1', ['platform:view'], equalLabels);
    const head = view.container.querySelector('aside > div')!;
    expect(Array.from(head.querySelectorAll('p')).map(p => p.textContent)).toEqual(['지표관리']);
  });

  it('draws the current section menu icons only when collapsed', () => {
    localStorage.setItem('platform:sidebar-collapsed', '1');
    const view = mount('/cycle?v=1');
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['사이클 목록']);
    expect(nav.textContent).toBe('');
    expect(view.container.querySelector('aside')).toHaveAttribute('data-collapsed', 'true');
  });

  it('draws no business sidebar outside a system', () => {
    mount('/?v=1');
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).toBeNull();
  });
});

describe('fallback sidebar on an unmatched or denied route (B5)', () => {
  it.each([
    ['unmatched path', '/nowhere?v=1', ['platform:view']],
    ['space entry denied', '/ops?v=1', ['platform:view']],
  ])('keeps every group of the sidebar space, marks no section, then returns to the section view (%s)', async (_label, url, permissions) => {
    const view = mount(url, permissions as Permission[]);
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByRole('link', { name: '사이클 목록' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: '설비 목록' })).toBeTruthy();
    expect(within(nav).getByRole('group', { name: '설비' }).querySelector('p')).toHaveTextContent('설비');
    expect(sections()).toBeNull();
    expect(rail().querySelector('[aria-current]')).toBeNull();
    const head = view.container.querySelector('aside > div')!;
    expect(Array.from(head.querySelectorAll('p')).map(p => p.textContent)).toEqual(['MARS', 'Analytics Platform']);
    expect(nav.querySelector('[aria-current="page"]')).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'back to cycle' }));
    await waitFor(() => expect(sections()).not.toBeNull());
    expect(within(sections()!).getByRole('button', { name: '사이클' })).toHaveAttribute('aria-current', 'true');
    const after = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(after).queryByRole('link', { name: '설비 목록' })).toBeNull();
    expect(within(after).getByRole('link', { name: '사이클 목록' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('space scope control slot (ADR-0081 decision 4)', () => {
  function mountWith(slots: { scopeControl?: { For: (id: never) => ((props: { collapsed: boolean }) => React.ReactNode) | null } }, url: string) {
    window.history.replaceState(null, '', url);
    const session = testSession(['platform:view', 'console:access']);
    return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots as never}>
      <AppShell><p>body</p></AppShell>
    </PlatformProvider></I18nProvider>);
  }
  const Own = ({ collapsed }: { collapsed: boolean }) => <div data-testid="own-scope" data-collapsed={String(collapsed)} />;

  it('S1 renders the space control instead of ScopeSelector, and ScopeSelector elsewhere or without the slot', () => {
    const For = (id: string) => (id === 'metrics' ? Own : null);
    mountWith({ scopeControl: { For } }, '/metrics?v=1');
    expect(screen.getByTestId('own-scope')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.queryByRole('button', { name: /^Scope:/ })).toBeNull();
    cleanup();
    mountWith({ scopeControl: { For } }, '/cycle?v=1');
    expect(screen.queryByTestId('own-scope')).toBeNull();
    expect(screen.getByRole('button', { name: /^Scope:/ })).toBeTruthy();
    cleanup();
    mountWith({}, '/metrics?v=1');
    expect(screen.queryByTestId('own-scope')).toBeNull();
    expect(screen.getByRole('button', { name: /^Scope:/ })).toBeTruthy();
  });
});
