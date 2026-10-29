import {
  type MilestonePanelParts,
  MilestonesScreen,
} from '@/features/tasks/routes/MilestonesScreen';
// Test-local host adapter over retained Screen exports.
import { type HostNavigate, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { MilestoneCreateFrame } from '@/test/host-adapters/features/tasks/components/milestone-detail/MilestoneCreatePanel';
import { MilestoneDetailFrame } from '@/test/host-adapters/features/tasks/components/milestone-detail/MilestoneDetailPanel';
import { useDetailPanelSlot } from '@ap/feature-ui';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';

// #514 — /tasks?view=milestones. The list, its dirty guards and the detail
// parts live in `MilestonesScreen` (router-free, shared with the platform
// bridge); this route feeds it the props-driven URL and frames the parts in the
// standalone detail slot, as `ListShell.detailPanel` did.
export interface MilestonesRouteProps {
  selectedParam?: string | undefined;
  managedSystem?: string;
}

/** Writes through TanStack's `useNavigate` with the literal `{ to, search }` record the route always wrote. */
function useRouteNavigate(): HostNavigate {
  const navigate = useNavigate();
  return (to, options) => {
    const location = new URL(to, 'http://platform.local');
    void navigate({
      to: location.pathname,
      search: Object.fromEntries(location.searchParams),
      ...(options?.replace === true ? { replace: true } : {}),
    } as never);
  };
}

/**
 * The parts the screen's current slot component produced. The create and detail slot components are different
 * component types, so a registrant under either would remount on create <-> detail and change the slot key, which
 * collapses an expanded panel. The one registrant lives in the route instead and reads the parts from here.
 */
function createPartsStore() {
  let current: { owner: symbol; parts: MilestonePanelParts } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => current,
    publish(owner: symbol, parts: MilestonePanelParts) {
      current = { owner, parts };
      emit();
    },
    release(owner: symbol) {
      if (current?.owner !== owner) return;
      current = null;
      emit();
    },
  };
}
type PartsStore = ReturnType<typeof createPartsStore>;

/** Hands the parts to the route's registrant; renders nothing in place. */
function PublishParts({ store, parts }: { store: PartsStore; parts: MilestonePanelParts }): null {
  const owner = React.useRef(Symbol('milestone-parts')).current;
  React.useLayoutEffect(() => {
    store.publish(owner, parts);
  });
  React.useLayoutEffect(() => () => store.release(owner), [store, owner]);
  return null;
}

/** The single standalone registration for the route's lifetime; no parts clears it. */
function StandaloneSlot({ store }: { store: PartsStore }): null {
  const published = React.useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const parts = published?.parts;
  useDetailPanelSlot(
    parts === undefined ? undefined : parts.kind === 'create' ? (
      <MilestoneCreateFrame parts={parts} />
    ) : (
      <MilestoneDetailFrame parts={parts} />
    ),
  );
  return null;
}

export function MilestonesRoute({ selectedParam, managedSystem }: MilestonesRouteProps) {
  const host = useHostSeam();
  const search = React.useMemo<HostSearch>(
    () => ({
      view: 'milestones',
      ...(selectedParam !== undefined ? { param: selectedParam } : {}),
      ...(managedSystem !== undefined ? { managedSystem } : {}),
    }),
    [selectedParam, managedSystem],
  );
  const seam = React.useMemo(
    () => ({ ...host, useSearch: () => search, useNavigate: useRouteNavigate }),
    [host, search],
  );
  const [store] = React.useState(createPartsStore);
  const renderDetail = React.useCallback(
    (parts: MilestonePanelParts) => <PublishParts store={store} parts={parts} />,
    [store],
  );
  return (
    <HostSeamProvider value={seam}>
      <MilestonesScreen renderDetail={renderDetail} />
      <StandaloneSlot store={store} />
    </HostSeamProvider>
  );
}
