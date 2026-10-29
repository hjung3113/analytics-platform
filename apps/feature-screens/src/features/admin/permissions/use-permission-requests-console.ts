import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import {
  type AdminPermissionRequestRow,
  fetchPermissionRequestsAllViaClient,
} from '@/lib/api/permission-reads';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';

import { managedSystemsCatalogQuery } from '@/lib/cross-system/useManagedSystemNames';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import { type ReviewTab, validatePermissionRequestsSearch } from './permission-requests-search.js';
import { permissionRequestsReviewKey } from './useDecidePermissionRequest.js';

const REQUESTS_PATH = '/admin/permissions/requests';
// One identity while the list is absent, so the reconcile effect's dependency does not change on every render.
const NO_REQUESTS: AdminPermissionRequestRow[] = [];

/**
 * `autoSelect` (default `true`) keeps the standalone rule: the first visible request is selected on the first
 * reconcile and on a tab change. The platform bridge passes `false`: selection comes from the URL only, a stale one is
 * still dropped.
 */
export function usePermissionRequestsConsole({
  autoSelect = true,
}: { autoSelect?: boolean } = {}): {
  allRequests: AdminPermissionRequestRow[];
  visibleRequests: AdminPermissionRequestRow[];
  activeTab: ReviewTab;
  selected: AdminPermissionRequestRow | null;
  selectedId: string | null;
  actorNames: Record<string, string>;
  managedSystemNames: Record<string, string>;
  isPending: boolean;
  isError: boolean;
  handleTabChange: (next: ReviewTab) => void;
  handleSelect: (id: string) => void;
  handleClose: () => void;
} {
  const { search, write } = useHostSearchWriter(REQUESTS_PATH, validatePermissionRequestsSearch);
  const query = useQuery({
    queryKey: permissionRequestsReviewKey,
    queryFn: ({ signal }) => fetchPermissionRequestsAllViaClient({ status: 'all', signal }),
    retry: false,
  });
  const actors = useWorkspaceActors({ retry: false, staleTime: 0 });
  const actorNames = Object.fromEntries(
    (actors.actors ?? []).map((actor) => [actor.id, actor.display_name]),
  );
  const managedSystemsQuery = useQuery({ ...managedSystemsCatalogQuery(), retry: false });
  const managedSystemNames = Object.fromEntries(
    (managedSystemsQuery.data?.items ?? []).map((managedSystem) => [
      managedSystem.id,
      managedSystem.name,
    ]),
  );
  // Tab + selection are URL state; `pending` is the default tab (omitted).
  const activeTab: ReviewTab = search.tab ?? 'pending';
  const selectedId = search.selected ?? null;
  const hasAppliedInitialSelection = React.useRef(false);
  const allRequests = query.data?.requests ?? NO_REQUESTS;
  const visibleRequests =
    activeTab === 'all'
      ? allRequests
      : allRequests.filter((request) => request.status === activeTab);
  const selected = allRequests.find((request) => request.id === selectedId) ?? null;

  function handleTabChange(next: ReviewTab): void {
    // Existing selection rule: keep the selection if it is visible in the new
    // tab, else select the first visible request (autoSelect), else none — in
    // one write.
    const nextVisible =
      next === 'all' ? allRequests : allRequests.filter((request) => request.status === next);
    const selectionIsVisible =
      selectedId !== null && nextVisible.some((request) => request.id === selectedId);
    const nextSelectedId = selectionIsVisible
      ? selectedId
      : autoSelect
        ? (nextVisible[0]?.id ?? null)
        : null;
    write((prev) => {
      const { tab: _tab, selected: _selected, ...rest } = prev;
      return {
        ...rest,
        ...(next !== 'pending' ? { tab: next } : {}),
        ...(nextSelectedId !== null ? { selected: nextSelectedId } : {}),
      };
    });
  }

  function handleSelect(id: string): void {
    write((prev) => ({ ...prev, selected: id }));
  }

  function handleClose(): void {
    write(({ selected: _selected, ...rest }) => rest);
  }

  React.useEffect(() => {
    // Reconcile only against successfully loaded data: a failed/loading list
    // must never clear a deep-linked selection. Tab-change selection is decided
    // in handleTabChange (atomic push); URL-driven tab changes (Back, deep
    // links) are NOT re-selected here so history restores the exact prior UI.
    if (!query.isSuccess) return;

    if (selectedId !== null && !visibleRequests.some((request) => request.id === selectedId)) {
      // A refetch can move the selected request to another status tab. Keep its
      // detail/draft mounted so the revision-safe stale review can reconcile it.
      if (
        hasAppliedInitialSelection.current &&
        allRequests.some((request) => request.id === selectedId)
      )
        return;
      // Stale/mismatched selection. On the very first reconcile (a deep link
      // whose selection is not in the tab) fall back to the first visible
      // request like the original UI; afterwards drop only a missing record.
      const fallbackId =
        autoSelect && !hasAppliedInitialSelection.current ? (visibleRequests[0]?.id ?? null) : null;
      hasAppliedInitialSelection.current = true;
      write(
        ({ selected: _selected, ...rest }) =>
          fallbackId === null ? rest : { ...rest, selected: fallbackId },
        { replace: true },
      );
      return;
    }

    if (!hasAppliedInitialSelection.current) {
      hasAppliedInitialSelection.current = true;
      const firstVisibleId = visibleRequests[0]?.id;
      if (autoSelect && selectedId === null && firstVisibleId !== undefined) {
        write((prev) => ({ ...prev, selected: firstVisibleId }), { replace: true });
      }
    }
  }, [allRequests, autoSelect, query.isSuccess, selectedId, visibleRequests, write]);

  return {
    allRequests,
    visibleRequests,
    activeTab,
    selected,
    selectedId,
    actorNames,
    managedSystemNames,
    isPending: query.isPending,
    isError: query.isError,
    handleTabChange,
    handleSelect,
    handleClose,
  };
}
