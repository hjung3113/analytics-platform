// Private test double for the Saved View port (not exported). Capabilities are granted per object, like a real store.
import type { ApprovalRequestInfo, GroupMember, Result, SavedView, SavedViewDraft, SavedViewEntry, SavedViewListItem, SavedViewStore, ViewCapabilities, ViewGroupEntry } from '@ap/contracts';

export const ALL: ViewCapabilities = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
export type FakeViewStore = SavedViewStore & { rows: Map<string, SavedView>; groups: ViewGroupEntry[]; caps: Map<string, ViewCapabilities>; calls: string[]; failSave: boolean; failShare: boolean; requests: ApprovalRequestInfo[] };
export function viewOf(over: Partial<SavedView> & { id: string }): SavedView {
  return { schemaVersion: 1, kind: 'condition-set', name: over.id, ownerId: 'u1', version: 1, updatedAt: 1, context: {}, visibility: { kind: 'private' }, approval: 'none', ...over } as SavedView;
}
export function createFakeViewStore(seed: SavedView[] = [], defaults: Record<string, string> = {}): FakeViewStore {
  const rows = new Map(seed.map(v => [v.id, v]));
  const defaultIds = new Map(Object.entries(defaults));
  const entry = (view: SavedView): SavedViewEntry => ({ view, capabilities: fake.caps.get(view.id) ?? ALL });
  const fake: FakeViewStore = {
    rows, groups: [], caps: new Map(), calls: [], failSave: false, failShare: false, requests: [],
    async list(key) {
      return [...rows.values()].filter(v => (key.menuId === null ? v.kind === 'condition-set' : v.kind === 'menu-view' && v.menuId === key.menuId)).map((view): SavedViewListItem => entry(view));
    },
    async get(id) { const view = rows.get(id); return view ? entry(view) : null; },
    async save(input: SavedViewDraft): Promise<Result<SavedViewEntry>> {
      fake.calls.push('save');
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
    async remove(id) { fake.calls.push('remove'); rows.delete(id); return { ok: true, value: null }; },
    async setDefault(key, id) { if (id === null) defaultIds.delete(`${key.userId}:${key.menuId}`); else defaultIds.set(`${key.userId}:${key.menuId}`, id); return { ok: true, value: null }; },
    async getDefaultId(key) { return defaultIds.get(`${key.userId}:${key.menuId}`) ?? null; },
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
