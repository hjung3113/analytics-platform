import { FeatureDetailDrawer } from '@ap/feature-bridge';
import { useTaskDetailParts, useTaskManagedSystemNames, useWorkspaceActors } from '@ap/feature-screens/operator-screens/task-detail';

/** Actor id → display name, the map `useTaskDetailParts` shows assignees and reviewers from (only the screens hold it in FeedbackOps). */
function useActorNames(): ReadonlyMap<string, string> {
  const { actors } = useWorkspaceActors();
  return new Map((actors ?? []).map(actor => [actor.id, actor.display_name]));
}

/**
 * The Task detail of Task 목록 and 내 Task in the shell detail slot. It renders inside `FeatureBridge` (the FeedbackOps providers) and portals into the slot through
 * `FeatureDetailDrawer`; `onClose` drops `focus`. Key it on the Task.
 */
export function TaskDetailDrawer({ taskId, view, onClose }: { taskId: string; view: 'backlog' | 'my'; onClose: () => void }) {
  const parts = useTaskDetailParts({ taskId, view, onClose, actorNamesById: useActorNames(), managedSystemNamesById: useTaskManagedSystemNames() });
  return <FeatureDetailDrawer parts={parts} onClose={onClose} requestClose={parts.requestClose} />;
}

/** What `TaskBoardScreen` hands `renderDetail` (the board owns the move and the close). */
export type BoardDetailOptions = {
  actorNamesById: ReadonlyMap<string, string>;
  managedSystemNamesById: ReadonlyMap<string, string>;
  hasActionFooter: boolean;
  onMoveToNextStatus(taskId: string): void;
  onClose(): void;
};

/** The board's Task detail, rendered in place by the screen (`renderDetail`): the standalone order, body then the next-status footer. Key it on the Task. */
export function BoardTaskDrawer({ taskId, onClose, ...options }: { taskId: string } & BoardDetailOptions) {
  const parts = useTaskDetailParts({ taskId, view: 'board', onClose, ...options });
  return <FeatureDetailDrawer parts={{ ...parts, body: <>{parts.body}{parts.footer}</> }} onClose={onClose} requestClose={parts.requestClose} />;
}
