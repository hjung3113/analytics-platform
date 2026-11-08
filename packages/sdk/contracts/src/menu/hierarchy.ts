/** Dynamic data nodes are never Registry entries (ADR-0118). Targets carry stable object ids only. */
export type HierarchyNode = {
  id: string;
  parentId?: string | null;
  kind: string;
  label: string;
  hasChildren: boolean;
  target?: { menuId: string; params?: Record<string, string>; page?: Record<string, string> };
};

/** An omitted count is unknown, not zero. */
export type HierarchyPage = { nodes: HierarchyNode[]; nextCursor?: string; totalCount?: number };
export type HierarchySource = {
  listChildren(args: { parentId: string | null; cursor?: string; limit?: number; signal?: AbortSignal }): Promise<HierarchyPage>;
  /** Root through immediate parent; excludes the requested node. */
  resolveAncestors(nodeId: string, signal?: AbortSignal): Promise<HierarchyNode[]>;
  searchNodes?: (args: { query: string; cursor?: string; limit?: number; signal?: AbortSignal }) => Promise<HierarchyPage>;
};

/** Adapters may reject with the equivalent plain object across package copies. */
export class HierarchyFailure extends Error {
  constructor(readonly kind: 'forbidden' | 'deleted' | 'error', message: string = kind) {
    super(message);
    this.name = 'HierarchyFailure';
  }
}

export function isHierarchyFailure(value: unknown): value is HierarchyFailure {
  if (typeof value !== 'object' || value === null) return false;
  const failure = value as { name?: unknown; kind?: unknown };
  return failure.name === 'HierarchyFailure' && (failure.kind === 'forbidden' || failure.kind === 'deleted' || failure.kind === 'error');
}
