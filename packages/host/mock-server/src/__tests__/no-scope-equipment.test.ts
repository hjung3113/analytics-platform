import { afterEach, describe, expect, it } from 'vitest';
import { contextCapabilities, defineEndpoint, groupId, menuPermission, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, defineMockEndpoint, getRole, setRole } from '../index';

const permission = menuPermission('platform:view');
const none = contextCapabilities();
const menu: MenuMeta = {
  id: 'owner', group: groupId('analytics'), label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, path: '/owner', permission, requiresScope: false,
  context: none, pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
};
const spec = (requiresScope: boolean) => defineEndpoint<Record<string, never>, { seen: number }>({
  id: 'owner.rows', menuId: 'owner', paramKeys: {}, permission, requiresScope, context: {}, kinds: [], mergeTimeDomain: false,
});

const before = getRole();
afterEach(() => { setRole(before); createMockAdapter({ endpoints: [], registry: { menus: [] } }); });

describe('equipment handed to a handler (#2054)', () => {
  it('is empty when the endpoint declares no Scope: its rows would not be filtered by the caller\'s grants', async () => {
    setRole('viewer');
    const adapter = createMockAdapter({ endpoints: [defineMockEndpoint(spec(false), { mart: false, handle: ({ equipment }) => ({ seen: equipment.length }) })], registry: { menus: [menu] } });
    const response = await adapter.menuQuery({ endpoint: 'owner.rows', context: {}, params: {} });
    expect(response.outcome).toBe('ok');
    expect(response.data).toEqual({ seen: 0 });
  });
});
