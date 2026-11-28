import { expect, it } from 'vitest';
import type { ViewVisibility } from '@ap/contracts';
import { createFakeSavedViewStore, testSavedView, testViewCapabilities } from '../fake-store';

const markedView = (visibility: ViewVisibility) => testSavedView({
  id: 'marked', ownerId: 'u2', kind: 'menu-view', myMenu: true, visibility,
  menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null,
});
const groupShare: ViewVisibility = { kind: 'groups', groupIds: ['g1'] };

it.each<[string, ViewVisibility]>([
  ['named recipient', { kind: 'people', userIds: ['u1'] }],
  ['group member', groupShare],
])('denies a My Menus flag patch from a %s with read-only access', async (_actor, visibility) => {
  const view = markedView(visibility);
  const store = createFakeSavedViewStore([view]);
  await store.createGroup({ name: 'Readers', memberIds: ['u1'] });
  expect(await store.listMyMenus?.('u1')).toMatchObject([{ view, capabilities: { canView: true, canEdit: false } }]);
  expect(await store.update(view.id, { myMenu: false }, { expectedVersion: view.version })).toEqual({ ok: false, reason: 'forbidden' });
  expect(await store.get(view.id)).toMatchObject({ view: { myMenu: true, version: view.version } });
});

it('checks the group manager’s view capability before allowing a My Menus flag patch', async () => {
  const view = markedView(groupShare);
  const store = createFakeSavedViewStore([view]);
  store.groups = [{
    group: { id: 'g1', kind: 'custom', name: 'Managed group', memberCount: 0, managerIds: ['u1'] },
    members: [], capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true },
  }];
  const clear = () => store.update(view.id, { myMenu: false }, { expectedVersion: view.version });
  expect(await store.listMyMenus?.('u1')).toMatchObject([{ view, capabilities: { canView: true, canEdit: true } }]);

  store.caps.set(view.id, { ...testViewCapabilities, canView: false });
  expect(await store.listMyMenus?.('u1')).toEqual([]);
  expect(await clear()).toEqual({ ok: false, reason: 'forbidden' });

  store.caps.delete(view.id);
  expect(await clear()).toMatchObject({ ok: true });
  expect(await store.listMyMenus?.('u1')).toEqual([]);
});
