import { usePlatform } from '@ap/kernel';
import { FeatureScreenPage, ListScope, type OperatorRoute } from '@ap/feature-bridge';
import { TaskListScreen } from '@ap/feature-screens/operator-screens/task-list';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';
import { TaskDetailDrawer } from './TaskDrawers';

/** screen's `ListShell` would hand a returned node to the shell slot, which renders it outside the feature providers; the page draws the detail itself, inside `FeatureBridge`. */
const noDetail = () => undefined;

/** Task 목록 and 내 Task: the same feature list screen, told apart by `view`; 내 Task is a global screen with no sidebar scope, so it draws its own `목록 범위` (the existing picker over the same `managedSystem` page key, #1099c); `focus` opens the Task detail in the shell detail slot (URL-only selection, no auto-select; the feature screens' Tasks search schema takes any string for it, and a UUID or `all` for `managedSystem`). */
export function TaskListPage({ view, route, useSearch, useHere }: {
  view: 'backlog' | 'my'; route: OperatorRoute; useSearch: () => Readonly<Record<string, string>>; useHere: () => string;
}) {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  return <FeatureScreenPage route={route} isValid={isTasksSearchValueValid} useSearch={useSearch} useHere={useHere}
    detail={focus !== null && <TaskDetailDrawer key={focus} taskId={focus} view={view} onClose={() => setPage({ focus: null })} />}>
    {view === 'my' && <div className="max-w-sm shrink-0 border-b border-border-subtle px-3 py-2"><ListScope /></div>}
    <TaskListScreen view={view} autoSelect={false} renderDetail={noDetail} />
  </FeatureScreenPage>;
}
