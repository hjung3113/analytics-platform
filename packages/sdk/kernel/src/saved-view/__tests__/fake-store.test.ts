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

it('withdraws a pending request at the expected version', async () => {
  const view = testSavedView({ id: 'first', approval: 'pending' });
  const store = createFakeSavedViewStore([view]);
  expect(await store.withdraw?.(view.id, { expectedVersion: 0 })).toMatchObject({ ok: false, reason: 'conflict' });
  expect(await store.withdraw?.(view.id, { expectedVersion: 1 })).toMatchObject({
    ok: true, value: { view: { approval: 'none', version: 2 }, capabilities: { canWithdraw: false } },
  });
});

it('withdraws a pending edit back to the approved content', async () => {
  const view = testSavedView({ id: 'official', approval: 'approved', visibility: { kind: 'official' } });
  const store = createFakeSavedViewStore([view]);
  const proposal = await store.update(view.id, { name: 'proposal' }, { expectedVersion: view.version });
  expect(proposal).toMatchObject({ ok: true, value: { view: { approval: 'pending', name: 'proposal' } } });
  expect(await store.withdraw?.(view.id, { expectedVersion: 2 })).toMatchObject({
    ok: true, value: { view: { approval: 'approved', name: view.name, version: 3 } },
  });
});

const officialMenu = () => testSavedView({
  id: 'official-menu', kind: 'menu-view', approval: 'approved', visibility: { kind: 'official' },
  menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null,
});

it('keeps an official view approved when the owner tries a My Menus-only update', async () => {
  const view = officialMenu();
  const store = createFakeSavedViewStore([view]);
  expect(await store.update(view.id, { myMenu: true }, { expectedVersion: view.version })).toEqual({ ok: false, reason: 'forbidden' });
  expect(await store.get(view.id)).toMatchObject({ view, capabilities: { canWithdraw: false } });
});

it('requires a change to proposal content before creating an official edit', async () => {
  const view = officialMenu();
  const store = createFakeSavedViewStore([view]);
  expect(await store.update(view.id, { name: view.name, context: {} }, { expectedVersion: view.version }))
    .toMatchObject({ ok: true, value: { view: { approval: 'approved' }, capabilities: { canWithdraw: false } } });
});

it('creates an official edit with a constructor field in chart options', async () => {
  const view = officialMenu();
  const store = createFakeSavedViewStore([view]);
  const chartOptions = { constructor: null };
  await expect(store.update(view.id, { chartOptions }, { expectedVersion: view.version }))
    .resolves.toMatchObject({ ok: true, value: { view: { approval: 'pending', chartOptions }, capabilities: { canWithdraw: true } } });
});

it('keeps the approved version when a name patch differs only in surrounding whitespace', async () => {
  const view = officialMenu();
  const store = createFakeSavedViewStore([view]);
  const opts = { expectedVersion: view.version };
  expect(await store.update(view.id, { name: `  ${view.name}  ` }, opts))
    .toMatchObject({ ok: true, value: { view, capabilities: { canWithdraw: false } } });
  expect(await store.get(view.id)).toMatchObject({ view });
});

it.each(['withdraw', 'revoke'] as const)('keeps My Menus when applying %s to a pending edit', async op => {
  const view = { ...officialMenu(), savedScopeId: 'original-scope' };
  const store = createFakeSavedViewStore([view]);
  expect(await store.update(view.id, { name: 'proposal', savedScopeId: null, tables: {} }, { expectedVersion: view.version }))
    .toMatchObject({ ok: true, value: { view: { approval: 'pending' } } });
  expect(await store.update(view.id, { myMenu: true }, { expectedVersion: view.version + 1 }))
    .toMatchObject({ ok: true, value: { view: { myMenu: true } } });
  const result = await store[op]?.(view.id, { expectedVersion: view.version + 2 });
  expect(result).toMatchObject({
    ok: true, value: { view: { name: view.name, savedScopeId: 'original-scope', myMenu: true } },
  });
  expect(result).not.toHaveProperty('value.view.tables');
});

it('refuses withdrawal of a reachable non-owned custom group and a missing view', async () => {
  const view = testSavedView({
    id: 'custom', kind: 'custom-group', ownerId: 'u2', visibility: groupShare,
    target: { fixed: ['e1'] }, savedScopeId: 'scope',
  });
  const store = createFakeSavedViewStore([view]);
  await store.createGroup({ name: 'Readers', memberIds: ['u1'] });
  expect(await store.get(view.id)).toMatchObject({ view, capabilities: { canView: true } });
  for (const id of [view.id, 'missing']) {
    expect(await store.withdraw?.(id, { expectedVersion: view.version })).toEqual({ ok: false, reason: 'forbidden' });
  }
});

it.each([undefined, '', ' \t '])('refuses a blank reject reason (%j)', async (note) => {
  const view = testSavedView({ id: 'pending', approval: 'pending' });
  const store = createFakeSavedViewStore([view]);
  expect(await store.decide(view.id, 'reject', note, { expectedVersion: view.version })).toMatchObject({ ok: false, reason: 'invalid', detail: 'note' });
  expect(await store.get(view.id)).toMatchObject({ view });
});

it('trims the name on save like the server does', async () => {
  const store = createFakeSavedViewStore([]);
  const saved = await store.save(testSavedView({ id: 'draft', name: '  주간 가동률  ' }));
  expect(saved).toMatchObject({ ok: true, value: { view: { name: '주간 가동률' } } });
});
