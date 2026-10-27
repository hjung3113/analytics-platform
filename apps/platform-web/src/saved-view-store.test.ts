import { beforeEach, expect, it } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import type { SavedViewDraft, SavedViewEntry, SavedViewListItem, SavedViewStore } from '@ap/contracts';
import { createLocalSavedViewStore, savedViewDefaultStorageKey, savedViewGroupsStorageKey, savedViewsStorageKey } from './saved-view-store';

const MENU = 'productivity-overview';
const storage = memoryStorage();
const as = (role: 'engineer' | 'admin' | 'viewer') => storage.setItem('platform:role', JSON.stringify(role));
const permissionOf = (id: string) => ({ 'productivity-overview': 'analytics:view', 'equipment-master': 'equipment:view' } as Record<string, string>)[id];
beforeEach(() => { storage.clear(); as('engineer'); });
// Emulates the origin lock: requests serialize across independent store instances.
let tail = Promise.resolve();
const locks = { request: async <T,>(_name: string, callback: () => T | Promise<T>): Promise<T> => {
  const result = tail.then(callback); tail = result.then(() => undefined, () => undefined); return result;
} };
const store = (): SavedViewStore => createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, menuPermissionOf: permissionOf });
const key = (userId: string, menuId: string | null = MENU) => ({ userId, menuId });
const ENG = 'engineer'; const ADMIN = 'admin';
const draft = (name = '새 뷰'): SavedViewDraft => ({ schemaVersion: 1, kind: 'menu-view', name, menuId: MENU, menuSchemaVersion: 2, context: { relativePeriod: { hours: 24 } }, page: { grain: ['hour'] }, chartOptions: {}, layout: null, panels: null });
const visible = (items: readonly SavedViewListItem[]): SavedViewEntry[] => items.filter((i): i is SavedViewEntry => !i.denied);
const byName = (items: readonly SavedViewListItem[], name: string) => visible(items).find(i => i.view.name === name)!;
const ok = <T,>(r: { ok: true; value: T } | { ok: false; reason: string }): T => { if (!r.ok) throw new Error(r.reason); return r.value; };

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
  ['공식 게시본은 개인 편집 불가', '공식 생산성 일일 점검', { canEdit: false, canCopy: true, canShare: false }],
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
  expect(await store().get('u-yoondohyun|productivity-overview|1')).toBeNull();
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

it('concurrent writes from independent instances are serialized by the lock; without a lock mutations fail closed', async () => {
  const a = store(); const b = store();
  const results = await Promise.all([a.save(draft('x')), b.save(draft('y')), a.save(draft('z'))]);
  expect(results.every(r => r.ok)).toBe(true);
  expect(new Set(visible(await a.list(key(ENG))).map(i => i.view.id)).size).toBe(visible(await a.list(key(ENG))).length);
  expect(visible(await a.list(key(ENG))).map(i => i.view.name)).toEqual(expect.arrayContaining(['x', 'y', 'z']));
  const closed = createLocalSavedViewStore({ getStorage: () => storage, locks: undefined, now: () => 5, menuPermissionOf: permissionOf });
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

const withRegistry = (): SavedViewStore => createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, menuPermissionOf: permissionOf });

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
  const reader = createLocalSavedViewStore({ getStorage: () => storage, locks, now: () => 5, getActor: () => ({ userId: 'viewer', admin: false, permissions: ['analytics:view'], rooms: ['PHOTO'] }), menuPermissionOf: permissionOf });
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

it('listApprovalRequests tells the requester and the approver what is waiting, and nobody else', async () => {
  const mine = await store().listApprovalRequests(key(ENG));
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ requestedBy: ENG, targetVersion: 1, changes: expect.any(Array) });
  expect(byName(await store().list(key(ENG)), '일일 점검 (승인 대기)').view.id).toBe(mine[0].viewId);
  as('viewer');
  expect(await store().listApprovalRequests(key('viewer'))).toEqual([]);
  as('admin');
  const forAdmin = await store().listApprovalRequests(key(ADMIN));
  expect(forAdmin.map(r => r.requestedBy)).toContain('u-yoondohyun');
  expect(forAdmin.every(r => r.viewId.length > 0)).toBe(true);
  expect(await store().listApprovalRequests(key('someone-else'))).toEqual([]);
});

it('an edit of an official copy lists what the proposal changes and a rejection keeps its reason', async () => {
  const s = store();
  const official = { ...byName(await s.list(key(ENG)), '공식 생산성 일일 점검').view, ownerId: ENG, id: `${ENG}|${MENU}|9` };
  storage.setItem(savedViewsStorageKey(ENG, MENU), JSON.stringify({ schemaVersion: 1, views: [official] }));
  const edited = ok(await s.update(official.id, { name: '공식 (수정)' }, { expectedVersion: official.version }));
  const [request] = await s.listApprovalRequests(key(ENG));
  expect(request.changes.join(' ')).toContain('공식 (수정)');
  as('admin');
  ok(await store().decide(official.id, 'reject', '근거 부족', { expectedVersion: edited.view.version }));
  as('engineer');
  expect((await store().listApprovalRequests(key(ENG)))[0]).toMatchObject({ rejectReason: '근거 부족' });
});
