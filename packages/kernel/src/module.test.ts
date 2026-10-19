import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { ModuleManifest, ModuleScreenMeta, SpaceDef } from '@ap/contracts';
import { mountModule, type MountOptions } from './module';
import { createRegistry, RegistryError, type PlatformMenuEntry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const screen = (id: string, path: string, over: Partial<ModuleScreenMeta> = {}): ModuleScreenMeta => ({
  id, group: 'fx:main', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, permission: 'fx:view', requiresScope: false,
  context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over,
});
const manifest = (over: Partial<ModuleManifest> = {}): ModuleManifest => ({
  module: { id: 'fx', label: { ko: '모듈', en: 'Module' }, contract: 1, languages: ['ko'] },
  requires: ['query'], config: ['apiBase'], groups: [{ id: 'fx:main', label: { ko: '메인', en: 'Main' } }],
  screens: [screen('list', '', { primary: true }), screen('item', 'items/:id', { navHidden: true, parent: 'list' })], ...over,
});
const Screen = () => null;
const screens = { list: Screen, item: Screen };
const options = (over: Partial<MountOptions> = {}): MountOptions => ({
  prefix: '/collab', groupSpace: { 'fx:main': 'analytics' }, config: { apiBase: 'https://x' },
  icons: { groups: { 'fx:main': House }, screens: { list: House, item: House } }, ...over,
});
const mount = (m = manifest(), s: Record<string, typeof Screen> = screens, o = options()) => mountModule(m, s, o);

describe('mountModule (ADR-0053)', () => {
  it('mounts two screens with the prefix joined, module ownership and the group space', () => {
    const { menus, groups } = mount();

    expect(menus.map(m => [m.id, m.path, m.module, m.moduleScreen === Screen])).toEqual([['fx:list', '/collab', 'fx', true], ['fx:item', '/collab/items/:id', 'fx', true]]);
    expect(menus.map(m => m.parent)).toEqual([undefined, 'fx:list']);
    expect(groups).toMatchObject([{ id: 'fx:main', module: 'fx', space: 'analytics' }]);
    expect(menus.every(m => m.component === undefined)).toBe(true);
  });

  it('registers through createRegistry and matches the param route', () => {
    const { menus, groups } = mount();
    const space: SpaceDef = { id: 'analytics', label: { ko: '분석', en: 'A' }, description: { ko: '목적', en: 'P' }, homeMenuId: 'fx:list' };
    const registry = createRegistry({ spaces: [space], groups, menus });

    expect(registry.matchRoute('/collab/items/7')?.params).toEqual({ id: '7' });
  });

  it('namespaces screen ids so two modules can both declare "list"', () => {
    const other = mount(manifest({ module: { ...manifest().module, id: 'gx' }, groups: [{ id: 'gx:main', label: { ko: 'g', en: 'g' } }], screens: [screen('list', '', { primary: true, group: 'gx:main', permission: 'gx:view' })] }), { list: Screen },
      options({ prefix: '/other', groupSpace: { 'gx:main': 'analytics' }, icons: { groups: { 'gx:main': House }, screens: { list: House } } }));
    const first = mount();
    const space: SpaceDef = { id: 'analytics', label: { ko: '분석', en: 'A' }, description: { ko: '목적', en: 'P' }, homeMenuId: 'fx:list' };

    expect(() => createRegistry({ spaces: [space], groups: [...first.groups, ...other.groups], menus: [...first.menus, ...other.menus] })).not.toThrow();
  });

  it('still allows :param segments in screen paths', () => {
    expect(mount(manifest({ screens: [screen('list', '', { primary: true }), screen('item', 'a/:id/b/:n')] }), screens).menus.map(m => m.path)).toEqual(['/collab', '/collab/a/:id/b/:n']);
  });

  it('keeps the route clash rule: a module route that shapes like a platform route is rejected', () => {
    const { menus, groups } = mount();
    const platform: PlatformMenuEntry = {
      id: 'plat', group: 'metrics', label: { ko: 'p', en: 'p' }, description: { ko: '', en: '' }, path: '/collab', icon: House, permission: 'metrics:view', requiresScope: false,
      context: none, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], primary: true,
    };
    const space: SpaceDef = { id: 'analytics', label: { ko: '분석', en: 'A' }, description: { ko: '목적', en: 'P' }, homeMenuId: 'plat' };

    expect(() => createRegistry({ spaces: [space], groups: [...groups, { id: 'metrics', label: { ko: '지표', en: 'M' }, icon: House, space: 'analytics' }], menus: [...menus, platform] })).toThrow(/same route shape/);
  });

  it.each<[string, () => unknown, RegExp]>([
    ['unknown contract', () => mount(manifest({ module: { ...manifest().module, contract: 2 as 1 } })), /unsupported contract/],
    ['missing required feature', () => mount(manifest(), screens, options({ features: [] })), /requires host feature "query"/],
    ['missing config key', () => mount(manifest(), screens, options({ config: {} })), /config key "apiBase"/],
    ['permission without module prefix', () => mount(manifest({ screens: [screen('list', '', { permission: 'other:view', primary: true })] }), { list: Screen }), /permission "other:view"/],
    ['group id without module prefix', () => mount(manifest({ groups: [{ id: 'other:main', label: { ko: 'g', en: 'g' } }] }), screens), /group "other:main"/],
    ['screen group not declared', () => mount(manifest({ screens: [screen('list', '', { group: 'fx:nope' })] }), { list: Screen }), /does not declare/],
    ['prefix relative', () => mount(manifest(), screens, options({ prefix: 'collab' })), /prefix/],
    ['prefix with param', () => mount(manifest(), screens, options({ prefix: '/c/:id' })), /prefix/],
    ['prefix with trailing slash', () => mount(manifest(), screens, options({ prefix: '/collab/' })), /prefix/],
    ['absolute screen path', () => mount(manifest({ screens: [screen('list', '/abs')] }), { list: Screen }), /relative/],
    ['screen path with ..', () => mount(manifest({ screens: [screen('list', '../up')] }), { list: Screen }), /relative/],
    ['module id equal to a platform namespace', () => mount(manifest({ module: { ...manifest().module, id: 'console' }, groups: [{ id: 'console:main', label: { ko: 'g', en: 'g' } }], screens: [screen('list', '', { group: 'console:main', permission: 'console:view' })] }), { list: Screen }), /reserved platform namespace/],
    ['module permission equal to a platform permission', () => mount(manifest({ module: { ...manifest().module, id: 'console' }, groups: [{ id: 'console:main', label: { ko: 'g', en: 'g' } }], screens: [screen('list', '', { group: 'console:main', permission: 'console:access' })] }), { list: Screen }), /reserved platform namespace/],
    ['screen path with encoded dot segment', () => mount(manifest({ screens: [screen('list', '%2e%2e/admin')] }), { list: Screen }), /relative/],
    ['screen path with mixed-case encoded dot segment', () => mount(manifest({ screens: [screen('list', '%2E%2e/admin')] }), { list: Screen }), /relative/],
    ['screen path with encoded single dot', () => mount(manifest({ screens: [screen('list', '%2e/x')] }), { list: Screen }), /relative/],
    ['screen path with backslash', () => mount(manifest({ screens: [screen('list', 'a\\b')] }), { list: Screen }), /relative/],
    ['screen path with query', () => mount(manifest({ screens: [screen('list', 'items?x=1')] }), { list: Screen }), /relative/],
    ['screen path with hash', () => mount(manifest({ screens: [screen('list', 'items#x')] }), { list: Screen }), /relative/],
    ['screen path with double slash', () => mount(manifest({ screens: [screen('list', 'a//b')] }), { list: Screen }), /relative/],
    ['screen path with control character', () => mount(manifest({ screens: [screen('list', 'a\u0001b')] }), { list: Screen }), /relative/],
    ['screen path with space', () => mount(manifest({ screens: [screen('list', 'a b')] }), { list: Screen }), /relative/],
    ['prefix with encoded dot segment', () => mount(manifest(), screens, options({ prefix: '/%2e%2e/x' })), /prefix/],
    ['prefix with backslash', () => mount(manifest(), screens, options({ prefix: '/a\\b' })), /prefix/],
    ['prefix with query', () => mount(manifest(), screens, options({ prefix: '/a?x=1' })), /prefix/],
    ['prefix with hash', () => mount(manifest(), screens, options({ prefix: '/a#x' })), /prefix/],
    ['prefix with double slash', () => mount(manifest(), screens, options({ prefix: '/a//b' })), /prefix/],
    ['prefix with control character', () => mount(manifest(), screens, options({ prefix: '/a\u0000b' })), /prefix/],
    ['prefix with Unicode whitespace', () => mount(manifest(), screens, options({ prefix: '/a\u00a0b' })), /prefix/],
    ['screen path with Unicode whitespace', () => mount(manifest({ screens: [screen('list', 'a\u3000b')] }), { list: Screen }), /relative/],
    ['screen without component', () => mount(manifest(), { list: Screen }), /no component/],
    ['component without screen', () => mount(manifest(), { ...screens, extra: Screen }), /no screen declares/],
    ['duplicate screen id', () => mount(manifest({ screens: [screen('list', ''), screen('list', 'b')] }), screens), /twice/],
    ['parent outside the module', () => mount(manifest({ screens: [screen('list', '', { parent: 'plat' })] }), { list: Screen }), /outside the module/],
  ])('rejects %s', (_name, run, message) => {
    expect(run).toThrow(RegistryError);
    expect(run).toThrow(message);
  });
});
