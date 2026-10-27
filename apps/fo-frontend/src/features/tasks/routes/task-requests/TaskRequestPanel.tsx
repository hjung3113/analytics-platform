import {
  TaskRequestPanelFrame,
  type TaskRequestPanelProps,
  buildTaskRequestPanelParts,
} from './TaskRequestPanelParts';

export { buildTaskRequestSections } from './TaskRequestPanelParts';
export type { TaskRequestPanelProps } from './TaskRequestPanelParts';

export function TaskRequestPanel(props: TaskRequestPanelProps) {
  return <TaskRequestPanelFrame parts={buildTaskRequestPanelParts(props)} />;
}
