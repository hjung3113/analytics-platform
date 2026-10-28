// useMe — shared react-query wrapper for /me and the authenticated route guards.
// It reuses the five-minute cache and retries only 429 responses with a bounded delay.

import { fetchMe } from '@/lib/api';
import type { MeResponse } from '@/lib/api';
import { ME_QUERY_KEY, ME_STALE_TIME, meRetry, meRetryDelay } from '@/lib/api/me';
import { useQuery } from '@tanstack/react-query';
import type { QueryClient, UseQueryResult } from '@tanstack/react-query';

export type { MeResponse };

export { ME_QUERY_KEY };

export function meQueryOptions() {
  return {
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchMe(signal),
    staleTime: ME_STALE_TIME,
    retry: meRetry,
    retryDelay: meRetryDelay,
  } as const;
}

export function ensureMe(queryClient: QueryClient): Promise<MeResponse> {
  return queryClient.ensureQueryData({ ...meQueryOptions(), revalidateIfStale: true });
}

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery<MeResponse>(meQueryOptions());
}
