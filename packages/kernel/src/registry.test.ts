import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { SpaceDef } from '@ap/contracts';
import { createRegistry, RegistryError, type GroupDef, type MenuEntry, type ModuleMenuEntry, type PlatformMenuEntry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const groups: GroupDef[] = [{ id: 'metrics', label: { ko: '지표', en: 'Metrics' }, icon: House, space: 'analytics' }];
const analyticsSpace: SpaceDef = { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'catalog' };
const spaces: SpaceDef[] = [analyticsSpace];
const homeA: SpaceDef[] = [{ ...analyticsSpace, homeMenuId: 'a' }];
const menu = (id: string, path: string, extra: Partial<PlatformMenuEntry> = {}): MenuEntry => ({
  id, group: 'metrics', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
  permission: 'metrics:view', requiresScope: false, context: none, pageType: 'catalog',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...extra,
});
const catalog = menu('catalog', '/metrics', { primary: true });

describe('createRegistry validation (platform-packages.md §5)', () => {
  it('passes the optional single-menu sidebar label declaration through unchanged (type + pass-through; no runtime rule)', () => {
    const group: GroupDef = { ...groups[0], hideLabelWhenSingle: true };
    const registry = createRegistry({ spaces, groups: [group], menus: [catalog] });

    expect(registry.groupById('metrics').hideLabelWhenSingle).toBe(true);
  });

  it('rejects duplicate ids, unknown parents and undeclared groups', () => {
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('catalog', '/x')] })).toThrow(RegistryError);
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('detail', '/metrics/:id', { parent: 'nope' })] })).toThrow(/unknown parent/);
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('a', '/a', { group: 'admin' })] })).toThrow(/undeclared group/);
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
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, drill: { levels: [] } })] })).toThrow(/Menu "a" drill needs 1 to 4 levels, found 0/);
  });

  it('rejects a drill with more than four levels', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, drill: { levels: ['a', 'b', 'c', 'd', 'e'].map(level) } })] })).toThrow(/Menu "a" drill needs 1 to 4 levels, found 5/);
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

  it('allows §6.1 screen-state page keys (sort, page, tab, bucket, bin)', () => {
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['sort', 'page', 'tab', 'bucket', 'bin'] })] })).not.toThrow();
    expect(() => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['q', 'status', 'maker', 'focus', 'sort', 'page', 'tab'] })] })).not.toThrow();
  });

  it('rejects routes with the same shape once parameter names are erased', () => {
    expect(() => createRegistry({ spaces, groups, menus: [catalog, menu('x', '/metrics/:metricId'), menu('y', '/metrics/:id')] })).toThrow(/same route shape/);
  });
});

describe('spaces (06 §9.1)', () => {
  const adminGroups: GroupDef[] = [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }];
  const operations: SpaceDef = { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' };
  const roles = menu('admin-roles', '/admin/roles', { group: 'admin', permission: 'console:access', primary: true });

  it('rejects duplicate space ids', () => {
    expect(() => createRegistry({ spaces: [operations, operations], groups: adminGroups, menus: [roles] })).toThrow(/Duplicate space id "operations"/);
  });

  it('rejects groups whose space is not declared', () => {
    expect(() => createRegistry({ spaces: [analyticsSpace], groups: [...groups, { ...adminGroups[0], space: 'metrics' }], menus: [roles] })).toThrow(/Group "admin" uses undeclared space "metrics"/);
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
    const viewerRoles = menu('admin-roles', '/admin/roles', { group: 'admin', permission: 'platform:view', primary: true });
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
    const notice: GroupDef = { id: 'noticeVoc', label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const overview: GroupDef = { id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: null };
    const notices = menu('notices', '/notices', { group: 'noticeVoc', permission: 'notice:view', primary: true });
    const home = menu('home', '/', { group: 'overview', permission: 'platform:view', primary: true });
    const detail = menu('notices-detail', '/notices/:id', { group: 'noticeVoc', parent: 'home', permission: 'notice:view' });
    const registry = createRegistry({ spaces, groups: [...groups, notice, overview], menus: [catalog, notices, home, detail] });
    expect(registry.spaceOf(notices)).toBeNull();
    expect(registry.spaceOf(home)).toBeNull();
    expect(registry.spaceOf(catalog)?.id).toBe('analytics');
  });

  it('rejects a space whose home menu is a global utility', () => {
    const notice: GroupDef = { id: 'noticeVoc', label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const notices = menu('notices', '/notices', { group: 'noticeVoc', permission: 'notice:view', primary: true });
    expect(() => createRegistry({
      spaces: [{ ...analyticsSpace, homeMenuId: 'notices' }],
      groups: [...groups, notice],
      menus: [catalog, notices],
    })).toThrow(/Space "analytics" homeMenuId "notices" is not in that space/);
  });

  it.each(['global-of-space', 'space-of-global'] as const)('rejects a parent across a global group and a space (%s)', direction => {
    const notice: GroupDef = { id: 'noticeVoc', label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const notices = menu('notices', '/notices', { group: 'noticeVoc', permission: 'notice:view', primary: true });
    const detail = direction === 'global-of-space'
      ? menu('detail', '/notices/:id', { group: 'noticeVoc', parent: 'catalog', permission: 'notice:view' })
      : menu('detail', '/metrics/:id', { parent: 'notices' });
    expect(() => createRegistry({ spaces, groups: [...groups, notice], menus: [catalog, notices, detail] })).toThrow(/another space/);
  });

  it.each([0, 2])('a global group still needs exactly one primary (found %s)', found => {
    const notice: GroupDef = { id: 'noticeVoc', label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const menus = found === 0
      ? [catalog, menu('notices', '/notices', { group: 'noticeVoc', permission: 'notice:view' })]
      : [catalog, menu('notices', '/notices', { group: 'noticeVoc', permission: 'notice:view', primary: true }), menu('voc', '/voc', { group: 'noticeVoc', permission: 'voc:view', primary: true })];
    expect(() => createRegistry({ spaces, groups: [...groups, notice], menus })).toThrow(new RegExp(`needs exactly one primary menu, found ${found}`));
  });

  it('allows eight groups in one space (no per-space group cap)', () => {
    // The platform vocabulary is closed at runtime, so the eighth group is a module group.
    const ids = ['overview', 'equipment', 'masterData', 'analytics', 'metrics', 'noticeVoc', 'admin'] as const;
    const platform: GroupDef[] = ids.map(id => ({ id, label: { ko: id, en: id }, icon: House, space: 'analytics' }));
    const probe: GroupDef = { id: 'probe:main', module: 'probe', label: { ko: 'p', en: 'p' }, icon: House, space: 'analytics' };
    const eight = [...platform, probe];
    const eightMenus: MenuEntry[] = [
      ...ids.map((id, i) => menu(`m${i}`, `/m${i}`, { group: id, primary: true })),
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
  const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: 'analytics' };
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
    expect(() => createRegistry({ spaces, groups: [...groups, { ...modGroup, id: 'metrics2' as never, module: undefined } as never], menus: [catalog] })).toThrow(/not a platform group/);
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
