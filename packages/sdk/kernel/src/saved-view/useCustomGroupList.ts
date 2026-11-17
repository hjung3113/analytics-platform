import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SavedViewListItem } from '@ap/contracts';
import { useHostPlatform, useQueryEngine } from '../platform/platform';
import { customGroupItemId } from './expand-custom-groups';
import { customGroupListQueryKey, customGroupListQueryOptions, type GroupListResult } from './custom-group-list-cache';

export type CustomGroupList = {
  status: 'loading' | 'ready' | 'error';
  items: readonly SavedViewListItem[];
  remember(entry: SavedViewListItem): void;
};
const EMPTY_ITEMS: readonly SavedViewListItem[] = [];

/** Host observer of the same saved-group request awaited by menu expansion. */
export function useCustomGroupList(scopeId: string | null, enabled: boolean): CustomGroupList {
  const { savedViewStore: store, session } = useHostPlatform();
  const { client, gen } = useQueryEngine();
  const userId = session.user.id;
  const active = enabled && !!store && !!scopeId;
  const query = useQuery({
    ...customGroupListQueryOptions(client, gen, store, userId),
    enabled: active,
  }, client);
  const identity = useMemo(() => ({ gen, scopeId, store, session, active, live: false }), [gen, scopeId, store, session, active]);
  const [observed, setObserved] = useState({ identity, previous: query.data });
  if (observed.identity !== identity) setObserved({ identity, previous: query.data });
  const { refetch } = query;
  useEffect(() => {
    identity.live = true;
    // A Scope transition observes the user-wide key again, sharing any read already in flight.
    if (active) void refetch({ cancelRefetch: false });
    return () => { identity.live = false; };
  }, [identity, active, refetch]);
  const remember = useCallback((entry: SavedViewListItem) => {
    if (!identity.live || !active) return;
    client.setQueryData<GroupListResult>(customGroupListQueryKey(gen, userId), previous => ({
      ok: true,
      items: [...(previous?.ok ? previous.items : []).filter(item => customGroupItemId(item) !== customGroupItemId(entry)), entry],
    }));
  }, [identity, active, client, gen, userId]);
  let status: CustomGroupList['status'] = 'ready';
  let items = EMPTY_ITEMS;
  if (active) {
    if (observed.identity !== identity || !query.data || (observed.previous !== undefined && observed.previous === query.data)) status = 'loading';
    else if (!query.data.ok) status = 'error';
    else items = query.data.items;
  }
  return useMemo(() => ({ status, items, remember }), [status, items, remember]);
}
