import { compareQueryHistory, ContractError, parseQuery, type QueryHistoryEntry, type QueryHistoryKey, type QueryHistoryStore } from '@ap/contracts';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Locks = { request<T>(name: string, callback: () => T | Promise<T>): Promise<T> };
const unavailable = () => new Error('Query history unavailable');
export const queryHistoryStorageKey = (key: QueryHistoryKey) => 'platform:query-history:v1:' + JSON.stringify([1, key.userId, key.menuId, key.scopeId]);
function entry(value: unknown): value is QueryHistoryEntry {
  if (value === null || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  if (e.schemaVersion !== 1 || typeof e.id !== 'string' || typeof e.query !== 'string' || !e.query.startsWith('?') ||
    typeof e.lastAppliedAt !== 'number' || !Number.isFinite(e.lastAppliedAt) || e.lastAppliedAt < 0 ||
    typeof e.count !== 'number' || !Number.isSafeInteger(e.count) || e.count < 1) return false;
  // Future query codecs remain removable, while malformed current syntax is never trusted.
  try { parseQuery(e.query); } catch (error) { return error instanceof ContractError && error.code === 'unsupported_version'; }
  return true;
}
function read(storage: StoragePort, name: string): { future: boolean; entries: QueryHistoryEntry[] } {
  const raw = storage.getItem(name);
  if (raw === null) return { future: false, entries: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { future: false, entries: [] }; }
  if (value === null || typeof value !== 'object') return { future: false, entries: [] };
  const envelope = value as Record<string, unknown>;
  if (typeof envelope.schemaVersion === 'number' && envelope.schemaVersion > 1) return { future: true, entries: [] };
  if (envelope.schemaVersion !== 1 || !Array.isArray(envelope.entries) || !envelope.entries.every(entry)) return { future: false, entries: [] };
  return { future: false, entries: [...envelope.entries].sort(compareQueryHistory) };
}
/** Web Locks serializes all tabs and all instances. Without an origin lock, mutations fail closed. */
export function createLocalQueryHistoryStore(getStorage: () => StoragePort = () => localStorage, locks: Locks | undefined = navigator.locks, now: () => number = Date.now): QueryHistoryStore {
  const guarded = async <T>(work: () => T | Promise<T>) => { try { return await work(); } catch { throw unavailable(); } };
  const mutate = (key: QueryHistoryKey, action: 'record' | 'remove' | 'clear', event?: QueryHistoryEntry, id?: string) => guarded(async () => {
    if (!locks) throw unavailable();
    const name = queryHistoryStorageKey(key);
    await locks.request(name, () => {
      const storage = getStorage(); const previous = read(storage, name);
      if (previous.future) throw unavailable();
      if (action === 'clear') { storage.removeItem(name); return; }
      let entries = previous.entries;
      if (action === 'record') {
        if (!entry(event)) throw unavailable();
        parseQuery(event.query); // No parser exception or payload escapes this module.
        const old = entries.find(e => e.id === event.id && e.query === event.query);
        if (old && !Number.isSafeInteger(old.count + 1)) throw unavailable();
        const lastAppliedAt = now();
        if (!Number.isFinite(lastAppliedAt) || lastAppliedAt < 0) throw unavailable();
        entries = [...entries.filter(e => !(e.id === event.id && e.query === event.query)), { ...event, lastAppliedAt, count: (old?.count ?? 0) + 1 }].sort(compareQueryHistory).slice(0, 20);
      } else entries = entries.filter(e => e.id !== id);
      // A malformed envelope is not replaced by an incidental remove.
      if (action === 'remove' && previous.entries.length === 0) return;
      storage.setItem(name, JSON.stringify({ schemaVersion: 1, entries }));
    });
  });
  return {
    list: key => guarded(() => { const value = read(getStorage(), queryHistoryStorageKey(key)); if (value.future) throw unavailable(); return value.entries; }),
    record: (key, event) => mutate(key, 'record', event),
    remove: (key, id) => mutate(key, 'remove', undefined, id),
    clear: key => mutate(key, 'clear'),
  };
}
