import { MilestonesRoute } from '@/features/tasks/routes/MilestonesRoute';
import { TaskBoardRoute } from '@/features/tasks/routes/TaskBoardRoute';
import { TaskListRoute } from '@/features/tasks/routes/TaskListRoute';
import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import {
  type TasksSearch,
  tasksSearchSchema,
  validateTasksSearch,
} from '@/features/tasks/routes/task-search';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

export { tasksSearchSchema, validateTasksSearch };

export const Route = createFileRoute('/_authed/tasks')({
  validateSearch: validateTasksSearch,
  component: TasksRouteShell,
});

export function TasksRouteView({ search }: { search: TasksSearch }) {
  const managedSystemProps =
    search.managedSystem !== undefined ? { managedSystem: search.managedSystem } : {};
  const selectedParamProps = search.param !== undefined ? { selectedParam: search.param } : {};
  if (search.view === 'requests') {
    return (
      <TaskRequestsUrlRoute
        {...managedSystemProps}
        {...selectedParamProps}
        {...(search.reviewer === undefined ? {} : { reviewer: search.reviewer })}
        {...(search.reviewerTeam === undefined ? {} : { reviewerTeam: search.reviewerTeam })}
      />
    );
  }
  if (search.view === 'board') {
    return (
      <TaskBoardRoute
        {...managedSystemProps}
        {...selectedParamProps}
        {...(search.q === undefined ? {} : { q: search.q })}
        {...(search.public_update === 'missing' ? { publicUpdate: search.public_update } : {})}
      />
    );
  }
  if (search.view === 'milestones') {
    return <MilestonesRoute {...managedSystemProps} {...selectedParamProps} />;
  }
  const view = search.view === 'my' ? 'my' : 'backlog';
  return (
    <TaskListRoute view={view} {...managedSystemProps} {...selectedParamProps} filters={search} />
  );
}

function TasksRouteShell() {
  return <TasksRouteView search={Route.useSearch()} />;
}

function TaskRequestsUrlRoute(props: {
  managedSystem?: string;
  selectedParam?: string;
  reviewer?: string;
  reviewerTeam?: string;
}) {
  const navigate = useNavigate();
  return (
    <TaskRequestsRoute
      {...props}
      onReviewerChange={(reviewer, reviewerTeam) => {
        void navigate({
          to: '/tasks',
          search: (previous) => {
            const { reviewer: _reviewer, reviewerTeam: _team, param: _param, ...rest } = previous;
            return {
              ...rest,
              view: 'requests',
              ...(reviewer ? { reviewer } : {}),
              ...(reviewerTeam ? { reviewerTeam } : {}),
            };
          },
        });
      }}
      onSelectionChange={(id, replace) => {
        void navigate({
          to: '/tasks',
          replace,
          search: (previous) => {
            const { param: _param, ...rest } = previous;
            return { ...rest, view: 'requests', ...(id === null ? {} : { param: id }) };
          },
        });
      }}
    />
  );
}
