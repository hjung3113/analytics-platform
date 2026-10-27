import {
  canTransition, validateSavedView,
  type ApprovalRequestInfo, type GroupCapabilities, type GroupMember, type Result, type SavedView, type SavedViewDraft, type SavedViewEntry, type SavedViewKey,
  type SavedViewListItem, type SavedViewPatch, type SavedViewStore, type ViewCapabilities, type ViewGroupEntry, type ViewVisibility,
} from '@ap/contracts';
import { ACTORS, DIRECTORY, MENU_PERMISSIONS, ROLE_KEY, seedGroups, seedViews, type Actor, type GroupRecord } from './saved-view-seed';

// Not the FeedbackOps `savedViewsSlot` (sidebar list): this is the SDK saved-view port's browser-local simulation of a server ACL (#1011).
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Locks = { request<T>(name: string, callback: () => T | Promise<T>): Promise<T> };
const tuple = (...parts: (string | null)[]) => JSON.stringify([1, ...parts]);
export const savedViewsStorageKey = (ownerId: string, menuId: string | null) => 'platform:saved-views:v1:' + tuple(ownerId, menuId);
export const savedViewDefaultStorageKey = (userId: string, menuId: string | null) => 'platform:saved-view-default:v1:' + tuple(userId, menuId);
export const savedViewGroupsStorageKey = () => 'platform:saved-view-groups:v1:' + tuple();
/** One origin lock serializes every mutation of every key (views, defaults, groups) across tabs. */
const LOCK = 'platform:saved-views:v1';
const REVOKE_NOTE = '공식 게시가 회수되어 개인 비공개로 돌아왔습니다.';

const fail = (reason: 'conflict' | 'forbidden' | 'unavailable' | 'invalid', detail?: string): Result<never> => ({ ok: false, reason, ...(detail ? { detail } : {}) });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

type Read<T> = { future: boolean; value: T | null };
/** `value: null` = never written (the seed applies); a malformed envelope reads as empty and is replaced on the next write. */
function readEnvelope<T>(storage: StoragePort, name: string, field: string, item: (v: unknown) => boolean): Read<T[]> {
  const raw = storage.getItem(name);
  if (raw === null) return { future: false, value: null };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { future: false, value: [] }; }
  if (!isObject(parsed)) return { future: false, value: [] };
  if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > 1) return { future: true, value: [] };
  const list = parsed[field];
  if (parsed.schemaVersion !== 1 || !Array.isArray(list)) return { future: false, value: [] };
  return { future: false, value: list.filter(item) as T[] };
}
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const APPROVALS: readonly string[] = ['none', 'pending', 'approved', 'rejected'];
const visibilityOk = (v: unknown) => isObject(v) && (v.kind === 'private' || v.kind === 'official' || (v.kind === 'people' && isStrings(v.userIds)) || (v.kind === 'groups' && isStrings(v.groupIds)));
/** Stored JSON is not trusted: payload, sharing enums, version and the bucket identity (id = owner|menu|seq) are all checked before a row is used. */
const viewShape = (v: unknown, ownerId: string, menuId: string | null): v is Record<string, unknown> => {
  if (!isObject(v) || typeof v.id !== 'string' || v.ownerId !== ownerId) return false;
  const at = parseId(v.id); if (!at || at.ownerId !== ownerId || at.menuId !== menuId) return false;
  if (typeof v.version !== 'number' || !Number.isFinite(v.version) || typeof v.updatedAt !== 'number') return false;
  if (!visibilityOk(v.visibility) || typeof v.approval !== 'string' || !APPROVALS.includes(v.approval)) return false;
  if (v.approvalNote !== undefined && typeof v.approvalNote !== 'string') return false;
  const { pending: _p, ...content } = v; void _p;
  if (!validateSavedView(content).ok) return false;
  return viewMenuId(content as { kind: string; menuId?: string }) === menuId;
};
const storedView = (ownerId: string, menuId: string | null) => (v: unknown) => viewShape(v, ownerId, menuId) && (v.pending === undefined || viewShape(v.pending, ownerId, menuId));
const storedGroup = (v: unknown) => isObject(v) && typeof v.id === 'string' && (v.kind === 'org-team' || v.kind === 'custom') && typeof v.name === 'string' && isStrings(v.memberIds) && isStrings(v.managerIds);

/** The current user comes from the mock session role the app already keeps in `platform:role`. */
const storedActor = (storage: StoragePort): Actor => {
  let role = 'engineer';
  try { const raw = storage.getItem(ROLE_KEY); const parsed = raw ? JSON.parse(raw) : null; if (typeof parsed === 'string' && Object.hasOwn(ACTORS, parsed)) role = parsed; } catch { /* keep the default role */ }
  return ACTORS[role];
};

const parseId = (id: string): { ownerId: string; menuId: string | null } | null => {
  const parts = id.split('|');
  return parts.length === 3 && parts[0] !== '' ? { ownerId: parts[0], menuId: parts[1] === '' ? null : parts[1] } : null;
};
const viewMenuId = (v: { kind: string; menuId?: string }) => (v.kind === 'menu-view' ? (v.menuId ?? null) : null);

const isMember = (g: GroupRecord, a: Actor) => g.memberIds.includes(a.userId);
const isManager = (g: GroupRecord, a: Actor) => g.managerIds.includes(a.userId);
const sharedGroups = (v: SavedView, groups: readonly GroupRecord[]) => { const vis = v.visibility; return vis.kind === 'groups' ? groups.filter(g => vis.groupIds.includes(g.id)) : []; };
const isOfficial = (v: SavedView) => v.visibility.kind === 'official';

function groupCapabilities(g: GroupRecord, a: Actor): GroupCapabilities {
  const canView = a.admin || isMember(g, a) || isManager(g, a);
  const mutable = g.kind === 'custom' && (a.admin || isManager(g, a));
  return { canView, canEditMembers: mutable, canRename: mutable, canDelete: mutable };
}

/** The only place scope, menu permission and sharing are judged; every read goes through it again. */
/** `forced` skips reachability for the entry a mutation answers with (an admin's revoke makes the view unreachable to the admin). */
type MenuPermissionOf = (menuId: string) => string | undefined;
/** A stored view; `pending` is an edit of the approved official copy waiting for (re)approval, kept apart so readers keep the approved content. */
type Stored = SavedView & { pending?: SavedView };
/** The owner and an approver see the proposed change; everyone else the approved copy. */
const shownTo = (v: Stored, a: Actor, owner: boolean): SavedView => { const { pending, ...published } = v; return pending && (owner || a.admin) ? pending : (published as SavedView); };
/** Why this content is out of the actor's reach, or null. An unknown menu is denied, not waved through. */
function denial(content: { kind: string; menuId?: string; context: { roomNames?: string[] | null } }, a: Actor, perm: MenuPermissionOf): string | null {
  const menuId = viewMenuId(content);
  if (menuId !== null) {
    const needed = perm(menuId);
    if (needed === undefined) return '알 수 없는 메뉴입니다.';
    if (!a.permissions.includes(needed)) return '이 메뉴를 열 권한이 없습니다.';
  }
  if (content.context.roomNames?.some(r => !a.rooms.includes(r))) return '조회 권한이 없는 공정이 포함되어 있습니다.';
  return null;
}
function evaluate(stored: Stored, a: Actor, groups: readonly GroupRecord[], perm: MenuPermissionOf, forced = false): SavedViewListItem | null {
  const v = stored;
  const owner = v.ownerId === a.userId;
  const viaGroup = sharedGroups(v, groups).some(g => isMember(g, a) || isManager(g, a));
  const reachable = owner || isOfficial(v) || (v.visibility.kind === 'people' && v.visibility.userIds.includes(a.userId)) || viaGroup || (a.admin && (v.approval === 'pending' || v.pending?.approval === 'pending'));
  if (!reachable && !forced) return null;
  const shown = shownTo(v, a, owner);
  const reason = denial(shown, a, perm);
  if (reason) return { id: v.id, denied: true, reason };
  const manager = sharedGroups(v, groups).some(g => isManager(g, a));
  const published = isOfficial(shown) && shown.approval === 'approved';
  const canEdit = (owner || manager) && !published;
  const capabilities: ViewCapabilities = {
    canView: true, canCopy: true, canEdit,
    canShare: (owner || manager) && !isOfficial(shown),
    canApprove: a.admin && canTransition(shown.approval, 'approve'),
    canRevoke: a.admin && isOfficial(v) && canTransition(v.approval, 'revoke'),
    ...(canEdit ? {} : { reason: published ? '공식 게시본은 직접 편집할 수 없습니다. 변경하면 재승인을 요청합니다.' : '다른 사람의 뷰입니다. 복제해서 편집하세요.' }),
  };
  return { view: shown, capabilities };
}

/** Plain lines for what an approval would publish: the fields a pending edit changes, or the plain request for a first publication. */
function proposalChanges(stored: Stored): string[] {
  const { pending, ...published } = stored;
  if (!pending) return [`공식 게시 신청: "${published.name}"`];
  const lines: string[] = [];
  const differs = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);
  if (pending.name !== published.name) lines.push(`이름 "${published.name}" → "${pending.name}"`);
  if (differs(pending.context, published.context)) lines.push('조회 조건 변경');
  if (pending.kind === 'menu-view' && published.kind === 'menu-view') {
    if (pending.menuSchemaVersion !== published.menuSchemaVersion) lines.push(`메뉴 화면 버전 ${published.menuSchemaVersion} → ${pending.menuSchemaVersion}`);
    if (differs(pending.page, published.page)) lines.push('화면 키 변경');
    if (differs(pending.chartOptions, published.chartOptions)) lines.push('차트 옵션 변경');
    if (differs(pending.layout, published.layout)) lines.push('레이아웃 변경');
    if (differs(pending.panels, published.panels)) lines.push('패널 변경');
  }
  return lines.length > 0 ? lines : ['내용 변경 없이 재승인 요청'];
}

type Tx = { buckets: Map<string, { ownerId: string; menuId: string | null; views: Stored[] }>; groups: GroupRecord[] | null; defaults: Map<string, string | null> };

/** Browser-local simulation of a server ACL behind the SavedViewStore port. Mutations need the origin lock and fail closed without it. */
export function createLocalSavedViewStore(getStorage: () => StoragePort = () => localStorage, locks: Locks | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks, now: () => number = Date.now, getActor?: () => Actor, menuPermissionOf: MenuPermissionOf = id => MENU_PERMISSIONS[id], sessionPermissions?: () => readonly string[] | undefined): SavedViewStore {
  const ev = (v: Stored, a: Actor, groups: readonly GroupRecord[], forced = false) => evaluate(v, a, groups, menuPermissionOf, forced);
  /** The permission vocabulary is the real session's (what the Kernel judges menus by); the seed table is only the fallback before a session exists. */
  const actorNow = (): Actor => { const a = (getActor ?? (() => storedActor(getStorage())))(); const p = sessionPermissions?.(); return p ? { ...a, permissions: p } : a; };
  const readBucket = (storage: StoragePort, ownerId: string, menuId: string | null) => {
    const r = readEnvelope<Stored>(storage, savedViewsStorageKey(ownerId, menuId), 'views', storedView(ownerId, menuId));
    return { future: r.future, views: r.value ?? seedViews(ownerId, menuId) };
  };
  const readGroups = (storage: StoragePort) => {
    const r = readEnvelope<GroupRecord>(storage, savedViewGroupsStorageKey(), 'groups', storedGroup);
    return { future: r.future, groups: r.value ?? seedGroups() };
  };
  const visibleIn = (storage: StoragePort, a: Actor, menuId: string | null, groups: readonly GroupRecord[]) =>
    DIRECTORY.flatMap(p => readBucket(storage, p.userId, menuId).views.map(v => ev(v, a, groups))).filter((x): x is SavedViewListItem => x !== null);
  const find = (storage: StoragePort, a: Actor, id: string, groups: readonly GroupRecord[]) => {
    const at = parseId(id); if (!at) return null;
    const view = readBucket(storage, at.ownerId, at.menuId).views.find(v => v.id === id);
    return view ? ev(view, a, groups) : null;
  };
  const readDefault = (storage: StoragePort, key: SavedViewKey): string | null => {
    try { const v = JSON.parse(storage.getItem(savedViewDefaultStorageKey(key.userId, key.menuId)) ?? 'null'); return isObject(v) && v.schemaVersion === 1 && typeof v.id === 'string' ? v.id : null; } catch { return null; }
  };

  async function run<T>(work: (c: { storage: StoragePort; actor: Actor; groups: GroupRecord[]; tx: Tx; bucket: (ownerId: string, menuId: string | null) => Stored[] | null }) => Result<T>): Promise<Result<T>> {
    if (!locks) return fail('unavailable');
    try {
      return await locks.request(LOCK, () => {
        const storage = getStorage(); const actor = actorNow();
        const g = readGroups(storage);
        const tx: Tx = { buckets: new Map(), groups: null, defaults: new Map() };
        const bucket = (ownerId: string, menuId: string | null) => {
          const name = savedViewsStorageKey(ownerId, menuId);
          const held = tx.buckets.get(name); if (held) return held.views;
          const read = readBucket(storage, ownerId, menuId); if (read.future) return null;
          tx.buckets.set(name, { ownerId, menuId, views: read.views }); return read.views;
        };
        if (g.future) return fail('unavailable');
        const result = work({ storage, actor, groups: g.groups, tx, bucket });
        if (!result.ok) return result;
        for (const [name, b] of tx.buckets) storage.setItem(name, JSON.stringify({ schemaVersion: 1, views: b.views }));
        if (tx.groups) storage.setItem(savedViewGroupsStorageKey(), JSON.stringify({ schemaVersion: 1, groups: tx.groups }));
        for (const [name, id] of tx.defaults) { if (id === null) storage.removeItem(name); else storage.setItem(name, JSON.stringify({ schemaVersion: 1, id })); }
        return result;
      });
    } catch { return fail('unavailable'); }
  }

  /** Replace a stored view in its owner's bucket, bumping the version; the caller already passed the capability and version checks. */
  const commit = (c: { bucket: (o: string, m: string | null) => Stored[] | null }, next: Stored, a: Actor, groups: readonly GroupRecord[]): Result<SavedViewEntry> => {
    const views = c.bucket(next.ownerId, viewMenuId(next)); if (!views) return fail('unavailable');
    const version = next.version + 1; const updatedAt = now();
    const stamped: Stored = { ...next, version, updatedAt, ...(next.pending ? { pending: { ...next.pending, version, updatedAt } } : {}) };
    views[views.findIndex(v => v.id === next.id)] = stamped;
    return { ok: true, value: ev(stamped, a, groups, true) as SavedViewEntry };
  };
  /** Missing/unreachable → invalid; denied or lacking the capability → forbidden; stale version → conflict, nothing written. */
  const target = (c: { storage: StoragePort; actor: Actor; groups: GroupRecord[]; bucket: (o: string, m: string | null) => Stored[] | null }, id: string, expectedVersion: number, allowed: (e: SavedViewEntry) => boolean): Result<Stored> => {
    const at = parseId(id); const views = at ? c.bucket(at.ownerId, at.menuId) : null;
    const view = views?.find(v => v.id === id);
    const item = view ? ev(view, c.actor, c.groups) : null;
    if (!view || !item) return fail('invalid', 'not-found');
    if (item.denied || !allowed(item)) return fail('forbidden', item.denied ? item.reason : item.capabilities.reason);
    if (view.version !== expectedVersion) return fail('conflict');
    return { ok: true, value: view };
  };
  const person = (userId: string): GroupMember | undefined => { const p = DIRECTORY.find(d => d.userId === userId); return p && { userId, displayName: p.displayName, affiliation: p.affiliation }; };
  const groupEntry = (g: GroupRecord, a: Actor): ViewGroupEntry => ({
    group: { id: g.id, kind: g.kind, name: g.name, memberCount: g.memberIds.length, ...(g.managerIds.length ? { managerIds: g.managerIds } : {}) },
    members: g.memberIds.flatMap(id => person(id) ?? []), capabilities: groupCapabilities(g, a),
  });

  return {
    list: async key => {
      const storage = getStorage(); const a = actorNow(); if (key.userId !== a.userId) return [];
      return visibleIn(storage, a, key.menuId, readGroups(storage).groups);
    },
    get: async id => { const storage = getStorage(); return find(storage, actorNow(), id, readGroups(storage).groups); },
    save: input => run(c => {
      const checked = validateSavedView(input); if (!checked.ok) return checked;
      const draft: SavedViewDraft = checked.value; const menuId = draft.kind === 'menu-view' ? draft.menuId : null;
      if (menuId?.includes('|')) return fail('invalid', 'menuId');
      const unknownMenu = menuId !== null && menuPermissionOf(menuId) === undefined;
      if (unknownMenu) return fail('invalid', 'unknown-menu');
      if (denial(draft, c.actor, menuPermissionOf)) return fail('forbidden');
      const views = c.bucket(c.actor.userId, menuId); if (!views) return fail('unavailable');
      // Never derived from the remaining rows: a reused id would let an old default or an old version point at a new view.
      const seq = `${now().toString(36)}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
      const view = { ...draft, name: draft.name.trim(), id: `${c.actor.userId}|${menuId ?? ''}|${seq}`, ownerId: c.actor.userId, version: 1, updatedAt: now(), visibility: { kind: 'private' }, approval: 'none' } as SavedView;
      views.push(view);
      return { ok: true, value: ev(view, c.actor, c.groups, true) as SavedViewEntry };
    }),
    update: (id, patch: SavedViewPatch, { expectedVersion }) => run(c => {
      const t = target(c, id, expectedVersion, e => e.capabilities.canEdit || (e.view.ownerId === c.actor.userId && isOfficial(e.view)));
      if (!t.ok) return t;
      const stored = t.value; const view = shownTo(stored, c.actor, stored.ownerId === c.actor.userId);
      if (view.kind === 'condition-set' && ('menuSchemaVersion' in patch || 'page' in patch || 'chartOptions' in patch || 'layout' in patch || 'panels' in patch)) return fail('invalid', 'a condition set has no page');
      const { id: _id, ownerId: _o, version: _v, updatedAt: _u, visibility, approval, approvalNote, ...content } = view;
      void [_id, _o, _v, _u];
      const merged = { ...content, ...patch };
      const checked = validateSavedView(merged); if (!checked.ok) return checked;
      // The edit is judged like a save: a context the editor may not read is refused before anything is written.
      if (denial(merged as SavedView, c.actor, menuPermissionOf)) return fail('forbidden', 'context');
      const next = { ...(merged as SavedView), id: view.id, ownerId: view.ownerId, version: view.version, updatedAt: view.updatedAt, visibility };
      // A personal edit of an official copy is a separate pending change: readers keep the approved copy, visibility is unchanged.
      if (isOfficial(stored)) return commit(c, { ...stored, pending: { ...next, approval: 'pending' } as SavedView }, c.actor, c.groups);
      return commit(c, { ...next, approval, ...(approvalNote === undefined ? {} : { approvalNote }) } as SavedView, c.actor, c.groups);
    }),
    remove: id => run(c => {
      const at = parseId(id); const views = at ? c.bucket(at.ownerId, at.menuId) : null;
      const view = views?.find(v => v.id === id);
      if (!views || !view || !ev(view, c.actor, c.groups)) return fail('invalid', 'not-found');
      if (view.ownerId !== c.actor.userId) return fail('forbidden');
      views.splice(views.indexOf(view), 1);
      return { ok: true, value: null };
    }),
    setDefault: (key, id) => run(c => {
      if (key.userId !== c.actor.userId) return fail('forbidden');
      if (id !== null) {
        const item = find(c.storage, c.actor, id, c.groups);
        if (!item || item.denied || viewMenuId(item.view) !== key.menuId) return fail('invalid', 'not-a-visible-view-of-this-menu');
      }
      c.tx.defaults.set(savedViewDefaultStorageKey(key.userId, key.menuId), id);
      return { ok: true, value: null };
    }),
    getDefaultId: async key => {
      const storage = getStorage(); const a = actorNow(); if (key.userId !== a.userId) return null;
      const id = readDefault(storage, key); if (id === null) return null;
      // A default that is gone, denied or no longer shared is not a default.
      const item = find(storage, a, id, readGroups(storage).groups);
      return item && !item.denied && viewMenuId(item.view) === key.menuId ? id : null;
    },
    setVisibility: (id, visibility: ViewVisibility, { expectedVersion }) => run(c => {
      if (visibility.kind === 'official') return fail('invalid', 'use requestOfficial');
      const t = target(c, id, expectedVersion, e => e.capabilities.canShare); if (!t.ok) return t;
      if (visibility.kind === 'people' && !visibility.userIds.every(u => person(u))) return fail('invalid', 'unknown person');
      if (visibility.kind === 'groups') {
        const current = t.value.visibility.kind === 'groups' ? t.value.visibility.groupIds : [];
        const fresh = visibility.groupIds.filter(g => !current.includes(g));
        if (!fresh.every(g => { const rec = c.groups.find(x => x.id === g); return rec && (c.actor.admin || isMember(rec, c.actor) || isManager(rec, c.actor)); })) return fail('forbidden', 'group');
        if (!visibility.groupIds.every(g => c.groups.some(x => x.id === g))) return fail('invalid', 'unknown group');
      }
      return commit(c, { ...t.value, visibility }, c.actor, c.groups);
    }),
    requestOfficial: (id, { expectedVersion }) => run(c => {
      const t = target(c, id, expectedVersion, e => e.view.ownerId === c.actor.userId); if (!t.ok) return t;
      const shown = shownTo(t.value, c.actor, true);
      if (!canTransition(shown.approval, 'request')) return fail('invalid', 'approval-state');
      if (t.value.pending) return commit(c, { ...t.value, pending: { ...t.value.pending, approval: 'pending', approvalNote: undefined } }, c.actor, c.groups);
      return commit(c, { ...t.value, approval: 'pending', approvalNote: undefined } as SavedView, c.actor, c.groups);
    }),
    decide: (id, decision, note, { expectedVersion }) => run(c => {
      const t = target(c, id, expectedVersion, e => e.capabilities.canApprove); if (!t.ok) return t;
      const action = decision === 'approve' ? 'approve' : 'reject';
      const stored = t.value; const shown = shownTo(stored, c.actor, false);
      if (!canTransition(shown.approval, action)) return fail('invalid', 'approval-state');
      const note1 = note?.trim() || undefined;
      const { pending, ...published } = stored;
      if (decision === 'approve') return commit(c, { ...(pending ?? published), approval: 'approved', visibility: { kind: 'official' }, approvalNote: note1 } as SavedView, c.actor, c.groups);
      // A rejected change never reaches readers: the approved copy stays and only the proposal carries the rejection.
      if (pending) return commit(c, { ...stored, pending: { ...pending, approval: 'rejected', approvalNote: note1 } }, c.actor, c.groups);
      return commit(c, { ...published, approval: 'rejected', approvalNote: note1 } as SavedView, c.actor, c.groups);
    }),
    // Revoke republishes nowhere (policy undecided): the view goes back to private and carries a note the UI can show.
    revoke: (id, { expectedVersion }) => run(c => {
      const t = target(c, id, expectedVersion, e => e.capabilities.canRevoke); if (!t.ok) return t;
      return commit(c, { ...(({ pending: _drop, ...rest }) => (void _drop, rest))(t.value), approval: 'none', visibility: { kind: 'private' }, approvalNote: REVOKE_NOTE } as SavedView, c.actor, c.groups);
    }),
    listApprovalRequests: async key => {
      const storage = getStorage(); const a = actorNow(); if (key.userId !== a.userId) return [];
      const groups = readGroups(storage).groups;
      return DIRECTORY.flatMap(p => readBucket(storage, p.userId, key.menuId).views.flatMap((stored: Stored): ApprovalRequestInfo[] => {
        const proposal = stored.pending ?? stored;
        if (proposal.approval !== 'pending' && proposal.approval !== 'rejected') return [];
        const item = ev(stored, a, groups);
        if (!item || item.denied || !(stored.ownerId === a.userId || item.capabilities.canApprove || item.capabilities.canRevoke)) return [];
        return [{
          viewId: stored.id, requestedBy: stored.ownerId, requestedAt: proposal.updatedAt, targetVersion: proposal.version, changes: proposalChanges(stored),
          ...(proposal.approval === 'rejected' && proposal.approvalNote ? { rejectReason: proposal.approvalNote } : {}),
        }];
      }));
    },
    listGroups: async () => { const a = actorNow(); return readGroups(getStorage()).groups.filter(g => groupCapabilities(g, a).canView).map(g => groupEntry(g, a)); },
    createGroup: ({ name, memberIds }) => run(c => {
      const trimmed = name.trim();
      if (!trimmed || !memberIds.every(m => person(m))) return fail('invalid');
      const ids = [...new Set(memberIds)];
      // Creating a group changes no view's visibility; sharing a view to it is a separate call.
      const group: GroupRecord = { id: `g-${now().toString(36)}-${c.groups.length + 1}`, kind: 'custom', name: trimmed, managerIds: [c.actor.userId], memberIds: ids };
      c.tx.groups = [...c.groups, group];
      return { ok: true, value: groupEntry(group, c.actor) };
    }),
    updateGroup: (id, patch) => run(c => {
      const index = c.groups.findIndex(g => g.id === id);
      if (index < 0 || !groupCapabilities(c.groups[index], c.actor).canView) return fail('invalid', 'not-found');
      const caps = groupCapabilities(c.groups[index], c.actor);
      const editsMembers = (patch.addMembers?.length ?? 0) + (patch.removeMembers?.length ?? 0) > 0;
      if ((editsMembers && !caps.canEditMembers) || (patch.name !== undefined && !caps.canRename)) return fail('forbidden', c.groups[index].kind === 'org-team' ? 'org-team' : undefined);
      if (patch.name !== undefined && !patch.name.trim()) return fail('invalid');
      if (!(patch.addMembers ?? []).every(m => person(m))) return fail('invalid', 'unknown person');
      const old = c.groups[index]; const removed = new Set(patch.removeMembers ?? []);
      const memberIds = [...new Set([...old.memberIds.filter(m => !removed.has(m)), ...(patch.addMembers ?? [])])];
      const managerIds = old.managerIds.filter(m => !removed.has(m));
      if (old.managerIds.length > 0 && managerIds.length === 0) return fail('invalid', 'last-manager');
      const next: GroupRecord = { ...old, name: patch.name?.trim() ?? old.name, memberIds, managerIds };
      c.tx.groups = c.groups.map((g, i) => (i === index ? next : g));
      return { ok: true, value: groupEntry(next, c.actor) };
    }),
    searchPeople: async (query, signal) => {
      const q = query.trim().toLowerCase();
      if (signal.aborted || !q) return [];
      return DIRECTORY.filter(p => p.displayName.toLowerCase().includes(q) || p.affiliation.toLowerCase().includes(q)).map(p => ({ userId: p.userId, displayName: p.displayName, affiliation: p.affiliation }));
    },
  };
}
