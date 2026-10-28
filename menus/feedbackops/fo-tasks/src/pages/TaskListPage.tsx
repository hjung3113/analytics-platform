import { usePlatform } from '@ap/kernel';
import { FoScreenPage, type OperatorRoute } from '@ap/feature-bridge';
import { TaskListScreen } from '@ap/feature-screens/operator-screens/task-list';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';
import { TaskDetailDrawer } from './TaskDrawers';

/** FO's `ListShell` would hand a returned node to the shell slot, which renders it outside the FeedbackOps providers; the page draws the detail itself, inside `FoBridge`. */
const noDetail = () => undefined;

/** Task 목록 and 내 Task: the same FeedbackOps list screen, told apart by `view`; `focus` opens the Task detail in the shell detail slot (URL-only selection, no auto-select; FeedbackOps' Tasks search schema takes any string for it, and a UUID or `all` for `managedSystem`). */
export function TaskListPage({ view, route, useSearch, useHere }: {
  view: 'backlog' | 'my'; route: OperatorRoute; useSearch: () => Readonly<Record<string, string>>; useHere: () => string;
}) {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  return <FoScreenPage route={route} isValid={isTasksSearchValueValid} useSearch={useSearch} useHere={useHere}
    detail={focus !== null && <TaskDetailDrawer key={focus} taskId={focus} view={view} onClose={() => setPage({ focus: null })} />}>
    <TaskListScreen view={view} autoSelect={false} renderDetail={noDetail} />
  </FoScreenPage>;
}
