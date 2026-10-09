import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupId, Permission, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { HomeLink } from './HomeLink';
import { noContext, testAdapter, testSpace } from './test-setup';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

function menu(id: string, group: GroupId, path: string, permission: Permission, primary = false) {
  return { id, group, path, permission, ...(primary ? { primary: true } : {}), label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: noFeatures, pageKeys: [] };
}

/** `/` is a global utility; the analytics home is a different menu, so the two destinations are distinguishable. */
function withPlatformHome(homePermission: Permission) {
  return createRegistry({
    spaces: [testSpace({ homeMenuId: 'overview' })],
    groups: [
      { id: 'overview', label: { ko: '플랫폼', en: 'Platform' }, icon: House, space: null },
      { id: 'equipment', label: { ko: '업무', en: 'Work' }, icon: House, space: 'analytics' },
    ],
    menus: [
      menu('launcher', 'overview', '/', homePermission, true),
      menu('overview', 'equipment', '/overview', 'platform:view', true),
    ],
  });
}

const spaceOnly = createRegistry({
  spaces: [testSpace({ homeMenuId: 'overview' })],
  groups: [{ id: 'equipment', label: { ko: '업무', en: 'Work' }, icon: House, space: 'analytics' }],
  menus: [menu('overview', 'equipment', '/overview', 'platform:view', true)],
});

/** The space stays reachable through another menu, but neither `/` nor the space home can be opened. */
const spaceWithoutHome = createRegistry({
  spaces: [testSpace({ homeMenuId: 'equipment' })],
  groups: [
    { id: 'overview', label: { ko: '플랫폼', en: 'Platform' }, icon: House, space: null },
    { id: 'equipment', label: { ko: '업무', en: 'Work' }, icon: House, space: 'analytics' },
  ],
  menus: [
    menu('launcher', 'overview', '/', 'notice:view', true),
    menu('equipment', 'equipment', '/equipment', 'equipment:view', true),
    menu('detail', 'equipment', '/detail', 'platform:view'),
  ],
});

/** Neither `/` nor the space can be opened, so there is no sidebar home to fall back to. */
const neither = createRegistry({
  spaces: [testSpace({ permission: 'console:access', homeMenuId: 'overview' })],
  groups: [
    { id: 'overview', label: { ko: '플랫폼', en: 'Platform' }, icon: House, space: null },
    { id: 'equipment', label: { ko: '업무', en: 'Work' }, icon: House, space: 'analytics' },
  ],
  menus: [
    menu('launcher', 'overview', '/', 'notice:view', true),
    menu('overview', 'equipment', '/overview', 'console:access', true),
  ],
});

const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
function adapterWith(permissions: Session['user']['permissions']): PlatformAdapter {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions }, scopes: [] };
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
  const values = new Map<string, string>();
  const session = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => session.get(key) ?? null, setItem: (key: string, value: string) => session.set(key, value), removeItem: (key: string) => session.delete(key), clear: () => session.clear() });
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
