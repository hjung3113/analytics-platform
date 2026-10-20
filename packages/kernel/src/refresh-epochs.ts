/** App-wide refresh counters per endpoint id (ADR-0054): a write bumps the endpoints it invalidates, mounted queries refetch. */
export type RefreshEpochs = {
  bump: (endpointIds: readonly string[]) => void;
  get: (endpointId: string) => number;
  /** Total bumps so far; a module host folds it into its change key. */
  total: () => number;
  subscribe: (listener: () => void) => () => void;
};

export function createRefreshEpochs(): RefreshEpochs {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let total = 0;
  return {
    bump(ids) {
      if (ids.length === 0) return;
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      total++;
      for (const listener of [...listeners]) listener();
    },
    get: id => counts.get(id) ?? 0,
    total: () => total,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
