import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { HomeLink } from './HomeLink';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, menuPermission, type GroupId, type Permission, type PlatformAdapter, type Session } from '@ap/contracts';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

function menu(id: string, group: GroupId, path: string, permission: Permission, primary = false) {
  return { id, group, path, permission, ...(primary ? { primary: true } : {}), label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: noFeatures, pageKeys: [] };
}

/** `/` is a global utility; the analytics home is a different menu, so the two destinations are distinguishable. */
function withPlatformHome(homePermission: Permission) {
  return createRegistry({
    permissions: [menuPermission('equipment:view')],
    spaces: [testSpace({ homeMenuId: 'overview' })],
    groups: [
      { id: groupId('overview'), label: { ko: '플랫폼', en: 'Platform' }, icon: House, space: null },
      { id: groupId('equipment'), label: { ko: '업무', en: 'Work' }, icon: House, space: spaceId('mars') },
    ],
    menus: [
      menu('launcher', groupId('overview'), '/', homePermission, true),
      menu('overview', groupId('equipment'), '/overview', 'platform:view', true),
    ],
  });
}

const spaceOnly = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [testSpace({ homeMenuId: 'overview' })],
  groups: [{ id: groupId('equipment'), label: { ko: '업무', en: 'Work' }, icon: House, space: spaceId('mars') }],
  menus: [menu('overview', groupId('equipment'), '/overview', 'platform:view', true)],
});

/** The space stays reachable through another menu, but neither `/` nor the space home can be opened. */
const spaceWithoutHome = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [testSpace({ homeMenuId: 'equipment' })],
  groups: [
    { id: groupId('overview'), label: { ko: '플랫폼', en: 'Platform' }, icon: House, space: null },
    { id: groupId('equipment'), label: { ko: '업무', en: 'Work' }, icon: House, space: spaceId('mars') },
  ],
  menus: [
    menu('launcher', groupId('overview'), '/', 'notice:view', true),
    menu('equipment', groupId('equipment'), '/equipment', menuPermission('equipment:view'), true),
    menu('detail', groupId('equipment'), '/detail', 'platform:view'),
  ],
});

/** Neither `/` nor the space can be opened, so there is no sidebar home to fall back to. */
const neither = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [testSpace({ permission: 'console:access', homeMenuId: 'overview' })],
  groups: [
    { id: groupId('overview'), label: { ko: '플랫폼', en: 'Platform' }, icon: House, space: null },
    { id: groupId('equipment'), label: { ko: '업무', en: 'Work' }, icon: House, space: spaceId('mars') },
  ],
  menus: [
    menu('launcher', groupId('overview'), '/', 'notice:view', true),
    menu('overview', groupId('equipment'), '/overview', 'console:access', true),
  ],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function adapterWith(permissions: Session['user']['permissions']): PlatformAdapter {
  const session = testSession(permissions);
  return testAdapter({
    session: () => session,
    getEntity: async () => forbidden,
    listAnnotations: async () => forbidden,
  });
}

function mount(registry: ReturnType<typeof createRegistry>, permissions: Session['user']['permissions'], url: string) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={adapterWith(permissions)} registry={registry}><HomeLink /></PlatformProvider></I18nProvider>);
}

function homePath(): string {
  const href = screen.getByRole('link', { name: '홈' }).getAttribute('href') ?? '';
  return new URL(href, 'http://x').pathname;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('HomeLink (platform home, ADR-0028)', () => {
  it('opens the menu registered at / when that menu can be opened', () => {
    mount(withPlatformHome('platform:view'), ['platform:view'], '/overview?v=1');
    expect(homePath()).toBe('/');
    expect(screen.getByRole('link', { name: '홈' }).getAttribute('href')).toContain('v=1');
  });

  it.each([
    ['unregistered', spaceOnly],
    ['not allowed', withPlatformHome('notice:view')],
  ])('falls back to the sidebar space home when the platform home is %s', (_label, registry) => {
    mount(registry, ['platform:view'], '/overview?v=1');
    expect(homePath()).toBe('/overview');
  });

  it('draws nothing when the platform home cannot be opened and there is no sidebar home', () => {
    mount(neither, ['platform:view'], '/?v=1');
    expect(screen.queryByRole('link', { name: '홈' })).toBeNull();
  });

  it('draws nothing when the space can be entered but neither home can be opened', () => {
    mount(spaceWithoutHome, ['platform:view'], '/detail?v=1');
    expect(screen.queryByRole('link', { name: '홈' })).toBeNull();
  });
});
