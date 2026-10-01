/**
 * My VOC query endpoints (docs/integration/menu-query-port.md §3, #131). FeedbackOps product data projected for the
 * session actor — menu vocabulary, so it lives here, not on the Kernel port. Not mart data (`mart: false` on the
 * server half): no Data Trust. The server stamps the session actor; the client sends no user id, Scope or Context.
 */
import { defineEndpoint } from '@ap/contracts';

/** User-facing VOC status only (issue #60). Not triage_state, not an operator inbox. */
export type MyVocStatus =
  | 'received' | 'reviewing' | 'assigned' | 'progress'
  | 'prep' | 'resolved' | 'reopened' | 'closed';

/** One filed VOC, mapped from the FeedbackOps `VocListItem` (issue #60); the FeedbackOps DTO never leaks. */
export type MyVocItem = {
  id: string; // FeedbackOps voc id (uuid). Deep-link vocId. Not display_id.
  displayId: string; // display_id. Shown as-is; not translated.
  title: string; // user text; not translated (06 §23).
  status: MyVocStatus; // reporter_facing_status. The only status on the wire.
  openedAt: string; // created_at, ISO-8601. Not an analysis from/to.
  updatedAt: string; // updated_at, ISO-8601.
  managedSystemId: string; // primary_managed_system_id (uuid). Not a platform scopeId; never shown, never linked.
};

export type MyVocPage = {
  items: readonly MyVocItem[];
  /** Null on the last page. Client must not parse it. */
  nextCursor: string | null;
};

export type MySurveyItem = {
  surveyId: string; // uuid, only once a source exists
  title: string;
  submittedAt: string; // ISO-8601
};

export type MySurveyPage = { items: readonly MySurveyItem[] };

/** The session actor's filed VOCs, newest openedAt first, cursor-paged. `cursor: null` is the first page. */
export const myVocHistoryEndpoint = defineEndpoint<{ cursor: string | null }, MyVocPage>({
  id: 'noticeVoc.myVocHistory',
  menuId: 'voc',
  paramKeys: { cursor: true },
  permission: 'voc:view',
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});

/** The session actor's survey submissions. No FeedbackOps read exists yet: success is the `respondent_history`/`unknown` envelope, never a confirmed zero. */
export const mySurveyHistoryEndpoint = defineEndpoint<Record<never, true>, MySurveyPage>({
  id: 'noticeVoc.mySurveyHistory',
  menuId: 'voc',
  paramKeys: {},
  permission: 'voc:view',
  requiresScope: false,
  context: {},
  kinds: ['respondent_history'],
  mergeTimeDomain: false,
});
