import { taskListRoute, useTaskListHere, useTaskListSearch } from '@ap/feature-bridge';
import { TaskListPage } from './TaskListPage';

/** Task 목록 (ADR-0081, #763): the feature screens' backlog list, hidden under `Tasks`; the VOC detail, the dashboard and Task links land here with their filters. */
export default function FeatureTaskList() {
  return <TaskListPage view="backlog" route={taskListRoute} useSearch={useTaskListSearch} useHere={useTaskListHere} />;
}
