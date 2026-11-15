import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, expect, it } from 'vitest';
import { planGenerate } from './generate.ts';
import { FIXTURE_GROUP, fixtureMenusTs, makeFixture, removeFixture, repoRoot } from './fixture.ts';

const roots: string[] = [];
afterAll(() => { for (const root of roots) removeFixture(root); });
function plan(over: { path?: string; menu?: string } = {}, options: Parameters<typeof makeFixture>[0] = {}) {
  const root = makeFixture(options);
  roots.push(root);
  return () => planGenerate({ root, group: FIXTURE_GROUP, labelKo: '생성', labelEn: 'Generate', ...over });
}
it('defaults to the canonical path using menu id rather than group folder', () => {
  expect(plan({ menu: 'alternate' })().inputs.path).toBe('/mars/alternate');
});
it.each([
  ['/mars/metric-catalog/:other', undefined],
  ['/old-catalog/:other', "export const manifests = [{ id: 'metric-catalog', group: 'metrics', path: '/metrics/:id', aliases: ['/old-catalog/:id'] }];"],
])('rejects canonical or declared alias collision %s before writing', (path, existingMenuIndex) => {
  expect(plan({ path }, { existingMenuIndex })).toThrow(/collides/);
});
it.each(['/board', '/board/detail'])('rejects reserved board path %s', path => {
  expect(plan({ path })).toThrow(/reserved/);
});
it('rejects a declared space root for a space-less group', () => {
  const menusTs = fixtureMenusTs().replace("id: groupId('genProbe'), label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard, space: spaceId('mars')", "id: groupId('genProbe'), label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard, space: null");
  expect(plan({ path: '/mars/another' }, { menusTs })).toThrow(/space.*root/);
});

it.each([
  ['simple', '/mars/simple', []],
  ['simple', '/legacy', ['/old']],
  ['camelCase', '/legacy/:id', ['/old/:id']],
  ['sample:camelCase', '/legacy/:id/:detail', ['/old/:id/:detail']],
])('keeps tooling canonical paths and generated expectations in Registry parity: %s %s', async (id, path, aliases) => {
  // Like generated-lint.test.ts, load the runtime policy by repo URL without adding SDK dependencies to this CLI.
  const { createRegistry } = await import(pathToFileURL(join(repoRoot(), 'packages/sdk/kernel/src/registry/registry.ts')).href) as { createRegistry: (input: unknown) => { menuById: (id: string) => { path: string; aliases?: string[] } } };
  const { groupId, spaceId, NO_FEATURES, contextCapabilities, menuPermission } = await import(pathToFileURL(join(repoRoot(), 'packages/sdk/contracts/src/index.ts')).href);
  const { canonicalPath } = await import('./templates.ts');
  const { manifestPaths } = await import('./generate.ts');
  const module = id.includes(':') ? 'sample' : undefined;
  const group = module ? 'sample:group' : 'group';
  const permission = menuPermission(module ? 'sample:view' : 'sample:view');
  const homeId = module ? 'sample:home' : 'home';
  const menu = { group: groupId(group), label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, icon: () => null, permission, requiresScope: false, context: contextCapabilities(), pageType: 'overview' as const, features: NO_FEATURES, pageKeys: [], ...(module ? { module, moduleScreen: () => null } : {}) };
  const registry = createRegistry({
    permissions: module ? [] : [permission],
    spaces: [{ id: spaceId('mars'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: homeId }],
    groups: [{ id: groupId(group), label: { ko: '그룹', en: 'Group' }, icon: () => null, space: spaceId('mars'), ...(module ? { module } : {}) }],
    menus: [{ ...menu, id: homeId, primary: true, path: '/home' }, { ...menu, id, path, aliases }],
  });
  const actual = registry.menuById(id);
  expect(canonicalPath({ menuId: id, path, space: 'mars' })).toBe(actual.path);
  expect(new Set(manifestPaths({ id, group, path, aliases }, new Map([[group, 'mars']])))).toEqual(new Set([actual.path, ...(actual.aliases ?? [])]));
});
