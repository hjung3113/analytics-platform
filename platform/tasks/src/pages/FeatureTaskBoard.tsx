import { FeatureScreenPage, isUuid, taskBoardRoute, useTaskBoardHere, useTaskBoardSearch } from '@ap/feature-bridge';
import { TaskBoardScreen } from '@ap/feature-screens/operator-screens/task-board';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';
import { BoardTaskDrawer, type BoardDetailOptions } from './TaskDrawers';

/** `focus` becomes the feature `param`, a request path segment, so only a UUID passes (06 §6.4, ADR-0071 decision 9); other keys follow the Tasks search schema. */
const isValid = (key: string, value: string) => key === 'param' ? isUuid(value) : isTasksSearchValueValid(key, value);

/** The board owns the move and the close, so it renders what this returns in place, inside `FeatureBridge`; the drawer portals into the shell detail slot. */
const renderDetail = (taskId: string, options: BoardDetailOptions) => <BoardTaskDrawer key={taskId} taskId={taskId} {...options} />;

/** Tasks (ADR-0081, #763): the feature screens' Task board through the bridge; `focus` opens the Task detail in the shell detail slot, closing it goes through the screen. `focus` (its `param`) must be a UUID and `managedSystem` a UUID or `all`. */
export default function FeatureTaskBoard() {
  return <FeatureScreenPage route={taskBoardRoute} isValid={isValid} useSearch={useTaskBoardSearch} useHere={useTaskBoardHere}><TaskBoardScreen renderDetail={renderDetail} /></FeatureScreenPage>;
}
