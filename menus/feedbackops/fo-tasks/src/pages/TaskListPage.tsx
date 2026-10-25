import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { FoBridge, RejectedPage, operatorHostLinks, type OperatorRoute } from '@ap/fo-bridge';
import { TaskListScreen } from '@fops/frontend/operator-screens/task-list';
import { useRejectedValue } from './RejectedPage';
import { TaskDetailDrawer } from './TaskDrawers';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** FO's `ListShell` would hand a returned node to the shell slot, which renders it outside the FeedbackOps providers; the page draws the detail itself, inside `FoBridge`. */
const noDetail = () => undefined;

/** Task 목록 and 내 Task: the same FeedbackOps list screen, told apart by `view`; `focus` opens the Task detail in the shell detail slot (URL-only selection, no auto-select). */
export function TaskListPage({ view, route, useSearch, useHere }: {
  view: 'backlog' | 'my'; route: OperatorRoute; useSearch: () => Readonly<Record<string, string>>; useHere: () => string;
}) {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  const rejected = useRejectedValue(route);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useSearch} useHere={useHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><TaskListScreen view={view} autoSelect={false} renderDetail={noDetail} /></div>
      </div>
      {focus !== null && <TaskDetailDrawer key={focus} taskId={focus} view={view} onClose={() => setPage({ focus: null })} />}
    </FoBridge>
  </PlatformPage>;
}
