import { buildFeedbackOpsLink, ContractError, type FeedbackOpsTarget, type SpaceId } from '@ap/contracts';
import type { FeedbackOpsEntry, FeedbackOpsSlot } from '@ap/kernel';

/**
 * Space → FeedbackOps Managed System (ADR-0045: one per space; never inferred from Site or equipment ids, ADR-0004).
 * The operations space has no row, so it draws no FeedbackOps block.
 */
export const FEEDBACKOPS_MANAGED_SYSTEMS: Readonly<Partial<Record<SpaceId, string>>> = {
  // mock 합성 값, 실제 배포는 조립 계층이 교체
  analytics: '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  metrics: '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTRIES: readonly { id: FeedbackOpsEntry['id']; label: FeedbackOpsEntry['label']; target: (managedSystemId: string) => FeedbackOpsTarget }[] = [
  { id: 'voc-create', label: { ko: 'VOC 등록', en: 'Submit VOC' }, target: managedSystemId => ({ kind: 'voc-create', managedSystemId }) },
  { id: 'voc', label: { ko: 'VOC', en: 'VOC' }, target: managedSystemId => ({ kind: 'voc-list', managedSystemId }) },
  { id: 'task', label: { ko: 'Task', en: 'Tasks' }, target: managedSystemId => ({ kind: 'task-list', managedSystemId }) },
  { id: 'survey', label: { ko: '설문', en: 'Surveys' }, target: managedSystemId => ({ kind: 'survey-list', managedSystemId }) },
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
    entriesFor: spaceId => {
      const managedSystemId = FEEDBACKOPS_MANAGED_SYSTEMS[spaceId];
      if (managedSystemId === undefined || !UUID.test(managedSystemId)) return null;
      return ENTRIES.map(({ id, label, target }) => ({ id, label, href: hrefOrNull(origin, target(managedSystemId)) }));
    },
    overall: overallHref === null ? null : { href: overallHref, permission: 'feedbackops:access' },
  };
}
