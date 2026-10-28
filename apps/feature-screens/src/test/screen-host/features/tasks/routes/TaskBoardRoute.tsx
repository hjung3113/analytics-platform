import {
  TaskBoardScreen,
  type TaskBoardScreenProps,
} from '@/features/tasks/routes/TaskBoardScreen';
// Test-local host adapter over retained Screen exports.
import {
  type HostNavigate,
  HostSeamProvider,
  useHostSeam,
  useHostSearch,
} from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { TaskDetailPanel } from '@/test/host-adapters/features/tasks/components/TaskDetailPanel';
import { useDetailPanelSlot } from '@ap/feature-ui';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';

type BoardKey = 'q' | 'managedSystem' | 'param' | 'public_update';
const BOARD_KEYS: readonly BoardKey[] = ['q', 'managedSystem', 'param', 'public_update'];

/**
 * The standalone host's navigate for the board: TanStack `useNavigate()` with the call shapes the route always
 * wrote. A select is the literal `{ to, search }` push; every other write is a functional `search` that edits only
 * the board keys the href changed against the route's search, so the URL keeps its other keys (`returnTo`,
 * a managedSystem the route was not mounted with).
 */
function useBoardNavigate(): HostNavigate {
  const navigate = useNavigate();
  const route = useHostSearch();
  return React.useCallback(
    (href, options) => {
      const location = new URL(href, 'http://feedbackops.local');
      const record: Record<string, string> = Object.fromEntries(location.searchParams);
      const replace = options?.replace === true;
      if (location.pathname !== '/tasks') {
        void navigate({
          to: location.pathname,
          search: record,
          ...(replace ? { replace: true } : {}),
        } as never);
        return;
      }
      const changed = BOARD_KEYS.filter((key) => record[key] !== route[key]);
      if (
        !replace &&
        changed.length === 1 &&
        changed[0] === 'param' &&
        record.param !== undefined
      ) {
        void navigate({ to: '/tasks', search: record } as never);
        return;
      }
      void navigate({
        to: '/tasks',
        ...(replace ? { replace: true } : {}),
        search: ((previous: Record<string, unknown>) => {
          const next = { ...previous };
          for (const key of BOARD_KEYS) {
            const value = record[key];
            if (value === undefined) {
              // A close or link-missing replace always drops `param`; any other key only when the route had it.
              if (route[key] !== undefined || (key === 'param' && replace)) delete next[key];
            } else if (value !== route[key] && previous[key] !== value) {
              next[key] = value;
            }
          }
          return next;
        }) as never,
      });
    },
    [navigate, route],
  );
}

/** The one standalone registration while a Task is selected: the same component type across Task switches, so the registrant persists. */
function StandaloneTaskDetail({
  taskId,
  actorNamesById,
  managedSystemNamesById,
  hasActionFooter,
  onMoveToNextStatus,
  onClose,
}: { taskId: string } & Parameters<TaskBoardScreenProps['renderDetail']>[1]): null {
  useDetailPanelSlot(
    <TaskDetailPanel
      taskId={taskId}
      actorNamesById={actorNamesById}
      managedSystemNamesById={managedSystemNamesById}
      view="board"
      hasActionFooter={hasActionFooter}
      onMoveToNextStatus={onMoveToNextStatus}
      onClose={onClose}
    />,
  );
  return null;
}

const renderDetail: TaskBoardScreenProps['renderDetail'] = (taskId, options) => (
  <StandaloneTaskDetail taskId={taskId} {...options} />
);

export function TaskBoardRoute({
  selectedParam,
  managedSystem,
  publicUpdate,
  q,
}: {
  q?: string;
  selectedParam?: string;
  managedSystem?: string;
  publicUpdate?: 'missing';
}) {
  const host = useHostSeam();
  const search = React.useMemo<HostSearch>(
    () => ({
      view: 'board',
      ...(q !== undefined ? { q } : {}),
      ...(managedSystem !== undefined ? { managedSystem } : {}),
      ...(selectedParam !== undefined ? { param: selectedParam } : {}),
      ...(publicUpdate !== undefined ? { public_update: publicUpdate } : {}),
    }),
    [q, managedSystem, selectedParam, publicUpdate],
  );
  const seam = React.useMemo(
    () => ({ ...host, useSearch: () => search, useNavigate: useBoardNavigate }),
    [host, search],
  );
  return (
    <HostSeamProvider value={seam}>
      <TaskBoardScreen renderDetail={renderDetail} />
    </HostSeamProvider>
  );
}
