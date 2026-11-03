// useFindingsList — react-query wrapper for GET /findings.
// Optional managed_system_id and execution=none mirror the backend query params.
// Absent execution leaves the list unfiltered.

import { apiRequest } from '@/lib/api/client';
import { ApiError, ApiParseError } from '@/lib/api/types';
import { placeholderDataForSearchOnly } from '@/lib/query/placeholder-data-for-search';
import { LIST_MAX_LIMIT, listFindingsResponseSchema } from '@ap/feature-shared';
import type { ListFindingsResponse } from '@ap/feature-shared';
import { type UseQueryResult, useInfiniteQuery, useQuery } from '@tanstack/react-query';

export function useFindingsList(
  managedSystemId?: string,
  execution?: 'none',
  enabled = true,
): UseQueryResult<ListFindingsResponse> {
  return useQuery({
    queryKey: ['findings', { managedSystemId, execution }] as const,
    queryFn: async ({ signal }) => {
      // Callers pick from the whole set, so follow the cursor of the paged endpoint (cap 100).
      const items: ListFindingsResponse['items'] = [];
      let cursor: string | undefined;
      do {
        const params = new URLSearchParams({ limit: String(LIST_MAX_LIMIT) });
        if (managedSystemId !== undefined) params.set('managed_system_id', managedSystemId);
        if (execution === 'none') params.set('execution', 'none');
        if (cursor !== undefined) params.set('cursor', cursor);
        const res = await apiRequest('GET', `/findings?${params}`, listFindingsResponseSchema, {
          signal,
        });
        items.push(...res.data.items);
        cursor = res.data.page?.has_more ? res.data.page.cursor : undefined;
      } while (cursor !== undefined);
      return { items, page: { has_more: false } };
    },
    staleTime: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiParseError) &&
      !(
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) &&
      failureCount < 1,
    enabled,
  });
}

const PAGE_SIZE = 50;
export function useFindingsPages(
  managedSystemId?: string,
  execution?: 'none',
  assignment?: 'assigned' | 'unassigned',
  analyticsAreaId?: string,
  status?: 'active',
  q?: string,
) {
  const queryKey = [
    'findings',
    'pages',
    { managedSystemId, execution, assignment, analyticsAreaId, status, q },
  ] as const;
  return useInfiniteQuery({
    queryKey,
    placeholderData: (previousData, previousQuery) =>
      placeholderDataForSearchOnly(queryKey, previousData, previousQuery),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (managedSystemId !== undefined) params.set('managed_system_id', managedSystemId);
      if (execution !== undefined) params.set('execution', execution);
      if (assignment !== undefined) params.set('assignment', assignment);
      if (analyticsAreaId !== undefined) params.set('analytics_area_id', analyticsAreaId);
      if (status !== undefined) params.set('status', status);
      if (q !== undefined) params.set('q', q);
      if (pageParam !== undefined) params.set('cursor', pageParam);
      return (
        await apiRequest('GET', `/findings?${params}`, listFindingsResponseSchema, { signal })
      ).data;
    },
    getNextPageParam: (last: ListFindingsResponse) =>
      last.page?.has_more ? last.page.cursor : undefined,
    staleTime: 30_000,
    retry: (count, error) =>
      !(error instanceof ApiParseError) &&
      !(
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) &&
      count < 1,
  });
}

export function useFindingsTotal(managedSystemId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['findings', 'total', { managedSystemId }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ limit: '1' });
      if (managedSystemId !== undefined) params.set('managed_system_id', managedSystemId);
      return (
        await apiRequest('GET', `/findings?${params}`, listFindingsResponseSchema, { signal })
      ).data;
    },
    enabled,
    retry: (count, error) => !(error instanceof ApiParseError) && count < 1,
  });
}
