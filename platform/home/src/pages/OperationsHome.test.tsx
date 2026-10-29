import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformSlots } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import OperationsHome from './OperationsHome';
import { groupId, menuPermission, spaceId, type Permission, type PlatformAdapter, type Session } from '@ap/contracts';

const none = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const purpose = { ko: '목적', en: 'Purpose' };

function menu(id: string, group: 'overview' | 'equipment' | 'metrics' | 'noticeVoc' | 'admin' | 'dashboard', path: string, permission: Permission, label: { ko: string; en: string }, primary = false, pageKeys: string[] = []) {
  return { id, group: groupId(group), path, permission, primary, label, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: none, pageType: 'overview' as const, features: noFeatures, pageKeys };
}

const registry = createRegistry({
  platformHomeMenuId: 'home',
  permissions: [menuPermission('analytics:view'), menuPermission('equipment:view'), menuPermission('metrics:view')],
  spaces: [
    { id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' }, homeMenuId: 'equipment' },
    { id: spaceId('bravo'), label: { ko: 'BRAVO', en: 'BRAVO' }, subtitle: { ko: '지표관리', en: 'Metrics' }, description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' }, homeMenuId: 'catalog' },
    { id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: purpose, homeMenuId: 'dashboard' },
  ],
  groups: [
    { id: groupId('overview'), label: { ko: '운영 개요', en: 'Overview' }, icon: House, space: null },
    { id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: spaceId('mars') },
    { id: groupId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, icon: House, space: spaceId('bravo') },
    { id: groupId('noticeVoc'), label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
    { id: groupId('dashboard'), label: { ko: '대시보드', en: 'Dashboard' }, icon: House, space: spaceId('operations') },
    { id: groupId('admin'), label: { ko: '플랫폼 관리', en: 'Platform management' }, icon: House, space: spaceId('operations') },
  ],
  menus: [
    menu('home', 'overview', '/', 'platform:view', { ko: '플랫폼 홈', en: 'Platform home' }, true),
    menu('equipment', 'equipment', '/equipment', menuPermission('equipment:view'), { ko: '설비', en: 'Equipment' }, true, ['page']),
    menu('catalog', 'metrics', '/metrics', menuPermission('metrics:view'), { ko: '지표 카탈로그', en: 'Metric catalog' }, true, ['page']),
    menu('x1', 'metrics', '/x1', menuPermission('metrics:view'), { ko: '추가1', en: 'Extra 1' }),
    menu('x2', 'metrics', '/x2', menuPermission('metrics:view'), { ko: '추가2', en: 'Extra 2' }),
    menu('x3', 'metrics', '/x3', menuPermission('metrics:view'), { ko: '추가3', en: 'Extra 3' }),
    menu('x4', 'metrics', '/x4', menuPermission('metrics:view'), { ko: '추가4', en: 'Extra 4' }),
    menu('x5', 'metrics', '/x5', menuPermission('metrics:view'), { ko: '추가5', en: 'Extra 5' }),
    menu('notices', 'noticeVoc', '/notices', 'notice:view', { ko: '공지', en: 'Notices' }, true),
    menu('voc', 'noticeVoc', '/voc', 'voc:view', { ko: 'VOC', en: 'VOC' }),
    menu('dashboard', 'dashboard', '/dashboard', 'features:access', { ko: '대시보드', en: 'Dashboard' }, true),
    menu('admin-roles', 'admin', '/admin/roles', 'console:access', { ko: '권한/역할', en: 'Roles' }, true),
    // The real menu needs `platform:view`; `voc:view` stands in so a session can lack it and still open the home.
    menu('permission-requests', 'noticeVoc', '/permission-requests', 'voc:view', { ko: '권한 요청', en: 'Permission requests' }),
  ],
});

let queries = 0;
function adapter(permissions: Session['user']['permissions']): PlatformAdapter {
  const session = testSession(permissions);
  return testAdapter({
    session: () => session,
    menuQuery: async () => { queries += 1; return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }; },
  });
}

function mount(permissions: Session['user']['permissions'], url = '/?v=1&scopeId=MEM', slots?: PlatformSlots, spaceIdMigrations?: Readonly<Record<string, string>>) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter(permissions)} registry={registry} slots={slots} spaceIdMigrations={spaceIdMigrations}><OperationsHome /></PlatformProvider></I18nProvider>);
}

async function settled() {
  await screen.findByRole('heading', { name: '플랫폼 홈' });
  await waitFor(() => expect(queries).toBeGreaterThan(0));
}

type MemoryStore = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
let persisted!: MemoryStore;
let tabStore!: MemoryStore;

beforeEach(() => {
  queries = 0;
  persisted = memoryStorage();
  tabStore = memoryStorage();
  vi.stubGlobal('localStorage', persisted);
  vi.stubGlobal('sessionStorage', tabStore);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const BOTH = ['platform:view', 'equipment:view', 'metrics:view', 'notice:view', 'voc:view'] as Session['user']['permissions'];

describe('operations console card (#1099c)', () => {
  it.each([
    ['F only', ['platform:view', 'notice:view', 'voc:view', 'features:access'], '대시보드'],
    ['C only', ['platform:view', 'notice:view', 'voc:view', 'console:access'], '플랫폼 관리'],
    ['F and C', ['platform:view', 'notice:view', 'voc:view', 'features:access', 'console:access'], '대시보드 · 플랫폼 관리'],
  ])('shows one card for %s that names only the sections this viewer can open', async (_, permissions, sections) => {
    mount(permissions as Session['user']['permissions']);
    await settled();
    const card = screen.getByRole('link', { name: /운영 콘솔/ });
    expect(card.textContent).toContain(sections);
    expect(screen.getAllByRole('link', { name: /운영 콘솔/ })).toHaveLength(1);
  });

  it('draws no console card for a viewer with neither F nor C', async () => {
    mount(['platform:view', 'notice:view', 'voc:view'] as Session['user']['permissions']);
    await settled();
    expect(screen.queryByRole('link', { name: /운영 콘솔/ })).toBeNull();
  });
});

describe('platform home launcher', () => {
  it('E1 draws the 내 할 일 slot between the work systems and the favorites grid, and nothing without a slot', async () => {
    mount(BOTH, '/?v=1&scopeId=MEM', { homeTodo: { Todo: () => <section aria-label="내 할 일">stub</section> } });
    await settled();
    const systems = screen.getByRole('region', { name: '업무 시스템' });
    const todo = screen.getByRole('region', { name: '내 할 일' });
    const favorites = screen.getByRole('heading', { name: '즐겨찾기' });
    expect(systems.compareDocumentPosition(todo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(todo.compareDocumentPosition(favorites) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    mount(BOTH);
    await settled();
    expect(screen.queryByRole('region', { name: '내 할 일' })).toBeNull();
  });

  it('links a partial-permission space card to its first openable menu without a continue line', async () => {
    const partialRegistry = createRegistry({
      platformHomeMenuId: 'home',
      permissions: [menuPermission('analytics:view'), menuPermission('equipment:view'), menuPermission('metrics:view')],
      spaces: registry.spaces,
      groups: registry.groups,
      menus: [
        ...registry.menus,
        menu('analysis-home', 'equipment', '/analysis-home', menuPermission('analytics:view'), { ko: '분석 홈', en: 'Analysis home' }),
      ],
    });
    const partialSpaces = partialRegistry.spaces.map(space => space.id === 'mars' ? { ...space, homeMenuId: 'analysis-home' } : space);
    const withDeniedHome = createRegistry({ platformHomeMenuId: 'home', permissions: [menuPermission('analytics:view'), menuPermission('equipment:view'), menuPermission('metrics:view')], spaces: partialSpaces, groups: partialRegistry.groups, menus: partialRegistry.menus });
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&page=9');
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter(['platform:view', 'equipment:view'])} registry={withDeniedHome}><OperationsHome /></PlatformProvider></I18nProvider>);
    await settled();
    const cards = within(screen.getByRole('region', { name: '업무 시스템' })).getAllByRole('link');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('href')).toBe('/mars/equipment?v=1&scopeId=MEM');
    expect(cards[0].textContent).not.toContain('이어서');
  });

  it('lists accessible spaces in registration order and continues a stored screen', async () => {
    tabStore.setItem('platform:space-last:u1', JSON.stringify({ bravo: '/metrics?v=1&scopeId=OLD&page=2&extra=1' }));
    mount(BOTH);
    await settled();
    const section = screen.getByRole('region', { name: '업무 시스템' });
    const cards = within(section).getAllByRole('link');
    expect(cards.map(card => card.textContent)).toEqual([
      expect.stringContaining('MARS'),
      expect.stringContaining('BRAVO'),
    ]);
    expect(cards[0].textContent).toContain('생산성 분석');
    expect(cards[0].textContent).toContain('설비·기간별 생산성과 사이클타임을 분석합니다.');
    expect(cards[1].textContent).toContain('지표관리');
    expect(cards[0].textContent).not.toContain('이어서');
    expect(cards[0].getAttribute('href')).toContain('/equipment');
    expect(cards[0].getAttribute('href')).not.toContain('page=2');
    expect(cards[1].textContent).toContain('이어서: 지표 카탈로그');
    const href = cards[1].getAttribute('href') ?? '';
    expect(href).toContain('/bravo/catalog');
    expect(href).toContain('page=2');
    expect(href).toContain('scopeId=MEM');
    expect(href).not.toContain('OLD');
    expect(href).not.toContain('extra=1');
    expect(tabStore.getItem('platform:space-last:u1')).toContain('page=2');
  });

  it('continues a screen stored under the former space id after the rename, and rewrites the store under the new id', async () => {
    tabStore.setItem('platform:space-last:u1', JSON.stringify({ metrics: '/metrics?v=1&scopeId=OLD&page=2&extra=1' }));
    mount(BOTH, undefined, undefined, { analytics: 'mars', metrics: 'bravo' });
    await settled();
    const cards = within(screen.getByRole('region', { name: '업무 시스템' })).getAllByRole('link');
    expect(cards[1].textContent).toContain('이어서: 지표 카탈로그');
    const href = cards[1].getAttribute('href') ?? '';
    expect(href).toContain('page=2');
    expect(href).toContain('scopeId=MEM');
    expect(href).not.toContain('extra=1');
    expect(Object.keys(JSON.parse(tabStore.getItem('platform:space-last:u1') ?? '{}'))).toEqual(['bravo']);
  });

  it('shows only the metrics card for a viewer', async () => {
    mount(['platform:view', 'metrics:view', 'notice:view', 'voc:view']);
    await settled();
    const cards = within(screen.getByRole('region', { name: '업무 시스템' })).getAllByRole('link');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('BRAVO');
  });

  it('H1 offers a 권한 요청 link in an empty space list and still shows notices', async () => {
    mount(['platform:view', 'notice:view', 'voc:view']);
    await settled();
    const section = screen.getByRole('region', { name: '업무 시스템' });
    expect(within(section).getByRole('heading', { name: '접근 가능한 업무 시스템이 없습니다' })).toBeTruthy();
    expect(within(section).getByText('필요한 업무 시스템과 기능 권한을 요청하세요.')).toBeTruthy();
    const links = within(section).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['권한 요청']);
    expect(new URL(links[0].getAttribute('href') ?? '', window.location.origin).pathname).toBe('/permission-requests');
    expect(screen.getByRole('link', { name: '공지 목록' })).toBeTruthy();
  });

  it('H1 without access to 권한 요청 keeps the old text and shows no link', async () => {
    mount(['platform:view', 'notice:view']);
    await settled();
    const section = screen.getByRole('region', { name: '업무 시스템' });
    expect(within(section).getByText('필요한 업무 시스템의 접근 권한을 플랫폼 관리자에게 요청하세요.')).toBeTruthy();
    expect(within(section).queryByRole('link')).toBeNull();
  });

  it('keeps only openable recent rows, drops home, and caps at five', async () => {
    persisted.setItem('platform:recent:u1', JSON.stringify([
      { menuId: 'home', url: '/', at: 8 },
      { menuId: 'equipment', url: '/equipment', at: 7 },
      { menuId: 'catalog', url: '/metrics?page=1', at: 6 },
      { menuId: 'notices', url: '/notices', at: 5 },
      { menuId: 'admin-roles', url: '/admin/roles', at: 4 },
    ]));
    mount(['platform:view', 'metrics:view', 'notice:view']);
    await settled();
    const recent = screen.getByRole('heading', { name: '최근 방문' }).closest('section')!;
    const links = within(recent).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['지표 카탈로그', '공지']);
    expect(links[0].closest('li')?.textContent).toContain('BRAVO');
    expect(links[0].closest('li')?.textContent).not.toContain('지표관리');
    expect(links[1].closest('li')?.textContent).toContain('플랫폼');
    expect(links[0].getAttribute('href')).toBe('/metrics?page=1');
    cleanup();
    persisted.setItem('platform:recent:u1', JSON.stringify(['x1', 'x2', 'x3', 'x4', 'x5', 'catalog'].map((menuId, index) => ({ menuId, url: `/${menuId}`, at: 100 - index }))));
    mount(['platform:view', 'metrics:view', 'notice:view']);
    await settled();
    const capped = within(screen.getByRole('heading', { name: '최근 방문' }).closest('section')!).getAllByRole('link');
    expect(capped.map(link => link.textContent)).toEqual(['추가1', '추가2', '추가3', '추가4', '추가5']);
  });

  it('keeps an openable home favorite and hides a menu the user can no longer open', async () => {
    persisted.setItem('platform:favorites:u1', JSON.stringify(['equipment', 'catalog', 'notices', 'home']));
    mount(['platform:view', 'metrics:view', 'notice:view']);
    await settled();
    const favorites = screen.getByRole('heading', { name: '즐겨찾기' }).closest('section')!;
    expect(within(favorites).queryByRole('link', { name: '설비' })).toBeNull();
    expect(within(favorites).getByRole('link', { name: '지표 카탈로그' })).toBeTruthy();
    expect(within(favorites).getByRole('link', { name: '공지' })).toBeTruthy();
    expect(within(favorites).getByRole('link', { name: '플랫폼 홈' })).toBeTruthy();
    expect(within(favorites).getAllByText('BRAVO')).toHaveLength(1);
    expect(within(favorites).queryByText('지표관리')).toBeNull();
    expect(within(favorites).getAllByText('플랫폼').length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    [true, ['platform:view', 'notice:view'] as Session['user']['permissions']],
    [false, ['platform:view'] as Session['user']['permissions']],
  ])('shows the notice list link only when notices are allowed (%s)', async (allowed, permissions) => {
    mount(permissions);
    await settled();
    expect(screen.queryByRole('link', { name: '공지 목록' }) !== null).toBe(allowed);
  });

  it.each([
    ['ko', '즐겨찾기', '최근 방문', '지금 조회 조건을 유지하고 그 화면의 기본 보기로 이동합니다.', '방문했던 조회 조건으로 돌아갑니다. 권한은 다시 확인합니다.', '플랫폼 홈'],
    ['en', 'Favorites', 'Recent', "Opens the screen's default view with your current filters.", 'Returns with the filters you used. Access is checked again.', 'Platform home'],
  ])('describes favorites and recent as actions (%s)', async (lang, favoritesHeading, recentHeading, favoritesCopy, recentCopy, pageHeading) => {
    if (lang === 'en') persisted.setItem('platform:lang', 'en');
    mount(['platform:view']);
    await screen.findByRole('heading', { name: pageHeading });
    expect(screen.getByRole('heading', { name: favoritesHeading }).closest('section')?.textContent).toContain(favoritesCopy);
    expect(screen.getByRole('heading', { name: recentHeading }).closest('section')?.textContent).toContain(recentCopy);
  });

  it.each([
    [true, ['platform:view', 'voc:view'] as Session['user']['permissions']],
    [false, ['platform:view'] as Session['user']['permissions']],
  ])('shows 내 VOC only when voc is allowed (%s)', async (allowed, permissions) => {
    mount(permissions);
    await settled();
    // The header link is a secondary action, so it is inside ⋯ and not mounted until the menu opens (#303).
    if (!allowed) {
      expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
      expect(screen.queryByRole('link', { name: '내 VOC' })).toBeNull();
      return;
    }
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(await screen.findByRole('link', { name: '내 VOC' })).toBeTruthy();
  });
});

// AA-2 (#398, 06 §26): the row's remove button disappears with the row it removes, so focus must
// move deliberately instead of falling to BODY. Scoped to the favorites section — the header star
// shares the accessible name 즐겨찾기에서 제거 when the home itself is a favorite.
describe('favorites removal focus (#398)', () => {
  function favoritesSection() {
    return screen.getByRole('heading', { name: '즐겨찾기' }).closest('section')!;
  }

  it('focuses the next row remove button after removing a middle favorite', async () => {
    persisted.setItem('platform:favorites:u1', JSON.stringify(['equipment', 'catalog', 'notices']));
    mount(['platform:view', 'equipment:view', 'metrics:view', 'notice:view']);
    await settled();
    const favorites = favoritesSection();
    const [first, middle, last] = within(favorites).getAllByRole('button', { name: '즐겨찾기에서 제거' });
    expect(within(favorites).getAllByRole('link').map(link => link.textContent)).toEqual(['설비', '지표 카탈로그', '공지']);
    middle.focus();
    fireEvent.click(middle);
    expect(within(favorites).getAllByRole('link').map(link => link.textContent)).toEqual(['설비', '공지']);
    expect(document.activeElement).toBe(last);
    expect(document.activeElement).not.toBe(first);
  });

  it('focuses the previous row remove button after removing the last of several favorites', async () => {
    persisted.setItem('platform:favorites:u1', JSON.stringify(['equipment', 'catalog']));
    mount(['platform:view', 'equipment:view', 'metrics:view']);
    await settled();
    const favorites = favoritesSection();
    const [first, last] = within(favorites).getAllByRole('button', { name: '즐겨찾기에서 제거' });
    last.focus();
    fireEvent.click(last);
    expect(within(favorites).getAllByRole('link').map(link => link.textContent)).toEqual(['설비']);
    expect(document.activeElement).toBe(first);
  });

  it('focuses the empty-state paragraph after removing the last remaining favorite', async () => {
    persisted.setItem('platform:favorites:u1', JSON.stringify(['catalog']));
    mount(['platform:view', 'metrics:view']);
    await settled();
    const favorites = favoritesSection();
    const [remove] = within(favorites).getAllByRole('button', { name: '즐겨찾기에서 제거' });
    remove.focus();
    fireEvent.click(remove);
    const empty = await within(favorites).findByText('즐겨찾기가 없습니다. 화면 제목 옆 ☆로 추가하세요.');
    expect(empty.getAttribute('tabindex')).toBe('-1');
    await waitFor(() => expect(document.activeElement).toBe(empty));
  });

  it('leaves focus where the user moved it before the empty-state frame runs', async () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback));
    try {
      persisted.setItem('platform:favorites:u1', JSON.stringify(['catalog']));
      mount(['platform:view', 'metrics:view']);
      await settled();
      const favorites = favoritesSection();
      const [remove] = within(favorites).getAllByRole('button', { name: '즐겨찾기에서 제거' });
      remove.focus();
      fireEvent.click(remove);
      const empty = await within(favorites).findByText('즐겨찾기가 없습니다. 화면 제목 옆 ☆로 추가하세요.');
      const elsewhere = screen.getByRole('heading', { name: '플랫폼 홈' });
      elsewhere.focus();
      expect(document.activeElement).toBe(elsewhere);
      act(() => { frames.splice(0).forEach(callback => callback(0)); });
      expect(document.activeElement).toBe(elsewhere);
      expect(document.activeElement).not.toBe(empty);
    } finally {
      raf.mockRestore();
    }
  });
});


const equipmentAxes = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
