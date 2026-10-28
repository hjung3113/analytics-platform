import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkOptions, LinkResolution } from '../platform';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform } from '../platform';
import { createRegistry } from '../../registry/registry';
import { writeSpaceLast } from '../preferences';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { carrySetId, groupId, spaceId, type Permission, menuPermission, type Session, type SpaceDef } from '@ap/contracts';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, group: 'equipment' | 'admin' | 'overview', path: string, permission: Permission, pageKeys: string[]) => ({
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
    { id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: spaceId('mars') },
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

const overviewGroup = { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null };
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
  const { resolveLink } = useHostPlatform();
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

afterEach(() => { cleanup(); captured = null; vi.unstubAllGlobals(); });

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


describe('carry-set page keys (ADR-0081 decision 4 as replaced by #1099b, 06 §6.4 exception)', () => {
  const carryRegistry = createRegistry({
    permissions: [menuPermission('analytics:view')],
    spaces: [...spaces, testSpace({ id: spaceId('tracked'), label: { ko: '추적', en: 'Tracked' }, homeMenuId: 'a' }), testSpace({ id: spaceId('tracked2'), label: { ko: '추적2', en: 'Tracked 2' }, homeMenuId: 'c' })],
    carrySets: [{ id: carrySetId('tracked'), pageKeys: ['k'] }, { id: carrySetId('tracked2'), pageKeys: ['k'] }],
    groups: [...registry.groups, { id: groupId('tracked'), label: { ko: '추적', en: 'Tracked' }, icon: House, space: spaceId('tracked') }, { id: groupId('tracked2'), label: { ko: '추적2', en: 'Tracked 2' }, icon: House, space: spaceId('tracked2') }],
    menus: [...registry.menus, { ...entry('a', 'tracked' as 'admin', '/t/a', 'platform:view', ['k']), carrySet: carrySetId('tracked'), primary: true }, { ...entry('b', 'tracked' as 'admin', '/t/b', 'platform:view', ['k', 'other']), carrySet: carrySetId('tracked') }, { ...entry('c', 'tracked2' as 'admin', '/t2/c', 'platform:view', ['k']), carrySet: carrySetId('tracked2'), primary: true }],
  });
  function resolveIn(url: string, menuId: string, options?: LinkOptions) {
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(ANALYST)} registry={carryRegistry}><Probe /></PlatformProvider></I18nProvider>);
    return captured!(menuId, options);
  }

  it.each([
    { name: 'copies the current value', options: undefined, k: 'x' },
    { name: 'an explicit value wins', options: { page: { k: 'y' } }, k: 'y' },
    { name: 'an explicit null omits the key', options: { page: { k: null } }, k: null },
  ])('K1 $name between menus of the set', ({ options, k }) => {
    expect(query(resolveIn('/t/a?v=1&k=x', 'b', options).href).get('k')).toBe(k);
  });

  it('K2 never carries into another set, and an explicit null on an uncarried key is omitted', () => {
    // Both sets carry `k` and both targets declare it: only set identity keeps it out.
    expect(query(resolveIn('/t/a?v=1&k=x', 'c').href).has('k')).toBe(false);
    cleanup();
    expect(query(resolveIn('/t/a?v=1&k=x', 'analysis').href).has('k')).toBe(false);
    cleanup();
    const link = resolveIn('/t/a?v=1&k=x', 'analysis', { page: { tab: null } });
    expect(query(link.href).has('tab')).toBe(false);
    expect(link.droppedPageKeys).toEqual([]);
  });

  it('K3 links from a menu without a carry set copy no page state', () => {
    window.history.replaceState(null, '', '/analysis?v=1&tab=a');
    const href = resolveIn('/analysis?v=1&tab=a', 'analysis').href;
    expect(query(href).has('tab')).toBe(false);
    cleanup();
    expect(query(resolveIn('/source?v=1', 'b').href).has('k')).toBe(false);
  });
});


describe('a carry set that spans spaces and a global menu (#1099b)', () => {
  const SET = carrySetId('span');
  const RET = (path: string) => encodeURIComponent(path);
  const member = (id: string, group: string, path: string, extra: Record<string, unknown> = {}) => ({ ...entry(id, group as 'admin', path, 'platform:view', ['k', 'returnTo']), carrySet: SET, ...extra });
  const spanRegistry = createRegistry({
    permissions: [menuPermission('analytics:view')],
    carrySets: [{ id: SET, pageKeys: ['k', 'returnTo'] }, { id: carrySetId('lonely'), pageKeys: ['k'] }],
    spaces: [...spaces, testSpace({ id: spaceId('left'), label: { ko: '왼쪽', en: 'Left' }, homeMenuId: 'l1' }), testSpace({ id: spaceId('right'), label: { ko: '오른쪽', en: 'Right' }, homeMenuId: 'r1' })],
    groups: [...registry.groups, overviewGroup,
      { id: groupId('left'), label: { ko: '왼쪽', en: 'Left' }, icon: House, space: spaceId('left') },
      { id: groupId('right'), label: { ko: '오른쪽', en: 'Right' }, icon: House, space: spaceId('right') }],
    menus: [...registry.menus,
      member('l1', 'left', '/l/one', { primary: true }),
      { ...entry('l2', 'left' as 'admin', '/l/two', 'platform:view', []) },
      member('r1', 'right', '/r/one', { primary: true }),
      member('r2', 'right', '/r/two', { permission: 'console:access' }),
      member('g1', 'overview', '/g/one', { primary: true }),
      { ...entry('lonely', 'right' as 'admin', '/r/lonely', 'platform:view', ['k']), carrySet: carrySetId('lonely') },
    ],
  });
  function resolveSpan(url: string, menuId: string, options?: LinkOptions) {
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(ANALYST)} registry={spanRegistry}><Probe /></PlatformProvider></I18nProvider>);
    return captured!(menuId, options);
  }
  const ORIGIN = '/mars/source?v=1&tab=1';

  it.each([
    { name: 'left space to right space', from: '/l/one', to: 'r1' },
    { name: 'left space to the global menu', from: '/l/one', to: 'g1' },
    { name: 'the global menu back into a space', from: '/g/one', to: 'l1' },
  ])('carries the complete set across $name', ({ from, to }) => {
    const q = query(resolveSpan(`${from}?v=1&k=x&returnTo=${RET(ORIGIN)}`, to).href);
    expect(q.get('k')).toBe('x');
    expect(q.get('returnTo')).toBe(ORIGIN);
  });

  it.each([
    { name: 'an explicit value replaces', options: { page: { k: 'y' } }, k: 'y' },
    { name: 'an explicit null clears', options: { page: { k: null } }, k: null },
  ])('$name only that key and keeps the rest of the set', ({ options, k }) => {
    const q = query(resolveSpan(`/l/one?v=1&k=x&returnTo=${RET(ORIGIN)}`, 'r1', options).href);
    expect(q.get('k')).toBe(k);
    expect(q.get('returnTo')).toBe(ORIGIN);
  });

  it('an explicit null on returnTo ends the origin', () => {
    const q = query(resolveSpan(`/l/one?v=1&k=x&returnTo=${RET(ORIGIN)}`, 'r1', { page: { returnTo: null } }).href);
    expect(q.has('returnTo')).toBe(false);
    expect(q.get('k')).toBe('x');
  });

  it('inside the set returnTo:true only retains the accepted origin and never mints or replaces it', () => {
    expect(query(resolveSpan(`/l/one?v=1&returnTo=${RET(ORIGIN)}`, 'r1', { returnTo: true }).href).get('returnTo')).toBe(ORIGIN);
    cleanup();
    expect(query(resolveSpan('/l/one?v=1&k=x', 'r1', { returnTo: true }).href).has('returnTo')).toBe(false);
    cleanup();
    expect(query(resolveSpan('/g/one?v=1&k=x', 'l1').href).has('returnTo')).toBe(false);
  });

  it.each([
    { name: 'explicit null', page: { returnTo: null } },
    { name: 'an explicit origin', page: { returnTo: '/mars/other?v=1' } },
  ])('from outside the set returnTo:true yields to $name on the returnTo key', ({ page }) => {
    const q = query(resolveSpan('/source?v=1&tab=1', 'l1', { returnTo: true, page }).href);
    expect(q.get('returnTo')).toBe(page.returnTo);
  });

  it('from outside the set returnTo:true mints the current origin, and a different set or no set carries nothing', () => {
    expect(query(resolveSpan('/source?v=1&tab=1', 'l1', { returnTo: true }).href).get('returnTo')).toBe(ORIGIN);
    cleanup();
    const toLonely = query(resolveSpan(`/l/one?v=1&k=x&returnTo=${RET(ORIGIN)}`, 'lonely').href);
    expect(toLonely.has('k')).toBe(false);
    expect(toLonely.has('returnTo')).toBe(false);
    cleanup();
    const fromLonely = query(resolveSpan('/r/lonely?v=1&k=x', 'r1').href);
    expect(fromLonely.has('k')).toBe(false);
    cleanup();
    const unrelated = query(resolveSpan(`/l/one?v=1&k=x&returnTo=${RET(ORIGIN)}`, 'l2').href);
    expect(unrelated.has('k')).toBe(false);
    expect(unrelated.has('returnTo')).toBe(false);
  });
});

describe('kernel entries start clean even inside a carry set (#1099b)', () => {
  const SET = carrySetId('span');
  const member = (id: string, group: string, path: string, extra: Record<string, unknown> = {}) => ({ ...entry(id, group as 'admin', path, 'platform:view', ['k', 'returnTo']), carrySet: SET, ...extra });
  const entryRegistry = createRegistry({
    permissions: [menuPermission('analytics:view')],
    carrySets: [{ id: SET, pageKeys: ['k', 'returnTo'] }],
    spaces: [...spaces, testSpace({ id: spaceId('left'), label: { ko: '왼쪽', en: 'Left' }, homeMenuId: 'l1' }), testSpace({ id: spaceId('gated'), label: { ko: '잠김', en: 'Gated' }, homeMenuId: 'q1' })],
    groups: [...registry.groups, overviewGroup,
      { id: groupId('left'), label: { ko: '왼쪽', en: 'Left' }, icon: House, space: spaceId('left') },
      { id: groupId('gated'), label: { ko: '잠김', en: 'Gated' }, icon: House, space: spaceId('gated') }],
    menus: [...registry.menus,
      member('l1', 'left', '/l/one', { primary: true }), member('l2', 'left', '/l/two'),
      member('q1', 'gated', '/q/one', { primary: true, permission: 'console:access' }), member('q2', 'gated', '/q/two'),
      member('g1', 'overview', '/g/one', { primary: true }),
    ],
  });
  const ORIGIN = encodeURIComponent('/mars/source?v=1&tab=1');
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
  function EntryProbe() {
    const { spaceEntry, spaceResume, resolveLink } = useHostPlatform();
    const show = (id: string) => { const e = spaceEntry(spaceId(id)); return e ? `${e.menuId}|${e.href}|${e.resumed}` : 'null'; };
    const resume = spaceResume(spaceId('left'));
    return <div><p data-testid="left">{show('left')}</p><p data-testid="gated">{show('gated')}</p><p data-testid="resume">{resume ? resume.href : 'null'}</p><p data-testid="link">{resolveLink('l2').href}</p></div>;
  }
  const text = (id: string) => screen.getByTestId(id).textContent!;
  function mount(url: string) {
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(ANALYST)} registry={entryRegistry}><EntryProbe /></PlatformProvider></I18nProvider>);
  }

  it('a global set member with k and returnTo enters a space home with a clean URL, while a public link still carries', () => {
    mount(`/g/one?v=1&k=x&returnTo=${ORIGIN}`);
    expect(text('left')).toBe('l1|/left/l1?v=1|false');
    expect(text('link')).toContain('/left/l2');
    expect(query(text('link')).get('k')).toBe('x');
  });

  it('the first-allowed fallback entry is clean too', () => {
    mount(`/g/one?v=1&k=x&returnTo=${ORIGIN}`);
    // q1 needs console:access, which the analyst lacks, so the entry falls through to q2 (the space itself has no gate).
    expect(text('gated')).toBe('q2|/gated/q2?v=1|false');
  });

  it('a resumed target restores its stored page values but never the current set state or a stored returnTo', () => {
    writeSpaceLast('u1', spaceId('left'), `/left/l2?v=1&k=stored&returnTo=${ORIGIN}`);
    mount(`/g/one?v=1&k=live&returnTo=${ORIGIN}`);
    const q = query(text('resume'));
    expect(text('resume')).toContain('/left/l2');
    expect(q.get('k')).toBe('stored');
    expect(q.has('returnTo')).toBe(false);
  });
});


describe('return fallback without a fixed home ID (#298)', () => {
  function ReturnProbe() {
    const platform = useHostPlatform();
    return <output>{JSON.stringify({ target: platform.returnTarget(), origin: platform.returnOrigin() })}</output>;
  }

  it.each([
    { name: 'platform home first', url: '/analysis?v=1', root: true, permissions: ANALYST, id: 'platform-start', href: '/?v=1' },
    { name: 'space home after denied platform home', url: '/analysis?v=1', root: true, permissions: VIEWER, id: 'source', href: '/mars/source?v=1' },
    { name: 'sidebar space home outside registered routes', url: '/outside?v=1', root: false, permissions: VIEWER, id: 'source', href: '/mars/source?v=1' },
    { name: 'exact emergency fallback when all homes denied', url: '/analysis?v=1', root: true, permissions: [] as Session['user']['permissions'], id: null, href: '/' },
    { name: 'emergency fallback with an accessible space but denied space home', url: '/analysis?v=1', root: false, permissions: ['analytics:view'] as Session['user']['permissions'], id: null, href: '/' },
    { name: 'space home when platform home absent', url: '/analysis?v=1', root: false, permissions: VIEWER, id: 'source', href: '/mars/source?v=1' },
  ])('$name', ({ url, root, permissions, id, href }) => {
    const fallbackRegistry = createRegistry({ permissions: [menuPermission('analytics:view')],
      spaces, groups: [...registry.groups, ...(root ? [overviewGroup] : [])],
      ...(root ? { platformHomeMenuId: 'platform-start' } : {}),
      menus: [...registry.menus, ...(root ? [{ ...entry('platform-start', 'overview', '/', menuPermission('analytics:view'), []), primary: true }] : [])],
    });
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(permissions)} registry={fallbackRegistry}><ReturnProbe /></PlatformProvider></I18nProvider>);
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual({
      target: href,
      origin: { href, menuLabel: id ? { ko: id, en: id } : { ko: '홈', en: 'Home' }, trail: [], revertedContext: [], accepted: false, spaceLabel: null },
    });
  });
});


describe('return permission and reverted Context (#298 FIX1)', () => {
  function ReturnProbe() {
    const platform = useHostPlatform();
    return <output>{JSON.stringify({ target: platform.returnTarget(), origin: platform.returnOrigin() })}</output>;
  }
  function mountReturn(current: string, origin: string, permissions = VIEWER, parent = 'source') {
    const returnRegistry = createRegistry({ permissions: [menuPermission('analytics:view')],
      spaces, groups: [...registry.groups, overviewGroup],
      platformHomeMenuId: 'platform-start',
      menus: [...registry.menus,
        { ...entry('platform-start', 'overview', '/', 'console:access', []), primary: true },
        { ...entry('detail', 'equipment', '/detail', 'platform:view', ['returnTo', 'version']), parent, navHidden: true },
      ],
    });
    window.history.replaceState(null, '', `/detail?v=1${current}&returnTo=${encodeURIComponent(origin)}`);
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={fixture(permissions)} registry={returnRegistry}><ReturnProbe /></PlatformProvider></I18nProvider>);
    return JSON.parse(screen.getByRole('status').textContent!);
  }

  it.each([
    { name: 'denied menu', origin: '/analysis?v=1', permissions: VIEWER, parent: 'source', id: 'source', href: '/mars/source?v=1' },
    { name: 'denied space with granted menu', origin: '/ops/child?v=1', permissions: VIEWER, parent: 'source', id: 'source', href: '/mars/source?v=1' },
    { name: 'denied parent then platform home', origin: '/analysis?v=1', permissions: [...VIEWER, 'console:access'] as Session['user']['permissions'], parent: 'analysis', id: 'platform-start', href: '/?v=1' },
    { name: 'denied parent and platform home then space home', origin: '/ops?v=1', permissions: VIEWER, parent: 'analysis', id: 'source', href: '/mars/source?v=1' },
  ])('$name', ({ origin, permissions, parent, id, href }) => {
    expect(mountReturn('', origin, permissions, parent)).toEqual({
      target: href, origin: { href, menuLabel: { ko: id, en: id }, trail: [], revertedContext: [], accepted: false, spaceLabel: null },
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
