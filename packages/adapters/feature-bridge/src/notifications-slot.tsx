import { lazy, Suspense, type ReactNode } from 'react';
import type { NotificationsSlot } from '@ap/kernel';
import { FeatureScreenRoot, useUnreadNotificationCount, type HostSeam } from '@ap/feature-screens/global-screens/core';
import { UnlinkedLink } from './feature/FeatureBridge';
import { featureQueryClient, useFeatureSession } from './feature/session';

// The count renders no feature screen; `FeatureScreenRoot` is only its QueryClient provider.
const COUNT_SEAM: HostSeam = { canLink: () => false, Link: UnlinkedLink, notifyError: () => undefined, notifySuccess: () => undefined };

function Count({ enabled, children }: { enabled: boolean; children: (count: number | null) => ReactNode }) {
  const { data } = useUnreadNotificationCount({ enabled });
  return <>{children(enabled ? (data ?? null) : null)}</>;
}

/** Same tree for every session status, so the shell's bell/link never remounts when the count arrives (focus stays on it). */
function UnreadCount({ children }: { children: (count: number | null) => ReactNode }) {
  const session = useFeatureSession();
  return <FeatureScreenRoot client={featureQueryClient} host={COUNT_SEAM}><Count enabled={session.status === 'ready'}>{children}</Count></FeatureScreenRoot>;
}

// The panel and its reads load on first open; the bell and badge above never wait for it.
const RecentInbox = lazy(() => import('./pages/RecentInbox'));

function Recent() {
  return <Suspense fallback={null}><RecentInbox /></Suspense>;
}

/** The rail bell and platform-menu badge for 알림 (ADR-0070 decision 4, #652). Only `apps/platform-web/src/main.tsx` imports this. */
export const notificationsSlot: NotificationsSlot = { menuId: 'notifications', UnreadCount, Recent };
