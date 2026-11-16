import { HierarchyFailure, type HierarchyNode, type HierarchyPage } from '@ap/contracts';

/**
 * The one paging rule for a `HierarchySource` cursor chain, shared by the sidebar navigation state and the page-condition tree
 * (#2360). A source cannot silently duplicate nodes (the sidebar de-duplicates across pages, ADR-0118), exceed the requested page size, repeat or loop a cursor, or hide an incomplete
 * list behind a missing or changed `totalCount`; every violation is an `error` failure, never a quiet end of the list.
 */

/** A count announced by any page of a cursor chain binds the whole chain: a later page that omits or changes it cannot hide an incomplete list. */
export function reconcileTotal(previous: number | undefined, next: number | undefined): number | undefined {
  if (previous !== undefined && next !== undefined && previous !== next) throw new HierarchyFailure('error');
  return next ?? previous;
}

/** Well-formed nodes with unique ids. */
export function checkHierarchyNodes(nodes: readonly HierarchyNode[]): void {
  if (!Array.isArray(nodes)) throw new HierarchyFailure('error');
  const seen = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || typeof node.label !== 'string' || !node.label || typeof node.hasChildren !== 'boolean' || (node.parentId !== undefined && node.parentId !== null && typeof node.parentId !== 'string') || seen.has(node.id)) throw new HierarchyFailure('error');
    seen.add(node.id);
  }
}

/** One response: nodes valid, at most `limit`, a real new cursor, a sane `totalCount`. */
export function checkHierarchyPageShape(result: HierarchyPage, { limit, cursor }: { limit: number; cursor?: string }): void {
  checkHierarchyNodes(result.nodes);
  if (result.nodes.length > limit
    || (result.nextCursor !== undefined && (typeof result.nextCursor !== 'string' || !result.nextCursor || result.nextCursor === cursor))
    || (result.totalCount !== undefined && (!Number.isSafeInteger(result.totalCount) || result.totalCount < result.nodes.length))) throw new HierarchyFailure('error');
}

/**
 * Appends one response to the chain so far. `seen` holds the cursors already sent in this chain (a repeat is a loop); the last page
 * must agree with any announced total.
 */
export function mergeHierarchyChain({ previous, result, cursor, seen, dedupe = false }: { previous?: HierarchyPage; result: HierarchyPage; cursor?: string; seen: Set<string>; dedupe?: boolean }): HierarchyPage {
  if (cursor) seen.add(cursor);
  if (result.nextCursor && seen.has(result.nextCursor)) throw new HierarchyFailure('error');
  // The sidebar keeps ADR-0118's id de-duplication across pages; the page-condition tree, which collects values, refuses a repeated id.
  const known = new Set((previous?.nodes ?? []).map(node => node.id));
  const nodes = [...(previous?.nodes ?? []), ...(dedupe ? result.nodes.filter(node => !known.has(node.id)) : result.nodes)];
  checkHierarchyNodes(nodes);
  const total = reconcileTotal(previous?.totalCount, result.totalCount);
  if (result.nextCursor === undefined && total !== undefined && total !== nodes.length) throw new HierarchyFailure('error');
  return { ...result, nodes, ...(total === undefined ? {} : { totalCount: total }) };
}
