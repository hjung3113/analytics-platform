// Log lifecycle audit detail schemas (#1444 c, design docs/design/features/log-lifecycle/README.md §4). Non-sensitive
// and body-free: ids, stage names, counts and the names of the fields a write changed — never a reason, a file location
// or a hash, which live in `log_lifecycle.development_event` / `validation_round` (read through their endpoints).
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_LIFECYCLE_AUDIT_EVENT_TYPES = [
  'lifecycle.project.created',
  'lifecycle.project.updated',
  'lifecycle.project.stage_changed',
  'lifecycle.project.cancelled',
  'lifecycle.project.reopened',
  'lifecycle.round.opened',
  'lifecycle.round.closed',
  'lifecycle.round.evidence_attached',
  'lifecycle.round.evidence_ref_attached',
  'lifecycle.request.created',
  'lifecycle.request.cancelled',
  'lifecycle.request.claimed',
  'lifecycle.request.result_submitted',
  'lifecycle.request.failed',
  'lifecycle.request.lease_expired',
  'lifecycle.opinion.recorded',
  'lifecycle.diagnostic.recorded',
  'lifecycle.diagnostic.read',
  'lifecycle.excerpt.read',
  'lifecycle.queue_settings.updated',
  'lifecycle.excerpt_access.set',
  'lifecycle.excerpt.deleted',
  'lifecycle.excerpt.purged',
  'lifecycle.gate.decided',
  'lifecycle.validation_issue.created',
  'lifecycle.validation_issue.occurrence_linked',
  'lifecycle.validation_issue.evidence_linked',
  'lifecycle.validation_issue.commented',
  'lifecycle.validation_issue.field_corrected',
  'lifecycle.validation_issue.state_changed',
  'lifecycle.round.commented',
] as const;

/** Subject id of the project events is the project id; of the round events the round id. */
export const LOG_LIFECYCLE_SUBJECT_TYPES = ['development_project', 'validation_round', 'execution_request', 'queue_settings', 'excerpt_reader', 'validation_issue'] as const;

const STAGE = z.enum(['registered', 'kickoff', 'alpha', 'beta', 'completed', 'cancelled']);
const OPEN_STAGE = z.enum(['registered', 'kickoff', 'alpha', 'beta']);

export const lifecycleProjectCreatedDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    softwareId: z.string().uuid().nullable(),
    kind: z.enum(['new', 'redevelopment']),
    ownerActorId: z.string().uuid(),
  })
  .strict();

export const lifecycleProjectUpdatedDetailSchema = z
  .object({
    /** Names of the fields the call changed (`ownerActorId`, `targetDate`, `softwareId`). */
    changed: z.array(z.string()).min(1),
  })
  .strict();

const stageMove = { from: STAGE, to: STAGE };
export const lifecycleProjectStageChangedDetailSchema = z.object(stageMove).strict();
export const lifecycleProjectCancelledDetailSchema = z.object({ from: OPEN_STAGE }).strict();
export const lifecycleProjectReopenedDetailSchema = z.object(stageMove).strict();

export const lifecycleRoundOpenedDetailSchema = z
  .object({
    projectId: z.string().uuid(),
    seq: z.number().int().min(1),
    stage: OPEN_STAGE,
    fileCount: z.number().int().min(1),
    pinned: z.boolean(),
  })
  .strict();

export const lifecycleRoundClosedDetailSchema = z
  .object({ projectId: z.string().uuid(), seq: z.number().int().min(1) })
  .strict();

/** Manual validation attachment linked to a round (#1451): ids and a count — never a filename or a storage key. */
export const lifecycleRoundEvidenceAttachedDetailSchema = z
  .object({ projectId: z.string().uuid(), seq: z.number().int().min(1), count: z.number().int().min(1) })
  .strict();

/** Evidence locations handed to a round (#1474): counts by status and the origin — never a file location, a hash or a note. */
export const lifecycleRoundEvidenceRefAttachedDetailSchema = z
  .object({
    projectId: z.string().uuid(),
    seq: z.number().int().min(1),
    attached: z.number().int().min(1),
    alreadyAttached: z.number().int().min(0),
    match: z.number().int().min(0),
    hashMismatch: z.number().int().min(0),
    unresolved: z.number().int().min(0),
    originKind: z.enum(['log_explorer']),
    originId: z.string().uuid(),
  })
  .strict();

// Validation request queue (#1445 d, ADR-0117). Subject id of the request events is the request id. Body-free: ids,
// numbers and verdicts only. NEVER a log excerpt, an observed / expected text, a file location or a hash; the excerpt
// read row names the rule result and the evidence index, not what was read. A token call's audit row also carries
// `api_token_id` (added by the audit service).
const VERDICT = z.enum(['pass', 'fail', 'incomplete']);
const ATTEMPT_NO = z.number().int().min(1);

export const lifecycleRequestCreatedDetailSchema = z
  .object({
    /** The request subject (ADR-0117 amendment, #1479): a Round request names `roundId`, a suite run item request `suiteRunItemId`; exactly one. */
    roundId: z.string().uuid().optional(),
    suiteRunItemId: z.string().uuid().optional(),
    priority: z.number().int().min(0).max(2),
    immediate: z.boolean(),
    maxAttempts: z.number().int().min(1).max(10),
  })
  .strict()
  .refine((d) => (d.roundId === undefined) !== (d.suiteRunItemId === undefined), { message: 'exactly one of roundId and suiteRunItemId' });
export const lifecycleRequestCancelledDetailSchema = z
  .object({ roundId: z.string().uuid(), from: z.enum(['queued', 'claimed']) })
  .strict();
export const lifecycleRequestClaimedDetailSchema = z.object({ attemptNo: ATTEMPT_NO, immediate: z.boolean() }).strict();
export const lifecycleRequestResultSubmittedDetailSchema = z
  .object({
    attemptNo: ATTEMPT_NO,
    verdict: VERDICT,
    ruleCount: z.number().int().min(0),
    excerptCount: z.number().int().min(0),
    /** True when the lease had expired and nobody else had taken the request (decision 4). */
    late: z.boolean(),
  })
  .strict();
export const lifecycleRequestFailedDetailSchema = z.object({ attemptNo: ATTEMPT_NO, late: z.boolean() }).strict();
export const lifecycleRequestLeaseExpiredDetailSchema = z
  .object({ attemptNo: ATTEMPT_NO, to: z.enum(['queued', 'expired']) })
  .strict();
/** Opinions written on a succeeded attempt (#1778): the attempt number and the count of new rows only, never a note or any other text. */
export const lifecycleOpinionRecordedDetailSchema = z.object({ attemptNo: ATTEMPT_NO, recorded: z.number().int().min(0) }).strict();
/** Diagnostic audit receipts contain shape identity and counts only (ADR-0159). */
export const lifecycleDiagnosticRecordedDetailSchema = z.object({ attemptNo: ATTEMPT_NO, producer: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/), itemCount: z.number().int().min(1).max(500) }).strict();
export const lifecycleDiagnosticReadDetailSchema = z.discriminatedUnion('scope', [
  z.object({ attemptId: z.string().uuid(), scope: z.literal('list'), count: z.number().int().min(1).max(100) }).strict(),
  z.object({ attemptId: z.string().uuid(), scope: z.literal('item'), itemKey: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/) }).strict(),
]);
export const lifecycleExcerptReadDetailSchema = z
  .object({ attemptId: z.string().uuid(), ruleResultId: z.string().uuid(), evidenceIndex: z.number().int().min(0).max(19) })
  .strict();
export const lifecycleQueueSettingsUpdatedDetailSchema = z
  .object({
    /** Names of the settings the call changed (`runWindow`, `leaseSeconds`, `immediateLimit`, `excerptRetentionDays`, `opinionScale`). */
    changed: z.array(z.string()).min(1),
  })
  .strict();
export const lifecycleExcerptAccessSetDetailSchema = z
  .object({ actorId: z.string().uuid(), allowed: z.boolean() })
  .strict();

/** An administrator erased excerpt bodies of one Round or one attempt (the reason is stored on the excerpt rows, not here). */
export const lifecycleExcerptDeletedDetailSchema = z
  .object({ scope: z.enum(['round', 'attempt']), count: z.number().int().min(0), attemptId: z.string().uuid().optional() })
  .strict();
/** The retention job's summary of one run for one workspace: counts only. */
export const lifecycleExcerptPurgedDetailSchema = z
  .object({ count: z.number().int().min(1), retentionDays: z.number().int().min(1) })
  .strict();

/**
 * A Gate decision (#1446 e): ids, enums, a seq and flags only — never the reason, the exception scope or the basis (they
 * live in `log_lifecycle.gate_decision`). Subject id is the Round id. `riskAcceptedBy` is an actor id, not free text.
 */
export const lifecycleGateDecidedDetailSchema = z
  .object({
    projectId: z.string().uuid(),
    seq: z.number().int().min(1),
    gateDecisionId: z.string().uuid(),
    decision: z.enum(['approved', 'rejected', 'exception']),
    from: OPEN_STAGE,
    targetStage: STAGE,
    /** True when the decider is the requester of the latest 검증 요청 (or, with none, the opener of the Round). */
    selfApproved: z.boolean(),
    attemptCount: z.number().int().min(0),
    evidenceLinkCount: z.number().int().min(0),
    riskAcceptedBy: z.string().uuid().optional(),
  })
  .strict();

/** Human issue/discussion writes: only stable ids, field enums and counts. */
const issueCreatedDetail = z.object({ projectId: z.string().uuid(), firstRoundId: z.string().uuid() }).strict();
const issueOccurrenceDetail = z.object({ occurrenceId: z.string().uuid(), roundId: z.string().uuid() }).strict();
const issueEvidenceDetail = z.object({ occurrenceId: z.string().uuid(), count: z.number().int().min(1).max(20) }).strict();
const discussionCommentDetail = z.object({ commentId: z.string().uuid(), correctsCommentId: z.string().uuid().nullable() }).strict();
// #1808 H3: the one list of validation issue states; platform-api `domain/validation-issue-states.ts` re-exports it as ISSUE_STATES. No reason or comment text.
export const VALIDATION_ISSUE_STATES = ['reported', 'investigating', 'fix_requested', 'vendor_inquiry', 'on_hold', 'fix_verified', 'by_design', 'waived', 'dismissed'] as const;
const ISSUE_STATE = z.enum(VALIDATION_ISSUE_STATES);
const issueStateChangedDetail = z.object({ transitionId: z.string().uuid(), seq: z.number().int().min(1), fromState: ISSUE_STATE, toState: ISSUE_STATE }).strict();
const issueCorrectionDetail = z.object({ eventId: z.string().uuid(), field: z.enum(['title', 'body', 'expected', 'actual', 'repro']), correctsEventId: z.string().uuid().nullable() }).strict();

export const LOG_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'lifecycle.project.created': lifecycleProjectCreatedDetailSchema,
  'lifecycle.project.updated': lifecycleProjectUpdatedDetailSchema,
  'lifecycle.project.stage_changed': lifecycleProjectStageChangedDetailSchema,
  'lifecycle.project.cancelled': lifecycleProjectCancelledDetailSchema,
  'lifecycle.project.reopened': lifecycleProjectReopenedDetailSchema,
  'lifecycle.round.opened': lifecycleRoundOpenedDetailSchema,
  'lifecycle.round.closed': lifecycleRoundClosedDetailSchema,
  'lifecycle.round.evidence_attached': lifecycleRoundEvidenceAttachedDetailSchema,
  'lifecycle.round.evidence_ref_attached': lifecycleRoundEvidenceRefAttachedDetailSchema,
  'lifecycle.request.created': lifecycleRequestCreatedDetailSchema,
  'lifecycle.request.cancelled': lifecycleRequestCancelledDetailSchema,
  'lifecycle.request.claimed': lifecycleRequestClaimedDetailSchema,
  'lifecycle.request.result_submitted': lifecycleRequestResultSubmittedDetailSchema,
  'lifecycle.request.failed': lifecycleRequestFailedDetailSchema,
  'lifecycle.request.lease_expired': lifecycleRequestLeaseExpiredDetailSchema,
  'lifecycle.opinion.recorded': lifecycleOpinionRecordedDetailSchema,
  'lifecycle.diagnostic.recorded': lifecycleDiagnosticRecordedDetailSchema,
  'lifecycle.diagnostic.read': lifecycleDiagnosticReadDetailSchema,
  'lifecycle.excerpt.read': lifecycleExcerptReadDetailSchema,
  'lifecycle.queue_settings.updated': lifecycleQueueSettingsUpdatedDetailSchema,
  'lifecycle.excerpt_access.set': lifecycleExcerptAccessSetDetailSchema,
  'lifecycle.excerpt.deleted': lifecycleExcerptDeletedDetailSchema,
  'lifecycle.excerpt.purged': lifecycleExcerptPurgedDetailSchema,
  'lifecycle.gate.decided': lifecycleGateDecidedDetailSchema,
  'lifecycle.validation_issue.created': issueCreatedDetail,
  'lifecycle.validation_issue.occurrence_linked': issueOccurrenceDetail,
  'lifecycle.validation_issue.evidence_linked': issueEvidenceDetail,
  'lifecycle.validation_issue.commented': discussionCommentDetail,
  'lifecycle.validation_issue.field_corrected': issueCorrectionDetail,
  'lifecycle.validation_issue.state_changed': issueStateChangedDetail,
  'lifecycle.round.commented': discussionCommentDetail,
} as const satisfies Record<(typeof LOG_LIFECYCLE_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
