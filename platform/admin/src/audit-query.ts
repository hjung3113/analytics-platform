import { ADMIN_MESSAGES } from './messages';
/**
 * Vocabulary of the console audit screen (#50, #305, 06 §6.1): sortable columns, display words, and the value domains that mirror the server's
 * `Invalid audit filter` list. Pure and node-runnable. The page's conditions travel as `filter` (see `audit-filters.ts`); this file keeps what
 * those fields are checked against.
 */
import type { AuditAction, AuditSource } from '@ap/contracts';

/** Sortable columns only — `targetType` sorts `target.type`; the destination columns never sort. */
export const SORT_FIELDS = ['at', 'actor', 'action', 'source', 'targetType'];

/** The timeline words, copied from AuditTimeline (§6: do not export a label helper from components). */
export const ACTION_LABEL: Record<AuditAction, { ko: string; en: string }> = {
  create: ADMIN_MESSAGES.auditQueryCreated, update: ADMIN_MESSAGES.auditQueryUpdated,
  retire: ADMIN_MESSAGES.auditQueryRetired, sync: ADMIN_MESSAGES.auditQuerySynced, delete: ADMIN_MESSAGES.auditQueryDeleted,
};

/** Display words for the wire values; the URL and adapter keep the raw `user`/`system`·`equipment`/`metric`. */
export const SOURCE_LABEL: Record<AuditSource, { ko: string; en: string }> = {
  user: ADMIN_MESSAGES.auditQueryUser, system: ADMIN_MESSAGES.auditQuerySystem,
};
/** Display words for the subject types the console knows: the 18 feature types the real projection releases plus the 3 mock samples. Consumer-owned; any other well-formed type is shown raw (#1091, ADR-0101). */
export const TYPE_LABEL: Record<string, { ko: string; en: string }> = {
  equipment: ADMIN_MESSAGES.auditQueryEquipment, metric: ADMIN_MESSAGES.auditQueryMetric, annotation: ADMIN_MESSAGES.auditQueryChartAnnotation,
  voc: ADMIN_MESSAGES.auditQueryVOC, finding: ADMIN_MESSAGES.auditQueryFinding, task: ADMIN_MESSAGES.auditQueryTask,
  task_request: ADMIN_MESSAGES.auditQueryTaskRequest, entity_link: ADMIN_MESSAGES.auditQueryEntityLink,
  voc_cluster: ADMIN_MESSAGES.auditQueryVOCCluster, permission_request: ADMIN_MESSAGES.auditQueryPermissionRequest,
  permission_grant: ADMIN_MESSAGES.auditQueryPermissionGrant, permission_deny: ADMIN_MESSAGES.auditQueryPermissionDenial,
  survey: ADMIN_MESSAGES.auditQuerySurvey, survey_question: ADMIN_MESSAGES.auditQuerySurveyQuestion,
  managed_system: ADMIN_MESSAGES.auditQueryManagedSystem, analytics_area: ADMIN_MESSAGES.auditQueryAnalyticsArea,
  milestone: ADMIN_MESSAGES.auditQueryMilestone, attachment: ADMIN_MESSAGES.auditQueryAttachment,
  public_update_review_candidate: ADMIN_MESSAGES.auditQueryPublicUpdateReviewCandidate,
  voc_cluster_suggestion: ADMIN_MESSAGES.auditQueryVOCClusterSuggestion, workspace: ADMIN_MESSAGES.auditQueryPlatformSettings,
  api_token: ADMIN_MESSAGES.auditQueryAPIToken,
};

export { AUDIT_TYPE_TOKEN } from '@ap/contracts';

export const AUDIT_ACTIONS: readonly string[] = Object.keys(ACTION_LABEL);
export const AUDIT_SOURCES: readonly string[] = Object.keys(SOURCE_LABEL);
