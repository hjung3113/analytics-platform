import { FeatureScreenPage, taskBoardRoute, useTaskBoardHere, useTaskBoardSearch } from '@ap/feature-bridge';
import { TaskBoardScreen } from '@ap/feature-screens/operator-screens/task-board';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';
import { BoardTaskDrawer, type BoardDetailOptions } from './TaskDrawers';

/** The board owns the move and the close, so it renders what this returns in place, inside `FeatureBridge`; the drawer portals into the shell detail slot. */
const renderDetail = (taskId: string, options: BoardDetailOptions) => <BoardTaskDrawer key={taskId} taskId={taskId} {...options} />;

/** Tasks (ADR-0081, #763): FeedbackOps' Task board through the bridge; `focus` opens the Task detail in the shell detail slot, closing it goes through the screen. FeedbackOps' Tasks search schema takes any string for `focus` (its `param`) and a UUID or `all` for `managedSystem`. */
export default function FoTaskBoard() {
  return <FeatureScreenPage route={taskBoardRoute} isValid={isTasksSearchValueValid} useSearch={useTaskBoardSearch} useHere={useTaskBoardHere}><TaskBoardScreen renderDetail={renderDetail} /></FeatureScreenPage>;
}
