import type { ReactNode } from 'react';
import type { NotificationsSlot } from '@ap/kernel';
import { FoScreenRoot, InboxPanel, useUnreadNotificationCount, type HostSeam } from '@fops/frontend/global-screens';
import { FoBridge, UnlinkedLink } from './fo/FoBridge';
import { foQueryClient, useFoSession } from './fo/session';

// The count renders no FeedbackOps screen; `FoScreenRoot` is only its QueryClient provider.
const COUNT_SEAM: HostSeam = { canLink: () => false, Link: UnlinkedLink, notifyError: () => undefined };

function Count({ enabled, children }: { enabled: boolean; children: (count: number | null) => ReactNode }) {
  const { data } = useUnreadNotificationCount({ enabled });
  return <>{children(enabled ? (data ?? null) : null)}</>;
}

/** Same tree for every session status, so the shell's bell/link never remounts when the count arrives (focus stays on it). */
function UnreadCount({ children }: { children: (count: number | null) => ReactNode }) {
  const session = useFoSession();
  return <FoScreenRoot client={foQueryClient} host={COUNT_SEAM}><Count enabled={session.status === 'ready'}>{children}</Count></FoScreenRoot>;
}

function Recent() {
  return <FoBridge><InboxPanel variant="recent" /></FoBridge>;
}

/** The rail bell and platform-menu badge for 알림 (ADR-0070 decision 4, #652). Only `apps/platform-web/src/main.tsx` imports this. */
export const notificationsSlot: NotificationsSlot = { menuId: 'notifications', UnreadCount, Recent };
