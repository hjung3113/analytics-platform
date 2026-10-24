// The all-systems Managed System read for bridge screens: same query key and options as `managedSystemsCatalogQuery` in
// `useManagedSystemNames.ts` (so the cache is shared), but fetched through `registry-reads.ts` (`client.ts`) instead of the
// raw-`fetch` `managed-systems.ts` the platform bridge graph bans (ADR-0071).

import { fetchManagedSystems } from '@/lib/api/registry-reads';

export function managedSystemsCatalogBridgeQuery() {
  return {
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchManagedSystems({ includeArchived: true, limit: 500, signal }),
    staleTime: 10 * 60 * 1000,
  };
}
