import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { GroupId, SpaceDef } from '@ap/contracts';
import { createRegistry, RegistryError, type GroupDef, type MenuEntry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const groups: GroupDef[] = [{ id: 'metrics', label: { ko: '지표', en: 'Metrics' }, icon: House, space: 'analytics' }];
const analyticsSpace: SpaceDef = { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'catalog' };
const spaces: SpaceDef[] = [analyticsSpace];
const homeA: SpaceDef[] = [{ ...analyticsSpace, homeMenuId: 'a' }];
const menu = (id: string, path: string, extra: Partial<MenuEntry> = {}): MenuEntry => ({
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
  const operations: SpaceDef = { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' };
  const roles = menu('admin-roles', '/admin/roles', { group: 'admin', permission: 'console:access', primary: true });

  it('rejects duplicate space ids', () => {
    expect(() => createRegistry({ spaces: [operations, operations], groups: adminGroups, menus: [roles] })).toThrow(/Duplicate space id "operations"/);
  });

  it('rejects groups whose space is not declared', () => {
    expect(() => createRegistry({ spaces: [analyticsSpace], groups: [...groups, { ...adminGroups[0], space: 'feedback' }], menus: [roles] })).toThrow(/Group "admin" uses undeclared space "feedback"/);
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

  it('rejects a home menu whose permission differs from the space permission', () => {
    const viewerRoles = menu('admin-roles', '/admin/roles', { group: 'admin', permission: 'platform:view', primary: true });
    expect(() => createRegistry({ spaces: [operations], groups: adminGroups, menus: [viewerRoles] })).toThrow(/Space "operations" home permission must be "console:access"/);
  });

  it('rejects a parent menu in another space', () => {
    const detail = menu('detail', '/metrics/:metricId', { parent: 'admin-roles' });
    expect(() => createRegistry({ spaces: [analyticsSpace, operations], groups: [...groups, ...adminGroups], menus: [roles, detail] })).toThrow(/Menu "detail" parent "admin-roles" is in another space/);
  });

  it('allows eight groups in one space (no per-space group cap)', () => {
    const ids = ['overview', 'equipment', 'masterData', 'analytics', 'metrics', 'noticeVoc', 'admin', 'genProbe'];
    const eight: GroupDef[] = ids.map(id => ({ id: id as GroupId, label: { ko: id, en: id }, icon: House, space: 'analytics' }));
    const eightMenus = eight.map((g, i) => menu(`m${i}`, `/m${i}`, { group: g.id, primary: true }));
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
