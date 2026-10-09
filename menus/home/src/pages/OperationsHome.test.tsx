import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import OperationsHome from './OperationsHome';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const purpose = { ko: '목적', en: 'Purpose' };

function menu(id: string, group: 'overview' | 'equipment' | 'metrics' | 'noticeVoc' | 'admin', path: string, permission: Session['user']['permissions'][number], label: { ko: string; en: string }, primary = false, pageKeys: string[] = []) {
  return { id, group, path, permission, primary, label, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: none, pageType: 'overview' as const, features: noFeatures, pageKeys };
}

const registry = createRegistry({
  spaces: [
    { id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' }, homeMenuId: 'equipment' },
    { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' }, homeMenuId: 'catalog' },
    { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: purpose, permission: 'console:access', homeMenuId: 'admin-roles' },
  ],
  groups: [
    { id: 'overview', label: { ko: '운영 개요', en: 'Overview' }, icon: House, space: null },
    { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' },
    { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: House, space: 'metrics' },
    { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
  ],
  menus: [
    menu('home', 'overview', '/', 'platform:view', { ko: '플랫폼 홈', en: 'Platform home' }, true),
    menu('equipment', 'equipment', '/equipment', 'equipment:view', { ko: '설비', en: 'Equipment' }, true, ['page']),
    menu('catalog', 'metrics', '/metrics', 'metrics:view', { ko: '지표 카탈로그', en: 'Metric catalog' }, true, ['page']),
    menu('x1', 'metrics', '/x1', 'metrics:view', { ko: '추가1', en: 'Extra 1' }),
    menu('x2', 'metrics', '/x2', 'metrics:view', { ko: '추가2', en: 'Extra 2' }),
    menu('x3', 'metrics', '/x3', 'metrics:view', { ko: '추가3', en: 'Extra 3' }),
    menu('x4', 'metrics', '/x4', 'metrics:view', { ko: '추가4', en: 'Extra 4' }),
    menu('x5', 'metrics', '/x5', 'metrics:view', { ko: '추가5', en: 'Extra 5' }),
    menu('notices', 'noticeVoc', '/notices', 'notice:view', { ko: '공지', en: 'Notices' }, true),
    menu('voc', 'noticeVoc', '/voc', 'voc:view', { ko: 'VOC', en: 'VOC' }),
    menu('admin-roles', 'admin', '/admin/roles', 'console:access', { ko: '권한/역할', en: 'Roles' }, true),
  ],
});

let queries = 0;
function adapter(permissions: Session['user']['permissions']): PlatformAdapter {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
  return {
    menuQuery: async () => { queries += 1; return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }; },
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
    subscribe: () => () => {},
  };
}

function mount(permissions: Session['user']['permissions'], url = '/?v=1&scopeId=ICH') {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={adapter(permissions)} registry={registry}><OperationsHome /></PlatformProvider></I18nProvider>);
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
  const data = new Map<string, string>();
  const session = new Map<string, string>();
  persisted = {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
  };
  tabStore = {
    getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => { session.set(k, v); },
  };
  vi.stubGlobal('localStorage', {
    ...persisted,
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  });
  vi.stubGlobal('sessionStorage', {
    ...tabStore,
    removeItem: (k: string) => { session.delete(k); }, clear: () => session.clear(), key: () => null, get length() { return session.size; },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const BOTH = ['platform:view', 'equipment:view', 'metrics:view', 'notice:view', 'voc:view'] as Session['user']['permissions'];

describe('platform home launcher', () => {
  it('lists accessible spaces in registration order and continues a stored screen', async () => {
    tabStore.setItem('platform:space-last:u1', JSON.stringify({ metrics: '/metrics?v=1&scopeId=OLD&page=2&extra=1' }));
    mount(BOTH);
    await settled();
    const section = screen.getByRole('region', { name: '업무 시스템' });
    const cards = within(section).getAllByRole('link');
    expect(cards.map(card => card.textContent)).toEqual([
      expect.stringContaining('생산성 분석'),
      expect.stringContaining('지표관리'),
    ]);
    expect(cards[0].textContent).not.toContain('이어서');
    expect(cards[0].getAttribute('href')).toContain('/equipment');
    expect(cards[0].getAttribute('href')).not.toContain('page=2');
    expect(cards[1].textContent).toContain('이어서: 지표 카탈로그');
    const href = cards[1].getAttribute('href') ?? '';
    expect(href).toContain('/metrics');
    expect(href).toContain('page=2');
    expect(href).toContain('scopeId=ICH');
    expect(href).not.toContain('OLD');
    expect(href).not.toContain('extra=1');
    expect(tabStore.getItem('platform:space-last:u1')).toContain('page=2');
  });

  it('shows only the metrics card for a viewer', async () => {
    mount(['platform:view', 'metrics:view', 'notice:view', 'voc:view']);
    await settled();
    const cards = within(screen.getByRole('region', { name: '업무 시스템' })).getAllByRole('link');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('지표관리');
  });

  it('explains an empty space list without a link and still shows notices', async () => {
    mount(['platform:view', 'notice:view', 'voc:view']);
    await settled();
    const section = screen.getByRole('region', { name: '업무 시스템' });
    expect(within(section).getByRole('heading', { name: '접근 가능한 업무 시스템이 없습니다' })).toBeTruthy();
    expect(within(section).getByText('필요한 업무 시스템의 접근 권한을 플랫폼 관리자에게 요청하세요.')).toBeTruthy();
    expect(within(section).queryByRole('link')).toBeNull();
    expect(screen.getByRole('link', { name: '공지 목록' })).toBeTruthy();
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
    expect(links[0].closest('li')?.textContent).toContain('지표관리');
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
    expect(within(favorites).getAllByText('지표관리')).toHaveLength(1);
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
    expect(screen.queryByRole('link', { name: '내 VOC' }) !== null).toBe(allowed);
  });
});
