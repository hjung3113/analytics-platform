import { useId, useState } from 'react';
import { isPermissionDenied } from '@/lib/api/types';
import { hashKey, useInfiniteQuery } from '@tanstack/react-query';
import { fetchVocListPage, useVocList, type UseVocListParams } from './useVocList';

/** Keep Triage's pin-only retention and permission gate, and append cursor pages on demand. */
export function useTriagePages(params: UseVocListParams) {
  const first = useVocList(params);
  const { managedSystemId, tab, filters } = params;
  const cursor = first.data?.page?.cursor;
  const scope = hashKey([managedSystemId, tab, filters]);
  const instance = useId();
  const [paging, setPaging] = useState({ scope, requested: false, chain: 0 });
  // A context return starts a new chain, including when the old tail was complete.
  if (paging.scope !== scope) setPaging({ scope, requested: false, chain: paging.chain + 1 });
  const more = useInfiniteQuery({
    queryKey: ['vocs', 'triage', 'more', { managedSystemId, tab, filters, cursor }, instance, paging.chain],
    gcTime: 0,
    // Once requested, loaded pages remain active so mutation invalidations refresh them too.
    enabled: paging.scope === scope && paging.requested && params.enabled !== false && first.isSuccess && cursor !== undefined,
    initialPageParam: cursor,
    queryFn: ({ signal, pageParam }) => fetchVocListPage({
      view: 'triage', managedSystemId, tab, filters, q: undefined, sort: undefined,
      limit: 50, pinVocId: undefined,
    }, { signal, cursor: pageParam }),
    getNextPageParam: (last) => last.page.has_more ? last.page.cursor : undefined,
    retry: false,
  });
  // Preserve server order and prefer the current first-page row over an overlapping pin.
  const seen = new Set<string>();
  const mergedItems = [
    ...(first.data?.items ?? []),
    ...(more.data?.pages.flatMap((page) => page.items) ?? []),
  ].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const hasMore = more.data === undefined ? first.data?.page?.has_more === true : more.hasNextPage;
  return {
    ...first,
    data: first.data === undefined ? undefined : { ...first.data, items: mergedItems },
    error: isPermissionDenied(first.error) ? first.error : more.error ?? first.error,
    isSuccess: first.isSuccess && !more.isError,
    isError: first.isError || more.isError,
    isFetching: first.isFetching || more.isFetching,
    hasMore,
    morePending: more.isFetching,
    moreError: more.isError,
    loadMore: () => {
      if (params.enabled !== false && first.isSuccess && !first.isFetching && hasMore && cursor && !more.isFetching) {
        setPaging({ scope, requested: true, chain: paging.chain });
        void more.fetchNextPage({ cancelRefetch: false });
      }
    },
  };
}
