// THROWAWAY #250 — never merge.
import { buildFeedbackOpsLink, type SpaceId } from '@ap/contracts';
import type { ProtoFeedbackOpsLink, ProtoFeedbackOpsView } from '@ap/kernel';

/**
 * Fake managed-system ids. `operations` and `common` are absent on purpose:
 * opening FeedbackOps without a system would show other systems' requests.
 */
const MANAGED_SYSTEM: Partial<Record<SpaceId, string>> = {
  productivity: '11111111-1111-4111-8111-111111111111',
  metrics: '22222222-2222-4222-8222-222222222222',
  logdev: '33333333-3333-4333-8333-333333333333',
  improvement: '44444444-4444-4444-8444-444444444444',
};

const LABELS = {
  'voc-create': { ko: 'VOC 등록', en: 'Register VOC' },
  voc: { ko: 'VOC', en: 'VOC' },
  task: { ko: 'Task', en: 'Task' },
  survey: { ko: '설문', en: 'Survey' },
} as const;

const DRAFT_ORIGIN = 'http://localhost:5173';

/** List entry that is not in the platform contract yet. The id comes only from MANAGED_SYSTEM. */
function managedListHref(origin: string, resource: 'vocs' | 'tasks' | 'surveys', managedSystemId: string): string {
  const params = new URLSearchParams();
  params.set('managedSystem', managedSystemId);
  return `${origin}/${resource}?${params.toString()}`;
}

function linksFor(origin: string, managedSystemId: string): ProtoFeedbackOpsLink[] {
  return [
    { id: 'voc-create', label: LABELS['voc-create'], href: buildFeedbackOpsLink({ origin, target: { kind: 'voc-create', managedSystemId } }) },
    { id: 'voc', label: LABELS.voc, href: managedListHref(origin, 'vocs', managedSystemId) },
    { id: 'task', label: LABELS.task, href: managedListHref(origin, 'tasks', managedSystemId) },
    { id: 'survey', label: LABELS.survey, href: managedListHref(origin, 'surveys', managedSystemId) },
  ];
}

/** `null` origin uses the prototype address. Any other value is handed to the contract unchanged. */
export function createProtoFeedbackOps(originInput: string | null): (spaceId: SpaceId) => ProtoFeedbackOpsView {
  const draftOrigin = originInput === null;
  const supplied = originInput ?? DRAFT_ORIGIN;
  const origin = new URL(buildFeedbackOpsLink({ origin: supplied, target: { kind: 'voc-create' } })).origin;
  const hubHref = `${origin}/`;
  return (spaceId) => {
    const managedSystemId = MANAGED_SYSTEM[spaceId];
    return { links: managedSystemId ? linksFor(origin, managedSystemId) : null, hubHref, draftOrigin };
  };
}
