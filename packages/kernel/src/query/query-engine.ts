import { QueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * The Kernel's internal query client (ADR-0086). One per `PlatformProvider`, never recreated: a mounted observer stays
 * bound to its first client. It is passed to `useQuery(options, client)` explicitly, so it is not the client a menu or
 * FeedbackOps `QueryClientProvider` sees, and no TanStack type leaves `@ap/kernel`.
 */
export type QueryEngine = {
  client: QueryClient;
  /** `${adapterEpoch}:${revision}:${userId}` — index 1 of every Kernel query key. */
  gen: string;
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        structuralSharing: false,
      },
    },
  });
}

/** Drops every query of another session generation, so old data leaves memory in the commit that renders the new one. */
export function removeOtherGenerations(client: QueryClient, gen: string): void {
  client.removeQueries({ predicate: query => query.queryKey[1] !== gen });
}

/**
 * A write bump supersedes every `menu` query of those endpoints (ADR-0086): cancel first (aborts an in-flight read and
 * reverts to the prior state, so a pending initial read cannot win with its pre-write snapshot), then invalidate (active
 * ones refetch with the prior data kept; inactive ones turn stale; disabled observers are not refetched). The invalidation
 * uses `cancelRefetch: false` so a request started after the cancel (a group Retry) is shared, not aborted again.
 */
export function invalidateEndpoints(client: QueryClient, endpointIds: readonly string[]): void {
  const predicate = (query: { queryKey: QueryKey }) => query.queryKey[0] === 'menu' && endpointIds.includes(query.queryKey[2] as string);
  void client.cancelQueries({ predicate }).then(() => client.invalidateQueries({ predicate }, { cancelRefetch: false }));
}

/**
 * Provider lifetime of the client: `mount()` (online/focus wiring, so offline-paused requests resume — no
 * `QueryClientProvider` does it for us) and the one cancel rule: a pending (fetching or paused) query with no enabled observer left is cancelled.
 */
export function startQueryEngine(client: QueryClient): () => void {
  client.mount();
  const stop = client.getQueryCache().subscribe(event => {
    if (event.type !== 'observerRemoved' && event.type !== 'observerOptionsUpdated' && event.type !== 'observerAdded') return;
    const { query } = event;
    if (query.state.fetchStatus !== 'idle' && !query.observers.some(observer => observer.options.enabled !== false)) {
      void client.cancelQueries({ queryKey: query.queryKey, exact: true });
    }
  });
  return () => { stop(); client.unmount(); };
}
