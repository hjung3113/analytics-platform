import { myTasksRoute, useMyTasksHere, useMyTasksSearch } from '@ap/feature-bridge';
import { TaskListPage } from './TaskListPage';

/** 내 Task (ADR-0081, #763): the feature screens' list of the Tasks assigned to me. */
export default function FeatureMyTasks() {
  return <TaskListPage view="my" route={myTasksRoute} useSearch={useMyTasksSearch} useHere={useMyTasksHere} />;
}
