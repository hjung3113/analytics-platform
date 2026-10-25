import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
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
  'voc.inbox.no-link': 'fo-inbox/no-link',
  'voc.tab.high': 'fo-triage/high',
  'voc.tab.unassigned': 'fo-triage/unassigned',
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

type Loaded = { scope: string; epoch: number; counts: Record<string, number> };

/**
 * The counts for the page's `managedSystem` (all systems without it). Reads through the shared FeedbackOps QueryClient under
 * `[...NAV_COUNTS_QUERY_KEY, managedSystem]`, so FeedbackOps actions that call `invalidateNavCounts` refresh the badges.
 * `null` while loading, in mock, with a session that is not ready and after an error.
 */
function useNavCounts(managedSystem: string | null): Record<string, number> | null {
  const session = useFoSession();
  const epoch = session.status === 'ready' ? session.epoch : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const scope = managedSystem ?? '';

  useEffect(() => {
    if (epoch === null) return;
    const controller = new AbortController();
    const queryKey = [...NAV_COUNTS_QUERY_KEY, managedSystem];
    const load = () => {
      foQueryClient.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => fetchNavCounts({ ...(managedSystem !== null ? { managedSystemId: managedSystem } : {}), signal }),
        staleTime: 0,
        retry: false,
      }).then(
        response => { if (!controller.signal.aborted) setLoaded({ scope, epoch, counts: toSlotCounts(response.counts) }); },
        () => { if (!controller.signal.aborted) setLoaded(null); },
      );
    };
    load();
    // An invalidation with no mounted observer only marks the query stale, so the refetch is ours to start.
    const unsubscribe = foQueryClient.getQueryCache().subscribe(event => {
      if (event.type === 'updated' && event.action.type === 'invalidate' && event.query.queryKey[0] === NAV_COUNTS_QUERY_KEY[0] && event.query.queryKey[1] === managedSystem) load();
    });
    return () => { controller.abort(); unsubscribe(); };
  }, [epoch, managedSystem, scope]);

  return epoch !== null && loaded !== null && loaded.epoch === epoch && loaded.scope === scope ? loaded.counts : null;
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
