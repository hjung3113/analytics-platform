import { type ComponentType, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { spaceId } from '@ap/contracts';
import { usePlatform, type NavCountsSlot } from '@ap/kernel';
import { fetchNavCounts } from '@/lib/api/nav';
import { NAV_COUNTS_QUERY_KEY } from '@/lib/query/navCounts';
import { foQueryClient, useFoSession } from './fo/session';

const FEEDBACKOPS = spaceId('feedbackops');
const SCOPE_KEY = 'managedSystem';

/** FeedbackOps count key → sidebar slot key (`menuId`, or `menuId/viewId` for a `navViews` item). Copied from FeedbackOps `NAV_TREE.voc`; the fo-voc views test pins the hrefs. */
const SLOT_KEYS: Readonly<Record<string, string>> = {
  'voc.inbox': 'fo-inbox',
  'voc.triage': 'fo-triage',
  'voc.clusters': 'fo-clusters',
  'voc.inbox.no-link': 'fo-inbox/no-link',
  'voc.tab.high': 'fo-triage/high',
  'voc.tab.unassigned': 'fo-triage/unassigned',
  'findings.all': 'fo-findings',
  'surveys.all': 'fo-surveys',
};

/** An omitted FeedbackOps key stays omitted (no visible queue → no badge); zero stays zero. */
function toSlotCounts(counts: Readonly<Record<string, number | undefined>>): Record<string, number> {
  const slot: Record<string, number> = {};
  for (const [foKey, slotKey] of Object.entries(SLOT_KEYS)) {
    const value = counts[foKey];
    if (typeof value === 'number') slot[slotKey] = value;
  }
  return slot;
}

/**
 * The counts for the page's `managedSystem` (all systems without it). One `useQuery` on the shared FeedbackOps QueryClient under
 * `[...NAV_COUNTS_QUERY_KEY, managedSystem]` (an absent scope is `undefined`, as on the FeedbackOps screens), so the screens' own observers and
 * this slot share one query: `invalidateNavCounts` refetches it once and the badges follow, and leaving the scope cancels a read nobody else watches.
 * `null` while loading (a different scope never shows the previous scope's badges), in mock, with a session that is not ready and after an error.
 * `retry: false` matches the FeedbackOps screens' observers of this key.
 */
function useNavCounts(managedSystem: string | null): Record<string, number> | null {
  const session = useFoSession();
  const scope = managedSystem ?? undefined;
  const { data, isError } = useQuery({
    queryKey: [...NAV_COUNTS_QUERY_KEY, scope] as const,
    queryFn: ({ signal }) => fetchNavCounts({ ...(scope !== undefined ? { managedSystemId: scope } : {}), signal }),
    enabled: session.status === 'ready',
    retry: false,
  }, foQueryClient);
  return session.status === 'ready' && !isError && data !== undefined ? toSlotCounts(data.counts) : null;
}

/**
 * One component for every state (mock, pending, loading, error, ready): `children` is called at the same tree position each time,
 * so the sidebar list below it never remounts when the counts arrive.
 */
function NavCounts({ children }: { children: (counts: Readonly<Record<string, number>> | null) => ReactNode }) {
  const { pageParam } = usePlatform();
  const counts = useNavCounts(pageParam(SCOPE_KEY) || null);
  return <>{children(counts)}</>;
}

const COUNTS: ComponentType<{ children: (counts: Readonly<Record<string, number>> | null) => ReactNode }> = NavCounts;

/** The FeedbackOps sidebar count badges (06 §8 `navCounts`, #761). Only `apps/platform-web/src/main.tsx` imports this. */
export const navCountsSlot: NavCountsSlot = { For: id => id === FEEDBACKOPS ? COUNTS : null };
