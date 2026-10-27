import { ClipboardList, ListTodo, MessagesSquare } from 'lucide-react';
import { buildFeedbackOpsLink, ContractError, type FeedbackOpsTarget, type SpaceId } from '@ap/contracts';
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

type Back = { platformReturn?: string };
/** One bottom-block entry: either an in-shell menu (`menuId`, opened with the space's Managed System) or a FeedbackOps new-tab `target`. */
type Row = Pick<FeedbackOpsEntry, 'key' | 'label' | 'icon'> & ({ menuId: string } | { target: (managedSystemId: string, back: Back) => FeedbackOpsTarget });
const ENTRIES: readonly Row[] = [
  { key: 'voc', icon: MessagesSquare, label: { ko: 'VOC', en: 'VOC' }, menuId: 'fo-inbox' },
  { key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Tasks' }, menuId: 'fo-task-list' },
  { key: 'survey', icon: ClipboardList, label: { ko: '설문', en: 'Surveys' }, menuId: 'fo-surveys' },
];

/** href for one entry; a missing or non-canonical origin yields null (the shell draws the entry disabled, 15 §8). */
function hrefOrNull(origin: string | null, target: FeedbackOpsTarget): string | null {
  if (origin === null) return null;
  try { return buildFeedbackOpsLink({ origin, target }); } catch (error) {
    if (error instanceof ContractError && error.code === 'feedbackops_origin') return null;
    throw error;
  }
}

/** The FeedbackOps slot for the app. Entries come only from the mapping above; new-tab links come only from `buildFeedbackOpsLink`. VOC (#760), Task (#763) and 설문 (#764) open in the shell; a `target` row would be a new-tab link. */
export function feedbackOpsSlot(origin: string | null): FeedbackOpsSlot {
  const overallHref = hrefOrNull(origin, { kind: 'overall' });
  return {
    entriesFor: (spaceId, platformReturn) => {
      const managedSystemId = managedSystemFor(spaceId);
      if (managedSystemId === null) return null;
      const back: Back = platformReturn === undefined ? {} : { platformReturn };
      return ENTRIES.map((row): FeedbackOpsEntry => 'menuId' in row
        ? { key: row.key, label: row.label, icon: row.icon, menuId: row.menuId, page: { managedSystem: managedSystemId } }
        : { key: row.key, label: row.label, icon: row.icon, href: hrefOrNull(origin, row.target(managedSystemId, back)) });
    },
    permission: 'feedbackops:access',
    overall: overallHref === null ? null : { href: overallHref, permission: 'feedbackops:access' },
  };
}
