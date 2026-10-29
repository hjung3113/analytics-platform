import {
  FILTER_KEYS,
  type TaskListFilters,
  TaskListScreen,
} from '@/features/tasks/routes/TaskListScreen';
// Test-local host adapter over retained Screen exports.
import { type HostNavigate, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { TaskDetailPanel } from '@/test/host-adapters/features/tasks/components/TaskDetailPanel';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';

export type { TaskListFilters };

const LIST_KEYS: readonly string[] = [...FILTER_KEYS, 'param', 'managedSystem'];

/**
 * The standalone host's navigate for the list: TanStack `useNavigate()` with a functional `search`, so the URL
 * keeps its unknown keys (`view`, `returnTo`) and the boolean `overdue` the router decodes.
 * The default host's navigate would write strings only (`overdue=%22true%22`).
 */
function useListNavigate(): HostNavigate {
  const navigate = useNavigate();
  return React.useCallback(
    (href, options) => {
      const location = new URL(href, 'http://platform.local');
      const replace = options?.replace === true;
      if (location.pathname !== '/tasks') {
        void navigate({
          to: location.pathname as never,
          search: Object.fromEntries(location.searchParams) as never,
          replace,
        });
        return;
      }
      void navigate({
        to: '/tasks',
        replace,
        search: ((previous: Record<string, unknown>) => {
          const next = { ...previous };
          for (const key of LIST_KEYS) delete next[key];
          for (const [key, value] of location.searchParams) {
            // Only `overdue` is decoded to a boolean by the router; every other key is the string it is.
            next[key] =
              key === 'overdue' && value === 'true' && previous[key] === true ? true : value;
          }
          return next;
        }) as never,
      });
    },
    [navigate],
  );
}

export function TaskListRoute({
  view = 'backlog',
  selectedParam,
  managedSystem,
  filters = {},
}: {
  view?: 'my' | 'backlog';
  selectedParam?: string | undefined;
  managedSystem?: string;
  filters?: TaskListFilters;
}) {
  const base = useHostSeam();
  const { q, status, status_group, overdue, public_update, reporter_update } = filters;
  const area = filters['filter.analytics_area'];
  const search = React.useMemo<HostSearch>(() => {
    const values: Record<string, unknown> = {
      q,
      'filter.analytics_area': area,
      status,
      status_group,
      overdue,
      public_update,
      reporter_update,
      param: selectedParam,
      managedSystem,
    };
    return Object.fromEntries(
      Object.entries(values).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, String(value)]],
      ),
    );
  }, [
    q,
    area,
    status,
    status_group,
    overdue,
    public_update,
    reporter_update,
    selectedParam,
    managedSystem,
  ]);
  const seam = React.useMemo(
    () => ({ ...base, useSearch: () => search, useNavigate: useListNavigate }),
    [base, search],
  );
  return (
    <HostSeamProvider value={seam}>
      <TaskListScreen
        view={view}
        autoSelect
        renderDetail={(
          taskId,
          { view: detailView, actorNamesById, managedSystemNamesById, onClose },
        ) => (
          <TaskDetailPanel
            taskId={taskId}
            actorNamesById={actorNamesById}
            managedSystemNamesById={managedSystemNamesById}
            view={detailView}
            onClose={onClose}
          />
        )}
      />
    </HostSeamProvider>
  );
}
