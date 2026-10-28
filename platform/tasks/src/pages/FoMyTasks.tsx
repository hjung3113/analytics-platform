import { myTasksRoute, useMyTasksHere, useMyTasksSearch } from '@ap/feature-bridge';
import { TaskListPage } from './TaskListPage';

/** 내 Task (ADR-0081, #763): FeedbackOps' list of the Tasks assigned to me. */
export default function FoMyTasks() {
  return <TaskListPage view="my" route={myTasksRoute} useSearch={useMyTasksSearch} useHere={useMyTasksHere} />;
}
