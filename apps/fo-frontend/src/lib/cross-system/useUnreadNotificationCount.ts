import { useQuery } from '@tanstack/react-query';

import { fetchUnreadNotificationCount, notificationsQueryKey } from '@/lib/api/notifications';

export function useUnreadNotificationCount(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: [...notificationsQueryKey, 'unread-count'] as const,
    queryFn: ({ signal }) => fetchUnreadNotificationCount(signal),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: options.enabled ?? true,
  });

  return { ...query, data: query.isError ? undefined : query.data };
}

export function formatUnreadBadge(unreadCount: number): string {
  return unreadCount > 99 ? '99+' : String(unreadCount);
}
