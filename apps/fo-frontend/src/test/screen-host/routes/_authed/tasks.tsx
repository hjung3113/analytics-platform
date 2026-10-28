import {
  type TasksSearch,
  tasksSearchSchema,
  validateTasksSearch,
} from '@/features/tasks/routes/task-search';
// Test-local host adapter over retained Screen exports.
import { MilestonesRoute } from '@/test/screen-host/features/tasks/routes/MilestonesRoute';
import { TaskBoardRoute } from '@/test/screen-host/features/tasks/routes/TaskBoardRoute';
import { TaskListRoute } from '@/test/screen-host/features/tasks/routes/TaskListRoute';
import { TaskRequestsRoute } from '@/test/screen-host/features/tasks/routes/TaskRequestsRoute';

export { tasksSearchSchema, validateTasksSearch };

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
