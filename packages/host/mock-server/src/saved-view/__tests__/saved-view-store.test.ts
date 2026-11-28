import { beforeEach, describe, expect, it } from 'vitest';
import type { JsonValue, SavedView, SavedViewDraft, SavedViewEntry, SavedViewListItem, SavedViewPatch, SavedViewStore, ViewVisibility } from '@ap/contracts';
import { rejectedChartConfigCases, storedPanelCases } from '@ap/contracts/testing/saved-view-panels';
import { ACTORS } from '../saved-view-seed';
import { createLocalSavedViewStore, savedViewDefaultStorageKey, savedViewGroupsStorageKey, savedViewsStorageKey } from '../saved-view-store';
// The kernel `testing` entry is not a dependency of this package, so the storage helper is defined here with the same semantics.
const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: key => data.get(String(key)) ?? null,
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: key => { data.delete(String(key)); },
    clear: () => data.clear(),
    key: index => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
};


const MENU = 'productivity-overview';
const storage = memoryStorage();
const as = (role: 'engineer' | 'admin' | 'viewer') => storage.setItem('platform:role', JSON.stringify(role));
const PERMISSIONS: Record<string, string[]> = { 'productivity-overview': ['analytics:view'], 'equipment-master': ['equipment:view'], 'needs-both': ['platform:view', 'console:access'] };
const permissionOf = (id: string) => PERMISSIONS[id];
beforeEach(() => { storage.clear(); as('engineer'); });
// Emulates the origin lock: requests serialize across independent store instances.
let tail = Promise.resolve();
const locks = { request: async <T,>(_name: string, callback: () => T | Promise<T>): Promise<T> => {
  const result = tail.then(callback); tail = result.then(() => undefined, () => undefined); return result;
} };
const store = (): SavedViewStore => createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf });
const key = (userId: string, menuId: string | null = MENU) => ({ userId, menuId });
const ENG = 'engineer'; const ADMIN = 'admin';
const draft = (name = '새 뷰'): Extract<SavedViewDraft, { kind: 'menu-view' }> => ({ schemaVersion: 1, kind: 'menu-view', name, menuId: MENU, menuSchemaVersion: 2, context: { relativePeriod: { hours: 24 } }, page: { grain: ['hour'] }, chartOptions: {}, layout: null, panels: null });
const visible = (items: readonly SavedViewListItem[]): SavedViewEntry[] => items.filter((i): i is SavedViewEntry => !i.denied);
const byName = (items: readonly SavedViewListItem[], name: string) => visible(items).find(i => i.view.name === name)!;
const ok = <T,>(r: { ok: true; value: T } | { ok: false; reason: string }): T => { if (!r.ok) throw new Error(r.reason); return r.value; };

it('delegates official decisions only for the granted space and never to the delegated owner', async () => {
  let grantRevoked = false;
  const s = createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5,
    getActor: () => {
      const role = JSON.parse(storage.getItem('platform:role') ?? '"engineer"') as string;
      const actor = ACTORS[role]!;
      return role === 'viewer' ? { ...actor, approvalSpaces: grantRevoked ? [] : ['mars'] } : actor;
    },
    menuPermissionsOf: () => ['metrics:view'],
    spaceOf: id => id === MENU ? 'mars' : 'bravo',
  });
  const first = ok(await s.save(draft('delegated'))).view;
  const pending = ok(await s.requestOfficial(first.id, { expectedVersion: first.version })).view;
  const other = ok(await s.save({ ...draft('other'), menuId: 'equipment-master' })).view;
  const otherPending = ok(await s.requestOfficial(other.id, { expectedVersion: other.version })).view;
  const cond = ok(await s.save({ schemaVersion: 1, kind: 'condition-set', name: 'Set', context: {} })).view;
  const condPending = ok(await s.requestOfficial(cond.id, { expectedVersion: cond.version })).view;
  as('viewer');
  expect(await s.listApprovalRequests(key('viewer'))).toContainEqual(expect.objectContaining({ viewId: first.id, approverSpace: 'mars' }));
  expect(await s.listApprovalRequests(key('viewer', 'equipment-master'))).toEqual([]);
  for (const outOfScope of [otherPending, condPending])
    expect(await s.decide(outOfScope.id, 'approve', undefined, { expectedVersion: outOfScope.version })).toEqual({ ok: false, reason: 'forbidden' });
  expect(await s.listApprovalRequests(key('viewer', null))).toEqual([]);
  as('admin');
  expect(ok(await s.decide(cond.id, 'approve', undefined, { expectedVersion: condPending.version })).view.approval).toBe('approved');
  as('viewer');
  const own = ok(await s.save(draft('self'))).view;
  const ownPending = ok(await s.requestOfficial(own.id, { expectedVersion: own.version })).view;
  expect(await s.decide(own.id, 'approve', undefined, { expectedVersion: ownPending.version })).toMatchObject({ ok: false, reason: 'forbidden' });
  const rejected = ok(await s.decide(first.id, 'reject', 'Revise', { expectedVersion: pending.version })).view;
  as('engineer');
  const retried = ok(await s.requestOfficial(first.id, { expectedVersion: rejected.version })).view;
  as('viewer');
  const approved = ok(await s.decide(first.id, 'approve', undefined, { expectedVersion: retried.version }));
  expect(approved.capabilities.canRevoke).toBe(true);
  expect(ok(await s.revoke(first.id, { expectedVersion: approved.view.version })).view.visibility.kind).toBe('private');
  as('engineer');
  const after = ok(await s.save(draft('grant lifecycle'))).view;
  const afterPending = ok(await s.requestOfficial(after.id, { expectedVersion: after.version })).view;
  as('viewer');
  grantRevoked = true;
  expect(await s.listApprovalRequests(key('viewer'))).toEqual([]);
  expect(await s.decide(after.id, 'approve', undefined, { expectedVersion: afterPending.version })).toEqual({ ok: false, reason: 'forbidden' });
});

it.each(['room', 'menu'] as const)('allows same-space approval while %s access remains denied', async boundary => {
  const s = createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5,
    getActor: () => storage.getItem('platform:role') === '"viewer"'
      ? { ...ACTORS.viewer!, approvalSpaces: ['mars'] }
      : ACTORS.engineer!,
    menuPermissionsOf: () => [boundary === 'room' ? 'metrics:view' : 'analytics:view'],
    spaceOf: () => 'mars',
  });
  const saved = ok(await s.save({ ...draft(), context: { roomNames: ['ETCH'] } })).view;
  const pending = ok(await s.requestOfficial(saved.id, { expectedVersion: saved.version })).view;
  as('viewer');
  const delegateKey = key('viewer');
  expect(await s.listApprovalRequests(delegateKey)).toContainEqual(expect.objectContaining({ viewId: pending.id, approverSpace: 'mars' }));
  expect(await s.get(pending.id)).toMatchObject({ denied: true });
  const approved = ok(await s.decide(pending.id, 'approve', undefined, { expectedVersion: pending.version }));
  expect(approved).toMatchObject({ view: { approval: 'approved' }, capabilities: { canRevoke: true } });
  expect(await s.get(pending.id)).toMatchObject({ denied: true });
  expect(await s.setDefault(delegateKey, pending.id)).toMatchObject({ ok: false });
  expect(await s.listApprovalRequests(delegateKey)).not.toContainEqual(expect.objectContaining({ viewId: pending.id }));
  expect(ok(await s.revoke(pending.id, { expectedVersion: approved.view.version })).view.visibility.kind).toBe('private');
});

it.each<ViewVisibility>([
  { kind: 'people', userIds: [ADMIN, 'u-seojia'] },
  { kind: 'groups', groupIds: ['g-photo-team', 'g-night-ops'] },
])('projects only the delegate\'s own share targets after a $kind rejection, as the server does', async visibility => {
  const s = createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5,
    getActor: () => storage.getItem('platform:role') === '"viewer"' ? { ...ACTORS.viewer!, approvalSpaces: ['mars'] } : ACTORS.engineer!,
    menuPermissionsOf: () => ['metrics:view'],
    spaceOf: () => 'mars',
  });
  const saved = ok(await s.save({ ...draft(), context: { roomNames: ['ETCH'] } })).view;
  const shared = ok(await s.setVisibility(saved.id, visibility, { expectedVersion: saved.version })).view;
  const pending = ok(await s.requestOfficial(shared.id, { expectedVersion: shared.version })).view;
  as('viewer');
  const rejected = ok(await s.decide(pending.id, 'reject', 'Revise', { expectedVersion: pending.version })).view;
  expect(rejected.approval).toBe('rejected');
  expect(rejected.visibility).toEqual(visibility.kind === 'people' ? { kind: 'people', userIds: [] } : { kind: 'groups', groupIds: [] });
  as('engineer');
  expect(await s.get(pending.id)).toMatchObject({ view: { visibility } });
});

it('shows a share recipient only their own target on list and get', async () => {
  const s = store();
  const saved = ok(await s.save(draft('people share'))).view;
  ok(await s.setVisibility(saved.id, { kind: 'people', userIds: [ADMIN, 'viewer', 'u-seojia'] }, { expectedVersion: saved.version }));
  as('viewer');
  const recipient = createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: () => [] });
  expect(await recipient.get(saved.id)).toMatchObject({ view: { visibility: { kind: 'people', userIds: ['viewer'] } } });
  expect(byName(await recipient.list(key('viewer')), 'people share').view.visibility).toEqual({ kind: 'people', userIds: ['viewer'] });
});

it.each(['first request', 'official edit'])('only the owner can withdraw a pending %s', async (scenario) => {
  const s = store();
  const original = ok(await s.save(draft())).view;
  const shared = ok(await s.setVisibility(original.id, { kind: 'people', userIds: [ADMIN] }, { expectedVersion: original.version })).view;
  let pending = ok(await s.requestOfficial(shared.id, { expectedVersion: shared.version })).view;
  const official = scenario === 'official edit';
  if (official) {
    as('admin');
    const published = ok(await s.decide(shared.id, 'approve', undefined, { expectedVersion: pending.version })).view;
    as('engineer');
    pending = ok(await s.update(shared.id, { name: 'proposal' }, { expectedVersion: published.version })).view;
  }
  const at = { expectedVersion: pending.version };
  expect(await s.get(shared.id)).toMatchObject({ capabilities: { canWithdraw: true } });
  as('admin');
  expect(await s.withdraw?.(shared.id, at)).toMatchObject({ ok: false, reason: 'forbidden' });
  as('engineer');
  expect(await s.withdraw?.(shared.id, { expectedVersion: original.version })).toMatchObject({ ok: false, reason: 'conflict' });
  const result = await s.withdraw?.(shared.id, at);
  expect(result).toMatchObject({ ok: true, value: { view: { name: original.name, approval: official ? 'approved' : 'none', visibility: pending.visibility, version: pending.version + 1 }, capabilities: { canWithdraw: false } } });
  expect(await s.withdraw?.(shared.id, { expectedVersion: pending.version + 1 })).toMatchObject({ ok: false, reason: 'invalid', detail: 'approval-state' });
});

it.each([undefined, '', ' \t '])('rejects a blank reason (%j) without changing the request', async (note) => {
  const s = store();
  const { view } = ok(await s.save(draft()));
  const pending = ok(await s.requestOfficial(view.id, { expectedVersion: view.version })).view;
  as('admin');
  const before = await s.get(view.id);
  expect(await s.decide(view.id, 'reject', note, { expectedVersion: pending.version })).toMatchObject({ ok: false, reason: 'invalid', detail: 'note' });
  expect(await s.get(view.id)).toEqual(before);
});

it('saving the contents of an official view as a copy starts private and unofficial', async () => {
  const s = store();
  const { view } = ok(await s.save(draft()));
  const pending = ok(await s.requestOfficial(view.id, { expectedVersion: view.version })).view;
  as('admin');
  const source = ok(await s.decide(view.id, 'approve', undefined, { expectedVersion: pending.version })).view;
  if (source.kind !== 'menu-view') throw new Error('expected an official menu view');
  const copy = ok(await s.save({ ...draft('private copy'), context: source.context, page: source.page })).view;
  expect(copy).toMatchObject({ ownerId: ADMIN, visibility: { kind: 'private' }, approval: 'none', context: source.context });
  expect(copy.id).not.toBe(source.id);
});

it('saves, sets and clears myMenu and refuses it for other view kinds', async () => {
  const s = store();
  const { view } = ok(await s.save({ ...draft(), myMenu: true } as SavedViewDraft));
  expect(await s.get(view.id)).toMatchObject({ view: { myMenu: true } });
  const cleared = ok(await s.update(view.id, { myMenu: false }, { expectedVersion: view.version }));
  expect(cleared.view).not.toHaveProperty('myMenu');
  expect(await s.get(view.id)).not.toHaveProperty('view.myMenu');
  expect(ok(await s.update(view.id, { myMenu: true }, { expectedVersion: cleared.view.version })).view).toHaveProperty('myMenu', true);
  const condition = { schemaVersion: 1, kind: 'condition-set', name: 'C', context: {} } as const;
  expect(await s.save({ ...condition, myMenu: true } as SavedViewDraft)).toMatchObject({ ok: false, reason: 'invalid' });
  const custom = { schemaVersion: 1, kind: 'custom-group', name: 'Custom', savedScopeId: 'S', target: { fixed: ['a'] } } as const;
  expect(await s.save({ ...custom, myMenu: true } as SavedViewDraft)).toMatchObject({ ok: false, reason: 'invalid' });
  for (const input of [condition, custom]) {
    const { view: other } = ok(await s.save(input));
    expect(await s.update(other.id, { myMenu: false }, { expectedVersion: other.version })).toMatchObject({ ok: false, reason: 'invalid' });
  }
});

it('lists current people and group shares with owned views first', async () => {
  const s = store();
  const { group } = ok(await s.createGroup({ name: 'Audience', memberIds: [ADMIN] }));
  const { view: grouped } = ok(await s.save({ ...draft('Grouped'), myMenu: true } as SavedViewDraft));
  const { view: named } = ok(await s.save({ ...draft('Named'), myMenu: true } as SavedViewDraft));
  const { view: pending } = ok(await s.save({ ...draft('Pending'), myMenu: true } as SavedViewDraft));
  const { view: hidden } = ok(await s.save({ ...draft('Hidden'), myMenu: true } as SavedViewDraft));
  const { view: unmarked } = ok(await s.save(draft('Unmarked')));
  ok(await s.setVisibility(grouped.id, { kind: 'groups', groupIds: [group.id] }, { expectedVersion: grouped.version }));
  const { view: namedShared } = ok(await s.setVisibility(named.id, { kind: 'people', userIds: [ADMIN] }, { expectedVersion: named.version }));
  ok(await s.requestOfficial(pending.id, { expectedVersion: pending.version }));
  const ids = async (actor: string) => (await s.listMyMenus?.(actor))?.map(({ view }) => view.id);
  expect(await ids(ENG)).toEqual([grouped.id, named.id, pending.id, hidden.id].sort());
  as('admin');
  const { view: own } = ok(await s.save({ ...draft('Own'), myMenu: true } as SavedViewDraft));
  expect(await ids(ADMIN)).toEqual([own.id, ...[grouped.id, named.id].sort()]);
  expect(await ids(ENG)).toEqual([]);
  expect(await s.update(named.id, { myMenu: false }, { expectedVersion: namedShared.version })).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(await ids(ADMIN)).not.toContain(unmarked.id);
  as('engineer');
  ok(await s.updateGroup(group.id, { removeMembers: [ADMIN] }));
  as('admin');
  expect(await ids(ADMIN)).toEqual([own.id, named.id]);
  as('engineer');
  ok(await s.setVisibility(named.id, { kind: 'private' }, { expectedVersion: namedShared.version }));
  as('admin');
  expect(await ids(ADMIN)).toEqual([own.id]);
});

it.each(storedPanelCases)('projects $label panels and preserves the stored value on rename', async ({ stored, read, rename }) => {
  const s = store();
  const { view } = ok(await s.save(draft()));
  const bucket = savedViewsStorageKey(ENG, MENU);
  const raw = JSON.stringify({ schemaVersion: 1, views: [{ ...view, panels: stored }] });
  storage.setItem(bucket, raw);
  expect(await s.get(view.id)).toMatchObject({ view: { ...view, ...read } });
  expect(byName(await s.list(key(ENG)), view.name).view).toStrictEqual({ ...view, ...read });
  expect(storage.getItem(bucket)).toBe(raw);
  const renamed = ok(await s.update(view.id, { name: rename }, { expectedVersion: 1 }));
  expect(renamed.view).toStrictEqual({ ...view, ...read, name: rename, version: 2 });
  expect(JSON.parse(storage.getItem(bucket) ?? '{}')).toEqual({
    schemaVersion: 1, views: [{ ...view, name: rename, version: 2, panels: stored }],
  });
});

it.each(rejectedChartConfigCases)('refuses to save or patch in a $label and writes nothing (#2745)', async ({ panels }) => {
  const s = store();
  const { view } = ok(await s.save(draft()));
  const before = storage.getItem(savedViewsStorageKey(ENG, MENU));
  expect(await s.save({ ...draft('차트'), panels } as unknown as SavedViewDraft)).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.update(view.id, { panels } as unknown as SavedViewPatch, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
  expect(storage.getItem(savedViewsStorageKey(ENG, MENU))).toBe(before);
});

it('rejects the response-only panels flag in both drafts and patches', async () => {
  const s = store();
  const marker = { panelsUnreadable: true };
  expect(await s.save({ ...draft(), ...marker })).toMatchObject({ ok: false, reason: 'invalid' });
  const { view } = ok(await s.save(draft()));
  expect(await s.update(view.id, { name: 'Renamed', ...marker }, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
});

it('round-trips tables, refuses invalid nested fields and condition-set patches, and summarizes proposals (#2492)', async () => {
  const s = store(); const tables = { draftList: { groups: { basis: '[]', items: [{ id: 'u:a', label: 'Group', members: ['a'] }] } } };
  const saved = ok(await s.save({ ...draft(), tables } as SavedViewDraft));
  expect(await s.get(saved.view.id)).toMatchObject({ view: { tables } });
  expect(await s.save({ ...draft(), tables: { raw: { extra: 1 } } } as unknown as SavedViewDraft)).toMatchObject({ ok: false, reason: 'invalid' });
  const condition = ok(await s.save({ schemaVersion: 1, kind: 'condition-set', name: 'C', context: {} }));
  expect(await s.update(condition.view.id, { tables }, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
  const changed = ok(await s.update(saved.view.id, { tables: { draftList: {} } }, { expectedVersion: 1 }));
  expect(await s.get(saved.view.id)).toMatchObject({ view: { tables: { draftList: {} } } });
  const requested = ok(await s.requestOfficial(saved.view.id, { expectedVersion: changed.view.version }));
  as('admin'); const approved = ok(await s.decide(saved.view.id, 'approve', undefined, { expectedVersion: requested.view.version }));
  as('engineer'); ok(await s.update(saved.view.id, { tables }, { expectedVersion: approved.view.version }));
  as('admin');
  expect((await s.listApprovalRequests(key(ADMIN))).find(request => request.viewId === saved.view.id)?.changes).toEqual(['열 묶음']);
});

it('stores custom groups separately from condition sets, with owner-only editing and private/groups sharing', async () => {
  const s = store();
  const group = ok(await s.save({ schemaVersion: 1, kind: 'custom-group', name: 'Targets', savedScopeId: 'S', target: { rule: { model: ['A'] } } })).view;
  const customKey = { userId: ENG, menuId: null, kind: 'custom-group' } as const;
  expect((await s.list(customKey)).map(item => item.denied ? item.id : item.view.id)).toContain(group.id);
  expect((await s.list(key(ENG, null))).some(item => !item.denied && item.view.id === group.id)).toBe(false);
  expect(await s.setDefault(customKey, null)).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.setDefault(key(ENG, null), group.id)).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.getDefaultId(customKey)).toBeNull();
  expect(await s.setVisibility(group.id, { kind: 'people', userIds: [ADMIN] }, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.requestOfficial(group.id, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.update(group.id, { savedScopeId: null }, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
  const audience = ok(await s.createGroup({ name: 'Audience', memberIds: [ADMIN] }));
  const shared = ok(await s.setVisibility(group.id, { kind: 'groups', groupIds: [audience.group.id] }, { expectedVersion: 1 }));
  as('admin');
  expect(await s.get(group.id)).toMatchObject({ view: { kind: 'custom-group' }, capabilities: { canView: true, canEdit: false, canShare: false, canApprove: false, canRevoke: false } });
  expect(await s.decide(group.id, 'approve', undefined, { expectedVersion: shared.view.version })).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.revoke(group.id, { expectedVersion: shared.view.version })).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.remove(group.id)).toMatchObject({ ok: false, reason: 'forbidden' });
  as('engineer');
  ok(await s.setVisibility(group.id, { kind: 'private' }, { expectedVersion: shared.view.version }));
  as('admin');
  expect(await s.get(group.id)).toEqual({ id: group.id, denied: true, reason: 'no-access' });
});

it('keys are user- and menu-scoped JSON tuples, with separate keys for views, defaults and groups', async () => {
  const s = store(); ok(await s.save(draft()));
  expect(savedViewsStorageKey(ENG, MENU)).toBe(`platform:saved-views:v1:${JSON.stringify([1, ENG, MENU])}`);
  expect(storage.getItem(savedViewsStorageKey(ENG, MENU))).not.toBeNull();
  expect(savedViewsStorageKey(ENG, null)).not.toBe(savedViewsStorageKey(ENG, MENU));
  expect(savedViewsStorageKey('a:b', 'c')).not.toBe(savedViewsStorageKey('a', 'b:c'));
  const id = visible(await s.list(key(ENG)))[0].view.id;
  ok(await s.setDefault(key(ENG), id));
  expect(storage.getItem(savedViewDefaultStorageKey(ENG, MENU))).not.toBeNull();
  ok(await s.createGroup({ name: '새 그룹', memberIds: [] }));
  expect(storage.getItem(savedViewGroupsStorageKey())).not.toBeNull();
});

it.each([
  ['남의 그룹 뷰는 편집 불가·복제 가능', '주간 리뷰 기준', { canEdit: false, canCopy: true, canShare: false }],
  ['공식 등록본은 개인 편집 불가', '공식 생산성 일일 점검', { canEdit: false, canCopy: true, canShare: false }],
  ['내 뷰는 편집·공유 가능', '내 야간 점검', { canEdit: true, canShare: true }],
  ['사람 지정으로 받은 뷰는 복제만', 'PHOTO 라인 주간', { canEdit: false, canCopy: true }],
] as const)('capabilities are per object: %s', async (_label, name, expected) => {
  expect(byName(await store().list(key(ENG)), name).capabilities).toMatchObject(expected);
});

it('a group manager can edit and share the group view; admin approves and revokes by capability, not role label', async () => {
  as('admin'); // 윤도현's pending view reaches the admin only for approval
  const items = await store().list(key(ADMIN));
  expect(byName(items, '야간 공정 비교').capabilities).toMatchObject({ canApprove: true, canEdit: false });
  expect(byName(items, '공식 생산성 일일 점검').capabilities).toMatchObject({ canRevoke: true, canApprove: false });
  as('engineer');
  expect((await store().list(key(ENG))).some(i => !i.denied && i.view.name === '야간 공정 비교')).toBe(false);
});

it('revoking an official view returns it to private with a note and republishes nowhere', async () => {
  as('admin'); const s = store();
  const official = byName(await s.list(key(ADMIN)), '공식 생산성 일일 점검').view;
  const revoked = ok(await s.revoke(official.id, { expectedVersion: official.version }));
  expect(revoked.view).toMatchObject({ visibility: { kind: 'private' }, approval: 'none', version: official.version + 1 });
  expect(revoked.view.approvalNote).toEqual(expect.any(String));
  as('engineer');
  expect((await s.list(key(ENG))).some(i => !i.denied && i.view.id === official.id)).toBe(false);
});

it('removing a member cuts that group path immediately and keeps other share paths', async () => {
  const s = store();
  expect(visible(await s.list(key(ENG))).map(i => i.view.name)).toEqual(expect.arrayContaining(['주간 리뷰 기준', 'PHOTO 라인 주간']));
  as('admin'); // an admin may edit a custom group's members
  ok(await s.updateGroup('g-weekly-review', { removeMembers: [ENG] }));
  as('engineer');
  const names = visible(await s.list(key(ENG))).map(i => i.view.name);
  expect(names).not.toContain('주간 리뷰 기준');
  expect(names).toContain('PHOTO 라인 주간'); // the direct people path stays
  expect(await store().get('u-yoondohyun|productivity-overview|1')).toEqual({ id: 'u-yoondohyun|productivity-overview|1', denied: true, reason: 'no-access' });
});

it('saving or editing a group never changes any view visibility', async () => {
  const s = store(); const before = visible(await s.list(key(ENG))).map(i => [i.view.id, i.view.visibility]);
  ok(await s.createGroup({ name: '새 모임', memberIds: ['u-kangminseo'] }));
  ok(await s.updateGroup('g-night-ops', { name: '야간 운영 2', addMembers: ['u-seojia'] }));
  expect(visible(await s.list(key(ENG))).map(i => [i.view.id, i.view.visibility])).toEqual(before);
});

it('org-team membership and name cannot be edited; a custom group needs a manager', async () => {
  const s = store();
  expect(await s.updateGroup('g-photo-team', { addMembers: ['u-seojia'] })).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(await s.updateGroup('g-photo-team', { name: '다른 이름' })).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(await s.updateGroup('g-weekly-review', { addMembers: ['u-seojia'] })).toMatchObject({ ok: false, reason: 'forbidden' });
  const groups = await s.listGroups();
  expect(groups.find(g => g.group.id === 'g-photo-team')!.capabilities.canEditMembers).toBe(false);
  expect(groups.find(g => g.group.id === 'g-night-ops')!.capabilities.canEditMembers).toBe(true);
});

it.each([
  ['권한 밖 공정', 'CMP 설비 비교'],
])('every read re-judges scope: %s becomes a denied entry with only a reason', async (_label, name) => {
  const items = await store().list(key(ENG));
  const denied = items.filter(i => i.denied);
  expect(denied).toHaveLength(1);
  expect(denied[0]).toEqual({ id: 'u-limchaewon|productivity-overview|1', denied: true, reason: expect.any(String) });
  expect(JSON.stringify(denied)).not.toContain(name);
  expect(await store().get('u-limchaewon|productivity-overview|1')).toMatchObject({ denied: true });
  as('admin'); // the same view is readable once the reader's rooms include it
  expect(visible(await store().list(key(ADMIN))).some(i => i.view.name === name)).toBe(false); // admin is not a share target
});

it('menu permission is re-judged on read: a viewer without the menu permission gets denied entries', async () => {
  const s = store(); ok(await s.save(draft('내 뷰'))); // engineer saves
  as('viewer');
  const raw = JSON.parse(storage.getItem(savedViewsStorageKey(ENG, MENU))!);
  raw.views[0].visibility = { kind: 'people', userIds: ['viewer'] };
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify(raw));
  const items = await s.list(key('viewer'));
  expect(items.length).toBeGreaterThan(0);
  expect(items.every(i => i.denied)).toBe(true);
  expect(await s.save(draft('권한 없음'))).toMatchObject({ ok: false, reason: 'forbidden' });
});

it('editing an official copy asks for approval again and leaves who can see it unchanged', async () => {
  const s = store();
  // An official copy the engineer owns (the seeded official view belongs to someone else).
  const official = { ...byName(await s.list(key(ENG)), '공식 생산성 일일 점검').view, ownerId: ENG, id: `${ENG}|${MENU}|9` };
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify({ schemaVersion: 1, views: [official] }));
  const mine = byName(await s.list(key(ENG)), '공식 생산성 일일 점검');
  expect(mine.capabilities.canEdit).toBe(false);
  const edited = ok(await s.update(official.id, { name: '공식 (수정)' }, { expectedVersion: official.version }));
  expect(edited.view).toMatchObject({ name: '공식 (수정)', approval: 'pending', visibility: { kind: 'official' } });
});

it('setDefault is one per user and menu, can be cleared, and condition sets and menu views use separate keys', async () => {
  const s = store(); const [a, b] = [ok(await s.save(draft('a'))), ok(await s.save(draft('b')))];
  ok(await s.setDefault(key(ENG), a.view.id)); ok(await s.setDefault(key(ENG), b.view.id));
  expect(await s.getDefaultId(key(ENG))).toBe(b.view.id);
  ok(await s.setDefault(key(ENG), null)); expect(await s.getDefaultId(key(ENG))).toBeNull();
  expect(await s.setDefault(key(ENG, null), a.view.id)).toMatchObject({ ok: false, reason: 'invalid' });
  expect(await s.setDefault(key(ADMIN), a.view.id)).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(await s.getDefaultId(key(ENG, null))).toBeNull();
});

it('a default that is deleted is not a default', async () => {
  const s = store(); const a = ok(await s.save(draft('a')));
  ok(await s.setDefault(key(ENG), a.view.id)); ok(await s.remove(a.view.id));
  expect(await s.getDefaultId(key(ENG))).toBeNull();
});

it.each(['update', 'setVisibility', 'requestOfficial', 'revoke'] as const)('a stale expectedVersion on %s returns conflict and changes nothing', async method => {
  const s = store(); const a = ok(await s.save(draft('a')));
  ok(await s.update(a.view.id, { name: 'b' }, { expectedVersion: 1 }));
  const snapshot = storage.getItem(savedViewsStorageKey(ENG, MENU));
  const stale = { expectedVersion: 1 };
  const result = method === 'update' ? await s.update(a.view.id, { name: 'c' }, stale)
    : method === 'setVisibility' ? await s.setVisibility(a.view.id, { kind: 'people', userIds: [] }, stale)
      : method === 'requestOfficial' ? await s.requestOfficial(a.view.id, stale) : await s.revoke(a.view.id, stale);
  expect(result.ok ? 'ok' : result.reason).toBe(method === 'revoke' ? 'forbidden' : 'conflict');
  expect(storage.getItem(savedViewsStorageKey(ENG, MENU))).toBe(snapshot);
});

// The ADR-0099 outcomes the server-conformance SavedViewStore suite pins on both implementations (#1131).
it('get of an existing view outside the actor\'s access is the denied entry, like the server (ADR-0099 §6)', async () => {
  const s = store(); const saved = ok(await s.save(draft('남의 비공개')));
  as('admin'); // the approver is not a share target of a private view
  expect(await store().get(saved.view.id)).toEqual({ id: saved.view.id, denied: true, reason: 'no-access' });
  expect(await store().get(`${ENG}|no-such-menu|99`)).toBeNull(); // a view that exists nowhere stays null
});

it('sharing to a group the actor cannot see is invalid like an unknown group, never forbidden (ADR-0099 §6)', async () => {
  as('admin');
  const group = ok(await store().createGroup({ name: '숨김 그룹', memberIds: ['u-kangminseo'] }));
  as('engineer'); // neither member nor manager, and no approval right
  const s = store(); const saved = ok(await s.save(draft('그룹 공유 대상')));
  expect(await s.setVisibility(saved.view.id, { kind: 'groups', groupIds: [group.group.id] }, { expectedVersion: 1 })).toEqual({ ok: false, reason: 'invalid', detail: 'unknown group' });
  expect(await s.setVisibility(saved.view.id, { kind: 'groups', groupIds: ['no-such-group'] }, { expectedVersion: 1 })).toEqual({ ok: false, reason: 'invalid', detail: 'unknown group' });
});

it('an approver deciding or revoking a reachable view in the wrong state answers invalid approval-state; without the right it stays forbidden', async () => {
  const s = store();
  const group = ok(await s.createGroup({ name: '승인 상태 그룹', memberIds: [ADMIN] }));
  const saved = ok(await s.save(draft('미신청 공유 뷰')));
  ok(await s.setVisibility(saved.view.id, { kind: 'groups', groupIds: [group.group.id] }, { expectedVersion: 1 }));
  as('admin');
  expect(await s.decide(saved.view.id, 'approve', undefined, { expectedVersion: 2 })).toEqual({ ok: false, reason: 'invalid', detail: 'approval-state' });
  expect(await s.revoke(saved.view.id, { expectedVersion: 2 })).toEqual({ ok: false, reason: 'invalid', detail: 'approval-state' });
  as('engineer');
  expect(await s.decide(saved.view.id, 'approve', undefined, { expectedVersion: 2 })).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(await s.revoke(saved.view.id, { expectedVersion: 2 })).toMatchObject({ ok: false, reason: 'forbidden' });
});

it('concurrent writes from independent instances are serialized by the lock; without a lock mutations fail closed', async () => {
  const a = store(); const b = store();
  const results = await Promise.all([a.save(draft('x')), b.save(draft('y')), a.save(draft('z'))]);
  expect(results.every(r => r.ok)).toBe(true);
  expect(new Set(visible(await a.list(key(ENG))).map(i => i.view.id)).size).toBe(visible(await a.list(key(ENG))).length);
  expect(visible(await a.list(key(ENG))).map(i => i.view.name)).toEqual(expect.arrayContaining(['x', 'y', 'z']));
  const closed = createLocalSavedViewStore({ getStorage: () => storage, locks: undefined, now: () => 5, menuPermissionsOf: permissionOf });
  const snapshot = storage.getItem(savedViewsStorageKey(ENG, MENU));
  expect(await closed.save(draft('n'))).toMatchObject({ ok: false, reason: 'unavailable' });
  expect(storage.getItem(savedViewsStorageKey(ENG, MENU))).toBe(snapshot);
});

it('approval walks pending→approved→revoked by transition and never takes a visibility from the caller', async () => {
  const s = store(); const a = ok(await s.save(draft('요청')));
  const pending = ok(await s.requestOfficial(a.view.id, { expectedVersion: a.view.version }));
  expect(pending.view).toMatchObject({ approval: 'pending', visibility: { kind: 'private' } });
  expect(await s.requestOfficial(a.view.id, { expectedVersion: pending.view.version })).toMatchObject({ ok: false, reason: 'invalid' });
  as('admin');
  const approved = ok(await s.decide(a.view.id, 'approve', undefined, { expectedVersion: pending.view.version }));
  expect(approved.view).toMatchObject({ approval: 'approved', visibility: { kind: 'official' } });
  expect(await s.setVisibility(a.view.id, { kind: 'official' }, { expectedVersion: approved.view.version })).toMatchObject({ ok: false, reason: 'invalid' });
});

it('seeds include a stale, a pending and a denied view for the engineer', async () => {
  const items = await store().list(key(ENG));
  expect(visible(items).some(i => i.view.kind === 'menu-view' && i.view.menuSchemaVersion < 2)).toBe(true);
  expect(visible(items).some(i => i.view.approval === 'pending')).toBe(true);
  expect(items.some(i => i.denied)).toBe(true);
  expect(visible(await store().list(key(ENG, null))).map(i => i.view.kind)).toEqual(['condition-set']);
});

it('searchPeople separates same-named people by affiliation and honors an aborted signal', async () => {
  const s = store();
  const found = await s.searchPeople('김민준', new AbortController().signal);
  expect(found.map(p => p.affiliation).sort()).toEqual(['설비기술팀', '포토공정1팀']);
  const aborted = new AbortController(); aborted.abort();
  expect(await s.searchPeople('김민준', aborted.signal)).toEqual([]);
});

const withRegistry = (): SavedViewStore => createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf });

it('C2: a menu outside the seed table is judged by the registry permission; unknown menus are rejected; denied is exactly {id, denied, reason}', async () => {
  const s = withRegistry();
  const eq = { ...draft('설비'), menuId: 'equipment-master' } as SavedViewDraft;
  const saved = ok(await s.save(eq));
  as('viewer');
  const raw = JSON.parse(storage.getItem(savedViewsStorageKey(ENG, 'equipment-master'))!);
  raw.views[0].visibility = { kind: 'people', userIds: ['viewer'] };
  storage.setItem(savedViewsStorageKey(ENG, 'equipment-master'), JSON.stringify(raw));
  const got = await withRegistry().get(saved.view.id);
  expect(got).toEqual({ id: saved.view.id, denied: true, reason: expect.any(String) });
  expect(await withRegistry().save({ ...draft('x'), menuId: 'no-such-menu' } as SavedViewDraft)).toMatchObject({ ok: false, reason: 'invalid' });
});

it('C3: editing an official copy keeps readers on the approved content until re-approval; a rejection does not publish the change', async () => {
  const s = withRegistry();
  const official = { ...byName(await s.list(key(ENG)), '공식 생산성 일일 점검').view, ownerId: ENG, id: `${ENG}|${MENU}|9` };
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify({ schemaVersion: 1, views: [official] }));
  ok(await s.update(official.id, { name: '공식 (수정)' }, { expectedVersion: official.version }));
  const reader = createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, getActor: () => ({ userId: 'viewer', admin: false, permissions: ['analytics:view'], rooms: ['PHOTO'] }), menuPermissionsOf: permissionOf });
  const asViewer = await reader.get(official.id);
  expect(asViewer).toMatchObject({ view: { name: official.name, approval: 'approved', visibility: { kind: 'official' } } });
  as('admin');
  const pending = await s.get(official.id);
  expect(pending).toMatchObject({ view: { name: '공식 (수정)', approval: 'pending' }, capabilities: { canApprove: true } });
  ok(await s.decide(official.id, 'reject', '반려', { expectedVersion: (pending as SavedViewEntry).view.version }));
  expect(await reader.get(official.id)).toMatchObject({ view: { name: official.name, approval: 'approved' } });
  as('admin');
  const again = await s.get(official.id);
  expect(again).toMatchObject({ view: { name: '공식 (수정)', approval: 'rejected' } });
});

it('clears legacy panels in a proposal while readers still see the approved copy', async () => {
  const s = store();
  const { view: saved } = ok(await s.save(draft()));
  const { view: requested } = ok(await s.requestOfficial(saved.id, { expectedVersion: saved.version }));
  as('admin');
  const { view: approved } = ok(await s.decide(saved.id, 'approve', undefined, { expectedVersion: requested.version }));
  const bucket = savedViewsStorageKey(ENG, MENU);
  const oldPanels = { before: 1 };
  storage.setItem(bucket, JSON.stringify({ schemaVersion: 1, views: [{ ...approved, panels: oldPanels }] }));

  as('engineer');
  ok(await s.update(saved.id, { panels: null }, { expectedVersion: approved.version }));
  const ownerView = await s.get(saved.id);
  expect(ownerView).toMatchObject({ view: { approval: 'pending', panels: null } });
  expect(ownerView).not.toHaveProperty('view.panelsUnreadable');

  const reader = createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, getActor: () => ({ userId: 'viewer', admin: false, permissions: ['analytics:view'], rooms: ['PHOTO'] }), menuPermissionsOf: permissionOf });
  expect(await reader.get(saved.id)).toMatchObject({ view: { approval: 'approved', panels: null, panelsUnreadable: true } });
  const stored = JSON.parse(storage.getItem(bucket) ?? '{}');
  expect(stored.views).toMatchObject([{ id: saved.id, pending: { panels: null } }]);
  expect(stored.views[0].panels).toStrictEqual(oldPanels);
  as('admin');
  expect((await s.listApprovalRequests(key(ADMIN))).find(request => request.viewId === saved.id)?.changes).toEqual(['패널 변경']);
});

it('C4: updating a readable view with a context the caller may not read is forbidden and changes nothing', async () => {
  const s = store(); const a = ok(await s.save(draft('a')));
  const snapshot = storage.getItem(savedViewsStorageKey(ENG, MENU));
  const r = await s.update(a.view.id, { context: { roomNames: ['CMP'] } }, { expectedVersion: a.view.version });
  expect(r).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(storage.getItem(savedViewsStorageKey(ENG, MENU))).toBe(snapshot);
});

it('C5: ids are never reused, so a deleted default and old versions do not attach to a new view', async () => {
  const s = store(); const a = ok(await s.save(draft('a')));
  ok(await s.setDefault(key(ENG), a.view.id)); ok(await s.remove(a.view.id));
  const b = ok(await s.save(draft('b')));
  expect(b.view.id).not.toBe(a.view.id);
  expect(await s.getDefaultId(key(ENG))).toBeNull();
  expect(await s.update(a.view.id, { name: 'z' }, { expectedVersion: 1 })).toMatchObject({ ok: false });
});

it('C6: malformed stored entries are dropped without hiding the healthy ones, and a corrupt group does not break reads', async () => {
  const s = store(); ok(await s.save(draft('정상')));
  const raw = JSON.parse(storage.getItem(savedViewsStorageKey(ENG, MENU))!);
  raw.views.push({ id: `${ENG}|${MENU}|7`, ownerId: ENG, version: 1, visibility: { kind: 'private' }, approval: 'none' });
  raw.views.push({ ...raw.views[0], id: `other|${MENU}|1`, name: '남의 버킷' });
  raw.views.push({ ...raw.views[0], id: `${ENG}|${MENU}|8`, name: '나쁜 공유', visibility: { kind: 'people', userIds: 'x' } });
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify(raw));
  storage.setItem(savedViewGroupsStorageKey(), JSON.stringify({ schemaVersion: 1, groups: [{ id: 'g', memberIds: [1], managerIds: [], kind: 'custom', name: 'x' }, { nope: true }] }));
  const names = visible(await s.list(key(ENG))).map(i => i.view.name);
  expect(names).toContain('정상');
  expect(names).not.toEqual(expect.arrayContaining(['남의 버킷']));
  expect(names).not.toContain('나쁜 공유');
  expect(await s.get(`${ENG}|${MENU}|7`)).toBeNull();
});

it('C7: a new group has only the explicitly chosen members; the creator manages without being a member', async () => {
  const s = store();
  const g = ok(await s.createGroup({ name: '새 그룹', memberIds: [] }));
  expect(g.group.memberCount).toBe(0);
  expect(g.group.managerIds).toEqual([ENG]);
  expect(g.capabilities.canEditMembers).toBe(true);
  expect(ok(await s.createGroup({ name: '둘', memberIds: ['u-kangminseo'] })).members.map(m => m.userId)).toEqual(['u-kangminseo']);
});

it('update carries menuSchemaVersion of a menu view and refuses it on a condition set', async () => {
  const s = store();
  const old = byName(await s.list(key(ENG)), 'LOT 추이 (이전 형식)').view;
  expect(old).toMatchObject({ menuSchemaVersion: 1 });
  const next = ok(await s.update(old.id, { menuSchemaVersion: 2, page: { grain: ['day'] } }, { expectedVersion: old.version }));
  expect(next.view).toMatchObject({ menuSchemaVersion: 2, version: old.version + 1 });
  expect(byName(await s.list(key(ENG)), 'LOT 추이 (이전 형식)').view).toMatchObject({ menuSchemaVersion: 2 });
  const set = byName(await s.list(key(ENG, null)), '야간 A동').view;
  expect(await s.update(set.id, { menuSchemaVersion: 2 }, { expectedVersion: set.version })).toMatchObject({ ok: false, reason: 'invalid' });
});

it('lists pending decisions only for approvers and retains the owner’s pending view', async () => {
  const mine = byName(await store().list(key(ENG)), '일일 점검 (승인 대기)').view;
  expect(await store().listApprovalRequests(key(ENG))).toEqual([]);
  as('viewer');
  expect(await store().listApprovalRequests(key('viewer'))).toEqual([]);
  as('admin');
  const forAdmin = await store().listApprovalRequests(key(ADMIN));
  expect(forAdmin.map(r => r.requestedBy)).toContain('u-yoondohyun');
  expect(forAdmin).toContainEqual(expect.objectContaining({ viewId: mine.id, requestedBy: ENG, targetVersion: 1, changes: expect.any(Array) }));
  expect(forAdmin.every(r => r.viewId.length > 0)).toBe(true);
  expect(await store().listApprovalRequests(key('someone-else'))).toEqual([]);
});

it('an edit of an official copy lists what the proposal changes and a rejection keeps its reason', async () => {
  const s = store();
  const official = { ...byName(await s.list(key(ENG)), '공식 생산성 일일 점검').view, ownerId: ENG, id: `${ENG}|${MENU}|9` };
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify({ schemaVersion: 1, views: [official] }));
  const edited = ok(await s.update(official.id, { name: '공식 (수정)' }, { expectedVersion: official.version }));
  as('admin');
  const request = (await s.listApprovalRequests(key(ADMIN))).find(row => row.viewId === official.id);
  expect(request?.changes.join(' ')).toContain('공식 (수정)');
  ok(await store().decide(official.id, 'reject', '근거 부족', { expectedVersion: edited.view.version }));
  as('engineer');
  expect((await store().listApprovalRequests(key(ENG)))[0]).toMatchObject({ rejectReason: '근거 부족' });
});

it('keeps the rejected official proposal when a My Menus patch echoes the shown name', async () => {
  const s = store();
  const { view: saved } = ok(await s.save({ ...draft('Published'), myMenu: true } as SavedViewDraft));
  const { view: requested } = ok(await s.requestOfficial(saved.id, { expectedVersion: saved.version }));
  as('admin');
  const { view: approved } = ok(await s.decide(saved.id, 'approve', undefined, { expectedVersion: requested.version }));
  as('engineer');
  const proposedContent = { name: 'Proposed', page: { grain: ['day'] } };
  const { view: pending } = ok(await s.update(saved.id, proposedContent, { expectedVersion: approved.version }));
  as('admin');
  const { view: rejected } = ok(await s.decide(saved.id, 'reject', 'Needs evidence', { expectedVersion: pending.version }));
  as('engineer');
  const { view: updated } = ok(await s.update(saved.id, { myMenu: false, name: rejected.name }, { expectedVersion: rejected.version }));
  expect(updated).toMatchObject({ ...proposedContent, approval: 'rejected', approvalNote: 'Needs evidence' });
  expect(updated).not.toHaveProperty('myMenu');
});

it('treats a sparse layout sent with a My Menus patch as a content edit, as stored JSON reads it', async () => {
  const s = store();
  const { view: saved } = ok(await s.save({ ...draft('Published'), myMenu: true } as SavedViewDraft));
  const { view: requested } = ok(await s.requestOfficial(saved.id, { expectedVersion: saved.version }));
  as('admin');
  const { view: approved } = ok(await s.decide(saved.id, 'approve', undefined, { expectedVersion: requested.version }));
  as('engineer');
  const { view: pending } = ok(await s.update(saved.id, { layout: [1] }, { expectedVersion: approved.version }));
  as('admin');
  const { view: rejected } = ok(await s.decide(saved.id, 'reject', 'Needs evidence', { expectedVersion: pending.version }));
  as('engineer');
  // A hole is written as null, so `[1]` → `new Array(1)` changes the content and must become a pending proposal again.
  ok(await s.update(saved.id, { myMenu: false, layout: new Array<JsonValue>(1) }, { expectedVersion: rejected.version }));
  const read = await s.get(saved.id);
  expect(read).toMatchObject({ view: { approval: 'pending', layout: [null] } });
  expect(read).not.toHaveProperty('view.myMenu');
});

// A menu that needs two grants (menuPermissions): each grant alone is not enough on any path, both are, revoking one denies an existing view.
describe('a menu requiring platform:view AND console:access', () => {
  let held: string[] = [];
  const asHolder = (): SavedViewStore => createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, getActor: () => ({ userId: ENG, admin: false, permissions: held, rooms: ['PHOTO'] }), menuPermissionsOf: permissionOf });
  const both = { ...draft('둘 다'), menuId: 'needs-both' } as SavedViewDraft;
  it.each([[['platform:view']], [['console:access']], [[]]])('denies saving with %j', async grants => {
    held = grants;
    expect(await asHolder().save(both)).toMatchObject({ ok: false, reason: 'forbidden' });
  });
  it('saves, reads and updates with both grants; one revoked denies the existing view and the update', async () => {
    held = ['platform:view', 'console:access'];
    const s = asHolder(); const saved = ok(await s.save(both));
    expect(visible(await s.list(key(ENG, 'needs-both'))).map(i => i.view.name)).toContain('둘 다');
    ok(await s.update(saved.view.id, { name: '수정' }, { expectedVersion: saved.view.version }));
    for (const left of [['platform:view'], ['console:access']]) {
      held = left;
      expect(await s.get(saved.view.id)).toEqual({ id: saved.view.id, denied: true, reason: expect.any(String) });
      expect(await s.update(saved.view.id, { name: '막힘' }, { expectedVersion: saved.view.version + 1 })).toMatchObject({ ok: false });
    }
  });
});

// The seed option (#1702h): another seed replaces actors, directory, groups and views at once.
it('passing a seed replaces actors, directory, groups and views', async () => {
  const shared: SavedView = {
    id: `u1|${MENU}|1`, schemaVersion: 1, kind: 'menu-view', menuId: MENU, menuSchemaVersion: 2,
    name: '사용자 정의 시드 뷰', ownerId: 'u1', version: 1, updatedAt: 5,
    visibility: { kind: 'people', userIds: ['admin'] }, approval: 'none',
    context: { relativePeriod: { hours: 24 } }, page: { granularity: ['hour'] }, chartOptions: { stacked: true }, layout: null, panels: null,
  };
  as('admin');
  const s = createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf,
    seed: {
      actors: { admin: { userId: 'admin', admin: true, permissions: ['analytics:view'], rooms: [] } },
      directory: [
        { userId: 'admin', displayName: '관리자', affiliation: '테스트팀' },
        { userId: 'u1', displayName: '사용자', affiliation: '테스트팀' },
      ],
      groups: () => [{ id: 'g-custom', kind: 'custom', name: '사용자 그룹', managerIds: ['admin'], memberIds: ['admin', 'u1'] }],
      views: (ownerId, menuId) => ownerId === 'u1' && menuId === MENU ? [shared] : [],
    },
  });
  expect(visible(await s.list(key('admin'))).map(i => i.view.name)).toEqual(['사용자 정의 시드 뷰']); // views and directory replaced
  expect(await s.listGroups()).toMatchObject([{ group: { id: 'g-custom', name: '사용자 그룹' } }]); // groups replaced
  expect((await s.searchPeople('관리자', new AbortController().signal)).map(p => p.userId)).toEqual(['admin']); // directory replaced
  expect(await s.searchPeople('한지우', new AbortController().signal)).toEqual([]); // the default directory is gone
  ok(await s.setDefault(key('admin'), shared.id)); // the actor is the seed's admin, not the default one
});

// The three storage key formats as literals, so a rename cannot slip through the exported helpers.
it('the three storage key formats are the pinned literals', async () => {
  const s = store(); ok(await s.save(draft()));
  const id = visible(await s.list(key(ENG)))[0]!.view.id;
  ok(await s.setDefault(key(ENG), id));
  ok(await s.createGroup({ name: '새 그룹', memberIds: [] }));
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
  expect(keys).toContain(`platform:saved-views:v1:${JSON.stringify([1, ENG, MENU])}`);
  expect(keys).toContain(`platform:saved-view-default:v1:${JSON.stringify([1, ENG, MENU])}`);
  expect(keys).toContain(`platform:saved-view-groups:v1:${JSON.stringify([1])}`);
});

// Fix-round 1 (#1702h): condition sets pass through the same room ACL as menu views, and the denial reasons
// stay the user-facing Korean strings (ViewSelector renders `reason` as-is).
const SCOPE_REASON = '조회 권한이 없는 공정이 포함되어 있습니다.';
const conditionDraft = (roomNames: string[]): SavedViewDraft =>
  ({ schemaVersion: 1, kind: 'condition-set', name: 'CMP 조건', context: { roomNames } });

it.each(['withdraw', 'revoke'] as const)('allows %s while the approved copy stays outside the caller’s room grant', async op => {
  const make = (userId: string, admin: boolean, rooms: string[]) => createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf,
    getActor: () => ({ userId, admin, permissions: ['analytics:view'], rooms }),
  });
  const ownerId = 'u-limchaewon';
  const owner = make(ownerId, false, ['CMP', 'PHOTO']);
  const approver = make(ADMIN, true, ['CMP', 'PHOTO']);
  const { view: { id, version } } = ok(await owner.save(conditionDraft(['CMP'])));
  const request = ok(await owner.requestOfficial(id, { expectedVersion: version }));
  const approved = ok(await approver.decide(id, 'approve', undefined, { expectedVersion: request.view.version }));
  const proposal = ok(await owner.update(id, { context: { roomNames: ['PHOTO'] } }, { expectedVersion: approved.view.version }));

  const caller = op === 'withdraw' ? make(ownerId, false, ['PHOTO']) : make(ADMIN, true, ['PHOTO']);
  expect(await caller.get(id)).toMatchObject({ view: { approval: 'pending', context: { roomNames: ['PHOTO'] } } });
  const result = await caller[op]?.(id, { expectedVersion: proposal.view.version });
  expect(result).toMatchObject({ ok: true, value: { view: { approval: op === 'withdraw' ? 'approved' : 'none', context: { roomNames: ['CMP'] } } } });
  const reader = op === 'withdraw' ? caller : make(ownerId, false, ['PHOTO']);
  expect(await reader.get(id)).toEqual({ id, denied: true, reason: SCOPE_REASON });
});

it('allows an owner to request approval after losing access to the saved room', async () => {
  let rooms = ['CMP'];
  const s = createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf,
    getActor: () => ({ userId: ENG, admin: false, permissions: ['analytics:view'], rooms }),
  });
  const { view } = ok(await s.save(conditionDraft(['CMP'])));
  rooms = ['PHOTO'];
  expect(await s.requestOfficial(view.id, { expectedVersion: view.version })).toMatchObject({ ok: true, value: { view: { approval: 'pending' } } });
  expect(await s.get(view.id)).toEqual({ id: view.id, denied: true, reason: SCOPE_REASON });
});

it('a condition set with a room outside the actor is refused on save, like a menu view', async () => {
  expect(await store().save(conditionDraft(['CMP']))).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(storage.getItem(savedViewsStorageKey(ENG, null))).toBeNull(); // nothing was written
});

it('a condition set saved earlier is re-judged on every read after the room is lost (get/list/update/default)', async () => {
  const owner = 'u-limchaewon'; // in the seed directory, so the owner's bucket is iterated on list
  const setKey = { userId: owner, menuId: null };
  const withCmp = (): SavedViewStore => createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf, getActor: () => ({ userId: owner, admin: false, permissions: ['analytics:view'], rooms: ['PHOTO', 'CMP'] }) });
  const withoutCmp = (): SavedViewStore => createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf, getActor: () => ({ userId: owner, admin: false, permissions: ['analytics:view'], rooms: ['PHOTO'] }) });
  const saved = ok(await withCmp().save(conditionDraft(['CMP'])));
  ok(await withCmp().setDefault(setKey, saved.view.id));
  expect(await withoutCmp().get(saved.view.id)).toEqual({ id: saved.view.id, denied: true, reason: SCOPE_REASON });
  expect(await withoutCmp().list(setKey)).toEqual([{ id: saved.view.id, denied: true, reason: SCOPE_REASON }]);
  expect(await withoutCmp().update(saved.view.id, { name: '수정' }, { expectedVersion: saved.view.version })).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(await withoutCmp().getDefaultId(setKey)).toBeNull();
  expect(await withoutCmp().setDefault(setKey, saved.view.id)).toMatchObject({ ok: false, reason: 'invalid' });
});

it('denial reasons are the user-facing Korean messages, not internal codes', async () => {
  const s = store(); ok(await s.save(draft('내 뷰'))); // engineer saves
  const items = await s.list(key(ENG));
  expect(items.find(i => i.denied)).toEqual({ id: 'u-limchaewon|productivity-overview|1', denied: true, reason: SCOPE_REASON });
  as('viewer');
  const raw = JSON.parse(storage.getItem(savedViewsStorageKey(ENG, MENU))!);
  raw.views.find((v: { name: string }) => v.name === '내 뷰')!.visibility = { kind: 'people', userIds: ['viewer'] };
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify(raw));
  expect((await store().list(key('viewer'))).every(i => i.denied && i.reason === '이 메뉴를 열 권한이 없습니다.')).toBe(true);
});

it('a replacement seed falls back to its first actor when the stored role is missing or obsolete', async () => {
  const make = (): SavedViewStore => createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5, menuPermissionsOf: permissionOf,
    seed: {
      actors: { alice: { userId: 'alice', admin: false, permissions: ['analytics:view'], rooms: ['PHOTO'] } },
      directory: [{ userId: 'alice', displayName: '앨리스', affiliation: '테스트팀' }],
      groups: () => [],
      views: () => [],
    },
  });
  storage.removeItem('platform:role'); // missing role storage: no `engineer` was ever stored
  const saved = ok(await make().save(draft('앨리스 뷰')));
  expect(saved.view.ownerId).toBe('alice');
  storage.setItem('platform:role', JSON.stringify('engineer')); // obsolete role for this seed
  expect(visible(await make().list(key('alice'))).map(i => i.view.name)).toEqual(['앨리스 뷰']);
  expect(() => createLocalSavedViewStore({
    getStorage: () => storage, locks, now: () => 5,
    seed: { actors: {}, directory: [], groups: () => [], views: () => [] },
  })).toThrow(/at least one actor/);
});

it('a view saved before the panel-instance format stays readable and is kept when another view is saved; saving the old value is refused (#2760)', async () => {
  const s = store();
  const saved = ok(await s.save(draft('옛 패널')));
  const old = { ...saved.view, panels: { narrow: { selection: ['E1'] } } };
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify({ schemaVersion: 1, views: [old] }));
  expect(await s.get(old.id)).toMatchObject({ view: { id: old.id, panels: null, panelsUnreadable: true } });
  ok(await s.save(draft('새 뷰')));
  expect(visible(await s.list(key(ENG))).map(i => i.view.name)).toEqual(expect.arrayContaining(['옛 패널', '새 뷰']));
  expect(await s.save({ ...draft(), panels: { narrow: {} } } as unknown as SavedViewDraft)).toMatchObject({ ok: false, reason: 'invalid' });
});

it('an old panels value holding a non-finite number stays unreadable instead of turning into null on the next write (#2760)', async () => {
  const s = store();
  const saved = ok(await s.save(draft('무한')));
  const raw = JSON.stringify({ schemaVersion: 1, views: [{ ...saved.view, panels: { n: 7 } }] }).replace('"n":7', '"n":1e400');
  storage.setItem(savedViewsStorageKey(ENG, MENU), raw);
  expect(await s.get(saved.view.id)).toBeNull();
});

it.each([
  ['a NUL in the name', { name: 'a\u0000b' }],
  ['an unpaired surrogate in a page value', { page: { grain: ['\ud800x'] } }],
  ['a NUL in a page key', { page: { grain: ['hour'], ['a\u0000']: ['x'] } }],
])('refuses %s on save and on update like the server and the HTTP adapter, and writes nothing (#2991)', async (_label, over) => {
  const s = store();
  expect(await s.save({ ...draft(), ...over } as SavedViewDraft)).toMatchObject({ ok: false, reason: 'invalid' });
  const saved = ok(await s.save(draft()));
  const dump = () => Array.from({ length: storage.length }, (_, i) => storage.key(i)!).map(k => `${k}=${storage.getItem(k)}`).join('\n');
  const before = dump();
  expect(await s.update(saved.view.id, over as never, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
  expect(dump()).toBe(before);
});

it('keeps a row stored before the text rule readable, and an unrelated save never drops it (#2991)', async () => {
  const s = store();
  const old = ok(await s.save(draft('old')));
  const name = Array.from({ length: storage.length }, (_, i) => storage.key(i)!).find(k => storage.getItem(k)!.includes(old.view.id))!;
  storage.setItem(name, storage.getItem(name)!.replace('"name":"old"', '"name":"o\\u0000ld"'));
  expect(await s.get(old.view.id)).toMatchObject({ view: { name: 'o\u0000ld' } });
  ok(await s.save(draft('new')));
  expect(storage.getItem(name)).toContain(old.view.id);
  expect(await s.get(old.view.id)).toMatchObject({ view: { name: 'o\u0000ld' } });
});
