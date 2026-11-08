import { HierarchyFailure, type HierarchyNode, type HierarchyPage, type HierarchySource } from '@ap/contracts';

export type SyntheticHierarchyOptions = {
  nodes?: number;
  depth?: number;
  delayMs?: number;
  /** Keys: children:root, children:<id>, ancestors:<id>, search:<query>. */
  failures?: Readonly<Record<string, HierarchyFailure['kind']>>;
};

/** Test-only consumer; stable ids and deterministic labels, no app or menu dependency. */
export function createSyntheticHierarchySource({ nodes: count = 5000, depth = 6, delayMs = 0, failures = {} }: SyntheticHierarchyOptions = {}): HierarchySource {
  const size = Math.max(0, Math.floor(count));
  const levels = Math.max(1, Math.floor(depth));
  const nodes: HierarchyNode[] = [];
  const byId = new Map<string, HierarchyNode>();
  const children = new Map<string | null, HierarchyNode[]>();
  const rootCount = Math.min(size, Math.max(1, Math.ceil(size / 40)));
  let previous: HierarchyNode[] = [];
  for (let level = 0; level < levels && nodes.length < size; level++) {
    const remaining = size - nodes.length;
    const width = level === 0 ? (levels === 1 ? size : rootCount) : level === levels - 1 ? remaining : Math.min(remaining, previous.length * 2);
    const current: HierarchyNode[] = [];
    for (let i = 0; i < width; i++) {
      const id = `node-${String(nodes.length + 1).padStart(4, '0')}`;
      const parent = level === 0 ? undefined : previous[Math.floor(i * previous.length / width)];
      const node: HierarchyNode = { id, parentId: parent?.id ?? null, kind: `level-${level + 1}`, label: `Item ${nodes.length + 1}`, hasChildren: false };
      if (parent) parent.hasChildren = true;
      const siblings = children.get(node.parentId ?? null) ?? []; siblings.push(node); children.set(node.parentId ?? null, siblings);
      nodes.push(node); current.push(node); byId.set(id, node);
    }
    previous = current;
  }
  const wait = async (key: string, signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException('Superseded', 'AbortError');
    if (delayMs > 0) await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Superseded', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delayMs);
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (failures[key]) throw new HierarchyFailure(failures[key]);
  };
  const page = (items: HierarchyNode[], cursor?: string, limit = 50): HierarchyPage => {
    const start = Number(cursor ?? 0);
    const end = Math.min(items.length, start + Math.max(1, Math.min(200, limit)));
    return { nodes: items.slice(start, end), nextCursor: end < items.length ? String(end) : undefined, totalCount: items.length };
  };
  return {
    async listChildren({ parentId, cursor, limit, signal }) { await wait(`children:${parentId ?? 'root'}`, signal); return page(children.get(parentId) ?? [], cursor, limit); },
    async resolveAncestors(id, signal) {
      await wait(`ancestors:${id}`, signal);
      if (!byId.has(id)) throw new HierarchyFailure('deleted');
      const path: HierarchyNode[] = [];
      let node = byId.get(id);
      while (node?.parentId) { node = byId.get(node.parentId); if (node) path.unshift(node); }
      return path;
    },
    async searchNodes({ query, cursor, limit, signal }) { await wait(`search:${query}`, signal); return page(nodes.filter(node => node.label.toLowerCase().includes(query.toLowerCase())), cursor, limit); },
  };
}
