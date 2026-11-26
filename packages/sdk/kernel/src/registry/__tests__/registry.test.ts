import { paneHref } from '../../context/paneContext';
import { cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PlatformProvider } from '../../platform/platform';
import { testAdapter, testSession } from '../../testing';
import { createRegistry as create, routeParamNames, RegistryError, type GroupDef, type MenuEntry, type ModuleMenuEntry, type PlatformMenuEntry } from '../registry';
import * as shapes from '../shapes';
import { menuAnalysisSelections } from '../analysis-selections';
import { disabledReason, projectQueryInputs } from '../panel-inputs';
import { carrySetId, emptyGlobal, groupId, KERNEL_PERMISSIONS, menuPermission, menuPermissions, NO_FEATURES, spaceId, type Pair, type PanelDeclaration, type SpaceDef } from '@ap/contracts';

/** The fixtures' menus use `metrics:view`, which the app (here: the test) declares. */
const createRegistry = (input: Parameters<typeof create>[0]) => create({ permissions: [menuPermission('metrics:view')], ...input });
const none = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const groups: GroupDef[] = [{ id: groupId('metrics'), label: { ko: '지표', en: 'Metrics' }, icon: House, space: spaceId('mars') }];
const analyticsSpace: SpaceDef = { id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'catalog' };
const spaces: SpaceDef[] = [analyticsSpace];
const homeA: SpaceDef[] = [{ ...analyticsSpace, homeMenuId: 'a' }];
const menu = (id: string, path: string, extra: Partial<PlatformMenuEntry> = {}): MenuEntry => ({
  id, group: groupId('metrics'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
  permission: menuPermission('metrics:view'), requiresScope: false, context: none, pageType: 'catalog',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...extra,
});
const catalog = menu('catalog', '/metrics', { primary: true });

describe('analysis menu defaults (#2503)', () => {
  it('requires a saved-view declaration for the implicit Apply default', () => {
    const entry = { ...catalog, pageType: 'analysis' as const, context: { ...none, time: 'apply' as const }, features: NO_FEATURES };
    expect(() => createRegistry({ spaces, groups, menus: [entry] })).toThrow(/Menu "catalog".*savedViewSupport/);
  });

  it('defaults to Apply and saved views even when NO_FEATURES is spread', () => {
    const entry = { ...catalog as PlatformMenuEntry, pageType: 'analysis' as const, context: { ...none, time: 'apply' as const }, features: { ...NO_FEATURES, board: true }, savedViews: 'screen' as const };
    const resolved = createRegistry({ spaces, groups, menus: [entry] }).menuById(entry.id);
    expect(resolved.query).toEqual({ mode: 'apply' });
    expect(resolved.features).toMatchObject({ savedView: true, board: true });
    expect(entry).not.toHaveProperty('query');
    expect(entry.features).not.toHaveProperty('savedView');
  });

  it('honors a live opt-out without requiring time', () => {
    const entry = { ...catalog, pageType: 'analysis' as const, query: { mode: 'live' as const }, features: NO_FEATURES };
    const resolved = createRegistry({ spaces, groups, menus: [entry] }).menuById(entry.id);
    expect(resolved.query).toEqual({ mode: 'live' });
    expect(resolved.features.savedView).toBe(false);
  });

  it.each([
    ['autoApplyDefault', { mode: 'live', autoApplyDefault: true }],
    ['applyPeriodOnLegacyEntry', { mode: 'live', applyPeriodOnLegacyEntry: true }],
    ['required', { mode: 'live', required: { context: ['roomNames'] } }],
  ] as const)('rejects Apply-only field %s on a live query declaration', (field, query) => {
    const entry = { ...catalog, pageType: 'analysis' as const, query: query as unknown as PlatformMenuEntry['query'], features: NO_FEATURES };
    expect(() => createRegistry({ spaces, groups, menus: [entry] })).toThrow(new RegExp(`live query.*"${field}".*apply`));
  });

  it('allows Apply with an explicit saved-view opt-out', () => {
    const entry = { ...catalog, pageType: 'analysis' as const, context: { ...none, time: 'apply' as const }, features: { ...NO_FEATURES, savedView: false } };
    const resolved = createRegistry({ spaces, groups, menus: [entry] }).menuById(entry.id);
    expect(resolved.query?.mode).toBe('apply');
    expect(resolved.features.savedView).toBe(false);
  });

  it('names the live opt-out when analysis cannot apply time', () => {
    const entry = { ...catalog, pageType: 'analysis' as const, features: NO_FEATURES };
    expect(() => createRegistry({ spaces, groups, menus: [entry] })).toThrow(/catalog.*time: 'apply'.*query: \{ mode: 'live' \}/);
  });

  it('keeps non-analysis menus live and saved views off by default', () => {
    const resolved = createRegistry({ spaces, groups, menus: [{ ...catalog, features: NO_FEATURES }] }).menuById(catalog.id);
    expect(resolved.query).toBeUndefined();
    expect(resolved.features.savedView).toBe(false);
  });
});

describe('createRegistry validation (platform-packages.md §5)', () => {
  describe('saved-view declarations on resolved menus', () => {
    const entry = { ...catalog as PlatformMenuEntry, context: { ...none, time: 'apply' as const }, query: { mode: 'apply' as const }, features: { ...catalog.features, savedView: true } };
    const support = { menuId: catalog.id, menuSchemaVersion: 1, contextKeys: [], pageKeys: [] };

    it('rejects an Apply menu with resolved saved views and names support and opt-out choices', () => {
      expect(() => createRegistry({ spaces, groups, menus: [entry] })).toThrow(/Menu "catalog" resolves features\.savedView: true.*savedViewSupport.*savedViews: 'screen'.*features: \{ \.\.\.NO_FEATURES, savedView: false \}.*query: \{ mode: 'live' \}/);
    });

    it.each([
      ['manifest support', { savedViewSupport: support }],
      ['screen registration', { savedViews: 'screen' }],
    ] as const)('accepts %s when saved views resolve on', (_form, declaration) => {
      expect(() => createRegistry({ spaces, groups, menus: [{ ...entry, ...declaration }] })).not.toThrow();
    });

    it('accepts an Apply opt-out through features.savedView: false', () => {
      expect(() => createRegistry({ spaces, groups, menus: [{ ...entry, features: { ...entry.features, savedView: false } }] })).not.toThrow();
    });

    it.each([
      ['support and screen', { savedViewSupport: support, savedViews: 'screen' }, /both savedViewSupport and savedViews: 'screen'/],
      ['screen with saved views off', { ...entry, features: { ...entry.features, savedView: false }, savedViews: 'screen' }, /savedViews: 'screen' requires resolved features\.savedView: true/],
    ] as const)('rejects %s', (_name, declaration, message) => {
      expect(() => createRegistry({ spaces, groups, menus: [{ ...entry, ...declaration } as PlatformMenuEntry] })).toThrow(message);
    });
  });

  it('rejects live saved views with actionable Apply-only guidance (#2047 KER-22)', () => {
    const entry = { ...catalog, features: { ...catalog.features, savedView: true } };
    expect(() => createRegistry({ spaces, groups, menus: [entry] })).toThrow(RegistryError);
    expect(() => createRegistry({ spaces, groups, menus: [entry] })).toThrow(/savedView.*query.mode: 'apply'.*query toolbar/);
  });
  it('rejects manifest saved-view support declared for another menu id', () => {
    const entry = { ...catalog, context: { ...none, time: 'apply' as const }, query: { mode: 'apply' as const },
      savedViewSupport: { menuId: 'other-menu', menuSchemaVersion: 1, contextKeys: [], pageKeys: [] } } as PlatformMenuEntry;
    expect(() => createRegistry({ spaces, groups, menus: [entry] })).toThrow(/savedViewSupport.menuId "other-menu".*"catalog"/);
  });
  it.each([0, -1, 1.5, NaN, Infinity])('rejects defaultPeriodHours=%s', defaultPeriodHours => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...catalog, context: { ...none, time: 'apply' }, defaultPeriodHours }] })).toThrow(/defaultPeriodHours/);
  });
  it.each(['unsupported', 'reference'] as const)('rejects defaultPeriodHours on time=%s', time => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...catalog, context: { ...none, time }, defaultPeriodHours: 8 }] })).toThrow(/defaultPeriodHours/);
  });

  it('rejects apply mode without an address-reproducible period', () => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...catalog, query: { mode: 'apply' } }] })).toThrow(/apply.*time/);
  });
  it('passes the optional single-menu sidebar label declaration through unchanged (type + pass-through; no runtime rule)', () => {
    const group: GroupDef = { ...groups[0], hideLabelWhenSingle: true };
    const registry = createRegistry({ spaces, groups: [group], menus: [catalog] });

    expect(registry.groupById(groupId('metrics')).hideLabelWhenSingle).toBe(true);
  });

  it('has(menuId) answers registration without throwing (#2001 F2)', () => {
    const registry = createRegistry({ spaces, groups, menus: [catalog] });
    expect(registry.has('catalog')).toBe(true);
    expect(registry.has('nope')).toBe(false);
    expect(() => registry.menuById('nope')).toThrow(RegistryError);
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

  it('repeatedPageKeys and hiddenPageKeys must be declared pageKeys, listed once; carry sets and contextResetKeys may name them', () => {
    const make = (over: Record<string, unknown>) => () => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['filter', 'tag', 'sort'], ...over })] });
    expect(make({ repeatedPageKeys: ['nope'] })).toThrow(/repeatedPageKeys key "nope" is not a declared page key/);
    expect(make({ hiddenPageKeys: ['nope'] })).toThrow(/hiddenPageKeys key "nope" is not a declared page key/);
    expect(make({ repeatedPageKeys: ['tag', 'tag'] })).toThrow(/declared twice/);
    expect(make({ hiddenPageKeys: ['scopeId'] })).toThrow(/not a declared page key/);
    expect(make({ pageKeys: ['scopeId'], repeatedPageKeys: ['scopeId'] })).toThrow(/global Context key/);
    expect(make({ repeatedPageKeys: ['filter', 'tag'], hiddenPageKeys: ['filter'], contextResetKeys: ['filter'] })).not.toThrow();
    expect(() => createRegistry({ spaces: homeA, groups, carrySets: [{ id: carrySetId('c'), pageKeys: ['filter'] }], menus: [menu('a', '/a', { primary: true, pageKeys: ['filter'], carrySet: carrySetId('c'), repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'] })] })).not.toThrow();
  });

  it('subjectPageKeys names declared single-valued page keys; the menu names the kind, which must be an identifier (#1429, #1673)', () => {
    const make = (over: Record<string, unknown>) => () => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['eqp', 'tag'], repeatedPageKeys: ['tag'], ...over })] });
    expect(make({ subjectPageKeys: { equipment: 'eqp' } })).not.toThrow();
    expect(make({ subjectPageKeys: { equipment: 'nope' } })).toThrow(/subjectPageKeys equipment key "nope" is not a declared page key/);
    expect(make({ subjectPageKeys: { process: 'tag' } })).toThrow(/cannot be a repeated page key/);
    expect(make({ subjectPageKeys: { lot: 'eqp' } })).not.toThrow();
    expect(make({ subjectPageKeys: { equipment: 'eqp', process: 'tag', chamber: 'eqp' } })).toThrow(/cannot be a repeated page key/);
    expect(make({ subjectPageKeys: { equipment: 'eqp', lot: 'eqp', chamber: 'eqp' } })).not.toThrow();
    for (const kind of ['Bad Kind', '__proto__', '1lot', 'Lot', '']) expect(make({ subjectPageKeys: JSON.parse(`{${JSON.stringify(kind)}: "eqp"}`) })).toThrow(/must be an identifier/);
  });

  it('a repeated key cannot be a drill level, the conditionPreset key or a navView preset key (error names the key and the role)', () => {
    const preset = (id: string) => ({ id, label: { ko: id, en: id }, axes: ['team'] });
    const one = (over: Record<string, unknown>) => () => createRegistry({ spaces: homeA, groups, menus: [menu('a', '/a', { primary: true, ...over })] });
    expect(one({ pageKeys: ['room'], contextResetKeys: ['room'], repeatedPageKeys: ['room'], drill: { levels: [level('room')] } })).toThrow(/repeatedPageKeys key "room" cannot also be a drill level key/);
    expect(one({ pageKeys: ['view'], repeatedPageKeys: ['view'], context: { ...none, condition: 'apply' }, conditionPresets: [preset('a'), preset('b')], conditionPreset: { key: 'view', default: 'a' } })).toThrow(/repeatedPageKeys key "view" cannot also be the conditionPreset key/);
    expect(one({ pageKeys: ['tab'], repeatedPageKeys: ['tab'], navViews: [{ id: 'v', label: { ko: 'v', en: 'v' }, page: { tab: 'x' } }] })).toThrow(/repeatedPageKeys key "tab" cannot also be a navView preset key/);
  });

  it('carry set members must agree on whether a carried key is a repeated page key', () => {
    const set = [{ id: carrySetId('c'), pageKeys: ['tag'] }];
    const member = (id: string, path: string, repeated: boolean, extra: Partial<PlatformMenuEntry> = {}) => menu(id, path, { pageKeys: ['tag'], carrySet: carrySetId('c'), ...(repeated ? { repeatedPageKeys: ['tag'] } : {}), ...extra });
    expect(() => createRegistry({ spaces: homeA, groups, carrySets: set, menus: [member('a', '/a', true, { primary: true }), member('b', '/b', false)] })).toThrow(/Carry set "c" key "tag" is a repeated page key of menu "a" but not of menu "b"/);
    expect(() => createRegistry({ spaces: homeA, groups, carrySets: set, menus: [member('a', '/a', true, { primary: true }), member('b', '/b', true)] })).not.toThrow();
  });

  const level = (key: string) => ({ key, label: { ko: key, en: key } });

  const bases = [{ id: 'alt', label: 'Alternative' }];
  const withBasis = { ...level('room'), bases, basisKey: 'basis' };
  const pageConditions: PlatformMenuEntry['pageConditions'] = { categories: [{ id: 'basis', label: level('basis').label, kind: { type: 'search', key: 'basis' } }] };
  it.each([
    ['missing basisKey', { ...withBasis, basisKey: undefined }, {}, /requires.*basisKey/],
    ['duplicate id', { ...withBasis, bases: [...bases, ...bases] }, {}, /basis id.*duplicated/],
    ['unregistered key', { ...withBasis, basisKey: 'unknown' }, {}, /basisKey "unknown".*pageKeys/],
    ['non-reset key', withBasis, { contextResetKeys: ['room'] }, /basisKey "basis".*contextResetKeys/],
    ['level key', { ...withBasis, basisKey: 'room' }, {}, /basisKey "room".*drill level/],
    ['returnTo', { ...withBasis, basisKey: 'returnTo' }, {}, /basisKey "returnTo".*returnTo/],
    ['repeated key', withBasis, { repeatedPageKeys: ['basis'] }, /repeatedPageKeys key "basis".*drill basisKey/],
    ['duplicate basisKey', withBasis, { drill: { levels: [withBasis, { ...withBasis, ...level('later') }] } }, /basisKey "basis".*duplicated/],
    ['analysis selection key', withBasis, { analysisSelectionInbound: [{ key: 'basis', dimension: 'equipment', shape: 'range' as const, label: level('choice').label }] }, /selection key "basis".*drill basisKey/],
    ['page condition key', withBasis, { pageType: 'analysis', query: { mode: 'live' }, pageConditions }, /key "basis".*drill basisKey/],
    ['condition preset key', withBasis, { context: { ...none, condition: 'apply' }, conditionPresets: ['a', 'b'].map(id => ({ id, label: level(id).label, axes: ['maker'] })), conditionPreset: { key: 'basis', default: 'a' } }, /conditionPreset key "basis".*drill basisKey/],
  ] as const)('rejects a drill declaration with %s', (_name, step, overrides, error) => {
    const keys = ['room', 'basis', 'later', 'returnTo'];
    const entry = menu('a', '/a', { primary: true, pageKeys: keys, contextResetKeys: keys, drill: { levels: [step] }, ...overrides });
    expect(() => createRegistry({ spaces: homeA, groups, menus: [entry] })).toThrow(error);
  });

  it('keeps a basisKey registered after the last alternative is removed', () => {
    const entry = menu('a', '/a', { primary: true, pageKeys: ['room', 'basis'], contextResetKeys: ['room', 'basis'], drill: { levels: [{ ...withBasis, bases: [] }] } });
    const registry = createRegistry({ spaces: homeA, groups, menus: [entry] });
    expect(registry.menus[0]).toMatchObject({ pageKeys: ['room', 'basis'], drill: { levels: [{ basisKey: 'basis', bases: [] }] } });
  });

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

describe('carry sets (ADR-0081 decision 4 as replaced by #1099b)', () => {
  const kSet = { id: carrySetId('shared'), pageKeys: ['k'] };
  const member = (id: string, path: string, extra: Partial<PlatformMenuEntry> = {}) => menu(id, path, { carrySet: kSet.id, ...extra });
  it('accepts member menus that all declare the carry key and answers carrySetOf', () => {
    const registry = createRegistry({ spaces: homeA, groups, carrySets: [kSet], menus: [member('a', '/a', { primary: true, pageKeys: ['k'] }), member('b', '/b', { pageKeys: ['k', 'x'] }), menu('c', '/c')] });
    expect(registry.carrySetOf(registry.menuById('a'))).toEqual(kSet);
    expect(registry.carrySetOf(registry.menuById('c'))).toBeNull();
  });
  it('lets two sets reuse a key name; set identity separates them', () => {
    const other = { id: carrySetId('other'), pageKeys: ['k'] };
    const registry = createRegistry({ spaces: homeA, groups, carrySets: [kSet, other], menus: [member('a', '/a', { primary: true, pageKeys: ['k'] }), menu('b', '/b', { carrySet: other.id, pageKeys: ['k'] })] });
    expect(registry.carrySetOf(registry.menuById('b'))?.id).toBe('other');
  });
  it.each([
    { name: 'a key equal to a global key', carrySets: [{ id: carrySetId('s'), pageKeys: ['scopeId'] }], menus: [menu('a', '/a', { primary: true })], error: /Carry set "s" page key "scopeId" collides with a global/ },
    { name: 'a key declared twice', carrySets: [{ id: carrySetId('s'), pageKeys: ['k', 'k'] }], menus: [menu('a', '/a', { primary: true, pageKeys: ['k'], carrySet: carrySetId('s') })], error: /Carry set "s" page key "k" is declared twice/ },
    { name: 'a malformed key', carrySets: [{ id: carrySetId('s'), pageKeys: ['a b'] }], menus: [menu('a', '/a', { primary: true })], error: /Carry set "s" page key "a b" must be non-empty/ },
    { name: 'a malformed set id', carrySets: [{ id: carrySetId('a/b'), pageKeys: ['k'] }], menus: [menu('a', '/a', { primary: true })], error: /Carry set id "a\/b" must be non-empty/ },
    { name: 'a duplicate set id', carrySets: [kSet, kSet], menus: [member('a', '/a', { primary: true, pageKeys: ['k'] })], error: /Duplicate carry set id "shared"/ },
    { name: 'a menu naming an unknown set', carrySets: [kSet], menus: [menu('a', '/a', { primary: true, carrySet: carrySetId('nope') })], error: /Menu "a" uses undeclared carry set "nope"/ },
    { name: 'a member menu missing the carry key', carrySets: [kSet], menus: [member('a', '/a', { primary: true, pageKeys: ['k'] }), member('c', '/c')], error: /Menu "c" does not declare carry set "shared" page key "k"/ },
  ])('rejects $name', ({ carrySets, menus, error }) => {
    expect(() => createRegistry({ spaces: homeA, groups, carrySets, menus })).toThrow(error);
  });
  it('rejects a set whose pageKeys is not a list', () => {
    expect(() => createRegistry({ spaces: homeA, groups, carrySets: [{ id: carrySetId('s'), pageKeys: 'k' as never }], menus: [menu('a', '/a', { primary: true })] })).toThrow(/Carry set "s" pageKeys must be a list/);
  });
  it('does not require menus outside the set to declare its keys', () => {
    expect(() => createRegistry({ spaces: homeA, groups, carrySets: [kSet], menus: [member('a', '/a', { primary: true, pageKeys: ['k'] }), menu('b', '/b')] })).not.toThrow();
  });
});

describe('menu navViews (sidebar sub-items, 06 §8)', () => {
  const view = { id: 'mine', label: { ko: '내 것', en: 'Mine' }, page: { tab: 'mine' } };
  const withViews = (views: unknown, extra: Partial<PlatformMenuEntry> = {}) => menu('a', '/a', { primary: true, pageKeys: ['tab', 'k'], navViews: views as never, ...extra });
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
    { name: 'an empty preset', menus: [withViews([{ ...view, page: {} }])], error: /Menu "a" navView "mine" needs at least one preset key/ },
    { name: 'a blank id', menus: [withViews([{ ...view, id: ' ' }])], error: /navView id must not be blank/ },
  ])('rejects $name', ({ menus, error }) => {
    expect(() => createRegistry({ spaces: homeA, groups, menus })).toThrow(error);
  });
  it('rejects a preset key the carry set carries', () => {
    expect(() => createRegistry({ spaces: homeA, groups, carrySets: [{ id: carrySetId('shared'), pageKeys: ['k'] }], menus: [withViews([{ ...view, page: { k: 'x' } }], { carrySet: carrySetId('shared') })] })).toThrow(/navView "mine" preset key "k" is a carry set page key/);
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
    expect(() => createRegistry({ spaces: [analyticsSpace], groups: [...groups, { ...adminGroups[0], space: spaceId('bravo') }], menus: [roles] })).toThrow(/Group "admin" uses undeclared space "bravo"/);
  });

  it('rejects an unknown home menu id', () => {
    expect(() => createRegistry({ spaces: [{ ...operations, homeMenuId: 'nope' }], groups: adminGroups, menus: [roles] })).toThrow(/Space "operations" homeMenuId "nope" is unknown/);
  });

  it('rejects a home menu in another space', () => {
    expect(() => createRegistry({ spaces: [analyticsSpace, { ...operations, homeMenuId: 'catalog' }], groups: [...groups, ...adminGroups], menus: [catalog, roles] })).toThrow(/Space "operations" homeMenuId "catalog" is not in that space/);
  });

  it('rejects a home route that needs parameters', () => {
    const detail = menu('detail', '/metrics/:metricId', { parent: 'catalog' });
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, homeMenuId: 'detail' }], groups, menus: [catalog, detail] })).toThrow(/Space "mars" homeMenuId "detail" home route must not need parameters/);
  });

  it.each([
    { ko: '', en: 'Purpose' },
    { ko: '목적', en: '   ' },
  ])('rejects an empty space description (%j)', description => {
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, description }], groups, menus: [catalog] })).toThrow(/Space "mars" description must not be empty/);
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
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, subtitle }], groups, menus: [catalog] })).toThrow(/Space "mars" subtitle must not be empty/);
  });

  it.each([undefined, 'default', 'hidden'] as const)('accepts scopePresentation %s on a space whose menus do not require Scope', scopePresentation => {
    const space: SpaceDef = scopePresentation ? { ...analyticsSpace, scopePresentation } : analyticsSpace;
    expect(createRegistry({ spaces: [space], groups, menus: [catalog] }).spaces[0]?.scopePresentation).toBe(scopePresentation);
  });

  it.each([undefined, true] as const)('accepts feedbackTracking %s and keeps it on the space', feedbackTracking => {
    const space: SpaceDef = feedbackTracking ? { ...analyticsSpace, feedbackTracking } : analyticsSpace;
    expect(createRegistry({ spaces: [space], groups, menus: [catalog] }).spaces[0]?.feedbackTracking).toBe(feedbackTracking);
  });

  it.each([false, 'yes'])('rejects feedbackTracking %j', feedbackTracking => {
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, feedbackTracking: feedbackTracking as never }], groups, menus: [catalog] })).toThrow('Space "mars" feedbackTracking must be true when present');
  });

  it('accepts a default space with a Scope-requiring menu', () => {
    const scoped = menu('catalog', '/metrics', { primary: true, requiresScope: true });
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, scopePresentation: 'default' }], groups, menus: [scoped] })).not.toThrow();
  });

  it('rejects an unknown scopePresentation value', () => {
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, scopePresentation: 'site' as never }], groups, menus: [catalog] })).toThrow(/Space "mars" scopePresentation must be/);
  });

  it('rejects a hidden space that holds a Scope-requiring platform menu, naming space and menu', () => {
    const scoped = menu('scoped', '/scoped', { requiresScope: true });
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, scopePresentation: 'hidden' }], groups, menus: [catalog, scoped] })).toThrow(/Space "mars" hides Scope but menu "scoped" requires Scope/);
  });

  it('rejects a hidden space that holds a Scope-requiring module menu', () => {
    const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: spaceId('mars') };
    const mod: ModuleMenuEntry = {
      id: 'fx-home', module: 'fx', group: 'fx:main', permission: 'fx:view', label: { ko: 'f', en: 'f' }, description: { ko: '', en: '' }, path: '/fx', icon: House,
      requiresScope: true, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true,
      moduleScreen: () => null,
    };
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, scopePresentation: 'hidden' }], groups: [...groups, modGroup], menus: [catalog, mod] })).toThrow(/Space "mars" hides Scope but menu "fx-home" requires Scope/);
  });

  it('rejects a home menu whose permission differs from the space permission', () => {
    const viewerRoles = menu('admin-roles', '/admin/roles', { group: groupId('admin'), permission: 'platform:view', primary: true });
    expect(() => createRegistry({ spaces: [operations], groups: adminGroups, menus: [viewerRoles] })).toThrow(/Space "operations" home permission must be "console:access"/);
  });

  it('rejects additional home permissions beyond the space gate (#2008 KER-3)', () => {
    const restrictedHome = { ...roles, additionalPermissions: ['platform:view' as const] };
    expect(() => createRegistry({ spaces: [operations], groups: adminGroups, menus: [restrictedHome] })).toThrow(/home permission must be/);
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
    const registry = createRegistry({ spaces, groups: [...groups, notice, overview], menus: [catalog, notices, home, detail], platformHomeMenuId: 'home' });
    expect(registry.spaceOf(notices)).toBeNull();
    expect(registry.spaceOf(home)).toBeNull();
    expect(registry.spaceOf(catalog)?.id).toBe('mars');
  });

  it('rejects a space whose home menu is a global utility', () => {
    const notice: GroupDef = { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notice' }, icon: House, space: null };
    const notices = menu('notices', '/notices', { group: groupId('noticeVoc'), permission: 'notice:view', primary: true });
    expect(() => createRegistry({
      spaces: [{ ...analyticsSpace, homeMenuId: 'notices' }],
      groups: [...groups, notice],
      menus: [catalog, notices],
    })).toThrow(/Space "mars" homeMenuId "notices" is not in that space/);
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
    const platform: GroupDef[] = ids.map(id => ({ id: groupId(id), label: { ko: id, en: id }, icon: House, space: spaceId('mars') }));
    const probe: GroupDef = { id: 'probe:main', module: 'probe', label: { ko: 'p', en: 'p' }, icon: House, space: spaceId('mars') };
    const eight = [...platform, probe];
    const eightMenus: MenuEntry[] = [
      ...ids.map((id, i) => menu(`m${i}`, `/m${i}`, { group: groupId(id), primary: true })),
      { ...menu('m7', '/m7', { primary: true }), group: 'probe:main', module: 'probe', permission: 'probe:view', component: undefined, moduleScreen: () => null } as MenuEntry,
    ];
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, homeMenuId: 'm0' }], groups: eight, menus: eightMenus })).not.toThrow();
  });
});

describe('matchRoute malformed separators (#2008 KER-7)', () => {
  it.each(['/mars//catalog', '//mars/catalog', '/mars/catalog//'])('refuses %s consistently with URL writes', path => {
    const r = createRegistry({ spaces, groups, menus: [catalog] });
    expect(r.matchRoute('/mars/catalog')?.menu.id).toBe('catalog');
    expect(r.matchRoute(path)).toBeNull();
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
  const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: spaceId('mars') };
  const modMenu = (over: Partial<ModuleMenuEntry> = {}): ModuleMenuEntry => ({
    id: 'fx-home', module: 'fx', group: 'fx:main', permission: 'fx:view', label: { ko: 'f', en: 'f' }, description: { ko: '', en: '' }, path: '/fx', icon: House,
    requiresScope: false, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true,
    moduleScreen: () => null, ...over,
  });

  it('accepts a module group and permission with their module prefix', () => {
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu()] })).not.toThrow();
  });

  it('rejects a module menu whose resolved Analysis default enables saved views without support', () => {
    const entry = modMenu({ pageType: 'analysis', query: { mode: 'apply' }, context: { ...none, time: 'apply' }, features: NO_FEATURES });
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, entry] })).toThrow(/Module menu "fx-home" resolves features\.savedView: true.*opt out with features/);
  });

  it('rejects screen-registered saved views on a module menu', () => {
    const entry = { ...modMenu(), savedViews: 'screen' } as never;
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, entry] })).toThrow(/Module menu "fx-home" cannot declare savedViews: 'screen'/);
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
  it.each([['', '/mars/detail/a%2Fb'], ['a=1', '/mars/detail/a%2Fb?a=1'], ['?a=1', '/mars/detail/a%2Fb?a=1']])('builds a pane address with query %s', (query, href) => {
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
  const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: spaceId('mars') };
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
    ['a space permission nobody declared', { ...base, spaces: [{ ...analyticsSpace, permission: menuPermission('ghost:view') }], permissions: declared }, /Space "mars" permission "ghost:view"/],
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

describe('menu conditionPresets (06 §6.4, ADR-0083)', () => {
  const preset = (id: string, axes: readonly string[] = ['maker']) => ({ id, label: { ko: id, en: id }, axes });
  const valid = { context: { ...none, condition: 'apply' as const }, pageKeys: ['view'], conditionPresets: [preset('a'), preset('b', ['team'])], conditionPreset: { key: 'view', default: 'a' } };
  const withPresets = (extra: Record<string, unknown>) => menu('a', '/a', { primary: true, ...valid, ...extra } as never);
  const home: SpaceDef[] = homeA;

  it('accepts a valid declaration and a reference capability', () => {
    expect(() => createRegistry({ spaces: home, groups, menus: [withPresets({})] })).not.toThrow();
    expect(() => createRegistry({ spaces: home, groups, menus: [withPresets({ context: { ...none, condition: 'reference' } })] })).not.toThrow();
  });

  it.each([
    ['fewer than 2 presets', { conditionPresets: [preset('a')] }, /at least 2 presets/],
    ['duplicate ids', { conditionPresets: [preset('a'), preset('a', ['team'])] }, /preset id "a" is duplicated/],
    ['a blank id', { conditionPresets: [preset(' '), preset('b')] }, /id must not be blank/],
    ['a blank ko label', { conditionPresets: [{ ...preset('a'), label: { ko: ' ', en: 'A' } }, preset('b')] }, /nonempty ko and en labels/],
    ['a blank en label', { conditionPresets: [{ ...preset('a'), label: { ko: 'A', en: '' } }, preset('b')] }, /nonempty ko and en labels/],
    ['empty axes', { conditionPresets: [preset('a', []), preset('b')] }, /needs at least one axis/],
    ['a default that is not a preset id', { conditionPreset: { key: 'view', default: 'zzz' } }, /default "zzz" is not a declared preset id/],
    ['a key that is not a declared page key', { conditionPreset: { key: 'other', default: 'a' } }, /key "other" is not a declared pageKeys entry/],
    ['an unsupported condition capability', { context: none }, /condition capability of apply or reference/],
    ['presets without the page key declaration', { conditionPreset: undefined }, /declared together/],
    ['the page key declaration without presets', { conditionPresets: undefined }, /declared together/],
  ])('rejects %s', (_name, extra, error) => {
    expect(() => createRegistry({ spaces: home, groups, menus: [withPresets(extra)] })).toThrow(error);
  });

  describe('PlatformProvider checks the axis ids against equipmentAxes', () => {
    afterEach(cleanup);
    const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];
    it('refuses the reserved customGroup axis before accepting app-injected axes', () => {
      expect(() => mountWith([{ ...axes[0], id: 'customGroup' }], '/a')).toThrow(/customGroup.*reserved/);
    });
    const mountWith = (equipmentAxes: typeof axes, url: string) => {
      window.history.replaceState(null, '', url);
      const registry = createRegistry({ spaces: home, groups, menus: [withPresets({})] });
      const session = testSession(['platform:view']);
      return render(createElement(I18nProvider, null, createElement(PlatformProvider, { registry, equipmentAxes, adapter: testAdapter({ session: () => session }), children: null })));
    };
    it('throws naming the menu and the axis when a preset lists an axis the app does not declare', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => mountWith(axes, '/a')).toThrow(/Menu "a" condition preset "b" names axis "team"/);
      vi.restoreAllMocks();
    });
    it('renders when every preset axis is declared', () => {
      expect(() => mountWith([...axes, { id: 'team', label: { ko: 'Team', en: 'Team' }, membershipHistory: false }], '/a')).not.toThrow();
    });
  });
});

describe('menu additionalPermissions (AND with the primary permission)', () => {
  const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: spaceId('mars') };
  const modMenu = (over: Partial<ModuleMenuEntry> = {}): ModuleMenuEntry => ({
    id: 'fx-home', module: 'fx', group: 'fx:main', permission: 'fx:view', label: { ko: 'f', en: 'f' }, description: { ko: '', en: '' }, path: '/fx', icon: House,
    requiresScope: false, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true,
    moduleScreen: () => null, ...over,
  });
  const gated = (additionalPermissions: readonly unknown[]) => createRegistry({ spaces, groups, menus: [{ ...catalog, additionalPermissions: additionalPermissions as never }] });

  it('accepts a declared and a kernel grant', () => {
    expect(() => gated(['features:access'])).not.toThrow();
  });
  it.each([
    ['an empty list', [], /non-empty/],
    ['the primary repeated', ['metrics:view'], /listed twice/],
    ['a duplicate entry', ['features:access', 'features:access'], /listed twice/],
    ['an unknown grant', ['nobody:view'], /not a platform permission/],
    ['a malformed grant', ['features access'], /not a platform permission/],
    ['the retired grant', ['feedbackops:access'], /not a platform permission/],
  ])('rejects %s', (_name, extra, message) => {
    expect(() => gated(extra)).toThrow(message);
  });
  it('rejects any list on a module menu and keeps the module namespace check', () => {
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu({ additionalPermissions: ['features:access'] })] })).toThrow(/cannot declare additionalPermissions/);
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu({ permission: 'other:view' })] })).toThrow(/needs the "fx:" prefix/);
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu()] })).not.toThrow();
  });
  it('menuPermissions lists the primary first, then the extras; a module menu is its single permission', () => {
    expect(menuPermissions({ ...catalog, additionalPermissions: ['features:access'] })).toEqual(['metrics:view', 'features:access']);
    expect(menuPermissions(modMenu())).toEqual(['fx:view']);
  });
  it('rejects the retired kernel permission literal', () => {
    expect(KERNEL_PERMISSIONS).toContain('features:access');
    expect(KERNEL_PERMISSIONS as readonly string[]).not.toContain('feedbackops:access');
    expect(() => createRegistry({ spaces: [{ ...analyticsSpace, permission: 'feedbackops:access' as never }], groups, menus: [catalog] })).toThrow(/not a platform permission/);
  });
});

describe('navTree declaration (#1448)', () => {
  const treeMenu = catalog as PlatformMenuEntry;
  const navTree: NonNullable<PlatformMenuEntry['navTree']> = { label: { ko: '항목', en: 'Items' }, Source: () => null };
  it('accepts a stable Source declaration without changing JSON metadata', () => {
    expect(createRegistry({ spaces, groups, menus: [{ ...treeMenu, navTree }] }).menuById('catalog').navTree).toBe(navTree);
  });
  it.each([
    { navHidden: true },
    { navViews: [] },
    { navTree: { ...navTree, label: { ko: ' ', en: 'Items' } } },
    { navTree: { ...navTree, label: { ko: '항목', en: '' } } },
  ])('rejects incompatible or blank navTree declarations: %j', extra => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...treeMenu, navTree, ...extra }] })).toThrow(/navTree/);
  });
  it('rejects more than one tree per group', () => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...treeMenu, navTree }, menu('second', '/second', { navTree })] })).toThrow(/navTree/);
  });
});

describe('menu linkTargets (06 §22, ADR-0158, #1903)', () => {
  const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'M' }, icon: House, space: spaceId('mars') };
  const modMenu = (over: Partial<ModuleMenuEntry> = {}): ModuleMenuEntry => ({
    id: 'fx:home', module: 'fx', group: 'fx:main', permission: 'fx:view', label: { ko: 'f', en: 'f' }, description: { ko: '', en: '' }, path: '/fx', icon: House,
    requiresScope: false, context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true,
    moduleScreen: () => null, ...over,
  });
  const linking = (linkTargets: unknown, others: MenuEntry[] = [], options: { linkTargetCheck?: 'enforce' | 'report' } = {}) =>
    createRegistry({ spaces, groups: [...groups, modGroup], menus: [{ ...catalog, linkTargets: linkTargets as never }, modMenu(), ...others], ...options });

  it('checks nothing and reports nothing when no menu declares linkTargets', () => {
    expect(createRegistry({ spaces, groups, menus: [catalog] }).missingLinkTargets).toEqual([]);
  });
  it('accepts registered targets, including a module menu id with ":"', () => {
    const registry = linking({ required: ['fx:home'], optional: ['detail'] }, [menu('detail', '/metrics/:id', { navHidden: true })]);
    expect(registry.missingLinkTargets).toEqual([]);
  });
  it('rejects an unregistered required target and names the report option', () => {
    expect(() => linking({ required: ['nowhere'] })).toThrow(RegistryError);
    expect(() => linking({ required: ['nowhere'] })).toThrow(/linkTargetCheck: 'report'/);
  });
  it('lists an unregistered optional target without rejecting', () => {
    expect(linking({ optional: ['nowhere'] }).missingLinkTargets).toEqual([{ menuId: 'catalog', target: 'nowhere', level: 'optional' }]);
  });
  it("with linkTargetCheck: 'report' lists required and optional targets instead of rejecting", () => {
    expect(linking({ required: ['gone'], optional: ['nowhere'] }, [], { linkTargetCheck: 'report' }).missingLinkTargets).toEqual([
      { menuId: 'catalog', target: 'gone', level: 'required' },
      { menuId: 'catalog', target: 'nowhere', level: 'optional' },
    ]);
  });
  it.each([
    ['a non-object declaration', 'detail', /linkTargets must be an object/],
    ['a list that is not an array', { optional: 'detail' }, /linkTargets\.optional must be a list/],
    ['an empty id', { optional: [''] }, /must be a menu id/],
    ['an id with whitespace', { optional: ['a b'] }, /must be a menu id/],
    ['an id with /', { required: ['a/b'] }, /must be a menu id/],
    ['an id with ?', { optional: ['a?b'] }, /must be a menu id/],
    ['a duplicate in one list', { optional: ['detail', 'detail'] }, /listed twice/],
    ['the same id in both lists', { required: ['fx:home'], optional: ['fx:home'] }, /both required and optional/],
  ])('rejects %s', (_name, linkTargets, message) => {
    expect(() => linking(linkTargets)).toThrow(message);
    expect(() => linking(linkTargets, [], { linkTargetCheck: 'report' })).toThrow(message);
  });
  it('rejects linkTargets on a module menu; a module menu may still be a target', () => {
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, modMenu({ linkTargets: { optional: ['catalog'] } } as never)] })).toThrow(/cannot declare linkTargets/);
  });
  it('rejects an unknown linkTargetCheck value', () => {
    expect(() => linking({ optional: ['fx:home'] }, [], { linkTargetCheck: 'off' as never })).toThrow(/linkTargetCheck/);
  });
});

describe('inbound object declarations (#1930)', () => {
  const build = (extra: Record<string, unknown>, path = '/objects/:id') => createRegistry({ spaces, groups, menus: [catalog, menu('object', path, { pageKeys: ['object', 'returnTo'], ...extra })] });
  it.each([
    ['not an object', 'equipment'], ['null', null], ['array', []],
    ['invalid kind', { 'bad-kind': { param: 'id' } }], ['both selectors', { equipment: { param: 'id', pageKey: 'object' } }],
    ['no selector', { equipment: {} }], ['nonobject selector', { equipment: true }],
    ['unknown field', { equipment: { param: 'id', other: true } }], ['missing param', { equipment: { param: 'missing' } }],
    ['a global name not in the route', { equipment: { param: 'scopeId' } }],
  ])('rejects opensObject %s with RegistryError', (_name, opensObject) => {
    expect(() => build({ opensObject })).toThrow(RegistryError);
  });
  // A path without params, where `pageKey: 'object'` is valid: each case fails on its own page-key rule only.
  it('accepts a declared single-value page key on a path without params', () => {
    expect(() => build({ opensObject: { equipment: { pageKey: 'object' } } }, '/objects')).not.toThrow();
  });
  it.each([
    // A global key cannot be a declared page key (createRegistry rejects the collision), so it fails as undeclared.
    ['an undeclared page key', 'missing'], ['a global key', 'selectedEquipmentIds'], ['returnTo', 'returnTo'],
  ])('rejects opensObject on %s with RegistryError', (_name, pageKey) => {
    expect(() => build({ opensObject: { equipment: { pageKey } } }, '/objects')).toThrow(RegistryError);
  });
  it('rejects additional unfilled path params for either selector', () => {
    expect(() => build({ opensObject: { equipment: { param: 'id' } } }, '/objects/:id/:other')).toThrow(RegistryError);
    expect(() => build({ opensObject: { equipment: { pageKey: 'object' } } })).toThrow(RegistryError);
  });
  it.each(['repeatedPageKeys', 'hiddenPageKeys'])('rejects a %s destination key', field => {
    expect(() => build({ [field]: ['object'], opensObject: { equipment: { pageKey: 'object' } } }, '/objects')).toThrow(RegistryError);
  });
  it('rejects a carry-set destination key', () => {
    expect(() => createRegistry({ spaces, groups, carrySets: [{ id: carrySetId('objects'), pageKeys: ['object'] }], menus: [catalog, menu('object', '/objects', { pageKeys: ['object'], carrySet: carrySetId('objects'), opensObject: { equipment: { pageKey: 'object' } } })] })).toThrow(RegistryError);
  });
  it.each([
    null, [], 'equipment', { 'bad-kind': true }, { equipment: true }, { equipment: false },
    { equipment: { param: 'missing' } }, { equipment: { pageKey: 'object' } }, { equipment: { param: 'id', other: true } },
  ])('rejects malformed or unresolved subjectLinks %j', subjectLinks => {
    expect(() => build({ subjectLinks })).toThrow(RegistryError);
  });
  it('accepts optional source declarations independently of destination declarations', () => {
    expect(() => build({ subjectLinks: { equipment: { param: 'id' } } })).not.toThrow();
    expect(() => build({ subjectPageKeys: { equipment: 'object' }, subjectLinks: { equipment: true } })).not.toThrow();
  });
  it.each(['opensObject', 'subjectLinks'])('rejects %s even when empty on a module menu', field => {
    const modGroup: GroupDef = { id: 'fx:main', module: 'fx', label: { ko: '모', en: 'Module' }, icon: House, space: spaceId('mars') };
    const mod = { ...menu('fx:home', '/fx'), group: 'fx:main', permission: 'fx:view', module: 'fx', primary: true, moduleScreen: () => null, [field]: {} } as ModuleMenuEntry;
    expect(() => createRegistry({ spaces, groups: [...groups, modGroup], menus: [catalog, mod] })).toThrow(RegistryError);
  });
  it('indexes destinations once, in Registry order, with no rescan on lookup', () => {
    const registry = createRegistry({ spaces, groups, menus: [catalog, menu('path', '/objects/:id', { opensObject: { equipment: { param: 'id' } } }), menu('page', '/page', { pageKeys: ['object'], opensObject: { equipment: { pageKey: 'object' } } })] });
    const first = registry.objectDestinations('equipment');
    expect(first.map(m => m.id)).toEqual(['path', 'page']);
    const scan = vi.spyOn(registry.menus, 'filter');
    expect(registry.objectDestinations('equipment')).toBe(first);
    expect(registry.objectDestinations('unknown')).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
    scan.mockRestore();
  });
});

describe('pageConditions declarations (#2337)', () => {
  const label = { ko: '조건', en: 'Condition' };
  const category = { id: 'choice', label, kind: { type: 'select' as const, key: 'choice', options: { static: [{ value: 'a', label }] } } };
  const entry = (): PlatformMenuEntry => ({ ...catalog, pageType: 'analysis', query: { mode: 'live' }, pageKeys: ['choice'], pageConditions: { categories: [category] } }) as PlatformMenuEntry;
  it('rejects workflow page conditions (#2339)', () => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...entry(), pageType: 'workflow' }] })).toThrow(/pageType/);
  });
  it.each([
    ['undeclared key', { pageKeys: [] }, /declared page key/],
    ['single key repeated', { repeatedPageKeys: ['choice'] }, /single-valued/],
    ['management', { pageType: 'management' }, /pageType/],
    ['catalog', { pageType: 'catalog' }, /pageType/],
    ['duplicate category', { pageConditions: { categories: [category, category] } }, /duplicate category/],
    ['bad id', { pageConditions: { categories: [{ ...category, id: 'bad-id' }] } }, /identifier/],
    ['blank ko', { pageConditions: { categories: [{ ...category, label: { ko: ' ', en: 'Name' } }] } }, /nonempty/],
    ['blank en', { pageConditions: { categories: [{ ...category, label: { ko: '이름', en: ' ' } }] } }, /nonempty/],
    ['shared key', { pageConditions: { categories: [category, { ...category, id: 'other' }] } }, /exactly one category/],
    ['drill key', { drill: { levels: [{ key: 'choice', label }] }, contextResetKeys: ['choice'] }, /drill/],
    ['foreign endpoint', { pageConditions: { categories: [{ ...category, kind: { type: 'select', key: 'choice', options: { endpoint: 'foreign' } } }] } }, /owned endpoint/],
    ['multi not repeated', { pageConditions: { categories: [{ ...category, kind: { type: 'multi', key: 'choice', options: { static: [] } } }] } }, /repeatedPageKeys/],
    ['tree not repeated', { pageConditions: { categories: [{ ...category, kind: { type: 'tree', key: 'choice', source: 'owned', value: 'leaves' } }] } }, /repeatedPageKeys/],
    ['grouped not repeated', { pageConditions: { categories: [{ ...category, kind: { type: 'groupedChecks', source: 'owned', lists: [{ id: 'one', key: 'choice', label }] } }] } }, /repeatedPageKeys/],
    ['search key repeated', { repeatedPageKeys: ['choice'], pageConditions: { categories: [{ ...category, kind: { type: 'search', key: 'choice' } }] } }, /single-valued/],
    ['range key repeated', { repeatedPageKeys: ['choice'], pageConditions: { categories: [{ ...category, kind: { type: 'range', key: 'choice' } }] } }, /single-valued/],
    ['date key repeated', { repeatedPageKeys: ['choice'], pageKeys: ['choice', 'end'], pageConditions: { categories: [{ ...category, kind: { type: 'date', from: 'choice', to: 'end' } }] } }, /single-valued/],
    ['disabled blank reason', { pageConditions: { categories: [{ ...category, disabled: { reason: { ko: '', en: 'Reason' } } }] } }, /disabled reason.*nonempty/],
    ['required on live menu', { pageConditions: { categories: [{ ...category, required: true }] } }, /required categories.*apply/],
    ['invalid required', { pageConditions: { categories: [{ ...category, required: false }] } }, /required must be true/],
    ['absent on a single-valued kind', { pageConditions: { categories: [{ ...category, kind: { type: 'range', key: 'choice', absent: 'all' } }] } }, /absent must be 'all' on multi or groupedChecks/],
    ['required with absent all', { repeatedPageKeys: ['choice'], query: { mode: 'apply' }, pageConditions: { categories: [{ ...category, required: true, kind: { type: 'multi', key: 'choice', options: { static: [{ value: 'one', label }] }, absent: 'all' } }] } }, /both required and absent/],
    ['absent other than all', { repeatedPageKeys: ['choice'], pageConditions: { categories: [{ ...category, kind: { type: 'multi', key: 'choice', options: { static: [{ value: 'one', label }] }, absent: 'none' } }] } }, /absent must be 'all'/],
    ['unknown kind', { pageConditions: { categories: [{ ...category, kind: { type: 'unknown' } }] } }, /unknown kind/],
    ['reversed range bounds', { pageConditions: { categories: [{ ...category, kind: { type: 'range', key: 'choice', min: 2, max: 1 } }] } }, /min must not exceed max/],
    ['infinite range bounds', { pageConditions: { categories: [{ ...category, kind: { type: 'range', key: 'choice', min: Infinity } }] } }, /min must be finite/],
    ['invalid range step', { pageConditions: { categories: [{ ...category, kind: { type: 'range', key: 'choice', step: 0 } }] } }, /step must be positive/],
    ['blank range unit', { pageConditions: { categories: [{ ...category, kind: { type: 'range', key: 'choice', unit: { ko: ' ', en: 'Unit' } } }] } }, /unit.*nonempty/],
    ['empty grouped lists', { pageConditions: { categories: [{ ...category, kind: { type: 'groupedChecks', source: 'owned', lists: [] } }] } }, /lists must be nonempty/],
    ['duplicate grouped list id', { repeatedPageKeys: ['choice'], pageConditions: { categories: [{ ...category, kind: { type: 'groupedChecks', source: 'owned', lists: [{ id: 'one', key: 'choice', label }, { id: 'one', key: 'choice', label }] } }] } }, /list ids must be unique/],
    ['blank grouped label', { repeatedPageKeys: ['choice'], pageConditions: { categories: [{ ...category, kind: { type: 'groupedChecks', source: 'owned', lists: [{ id: 'one', key: 'choice', label: { ko: '', en: 'Name' } }] } }] } }, /list.*nonempty/],
    ['invalid tree mode', { repeatedPageKeys: ['choice'], pageConditions: { categories: [{ ...category, kind: { type: 'tree', key: 'choice', source: 'owned', value: 'unknown' } }] } }, /tree value/],
    ['duplicate static value', { pageConditions: { categories: [{ ...category, kind: { ...category.kind, options: { static: [{ value: 'a', label }, { value: 'a', label }] } } }] } }, /values must be nonempty and unique/],
    ['blank static label', { pageConditions: { categories: [{ ...category, kind: { ...category.kind, options: { static: [{ value: 'a', label: { ko: '', en: 'A' } }] } } }] } }, /static option.*nonempty/],
    ['invalid default', { pageConditions: { categories: [{ ...category, kind: { ...category.kind, default: 'missing' } }] } }, /default must name/],
    ['two option sources', { pageConditions: { categories: [{ ...category, kind: { ...category.kind, options: { static: [], endpoint: 'owned' } } }] } }, /exactly one/],
    ['missing option source', { pageConditions: { categories: [{ ...category, kind: { ...category.kind, options: {} } }] } }, /exactly one/],
    ['duplicate section id', { pageConditions: { categories: [category], sections: [{ id: 'section', label, categories: [] }, { id: 'section', label, categories: [] }] } }, /section ids/],
    ['blank section label', { pageConditions: { categories: [category], sections: [{ id: 'section', label: { ko: '', en: 'A' }, categories: [] }] } }, /section.*nonempty/],
    ['category in two sections', { pageConditions: { categories: [category], sections: [{ id: 'first', label, categories: ['choice'] }, { id: 'second', label, categories: ['choice'] }] } }, /multiple sections/],
    ['section unknown category', { pageConditions: { categories: [category], sections: [{ id: 'section', label, categories: ['missing'] }] } }, /unknown category/],
  ])('rejects %s', (_name, patch, message) => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...entry(), ...patch } as unknown as PlatformMenuEntry], endpoints: [{ id: 'owned', menuId: 'catalog' }] })).toThrow(message);
  });
  it('accepts owned endpoint sources and rejects an endpoint owned by another menu', () => {
    const dynamic = { ...entry(), pageConditions: { categories: [{ ...category, kind: { type: 'select' as const, key: 'choice', options: { endpoint: 'source' } } }] } };
    expect(() => createRegistry({ spaces, groups, menus: [dynamic], endpoints: [{ id: 'source', menuId: 'catalog' }] })).not.toThrow();
    expect(() => createRegistry({ spaces, groups, menus: [dynamic], endpoints: [{ id: 'source', menuId: 'other' }] })).toThrow(/owned endpoint/);
    expect(() => createRegistry({ spaces, groups, menus: [dynamic], endpoints: [{ id: 'source', menuId: 'catalog' }, { id: 'source', menuId: 'catalog' }] })).toThrow(/uniquely owned endpoint/);
  });
  it('refuses a carry-set key', () => {
    expect(() => createRegistry({ spaces, groups, menus: [{ ...entry(), carrySet: carrySetId('set') }], carrySets: [{ id: carrySetId('set'), pageKeys: ['choice'] }] })).toThrow(/carry set/);
  });
  it('merges required keys without mutating the manifest', () => {
    const input = { ...entry(), context: { ...none, time: 'apply' as const }, query: { mode: 'apply' as const }, pageConditions: { categories: [{ ...category, required: true as const }] } };
    const output = createRegistry({ spaces, groups, menus: [input] }).menuById('catalog');
    expect(output.query).toEqual({ mode: 'apply', required: { page: [{ key: 'choice', label }] } });
    expect(input.query).toEqual({ mode: 'apply' });
  });
  it('does not add fields to a menu without a declaration', () => {
    const output = createRegistry({ spaces, groups, menus: [catalog] }).menuById('catalog');
    expect(JSON.stringify(output)).toBe(JSON.stringify({ ...catalog, path: '/mars/catalog', aliases: ['/metrics'] }));
  });
});


describe('panel registration (#2433)', () => {
  const panel = { id: 'summary', title: { ko: '요약', en: 'Summary' }, queryInputs: { page: [{ key: 'level', required: true }] }, displayInputs: { page: [{ key: 'focus' }] }, outputs: [{ key: 'level', action: 'drill' }], grain: 'dailyStat', endpoints: [{ id: 'catalog.summary', menuId: 'catalog', permission: menuPermission('data:read') }] };
  const entry = { ...catalog, pageKeys: ['level', 'focus'], contextResetKeys: ['level'], drill: { levels: [{ key: 'level', label: { ko: '단계', en: 'Level' } }] } };
  const build = (panels: unknown = [panel]) => createRegistry({ spaces, groups, menus: [{ ...entry, panels } as PlatformMenuEntry] });
  it('keeps undeclared menus and URLs identical', () => {
    const registry = createRegistry({ spaces, groups, menus: [catalog] });
    expect(registry.menuById('catalog')).toEqual({ ...catalog, path: '/mars/catalog', aliases: ['/metrics'] });
    expect(registry.canonicalHref('/mars/catalog?v=1')).toBe('/mars/catalog?v=1');
    expect(registry.panels('catalog')).toEqual([]);
    expect(registry.panelsReading('level')).toEqual([]);
  });
  it.each([
    [{ queryInputs: { page: [{ key: 'unknown' }] } }, /page key.*unknown/],
    [{ queryInputs: { context: ['from'] } }, /context key.*from/],
    [{ displayInputs: { page: [{ key: 'level' }] } }, /query.*display/],
    [{ queryInputs: { context: ['time'] }, displayInputs: { context: ['time'] } }, /query.*display/],
    [{ outputs: [{ key: 'unknown', action: 'drill' }] }, /output.*page key/],
    [{ outputs: [{ key: 'from', action: 'date' }] }, /output.*page key/],
    [{ title: { ko: '', en: 'Summary' } }, /title/],
    [{ title: { ko: '요약', en: ' ' } }, /title/],
    [{ availability: { requires: [{ anyOf: ['derived'] }], disabledReason: { ko: '', en: 'Choose' } } }, /disabledReason/],
    [{ availability: { requires: [{ anyOf: [] }], disabledReason: { ko: '선택', en: 'Choose' } } }, /availability/],
    [{ grain: 'daily-stat' }, /grain/],
    [{ display: [{ key: 'selection' }] }, /display input "selection" must not be a Context key/],
    [{ display: [{ key: 'scopeId' }] }, /display input "scopeId" must not be a Context key/],
    [{ endpoints: [{ id: 'other.query', menuId: 'other', permission: menuPermission('data:read') }] }, /endpoint.*owned/],
  ])('rejects malformed panel %j', (patch, message) => {
    expect(() => build([{ ...panel, ...patch }])).toThrow(message);
  });
  it('rejects duplicate ids', () => expect(() => build([panel, panel])).toThrow(/duplicate.*summary/));
  it('indexes readers and writers with menu identity, permissions and derived reason', () => {
    const registry = build();
    const [registered] = registry.panels('catalog');
    expect(registered).toMatchObject({ id: 'summary', menuId: 'catalog', permissions: [menuPermission('metrics:view'), menuPermission('data:read')] });
    expect(registered.disabledReason({})).toEqual({ ko: '단계', en: 'Level' });
    expect(registered.disabledReason({ level: 'a' })).toBeUndefined();
    expect(registry.panelsReading('level')).toEqual([registered]);
    expect(registry.panelsReading('focus')).toEqual([registered]);
    expect(registry.panelsWriting('level')).toEqual([registered]);
    expect(registry.panelsWriting('focus')).toEqual([]);
  });
  it('derives query labels and falls back to key names', () => {
    const registry = createRegistry({ spaces, groups, menus: [{ ...catalog, pageKeys: ['focus', 'other'], context: { ...none, time: 'apply' }, query: { mode: 'apply', required: { page: [{ key: 'focus', label: { ko: '초점', en: 'Focus' } }] } }, panels: [{ ...panel, queryInputs: { page: [{ key: 'focus', required: true }, { key: 'other', required: true }] }, displayInputs: {}, outputs: [] }] }] });
    expect(registry.panels('catalog')[0].disabledReason({})).toEqual({ ko: '초점, other', en: 'Focus, other' });
  });
  it('never reads inherited properties for page keys named like object members', () => {
    const odd = { ...panel, queryInputs: { page: [{ key: 'constructor', required: true }] }, displayInputs: {}, outputs: [] };
    const registry = createRegistry({ spaces, groups, menus: [{ ...catalog, pageKeys: ['constructor'], panels: [odd] }] });
    expect(registry.panels('catalog')[0].disabledReason({})).toEqual({ ko: 'constructor', en: 'constructor' });
    expect(disabledReason(odd, {}, {})).toEqual({ ko: 'constructor', en: 'constructor' });
    expect(projectQueryInputs(odd, {})).toEqual({});
    expect(projectQueryInputs(odd, { constructor: 'a' })).toEqual({ constructor: 'a' });
  });
  it('allows capability names, derived override keys and opaque S2 metadata; deduplicates permissions', () => {
    const registry = build([{ ...panel, queryInputs: { context: ['scopeId', 'time'] }, endpoints: [{ ...panel.endpoints[0], permission: catalog.permission }], availability: { requires: [{ anyOf: ['step4'] }], disabledReason: { ko: '4단계', en: 'Step 4' } }, pieces: ['opaque'], version: { future: true } }]);
    expect(registry.panelsReading('time')).toHaveLength(1);
    expect(registry.panels('catalog')[0].permissions).toEqual([catalog.permission]);
    expect(registry.panels('catalog')[0].disabledReason({})).toEqual({ ko: '4단계', en: 'Step 4' });
    expect(registry.panels('catalog')[0].disabledReason({ step4: true })).toBeUndefined();
  });
});

describe('analysis selection registration (#2732)', () => {
  const key = 'choice';
  const title = { ko: '선택', en: 'Choice' };
  const selection = { shape: 'range', dimension: 'time' };
  const output = { key, action: 'brush', selection };
  const writer = { id: 'source', title, queryInputs: {}, displayInputs: {}, grain: 'daily', endpoints: [], outputs: [output] };
  const page = [{ key, selection: 'filter' }];
  const reader = { ...writer, id: 'receiver', outputs: [], queryInputs: { page } };
  const other = { ...writer, id: 'other' };
  const carrySet = { id: carrySetId('shared'), pageKeys: [key] };
  const build = (panels: unknown, extra = {}) => createRegistry({ spaces, groups, carrySets: [carrySet], menus: [{
    ...catalog, pageKeys: [key], contextResetKeys: [key], panels, ...extra,
  } as MenuEntry] });

  it.each([
    ['unknown shape', { shape: 'rows' }, /shape/],
    ['empty dimension', { dimension: '' }, /dimension/],
    ['invalid dimension', { dimension: 'Time-range' }, /dimension/],
    ['invalid object kind', { objectKind: 'equipment-id' }, /objectKind/],
    ['non-string object kind', { objectKind: ['equipment'] }, /objectKind/],
    ['undeclared drill level', { drillLevel: 'unknown' }, /drillLevel.*unknown/],
    ['non-string dimension', { dimension: 123 }, /dimension/],
    ['set on a single key', { shape: 'set' }, /repeatedPageKeys/],
  ])('rejects %s', (_name, patch, reason) => {
    expect(() => build([{ ...writer, outputs: [{ ...output, selection: { ...selection, ...patch } }] }])).toThrow(reason);
  });

  it('accepts a valid object kind without a destination', () => {
    const objectKind = 'futureEquipment2';
    const registry = build([{ ...writer, outputs: [{ ...output, selection: { ...selection, objectKind } }] }]);
    expect(registry.panels('catalog')[0]?.outputs[0]?.selection?.objectKind).toBe(objectKind);
    expect(registry.objectDestinations(objectKind)).toEqual([]);
  });

  it('uses a shared string-only identifier shape for object kinds', () => {
    expect([shapes.isObjectKindShape('futureEquipment2'), shapes.isObjectKindShape('equipment-id'),
      shapes.isObjectKindShape(['equipment'])]).toEqual([true, false, false]);
  });

  it.each([
    ['range on a repeated key', [writer], { repeatedPageKeys: [key] }, /repeatedPageKeys/],
    ['writers with different shapes', [writer, { ...other, outputs: [{ ...output, selection: { ...selection, shape: 'set' } }] }], {}, /agree/],
    ['writers with different dimensions', [writer, { ...other, outputs: [{ ...output, selection: { ...selection, dimension: 'equipment' } }] }], {}, /agree/],
    ['a plain writer', [{ ...other, outputs: [{ key, action: 'other' }] }, writer], {}, /every output/],
    ['a reader without a writer', [reader], {}, /matching output/],
    ['a reader of its own output', [{ ...writer, queryInputs: { page } }], {}, /own output/],
    ['a plain query input', [writer, { ...reader, queryInputs: { page: [{ key }] } }], {}, /must declare selection/],
    ['a plain display input', [writer, { ...reader, queryInputs: {}, displayInputs: { page: [{ key }] } }], {}, /must declare selection/],
    ['a plain reader of its own output', [{ ...writer, queryInputs: { page: [{ key }] } }], {}, /own output/],
    ['an unknown use', [writer, { ...reader, queryInputs: { page: [{ key, selection: 'ignore' }] } }], {}, /filter or highlight/],
    ['highlight in query inputs', [writer, { ...reader, queryInputs: { page: [{ key, selection: 'highlight' }] } }], {}, /displayInputs/],
    ['a key without Context reset', [writer], { contextResetKeys: [] }, /contextResetKeys/],
    ['a hidden page key', [writer], { hiddenPageKeys: [key] }, /hiddenPageKeys/],
    ['a carry set page key', [writer], { carrySet: carrySet.id }, /carry set/],
    ['a drill level', [writer], { drill: { levels: [{ key, label: title }] } }, /drill level/],
    ['a page condition', [writer], { pageType: 'analysis', query: { mode: 'live' }, pageConditions: { categories: [{ id: key, label: title, kind: { type: 'search', key } }] } }, /pageConditions/],
    ['a condition preset', [writer], { context: { ...none, condition: 'apply' }, conditionPreset: { key, default: 'a' }, conditionPresets: ['a', 'b'].map(id => ({ id, label: title, axes: ['maker'] })) }, /conditionPreset/],
    ['a navigation preset', [writer], { navViews: [{ id: 'view', label: title, page: { [key]: 'a' } }] }, /navView/],
    ['a subject key', [writer], { subjectPageKeys: { equipment: key } }, /subjectPageKeys/],
    ['returnTo', [{ ...writer, outputs: [{ ...output, key: 'returnTo' }] }], { pageKeys: ['returnTo'], contextResetKeys: ['returnTo'] }, /selection key "returnTo"/],
  ])('rejects %s', (_name, panels, extra, reason) => {
    expect(() => build(panels, extra)).toThrow(reason);
  });

  it.each([
    { ko: '기간', en: 'Window' },
    { ko: '시간', en: 'Period' },
  ])('rejects conflicting analysis selection labels %j', label => {
    const labeled = { ...output, selection: { ...selection, label: { ko: '기간', en: 'Period' } } };
    expect(() => build([
      writer,
      { ...other, outputs: [labeled] },
      { ...writer, id: 'third', outputs: [{ ...labeled, selection: { ...selection, label } }] },
    ])).toThrow(/agree on label/);
  });

  const drillKeys = ['step', 'unit'];
  const drilled = { pageKeys: [key, ...drillKeys], contextResetKeys: [key, ...drillKeys], drill: { levels: drillKeys.map(k => ({ key: k, label: { ko: k, en: k } })) } };
  // The channel used the first writer's drill level and object kind and adopted a disagreeing writer silently (#2870 Q4).
  it.each([
    ['drill level', { drillLevel: 'step' }, { drillLevel: 'unit' }],
    ['drill level on one writer only', { drillLevel: 'step' }, {}],
    ['object kind', { objectKind: 'equipment' }, { objectKind: 'module' }],
  ])('rejects writers that disagree on %s', (_name, first, second) => {
    expect(() => build([
      { ...writer, outputs: [{ ...output, selection: { ...selection, ...first } }] },
      { ...other, outputs: [{ ...output, selection: { ...selection, ...second } }] },
    ], drilled)).toThrow(/agree on drillLevel and objectKind/);
  });

  it('accepts writers that agree on drill level and object kind', () => {
    const shared = { ...output, selection: { ...selection, drillLevel: 'step', objectKind: 'equipment' } };
    expect(() => build([{ ...writer, outputs: [shared] }, { ...other, outputs: [shared] }], drilled)).not.toThrow();
  });
});

describe('inbound analysis selection registration (#2735)', () => {
  const inbound = { key: 'choice', dimension: 'time', shape: 'range', label: { ko: '기간', en: 'Period' } } as const;
  const panel: PanelDeclaration = { id: 'timeline', title: inbound.label, grain: 'daily', endpoints: [], queryInputs: {}, displayInputs: {}, outputs: [] };
  const writer = { ...panel, outputs: [{ key: inbound.key, action: 'brush', selection: inbound }] };
  const target = { ...catalog, pageKeys: [inbound.key], contextResetKeys: [inbound.key], analysisSelectionInbound: [inbound] };
  const build = (entry: MenuEntry = target) => createRegistry({
    spaces, groups: entry.module ? [{ ...groups[0], id: 'fixture:main', module: 'fixture' }] : groups, menus: [entry],
  });

  it('indexes an inbound-only channel and accepts a panel that reads it', () => {
    const registry = build({ ...target, panels: [{ ...panel, queryInputs: { page: [{ key: inbound.key, selection: 'filter' }] } }] });
    expect(menuAnalysisSelections(registry.menuById('catalog')).get(inbound.key)).toMatchObject({
      inbound: true, writers: [], readers: [{ panelId: panel.id, use: 'filter' }],
    });
  });

  it('joins an inbound declaration with an agreeing writer', () => {
    const registry = build({ ...target, panels: [writer] });
    expect(menuAnalysisSelections(registry.menuById('catalog')).get(inbound.key)).toMatchObject({
      inbound: true, writers: [{ panelId: panel.id }], label: inbound.label,
    });
  });

  it.each<[string, Partial<MenuEntry>, RegExp]>([
    ['an undeclared key on a menu without panels', { analysisSelectionInbound: [{ ...inbound, key: 'other' }] }, /must be in pageKeys/],
    ['a set on a singleton key', { analysisSelectionInbound: [{ ...inbound, shape: 'set' }] }, /repeatedPageKeys/],
    ['a range on a repeated key', { repeatedPageKeys: [inbound.key] }, /repeatedPageKeys/],
    ['a missing reset key', { contextResetKeys: [] }, /contextResetKeys/],
    ['a hidden key', { hiddenPageKeys: [inbound.key] }, /hiddenPageKeys/],
    ['an object selector', { opensObject: { equipment: { pageKey: inbound.key } } }, /opensObject pageKey/],
    ['an output used as an object selector', { analysisSelectionInbound: undefined, panels: [writer], opensObject: { equipment: { pageKey: inbound.key } } }, /opensObject pageKey/],
    ['a duplicate dimension', { pageKeys: [inbound.key, 'other'], contextResetKeys: [inbound.key, 'other'], analysisSelectionInbound: [inbound, { ...inbound, key: 'other' }] }, /duplicate inbound dimension/],
    ['a different writer dimension', { panels: [{ ...writer, outputs: [{ ...writer.outputs[0], selection: { ...inbound, dimension: 'equipment' } }] }] }, /agree on shape and dimension/],
    ['a different writer label', { panels: [{ ...writer, outputs: [{ ...writer.outputs[0], selection: { ...inbound, label: undefined } }] }] }, /agree on label/],
    ['an empty label', { analysisSelectionInbound: [{ ...inbound, label: { ko: ' ', en: 'Time' } }] }, /non-empty ko\/en/],
    ['an invalid dimension', { analysisSelectionInbound: [{ ...inbound, dimension: 'Time-window' }] }, /dimension must match/],
    ['an invalid shape', { analysisSelectionInbound: [{ ...inbound, shape: 'rows' as never }] }, /shape must be set or range/],
    ['a module menu', { module: 'fixture', group: 'fixture:main', permission: 'fixture:view', moduleScreen: () => null }, /cannot declare analysisSelectionInbound/],
  ])('rejects %s', (_name, extra, reason) => {
    expect(() => build({ ...target, ...extra } as MenuEntry)).toThrow(reason);
  });
});

describe('lent panel registration (#2490)', () => {
  const receiving = menuPermission('receiver:view');
  const owner = menuPermission('source:view');
  const endpointPermission = menuPermission('data:read');
  const shared = menuPermission('workspace:read');
  const endpoint = { id: 'source.summary', menuId: 'source', permission: endpointPermission, requiresScope: true, context: { time: 'apply' } } as const;
  const panel = {
    id: 'summary', title: { ko: '요약', en: 'Summary' }, grain: 'dailyStat',
    queryInputs: { context: ['scopeId', 'time'], page: [{ key: 'level', required: true }] },
    displayInputs: {}, outputs: [{ key: 'level', action: 'drill' }], endpoints: [endpoint],
  } as const;
  const binding = {
    source: 'source/summary',
    context: { scopeId: { kind: 'context', key: 'scopeId' }, time: { kind: 'context', key: 'time' } },
    page: { level: { kind: 'page', key: 'chosen' } },
  } as const;
  const build = (lentPanels: unknown = [binding], requiresScope = true, declaration: PanelDeclaration = panel) => createRegistry({
    spaces, groups, permissions: [receiving, owner, endpointPermission, shared],
    menus: [
      { ...catalog, permission: receiving, additionalPermissions: [shared], requiresScope, pageKeys: ['chosen'], lentPanels } as PlatformMenuEntry,
      menu('source', '/metrics/source', { label: { ko: '원본 메뉴', en: 'Source menu' }, permission: owner, additionalPermissions: [shared], pageKeys: ['level'], panels: [declaration] }),
    ],
  });
  const inputs = {
    context: { ...emptyGlobal, scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' },
    page: [['chosen', 'second']] as Pair[],
  };

  it('indexes the registered source and deduplicates a grant shared by the two menus', () => {
    const registry = build();
    const [lent] = registry.lentPanels('catalog');
    expect(lent.source).toBe(registry.panels('source')[0]);
    expect(lent.permissions).toEqual([receiving, shared, owner, endpointPermission]);
    expect(lent.verdict(testSession(lent.permissions), inputs)).toEqual({ allowed: true, reason: null });
    expect(registry.lentPanels('source')).toEqual([]);
  });

  it.each([receiving, owner, endpointPermission])('denies when the session lacks %s', absent => {
    const [lent] = build().lentPanels('catalog');
    const session = testSession([receiving, owner, endpointPermission, shared].filter(permission => permission !== absent));
    expect(lent.verdict(session, inputs)).toMatchObject({ allowed: false, reason: { kind: 'permission', text: { ko: expect.any(String), en: expect.any(String) } } });
  });

  it('names the lending menu and its declared panel title in the permission reason', () => {
    const registry = build();
    const [lent] = registry.lentPanels('catalog');
    expect(lent.verdict(testSession([receiving]), inputs)).toEqual({ allowed: false, reason: { kind: 'permission', text: {
      ko: `원본 메뉴의 ${panel.title.ko} 패널을 볼 권한이 없습니다.`,
      en: `You don’t have permission to view the ${panel.title.en} panel of Source menu.`,
    } } });
  });

  it('reports a missing required value separately from permission', () => {
    const [lent] = build().lentPanels('catalog');
    expect(lent.verdict(testSession(lent.permissions), { ...inputs, page: [] })).toMatchObject({
      allowed: false, reason: { kind: 'missing-input', text: { ko: expect.any(String), en: expect.any(String) } },
    });
  });

  it.each([
    [undefined, { ko: '패널에 필요한 입력을 확인하세요.', en: 'Check the panel’s required input.' }],
    [{ ko: '모듈', en: 'Module' }, { ko: '패널에 필요한 입력을 확인하세요 (모듈).', en: 'Check the panel’s required input (Module).' }],
  ])('reports a missing page input using its optional label %j', (label, text) => {
    const declaration = { ...panel, queryInputs: { ...panel.queryInputs, page: [{ key: 'level', required: true, label }] } };
    const [lent] = build([binding], true, declaration).lentPanels('catalog');
    expect(lent.verdict(testSession(lent.permissions), { ...inputs, page: [] })).toEqual({
      allowed: false, reason: { kind: 'missing-input', key: 'level', text },
    });
  });

  it('reports an absent source menu once as an optional target', () => {
    const registry = createRegistry({
      spaces, groups,
      menus: [{ ...catalog, pageKeys: ['chosen'], linkTargets: { optional: ['source'] }, lentPanels: [binding, { source: 'source/second' }] }],
    });
    expect(registry.missingLinkTargets).toEqual([{ menuId: 'catalog', target: 'source', level: 'optional' }]);
    expect(registry.lentPanels('catalog')).toEqual([]);
  });

  const buildWithoutSource = (lentPanels: unknown) => createRegistry({
    spaces, groups,
    menus: [{ ...catalog, pageKeys: ['chosen'], lentPanels } as PlatformMenuEntry],
  });

  it('C4 reports a missing target declared only by lending', () => {
    const registry = buildWithoutSource([binding, { source: 'source/second' }]);
    expect(registry.missingLinkTargets).toEqual([{ menuId: 'catalog', target: 'source', level: 'optional' }]);
    expect(registry.lentPanels('catalog')).toEqual([]);
  });

  it.each([
    ['an undeclared receiving page key', [{ ...binding, page: { level: { kind: 'page', key: 'typo' } } }], /undeclared receiving page key "typo"/],
    ['an unknown receiving Context key', [{ ...binding, page: { level: { kind: 'context', key: 'typo' } } }], /unknown receiving Context key "typo"/],
    ['an invalid receiving kind', [{ ...binding, page: { level: { kind: 'typo', key: 'chosen' } } }], /input binding kind must be context, page or value/],
    ['a non-value display binding', [{ ...binding, display: { label: { kind: 'page', key: 'chosen' } } }], /display input "label" must use a value binding/],
    ['a malformed source', [{ ...binding, source: 'source/summary/extra' }], /must identify a menu and panel/],
    ['a duplicate binding', [binding, binding], /has a duplicate binding/],
  ])('C4 rejects %s with the source omitted', (_, declarations, message) => {
    expect(() => buildWithoutSource(declarations)).toThrow(message);
  });

  it('opens without an optional display binding even if an older declaration marks it required', () => {
    const declaration = { ...panel, display: [{ key: 'label', required: true }] };
    const [lent] = build([binding], true, declaration).lentPanels('catalog');
    expect(lent.resolve(testSession(lent.permissions), inputs)).toMatchObject({ allowed: true, inputs: { display: {} } });
  });

  it.each([
    [{ ...binding, page: {} }, /required query input "level"/],
    [{ ...binding, context: { time: binding.context.time } }, /required query input "scopeId"/],
    [{ ...binding, context: { scopeId: binding.context.scopeId } }, /required query input "time"/],
    [{ ...binding, page: { level: { kind: 'page', key: 'unknown' } } }, /undeclared receiving page key "unknown"/],
    [{ ...binding, display: { unknown: { kind: 'value', key: 'label' } } }, /unknown source display input "unknown"/],
    [{ ...binding, source: 'source/other' }, /unknown source panel "source\/other"/],
    // A drill output is not an analysis selection, so a lent binding cannot write it (#2763).
    [{ ...binding, outputs: { level: { kind: 'page', key: 'chosen' } } }, /not an analysis selection output/],
  ])('rejects invalid binding %j', (declaration, message) => {
    expect(() => build([declaration])).toThrow(RegistryError);
    expect(() => build([declaration])).toThrow(message);
  });

  it('rejects a scoped source if the receiver does not require Scope', () => {
    expect(() => build([binding], false)).toThrow(RegistryError);
    expect(() => build([binding], false)).toThrow(/requiresScope: true/);
  });

  it('rejects a source endpoint that drops Scope on a scoped receiver, even if another endpoint keeps it', () => {
    const assemble = () => createRegistry({
      spaces, groups, permissions: [receiving, owner, endpointPermission],
      menus: [
        { ...catalog, permission: receiving, requiresScope: true, pageKeys: ['chosen'], lentPanels: [binding] },
        menu('source', '/metrics/source', {
          permission: owner, pageKeys: ['level'],
          panels: [{ ...panel, endpoints: [endpoint, { ...endpoint, id: 'source.unscoped', requiresScope: false }] }],
        }),
      ],
    });
    expect(assemble).toThrow(RegistryError);
    expect(assemble).toThrow(/source\.unscoped.*scopeId/);
  });
});

describe('chart fields registration (#2761)', () => {
  const label = { ko: '라벨', en: 'Label' };
  const fields = {
    time: { field: 'at', label },
    breakdowns: [{ id: 'equipment', label, dimension: 'equipmentId' }],
    measures: [{ id: 'runTime', label, unit: 'h', reaggregation: 'sum' }],
  };
  const build = (chartFields: unknown) => createRegistry({ spaces, groups, menus: [{ ...catalog, chartFields } as MenuEntry] });
  it('registers a valid declaration and leaves a menu without one as it is', () => {
    expect(() => build(fields)).not.toThrow();
    expect(() => build(undefined)).not.toThrow();
  });
  it.each([
    [{ ...fields, measures: [] }, /at least one measure/],
    [{ ...fields, breakdowns: [...fields.breakdowns, { id: 'runTime', label, dimension: 'x' }] }, /duplicate field "runTime"/],
    [{ ...fields, time: { field: 'equipment', label } }, /duplicate field "equipment"/],
    [{ ...fields, breakdowns: [{ id: 'a/b', label, dimension: 'x' }] }, /breakdown id/],
    [{ ...fields, breakdowns: [{ id: 'p\u0000', label, dimension: 'x' }] }, /breakdown id.*control characters/],
    [{ ...fields, breakdowns: [{ id: 'b', label, dimension: 'equipment-id' }] }, /dimension must match/],
    [{ ...fields, breakdowns: [{ id: 'b', label, dimension: 'd'.repeat(201) }] }, /at most 200/],
    [{ ...fields, measures: [{ ...fields.measures[0], unit: '' }] }, /unit/],
    [{ ...fields, measures: [{ ...fields.measures[0], reaggregation: 'avg' }] }, /reaggregation/],
    [{ ...fields, measures: [{ ...fields.measures[0], label: { ko: '', en: 'x' } }] }, /label/],
    [{ ...fields, measures: [{ ...fields.measures[0], permission: 'yield' }] }, /permission/],
    [{ ...fields, measures: [{ ...fields.measures[0], breakdowns: ['line'] }] }, /unknown breakdown "line"/],
  ])('rejects a malformed declaration %#', (chartFields, message) => {
    expect(() => build(chartFields)).toThrow(/Menu "catalog" chartFields/);
    expect(() => build(chartFields)).toThrow(message);
  });
});
