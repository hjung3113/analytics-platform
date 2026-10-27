// Private test double for the Saved View port (no public `@ap/kernel/testing` entry). Capabilities are granted per object, like a real store.
import type { Result, SavedView, SavedViewDraft, SavedViewEntry, SavedViewListItem, SavedViewStore, ViewCapabilities } from '@ap/contracts';

const all: ViewCapabilities = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
const unsupportedCall = async (): Promise<never> => { throw new Error('not used by these tests'); };

export type FakeStore = SavedViewStore & { rows: Map<string, SavedView>; defaults: Map<string, string>; calls: string[]; failGet: boolean; denied: Set<string>; getHold: Map<string, Promise<void>>; saveHold: Promise<void> | null; removeHold: Promise<void> | null; listHold: Promise<void> | null };
export function viewOf(over: Partial<SavedView> & { id: string; context?: SavedView['context'] }): SavedView {
  return { schemaVersion: 1, kind: 'condition-set', name: over.id, ownerId: 'u1', version: 1, updatedAt: 1, context: {}, visibility: { kind: 'private' }, approval: 'none', ...over } as SavedView;
}
export function createFakeStore(seed: SavedView[] = [], defaults: Record<string, string> = {}): FakeStore {
  const rows = new Map(seed.map(v => [v.id, v]));
  const fake: FakeStore = {
    rows, defaults: new Map(Object.entries(defaults)), calls: [], failGet: false, denied: new Set(), getHold: new Map(), saveHold: null, removeHold: null, listHold: null,
    async list(key) {
      fake.calls.push('list');
      await fake.listHold;
      return [...rows.values()].filter(v => (key.menuId === null ? v.kind === 'condition-set' : v.kind === 'menu-view' && v.menuId === key.menuId)).map((view): SavedViewListItem => ({ view, capabilities: all }));
    },
    async get(id) {
      fake.calls.push('get');
      await fake.getHold.get(id);
      if (fake.failGet) throw new Error('offline');
      if (fake.denied.has(id)) return { id, denied: true, reason: 'scope' };
      const view = rows.get(id);
      return view ? { view, capabilities: all } : null;
    },
    async save(input: SavedViewDraft): Promise<Result<SavedViewEntry>> {
      fake.calls.push('save');
      await fake.saveHold;
      const view = { ...input, id: `v${rows.size + 1}`, ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none' } as SavedView;
      rows.set(view.id, view);
      return { ok: true, value: { view, capabilities: all } };
    },
    async update(id, patch, opts) {
      fake.calls.push('update');
      const old = rows.get(id);
      if (!old) return { ok: false, reason: 'unavailable' };
      if (old.version !== opts.expectedVersion) return { ok: false, reason: 'conflict' };
      const view = { ...old, ...patch, version: old.version + 1 } as SavedView;
      rows.set(id, view);
      return { ok: true, value: { view, capabilities: all } };
    },
    async remove(id) { await fake.removeHold; rows.delete(id); return { ok: true, value: null }; },
    async setDefault(key, id) { if (id === null) fake.defaults.delete(`${key.userId}:${key.menuId}`); else fake.defaults.set(`${key.userId}:${key.menuId}`, id); return { ok: true, value: null }; },
    async getDefaultId(key) { return fake.defaults.get(`${key.userId}:${key.menuId}`) ?? null; },
    setVisibility: unsupportedCall, requestOfficial: unsupportedCall, decide: unsupportedCall, revoke: unsupportedCall,
    listGroups: unsupportedCall, createGroup: unsupportedCall, updateGroup: unsupportedCall, searchPeople: unsupportedCall,
  };
  return fake;
}
/** A promise the test resolves by hand, to finish a store call out of order. */
export function deferred(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
