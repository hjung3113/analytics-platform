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
  'lifecycle.request.created',
  'lifecycle.request.cancelled',
  'lifecycle.request.claimed',
  'lifecycle.request.result_submitted',
  'lifecycle.request.failed',
  'lifecycle.request.lease_expired',
  'lifecycle.excerpt.read',
  'lifecycle.queue_settings.updated',
  'lifecycle.excerpt_access.set',
  'lifecycle.excerpt.deleted',
  'lifecycle.excerpt.purged',
] as const;

/** Subject id of the project events is the project id; of the round events the round id. */
export const LOG_LIFECYCLE_SUBJECT_TYPES = ['development_project', 'validation_round', 'execution_request', 'queue_settings', 'excerpt_reader'] as const;

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

// Validation request queue (#1445 d, ADR-0117). Subject id of the request events is the request id. Body-free: ids,
// numbers and verdicts only. NEVER a log excerpt, an observed / expected text, a file location or a hash; the excerpt
// read row names the rule result and the evidence index, not what was read. A token call's audit row also carries
// `api_token_id` (added by the audit service).
const VERDICT = z.enum(['pass', 'fail', 'incomplete']);
const ATTEMPT_NO = z.number().int().min(1);

export const lifecycleRequestCreatedDetailSchema = z
  .object({
    roundId: z.string().uuid(),
    priority: z.number().int().min(0).max(2),
    immediate: z.boolean(),
    maxAttempts: z.number().int().min(1).max(10),
  })
  .strict();
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
export const lifecycleExcerptReadDetailSchema = z
  .object({ attemptId: z.string().uuid(), ruleResultId: z.string().uuid(), evidenceIndex: z.number().int().min(0).max(19) })
  .strict();
export const lifecycleQueueSettingsUpdatedDetailSchema = z
  .object({
    /** Names of the settings the call changed (`runWindow`, `leaseSeconds`, `immediateLimit`, `excerptRetentionDays`). */
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

export const LOG_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'lifecycle.project.created': lifecycleProjectCreatedDetailSchema,
  'lifecycle.project.updated': lifecycleProjectUpdatedDetailSchema,
  'lifecycle.project.stage_changed': lifecycleProjectStageChangedDetailSchema,
  'lifecycle.project.cancelled': lifecycleProjectCancelledDetailSchema,
  'lifecycle.project.reopened': lifecycleProjectReopenedDetailSchema,
  'lifecycle.round.opened': lifecycleRoundOpenedDetailSchema,
  'lifecycle.round.closed': lifecycleRoundClosedDetailSchema,
  'lifecycle.round.evidence_attached': lifecycleRoundEvidenceAttachedDetailSchema,
  'lifecycle.request.created': lifecycleRequestCreatedDetailSchema,
  'lifecycle.request.cancelled': lifecycleRequestCancelledDetailSchema,
  'lifecycle.request.claimed': lifecycleRequestClaimedDetailSchema,
  'lifecycle.request.result_submitted': lifecycleRequestResultSubmittedDetailSchema,
  'lifecycle.request.failed': lifecycleRequestFailedDetailSchema,
  'lifecycle.request.lease_expired': lifecycleRequestLeaseExpiredDetailSchema,
  'lifecycle.excerpt.read': lifecycleExcerptReadDetailSchema,
  'lifecycle.queue_settings.updated': lifecycleQueueSettingsUpdatedDetailSchema,
  'lifecycle.excerpt_access.set': lifecycleExcerptAccessSetDetailSchema,
  'lifecycle.excerpt.deleted': lifecycleExcerptDeletedDetailSchema,
  'lifecycle.excerpt.purged': lifecycleExcerptPurgedDetailSchema,
} as const satisfies Record<(typeof LOG_LIFECYCLE_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
