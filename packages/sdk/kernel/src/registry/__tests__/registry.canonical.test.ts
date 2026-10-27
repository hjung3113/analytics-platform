import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { groupId, menuPermission, spaceId, type ModuleManifest, type SpaceDef } from '@ap/contracts';
import { mountModule } from '../module';
import { createRegistry as create, pathFor, type GroupDef, type MenuEntry, type PlatformMenuEntry } from '../registry';

/** Canonical paths and legacy aliases (ADR-0093, 06 §6.4): /{space}/{menu-slug} + the manifest's :params. */
const createRegistry = (input: Parameters<typeof create>[0]) => create({ permissions: [menuPermission('metrics:view')], ...input });
const none = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const marsGroup: GroupDef = { id: groupId('metrics'), label: { ko: '지표', en: 'Metrics' }, icon: House, space: spaceId('mars') };
const globalGroup: GroupDef = { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null };
const space = (id: string, homeMenuId: string): SpaceDef => ({ id: spaceId(id), label: { ko: id, en: id }, description: { ko: '목적', en: 'Purpose' }, homeMenuId });
const mars = space('mars', 'catalog');
const menu = (id: string, path: string, extra: Partial<PlatformMenuEntry> = {}): MenuEntry => ({
  id, group: groupId('metrics'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
  permission: menuPermission('metrics:view'), requiresScope: false, context: none, pageType: 'catalog',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...extra,
});
const catalog = menu('catalog', '/metrics', { primary: true });
const base = { spaces: [mars], groups: [marsGroup] };

describe('canonical path and legacy aliases', () => {
  const registry = createRegistry({ ...base, menus: [catalog, menu('metricDetail', '/metrics/:metricId')] });

  it('opens the same menu by its canonical path and by the old path; only the old one is viaAlias', () => {
    expect(registry.matchRoute('/mars/catalog')).toMatchObject({ menu: { id: 'catalog' }, viaAlias: false });
    expect(registry.matchRoute('/metrics')).toMatchObject({ menu: { id: 'catalog' }, viaAlias: true });
    expect(registry.matchRoute('/mars/catalog/')).toMatchObject({ menu: { id: 'catalog' }, viaAlias: false });
  });

  it('derives the slug in kebab-case, keeps the :param segments and names params by the canonical path', () => {
    const detail = registry.menuById('metricDetail');
    expect(detail.path).toBe('/mars/metric-detail/:metricId');
    expect(detail.aliases).toEqual(['/metrics/:metricId']);
    expect(registry.matchRoute('/metrics/cycle_time')).toMatchObject({ menu: { id: 'metricDetail' }, params: { metricId: 'cycle_time' }, viaAlias: true });
    expect(registry.matchRoute('/mars/metric-detail/cycle_time')).toMatchObject({ params: { metricId: 'cycle_time' }, viaAlias: false });
  });

  it('maps alias params to the canonical names by position', () => {
    const r = createRegistry({ ...base, menus: [catalog, menu('metricDetail', '/metrics/:id', { aliases: ['/old/:legacy'] })] });
    expect(r.matchRoute('/old/x')).toMatchObject({ params: { id: 'x' }, viaAlias: true });
  });

  it('pathFor builds the canonical path only and menus are copies whose path is canonical', () => {
    expect(pathFor(registry.menuById('metricDetail'), { metricId: 'a/b' })).toBe('/mars/metric-detail/a%2Fb');
    expect(registry.menus.map(m => m.path)).toEqual(['/mars/catalog', '/mars/metric-detail/:metricId']);
    expect(registry.menus[0]).not.toBe(catalog);
  });

  it('static segments still beat params across canonical and alias patterns', () => {
    const r = createRegistry({ ...base, menus: [catalog, menu('metricDetail', '/metrics/:metricId'), menu('metricNew', '/metrics/new')] });
    expect(r.matchRoute('/metrics/new')).toMatchObject({ menu: { id: 'metricNew' }, viaAlias: true });
    expect(r.matchRoute('/metrics/other')).toMatchObject({ menu: { id: 'metricDetail' } });
  });

  it('safeReturnTo accepts a stored legacy string unchanged and still rejects an unknown path', () => {
    const legacy = '/metrics?v=1';
    expect(registry.safeReturnTo(legacy)).toBe(legacy);
    expect(registry.safeReturnTo('/mars/catalog?v=1')).toBe('/mars/catalog?v=1');
    expect(registry.safeReturnTo('/nowhere?v=1')).toBeNull();
  });

  it('keeps a menu path already equal to its canonical path without an alias', () => {
    const r = createRegistry({ ...base, menus: [menu('catalog', '/mars/catalog', { primary: true })] });
    expect(r.menuById('catalog').aliases).toBeUndefined();
  });
});

describe('space-less menus and the platform home', () => {
  const home = menu('home', '/', { group: groupId('overview'), permission: 'platform:view', primary: true });
  const notices = menu('notices', '/notices', { group: groupId('overview') });

  it('keeps space-less paths unchanged and exposes platformHome', () => {
    const r = createRegistry({ spaces: [mars], groups: [marsGroup, globalGroup], menus: [catalog, home, notices], platformHomeMenuId: 'home' });
    expect(r.menuById('notices').path).toBe('/notices');
    expect(r.menuById('notices').aliases).toBeUndefined();
    expect(r.platformHome?.id).toBe('home');
    expect(r.matchRoute('/')).toMatchObject({ menu: { id: 'home' }, viaAlias: false });
  });

  it('requires platformHomeMenuId when a space-less menu declares "/", and judges the declared id', () => {
    const input = { spaces: [mars], groups: [marsGroup, globalGroup], menus: [catalog, home] };
    expect(() => createRegistry(input)).toThrow(/pass platformHomeMenuId/);
    expect(() => createRegistry({ ...input, platformHomeMenuId: 'nope' })).toThrow(/unknown/);
    expect(() => createRegistry({ ...input, platformHomeMenuId: 'catalog' })).toThrow(/outside every space/);
    expect(createRegistry({ ...base, menus: [catalog] }).platformHome).toBeNull();
  });
});

describe('canonical path validation', () => {
  it('rejects two menus of one space with the same slug', () => {
    expect(() => createRegistry({ ...base, menus: [catalog, menu('fooBar', '/a'), menu('foo-bar', '/b')] })).toThrow(/same slug "foo-bar"/);
  });

  it('rejects an alias that equals another menu canonical path, and aliases that point at each other', () => {
    expect(() => createRegistry({ ...base, menus: [catalog, menu('other', '/mars/catalog')] })).toThrow(/same route shape \/mars\/catalog/);
    expect(() => createRegistry({ ...base, menus: [catalog, menu('a', '/x', { aliases: ['/mars/b'] }), menu('b', '/y', { aliases: ['/mars/a'] })] })).toThrow(/same route shape/);
  });

  it('rejects duplicate aliases, an alias equal to its own canonical path and an alias with other params', () => {
    expect(() => createRegistry({ ...base, menus: [catalog, menu('a', '/x', { aliases: ['/y', '/y'] })] })).toThrow(/more than once/);
    expect(() => createRegistry({ ...base, menus: [catalog, menu('a', '/x', { aliases: ['/mars/a'] })] })).toThrow(/more than once/);
    expect(() => createRegistry({ ...base, menus: [catalog, menu('a', '/x/:id', { aliases: ['/y'] })] })).toThrow(/same parameters/);
  });

  it('still judges alias route shapes (/a/:x vs /a/:y)', () => {
    expect(() => createRegistry({ ...base, menus: [catalog, menu('a', '/p/:x'), menu('b', '/p/:y')] })).toThrow(/same route shape \/p\/:/);
  });

  it.each(['home', 'survey', 'voc', 'notifications', 'notices', 'permission-requests', 'board', 'api', 'auth'])('rejects the reserved platform root "%s" as a space id', root => {
    const reserved = space(root, 'catalog');
    expect(() => createRegistry({ spaces: [reserved], groups: [{ ...marsGroup, space: reserved.id }], menus: [catalog] })).toThrow(/reserved platform root/);
  });

  it('rejects a space-less path or alias whose first segment is a space id', () => {
    const inGlobal = (m: MenuEntry) => createRegistry({ spaces: [mars], groups: [marsGroup, globalGroup], menus: [catalog, m] });
    expect(() => inGlobal(menu('x', '/mars/x', { group: groupId('overview'), primary: true }))).toThrow(/starts with a space id/);
    expect(() => inGlobal(menu('x', '/x', { group: groupId('overview'), primary: true, aliases: ['/mars'] }))).toThrow(/starts with a space id/);
  });

  it('keeps the board namespace reserved for the manifest path and for declared aliases', () => {
    expect(() => createRegistry({ ...base, menus: [catalog, menu('a', '/board/x')] })).toThrow(/reserved for the analysis board/);
    expect(() => createRegistry({ ...base, menus: [catalog, menu('a', '/x', { aliases: ['/board'] })] })).toThrow(/reserved for the analysis board/);
  });

  it('judges parent and homeMenuId by the route params, as before', () => {
    const detail = menu('metricDetail', '/metrics/:metricId');
    expect(() => createRegistry({ ...base, menus: [catalog, detail, menu('child', '/metrics/:metricId/v', { parent: 'metricDetail' })] })).toThrow(/needs parameters/);
    expect(() => createRegistry({ spaces: [{ ...mars, homeMenuId: 'metricDetail' }], groups: [marsGroup], menus: [{ ...catalog, primary: true }, detail] })).toThrow(/must not need parameters/);
    expect(() => createRegistry({ ...base, menus: [catalog, menu('child', '/metrics/c', { parent: 'catalog' })] })).not.toThrow();
  });

  it('derives the same canonical path for a module menu from its group space', () => {
    const manifest: ModuleManifest = {
      module: { id: 'fx', label: { ko: '모듈', en: 'Module' }, contract: 1, languages: ['ko'] }, requires: [], config: [],
      groups: [{ id: 'fx:main', label: { ko: '메인', en: 'Main' } }],
      screens: [
        { id: 'topView', group: 'fx:main', label: { ko: 'a', en: 'a' }, description: { ko: '', en: '' }, path: '', permission: 'fx:view', requiresScope: false, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true },
        { id: 'item', group: 'fx:main', label: { ko: 'b', en: 'b' }, description: { ko: '', en: '' }, path: 'items/:id', permission: 'fx:view', requiresScope: false, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], navHidden: true },
      ],
    };
    const Screen = () => null;
    const mounted = mountModule(manifest, { topView: Screen, item: Screen }, { prefix: '/fx', groupSpace: { 'fx:main': spaceId('mars') }, config: {}, icons: { groups: { 'fx:main': House }, screens: { topView: House, item: House } } });
    const r = createRegistry({ spaces: [space('mars', 'fx:topView')], groups: mounted.groups, menus: mounted.menus, permissions: [] });
    expect(r.menuById('fx:topView').path).toBe('/mars/fx-top-view');
    expect(r.menuById('fx:item').path).toBe('/mars/fx-item/:id');
    expect(r.matchRoute('/fx')).toMatchObject({ menu: { id: 'fx:topView' }, viaAlias: true });
    expect(r.matchRoute('/mars/fx-item/7')).toMatchObject({ menu: { id: 'fx:item' }, params: { id: '7' }, viaAlias: false });
  });
});

describe('alias and canonical overlap (ADR-0093)', () => {
  const bravo = space('bravo', 'other');
  const bravoGroup: GroupDef = { id: groupId('bravo'), label: { ko: 'b', en: 'b' }, icon: House, space: spaceId('bravo') };
  const detail = menu('detail', '/old/:id');

  it('rejects, across spaces, an alias that captures another menu parameterized canonical path (the value "new")', () => {
    const other = menu('other', '/mars/detail/new', { group: groupId('bravo'), primary: true, permission: 'platform:view' });
    expect(() => createRegistry({ spaces: [{ ...mars, homeMenuId: 'home' }, bravo], groups: [marsGroup, bravoGroup], menus: [menu('home', '/h', { primary: true }), detail, other] }))
      .toThrow(/alias "\/mars\/detail\/new" captures canonical paths of menu "detail"/);
  });

  it('rejects the same capture inside one space', () => {
    expect(() => createRegistry({ ...base, menus: [catalog, detail, menu('other', '/x', { aliases: ['/mars/detail/new'] })] })).toThrow(/captures canonical paths of menu "detail"/);
  });

  it('keeps static-over-param precedence between legacy aliases of different menus', () => {
    const r = createRegistry({ ...base, menus: [catalog, menu('detail', '/old/:id'), menu('fresh', '/old/new')] });
    expect(r.matchRoute('/old/new')).toMatchObject({ menu: { id: 'fresh' }, viaAlias: true });
    expect(r.matchRoute('/mars/detail/new')).toMatchObject({ menu: { id: 'detail' }, params: { id: 'new' }, viaAlias: false });
  });
});

describe('alias parameter count for space-less menus', () => {
  const global = (path: string, aliases: string[]) => createRegistry({ spaces: [mars], groups: [marsGroup, globalGroup], menus: [catalog, menu('n', path, { group: groupId('overview'), primary: true, aliases })] });
  it('rejects fewer and extra alias params at construction', () => {
    expect(() => global('/new/:id', ['/old'])).toThrow(/same parameters/);
    expect(() => global('/new', ['/old/:id'])).toThrow(/same parameters/);
  });
  it('maps alias params to the canonical names by position', () => {
    expect(global('/new/:id', ['/old/:legacy']).matchRoute('/old/7')).toMatchObject({ params: { id: '7' }, viaAlias: true });
  });
});
