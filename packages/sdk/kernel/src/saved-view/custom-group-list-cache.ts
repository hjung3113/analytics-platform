import { readSharedQuery } from '../query/shared-query-read';
import type { QueryClient } from '@tanstack/react-query';
import type { SavedViewListItem, SavedViewStore } from '@ap/contracts';

export const customGroupListQueryKey = (gen: string, userId: string) => ['request', gen, 'shared', ['custom-groups', userId]] as const;
export type GroupListResult = { ok: true; items: readonly SavedViewListItem[] } | { ok: false; error: unknown };

export function customGroupListQueryOptions(client: QueryClient, gen: string, store: SavedViewStore | null | undefined, userId: string) {
  const queryKey = customGroupListQueryKey(gen, userId);
  return {
    queryKey,
    // Only in-flight reads share: every later Apply rechecks server ACL.
    staleTime: 0,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<GroupListResult> => {
      try {
        if (!store) throw new Error('saved-view store is unavailable');
        const items = await store.list({ userId, menuId: null, kind: 'custom-group' });
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        return { ok: true, items };
      } catch (error) {
        if (signal.aborted) throw error;
        return { ok: false, error };
      }
    },
  };
}

export async function readCustomGroupList(client: QueryClient, gen: string, store: SavedViewStore, userId: string, signal?: AbortSignal): Promise<readonly SavedViewListItem[]> {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const result = await readSharedQuery(client, customGroupListQueryOptions(client, gen, store, userId), signal);
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  if (!result.ok) {
    client.removeQueries({ queryKey: customGroupListQueryKey(gen, userId), exact: true });
    throw result.error;
  }
  return result.items;
}
