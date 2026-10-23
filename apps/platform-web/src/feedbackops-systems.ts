import { ClipboardList, ListTodo, MessageSquarePlus, MessagesSquare } from 'lucide-react';
import { buildFeedbackOpsLink, ContractError, type FeedbackOpsTarget, type SpaceId } from '@ap/contracts';
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
  analytics: '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  metrics: '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Back = { platformReturn?: string };
const ENTRIES: readonly { key: FeedbackOpsEntry['key']; label: FeedbackOpsEntry['label']; icon: FeedbackOpsEntry['icon']; target: (managedSystemId: string, back: Back) => FeedbackOpsTarget }[] = [
  { key: 'voc-create', icon: MessageSquarePlus, label: { ko: 'VOC 등록', en: 'Submit VOC' }, target: (managedSystemId, back) => ({ kind: 'voc-create', managedSystemId, ...back }) },
  { key: 'voc', icon: MessagesSquare, label: { ko: 'VOC', en: 'VOC' }, target: (managedSystemId, back) => ({ kind: 'voc-list', managedSystemId, ...back }) },
  { key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Tasks' }, target: (managedSystemId, back) => ({ kind: 'task-list', managedSystemId, ...back }) },
  { key: 'survey', icon: ClipboardList, label: { ko: '설문', en: 'Surveys' }, target: (managedSystemId, back) => ({ kind: 'survey-list', managedSystemId, ...back }) },
];

/** href for one entry; a missing or non-canonical origin yields null (the shell draws the entry disabled, 15 §8). */
function hrefOrNull(origin: string | null, target: FeedbackOpsTarget): string | null {
  if (origin === null) return null;
  try { return buildFeedbackOpsLink({ origin, target }); } catch (error) {
    if (error instanceof ContractError && error.code === 'feedbackops_origin') return null;
    throw error;
  }
}

/** The FeedbackOps slot for the app. Entries come only from the mapping above; links come only from `buildFeedbackOpsLink`. */
export function feedbackOpsSlot(origin: string | null): FeedbackOpsSlot {
  const overallHref = hrefOrNull(origin, { kind: 'overall' });
  return {
    entriesFor: (spaceId, platformReturn) => {
      const managedSystemId = (FEEDBACKOPS_MANAGED_SYSTEMS as Readonly<Record<string, string | undefined>>)[spaceId];
      if (managedSystemId === undefined || !UUID.test(managedSystemId)) return null;
      const back: Back = platformReturn === undefined ? {} : { platformReturn };
      return ENTRIES.map(({ key, label, icon, target }) => ({ key, label, icon, href: hrefOrNull(origin, target(managedSystemId, back)) }));
    },
    overall: overallHref === null ? null : { href: overallHref, permission: 'feedbackops:access' },
  };
}
