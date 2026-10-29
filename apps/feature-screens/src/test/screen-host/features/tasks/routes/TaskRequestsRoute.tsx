// Test-local host adapter over retained Screen exports.
import {
  type HostNavigate,
  type HostSeam,
  HostSeamProvider,
  useHostNavigate,
  useHostSeam,
} from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { useDetailPanelSlot } from '@ap/feature-ui';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';

import { TaskRequestsScreen } from '@/features/tasks/routes/TaskRequestsScreen';
import {
  TaskRequestPanelFrame,
  type TaskRequestPanelParts,
} from '@/features/tasks/routes/task-requests/TaskRequestPanelParts';

export {
  canApproveTaskRequest,
  canConvertTaskRequest,
  canLinkExistingTaskRequest,
  canRejectTaskRequest,
  canRequestEvidenceForTaskRequest,
} from '@/features/tasks/routes/task-requests/predicates';

// The queue, its focus logic and the panel parts live in `TaskRequestsScreen` (router-free, shared with the platform
// bridge); this route feeds it the props-driven URL and frames the parts in the standalone detail slot, as
// `ListShell.detailPanel` did. Accepted standalone differences: no closed registrant while nothing is selected (the
// slot is closed either way), and a notice <-> panel switch changes the registrant (an expanded panel collapses there).
export interface TaskRequestsRouteProps {
  reviewer?: string;
  reviewerTeam?: string;
  onReviewerChange?: (reviewer: string | undefined, team: string | undefined) => void;
  selectedParam?: string | undefined;
  managedSystem?: string;
  onSelectionChange?: (id: string | null, replace: boolean) => void;
  /** Write the URL through TanStack's `useNavigate` (only `/tasks`, which has a router); otherwise the callbacks or local state. */
  bindUrl?: boolean;
}

const OWNED_KEYS = ['param', 'reviewer', 'reviewerTeam', 'managedSystem'] as const;

/** Registers the one standalone slot entry while a panel shows; renders nothing in place. */
function StandaloneTaskRequestPanel({ parts }: { parts: TaskRequestPanelParts }): null {
  useDetailPanelSlot(<TaskRequestPanelFrame parts={parts} />);
  return null;
}

function renderStandalone(parts: TaskRequestPanelParts): React.ReactNode {
  return <StandaloneTaskRequestPanel parts={parts} />;
}

/**
 * Writes a `view=requests` href as a functional `search` so the URL keeps its unknown keys (`public_update`,
 * `returnTo`) and drops only the keys the screen owns; any other href is the literal record.
 */
function useRouterNavigate(): HostNavigate {
  const navigate = useNavigate();
  return React.useCallback(
    (href, options) => {
      const location = new URL(href, 'http://platform.local');
      const replace = options?.replace === true ? { replace: true } : {};
      if (location.pathname !== '/tasks' || location.searchParams.get('view') !== 'requests') {
        void navigate({
          to: location.pathname,
          search: Object.fromEntries(location.searchParams),
          ...replace,
        } as never);
        return;
      }
      void navigate({
        to: '/tasks',
        ...replace,
        search: ((previous: Record<string, unknown>) => {
          const next = { ...previous };
          for (const key of OWNED_KEYS) delete next[key];
          for (const [key, value] of location.searchParams) {
            // Keep a parsed previous value only when it is the same value (763b/763l F1: never for an absent key).
            next[key] =
              previous[key] !== undefined && String(previous[key]) === value
                ? previous[key]
                : value;
          }
          return next;
        }) as never,
      });
    },
    [navigate],
  );
}

function TaskRequestsRouteSeam({
  selectedParam,
  managedSystem,
  reviewer,
  reviewerTeam,
  onReviewerChange,
  onSelectionChange,
  routerNavigate,
}: Omit<TaskRequestsRouteProps, 'bindUrl'> & { routerNavigate: HostNavigate | null }) {
  const host = useHostSeam();
  const baseNavigate = useHostNavigate();
  const [localFilter, setLocalFilter] = React.useState<{ reviewer?: string; team?: string }>({});
  const reviewerFromProps = onReviewerChange !== undefined || routerNavigate !== null;
  const activeReviewer = reviewerFromProps ? reviewer : localFilter.reviewer;
  const activeTeam = reviewerFromProps ? reviewerTeam : localFilter.team;
  const search = React.useMemo<HostSearch>(
    () => ({
      view: 'requests',
      ...(managedSystem !== undefined ? { managedSystem } : {}),
      ...(selectedParam !== undefined ? { param: selectedParam } : {}),
      ...(activeReviewer !== undefined ? { reviewer: activeReviewer } : {}),
      ...(activeTeam !== undefined ? { reviewerTeam: activeTeam } : {}),
    }),
    [managedSystem, selectedParam, activeReviewer, activeTeam],
  );
  const latest = React.useRef({
    search,
    onReviewerChange,
    onSelectionChange,
    routerNavigate,
    baseNavigate,
  });
  React.useEffect(() => {
    latest.current = { search, onReviewerChange, onSelectionChange, routerNavigate, baseNavigate };
  });
  const navigate = React.useCallback<HostNavigate>((href, options) => {
    const {
      search: current,
      onReviewerChange,
      onSelectionChange,
      routerNavigate,
      baseNavigate,
    } = latest.current;
    if (routerNavigate !== null) {
      routerNavigate(href, options);
      return;
    }
    const location = new URL(href, 'http://platform.local');
    if (location.pathname !== '/tasks' || location.searchParams.get('view') !== 'requests') {
      baseNavigate(href, options);
      return;
    }
    const next = location.searchParams;
    const nextReviewer = next.get('reviewer') ?? undefined;
    const nextTeam = next.get('reviewerTeam') ?? undefined;
    if (nextReviewer !== current.reviewer || nextTeam !== current.reviewerTeam) {
      if (onReviewerChange) onReviewerChange(nextReviewer, nextTeam);
      else
        setLocalFilter({
          ...(nextReviewer ? { reviewer: nextReviewer } : {}),
          ...(nextTeam ? { team: nextTeam } : {}),
        });
      return;
    }
    const nextParam = next.get('param') ?? undefined;
    if (nextParam !== current.param)
      onSelectionChange?.(nextParam ?? null, options?.replace === true);
  }, []);
  const seam = React.useMemo<HostSeam>(
    () => ({ ...host, useSearch: () => search, useNavigate: () => navigate }),
    [host, search, navigate],
  );
  return (
    <HostSeamProvider value={seam}>
      <TaskRequestsScreen autoSelect renderDetail={renderStandalone} />
    </HostSeamProvider>
  );
}

function BoundTaskRequestsRoute(props: Omit<TaskRequestsRouteProps, 'bindUrl'>) {
  const routerNavigate = useRouterNavigate();
  return <TaskRequestsRouteSeam {...props} routerNavigate={routerNavigate} />;
}

export function TaskRequestsRoute({ bindUrl = false, ...props }: TaskRequestsRouteProps) {
  return bindUrl ? (
    <BoundTaskRequestsRoute {...props} />
  ) : (
    <TaskRequestsRouteSeam {...props} routerNavigate={null} />
  );
}
