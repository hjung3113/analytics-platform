// Pure Revision logic of one RuleSet (design log-rules §3.2, §5.2): the order of its Revisions, which one is current, and
// the change between a Revision and the one it `supersedes`. The Validator's `supersedes` string is the only continuity
// claim the platform has (no release time is reported in v0), so it is the only thing that orders or links Revisions.
// Revision strings are compared exactly, never case-folded or normalized.

export interface RevisionNode {
  revision: string;
  status: 'active' | 'retired';
  supersedes: string | null;
}

const byRevision = (a: { revision: string }, b: { revision: string }): number =>
  a.revision < b.revision ? -1 : a.revision > b.revision ? 1 : 0;

/**
 * Predecessors first: a Revision follows the Revision it supersedes. Revisions that supersede nothing (or something
 * not in this snapshot, or themselves) start a chain; chains and siblings are ordered by revision string. A cycle never
 * loops: the Revisions it leaves unvisited are appended in revision order.
 */
export function orderRevisions<T extends RevisionNode>(revisions: readonly T[]): T[] {
  const known = new Set(revisions.map((r) => r.revision));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const r of revisions) {
    if (r.supersedes !== null && r.supersedes !== r.revision && known.has(r.supersedes)) {
      const list = children.get(r.supersedes) ?? [];
      list.push(r);
      children.set(r.supersedes, list);
    } else roots.push(r);
  }
  const out: T[] = [];
  const seen = new Set<string>();
  const visit = (r: T): void => {
    if (seen.has(r.revision)) return;
    seen.add(r.revision);
    out.push(r);
    for (const child of [...(children.get(r.revision) ?? [])].sort(byRevision)) visit(child);
  };
  for (const r of [...roots].sort(byRevision)) visit(r);
  for (const r of [...revisions].sort(byRevision)) visit(r);
  return out;
}

/** The Revision `revision` supersedes, when it is part of the same snapshot. */
export function predecessorOf<T extends RevisionNode>(revisions: readonly T[], revision: T): T | null {
  if (revision.supersedes === null || revision.supersedes === revision.revision) return null;
  return revisions.find((r) => r.revision === revision.supersedes) ?? null;
}

/**
 * The current Revision: an `active` one that no other `active` one supersedes. Several heads (the Validator reported
 * parallel active Revisions) resolve to the last in order; `headCount > 1` lets a caller say so. No head (none active, or
 * active Revisions that only supersede each other in a cycle) = null.
 */
export function currentRevision<T extends RevisionNode>(ordered: readonly T[]): { current: T | null; headCount: number } {
  const active = ordered.filter((r) => r.status === 'active');
  // A Revision naming itself does not supersede itself: self edges are ignored.
  const superseded = new Set(active.filter((r) => r.supersedes !== r.revision).map((r) => r.supersedes).filter((s): s is string => s !== null));
  const heads = active.filter((r) => !superseded.has(r.revision));
  return { current: heads[heads.length - 1] ?? null, headCount: heads.length };
}

export interface RevisionChanges {
  added: string[];
  removed: string[];
  supportChanged: { ruleKey: string; from: string; to: string }[];
  addedCount: number;
  removedCount: number;
  supportChangedCount: number;
  /** A list was cut at `CHANGE_LIST_MAX`; the counts are complete. */
  truncated: boolean;
}

export const CHANGE_LIST_MAX = 500;

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Rule keys added, removed and with a different `support` from `before` to `after` (maps of ruleKey to support). */
export function diffRules(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): RevisionChanges {
  const added = [...after.keys()].filter((k) => !before.has(k)).sort(byKey);
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort(byKey);
  const supportChanged = [...after.entries()]
    .filter(([k, to]) => before.has(k) && before.get(k) !== to)
    .map(([ruleKey, to]) => ({ ruleKey, from: before.get(ruleKey) as string, to }))
    .sort((a, b) => byKey(a.ruleKey, b.ruleKey));
  return {
    added: added.slice(0, CHANGE_LIST_MAX),
    removed: removed.slice(0, CHANGE_LIST_MAX),
    supportChanged: supportChanged.slice(0, CHANGE_LIST_MAX),
    addedCount: added.length,
    removedCount: removed.length,
    supportChangedCount: supportChanged.length,
    truncated: [added, removed, supportChanged].some((l) => l.length > CHANGE_LIST_MAX),
  };
}
