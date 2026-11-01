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
  create: { ko: '생성', en: 'Created' }, update: { ko: '변경', en: 'Updated' },
  retire: { ko: '사용중지', en: 'Retired' }, sync: { ko: '동기화', en: 'Synced' }, delete: { ko: '삭제', en: 'Deleted' },
};

/** Display words for the wire values; the URL and adapter keep the raw `user`/`system`·`equipment`/`metric`. */
export const SOURCE_LABEL: Record<AuditSource, { ko: string; en: string }> = {
  user: { ko: '사용자', en: 'User' }, system: { ko: '연동', en: 'System' },
};
/** Display words for the subject types the console knows: the 18 feature types the real projection releases plus the 3 mock samples. Consumer-owned; any other well-formed type is shown raw (#1091, ADR-0101). */
export const TYPE_LABEL: Record<string, { ko: string; en: string }> = {
  equipment: { ko: '설비', en: 'Equipment' }, metric: { ko: '지표', en: 'Metric' }, annotation: { ko: '차트 주석', en: 'Chart annotation' },
  voc: { ko: 'VOC', en: 'VOC' }, finding: { ko: 'Finding', en: 'Finding' }, task: { ko: 'Task', en: 'Task' },
  task_request: { ko: 'Task 요청', en: 'Task request' }, entity_link: { ko: '엔티티 링크', en: 'Entity link' },
  voc_cluster: { ko: 'VOC 클러스터', en: 'VOC cluster' }, permission_request: { ko: '권한 요청', en: 'Permission request' },
  permission_grant: { ko: '권한 부여', en: 'Permission grant' }, permission_deny: { ko: '권한 거절', en: 'Permission denial' },
  survey: { ko: '설문', en: 'Survey' }, survey_question: { ko: '설문 문항', en: 'Survey question' },
  managed_system: { ko: '관리 시스템', en: 'Managed system' }, analytics_area: { ko: '분석 영역', en: 'Analytics area' },
  milestone: { ko: '마일스톤', en: 'Milestone' }, attachment: { ko: '첨부', en: 'Attachment' },
  public_update_review_candidate: { ko: '공개 업데이트 검토 후보', en: 'Public update review candidate' },
  voc_cluster_suggestion: { ko: 'VOC 클러스터 제안', en: 'VOC cluster suggestion' }, workspace: { ko: '워크스페이스', en: 'Workspace' },
};

/** An opaque, case-sensitive subject-type token: no trimming or normalization. Keep in lockstep with the mock
 *  (`packages/adapters/mock-server/src/audit/audit.ts`) and the server (`apps/platform-api/.../audit-query.ts`) copies. */
export const AUDIT_TYPE_TOKEN = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;

export const AUDIT_ACTIONS: readonly string[] = Object.keys(ACTION_LABEL);
export const AUDIT_SOURCES: readonly string[] = Object.keys(SOURCE_LABEL);

/** True when the operator text is not a plain token: empty, over 80 chars, or URL/whitespace-bearing. */
export const invalidText = (value: string): boolean => !value || value.length > 80 || /[?#&\s]/.test(value);

/** The time keys' wire form (ISO-8601 instant with a required zone), matching the anchored grammar
 *  `instantEpochMs` accepts. Tested first because `instantEpochMs` throws one error for both a format
 *  miss and a calendar miss, and @ap/contracts is not the menu's to change. Keep in lockstep. */
export const AT_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|z|[+-]\d{2}:?\d{2})$/;
