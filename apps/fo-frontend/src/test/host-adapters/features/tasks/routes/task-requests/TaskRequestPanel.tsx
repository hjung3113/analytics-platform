import {
  TaskRequestPanelFrame,
  type TaskRequestPanelProps,
  buildTaskRequestPanelParts,
} from '@/features/tasks/routes/task-requests/TaskRequestPanelParts';

export { buildTaskRequestSections } from '@/features/tasks/routes/task-requests/TaskRequestPanelParts';
export type { TaskRequestPanelProps } from '@/features/tasks/routes/task-requests/TaskRequestPanelParts';

export function TaskRequestPanel(props: TaskRequestPanelProps) {
  return <TaskRequestPanelFrame parts={buildTaskRequestPanelParts(props)} />;
}
