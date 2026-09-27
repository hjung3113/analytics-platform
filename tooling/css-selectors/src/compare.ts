export interface SelectorDiff {
  /** Selectors present in head but not in base, sorted. */
  added: string[];
  /** Selectors present in base but no longer in head, sorted. */
  removed: string[];
}

/** Set difference of two selector collections. Input order is irrelevant. */
export function diffSelectors(base: Iterable<string>, head: Iterable<string>): SelectorDiff {
  const baseSet = new Set(base);
  const headSet = new Set(head);
  return {
    added: [...headSet].filter((s) => !baseSet.has(s)).sort(),
    removed: [...baseSet].filter((s) => !headSet.has(s)).sort(),
  };
}
