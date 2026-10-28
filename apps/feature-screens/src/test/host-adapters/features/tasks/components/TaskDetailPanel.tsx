import {
  type UseTaskDetailPartsArgs,
  useTaskDetailParts,
} from '@/features/tasks/components/TaskDetailParts';
import { DetailPanelHeader } from '@ap/ui';
import type * as React from 'react';

export { TASK_DETAIL_SECTIONS } from '@/features/tasks/components/TaskDetailParts';

function TaskDetailPanelFrame({
  onClose,
  children,
  headerId,
  headerExtras,
  loading,
  ariaLive = 'off',
}: {
  onClose: () => void;
  children: React.ReactNode;
  headerId?: string;
  headerExtras?: React.ReactNode;
  loading?: boolean;
  ariaLive?: 'off' | 'polite';
}) {
  return (
    <aside
      aria-busy={loading ?? false}
      {...(loading ? { 'aria-label': 'Task 상세 불러오는 중' } : {})}
      className="flex h-full flex-col bg-surface-detail"
    >
      <DetailPanelHeader
        kind="task"
        {...(headerId !== undefined ? { id: headerId } : {})}
        onClose={onClose}
        {...(headerExtras !== undefined ? { extras: headerExtras } : {})}
      />
      <div aria-live={ariaLive} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </aside>
  );
}

export type TaskDetailPanelProps = UseTaskDetailPartsArgs;

/** The standalone frame around the Task detail parts (`useTaskDetailParts`); the platform bridge frames the same parts itself. */
export function TaskDetailPanel(props: TaskDetailPanelProps) {
  const { onClose } = props;
  const parts = useTaskDetailParts(props);
  const { view } = parts;

  switch (view.kind) {
    case 'loading':
      return (
        <TaskDetailPanelFrame loading ariaLive="polite" onClose={onClose}>
          {parts.body}
        </TaskDetailPanelFrame>
      );
    case 'forbidden':
      return <>{parts.body}</>;
    case 'error':
      return (
        <TaskDetailPanelFrame ariaLive="polite" onClose={onClose}>
          {parts.body}
        </TaskDetailPanelFrame>
      );
    case 'ready':
      return (
        <TaskDetailPanelFrame
          ariaLive="off"
          headerId={view.task.display_id}
          headerExtras={parts.headerActions}
          onClose={onClose}
        >
          {parts.body}
          {parts.footer}
        </TaskDetailPanelFrame>
      );
  }
}
