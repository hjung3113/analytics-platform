import { afterEach, describe, expect, it } from 'vitest';
import { defineAction, defineEndpoint, groupId, KERNEL_PERMISSIONS, menuPermission, type MenuMeta } from '@ap/contracts';
import { createMockAdapter } from '../adapter';
import { defineMockAction } from '../actions/actions';
import { defineMockEndpoint, MockRegistrationError } from '../query/endpoints';
import { getRole, setRole } from '../server';

const publish = menuPermission('knowledge:item-publish');
const vocabulary = [...KERNEL_PERMISSIONS, publish];

function menuMeta(): MenuMeta {
  return {
    id: 'owner', group: groupId('analytics'), label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, path: '/owner',
    permission: menuPermission('platform:view'), requiresScope: false,
    context: { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' },
    pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  };
}
const registry = { menus: [menuMeta()] };

const endpointSpec = (permission: string) => defineEndpoint<{ q: string }, unknown>({
  id: 'owner.rows', menuId: 'owner', paramKeys: { q: true }, permission: permission as never, requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
const actionSpec = (permission: string) => defineAction<{ text: string }, unknown>({
  id: 'owner.write', menuId: 'owner', inputKeys: { text: true }, permission: permission as never, requiresScope: false, concurrency: 'none', invalidates: [],
});
const endpoint = (permission: string) => defineMockEndpoint(endpointSpec(permission), { mart: false, handle: () => ({}) });
const action = (permission: string) => defineMockAction(actionSpec(permission), { handle: () => ({ data: {}, version: null }) });

const before = getRole();
afterEach(() => {
  setRole(before);
  createMockAdapter({ endpoints: [], registry: { menus: [] } }); // back to the default world for other tests
});

describe('a write or read permission that no menu declares as its entry (opt-in vocabulary)', () => {
  it('accepts an action whose permission is in the app vocabulary', () => {
    expect(() => createMockAdapter({ endpoints: [endpoint('platform:view')], actions: [action(publish)], registry, permissions: vocabulary })).not.toThrow();
  });

  it('accepts an endpoint whose permission is in the app vocabulary', () => {
    expect(() => createMockAdapter({ endpoints: [endpoint(publish)], registry, permissions: vocabulary })).not.toThrow();
  });

  it('refuses an action and an endpoint whose permission is in neither the menus nor the vocabulary', () => {
    expect(() => createMockAdapter({ endpoints: [endpoint('platform:view')], actions: [action('knowledge:typo')], registry, permissions: vocabulary })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [endpoint('knowledge:typo')], registry, permissions: vocabulary })).toThrow(/knowledge:typo is not declared/);
  });

  it('keeps today\'s rule without a vocabulary: only a registered menu\'s own permission is accepted', () => {
    expect(() => createMockAdapter({ endpoints: [endpoint('platform:view')], actions: [action(publish)], registry })).toThrow(/knowledge:item-publish is not declared by any menu/);
    expect(() => createMockAdapter({ endpoints: [endpoint(publish)], registry })).toThrow(MockRegistrationError);
    expect(() => createMockAdapter({ endpoints: [endpoint('platform:view')], actions: [action('platform:view')], registry })).not.toThrow();
  });

  it('gives the vocabulary permission to admin only (engineer and viewer cannot publish)', () => {
    const adapter = createMockAdapter({ endpoints: [], registry, permissions: vocabulary });
    const held = (role: 'admin' | 'engineer' | 'viewer') => { setRole(role); return adapter.session().user.permissions; };
    expect(held('admin')).toContain(publish);
    expect(held('engineer')).not.toContain(publish);
    expect(held('viewer')).not.toContain(publish);
  });
});
