// Test double for the Saved View port, exported through `@ap/kernel/testing` (ADR-0040). Capabilities are granted per object, like a real store.
import type { ApprovalRequestInfo, GroupMember, Result, SavedView, SavedViewDraft, SavedViewEntry, SavedViewListItem, SavedViewStore, ViewCapabilities, ViewGroupEntry } from '@ap/contracts';
import { validateSavedView } from '@ap/contracts';
import { jsonEqual } from '../json-equal';

const FAKE_WRITER_ID = 'u1';
const canWithdraw = (view: SavedView, userId: string) =>
  view.kind !== 'custom-group' && view.ownerId === userId && view.approval === 'pending';

/** Capabilities the fake grants an object unless `caps` says otherwise: view, copy, edit and share; no approve or revoke. */
export const testViewCapabilities: ViewCapabilities = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
/** `calls` records writes only; `reads` records `list`, `listMyMenus` and `get`. */
export type FakeSavedViewStore = SavedViewStore & {
  rows: Map<string, SavedView>; defaults: Map<string, string>; groups: ViewGroupEntry[]; caps: Map<string, ViewCapabilities>; requests: ApprovalRequestInfo[];
  calls: string[]; reads: string[];
  failGet: boolean; failSave: boolean; failShare: boolean; denied: Set<string>;
  getHold: Map<string, Promise<void>>; saveHold: Promise<void> | null; removeHold: Promise<void> | null; listHold: Promise<void> | null;
};
type RestorableView = Exclude<SavedView, { kind: 'custom-group' }>;
type GroupView = Extract<SavedView, { kind: 'custom-group' }>;

const proposalContent = (view: RestorableView) => {
  const { name, context, savedScopeId } = view;
  if (view.kind === 'condition-set') return { name, context, savedScopeId };
  const { menuSchemaVersion, page, chartOptions, layout, panels, panelsUnreadable, tables } = view;
  return { name, context, savedScopeId, menuSchemaVersion, page, chartOptions, layout, panels, panelsUnreadable, tables };
};
type ApprovedCopy = { content: ReturnType<typeof proposalContent>; approvalNote?: string };

const restoreApprovedContent = (view: RestorableView, approved: ApprovedCopy | undefined): RestorableView => {
  if (!approved) return view;
  const restored = { ...view, ...approved.content, approvalNote: approved.approvalNote };
  if (restored.savedScopeId === undefined) delete restored.savedScopeId;
  if (restored.approvalNote === undefined) delete restored.approvalNote;
  if (restored.kind === 'menu-view') {
    if (restored.tables === undefined) delete restored.tables;
    if (restored.panelsUnreadable === undefined) delete restored.panelsUnreadable;
  }
  return restored;
};

/** A saved view with filler fields; pass the fields the test means. */
export function testSavedView<K extends SavedView['kind'] = 'condition-set'>(over: Partial<SavedView> & { id: string; kind?: K }): [K] extends ['custom-group'] ? GroupView : RestorableView;
export function testSavedView(over: Partial<SavedView> & { id: string }): SavedView {
  const content = over.kind === 'custom-group' ? {} : { context: {} };
  return { schemaVersion: 1, kind: 'condition-set', name: over.id, ownerId: FAKE_WRITER_ID, version: 1, updatedAt: 1, ...content, visibility: { kind: 'private' }, approval: 'none', ...over } as SavedView;
}
export function createFakeSavedViewStore(seed: SavedView[] = [], defaults: Record<string, string> = {}): FakeSavedViewStore {
  const rows = new Map(seed.map(v => [v.id, v]));
  const approvedCopies = new Map<string, ApprovedCopy>();
  const entry = (view: SavedView): SavedViewEntry => {
    const capabilities = fake.caps.get(view.id) ?? testViewCapabilities;
    return { view, capabilities: view.kind === 'custom-group' ? { ...capabilities, canApprove: false, canRevoke: false, canWithdraw: false }
      : { ...capabilities, canWithdraw: canWithdraw(view, FAKE_WRITER_ID) } };
  };
  const myMenuCapabilities = (view: SavedView, userId: string): ViewCapabilities | null => {
    const overrides = fake.caps.get(view.id);
    if (fake.denied.has(view.id) || overrides?.canView === false) return null;
    const { visibility } = view;
    const owned = view.ownerId === userId;
    const named = visibility.kind === 'people' && visibility.userIds.includes(userId);
    const groups = visibility.kind === 'groups' ? fake.groups.filter(({ group }) => visibility.groupIds.includes(group.id)) : [];
    const manager = groups.some(({ group }) => group.managerIds?.includes(userId));
    const member = groups.some(({ members }) => members.some(person => person.userId === userId));
    if (!owned && !named && !manager && !member) return null;
    const published = visibility.kind === 'official' && view.approval === 'approved';
    const canManage = (owned || manager) && !published;
    return { ...testViewCapabilities, canShare: canManage, ...overrides, canEdit: !published && (overrides?.canEdit ?? canManage), canWithdraw: canWithdraw(view, userId) };
  };
  const fake: FakeSavedViewStore = {
    rows, defaults: new Map(Object.entries(defaults)), groups: [], caps: new Map(), requests: [], calls: [], reads: [],
    failGet: false, failSave: false, failShare: false, denied: new Set(), getHold: new Map(), saveHold: null, removeHold: null, listHold: null,
    async list(key) {
      fake.reads.push('list');
      await fake.listHold;
      return [...rows.values()].filter(v => key.menuId === null ? v.kind === (key.kind ?? 'condition-set') : !key.kind && v.kind === 'menu-view' && v.menuId === key.menuId).map((view): SavedViewListItem => entry(view));
    },
    async listMyMenus(userId) {
      fake.reads.push('listMyMenus');
      await fake.listHold;
      return [...rows.values()].flatMap(view => {
        if (view.kind !== 'menu-view' || view.myMenu !== true) return [];
        const capabilities = myMenuCapabilities(view, userId);
        return capabilities ? [{ view, capabilities }] : [];
      }).sort((left, right) => Number(right.view.ownerId === userId) - Number(left.view.ownerId === userId)
        || right.view.updatedAt - left.view.updatedAt || left.view.id.localeCompare(right.view.id));
    },
    async get(id) {
      fake.reads.push('get');
      await fake.getHold.get(id);
      if (fake.failGet) throw new Error('offline');
      if (fake.denied.has(id)) return { id, denied: true, reason: 'scope' };
      const view = rows.get(id);
      return view ? entry(view) : null;
    },
    async save(input: SavedViewDraft): Promise<Result<SavedViewEntry>> {
      fake.calls.push('save');
      await fake.saveHold;
      if (fake.failSave) return { ok: false, reason: 'unavailable' };
      if ('myMenu' in input && (input.kind !== 'menu-view' || input.myMenu !== true)) return { ok: false, reason: 'invalid' };
      if (input.kind === 'custom-group') { const checked = validateSavedView(input); if (!checked.ok) return checked; }
      const view = { ...input, name: input.name.trim(), id: `v${rows.size + 1}`, ownerId: FAKE_WRITER_ID, version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none' } as SavedView;
      rows.set(view.id, view);
      return { ok: true, value: entry(view) };
    },
    async update(id, patch, opts) {
      fake.calls.push('update');
      const old = rows.get(id);
      if (!old) return { ok: false, reason: 'unavailable' };
      const { myMenu, ...content } = patch;
      if (myMenu !== undefined) {
        if (!myMenuCapabilities(old, FAKE_WRITER_ID)?.canEdit) return { ok: false, reason: 'forbidden' };
        if (old.kind !== 'menu-view' || typeof myMenu !== 'boolean') return { ok: false, reason: 'invalid' };
      }
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, ...content, version: old.version + 1 } as SavedView;
      if (view.kind === 'menu-view' && myMenu !== undefined) {
        if (myMenu) view.myMenu = true;
        else delete view.myMenu;
      }
      // `savedScopeId: null` clears the recorded Scope, as a real store does (#2175).
      if (patch.savedScopeId === null) delete (view as { savedScopeId?: string }).savedScopeId;
      if (old.kind === 'custom-group' || patch.target !== undefined) { const checked = validateSavedView(view); if (!checked.ok) return checked; }
      if (old.kind !== 'custom-group' && view.kind !== 'custom-group' && old.visibility.kind === 'official') {
        view.name = (patch.name ?? old.name).trim();
        const approvedContent = proposalContent(old);
        if (jsonEqual(approvedContent, proposalContent(view))) {
          const wasMyMenu = old.kind === 'menu-view' && old.myMenu === true;
          const isMyMenu = view.kind === 'menu-view' && view.myMenu === true;
          if (wasMyMenu === isMyMenu) return { ok: true, value: entry(old) };
        } else {
          if (old.approval === 'approved') approvedCopies.set(id, { content: approvedContent, approvalNote: old.approvalNote });
          view.approval = 'pending';
          delete view.approvalNote;
        }
      }
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async remove(id) { fake.calls.push('remove'); await fake.removeHold; rows.delete(id); approvedCopies.delete(id); return { ok: true, value: null }; },
    async setDefault(key, id) { if (key.kind === 'custom-group' || (id !== null && rows.get(id)?.kind === 'custom-group')) return { ok: false, reason: 'invalid' }; if (id === null) fake.defaults.delete(`${key.userId}:${key.menuId}`); else fake.defaults.set(`${key.userId}:${key.menuId}`, id); return { ok: true, value: null }; },
    async getDefaultId(key) { if (key.kind === 'custom-group') return null; const id = fake.defaults.get(`${key.userId}:${key.menuId}`) ?? null; return id !== null && rows.get(id)?.kind === 'custom-group' ? null : id; },
    async setVisibility(id, visibility, opts) {
      fake.calls.push('setVisibility');
      if (fake.failShare) return { ok: false, reason: 'unavailable' };
      const old = rows.get(id);
      if (!old) return { ok: false, reason: 'unavailable' };
      if (old.kind === 'custom-group' && visibility.kind !== 'private' && visibility.kind !== 'groups') return { ok: false, reason: 'invalid' };
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, visibility, version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async requestOfficial(id, opts) {
      fake.calls.push('requestOfficial');
      if (fake.failShare) return { ok: false, reason: 'unavailable' };
      const old = rows.get(id);
      if (old?.kind === 'custom-group') return { ok: false, reason: 'invalid' };
      if (!old) return { ok: false, reason: 'unavailable' };
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, approval: 'pending', version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async withdraw(id, opts) {
      fake.calls.push('withdraw');
      if (fake.failShare) return { ok: false, reason: 'unavailable' };
      const old = rows.get(id);
      if (!old || old.ownerId !== FAKE_WRITER_ID || fake.denied.has(id) || fake.caps.get(id)?.canView === false) return { ok: false, reason: 'forbidden' };
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      if (old.kind === 'custom-group') return { ok: false, reason: 'invalid', detail: 'custom-group-approval' };
      if (!canWithdraw(old, FAKE_WRITER_ID)) return { ok: false, reason: 'invalid', detail: 'approval-state' };
      const published = approvedCopies.get(id);
      const view: SavedView = { ...restoreApprovedContent(old, published), approval: old.visibility.kind === 'official' ? 'approved' : 'none', version: old.version + 1 };
      if (!published) delete view.approvalNote;
      approvedCopies.delete(id);
      fake.requests = fake.requests.filter(request => request.viewId !== id);
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async decide(id, decision, note, opts) {
      fake.calls.push('decide');
      const old = rows.get(id);
      if (old?.kind === 'custom-group') return { ok: false, reason: 'invalid' };
      if (!old || old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      if (decision === 'reject' && !note?.trim()) return { ok: false, reason: 'invalid', detail: 'note' };
      const view: SavedView = { ...old, approval: decision === 'approve' ? 'approved' : 'rejected', version: old.version + 1 };
      if (decision === 'approve') {
        view.visibility = { kind: 'official' };
        approvedCopies.delete(id);
      }
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async revoke(id, opts) {
      fake.calls.push('revoke');
      const old = rows.get(id);
      if (old?.kind === 'custom-group') return { ok: false, reason: 'invalid' };
      if (!old || old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view: SavedView = { ...restoreApprovedContent(old, approvedCopies.get(id)), visibility: { kind: 'private' }, approval: 'none', version: old.version + 1 };
      approvedCopies.delete(id);
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async listApprovalRequests(key) {
      if (key.kind === 'custom-group') return [];
      return fake.requests.filter(request => {
        const view = rows.get(request.viewId);
        if (!view) return true;
        if (view.kind === 'custom-group') return false;
        return (view.kind === 'menu-view' ? view.menuId : null) === key.menuId;
      });
    },
    async listGroups() { return fake.groups; },
    async createGroup(input) {
      fake.calls.push('createGroup');
      const made: ViewGroupEntry = { group: { id: `g${fake.groups.length + 1}`, kind: 'custom', name: input.name, memberCount: input.memberIds.length }, members: input.memberIds.map(userId => ({ userId, displayName: userId, affiliation: '' })), capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true } };
      fake.groups = [...fake.groups, made];
      return { ok: true, value: made };
    },
    async updateGroup() { return { ok: false, reason: 'unavailable' }; },
    async searchPeople(): Promise<readonly GroupMember[]> { return []; },
  };
  return fake;
}
