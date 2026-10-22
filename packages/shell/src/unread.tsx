import type { ReactNode } from 'react';
import { usePlatform } from '@ap/kernel';

export const formatUnread = (count: number): string => (count > 99 ? '99+' : String(count));

/** The unread count of one platform menu, or `null` when the notifications slot is absent or belongs to another menu (#652). */
export function MenuUnread({ menuId, children }: { menuId: string; children: (count: number | null) => ReactNode }) {
  const { slots } = usePlatform();
  const slot = slots.notifications;
  if (slot?.menuId === menuId) return <slot.UnreadCount>{children}</slot.UnreadCount>;
  return <>{children(null)}</>;
}
