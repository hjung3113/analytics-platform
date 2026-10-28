import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, mountModule, usePlatform, usePlatformQuery } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { ItemScreen, ListScreen, manifest } from '../../__fixtures__/module-fixture';
import { RouteOutlet } from '../RouteOutlet';
import { groupId, spaceId, type ApiResponse, type MenuQuery, type Permission, type Session } from '@ap/contracts';

// `both` is an UNGATED global menu (space null) needing C (`console:access`, primary) AND F (`features:access`, additional): no space gate masks the
// extra grant, so the outlet's own menu predicate is the only thing that can deny it.
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const F: Permission = 'features:access';
const C: Permission = 'console:access';
const MATRIX: ReadonlyArray<[string, Session['user']['permissions'], boolean]> = [
  ['neither', ['platform:view'], false],
  ['F only', ['platform:view', F], false],
  ['C only', ['platform:view', C], false],
  ['F and C', ['platform:view', F, C], true],
];
const DENIED = '이 메뉴에 대한 권한이 없습니다';

function BothPage() {
  const { adapter } = usePlatform();
  usePlatformQuery(signal => adapter.menuQuery({ endpoint: 'fixture.query', context: {}, params: {} }, signal));
  return <p>both page</p>;
}
const entry = (id: string, group: string, path: string, over: object = {}) => ({
  id, group: groupId(group), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'management' as const, features: noFeatures, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'mars-home' })],
  groups: [
    { id: groupId('home'), label: { ko: '홈', en: 'Home' }, icon: House, space: spaceId('mars') },
    { id: groupId('utility'), label: { ko: '유틸', en: 'Utility' }, icon: House, space: null },
  ],
  menus: [
    entry('mars-home', 'home', '/mars-home', { primary: true }),
    entry('both', 'utility', '/both', { permission: C, additionalPermissions: [F], primary: true, component: BothPage }),
  ],
});

function fixture(permissions: Session['user']['permissions']) {
  let session = testSession(permissions);
  const listeners = new Set<() => void>();
  const queries: MenuQuery[] = [];
  const adapter = testAdapter({
    session: () => session,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    menuQuery: vi.fn((request: MenuQuery) => { queries.push(request); return new Promise<ApiResponse<never>>(() => {}); }),
  });
  return { adapter, queries, revoke: (next: Session['user']['permissions']) => act(async () => { session = testSession(next); listeners.forEach(l => l()); }) };
}

beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('RouteOutlet and additionalPermissions on an ungated global menu', () => {
  it.each(MATRIX)('%s: the page mounts and queries only with both grants', (_name, permissions, open) => {
    const { adapter, queries } = fixture(permissions);
    window.history.replaceState(null, '', '/both');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);
    expect(screen.queryByText('both page') !== null).toBe(open);
    expect(screen.queryByText(DENIED) !== null).toBe(!open);
    expect(queries.length > 0).toBe(open);
  });

  it.each([
    ['the extra grant (F)', ['platform:view', C]],
    ['the primary grant (C)', ['platform:view', F]],
  ] as const)('revoking %s mid-session unmounts the page and shows the denial', async (_name, after) => {
    const { adapter, queries, revoke } = fixture(['platform:view', C, F]);
    window.history.replaceState(null, '', '/both');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>);
    expect(screen.getByText('both page')).toBeTruthy();
    const before = queries.length;
    expect(before).toBeGreaterThan(0);
    await revoke(after);
    expect(screen.queryByText('both page')).toBeNull();
    expect(screen.getByText(DENIED)).toBeTruthy();
    expect(queries).toHaveLength(before);
  });
});

describe('module menus keep the primary-only ModuleScopedId predicate (ADR-0053)', () => {
  const FIXTURE_URL = '/mars/fixture-list?v=1';
  const lists: MenuQuery[] = [];
  let seen!: ReturnType<typeof useHostPlatform>;
  function Probe() { seen = useHostPlatform(); return null; }

  function mount(permissions: Session['user']['permissions']) {
    lists.length = 0;
    const { menus, groups } = mountModule(manifest, { list: ListScreen, item: ItemScreen }, {
      prefix: '/fixture', groupSpace: { 'fixture:main': spaceId('mars') }, config: { apiBase: 'https://api.example' },
      icons: { groups: { 'fixture:main': House }, screens: { list: House, item: House } },
    });
    const moduleRegistry = createRegistry({
      spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'mars-home' })],
      groups: [{ id: groupId('home'), label: { ko: '홈', en: 'Home' }, icon: House, space: spaceId('mars') }, ...groups],
      menus: [entry('mars-home', 'home', '/mars-home', { primary: true }), ...menus],
    });
    const session = testSession(permissions);
    const adapter = testAdapter({
      session: () => session,
      menuQuery: vi.fn((request: MenuQuery) => { lists.push(request); return new Promise<ApiResponse<never>>(() => {}); }),
    });
    window.history.replaceState(null, '', FIXTURE_URL);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={moduleRegistry}><Probe /><main id="platform-main" tabIndex={-1}><RouteOutlet /></main></PlatformProvider></I18nProvider>);
  }

  it('the primary grant opens the menu, resolves the link, renders the screen and lets it query', () => {
    mount(['platform:view', 'fixture:view']);
    expect(seen.canOpen('fixture:list')).toBe(true);
    expect(seen.resolveLink('fixture:list').allowed).toBe(true);
    expect(screen.getByRole('heading', { name: 'Fixture list' })).toBeTruthy();
    expect(lists.length).toBeGreaterThan(0);
  });

  it('without the primary grant the menu, the link, the render and the request are all denied', () => {
    mount(['platform:view']);
    expect(seen.canOpen('fixture:list')).toBe(false);
    expect(seen.resolveLink('fixture:list').allowed).toBe(false);
    expect(seen.globalMenus.concat(seen.menusInSpace(spaceId('mars'))).map(m => m.id)).not.toContain('fixture:list');
    expect(screen.queryByRole('heading', { name: 'Fixture list' })).toBeNull();
    expect(screen.getByText(DENIED)).toBeTruthy();
    expect(lists).toHaveLength(0);
  });
});
