import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session, SpaceDef } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

// Two spaces, one menu each (06 §9.1 fixture): equipment carries a page key, admin-roles is the console home.
const spaces: SpaceDef[] = [
  { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'equipment' },
  { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' },
];
const registry = createRegistry({
  spaces,
  groups: [
    { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' },
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
  ],
  menus: [
    { id: 'equipment', group: 'equipment', primary: true, label: { ko: '설비', en: 'Equipment' }, description: { ko: '', en: '' }, path: '/equipment', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'analysis', features: noFeatures, pageKeys: ['page'] },
    { id: 'admin-roles', group: 'admin', primary: true, label: { ko: '권한/역할 관리', en: 'Roles & access' }, description: { ko: '', en: '' }, path: '/admin/roles', icon: House, permission: 'console:access', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [] },
  ],
});

const EQUIPMENT_URL = '/equipment?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&selectedEquipmentIds=ICH-PHOTO-0103&page=2';
const ADMIN: Session['user']['permissions'] = ['platform:view', 'console:access'];
const ANALYST: Session['user']['permissions'] = ['platform:view'];

function fixture(permissions: Session['user']['permissions']) {
  // One stable snapshot object: useSyncExternalStore compares by identity on every render.
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
  const adapter: PlatformAdapter = {
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    subscribe: () => () => {},
  };
  return adapter;
}

function SpaceProbe() {
  const { pathname, currentSpace, sidebarSpace, accessibleSpaces, visibleMenus, menusInSpace, recent, switchSpace } = usePlatform();
  return <div>
    <button type="button" data-testid="to-operations" onClick={() => switchSpace('operations')}>ops</button>
    <button type="button" data-testid="to-analytics" onClick={() => switchSpace('analytics')}>ana</button>
    <p data-testid="pathname">{pathname}</p>
    <p data-testid="current">{currentSpace?.id ?? '-'}</p>
    <p data-testid="sidebar">{sidebarSpace.id}</p>
    <p data-testid="accessible">{accessibleSpaces.map(s => s.id).join(',')}</p>
    <p data-testid="visible">{visibleMenus.map(m => m.id).join(',')}</p>
    <p data-testid="ana-menus">{menusInSpace('analytics').map(m => m.id).join(',')}</p>
    <p data-testid="ops-menus">{menusInSpace('operations').map(m => m.id).join(',')}</p>
    <p data-testid="recent">{recent.map(r => r.menuId).join(',')}</p>
  </div>;
}

function mountAt(url: string, permissions: Session['user']['permissions']) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={fixture(permissions)} registry={registry}><SpaceProbe /></PlatformProvider></I18nProvider>);
}

// Node's own (file-less) localStorage shadows jsdom's here, so give each test an in-memory store.
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('spaces on Platform (06 §9.1)', () => {
  it('switchSpace pushes to the space home keeping globals and dropping page keys', () => {
    mountAt(EQUIPMENT_URL, ADMIN);
    expect(screen.getByTestId('current').textContent).toBe('analytics');
    expect(screen.getByTestId('visible').textContent).toBe('equipment');

    act(() => screen.getByTestId('to-operations').click());
    expect(screen.getByTestId('pathname').textContent).toBe('/admin/roles');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('scopeId')).toBe('ICH');
    expect(params.get('from')).toBe('2026-09-25T09:00:00');
    expect(params.get('to')).toBe('2026-09-26T09:00:00');
    expect(params.get('selectedEquipmentIds')).toBe('ICH-PHOTO-0103');
    expect(params.get('page')).toBeNull();
    expect(screen.getByTestId('current').textContent).toBe('operations');
    expect(screen.getByTestId('visible').textContent).toBe('admin-roles');
    expect(screen.getByTestId('ana-menus').textContent).toBe('equipment');
  });

  it('switchSpace to the current space is a no-op and keeps the URL', () => {
    mountAt(EQUIPMENT_URL, ADMIN);
    const before = window.location.href;
    act(() => screen.getByTestId('to-analytics').click());
    expect(window.location.href).toBe(before);
    expect(screen.getByTestId('pathname').textContent).toBe('/equipment');
  });

  it('without console:access operations is not accessible: currentSpace still reports it, sidebar falls back, switch is a no-op', () => {
    mountAt(EQUIPMENT_URL.replace('/equipment', '/admin/roles'), ANALYST);
    expect(screen.getByTestId('accessible').textContent).toBe('analytics');
    // The matched route's space is reported even though entry is denied.
    expect(screen.getByTestId('current').textContent).toBe('operations');
    expect(screen.getByTestId('sidebar').textContent).toBe('analytics');
    expect(screen.getByTestId('ops-menus').textContent).toBe('');

    const before = window.location.href;
    act(() => screen.getByTestId('to-operations').click());
    expect(window.location.href).toBe(before);
  });

  it('a space-denied direct URL is not recorded in recent, while allowed navigation is', () => {
    mountAt('/admin/roles?v=1&scopeId=ICH', ANALYST);
    expect(screen.getByTestId('current').textContent).toBe('operations');
    expect(screen.getByTestId('recent').textContent).toBe('');

    act(() => screen.getByTestId('to-analytics').click());
    expect(screen.getByTestId('pathname').textContent).toBe('/equipment');
    expect(screen.getByTestId('recent').textContent).toBe('equipment');
  });
});
