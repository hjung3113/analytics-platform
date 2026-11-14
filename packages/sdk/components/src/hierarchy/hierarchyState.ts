import { isHierarchyFailure, type HierarchyFailure, type HierarchyNode, type HierarchyPage, type HierarchySource } from '@ap/contracts';

type Failure = HierarchyFailure['kind'];
export type Load<T> = { status: 'loading' | 'ready' | Failure; value?: T };
export type HierarchySnapshot = {
  source?: HierarchySource;
  pages: Readonly<Record<string, Load<HierarchyPage>>>;
  ancestors: Readonly<Record<string, Load<HierarchyNode[]>>>;
  routeId: string | null | undefined;
  locatedId?: string;
  path: HierarchyNode[];
  expanded: ReadonlySet<string>;
  query: string;
  readyQuery: string;
};
/** Ids are unrestricted strings: copy into a null-prototype dictionary so `constructor`/`__proto__` are ordinary keys. */
const dict = <T>(source: Readonly<Record<string, T>>): Record<string, T> => Object.assign(Object.create(null) as Record<string, T>, source);
export const childrenKey = (parentId: string | null) => JSON.stringify(['children', parentId]);
export const searchKey = (query: string) => JSON.stringify(['search', query]);
export const ancestorKey = (id: string) => JSON.stringify(['ancestors', id]);
export const hierarchyLimit = (limit: number) => Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;

/** Per-menu, per-session state. No fetch/SQL, storage, URL state or module singleton. */
export class HierarchyNavState {
  private snapshot: HierarchySnapshot = { pages: {}, ancestors: dict({}), routeId: undefined, path: [], expanded: new Set(), query: '', readyQuery: '' };
  private listeners = new Set<() => void>();
  private requests = new Map<string, AbortController>();
  /** Cursors already sent per page chain; a repeat means a cycle. Reset when a chain restarts. */
  private cursors = new Map<string, Set<string>>();
  private source: HierarchySource | undefined;
  bindSource(source: HierarchySource) {
    if (this.source === source) return;
    this.source = source;
    for (const controller of this.requests.values()) controller.abort();
    this.requests.clear(); this.cursors.clear();
    this.update({ source, pages: {}, ancestors: dict({}), routeId: undefined, locatedId: undefined, path: [], expanded: new Set(), query: '', readyQuery: '' });
  }
  constructor(readonly identity: string) {}
  read = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  update(patch: Partial<HierarchySnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  private page(key: string, value: Load<HierarchyPage>) { this.update({ pages: { ...this.snapshot.pages, [key]: value } }); }
  private ancestors(id: string, value: Load<HierarchyNode[]>) { this.update({ ancestors: Object.assign(dict(this.snapshot.ancestors), { [id]: value }) }); }
  private request<T>(key: string, run: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void, fail: (kind: Failure) => void) {
    if (this.requests.has(key)) return;
    const controller = new AbortController();
    this.requests.set(key, controller);
    void Promise.resolve().then(() => run(controller.signal)).then(value => {
      if (!controller.signal.aborted && this.requests.get(key) === controller) { this.requests.delete(key); apply(value); }
    }, error => {
      // An unrelated adapter AbortError is an ordinary failure. Only our signal supersedes this request.
      if (!controller.signal.aborted && this.requests.get(key) === controller) { this.requests.delete(key); fail(isHierarchyFailure(error) ? error.kind : 'error'); }
    }).finally(() => { if (this.requests.get(key) === controller) this.requests.delete(key); });
  }
  loadPage(source: HierarchySource, key: string, parentId: string | null, query: string | null, limit: number, more = false) {
    const old = this.snapshot.pages[key];
    if (this.requests.has(key) || (!more && old !== undefined)) return;
    const cursor = more ? old?.value?.nextCursor : undefined;
    if (more && cursor === undefined) return;
    if (!more) this.cursors.set(key, new Set());
    if (cursor !== undefined) (this.cursors.get(key) ?? this.cursors.set(key, new Set()).get(key)!).add(cursor);
    this.page(key, { status: 'loading', value: old?.value });
    this.request(key, signal => query === null
      ? source.listChildren({ parentId, cursor, limit: hierarchyLimit(limit), signal })
      : source.searchNodes!({ query, cursor, limit: hierarchyLimit(limit), signal }), result => {
      const seen = new Set<string>();
      const nodes = [...(more ? old?.value?.nodes ?? [] : []), ...result.nodes].filter(node => !seen.has(node.id) && !!seen.add(node.id));
      // A repeated cursor must not produce an endless load-more loop.
      const next = result.nextCursor === cursor ? undefined : result.nextCursor;
      const value = { nodes, totalCount: result.totalCount ?? old?.value?.totalCount, nextCursor: next };
      if (next !== undefined && this.cursors.get(key)?.has(next)) this.page(key, { status: 'error', value: { ...value, nextCursor: undefined } });
      else this.page(key, { status: 'ready', value });
    }, kind => this.page(key, { status: kind, value: old?.value }));
  }
  loadAncestors(source: HierarchySource, id: string) {
    if (this.snapshot.ancestors[id] !== undefined || this.requests.has(ancestorKey(id))) return;
    this.ancestors(id, { status: 'loading' });
    this.request(ancestorKey(id), signal => source.resolveAncestors(id, signal), value => this.ancestors(id, { status: 'ready', value }), kind => this.ancestors(id, { status: kind }));
  }
  retryPage(key: string) { const pages = { ...this.snapshot.pages }; delete pages[key]; this.update({ pages }); }
  retryPages(keys: readonly string[]) { const pages = { ...this.snapshot.pages }; keys.forEach(key => { delete pages[key]; }); this.update({ pages }); }
  retryAncestors(id: string) { const ancestors = dict(this.snapshot.ancestors); delete ancestors[id]; this.update({ ancestors }); }
  /** Cancel superseded work, drop late completions, and make interrupted pages retryable on reopening. */
  retain(wanted: ReadonlySet<string>) {
    for (const [key, controller] of this.requests) {
      if (wanted.has(key)) continue;
      controller.abort(); this.requests.delete(key);
      if (key.startsWith('["ancestors",')) {
        const id = (JSON.parse(key) as string[])[1];
        if (this.snapshot.ancestors[id]?.status === 'loading') this.retryAncestors(id);
      } else if (this.snapshot.pages[key]?.status === 'loading') {
        const old = this.snapshot.pages[key].value;
        if (old) this.page(key, { status: 'ready', value: old }); else this.retryPage(key);
      }
    }
  }
}
