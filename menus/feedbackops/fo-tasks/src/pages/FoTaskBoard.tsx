import { PlatformPage } from '@ap/components';
import { FoBridge, RejectedPage, operatorHostLinks, taskBoardRoute, useTaskBoardHere, useTaskBoardSearch } from '@ap/fo-bridge';
import { TaskBoardScreen } from '@fops/frontend/operator-screens/task-board';
import { useRejectedValue } from './RejectedPage';
import { BoardTaskDrawer, type BoardDetailOptions } from './TaskDrawers';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** The board owns the move and the close, so it renders what this returns in place, inside `FoBridge`; the drawer portals into the shell detail slot. */
const renderDetail = (taskId: string, options: BoardDetailOptions) => <BoardTaskDrawer key={taskId} taskId={taskId} {...options} />;

/** Tasks (ADR-0081, #763): FeedbackOps' Task board through the bridge; `focus` opens the Task detail in the shell detail slot, closing it goes through the screen. */
export default function FoTaskBoard() {
  const rejected = useRejectedValue(taskBoardRoute);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useTaskBoardSearch} useHere={useTaskBoardHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><TaskBoardScreen renderDetail={renderDetail} /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
