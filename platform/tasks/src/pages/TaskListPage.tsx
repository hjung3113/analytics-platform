import { usePlatform } from '@ap/kernel';
import { FeatureScreenPage, ListScope, isUuid, useMenuCapability, type OperatorRoute } from '@ap/feature-bridge';
import { TaskListScreen } from '@ap/feature-screens/operator-screens/task-list';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';
import { TaskDetailDrawer } from './TaskDrawers';

/** `focus` becomes the feature `param`, a request path segment, so only a UUID passes (06 §6.4, ADR-0071 decision 9); other keys follow the Tasks search schema. */
const isValid = (key: string, value: string) => key === 'param' ? isUuid(value) : isTasksSearchValueValid(key, value);

/** screen's `ListShell` would hand a returned node to the shell slot, which renders it outside the feature providers; the page draws the detail itself, inside `FeatureBridge`. */
const noDetail = () => undefined;

/** Task 목록 and 내 Task share this screen. 내 Task draws its own `목록 범위` from the manifest and the `managedSystem` page key. `focus` opens Task detail in the shell detail slot. */
export function TaskListPage({ view, route, useSearch, useHere }: {
  view: 'backlog' | 'my'; route: OperatorRoute; useSearch: () => Readonly<Record<string, string>>; useHere: () => string;
}) {
  const { pageParam, setPage } = usePlatform();
  const capability = useMenuCapability();
  const focus = pageParam('focus');
  return <FeatureScreenPage route={route} isValid={isValid} useSearch={useSearch} useHere={useHere}
    detail={focus !== null && <TaskDetailDrawer key={focus} taskId={focus} view={view} onClose={() => setPage({ focus: null })} />}>
    {view === 'my' && <div className="max-w-sm shrink-0 border-b border-border-subtle px-3 py-2"><ListScope /></div>}
    <TaskListScreen {...(capability === undefined ? {} : { capability })} view={view} autoSelect={false} renderDetail={noDetail} />
  </FeatureScreenPage>;
}
