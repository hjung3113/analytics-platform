import { paneHref } from './paneContext';
import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { createRegistry as create, routeParamNames, RegistryError, type GroupDef, type MenuEntry, type ModuleMenuEntry, type PlatformMenuEntry } from './registry';
import { groupId, KERNEL_PERMISSIONS, menuPermission, spaceId, type SpaceDef } from '@ap/contracts';

/** The fixtures' menus use `metrics:view`, which the app (here: the test) declares. */
const createRegistry = (input: Parameters<typeof create>[0]) => create({ permissions: [menuPermission('metrics:view')], ...input });
const none = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const groups: GroupDef[] = [{ id: groupId('metrics'), label: { ko: '지표', en: 'Metrics' }, icon: House, space: spaceId('analytics') }];
const analyticsSpace: SpaceDef = { id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'catalog' };
const spaces: SpaceDef[] = [analyticsSpace];
const homeA: SpaceDef[] = [{ ...analyticsSpace, homeMenuId: 'a' }];
const menu = (id: string, path: string, extra: Partial<PlatformMenuEntry> = {}): MenuEntry => ({
  id, group: groupId('metrics'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
  permission: menuPermission('metrics:view'), requiresScope: false, context: none, pageType: 'catalog',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...extra,
});
const catalog = menu('catalog', '/metrics', { primary: true });

describe('createRegistry validation (platform-packages.md §5)', () => {
  it('rejects apply mode without an address-reproducible period', () => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...catalog, query: { mode: 'apply' } }] })).toThrow(/apply.*time/);
  });
  it('passes the optional single-menu sidebar label declaration through unchanged (type + pass-through; no runtime rule)', () => {
    const group: GroupDef = { ...groups[0], hideLabelWhenSingle: true };
    const registry = createRegistry({ spaces, groups: [group], menus: [catalog] });

    expect(registry.groupById(groupId('metrics')).hideLabelWhenSingle).toBe(true);
  });

  it('rejects duplicate ids, unknown parents and undeclared groups', () => {
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('catalog', '/x')] })).toThrow(RegistryError);
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('detail', '/metrics/:id', { parent: 'nope' })] })).toThrow(/unknown parent/);
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('a', '/a', { group: groupId('admin') })] })).toThrow(/undeclared group/);
  });

  it('rejects a menu on the reserved /board path, but not a sibling segment such as /boards (platform screen, #497)', () => {
    for (const path of ['/board', '/board/', '/board/archive', '/board/:id']) {
      expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', path, { primary: true })] })).toThrow(/reserved for the analysis board/);
    }
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/boards', { primary: true })] })).not.toThrow();
  });

  it('rejects duplicate group ids and parents whose route needs parameters', () => {
    expect(() => createRegistry({ spaces, groups: [...groups, ...groups], menus: [catalog] })).toThrow(/Duplicate group id/);
    const detail = menu('detail', '/metrics/:metricId', { parent: 'catalog' });
    expect(() => createRegistry({ spaces, groups, menus: [catalog, detail, menu('sub', '/metrics/:metricId/versions', { parent: 'detail' })] })).toThrow(/needs parameters/);
  });

  it('requires exactly one primary per group', () => {
    expect(() => createRegistry({ spaces, groups, menus: [menu('a', '/a')] })).toThrow(/exactly one primary.*found 0/);
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('b', '/b', { primary: true })] })).toThrow(/found 2/);
  });

  it('rejects page keys that collide with global Context keys', () => {
    expect(() => createRegistry({ spaces, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['scopeId'] })] })).toThrow(/global Context key/);
  });

  it('rejects contextResetKeys outside pageKeys and accepts declared subsets', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['sort'], contextResetKeys: ['page'] })] })).toThrow(/contextResetKey "page" is not a declared pageKeys entry/);
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['sort', 'page', 'bucket', 'bin'], contextResetKeys: ['page', 'bucket', 'bin'] })] })).not.toThrow();
  });

  const level = (key: string) => ({ key, label: { ko: key, en: key } });

  it('rejects a drill with no levels', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, drill: { levels: [] } })] })).toThrow(/Menu "a" drill needs at least 1 level, found 0/);
  });

  it('accepts six declared drill levels', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: keys, contextResetKeys: keys, drill: { levels: keys.map(level) } })] })).not.toThrow();
  });

  it('rejects a duplicated drill level key', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['room'], contextResetKeys: ['room'], drill: { levels: [level('room'), level('room')] } })] })).toThrow(/Menu "a" drill level key "room" is duplicated/);
  });

  it('rejects a drill level key outside pageKeys', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, drill: { levels: [level('room')] } })] })).toThrow(/Menu "a" drill level key "room" is not a declared pageKeys entry/);
  });

  it('rejects a drill level key outside contextResetKeys', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['room'], drill: { levels: [level('room')] } })] })).toThrow(/Menu "a" drill level key "room" is not a declared contextResetKeys entry/);
  });

  it('rejects returnTo as a drill level key', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['returnTo'], contextResetKeys: ['returnTo'], drill: { levels: [{ key: 'returnTo', label: { ko: '복귀', en: 'Back' } }] } })] })).toThrow(/Menu "a" drill level key "returnTo" cannot be a drill level/);
  });

  it('accepts one to four drill levels whose keys are pageKeys and contextResetKeys', () => {
    const declared = (keys: string[]) => menu('a', '/a', { primary: true, pageKeys: keys, contextResetKeys: keys, drill: { levels: keys.map(level) } });
    expect(() => createRegistry({ spaces: homeA, groups, menus: [declared(['room'])] })).not.toThrow();
    expect(() => createRegistry({ spaces: homeA, groups, menus: [declared(['a', 'b', 'c', 'd'])] })).not.toThrow();
  });

  describe('drill resetKeys', () => {
    const withReset = (resetKeys: string[], extra: { pageKeys?: string[] } = {}) => menu('a', '/a', { primary: true, pageKeys: extra.pageKeys ?? ['room', 'row'], contextResetKeys: ['room'], drill: { levels: [level('room')], resetKeys } });
    it('accepts a declared page key that is not a contextResetKey', () => {
      expect(() => createRegistry({ spaces: homeA, groups, menus: [withReset(['row'])] })).not.toThrow();
    });
    it.each([
      ['an undeclared page key', ['ghost'], /Menu "a" drill resetKey "ghost" is not a declared pageKeys entry/],
      ['a drill level key', ['room'], /Menu "a" drill resetKey "room" is a drill level key/],
      ['a duplicate', ['row', 'row'], /Menu "a" drill resetKey "row" is duplicated/],
    ])('rejects %s', (_name, keys, message) => {
      expect(() => createRegistry({ spaces: homeA, groups, menus: [withReset(keys)] })).toThrow(message);
    });
    it('rejects returnTo', () => {
      expect(() => createRegistry({ spaces: homeA, groups, menus: [withReset(['returnTo'], { pageKeys: ['room', 'returnTo'] })] })).toThrow(/Menu "a" drill resetKey "returnTo" cannot be reset by a drill step/);
    });
  });

  it('allows §6.1 screen-state page keys (sort, page, tab, bucket, bin)', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['sort', 'page', 'tab', 'bucket', 'bin'] })] })).not.toThrow();
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['q', 'status', 'maker', 'focus', 'sort', 'page', 'tab'] })] })).not.toThrow();
  });

  it('rejects routes with the same shape once parameter names are erased', () => {
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('x', '/metrics/:metricId'), menu('y', '/metrics/:id')] })).toThrow(/same route shape/);
  });
});

describe('space carriedPageKeys (ADR-0081 decision 4)', () => {
  const carrying: SpaceDef[] = [{ ...analyticsSpace, homeMenuId: 'a', carriedPageKeys: ['k'] }];
  it('accepts menus that all declare the carried key', () => {
    expect(() => createRegistry({ spaces: carrying, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['k'] }), menu('b', '/b', { pageKeys: ['k', 'x'] })] })).not.toThrow();
  });
  it.each([
    { name: 'a carried key equal to a global key', spaces: [{ ...analyticsSpace, homeMenuId: 'a', carriedPageKeys: ['scopeId'] }], menus: [menu('a', '/a', { primary: true })], error: /carried page key "scopeId" collides with a global/ },
    { name: 'a carried key declared twice', spaces: [{ ...analyticsSpace, homeMenuId: 'a', carriedPageKeys: ['k', 'k'] }], menus: [menu('a', '/a', { primary: true, pageKeys: ['k'] })], error: /Space "analytics" carried page key "k" is declared twice/ },
    { name: 'a member menu missing the carried key', spaces: carrying, menus: [menu('a', '/a', { primary: true, pageKeys: ['k'] }), menu('c', '/c')], error: /Menu "c" does not declare space "analytics" carried page key "k"/ },
  ])('rejects $name', ({ spaces: s, menus, error }) => {
    expect(() => createRegistry({ spaces: s, groups, menus })).toThrow(error);
  });
});

describe('menu navViews (sidebar sub-items, 06 §8)', () => {
  const view = { id: 'mine', label: { ko: '내 것', en: 'Mine' }, page: { tab: 'mine' } };
  const withViews = (views: unknown, extra: Partial<PlatformMenuEntry> = {}) => menu('a', '/a', { primary: true, pageKeys: ['tab', 'k'], navViews: views as never, ...extra });
  const carrying: SpaceDef[] = [{ ...analyticsSpace, homeMenuId: 'a', carriedPageKeys: ['k'] }];
  it('accepts views whose preset keys are declared page keys', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [withViews([view, { ...view, id: 'all', page: { tab: 'all' } }])] })).not.toThrow();
  });
  it.each([
    { name: 'a preset key that is not a page key', menus: [withViews([{ ...view, page: { nope: 'x' } }])], error: /Menu "a" navView "mine" preset key "nope" is not a declared pageKeys entry/ },
    { name: 'the focus key', menus: [withViews([{ ...view, page: { focus: 'x' } }], { pageKeys: ['tab', 'focus'] })], error: /navView "mine" preset key "focus" cannot be a view key/ },
    { name: 'a duplicate view id', menus: [withViews([view, view])], error: /Menu "a" navView id "mine" is duplicated/ },
    { name: 'views on a navHidden menu', menus: [menu('a', '/a', { primary: true }), menu('d', '/a/d', { navHidden: true, parent: 'a', pageKeys: ['tab'], navViews: [view] })], error: /Menu "d" is navHidden and cannot declare navViews/ },
    { name: 'a blank ko label', menus: [withViews([{ ...view, label: { ko: ' ', en: 'Mine' } }])], error: /navView "mine" needs nonempty ko and en labels/ },
    { name: 'a blank en label', menus: [withViews([{ ...view, label: { ko: '내 것', en: '' } }])], error: /navView "mine" needs nonempty ko and en labels/ },
    { name: 'a blank id', menus: [withViews([{ ...view, id: ' ' }])], error: /navView id must not be blank/ },
  ])('rejects $name', ({ menus, error }) => {
    expect(() => createRegistry({ spaces: homeA, groups, menus })).toThrow(error);
  });
  it('rejects a preset key the space carries', () => {
    expect(() => createRegistry({ spaces: carrying, groups, menus: [withViews([{ ...view, page: { k: 'x' } }])] })).toThrow(/navView "mine" preset key "k" is a space carried page key/);
  });
});

describe('spaces (06 §9.1)', () => {
  const adminGroups: GroupDef[] = [{ id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') }];
  const operations: SpaceDef = { id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' };
  const roles = menu('admin-roles', '/admin/roles', { group: groupId('admin'), permission: 'console:access', primary: true });

  it('rejects duplicate space ids', () => {
    expect(() => createRegistry({ spaces: [operations, operations], groups: adminGroups, menus: [roles] })).toThrow(/Duplicate space id "operations"/);
  });

  it('rejects groups whose space is not declared', () => {
    expect(() => createRegistry({ spaces: [analyticsSpace], groups: [...groups, { ...adminGroups[0], space: spaceId('metrics') }], menus: [roles] })).toThrow(/Group "admin" uses undeclared space "metrics"/);
  });

  it('rejects an unknown home menu id', () => {
    expect(() => createRegistry({ spaces: [{ ...operations, homeMenuId: 'nope' }], groups: adminGroups, menus: [roles] })).toThrow(/Space "operations" homeMenuId "nope" is unknown/);
  });

  it('rejects a home menu in another space', () => {
    expect(() => createRegistry({ spaces: [analyticsSpace, { ...operations, homeMenuId: 'catalog' }], groups: [...groups, ...adminGroups], menus: [catalog, roles] })).toThrow(/Space "operations" homeMenuId "catalog" is not in that space/);
  });

  it('rejects a home route that needs parameters', () => {
    const detail = menu('detail', '/metrics/:metricId', { parent: 'catalog' });
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, homeMenuId: 'detail' }], groups, menus: [catalog, detail] })).toThrow(/Space "analytics" homeMenuId "detail" home route must not need parameters/);
  });

  it.each([
    { ko: '', en: 'Purpose' },
    { ko: '목적', en: '   ' },
  ])('rejects an empty space description (%j)', description => {
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, description }], groups, menus: [catalog] })).toThrow(/Space "analytics" description must not be empty/);
  });

  it.each([
    { name: 'absent', subtitle: undefined },
    { name: 'present in ko and en', subtitle: { ko: '생산성 분석', en: 'Productivity analysis' } },
  ])('accepts a space subtitle that is $name', ({ subtitle }) => {
    const space: SpaceDef = subtitle ? { ...analyticsSpace, subtitle } : analyticsSpace;
    expect(createRegistry({ spaces: [space], groups, menus: [catalog] }).spaces[0]?.subtitle).toEqual(subtitle);
  });

  it.each([
    { ko: '', en: 'Productivity analysis' },
    { ko: '생산성 분석', en: '' },
    { ko: '   ', en: 'Productivity analysis' },
    { ko: '생산성 분석', en: '   ' },
  ])('rejects a blank space subtitle (%j)', subtitle => {
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, subtitle }], groups, menus: [catalog] })).toThrow(/Space "analytics" subtitle must not be empty/);
  });

  it('rejects a home menu whose permission differs from the space permission', () => {
    const viewerRoles = menu('admin-roles', '/admin/roles', { group: groupId('admin'), permission: 'platform:view', primary: true });
    expect(() => createRegistry({ spaces: [operations], groups: adminGroups, menus: [viewerRoles] })).toThrow(/Space "operations" home permission must be "console:access"/);
  });

  it('rejects a parent menu in another space', () => {
    const detail = menu('detail', '/metrics/:metricId', { parent: 'admin-roles' });
    expect(() => createRegistry({ spaces: [analyticsSpace, operations], groups: [...groups, ...adminGroups], menus: [roles, detail] })).toThrow(/Menu "detail" parent "admin-roles" is in another space/);
  });

  it('requires an explicit space (omitting it is a type error, not a global group)', () => {
    // @ts-expect-error space is required; null is the only way to declare a global utility
    const group: GroupDef = { id: 'metrics', label: { ko: '지표', en: 'Metrics' }, icon: House };
    expect(group.id).toBe('metrics');
  });

  it('allows a global utility group and a parent in another global group', () => {
    const notice: GroupDef = { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const overview: GroupDef = { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null };
    const notices = menu('notices', '/notices', { group: groupId('noticeVoc'), permission: 'notice:view', primary: true });
    const home = menu('home', '/', { group: groupId('overview'), permission: 'platform:view', primary: true });
    const detail = menu('notices-detail', '/notices/:id', { group: groupId('noticeVoc'), parent: 'home', permission: 'notice:view' });
    const registry = createRegistry({ spaces, groups: [...groups, notice, overview], menus: [catalog, notices, home, detail] });
    expect(registry.spaceOf(notices)).toBeNull();
    expect(registry.spaceOf(home)).toBeNull();
    expect(registry.spaceOf(catalog)?.id).toBe('analytics');
  });

  it('rejects a space whose home menu is a global utility', () => {
    const notice: GroupDef = { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const notices = menu('notices', '/notices', { group: groupId('noticeVoc'), permission: 'notice:view', primary: true });
    expect(() => createRegistry({
      spaces: [{ ...analyticsSpace, homeMenuId: 'notices' }],
      groups: [...groups, notice],
      menus: [catalog, notices],
    })).toThrow(/Space "analytics" homeMenuId "notices" is not in that space/);
  });

  it.each(['global-of-space', 'space-of-global'] as const)('rejects a parent across a global group and a space (%s)', direction => {
    const notice: GroupDef = { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const notices = menu('notices', '/notices', { group: groupId('noticeVoc'), permission: 'notice:view', primary: true });
    const detail = direction === 'global-of-space'
      ? menu('detail', '/notices/:id', { group: groupId('noticeVoc'), parent: 'catalog', permission: 'notice:view' })
      : menu('detail', '/metrics/:id', { parent: 'notices' });
    expect(() => createRegistry({ spaces, groups: [...groups, notice], menus: [catalog, notices, detail] })).toThrow(/another space/);
  });

  it.each([0, 2])('a global group still needs exactly one primary (found %s)', found => {
    const notice: GroupDef = { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const menus = found === 0
      ? [catalog, menu('notices', '/notices', { group: groupId('noticeVoc'), permission: 'notice:view' })]
      : [catalog, menu('notices', '/notices', { group: groupId('noticeVoc'), permission: 'notice:view', primary: true }), menu('voc', '/voc', { group: groupId('noticeVoc'), permission: 'voc:view', primary: true })];
    expect(() => createRegistry({ spaces, groups: [...groups, notice], menus })).toThrow(new RegExp(`needs exactly one primary menu, found ${found}`));
  });

  it('allows eight groups in one space (no per-space group cap)', () => {
    // The platform vocabulary is closed at runtime, so the eighth group is a module group.
    const ids = ['overview', 'equipment', 'masterData', 'analytics', 'metrics', 'noticeVoc', 'admin'] as const;
    const platform: GroupDef[] = ids.map(id => ({ id: groupId(id), label: { ko: id, en: id }, icon: House, space: spaceId('analytics') }));
    const probe: GroupDef = { id: 'probe:main', module: 'probe', label: { ko: 'p', en: 'p' }, icon: House, space: spaceId('analytics') };
    const eight = [...platform, probe];
    const eightMenus: MenuEntry[] = [
      ...ids.map((id, i) => menu(`m${i}`, `/m${i}`, { group: groupId(id), primary: true })),
      { ...menu('m7', '/m7', { primary: true }), group: 'probe:main', module: 'probe', permission: 'probe:view', component: undefined, moduleScreen: () => null } as MenuEntry,
    ];
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, homeMenuId: 'm0' }], groups: eight, menus: eightMenus })).not.toThrow();
  });
});

describe('matchRoute: static segments win, whatever the declaration order', () => {
  const detail = menu('detail', '/metrics/:metricId', { parent: 'catalog' });
  const create = menu('new', '/metrics/new', { parent: 'catalog' });
  for (const [label, menus] of [['param first', [catalog, detail, create]], ['static first', [catalog, create, detail]]] as const) {
    it(label, () => {
      const r = createRegistry({ spaces, groups, menus: [...menus] });
      expect(r.matchRoute('/metrics/new')?.menu.id).toBe('new');
      expect(r.matchRoute('/metrics/cycle_time')).toMatchObject({ menu: { id: 'detail' }, params: { metricId: 'cycle_time' } });
    });
  }
});

describe('open vocabulary (ADR-0053)', () => {
  const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: spaceId('analytics') };
  const modMenu = (over: Partial<ModuleMenuEntry> = {}): ModuleMenuEntry => ({
    id: 'fx-home', module: 'fx', group: 'fx:main', permission: 'fx:view', label: { ko: 'f', en: 'f' }, description: { ko: '', en: '' }, path: '/fx', icon: House,
    requiresScope: false, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true,
    moduleScreen: () => null, ...over,
  });

  it('accepts a module group and permission with their module prefix', () => {
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu()] })).not.toThrow();
  });

  it('rejects a module permission or group id without its module prefix', () => {
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu({ permission: 'other:view' })] })).toThrow(/needs the "fx:" prefix/);
    expect(() => createRegistry({ spaces, groups: [...groups, { ...modGroup, id: 'other:main' }], menus: [catalog] })).toThrow(/needs the "fx:" prefix/);
  });

  it('rejects a platform menu placed in a module group', () => {
    const stray = menu('stray', '/stray', { group: 'fx:main' as never });

    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu(), stray] })).toThrow(/different modules/);
  });

  it('rejects a module whose id is a platform permission namespace or whose permission equals a platform permission', () => {
    const console_ = { ...modGroup, id: 'console:main', module: 'console' } as GroupDef;

    expect(() => createRegistry({ spaces, groups: [...groups, console_], menus: [catalog, modMenu({ module: 'console', group: 'console:main', permission: 'console:access' })] })).toThrow(/reserved platform namespace/);
    expect(() => createRegistry({ spaces, groups: [...groups, console_], menus: [catalog, modMenu({ module: 'console', group: 'console:main', permission: 'console:other' })] })).toThrow(/reserved platform namespace/);
    expect(() => createRegistry({ spaces, groups: [...groups, console_], menus: [catalog] })).toThrow(/reserved platform namespace/);
  });

  // Untyped data reaches the registry at runtime, so each variant is checked there too (not only by the types).
  it('rejects, at runtime, a module-shaped group or menu with its module discriminator removed', () => {
    const bareGroup = { ...modGroup, module: undefined } as unknown as GroupDef;
    const bareMenu = modMenu({ module: undefined } as never);

    expect(() => createRegistry({ spaces, groups: [...groups, bareGroup], menus: [catalog] })).toThrow(/not a platform group/);
    expect(() => createRegistry({ spaces, groups, menus: [catalog, { ...bareMenu, group: 'metrics', primary: false } as never] })).toThrow(/not a platform permission/);
  });

  it('rejects a menu with moduleScreen but no module, even in a platform group with a platform permission', () => {
    const stray = { ...menu('stray', '/stray'), moduleScreen: () => null } as unknown as MenuEntry;

    expect(() => createRegistry({ spaces, groups, menus: [catalog, stray] })).toThrow(/moduleScreen but no module/);
  });

  it('rejects ownership mismatch in both directions and a near-miss prefix', () => {
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu({ module: 'gx', permission: 'gx:view' })] })).toThrow(/different modules/);
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu({ permission: 'fixtures:view', module: 'fixture' })] })).toThrow(/needs the "fixture:" prefix/);
    expect(() => createRegistry({ spaces, groups: [...groups, { ...modGroup, id: 'fixtures:main', module: 'fixture' }], menus: [catalog] })).toThrow(/needs the "fixture:" prefix/);
    expect(() => createRegistry({ spaces, groups: [...groups, { ...modGroup, id: 'fixture:main', module: 'fixture' }], menus: [catalog, modMenu({ group: 'fixture:main', module: 'fixture', permission: 'fixtures:view' })] })).toThrow(/needs the "fixture:" prefix/);
  });

  it('keeps the platform vocabulary closed at compile time', () => {
    // @ts-expect-error a platform menu's permission must be a Permission
    menu('typo', '/typo', { permission: 'fx:view' });
    // @ts-expect-error a platform menu's group must be a GroupId
    menu('typo', '/typo', { group: 'fx:main' });
  });
});

describe('routeParamNames', () => {
  it.each([
    ['/', []], ['/metrics/static:label', []], ['/metrics/:id/versions/:version/', ['id', 'version']],
  ])('reads route parameter names from %s', (path, names) => {
    expect(routeParamNames(path)).toEqual(names);
  });
});

describe('paneHref', () => {
  const registry = createRegistry({ spaces, groups, menus: [catalog, menu('detail', '/metrics/:id')] });
  it.each([['', '/metrics/a%2Fb'], ['a=1', '/metrics/a%2Fb?a=1'], ['?a=1', '/metrics/a%2Fb?a=1']])('builds a pane address with query %s', (query, href) => {
    expect(paneHref(registry, { menuId: 'detail', params: { id: 'a/b' }, query })).toBe(href);
  });
});

it.each([
  { context: ['selection'] },
  { context: ['unknown'] },
  { page: [{ key: 'unknown', label: { ko: '값', en: 'Value' } }] },
  { page: [{ key: 'filter', label: { ko: '', en: 'Value' } }] },
])('rejects unusable query required declarations %j', required => {
  const entry = { ...catalog, context: { ...none, time: 'apply' as const }, pageKeys: ['filter'], query: { mode: 'apply' as const, required } };
  expect(() => createRegistry({ spaces, groups, menus: [entry as MenuEntry] })).toThrow(/required/);
});

it.each(['', 'a\nb'])('keeps the quoted key in the required Context error for unknown key %j', key => {
  const entry = { ...catalog, context: { ...none, time: 'apply' as const }, query: { mode: 'apply' as const, required: { context: [key] } } };
  expect(() => createRegistry({ spaces, groups, menus: [entry as unknown as MenuEntry] })).toThrow(`Menu "${catalog.id}" required Context "${key}" must be applied`);
});

// ADR-0072: the app declares its groups, spaces and menu permissions; the Registry is the closed list at runtime.
describe('app-declared vocabulary (ADR-0072)', () => {
  const declared = [menuPermission('metrics:view')];
  const base = { spaces, groups, menus: [catalog] };
  const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: spaceId('analytics') };
  const modMenu = (over: Partial<ModuleMenuEntry> = {}): ModuleMenuEntry => ({
    id: 'fx-home', module: 'fx', group: 'fx:main', permission: 'fx:view', label: { ko: 'f', en: 'f' }, description: { ko: '', en: '' }, path: '/fx', icon: House,
    requiresScope: false, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true,
    moduleScreen: () => null, ...over,
  });

  it('accepts a declared menu permission and a kernel permission together, and lists kernel first then declared in order', () => {
    const notices = menu('notices', '/notices', { group: groupId('noticeVoc'), permission: 'notice:view', primary: true });
    const registry = create({ ...base, groups: [...groups, { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notice' }, icon: House, space: null }], menus: [catalog, notices], permissions: [menuPermission('metrics:view'), menuPermission('zeta:view')] });

    expect(registry.permissions).toEqual([...KERNEL_PERMISSIONS, 'metrics:view', 'zeta:view']);
  });

  it('lists only the kernel permissions when the app declares none', () => {
    const home = menu('home', '/', { permission: 'platform:view', primary: true });

    expect(create({ spaces: [{ ...analyticsSpace, homeMenuId: 'home' }], groups, menus: [home] }).permissions).toEqual([...KERNEL_PERMISSIONS]);
  });

  it.each([
    ['a menu group nobody declared', { ...base, menus: [catalog, menu('a', '/a', { group: groupId('ghost') })], permissions: declared }, /undeclared group/],
    ['a group in a space nobody declared', { ...base, groups: [{ ...groups[0], space: spaceId('ghost') }], permissions: declared }, /undeclared space "ghost"/],
    ['a menu permission nobody declared', { ...base }, /permission "metrics:view" is not a platform permission/],
    ['a space permission nobody declared', { ...base, spaces: [{ ...analyticsSpace, permission: menuPermission('ghost:view') }], permissions: declared }, /Space "analytics" permission "ghost:view"/],
    ['a declared permission that repeats a kernel one', { ...base, permissions: [...declared, menuPermission('console:access')] }, /duplicates a kernel permission/],
    ['a declared permission listed twice', { ...base, permissions: [...declared, menuPermission('metrics:view')] }, /Duplicate declared permission/],
    ['a declared permission without an action', { ...base, permissions: [menuPermission('metrics')] }, /must be "<namespace>:<action>"/],
    ['a null declared permission', { ...base, permissions: [null] }, /Declared permission "null" must be/],
    ['a numeric declared permission', { ...base, permissions: [42] }, /Declared permission "42" must be/],
    ['a declared permission with whitespace', { ...base, permissions: [menuPermission('metrics:view all')] }, /must be "<namespace>:<action>"/],
    ['an empty group id', { ...base, groups: [{ ...groups[0], id: groupId('') }], permissions: declared }, /Group id "" must be non-empty/],
    ['a group id with whitespace', { ...base, groups: [{ ...groups[0], id: groupId('my group') }], permissions: declared }, /Group id "my group"/],
    ['a group id with "?"', { ...base, groups: [{ ...groups[0], id: groupId('a?b') }], permissions: declared }, /Group id "a\?b"/],
    ['a no-module group id with ":"', { ...base, groups: [...groups, { ...groups[0], id: groupId('a:b') }], permissions: declared }, /not a platform group id/],
    ['an empty space id', { ...base, spaces: [{ ...analyticsSpace, id: spaceId('') }], permissions: declared }, /Space id "" must be non-empty/],
    ['a space id with "#"', { ...base, spaces: [{ ...analyticsSpace, id: spaceId('a#b') }], permissions: declared }, /Space id "a#b"/],
  ])('rejects %s', (_name, input, message) => {
    expect(() => create(input as Parameters<typeof create>[0])).toThrow(RegistryError);
    expect(() => create(input as Parameters<typeof create>[0])).toThrow(message);
  });

  it.each<[string, string, `${string}:${string}`, `${string}:${string}`]>([
    ['a kernel namespace', 'platform', 'platform:main', 'platform:view'],
    ['a namespace of a declared app permission', 'metrics', 'metrics:main', 'metrics:other'],
  ])('rejects a module whose id is %s', (_name, moduleId, group, permission) => {
    const input = { spaces, groups: [...groups, { ...modGroup, id: group, module: moduleId }], menus: [catalog, modMenu({ module: moduleId, group, permission })], permissions: declared };

    expect(() => create(input)).toThrow(/reserved platform namespace/);
  });

  it('accepts a module in a namespace nobody reserves', () => {
    expect(() => create({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu()], permissions: declared })).not.toThrow();
  });
});
