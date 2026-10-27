import { fetchPermissionDenies, fetchPermissionGrants } from '@/lib/api/permission-admin';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import type { PermissionDenyAdminItem, PermissionGrantAdminItem } from '@fops/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { managedSystemsCatalogQuery } from '@/lib/cross-system/useManagedSystemNames';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import {
  type PermissionGrantTab,
  validatePermissionGrantsSearch,
} from './permission-grants-search.js';
import { permissionDeniesListKey, permissionGrantsListKey } from './useRevokePermission.js';

export type ActivePermission =
  | { kind: 'grants'; item: PermissionGrantAdminItem }
  | { kind: 'denies'; item: PermissionDenyAdminItem };

const GRANTS_PATH = '/admin/permissions/grants';

/**
 * `autoSelect` (default `true`) keeps the standalone rule: the first item of a tab is selected on that tab's first
 * reconcile and on a tab change. The platform bridge passes `false`: selection comes from the URL only, a stale one is
 * still dropped.
 */
export function usePermissionGrantsConsole({ autoSelect = true }: { autoSelect?: boolean } = {}): {
  grants: PermissionGrantAdminItem[];
  denies: PermissionDenyAdminItem[];
  visiblePermissions: ActivePermission[];
  activeTab: PermissionGrantTab;
  selected: ActivePermission | null;
  selectedId: string | null;
  actorNames: Record<string, string>;
  managedSystemNames: Record<string, string>;
  cacheReturnedGrant: (item: PermissionGrantAdminItem) => void;
  discardReturnedGrant: (id: string) => void;
  handleCreatedGrant: (id: string) => void;
  isPending: boolean;
  isError: boolean;
  grantCountKnown: boolean;
  denyCountKnown: boolean;
  handleTabChange: (next: PermissionGrantTab) => void;
  handleSelect: (id: string) => void;
  handleClose: () => void;
} {
  const { search, write } = useHostSearchWriter(GRANTS_PATH, validatePermissionGrantsSearch);
  const queryClient = useQueryClient();
  const returnedGrantCarry = React.useRef(new Map<string, PermissionGrantAdminItem>());
  const grantsQuery = useQuery({
    queryKey: permissionGrantsListKey,
    queryFn: async ({ signal }) => {
      const items = await fetchPermissionGrants(signal);
      const missingReturnedItems = [...returnedGrantCarry.current.values()].filter(
        (item) =>
          !items.some((current) => current.id === item.id) &&
          (item.expires_at === null || Date.parse(item.expires_at) > Date.now()),
      );
      returnedGrantCarry.current.clear();
      return [...missingReturnedItems, ...items];
    },
    retry: false,
  });
  const deniesQuery = useQuery({
    queryKey: permissionDeniesListKey,
    queryFn: ({ signal }) => fetchPermissionDenies(signal),
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

  const activeTab: PermissionGrantTab = search.tab ?? 'grants';
  const selectedId = search.selected ?? null;
  const activeQuery = activeTab === 'grants' ? grantsQuery : deniesQuery;
  const grants = grantsQuery.data ?? [];
  const denies = deniesQuery.data ?? [];
  const visiblePermissions: ActivePermission[] =
    activeTab === 'grants'
      ? grants.map((item) => ({ kind: 'grants', item }))
      : denies.map((item) => ({ kind: 'denies', item }));
  const selected = visiblePermissions.find(({ item }) => item.id === selectedId) ?? null;
  const initializedTabs = React.useRef(new Set<PermissionGrantTab>());

  function cacheReturnedGrant(item: PermissionGrantAdminItem): void {
    returnedGrantCarry.current.set(item.id, item);
    queryClient.setQueryData<PermissionGrantAdminItem[]>(permissionGrantsListKey, (current) => [
      item,
      ...(current ?? []).filter((grant) => grant.id !== item.id),
    ]);
  }

  function discardReturnedGrant(id: string): void {
    returnedGrantCarry.current.delete(id);
    queryClient.setQueryData<PermissionGrantAdminItem[]>(permissionGrantsListKey, (current) =>
      current?.filter((grant) => grant.id !== id),
    );
  }

  function handleTabChange(next: PermissionGrantTab): void {
    const nextVisible = next === 'grants' ? grants : denies;
    const selectionIsVisible =
      selectedId !== null && nextVisible.some((permission) => permission.id === selectedId);
    const nextSelectedId = selectionIsVisible
      ? selectedId
      : autoSelect
        ? (nextVisible[0]?.id ?? null)
        : null;
    write((prev) => {
      const { tab: _tab, selected: _selected, ...rest } = prev;
      return {
        ...rest,
        ...(next === 'denies' ? { tab: 'denies' as const } : {}),
        ...(nextSelectedId !== null ? { selected: nextSelectedId } : {}),
      };
    });
  }

  function handleSelect(id: string): void {
    write((prev) => ({ ...prev, selected: id }));
  }

  function handleCreatedGrant(id: string): void {
    initializedTabs.current.add('grants');
    write((prev) => {
      const { tab: _tab, selected: _selected, ...rest } = prev;
      return { ...rest, selected: id };
    });
  }

  function handleClose(): void {
    write(({ selected: _selected, ...rest }) => rest);
  }

  React.useEffect(() => {
    if (!activeQuery.isSuccess) return;

    const isFirstTabReconcile = !initializedTabs.current.has(activeTab);
    if (selectedId !== null && !visiblePermissions.some(({ item }) => item.id === selectedId)) {
      const fallbackId =
        autoSelect && isFirstTabReconcile ? (visiblePermissions[0]?.item.id ?? null) : null;
      initializedTabs.current.add(activeTab);
      write(
        ({ selected: _selected, ...rest }) =>
          fallbackId === null ? rest : { ...rest, selected: fallbackId },
        { replace: true },
      );
      return;
    }

    if (isFirstTabReconcile) {
      initializedTabs.current.add(activeTab);
      const firstVisibleId = visiblePermissions[0]?.item.id;
      if (autoSelect && selectedId === null && firstVisibleId !== undefined) {
        write((prev) => ({ ...prev, selected: firstVisibleId }), { replace: true });
      }
    }
  }, [activeQuery.isSuccess, activeTab, autoSelect, selectedId, visiblePermissions, write]);

  return {
    grants,
    denies,
    visiblePermissions,
    activeTab,
    selected,
    selectedId,
    actorNames,
    managedSystemNames,
    cacheReturnedGrant,
    discardReturnedGrant,
    handleCreatedGrant,
    isPending: activeQuery.isPending,
    isError: activeQuery.isError,
    grantCountKnown: grantsQuery.isSuccess && !grantsQuery.isError,
    denyCountKnown: deniesQuery.isSuccess && !deniesQuery.isError,
    handleTabChange,
    handleSelect,
    handleClose,
  };
}
