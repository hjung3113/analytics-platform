// Which Top View pointer applies to a target SW version of a model (#1656, ADR-0111 «a SW with no change follows the model»).
// Pure: the row whose start SW has the greatest `release_order` at or below the target's wins; none → the model default row
// (`fromReleaseOrder: null`); none → unlinked. `release_order` is not unique (a later edit swaps two orders), so a tie goes to the
// smaller `tieKey` (the link id) to stay deterministic. No target (a model without SW versions) → the default only.

export interface TopViewLinkCandidate {
  /** `release_order` of the start SW, or `null` for the model default row. */
  fromReleaseOrder: number | null;
  /** Deterministic tie-break among rows with the same order. */
  tieKey: string;
}

export function resolveTopViewLink<T extends TopViewLinkCandidate>(rows: readonly T[], targetReleaseOrder: number | null): T | null {
  let best: T | null = null;
  let fallback: T | null = null;
  for (const row of rows) {
    if (row.fromReleaseOrder === null) {
      if (fallback === null || row.tieKey < fallback.tieKey) fallback = row;
      continue;
    }
    if (targetReleaseOrder === null || row.fromReleaseOrder > targetReleaseOrder) continue;
    if (
      best === null ||
      row.fromReleaseOrder > (best.fromReleaseOrder as number) ||
      (row.fromReleaseOrder === best.fromReleaseOrder && row.tieKey < best.tieKey)
    ) {
      best = row;
    }
  }
  return best ?? fallback;
}
