import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform } from '../platform';
import { createRegistry, type PlatformMenuEntry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { groupId, spaceId, menuPermission, type Session, type SpaceDef } from '@ap/contracts';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const spaces: SpaceDef[] = [
  testSpace({ id: spaceId('mars'), homeMenuId: 'equipment' }),
  testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' }),
];
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces,
  groups: [
    { id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: spaceId('mars') },
    { id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') },
    { id: groupId('noticeVoc'), label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
  ],
  menus: [
    { id: 'equipment', group: groupId('equipment'), primary: true, label: { ko: '설비', en: 'Equipment' }, description: { ko: '', en: '' }, path: '/equipment', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: noFeatures, pageKeys: ['page'] },
    { id: 'equipment-detail', group: groupId('equipment'), label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' }, path: '/equipment/:equipmentId', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: noFeatures, pageKeys: [], navHidden: true, parent: 'equipment' },
    { id: 'admin-roles', group: groupId('admin'), primary: true, label: { ko: '권한/역할 관리', en: 'Roles' }, description: { ko: '', en: '' }, path: '/admin/roles', icon: House, permission: 'console:access', requiresScope: false, context: noContext, pageType: 'management', features: noFeatures, pageKeys: [] },
    { id: 'admin-child', group: groupId('admin'), label: { ko: '콘솔 하위', en: 'Console child' }, description: { ko: '', en: '' }, path: '/admin/child', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: noFeatures, pageKeys: [] },
    { id: 'notices', group: groupId('noticeVoc'), primary: true, label: { ko: '공지', en: 'Notices' }, description: { ko: '', en: '' }, path: '/notices', icon: House, permission: 'notice:view', requiresScope: false, context: noContext, pageType: 'management', features: noFeatures, pageKeys: [] },
  ],
});

const ADMIN: Session['user']['permissions'] = ['platform:view', 'console:access', 'notice:view'];
const ANALYST: Session['user']['permissions'] = ['platform:view', 'notice:view'];
const NOTICES_ONLY: Session['user']['permissions'] = ['notice:view'];
const STORED = '/equipment?v=1&scopeId=OLD&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&page=2&extra=drop';

function fixture(permissions: Session['user']['permissions']) {
  const session = testSession(permissions);
  const adapter = testAdapter({ session: () => session });
  return adapter;
}

function Probe() {
  const { pathname, spaceResume, switchSpace, navigate } = useHostPlatform();
  const show = (id: 'mars' | 'operations') => {
    const resume = spaceResume(spaceId(id));
    return resume ? `${resume.menuId}|${resume.href}` : 'null';
  };
  return <div>
    <p data-testid="ana">{show('mars')}</p>
    <p data-testid="ops">{show('operations')}</p>
    <p data-testid="path">{pathname}</p>
    <button type="button" data-testid="to-ops" onClick={() => switchSpace(spaceId('operations'))}>ops</button>
    <button type="button" data-testid="to-ana" onClick={() => switchSpace(spaceId('mars'))}>ana</button>
    <button type="button" data-testid="to-notices" onClick={() => navigate('/notices?v=1&scopeId=MEM')}>notices</button>
  </div>;
}

function mountAt(url: string, permissions: Session['user']['permissions'], spaceIdMigrations?: Readonly<Record<string, string>>) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={fixture(permissions)} registry={registry} spaceIdMigrations={spaceIdMigrations}><Probe /></PlatformProvider></I18nProvider>);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('spaceResume (06 §9.1)', () => {
  it('records an admitted space menu and restores its page keys with the current global', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ mars: STORED }));
    mountAt('/notices?v=1&scopeId=MEM', ADMIN);
    const href = screen.getByTestId('ana').textContent ?? '';
    expect(href.startsWith('equipment|/equipment?')).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf('?')));
    expect(params.get('page')).toBe('2');
    expect(params.get('scopeId')).toBe('MEM');
    expect(params.get('from')).toBeNull();
    expect(params.get('extra')).toBeNull();
    expect(params.get('v')).toBe('1');
  });

  it('does not record a global menu and does not overwrite another space', () => {
    mountAt('/equipment?v=1&scopeId=MEM&page=2', ADMIN);
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null')).toEqual({ mars: '/equipment?v=1&scopeId=MEM&page=2' });
    act(() => screen.getByTestId('to-ops').click());
    expect(screen.getByTestId('path').textContent).toBe('/admin/roles');
    const both = JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null') as Record<string, string>;
    expect(both.mars).toBe('/equipment?v=1&scopeId=MEM&page=2');
    expect(both.operations.startsWith('/admin/roles?')).toBe(true);
    act(() => screen.getByTestId('to-notices').click());
    const after = JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null') as Record<string, string>;
    expect(Object.keys(after).sort()).toEqual(['mars', 'operations']);
    expect(after.mars).toBe('/equipment?v=1&scopeId=MEM&page=2');
  });

  it('does not record a contract error and replaces a broken document on the next write', () => {
    mountAt('/equipment?from=only', ADMIN);
    expect(sessionStorage.getItem('platform:space-last:u1')).toBeNull();
    cleanup();
    sessionStorage.setItem('platform:space-last:u1', '{');
    mountAt('/equipment?v=1&scopeId=MEM', ADMIN);
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null')).toEqual({ mars: '/equipment?v=1&scopeId=MEM' });
  });

  it.each([
    ['another space menu', JSON.stringify({ mars: '/admin/roles?v=1' })],
    ['an unregistered path', JSON.stringify({ mars: '/missing?v=1' })],
    ['a contract error', JSON.stringify({ mars: '/equipment?from=only' })],
    ['an incomplete metric pair', JSON.stringify({ mars: '/equipment?v=1&metricId=M1' })],
    ['broken JSON', '{'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a non-string value', JSON.stringify({ mars: 2 })],
  ])('returns null for %s', (_label, raw) => {
    sessionStorage.setItem('platform:space-last:u1', raw);
    mountAt('/notices?v=1', ADMIN);
    expect(screen.getByTestId('ana').textContent).toBe('null');
  });

  it.each([
    ['a plain id', '/equipment/MEM-PHOTO-0103', 'equipment-detail|/equipment/MEM-PHOTO-0103?v=1&scopeId=MEM'],
    ['an encoded ordinary id', '/equipment/MEM%2DPHOTO%2D0103', 'equipment-detail|/equipment/MEM-PHOTO-0103?v=1&scopeId=MEM'],
    ['an id with an encoded space', '/equipment/MEM%20PHOTO', 'equipment-detail|/equipment/MEM%20PHOTO?v=1&scopeId=MEM'],
  ])('restores %s', (_label, stored, expected) => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ mars: stored }));
    mountAt('/notices?v=1&scopeId=MEM', ADMIN);
    expect(screen.getByTestId('ana').textContent).toBe(expected);
  });

  it.each([
    ['encoded dots', '/equipment/%2e%2e'],
    ['encoded dots, uppercase', '/equipment/%2E%2E'],
    ['a dot segment', '/equipment/.'],
    ['a dot-dot segment', '/equipment/..'],
    ['a mixed dot encoding', '/equipment/.%2e'],
    ['an invalid percent escape', '/equipment/%E0%A4%A'],
    ['a double slash', '/equipment//MEM-PHOTO-0103'],
  ])('returns null for %s', (_label, stored) => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ mars: stored }));
    mountAt('/notices?v=1&scopeId=MEM', ADMIN);
    expect(screen.getByTestId('ana').textContent).toBe('null');
  });

  describe('spaceIdMigrations (a renamed space id, #713m)', () => {
    const RENAMED = { analytics: 'mars' };
    const read = () => JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null') as Record<string, string>;

    it('resumes from an entry stored under the former id, moves it to the new id and drops the old key', () => {
      sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: STORED }));
      mountAt('/notices?v=1&scopeId=MEM', ADMIN, RENAMED);
      const href = screen.getByTestId('ana').textContent ?? '';
      expect(href.startsWith('equipment|/equipment?')).toBe(true);
      expect(new URLSearchParams(href.slice(href.indexOf('?'))).get('page')).toBe('2');
      expect(read()).toEqual({ mars: STORED });
    });

    it('prefers the entry under the new id when both are stored, and still drops the old key', () => {
      sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: '/equipment?v=1&page=7', mars: '/equipment?v=1&page=3' }));
      mountAt('/notices?v=1&scopeId=MEM', ADMIN, RENAMED);
      expect(screen.getByTestId('ana').textContent).toContain('page=3');
      expect(read()).toEqual({ mars: '/equipment?v=1&page=3' });
    });

    it('keeps an unmapped key as it is and writes only the new id', () => {
      sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ operations: '/admin/child?v=1', legacy: '/x?v=1' }));
      mountAt('/equipment?v=1&scopeId=MEM', ADMIN, RENAMED);
      expect(read()).toEqual({ operations: '/admin/child?v=1', legacy: '/x?v=1', mars: '/equipment?v=1&scopeId=MEM' });
    });

    it('does not read the former id without a migration table', () => {
      sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ analytics: STORED }));
      mountAt('/notices?v=1&scopeId=MEM', ADMIN);
      expect(screen.getByTestId('ana').textContent).toBe('null');
    });
  });

  it('returns null when the menu permission or space entry no longer holds, and ignores another user key', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ mars: '/equipment?v=1' }));
    mountAt('/notices?v=1', NOTICES_ONLY);
    expect(screen.getByTestId('ana').textContent).toBe('null');
    cleanup();
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ operations: '/admin/child?v=1' }));
    mountAt('/notices?v=1', ANALYST);
    expect(screen.getByTestId('ops').textContent).toBe('null');
    cleanup();
    sessionStorage.clear();
    sessionStorage.setItem('platform:space-last:other', JSON.stringify({ mars: '/equipment?v=1&page=2' }));
    mountAt('/notices?v=1', ADMIN);
    expect(screen.getByTestId('ana').textContent).toBe('null');
  });

  it('switchSpace pushes the resumed href, or the space home, and does nothing on the current space', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ operations: '/admin/child?v=1&scopeId=OLD' }));
    mountAt('/equipment?v=1&scopeId=MEM', ADMIN);
    act(() => screen.getByTestId('to-ops').click());
    expect(screen.getByTestId('path').textContent).toBe('/admin/child');
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('MEM');
    const before = window.location.href;
    act(() => screen.getByTestId('to-ops').click());
    expect(window.location.href).toBe(before);
    cleanup();
    sessionStorage.removeItem('platform:space-last:u1');
    mountAt('/equipment?v=1&scopeId=MEM', ADMIN);
    act(() => screen.getByTestId('to-ops').click());
    expect(screen.getByTestId('path').textContent).toBe('/admin/roles');
  });
});

// Deliberately interleaved menus: sidebar group order wins over global menu order.
const entryRegistry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces,
  groups: [...registry.groups, { id: groupId('analytics'), label: { ko: '분석', en: 'Analysis' }, icon: House, space: spaceId('mars') }],
  menus: [
    registry.menuById('admin-roles'),
    { ...(registry.menuById('admin-child') as PlatformMenuEntry), id: 'later-group', group: groupId('analytics'), primary: true, path: '/analysis/later' },
    registry.menuById('admin-child'),
    { ...registry.menuById('equipment'), permission: menuPermission('analytics:view') },
    { ...registry.menuById('equipment-detail'), navHidden: false },
    { ...registry.menuById('equipment'), id: 'hidden', primary: false, path: '/hidden', navHidden: true },
    { ...registry.menuById('equipment'), id: 'first', primary: false, path: '/first' },
    { ...registry.menuById('equipment'), id: 'second', primary: false, path: '/second' },
    registry.menuById('notices'),
  ],
});
let entryPlatform!: ReturnType<typeof useHostPlatform>;
function EntryProbe() {
  entryPlatform = useHostPlatform();
  return null;
}
function mountEntry(permissions: Session['user']['permissions']) {
  window.history.replaceState(null, '', '/notices?v=1&scopeId=MEM&page=9');
  render(<I18nProvider><PlatformProvider adapter={fixture(permissions)} registry={entryRegistry}><EntryProbe /></PlatformProvider></I18nProvider>);
}

describe('spaceEntry and canOpen (#264)', () => {
  it.each([
    ['partial permission', ANALYST, null, { menuId: 'first', href: '/first?v=1&scopeId=MEM', resumed: false }],
    ['openable home', [...ANALYST, 'analytics:view'] as Session['user']['permissions'], null, { menuId: 'equipment', href: '/equipment?v=1&scopeId=MEM', resumed: false }],
    ['last screen before home', [...ANALYST, 'analytics:view'] as Session['user']['permissions'], '/second?v=1&page=2', { menuId: 'second', href: '/second?v=1&scopeId=MEM&page=2', resumed: true }],
    ['rejected last screen', ANALYST, '/equipment?v=1', { menuId: 'first', href: '/first?v=1&scopeId=MEM', resumed: false }],
    ['no openable menu', NOTICES_ONLY, null, null],
  ])('chooses %s', (_label, permissions, stored, expected) => {
    if (stored) sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ mars: stored }));
    mountEntry(permissions);
    expect(entryPlatform.spaceEntry(spaceId('mars'))).toEqual(expected);
  });

  it('pushes the first openable menu and keeps current-space and denied-space switches inert', () => {
    mountEntry(ANALYST);
    const push = vi.spyOn(window.history, 'pushState');
    act(() => entryPlatform.switchSpace(spaceId('mars')));
    expect(push).toHaveBeenCalledWith(null, '', '/first?v=1&scopeId=MEM');
    act(() => entryPlatform.switchSpace(spaceId('mars')));
    act(() => entryPlatform.switchSpace(spaceId('operations')));
    expect(push).toHaveBeenCalledTimes(1);
    expect(entryPlatform.spaceEntry(spaceId('operations'))).toBeNull();
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
