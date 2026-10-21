import { PortError, type PortErrorCode } from '@ap/contracts';

export type PortFailure = { code: PortErrorCode | null; message: string; retryable: boolean };
export type PortStatus = 'idle' | 'loading' | 'ready' | 'error';
export type PortPageState<T> = {
  status: PortStatus; items: T[]; error: PortFailure | null; hasMore: boolean;
  loadingMore: boolean; loadMoreError: PortFailure | null; total?: number;
};
export const idlePage: PortPageState<never> = { status: 'idle', items: [], error: null, hasMore: false, loadingMore: false, loadMoreError: null };
const failure = (e: unknown): PortFailure => e instanceof PortError
  ? { code: e.code, message: e.message, retryable: e.code === 'invalid_cursor' }
  : { code: null, message: String(e), retryable: true };

type Page<T> = { items: T[]; nextCursor: string | null; total?: number };
/** One entry is shared by all consumers of the same screen/inputs, including the pane context bar. */
export class PortEntry<T> {
  state: PortPageState<T> = idlePage;
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private nextCursor: string | null = null;
  private failedCursor: string | null = null;
  private cursors = new Set<string>();
  constructor(private send: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>, private id: (item: T) => string, private inactive: () => void = () => {}) {}
  get subscribed() { return this.listeners.size > 0; }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.abort(); this.inactive(); }
    };
  };
  private publish(next: PortPageState<T>) { this.state = next; this.listeners.forEach(l => l()); }
  abort() {
    this.controller?.abort(); this.controller = null;
    if (this.state.status === 'loading') this.state = idlePage;
    else if (this.state.loadingMore) this.state = { ...this.state, loadingMore: false };
  }
  start = () => { if (this.state.status === 'idle') this.request(null); };
  loadMore = () => { if (!this.controller && this.state.status === 'ready' && this.state.hasMore && !this.state.loadMoreError) this.request(this.nextCursor); };
  retry = () => {
    if (this.controller) return;
    const error = this.state.loadMoreError ?? this.state.error;
    if (!error?.retryable) return;
    if (error.code === 'invalid_cursor') { this.cursors.clear(); this.nextCursor = null; this.request(null); }
    else this.request(this.failedCursor);
  };
  private request(cursor: string | null) {
    if (this.controller || !this.listeners.size) return;
    const controller = new AbortController(); this.controller = controller;
    const more = cursor !== null;
    this.publish(more ? { ...this.state, loadingMore: true, loadMoreError: null } : { ...idlePage, status: 'loading' });
    // Promise hop also catches an adapter that throws before returning its promise.
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      return this.send(cursor, controller.signal);
    }).then(page => {
      if (controller.signal.aborted || page === null) return;
      if (page.nextCursor !== null && (page.nextCursor === cursor || this.cursors.has(page.nextCursor))) throw new PortError('invalid_cursor', 'Cursor did not advance');
      if (cursor !== null) this.cursors.add(cursor);
      const merged = new Map((more ? this.state.items : []).map(item => [this.id(item), item]));
      for (const item of page.items) if (!merged.has(this.id(item))) merged.set(this.id(item), item);
      this.nextCursor = page.nextCursor; this.failedCursor = null; this.controller = null;
      this.publish({ ...idlePage, status: 'ready', items: [...merged.values()], hasMore: page.nextCursor !== null, ...(page.total !== undefined ? { total: page.total } : {}) });
    }).catch((e: unknown) => {
      if (controller.signal.aborted) return;
      this.controller = null; this.failedCursor = cursor;
      this.publish(more ? { ...this.state, loadingMore: false, loadMoreError: failure(e) } : { ...idlePage, status: 'error', error: failure(e) });
    });
  }
}

/** A new cache per adapter/session/revision generation; never shared between PlatformProviders. */
export function createPortCache() {
  const owners = new Map<string, { leases: number; entries: Map<string, PortEntry<unknown>> }>();
  const owner = (id: string) => {
    let result = owners.get(id);
    if (!result) { result = { leases: 0, entries: new Map() }; owners.set(id, result); }
    return result;
  };
  // Keep at most 50 inactive entries per owner; subscriptions are never evicted.
  // Map order is LRU, updated only by ensure/unsubscribe, never render-time read.
  const prune = (record: ReturnType<typeof owner>) => {
    let inactive = [...record.entries.values()].filter(entry => !entry.subscribed).length;
    for (const [key, entry] of record.entries) {
      if (inactive <= 50) break;
      if (!entry.subscribed) { entry.abort(); record.entries.delete(key); inactive--; }
    }
  };
  return {
    retain(id: string) {
      const record = owner(id); record.leases++;
      return () => {
        record.leases--;
        // StrictMode cleanup/setup and a second provider for a pane share one lifetime.
        queueMicrotask(() => {
          if (!record.leases && owners.get(id) === record) {
            record.entries.forEach(entry => entry.abort()); owners.delete(id);
          }
        });
      };
    },
    read<T>(id: string, key: string): PortEntry<T> | undefined { return owners.get(id)?.entries.get(key) as PortEntry<T> | undefined; },
    ensure<T>(id: string, key: string, send: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>, itemId: (item: T) => string): PortEntry<T> {
      const record = owner(id);
      let entry = record.entries.get(key);
      if (!entry) {
        entry = new PortEntry(send, itemId, () => {
          if (record.entries.get(key) !== entry) return;
          record.entries.delete(key); record.entries.set(key, entry!); prune(record);
        }) as PortEntry<unknown>;
      }
      record.entries.delete(key); record.entries.set(key, entry); prune(record);
      return entry as PortEntry<T>;
    },
  };
}
export type PortCache = ReturnType<typeof createPortCache>;
