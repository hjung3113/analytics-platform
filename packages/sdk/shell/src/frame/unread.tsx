import type { ReactNode } from 'react';
import { useHostPlatform } from '@ap/kernel/host';
import { ShellBoundary } from './ShellBoundary';

/** The unread count of one platform menu, or `null` when the notifications slot is absent or belongs to another menu (#652). */
export function MenuUnread({ menuId, children }: { menuId: string; children: (count: number | null) => ReactNode }) {
  const { slots } = useHostPlatform();
  const slot = slots.notifications;
  // Menu code: a throwing count reads as unknown (`null`), so the row or link it decorates stays (#1876).
  if (slot?.menuId === menuId) return <ShellBoundary fallback={<UnknownCount>{children}</UnknownCount>}><slot.UnreadCount>{children}</slot.UnreadCount></ShellBoundary>;
  return <>{children(null)}</>;
}

const UnknownCount = ({ children }: { children: (count: null) => ReactNode }) => <>{children(null)}</>;
