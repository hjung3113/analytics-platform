import { type HostNavigate, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { useDetailPanelSlot } from '@fops/ui';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { MilestoneCreateFrame } from '../components/milestone-detail/MilestoneCreatePanel';
import { MilestoneDetailFrame } from '../components/milestone-detail/MilestoneDetailPanel';
import { type MilestonePanelParts, MilestonesScreen } from './MilestonesScreen';

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
    const location = new URL(to, 'http://feedbackops.local');
    void navigate({
      to: location.pathname,
      search: Object.fromEntries(location.searchParams),
      ...(options?.replace === true ? { replace: true } : {}),
    } as never);
  };
}

/** Registers the standalone frame for the parts in the detail slot; renders nothing in place. */
function StandaloneDetail({ parts }: { parts: MilestonePanelParts }): null {
  useDetailPanelSlot(
    parts.kind === 'create' ? (
      <MilestoneCreateFrame parts={parts} />
    ) : (
      <MilestoneDetailFrame parts={parts} />
    ),
  );
  return null;
}

function renderStandaloneDetail(parts: MilestonePanelParts): React.ReactNode {
  return <StandaloneDetail parts={parts} />;
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
  return (
    <HostSeamProvider value={seam}>
      <MilestonesScreen renderDetail={renderStandaloneDetail} />
    </HostSeamProvider>
  );
}
