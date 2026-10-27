// Test double for the Saved View port, exported through `@ap/kernel/testing` (ADR-0040). Capabilities are granted per object, like a real store.
import type { ApprovalRequestInfo, GroupMember, Result, SavedView, SavedViewDraft, SavedViewEntry, SavedViewListItem, SavedViewStore, ViewCapabilities, ViewGroupEntry } from '@ap/contracts';

/** Capabilities the fake grants an object unless `caps` says otherwise: view, copy, edit and share; no approve or revoke. */
export const testViewCapabilities: ViewCapabilities = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
/** `calls` records writes only; `reads` records `list` and `get`. */
export type FakeSavedViewStore = SavedViewStore & {
  rows: Map<string, SavedView>; defaults: Map<string, string>; groups: ViewGroupEntry[]; caps: Map<string, ViewCapabilities>; requests: ApprovalRequestInfo[];
  calls: string[]; reads: string[];
  failGet: boolean; failSave: boolean; failShare: boolean; denied: Set<string>;
  getHold: Map<string, Promise<void>>; saveHold: Promise<void> | null; removeHold: Promise<void> | null; listHold: Promise<void> | null;
};
/** A saved view with filler fields; pass the fields the test means. */
export function testSavedView(over: Partial<SavedView> & { id: string; context?: SavedView['context'] }): SavedView {
  return { schemaVersion: 1, kind: 'condition-set', name: over.id, ownerId: 'u1', version: 1, updatedAt: 1, context: {}, visibility: { kind: 'private' }, approval: 'none', ...over } as SavedView;
}
export function createFakeSavedViewStore(seed: SavedView[] = [], defaults: Record<string, string> = {}): FakeSavedViewStore {
  const rows = new Map(seed.map(v => [v.id, v]));
  const entry = (view: SavedView): SavedViewEntry => ({ view, capabilities: fake.caps.get(view.id) ?? testViewCapabilities });
  const fake: FakeSavedViewStore = {
    rows, defaults: new Map(Object.entries(defaults)), groups: [], caps: new Map(), requests: [], calls: [], reads: [],
    failGet: false, failSave: false, failShare: false, denied: new Set(), getHold: new Map(), saveHold: null, removeHold: null, listHold: null,
    async list(key) {
      fake.reads.push('list');
      await fake.listHold;
      return [...rows.values()].filter(v => (key.menuId === null ? v.kind === 'condition-set' : v.kind === 'menu-view' && v.menuId === key.menuId)).map((view): SavedViewListItem => entry(view));
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
      const view = { ...input, id: `v${rows.size + 1}`, ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none' } as SavedView;
      rows.set(view.id, view);
      return { ok: true, value: entry(view) };
    },
    async update(id, patch, opts) {
      fake.calls.push('update');
      const old = rows.get(id);
      if (!old) return { ok: false, reason: 'unavailable' };
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, ...patch, version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async remove(id) { fake.calls.push('remove'); await fake.removeHold; rows.delete(id); return { ok: true, value: null }; },
    async setDefault(key, id) { if (id === null) fake.defaults.delete(`${key.userId}:${key.menuId}`); else fake.defaults.set(`${key.userId}:${key.menuId}`, id); return { ok: true, value: null }; },
    async getDefaultId(key) { return fake.defaults.get(`${key.userId}:${key.menuId}`) ?? null; },
    async setVisibility(id, visibility, opts) {
      fake.calls.push('setVisibility');
      if (fake.failShare) return { ok: false, reason: 'unavailable' };
      const old = rows.get(id);
      if (!old) return { ok: false, reason: 'unavailable' };
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, visibility, version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async requestOfficial(id, opts) {
      fake.calls.push('requestOfficial');
      if (fake.failShare) return { ok: false, reason: 'unavailable' };
      const old = rows.get(id);
      if (!old) return { ok: false, reason: 'unavailable' };
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, approval: 'pending', version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async decide(id, decision, _note, opts) {
      fake.calls.push('decide');
      const old = rows.get(id);
      if (!old || old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, approval: decision === 'approve' ? 'approved' : 'rejected', version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async revoke(id, opts) {
      fake.calls.push('revoke');
      const old = rows.get(id);
      if (!old || old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, approval: 'none', version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: entry(view) };
    },
    async listApprovalRequests() { return fake.requests; },
    async listGroups() { return fake.groups; },
    async createGroup(input) {
      fake.calls.push('createGroup');
      const made: ViewGroupEntry = { group: { id: `g${fake.groups.length + 1}`, kind: 'custom', name: input.name, memberCount: input.memberIds.length }, members: [], capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true } };
      fake.groups = [...fake.groups, made];
      return { ok: true, value: made };
    },
    async updateGroup() { return { ok: false, reason: 'unavailable' }; },
    async searchPeople(): Promise<readonly GroupMember[]> { return []; },
  };
  return fake;
}
