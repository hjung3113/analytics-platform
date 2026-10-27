import { MilestonesRoute } from '@/features/tasks/routes/MilestonesRoute';
import { TaskBoardRoute } from '@/features/tasks/routes/TaskBoardRoute';
import { TaskListRoute } from '@/features/tasks/routes/TaskListRoute';
import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import {
  type TasksSearch,
  tasksSearchSchema,
  validateTasksSearch,
} from '@/features/tasks/routes/task-search';
import { createFileRoute } from '@tanstack/react-router';

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
      <TaskRequestsRoute
        bindUrl
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
