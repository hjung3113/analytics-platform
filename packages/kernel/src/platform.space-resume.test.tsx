import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session, SpaceDef } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const spaces: SpaceDef[] = [
  { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'equipment' },
  { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' },
];
const registry = createRegistry({
  spaces,
  groups: [
    { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' },
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
    { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
  ],
  menus: [
    { id: 'equipment', group: 'equipment', primary: true, label: { ko: '설비', en: 'Equipment' }, description: { ko: '', en: '' }, path: '/equipment', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'analysis', features: noFeatures, pageKeys: ['page'] },
    { id: 'admin-roles', group: 'admin', primary: true, label: { ko: '권한/역할 관리', en: 'Roles' }, description: { ko: '', en: '' }, path: '/admin/roles', icon: House, permission: 'console:access', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [] },
    { id: 'admin-child', group: 'admin', label: { ko: '콘솔 하위', en: 'Console child' }, description: { ko: '', en: '' }, path: '/admin/child', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [] },
    { id: 'notices', group: 'noticeVoc', primary: true, label: { ko: '공지', en: 'Notices' }, description: { ko: '', en: '' }, path: '/notices', icon: House, permission: 'notice:view', requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [] },
  ],
});

const ADMIN: Session['user']['permissions'] = ['platform:view', 'console:access', 'notice:view'];
const ANALYST: Session['user']['permissions'] = ['platform:view', 'notice:view'];
const NOTICES_ONLY: Session['user']['permissions'] = ['notice:view'];
const STORED = '/equipment?v=1&scopeId=OLD&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&page=2&extra=drop';

function fixture(permissions: Session['user']['permissions']) {
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

function Probe() {
  const { pathname, spaceResume, switchSpace, navigate } = usePlatform();
  const show = (id: 'analytics' | 'operations') => {
    const resume = spaceResume(id);
    return resume ? `${resume.menuId}|${resume.href}` : 'null';
  };
  return <div>
    <p data-testid="ana">{show('analytics')}</p>
    <p data-testid="ops">{show('operations')}</p>
    <p data-testid="path">{pathname}</p>
    <button type="button" data-testid="to-ops" onClick={() => switchSpace('operations')}>ops</button>
    <button type="button" data-testid="to-ana" onClick={() => switchSpace('analytics')}>ana</button>
    <button type="button" data-testid="to-notices" onClick={() => navigate('/notices?v=1&scopeId=ICH')}>notices</button>
  </div>;
}

function mountAt(url: string, permissions: Session['user']['permissions']) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={fixture(permissions)} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
}

beforeEach(() => {
  const data = new Map<string, string>();
  const session = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => { session.set(k, v); },
    removeItem: (k: string) => { session.delete(k); }, clear: () => session.clear(), key: () => null, get length() { return session.size; },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('spaceResume (06 §9.1)', () => {
  it('records an admitted space menu and restores its page keys with the current global', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: STORED }));
    mountAt('/notices?v=1&scopeId=ICH', ADMIN);
    const href = screen.getByTestId('ana').textContent ?? '';
    expect(href.startsWith('equipment|/equipment?')).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf('?')));
    expect(params.get('page')).toBe('2');
    expect(params.get('scopeId')).toBe('ICH');
    expect(params.get('from')).toBeNull();
    expect(params.get('extra')).toBeNull();
    expect(params.get('v')).toBe('1');
  });

  it('does not record a global menu and does not overwrite another space', () => {
    mountAt('/equipment?v=1&scopeId=ICH&page=2', ADMIN);
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null')).toEqual({ analytics: '/equipment?v=1&scopeId=ICH&page=2' });
    act(() => screen.getByTestId('to-ops').click());
    expect(screen.getByTestId('path').textContent).toBe('/admin/roles');
    const both = JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null') as Record<string, string>;
    expect(both.analytics).toBe('/equipment?v=1&scopeId=ICH&page=2');
    expect(both.operations.startsWith('/admin/roles?')).toBe(true);
    act(() => screen.getByTestId('to-notices').click());
    const after = JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null') as Record<string, string>;
    expect(Object.keys(after).sort()).toEqual(['analytics', 'operations']);
    expect(after.analytics).toBe('/equipment?v=1&scopeId=ICH&page=2');
  });

  it('does not record a contract error and replaces a broken document on the next write', () => {
    mountAt('/equipment?from=only', ADMIN);
    expect(sessionStorage.getItem('platform:space-last:u1')).toBeNull();
    cleanup();
    sessionStorage.setItem('platform:space-last:u1', '{');
    mountAt('/equipment?v=1&scopeId=ICH', ADMIN);
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null')).toEqual({ analytics: '/equipment?v=1&scopeId=ICH' });
  });

  it.each([
    ['another space menu', JSON.stringify({ analytics: '/admin/roles?v=1' })],
    ['an unregistered path', JSON.stringify({ analytics: '/missing?v=1' })],
    ['a contract error', JSON.stringify({ analytics: '/equipment?from=only' })],
    ['an incomplete metric pair', JSON.stringify({ analytics: '/equipment?v=1&metricId=M1' })],
    ['broken JSON', '{'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a non-string value', JSON.stringify({ analytics: 2 })],
  ])('returns null for %s', (_label, raw) => {
    sessionStorage.setItem('platform:space-last:u1', raw);
    mountAt('/notices?v=1', ADMIN);
    expect(screen.getByTestId('ana').textContent).toBe('null');
  });

  it('returns null when the menu permission or space entry no longer holds, and ignores another user key', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: '/equipment?v=1' }));
    mountAt('/notices?v=1', NOTICES_ONLY);
    expect(screen.getByTestId('ana').textContent).toBe('null');
    cleanup();
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ operations: '/admin/child?v=1' }));
    mountAt('/notices?v=1', ANALYST);
    expect(screen.getByTestId('ops').textContent).toBe('null');
    cleanup();
    sessionStorage.clear();
    sessionStorage.setItem('platform:space-last:other', JSON.stringify({ analytics: '/equipment?v=1&page=2' }));
    mountAt('/notices?v=1', ADMIN);
    expect(screen.getByTestId('ana').textContent).toBe('null');
  });

  it('switchSpace pushes the resumed href, or the space home, and does nothing on the current space', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ operations: '/admin/child?v=1&scopeId=OLD' }));
    mountAt('/equipment?v=1&scopeId=ICH', ADMIN);
    act(() => screen.getByTestId('to-ops').click());
    expect(screen.getByTestId('path').textContent).toBe('/admin/child');
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('ICH');
    const before = window.location.href;
    act(() => screen.getByTestId('to-ops').click());
    expect(window.location.href).toBe(before);
    cleanup();
    sessionStorage.removeItem('platform:space-last:u1');
    mountAt('/equipment?v=1&scopeId=ICH', ADMIN);
    act(() => screen.getByTestId('to-ops').click());
    expect(screen.getByTestId('path').textContent).toBe('/admin/roles');
  });
});
