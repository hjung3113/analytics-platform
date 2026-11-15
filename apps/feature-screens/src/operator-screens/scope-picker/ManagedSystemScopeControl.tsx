// Bridge-safe container for the `목록 범위` picker: the same reads, query keys and stale times as the standalone
// `AppFrame`, but through `useMeBridge`, `fetchManagedSystems` and `fetchCapabilityScopeViaClient` (all on `client.ts`),
// so the platform sidebar's Scope place shares the feature cache and the `/api/features` base path. Value only through props.

import { Button } from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';

import { useMeBridge } from '../../lib/api/me';
import { fetchCapabilityScopeViaClient } from '../../lib/api/permission-reads';
import { fetchManagedSystems } from '../../lib/api/registry-reads';
import { SCOPE_SELECTOR_COPY } from '../../lib/copy/managed-system-scope';

import { ManagedSystemScopePicker } from './ManagedSystemScopePicker';

export interface ManagedSystemScopeControlProps {
  value?: string;
  onChange: (managedSystemId: string | undefined) => void;
  disabled?: boolean;
  collapsed?: boolean;
}

export function ManagedSystemScopeControl({
  value,
  onChange,
  disabled,
  collapsed,
}: ManagedSystemScopeControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const retryOwnsFocus = useRef(false);
  const [retryRequested, setRetryRequested] = useState(false);
  const me = useMeBridge();
  const actor = me.data?.actor;
  const actorId = typeof actor?.id === 'string' ? actor.id : undefined;
  const roleLevel = actor?.role_level;
  const isAdmin = typeof roleLevel === 'string' && roleLevel.toLowerCase() === 'admin';
  const systemsQuery = useQuery({
    queryKey: ['managed-systems', 'scope-selector'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const grantsQuery = useQuery({
    queryKey: ['managed-system-scope', actorId, 'voc.read'] as const,
    enabled: actorId !== undefined,
    queryFn: ({ signal }) => fetchCapabilityScopeViaClient('voc.read', { signal }),
    staleTime: 60_000,
    retry: false,
  });
  useLayoutEffect(() => {
    if (collapsed || !systemsQuery.isSuccess || !retryOwnsFocus.current) return;
    retryOwnsFocus.current = false;
    if (document.activeElement === document.body) {
      rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [collapsed, systemsQuery.isSuccess]);
  const awaitingInitialScope =
    actorId !== undefined &&
    grantsQuery.data === undefined &&
    grantsQuery.fetchStatus === 'fetching';
  const managedSystems = (systemsQuery.data?.items ?? []).map((system) => ({
    id: system.id,
    name: system.name,
    // Keep the initial permission fetch from briefly marking every system out of scope.
    granted:
      awaitingInitialScope ||
      grantsQuery.data?.scope.kind === 'all' ||
      (grantsQuery.data?.scope.kind === 'scoped' &&
        grantsQuery.data.scope.managed_system_ids.includes(system.id)),
  }));
  if (collapsed) return null;
  if (systemsQuery.isPending && !retryRequested) {
    return <p role="status" className="text-xs text-text-muted">{SCOPE_SELECTOR_COPY.loading}</p>;
  }
  if (systemsQuery.isError || (retryRequested && systemsQuery.isPending)) {
    return (
      <div ref={rootRef} role={systemsQuery.isFetching ? 'status' : 'alert'} className="text-xs text-text-muted">
        <p>{systemsQuery.isFetching ? SCOPE_SELECTOR_COPY.loading : SCOPE_SELECTOR_COPY.loadError}</p>
        <Button
          variant="secondary"
          size="sm"
          aria-disabled={systemsQuery.isFetching}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          onBlur={() => { retryOwnsFocus.current = false; }}
          onClick={(event) => {
            if (systemsQuery.isFetching) return;
            retryOwnsFocus.current = document.activeElement === event.currentTarget;
            setRetryRequested(true);
            void systemsQuery.refetch();
          }}
        >
          {SCOPE_SELECTOR_COPY.retry}
        </Button>
      </div>
    );
  }
  return (
    <div ref={rootRef}>
      <ManagedSystemScopePicker
        managedSystems={managedSystems}
        {...(value !== undefined ? { value } : {})}
        onChange={onChange}
        {...(disabled !== undefined ? { disabled } : {})}
        {...(collapsed !== undefined ? { collapsed } : {})}
        isAdmin={isAdmin}
        workspaceWideScope={
          isAdmin && (grantsQuery.data?.scope.kind === 'all' || awaitingInitialScope)
        }
        label={SCOPE_SELECTOR_COPY.listScopeLabel}
      />
    </div>
  );
}
