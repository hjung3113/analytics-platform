import { taskListRoute, useTaskListHere, useTaskListSearch } from '@ap/fo-bridge';
import { TaskListPage } from './TaskListPage';

/** Task 목록 (ADR-0081, #763): FeedbackOps' backlog list, hidden under `Tasks`; the VOC detail, the dashboard and Task links land here with their filters. */
export default function FoTaskList() {
  return <TaskListPage view="backlog" route={taskListRoute} useSearch={useTaskListSearch} useHere={useTaskListHere} />;
}
