import { ClipboardList, ListTodo, MessagesSquare } from 'lucide-react';
import type { SpaceId } from '@ap/contracts';
import { isUuid } from '@ap/fo-bridge';
import type { FeedbackOpsEntry, FeedbackOpsSlot } from '@ap/kernel';
import type { SPACES } from './menus';

/** The space ids `SPACES` declares, as plain literals, so a key that names no declared space fails typecheck. */
type AppSpaceId = (typeof SPACES)[number]['id'] extends infer Id ? Id extends infer Raw & SpaceId ? Raw : never : never;

/**
 * Space → FeedbackOps Managed System (ADR-0045: one per space; never inferred from Site or equipment ids, ADR-0004).
 * The operations space has no row, so it draws no FeedbackOps block.
 */
export const FEEDBACKOPS_MANAGED_SYSTEMS: Readonly<Partial<Record<AppSpaceId, string>>> = {
  // mock 합성 값, 실제 배포는 조립 계층이 교체
  mars: '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  bravo: '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d',
};

/** The Managed System id of a space (ADR-0045), or null when it has no row or the id is not a UUID. The one lookup for the sidebar entries and the VOC 등록 form's default. */
export function managedSystemFor(spaceId: string | null): string | null {
  if (spaceId === null) return null;
  const managedSystemId = (FEEDBACKOPS_MANAGED_SYSTEMS as Readonly<Record<string, string | undefined>>)[spaceId];
  return managedSystemId !== undefined && isUuid(managedSystemId) ? managedSystemId : null;
}

/** One bottom-block entry: an in-shell menu opened with the space's Managed System. */
type Row = Pick<FeedbackOpsEntry, 'key' | 'label' | 'icon'> & { menuId: string };
const ENTRIES: readonly Row[] = [
  { key: 'voc', icon: MessagesSquare, label: { ko: 'VOC', en: 'VOC' }, menuId: 'fo-inbox' },
  { key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Tasks' }, menuId: 'fo-task-list' },
  { key: 'survey', icon: ClipboardList, label: { ko: '설문', en: 'Surveys' }, menuId: 'fo-surveys' },
];

/** The FeedbackOps slot for the app; all entries open in the shell. */
export function feedbackOpsSlot(): FeedbackOpsSlot {
  return {
    entriesFor: (spaceId) => {
      const managedSystemId = managedSystemFor(spaceId);
      if (managedSystemId === null) return null;
      return ENTRIES.map((row): FeedbackOpsEntry => ({ key: row.key, label: row.label, icon: row.icon, menuId: row.menuId, page: { managedSystem: managedSystemId } }));
    },
    permission: 'feedbackops:access',
    // No `FeedbackOps 전체` user-menu link any more (#764 p2, ADR-0081 decision 6): every FeedbackOps screen is a platform menu. The SDK slot keeps the field for other apps.
    overall: null,
  };
}
