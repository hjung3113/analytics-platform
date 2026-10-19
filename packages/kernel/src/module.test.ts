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

    expect(menus.map(m => [m.id, m.path, m.module, m.moduleScreen === Screen])).toEqual([['list', '/collab', 'fx', true], ['item', '/collab/items/:id', 'fx', true]]);
    expect(groups).toMatchObject([{ id: 'fx:main', module: 'fx', space: 'analytics' }]);
    expect(menus.every(m => m.component === undefined)).toBe(true);
  });

  it('registers through createRegistry and matches the param route', () => {
    const { menus, groups } = mount();
    const space: SpaceDef = { id: 'analytics', label: { ko: '분석', en: 'A' }, description: { ko: '목적', en: 'P' }, homeMenuId: 'list' };
    const registry = createRegistry({ spaces: [space], groups, menus });

    expect(registry.matchRoute('/collab/items/7')?.params).toEqual({ id: '7' });
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
    ['screen without component', () => mount(manifest(), { list: Screen }), /no component/],
    ['component without screen', () => mount(manifest(), { ...screens, extra: Screen }), /no screen declares/],
    ['duplicate screen id', () => mount(manifest({ screens: [screen('list', ''), screen('list', 'b')] }), screens), /twice/],
    ['parent outside the module', () => mount(manifest({ screens: [screen('list', '', { parent: 'plat' })] }), { list: Screen }), /outside the module/],
  ])('rejects %s', (_name, run, message) => {
    expect(run).toThrow(RegistryError);
    expect(run).toThrow(message);
  });
});
