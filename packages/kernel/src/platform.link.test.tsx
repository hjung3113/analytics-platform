import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LinkOptions, LinkResolution } from './platform';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';
import { noContext, testAdapter, testSession, testSpace } from './testing';
import { groupId, spaceId, type Permission, menuPermission, type Session, type SpaceDef } from '@ap/contracts';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, group: 'equipment' | 'admin', path: string, permission: Permission, pageKeys: string[]) => ({
  id, group: groupId(group), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission, requiresScope: false, context: noContext, pageType: 'analysis' as const, features: noFeatures, pageKeys,
});

const spaces: SpaceDef[] = [
  testSpace({ homeMenuId: 'source' }),
  testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'ops-home' }),
];
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces,
  groups: [
    { id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: spaceId('analytics') },
    { id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') },
  ],
  menus: [
    { ...entry('source', 'equipment', '/source', 'platform:view', []), primary: true },
    entry('analysis', 'equipment', '/analysis', menuPermission('analytics:view'), ['tab']),
    { ...entry('ops-home', 'admin', '/ops', 'console:access', []), primary: true },
    // Weaker menu permission than its space's gate: only the space entry can deny it.
    entry('ops-child', 'admin', '/ops/child', 'platform:view', []),
  ],
});

const URL_MEM = '/source?v=1&scopeId=MEM&roomNames=PHOTO&selectedEquipmentIds=E1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const URL_FULL = URL_MEM + '&equipmentGroup=' + encodeURIComponent('{"axis":"team","id":"TEAM1"}') + '&lineNames=L1&prcGroups=P1&lotIds=L1&recipeIds=R1&ppid=P1';
const SITE_BOUND = ['lineNames', 'prcGroups', 'roomNames', 'equipmentGroup', 'selectedEquipmentIds', 'lotIds', 'recipeIds', 'ppid'];
const ANALYST: Session['user']['permissions'] = ['platform:view', 'analytics:view'];
const VIEWER: Session['user']['permissions'] = ['platform:view'];

function fixture(permissions: Session['user']['permissions']) {
  // One stable snapshot object: useSyncExternalStore compares by identity on every render.
  const session = testSession(permissions);
  const adapter = testAdapter({ session: () => session });
  return adapter;
}


let captured: ((id: string, options?: LinkOptions) => LinkResolution) | null = null;
function Probe() {
  const { resolveLink } = usePlatform();
  captured = resolveLink;
  return <p data-testid="ready">ready</p>;
}
function resolve(url: string, permissions: Session['user']['permissions'], menuId: string, options?: LinkOptions): LinkResolution {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(permissions)} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  screen.getByTestId('ready');
  return captured!(menuId, options);
}
const query = (href: string) => new URLSearchParams(href.slice(href.indexOf('?') + 1));

afterEach(() => { cleanup(); captured = null; });

describe('resolveLink (06 §22, issue #102)', () => {
  it('says whether the user may open the destination: menu permission and space entry', () => {
    expect(resolve(URL_MEM, ANALYST, 'analysis').allowed).toBe(true);
    cleanup();
    expect(resolve(URL_MEM, VIEWER, 'analysis').allowed).toBe(false);
    cleanup();
    // ops-child needs only platform:view, but its space needs console:access.
    expect(resolve(URL_MEM, VIEWER, 'ops-child').allowed).toBe(false);
    cleanup();
    expect(resolve(URL_MEM, [...VIEWER, 'console:access'], 'ops-child').allowed).toBe(true);
  });

  it('applies the site boundary: a different scopeId drops every carried site-bound set, explicit ones for the destination stay', () => {
    expect(SITE_BOUND.every(k => query(URL_FULL).has(k))).toBe(true);
    const cleared = query(resolve(URL_FULL, ANALYST, 'analysis', { global: { scopeId: 'FDRY' } }).href);
    expect(cleared.get('scopeId')).toBe('FDRY');
    for (const key of SITE_BOUND) expect(cleared.has(key), key).toBe(false);
    expect(cleared.get('from')).toBe('2026-09-25T09:00:00');
    cleanup();
    const explicit = query(resolve(URL_FULL, ANALYST, 'analysis', { global: { scopeId: 'FDRY', selection: ['FDRY-1'], lotIds: ['FDRY-L'], ppid: 'FDRY-P' } }).href);
    expect(explicit.get('selectedEquipmentIds')).toBe('FDRY-1');
    expect(explicit.get('lotIds')).toBe('FDRY-L');
    expect(explicit.get('ppid')).toBe('FDRY-P');
    for (const key of ['lineNames', 'prcGroups', 'roomNames', 'equipmentGroup', 'recipeIds']) expect(explicit.has(key), key).toBe(false);
    cleanup();
    const toNone = query(resolve(URL_FULL, ANALYST, 'analysis', { global: { scopeId: null } }).href);
    for (const key of SITE_BOUND) expect(toNone.has(key), key).toBe(false);
  });

  it('keeps every carried set when the scope is unchanged or not mentioned', () => {
    const same = query(resolve(URL_FULL, ANALYST, 'analysis', { global: { scopeId: 'MEM' } }).href);
    for (const key of SITE_BOUND) expect(same.has(key), key).toBe(true);
    cleanup();
    const unmentioned = query(resolve(URL_FULL, ANALYST, 'analysis').href);
    for (const key of SITE_BOUND) expect(unmentioned.has(key), key).toBe(true);
  });

  it('reports the page keys the destination does not register instead of dropping them silently', () => {
    const link = resolve(URL_MEM, ANALYST, 'analysis', { page: { tab: 'a', nope: 'b' } });
    expect(link.droppedPageKeys).toEqual(['nope']);
    expect(query(link.href).get('tab')).toBe('a');
    expect(query(link.href).has('nope')).toBe(false);
  });
});


describe('return fallback without a fixed home ID (#298)', () => {
  function ReturnProbe() {
    const platform = usePlatform();
    return <output>{JSON.stringify({ target: platform.returnTarget(), origin: platform.returnOrigin() })}</output>;
  }

  it.each([
    { name: 'platform home first', url: '/analysis?v=1', root: true, permissions: ANALYST, id: 'platform-start', href: '/?v=1' },
    { name: 'space home after denied platform home', url: '/analysis?v=1', root: true, permissions: VIEWER, id: 'source', href: '/source?v=1' },
    { name: 'sidebar space home outside registered routes', url: '/outside?v=1', root: false, permissions: VIEWER, id: 'source', href: '/source?v=1' },
    { name: 'exact emergency fallback when all homes denied', url: '/analysis?v=1', root: true, permissions: [] as Session['user']['permissions'], id: null, href: '/' },
    { name: 'emergency fallback with an accessible space but denied space home', url: '/analysis?v=1', root: false, permissions: ['analytics:view'] as Session['user']['permissions'], id: null, href: '/' },
    { name: 'space home when platform home absent', url: '/analysis?v=1', root: false, permissions: VIEWER, id: 'source', href: '/source?v=1' },
  ])('$name', ({ url, root, permissions, id, href }) => {
    const fallbackRegistry = createRegistry({ permissions: [menuPermission('analytics:view')],
      spaces, groups: registry.groups,
      menus: [...registry.menus, ...(root ? [entry('platform-start', 'equipment', '/', menuPermission('analytics:view'), [])] : [])],
    });
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(permissions)} registry={fallbackRegistry}><ReturnProbe /></PlatformProvider></I18nProvider>);
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual({
      target: href,
      origin: { href, menuLabel: id ? { ko: id, en: id } : { ko: '홈', en: 'Home' }, trail: [], revertedContext: [] },
    });
  });
});


describe('return permission and reverted Context (#298 FIX1)', () => {
  function ReturnProbe() {
    const platform = usePlatform();
    return <output>{JSON.stringify({ target: platform.returnTarget(), origin: platform.returnOrigin() })}</output>;
  }
  function mountReturn(current: string, origin: string, permissions = VIEWER, parent = 'source') {
    const returnRegistry = createRegistry({ permissions: [menuPermission('analytics:view')],
      spaces, groups: registry.groups,
      menus: [...registry.menus,
        entry('platform-start', 'equipment', '/', 'console:access', []),
        { ...entry('detail', 'equipment', '/detail', 'platform:view', ['returnTo', 'version']), parent, navHidden: true },
      ],
    });
    window.history.replaceState(null, '', `/detail?v=1${current}&returnTo=${encodeURIComponent(origin)}`);
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(permissions)} registry={returnRegistry}><ReturnProbe /></PlatformProvider></I18nProvider>);
    return JSON.parse(screen.getByRole('status').textContent!);
  }

  it.each([
    { name: 'denied menu', origin: '/analysis?v=1', permissions: VIEWER, parent: 'source', id: 'source', href: '/source?v=1' },
    { name: 'denied space with granted menu', origin: '/ops/child?v=1', permissions: VIEWER, parent: 'source', id: 'source', href: '/source?v=1' },
    { name: 'denied parent then platform home', origin: '/analysis?v=1', permissions: [...VIEWER, 'console:access'] as Session['user']['permissions'], parent: 'analysis', id: 'platform-start', href: '/?v=1' },
    { name: 'denied parent and platform home then space home', origin: '/ops?v=1', permissions: VIEWER, parent: 'analysis', id: 'source', href: '/source?v=1' },
  ])('$name', ({ origin, permissions, parent, id, href }) => {
    expect(mountReturn('', origin, permissions, parent)).toEqual({
      target: href, origin: { href, menuLabel: { ko: id, en: id }, trail: [], revertedContext: [] },
    });
  });

  it.each([
    { name: 'different Scope only', current: '&scopeId=FDRY', origin: '/source?v=1&scopeId=MEM', keys: ['scope'] },
    { name: 'equal Scope', current: '&scopeId=MEM', origin: '/source?v=1&scopeId=MEM', keys: [] },
    { name: 'different Scope and metric pair', current: '&scopeId=FDRY&metricId=cycle_time&metricVersion=4', origin: '/source?v=1&scopeId=MEM', keys: ['scope', 'metric'] },
    { name: 'origin without Scope', current: '&scopeId=FDRY', origin: '/source?v=1', keys: ['scope'] },
    { name: 'rejected returnTo with different Scope', current: '&scopeId=FDRY', origin: '/analysis?v=1&scopeId=MEM', keys: [] },
    { name: 'current metric pair only', current: '&metricId=cycle_time&metricVersion=4', origin: '/source?v=1', keys: ['metric'] },
    { name: 'equal metric pairs', current: '&metricId=cycle_time&metricVersion=4', origin: '/source?v=1&metricId=cycle_time&metricVersion=4', keys: [] },
    { name: 'page version only', current: '&version=4', origin: '/source?v=1', keys: [] },
    { name: 'rejected returnTo', current: '&metricId=cycle_time&metricVersion=4', origin: '/analysis?v=1', keys: [] },
    { name: 'metric version materialized in current URL', current: '&metricId=cycle_time&metricVersion=4', origin: '/source?v=1&metricId=cycle_time', keys: ['metric'] },
    { name: 'codec normalizes selection sets', current: '&selectedEquipmentIds=E2&selectedEquipmentIds=E1', origin: '/source?v=1&selectedEquipmentIds=E1&selectedEquipmentIds=E2', keys: [] },
  ])('$name', ({ current, origin, keys }) => {
    expect(mountReturn(current, origin).origin.revertedContext).toEqual(keys);
  });
});

const equipmentAxes = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
