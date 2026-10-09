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
    { id: 'equipment-detail', group: 'equipment', label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' }, path: '/equipment/:equipmentId', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'analysis', features: noFeatures, pageKeys: [], navHidden: true, parent: 'equipment' },
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

  it.each([
    ['a plain id', '/equipment/ICH-PHOTO-0103', 'equipment-detail|/equipment/ICH-PHOTO-0103?v=1&scopeId=ICH'],
    ['an encoded ordinary id', '/equipment/ICH%2DPHOTO%2D0103', 'equipment-detail|/equipment/ICH-PHOTO-0103?v=1&scopeId=ICH'],
    ['an id with an encoded space', '/equipment/ICH%20PHOTO', 'equipment-detail|/equipment/ICH%20PHOTO?v=1&scopeId=ICH'],
  ])('restores %s', (_label, stored, expected) => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: stored }));
    mountAt('/notices?v=1&scopeId=ICH', ADMIN);
    expect(screen.getByTestId('ana').textContent).toBe(expected);
  });

  it.each([
    ['encoded dots', '/equipment/%2e%2e'],
    ['encoded dots, uppercase', '/equipment/%2E%2E'],
    ['a dot segment', '/equipment/.'],
    ['a dot-dot segment', '/equipment/..'],
    ['a mixed dot encoding', '/equipment/.%2e'],
    ['a double slash', '/equipment//ICH-PHOTO-0103'],
  ])('returns null for %s', (_label, stored) => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: stored }));
    mountAt('/notices?v=1&scopeId=ICH', ADMIN);
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

// Deliberately interleaved menus: sidebar group order wins over global menu order.
const entryRegistry = createRegistry({
  spaces,
  groups: [...registry.groups, { id: 'analytics', label: { ko: '분석', en: 'Analysis' }, icon: House, space: 'analytics' }],
  menus: [
    registry.menuById('admin-roles'),
    { ...registry.menuById('admin-child'), id: 'later-group', group: 'analytics', primary: true, path: '/analysis/later' },
    registry.menuById('admin-child'),
    { ...registry.menuById('equipment'), permission: 'analytics:view' },
    { ...registry.menuById('equipment-detail'), navHidden: false },
    { ...registry.menuById('equipment'), id: 'hidden', primary: false, path: '/hidden', navHidden: true },
    { ...registry.menuById('equipment'), id: 'first', primary: false, path: '/first' },
    { ...registry.menuById('equipment'), id: 'second', primary: false, path: '/second' },
    registry.menuById('notices'),
  ],
});
let entryPlatform!: ReturnType<typeof usePlatform>;
function EntryProbe() {
  entryPlatform = usePlatform();
  return null;
}
function mountEntry(permissions: Session['user']['permissions']) {
  window.history.replaceState(null, '', '/notices?v=1&scopeId=ICH&page=9');
  render(<I18nProvider><PlatformProvider adapter={fixture(permissions)} registry={entryRegistry}><EntryProbe /></PlatformProvider></I18nProvider>);
}

describe('spaceEntry and canOpen (#264)', () => {
  it.each([
    ['partial permission', ANALYST, null, { menuId: 'first', href: '/first?v=1&scopeId=ICH', resumed: false }],
    ['openable home', [...ANALYST, 'analytics:view'] as Session['user']['permissions'], null, { menuId: 'equipment', href: '/equipment?v=1&scopeId=ICH', resumed: false }],
    ['last screen before home', [...ANALYST, 'analytics:view'] as Session['user']['permissions'], '/second?v=1&page=2', { menuId: 'second', href: '/second?v=1&scopeId=ICH&page=2', resumed: true }],
    ['rejected last screen', ANALYST, '/equipment?v=1', { menuId: 'first', href: '/first?v=1&scopeId=ICH', resumed: false }],
    ['no openable menu', NOTICES_ONLY, null, null],
  ])('chooses %s', (_label, permissions, stored, expected) => {
    if (stored) sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: stored }));
    mountEntry(permissions);
    expect(entryPlatform.spaceEntry('analytics')).toEqual(expected);
  });

  it('pushes the first openable menu and keeps current-space and denied-space switches inert', () => {
    mountEntry(ANALYST);
    const push = vi.spyOn(window.history, 'pushState');
    act(() => entryPlatform.switchSpace('analytics'));
    expect(push).toHaveBeenCalledWith(null, '', '/first?v=1&scopeId=ICH');
    act(() => entryPlatform.switchSpace('analytics'));
    act(() => entryPlatform.switchSpace('operations'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(entryPlatform.spaceEntry('operations')).toBeNull();
    push.mockRestore();
  });

  it.each([
    ['notices', ANALYST, undefined, true],
    ['notices', ['platform:view'] as Session['user']['permissions'], undefined, false],
    ['admin-child', ANALYST, undefined, false],
    ['admin-child', ADMIN, undefined, true],
    ['equipment', ANALYST, undefined, false],
    ['equipment-detail', ANALYST, { equipmentId: 'E1' }, true],
  ])('canOpen %s agrees with resolveLink without requiring route params', (id, permissions, params, allowed) => {
    mountEntry(permissions);
    expect(entryPlatform.canOpen(id)).toBe(allowed);
    expect(entryPlatform.resolveLink(id, { params }).allowed).toBe(allowed);
  });
});
