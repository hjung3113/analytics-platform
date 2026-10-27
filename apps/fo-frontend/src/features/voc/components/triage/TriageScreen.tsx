import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
// TriageScreen — the triage workbench (queue, tabs with counts, selection, advance, inline panel, undo) over the host seam.
//
// Reads URL state (tab, managedSystem, selected) from the route search.
// Owns data fetching via useVocList({ view: 'triage', tab }).
//
// Architecture (from PLAN-21 §Architecture sketch):
//   No new route file-route. /vocs?view=triage mounts TriageRoute from vocs.tsx
//   if (search.view === 'triage'); TriageRoute renders this screen. The platform bridge
//   mounts it under its own HostSeamProvider (ADR-0071): search, navigation, links and
//   notices go through the seam, never TanStack Router or sonner.
//
// Decision D-1.2: Triage view does NOT read sort= from URL (server-pinned per #15).
// Decision D-1.3: useVocList reused (not forked) — backend differentiates shape.
//
// The point check gates a selected Managed System. At the default scope,
// capability scope can admit scoped actors; the queue enforces read ∩ triage.

import { MyVocsRecoveryLink } from '@/components/MyVocsRecoveryLink';
import { useMeBridge } from '@/lib/api/me';
import { type NavCounts, fetchNavCounts } from '@/lib/api/nav';
import { fetchCapabilityScopeViaClient } from '@/lib/api/permission-reads';
import { isPermissionDenied } from '@/lib/api/types';
import { createLabel } from '@/lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { usePermissionCheckBridge } from '@/lib/cross-system/usePermissionCheckBridge';
import { HostLink, useHostSeam } from '@/lib/host/host-seam';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import { NAV_COUNTS_QUERY_KEY } from '@/lib/query/navCounts';
import { Button, PermissionBlockedPanel } from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type * as React from 'react';
import { useCallback, useState } from 'react';
import { useVocList } from '../../hooks/useVocList';
import { validateVocSearch } from '../../routes/voc-search';
import { type TriageTab, VocTriageScreen } from './VocTriageScreen';

// ── URL state shape ───────────────────────────────────────────────────────────

const TRIAGE_TAB_COUNT_KEYS = {
  unassigned: 'voc.tab.unassigned',
  untriaged: 'voc.tab.untriaged',
  high: 'voc.tab.high',
  waiting: 'voc.tab.waiting',
} as const satisfies Record<TriageTab, keyof NavCounts>;

function triageTabCounts(
  navCounts: NavCounts | undefined,
): Partial<Record<TriageTab, number>> | undefined {
  if (navCounts === undefined) return undefined;
  const tabCounts: Partial<Record<TriageTab, number>> = {};
  for (const tab of Object.keys(TRIAGE_TAB_COUNT_KEYS) as TriageTab[]) {
    const value = navCounts[TRIAGE_TAB_COUNT_KEYS[tab]];
    if (value !== undefined) tabCounts[tab] = value;
  }
  return tabCounts;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TriageScreen(): React.ReactElement {
  const { search, write } = useHostSearchWriter('/vocs', validateVocSearch);
  const { canLink } = useHostSeam();
  const [processedCount, setProcessedCount] = useState(0);
  const handleProcessed = useCallback((delta: 1 | -1): void => {
    setProcessedCount((count) => count + delta);
  }, []);
  const { isLoading: meLoading } = useMeBridge();

  // Active tab defaults to 'unassigned' when not set in URL
  const activeTab: TriageTab = (search.tab as TriageTab | undefined) ?? 'unassigned';
  const area = search['filter.analytics_area'];

  // A selected Managed System keeps its point-check gate.
  const capCheck = usePermissionCheckBridge({
    capability: 'voc.triage',
    ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
  });
  const needsScope =
    search.managedSystem === undefined &&
    !capCheck.isPending &&
    capCheck.data?.state !== 'approved';
  const capabilityScope = useQuery({
    queryKey: ['permission-scope', 'voc.triage'],
    queryFn: ({ signal }) => fetchCapabilityScopeViaClient('voc.triage', { signal }),
    enabled: needsScope,
    retry: false,
  });
  const scope = capabilityScope.data?.scope;
  const isApproved =
    capCheck.data?.state === 'approved' ||
    (needsScope &&
      !capabilityScope.isError &&
      (scope?.kind === 'all' || (scope?.kind === 'scoped' && scope.managed_system_ids.length > 0)));
  const navCountsQuery = useQuery({
    queryKey: [...NAV_COUNTS_QUERY_KEY, search.managedSystem] as const,
    queryFn: ({ signal }) =>
      fetchNavCounts({
        signal,
        ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
      }),
    enabled: isApproved,
    retry: false,
  });

  // Fetch triage queue — server-pinned sort, no sort param sent (D-1.2).
  // REV-2 #9: gate BEFORE fetch via enabled:false so a blocked actor doesn't
  // trigger a queue query (and doesn't see a flash of queue chrome).
  // #383: a deep link from the VOC detail panel ("트리아지에서 변경") carries its
  // target as `selected`. Already-triaged VOCs are excluded by the queue
  // predicate, so the target must be pinned explicitly or the queue cannot show
  // it. Out-of-scope / unknown ids are dropped server-side.
  const { data, isLoading, isSuccess, isFetching, isPlaceholderData, isError, error, refetch } =
    useVocList({
      view: 'triage',
      ...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {}),
      tab: activeTab,
      ...(area !== undefined ? { filters: { 'filter.analytics_area': [area] } } : {}),
      ...(search.selected !== undefined ? { pinVocId: search.selected } : {}),
      enabled: isApproved,
    });

  const queueDenied = isPermissionDenied(error);
  const items = data?.items ?? [];
  // #935: a failed queue read shows the load-error state only when there are
  // no rows to show — a failed background refetch over cached rows keeps
  // showing them (same rule as VocList).
  const queueError = isError && items.length === 0;
  const outOfScopeSummary = data?.out_of_scope_summary;
  // The nav-count endpoint ignores Analytics Area, so its numbers would not match a
  // filtered queue: omit them (unknown-total presentation) until the filter is cleared.
  const areaFiltered = area !== undefined;
  const navCounts = areaFiltered ? undefined : navCountsQuery.data?.counts;
  const queueTotal = navCounts?.['voc.triage'];
  const tabCounts = triageTabCounts(navCounts);
  const queueTotalUnavailableState =
    navCountsQuery.isPending && !areaFiltered ? 'loading' : 'unavailable';

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Every write folds on the latest pending search (several before the host acknowledges the first) and
  // changes only its own keys; the rest (managedSystem, returnTo, platformReturn, …) rides along.
  function triageWrite(
    changes: Readonly<Record<string, string | undefined>>,
    options?: { replace?: boolean },
  ): void {
    write((previous) => ({ ...previous, view: 'triage', ...changes }), options);
  }

  function handleAreaChange(next: string | undefined): void {
    // Selection and the #383 pin stay: only the queue's Area scope changes.
    triageWrite({ 'filter.analytics_area': next });
  }

  function handleTabChange(tab: TriageTab): void {
    // #922: changing tabs drops the #383 deep-link pin (selected) — a pinned
    // VOC must not union into every tab's list. Deep-link entry keeps pinning.
    triageWrite({ tab, selected: undefined });
  }

  function handleSelectVoc(id: string): void {
    triageWrite({ selected: id });
  }

  function handleAdvanceVoc(id: string | null): void {
    triageWrite({ selected: id ?? undefined }, { replace: true });
  }

  // #935: retry a failed queue read in place.
  function handleRetryQueue(): void {
    void refetch();
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (meLoading || capCheck.isPending || (needsScope && capabilityScope.isPending)) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-text-muted">불러오는 중…</span>
      </div>
    );
  }

  // An authoritative queue denial wins over cached/retained rows and selection.
  if (!isApproved || queueDenied) {
    const state = queueDenied ? 'request_access' : mapToPanelState(capCheck.data?.state);
    const requestable = queueDenied ? error.envelope.requestable_permission : undefined;
    const capability = queueDenied ? requestable?.permission : 'voc.triage';
    const managedSystemId = queueDenied ? requestable?.managed_system_id : search.managedSystem;
    const missingRead = queueDenied && requestable?.permission === 'voc.read';
    // #1170: `voc.read` is requestable only per Managed System. A queue denial
    // without one means the actor holds triage across several Systems — the
    // request dialog would submit a workspace-wide request the API rejects, so
    // the panel stays non-requestable until a System is selected.
    const readNeedsSystemSelection = missingRead && typeof managedSystemId !== 'string';
    const panelState = readNeedsSystemSelection ? 'blocked_not_requestable' : state;
    const reason = readNeedsSystemSelection
      ? PERMISSION_BLOCKED_REASONS.vocTriageMissingReadSelectSystem
      : missingRead
        ? typeof requestable?.managed_system_id === 'string'
          ? PERMISSION_BLOCKED_REASONS.vocTriageMissingReadManagedSystem
          : PERMISSION_BLOCKED_REASONS.vocTriageMissingRead
        : search.managedSystem !== undefined
          ? PERMISSION_BLOCKED_REASONS.vocTriageManagedSystem
          : PERMISSION_BLOCKED_REASONS.vocTriage;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <div className="flex items-center gap-2">
          {canLink('/vocs?action=create') && (
            <Button asChild variant="secondary" size="sm" spacing="compact">
              <HostLink to="/vocs?action=create">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {createLabel('VOC')}
              </HostLink>
            </Button>
          )}
          {panelState === 'blocked_not_requestable' && <MyVocsRecoveryLink />}
        </div>
        {panelState === 'request_access' && capability !== undefined ? (
          <RequestAccessButton
            capability={capability}
            returnRouteIntent="/vocs?view=triage"
            {...(typeof managedSystemId === 'string' ? { managedSystemId } : {})}
            renderTrigger={(onRequestAccess) => (
              <PermissionBlockedPanel
                state={panelState}
                category="Triage"
                reason={reason}
                onRequestAccess={onRequestAccess}
              />
            )}
          />
        ) : (
          <PermissionBlockedPanel state={panelState} category="Triage" reason={reason} />
        )}
      </div>
    );
  }

  // #922: a pending tab refetch must not swap the whole screen for a loading
  // state — that unmounts the tablist and drops focus. The pending state is
  // handed to the screen and rendered inside the queue column instead; the
  // route-level loading state above stays only for useMe + capability load.
  return (
    <VocTriageScreen
      items={items}
      selectedId={search.selected ?? null}
      activeTab={activeTab}
      queuePending={isLoading}
      {...(queueError ? { queueError } : {})}
      onRetryQueue={handleRetryQueue}
      queueContext={JSON.stringify([activeTab, search.managedSystem ?? null, area ?? null])}
      {...(search.managedSystem !== undefined ? { managedSystemId: search.managedSystem } : {})}
      {...(area !== undefined ? { areaFilter: area } : {})}
      onAreaChange={handleAreaChange}
      queueSettled={isSuccess && !isFetching && !isPlaceholderData}
      {...(queueTotal !== undefined ? { queueTotal } : {})}
      {...(queueTotal === undefined ? { queueTotalUnavailableState } : {})}
      {...(tabCounts !== undefined ? { tabCounts } : {})}
      {...(outOfScopeSummary !== undefined ? { outOfScopeSummary } : {})}
      processedCount={processedCount}
      onProcessed={handleProcessed}
      onAdvanceVoc={handleAdvanceVoc}
      onSelectVoc={handleSelectVoc}
      onTabChange={handleTabChange}
    />
  );
}

TriageScreen.displayName = 'TriageScreen';

// Maps the FE permission-check state enum (FrontendPermissionState) to the
// narrower PermissionBlockedPanel state enum (PermissionState in @fops/ui).
// Both spellings of "not requestable" exist historically — the API uses
// 'blocked_non_requestable' while the UI primitive uses
// 'blocked_not_requestable'. This mapping isolates that drift to one place.
function mapToPanelState(
  state: string | undefined,
): 'request_access' | 'summary_visible' | 'denied' | 'blocked_not_requestable' {
  switch (state) {
    case 'request_access':
      return 'request_access';
    case 'summary_visible':
      return 'summary_visible';
    case 'expired':
    case 'revoked':
      return 'request_access';
    case 'rejected':
      return 'denied';
    // 'approved' should never reach this mapper (handled above) — fall through.
    default:
      return 'blocked_not_requestable';
  }
}
