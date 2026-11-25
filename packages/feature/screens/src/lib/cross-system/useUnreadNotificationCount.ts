import { useQuery } from '@tanstack/react-query';

import { fetchUnreadNotificationCount, notificationsQueryKey } from '../api/notifications';
import { shouldRefetchOnFocus } from '../query/query-client';

export function useUnreadNotificationCount(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: [...notificationsQueryKey, 'unread-count'] as const,
    queryFn: ({ signal }) => fetchUnreadNotificationCount(signal),
    refetchInterval: 60_000,
    retry: false,
    // The actor's own unread rows, independent of any withdrawable permission, read on every page: a tab return reads it
    // again only after 30 seconds; the 60-second poll is unchanged (#2819).
    refetchOnWindowFocus: shouldRefetchOnFocus,
    enabled: options.enabled ?? true,
  });

  return { ...query, data: query.isError ? undefined : query.data };
}

export function formatUnreadBadge(unreadCount: number): string {
  return unreadCount > 99 ? '99+' : String(unreadCount);
}
