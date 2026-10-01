import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session, SpaceDef } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

// Two spaces (06 §9.1 fixture): equipment carries a page key, admin-roles is the console home, and
// admin-child is a non-home console menu whose permission ('platform:view') is weaker than its space's
// gate ('console:access') — so a space denial on it cannot be masked by the menu-permission guard.
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
    { id: 'admin-child', group: 'admin', label: { ko: '콘솔 하위', en: 'Console child' }, description: { ko: '', en: '' }, path: '/admin/child', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [] },
  ],
});

const EQUIPMENT_URL = '/equipment?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&selectedEquipmentIds=ICH-PHOTO-0103&page=2';
const ADMIN: Session['user']['permissions'] = ['platform:view', 'console:access'];
const ANALYST: Session['user']['permissions'] = ['platform:view'];

function fixture(permissions: Session['user']['permissions']) {
  // One stable snapshot object: useSyncExternalStore compares by identity on every render.
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
  const adapter: PlatformAdapter = {
    menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
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
    expect(screen.getByTestId('visible').textContent).toBe('admin-roles,admin-child');
    expect(screen.getByTestId('ana-menus').textContent).toBe('equipment');
  });

  it('switchSpace pushes a history entry so Back restores the exact origin URL', async () => {
    mountAt(EQUIPMENT_URL, ADMIN);
    const startLength = window.history.length;
    act(() => screen.getByTestId('to-operations').click());
    expect(screen.getByTestId('pathname').textContent).toBe('/admin/roles');
    expect(window.history.length).toBe(startLength + 1);

    await act(async () => {
      window.history.back();
      await waitFor(() => expect(window.location.pathname + window.location.search).toBe(EQUIPMENT_URL));
    });
    expect(screen.getByTestId('pathname').textContent).toBe('/equipment');
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

  it('a space-denied direct URL is neither recent nor usage even when its menu permission passes', () => {
    // admin-child only needs 'platform:view', which the analyst has: the operations space gate
    // ('console:access') is the ONLY guard that can deny /admin/child, so this pins the canEnter
    // checks in both the recent and usage effects (the /admin/roles home is menu-denied as well).
    mountAt('/admin/child?v=1&scopeId=ICH', ANALYST);
    expect(screen.getByTestId('current').textContent).toBe('operations');
    expect(screen.getByTestId('recent').textContent).toBe('');
    expect(localStorage.getItem('platform:recent:u1')).toBeNull();
    expect(localStorage.getItem('platform:usage')).toBeNull();
  });

  it('a console:access user visiting the same child URL is recorded in recent', () => {
    mountAt('/admin/child?v=1&scopeId=ICH', ADMIN);
    expect(screen.getByTestId('recent').textContent).toBe('admin-child');
    expect(JSON.parse(localStorage.getItem('platform:recent:u1') ?? 'null')).toEqual([
      { menuId: 'admin-child', url: '/admin/child?v=1&scopeId=ICH', at: expect.any(Number) },
    ]);
    // Usage is events via adapter.recordUsage now — the old platform:usage counter must stay dead.
    expect(localStorage.getItem('platform:usage')).toBeNull();
  });
});
