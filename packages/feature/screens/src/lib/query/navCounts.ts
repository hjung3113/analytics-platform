import type { QueryClient } from '@tanstack/react-query';

export const NAV_COUNTS_QUERY_KEY = ['nav-counts'] as const;

export function invalidateNavCounts(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: NAV_COUNTS_QUERY_KEY });
}

export function resetNavCounts(queryClient: QueryClient): void {
  // Clear stale data before active observers refetch.
  void queryClient.resetQueries({ queryKey: NAV_COUNTS_QUERY_KEY });
}
