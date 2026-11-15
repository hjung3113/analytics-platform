import { HierarchyFailure, isHierarchyFailure, type HierarchyNode, type HierarchyPage, type HierarchySource } from '@ap/contracts';
import { hierarchyLimit } from '../hierarchy/hierarchyState';

export type TreeLoad<T> = { status: 'loading'; value?: T } | { status: 'ready'; value: T } | { status: 'forbidden' | 'deleted' | 'error'; value?: T };
export type TreeSnapshot = {
  pages: ReadonlyMap<string | null, TreeLoad<HierarchyPage>>;
  paths: ReadonlyMap<string, TreeLoad<HierarchyNode[]>>;
  search: TreeLoad<HierarchyPage>;
};
const cancelled = () => new DOMException('Superseded', 'AbortError');
function checkSignal(signal: AbortSignal) { if (signal.aborted) throw cancelled(); }
function checkNodes(nodes: HierarchyNode[]): void {
  if (!Array.isArray(nodes)) throw new HierarchyFailure('error');
  const seen = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || typeof node.label !== 'string' || !node.label || typeof node.hasChildren !== 'boolean' || (node.parentId !== undefined && node.parentId !== null && typeof node.parentId !== 'string') || seen.has(node.id)) throw new HierarchyFailure('error');
    seen.add(node.id);
  }
}
function failure(error: unknown): TreeLoad<never> { return { status: isHierarchyFailure(error) ? error.kind : 'error' }; }

/** A mount/inputsKey-local cache. Every request checks cancellation after await, including uncooperative sources. */
export class PageConditionTreeState {
  private snapshot: TreeSnapshot = { pages: new Map(), paths: new Map(), search: { status: 'loading' } };
  private listeners = new Set<() => void>();
  private requests = new Map<string, AbortController>();
  private pages = new Map<string | null, HierarchyPage>();
  private cursors = new Map<string, Set<string>>();
  private nodes = new Map<string, HierarchyNode>();
  readonly limit: number;
  constructor(readonly source: HierarchySource | undefined, pageSize: number) { this.limit = hierarchyLimit(pageSize); }
  read = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<TreeSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  private setPage(parentId: string | null, load: TreeLoad<HierarchyPage>) { this.update({ pages: new Map(this.snapshot.pages).set(parentId, load) }); }
  private setPath(id: string, load: TreeLoad<HierarchyNode[]>) { this.update({ paths: new Map(this.snapshot.paths).set(id, load) }); }
  node(id: string) { return this.nodes.get(id); }
  /** A source cannot silently duplicate, truncate an oversized page, or loop its cursor chain. */
  async fetchPage(args: { parentId: string | null; cursor?: string; query?: string; signal: AbortSignal }): Promise<HierarchyPage> {
    checkSignal(args.signal);
    if (!this.source) throw new HierarchyFailure('error');
    const result = args.query === undefined
      ? await this.source.listChildren({ parentId: args.parentId, cursor: args.cursor, limit: this.limit, signal: args.signal })
      : await this.source.searchNodes!({ query: args.query, cursor: args.cursor, limit: this.limit, signal: args.signal });
    checkSignal(args.signal);
    checkNodes(result.nodes);
    if (result.nodes.length > this.limit || (result.nextCursor !== undefined && (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor === args.cursor)) || (result.totalCount !== undefined && (!Number.isSafeInteger(result.totalCount) || result.totalCount < result.nodes.length))) throw new HierarchyFailure('error');
    for (const node of result.nodes) {
      if (args.query === undefined && (node.parentId ?? null) !== args.parentId) throw new HierarchyFailure('error');
      const previous = this.nodes.get(node.id);
      if (previous && (previous.parentId ?? null) !== (node.parentId ?? null)) throw new HierarchyFailure('error');
      this.nodes.set(node.id, node);
    }
    return result;
  }
  private async request<T>(key: string, run: (signal: AbortSignal) => Promise<T>, apply: (load: TreeLoad<T>) => void) {
    if (this.requests.has(key)) return;
    const controller = new AbortController();
    this.requests.set(key, controller);
    apply({ status: 'loading' });
    try {
      const value = await run(controller.signal);
      if (!controller.signal.aborted) apply({ status: 'ready', value });
    } catch (error) { if (!controller.signal.aborted) apply(failure(error)); }
    finally { if (this.requests.get(key) === controller) this.requests.delete(key); }
  }
  loadChildren(parentId: string | null, options: { more?: boolean; retry?: boolean } = {}) {
    const key = JSON.stringify(['children', parentId]);
    const load = this.snapshot.pages.get(parentId);
    if (!options.more && !options.retry && load) return;
    const old = this.pages.get(parentId);
    if (options.more && !old?.nextCursor) return;
    const cursor = options.more ? old?.nextCursor : undefined;
    if (!options.more) this.cursors.set(key, new Set());
    void this.request(key, async signal => {
      const result = await this.fetchPage({ parentId, cursor, signal });
      const seen = this.cursors.get(key)!;
      if (cursor) seen.add(cursor);
      if (result.nextCursor && seen.has(result.nextCursor)) throw new HierarchyFailure('error');
      const nodes = [...(options.more ? old?.nodes ?? [] : []), ...result.nodes];
      checkNodes(nodes);
      if (result.nextCursor === undefined && result.totalCount !== undefined && result.totalCount !== nodes.length) throw new HierarchyFailure('error');
      const page = { ...result, nodes };
      this.pages.set(parentId, page);
      return page;
    }, load => this.setPage(parentId, load.status === 'ready' ? load : { ...load, value: old }));
  }
  search(query: string, options: { more?: boolean } = {}) {
    this.cancel('search');
    const old = this.snapshot.search;
    const cursor = options.more && old.status === 'ready' ? old.value.nextCursor : undefined;
    if (!options.more) this.cursors.set('search', new Set());
    void this.request('search', async signal => {
      const result = await this.fetchPage({ parentId: null, query, cursor, signal });
      const seen = this.cursors.get('search')!;
      if (cursor) seen.add(cursor);
      if (result.nextCursor && seen.has(result.nextCursor)) throw new HierarchyFailure('error');
      const nodes = [...(options.more && old.status === 'ready' ? old.value.nodes : []), ...result.nodes];
      checkNodes(nodes);
      if (result.nextCursor === undefined && result.totalCount !== undefined && result.totalCount !== nodes.length) throw new HierarchyFailure('error');
      return { ...result, nodes };
    }, search => this.update({ search: search.status === 'ready' || !options.more ? search : { ...search, value: old.value } }));
  }
  /** resolveAncestors excludes the target: look up its parent page to label even an unloaded deep value. */
  resolve(id: string, options: { retry?: boolean } = {}) {
    if (!options.retry && this.snapshot.paths.has(id)) return;
    void this.request(JSON.stringify(['path', id]), async signal => {
      if (!this.source) throw new HierarchyFailure('error');
      const ancestors = await this.source.resolveAncestors(id, signal);
      checkSignal(signal); checkNodes(ancestors);
      let parent: string | null = null;
      for (const ancestor of ancestors) {
        if (ancestor.id === id || (ancestor.parentId ?? null) !== parent || !ancestor.hasChildren) throw new HierarchyFailure('error');
        parent = ancestor.id;
      }
      let target = this.nodes.get(id);
      const cached = this.pages.get(parent);
      if (!target) target = cached?.nodes.find(node => node.id === id);
      if (!target && cached && cached.nextCursor === undefined) throw new HierarchyFailure('deleted');
      let cursor = cached?.nextCursor;
      const cursors = new Set<string>();
      while (!target) {
        const page = await this.fetchPage({ parentId: parent, cursor, signal });
        target = page.nodes.find(node => node.id === id);
        if (target || !page.nextCursor) break;
        if (cursors.has(page.nextCursor)) throw new HierarchyFailure('error');
        cursors.add(page.nextCursor); cursor = page.nextCursor;
      }
      if (!target) throw new HierarchyFailure('deleted');
      if ((target.parentId ?? null) !== parent) throw new HierarchyFailure('error');
      ancestors.forEach(node => this.nodes.set(node.id, node));
      return [...ancestors, target];
    }, value => this.setPath(id, value));
  }
  /** Iterate without a depth ceiling. Check the candidate after every leaf; failure emits nothing. */
  async leaves(root: HierarchyNode, signal: AbortSignal, accept: (leaves: readonly string[]) => void): Promise<string[]> {
    type Task = { type: 'node'; node: HierarchyNode } | { type: 'page'; parent: string; cursor?: string; nodes: HierarchyNode[]; cursors: Set<string> };
    const stack: Task[] = [{ type: 'node', node: root }];
    const visited = new Set<string>();
    const leaves: string[] = [];
    while (stack.length) {
      checkSignal(signal);
      const task = stack.pop()!;
      if (task.type === 'node') {
        const { node } = task;
        if (visited.has(node.id)) throw new HierarchyFailure('error');
        visited.add(node.id);
        if (!node.hasChildren) { leaves.push(node.id); accept(leaves); }
        else stack.push({ type: 'page', parent: node.id, nodes: [], cursors: new Set() });
        continue;
      }
      const page = await this.fetchPage({ parentId: task.parent, cursor: task.cursor, signal });
      const nodes = [...task.nodes, ...page.nodes];
      checkNodes(nodes);
      if (page.nextCursor) {
        if (task.cursors.has(page.nextCursor)) throw new HierarchyFailure('error');
        task.cursors.add(page.nextCursor);
        stack.push({ ...task, nodes, cursor: page.nextCursor });
      } else {
        // An empty authorized list beneath hasChildren is incomplete, never an empty successful selection.
        if (nodes.length === 0 || (page.totalCount !== undefined && page.totalCount !== nodes.length)) throw new HierarchyFailure('error');
        const complete = { ...page, nodes };
        this.pages.set(task.parent, complete);
        this.setPage(task.parent, { status: 'ready', value: complete });
      }
      for (let index = page.nodes.length - 1; index >= 0; index--) stack.push({ type: 'node', node: page.nodes[index] });
    }
    return leaves;
  }
  cancelChildren(parentId: string) {
    this.cancel(JSON.stringify(['children', parentId]));
    if (this.snapshot.pages.get(parentId)?.status !== 'loading') return;
    const pages = new Map(this.snapshot.pages);
    const cached = this.pages.get(parentId);
    if (cached) pages.set(parentId, { status: 'ready', value: cached }); else pages.delete(parentId);
    this.update({ pages });
  }
  cancel(key: string) { this.requests.get(key)?.abort(); this.requests.delete(key); }
  dispose() {
    for (const controller of this.requests.values()) controller.abort();
    this.requests.clear();
    // StrictMode replays mount effects; interrupted entries must be loadable again.
    this.update({
      pages: new Map([...this.snapshot.pages].filter(([, load]) => load.status !== 'loading')),
      paths: new Map([...this.snapshot.paths].filter(([, load]) => load.status !== 'loading')),
    });
  }
}
