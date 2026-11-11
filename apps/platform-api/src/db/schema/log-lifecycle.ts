import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';

// Log lifecycle (#1444 node c, design docs/design/features/log-lifecycle/README.md §3, ADR-0117): the development
// project of one model, its append-only history and its validation rounds. `model_id` / `software_id` are plain uuids
// into `knowledge.*` (no cross-schema FK, module boundary): the write path checks them through the log-knowledge read
// port. Every lifecycle->lifecycle reference is a composite same-workspace FK (ON DELETE RESTRICT); actor columns are
// plain FKs to core.actors (core.actors has no (workspace_id, id) key), so the write path checks the owner's workspace.
export const logLifecycleSchema = pgSchema('log_lifecycle');

const REASON_MAX = 2000;
const NOTE_MAX = 2000;
const PROJECT_KINDS = "('new','redevelopment')";
const STAGES = "('registered','kickoff','alpha','beta','completed','cancelled')";
const OPEN_STAGES = "('registered','kickoff','alpha','beta')";
const EVENT_KINDS = "('created','stage_changed','owner_changed','target_changed','cancelled','reopened','gate_decided')";
const ROUND_STATUSES = "('open','closed')";

export const developmentProjects = logLifecycleSchema.table(
  'development_project',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    modelId: uuid('model_id').notNull(),
    softwareId: uuid('software_id'),
    kind: text('kind').notNull(),
    stage: text('stage').notNull().default('registered'),
    ownerActorId: uuid('owner_actor_id')
      .notNull()
      .references(() => actors.id),
    /** Date only (wall-clock, no time zone). */
    targetDate: date('target_date', { mode: 'string' }),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('development_project_workspace_id_id_uq').on(t.workspaceId, t.id),
    // One open project per model (design §3): completed and cancelled are the closed stages.
    openModelUq: uniqueIndex('development_project_open_model_uq')
      .on(t.workspaceId, t.modelId)
      .where(sql`${t.stage} not in ('completed','cancelled')`),
    modelIdx: index('development_project_model_idx').on(t.workspaceId, t.modelId),
    stageIdx: index('development_project_stage_idx').on(t.workspaceId, t.stage),
    kindCheck: check('development_project_kind_check', sql`${t.kind} in ${sql.raw(PROJECT_KINDS)}`),
    stageCheck: check('development_project_stage_check', sql`${t.stage} in ${sql.raw(STAGES)}`),
    versionCheck: check('development_project_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

/** Append-only history of a project: the runtime role holds INSERT and never UPDATE or DELETE (guarded by the migration). */
export const developmentEvents = logLifecycleSchema.table(
  'development_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid('project_id').notNull(),
    /** 1..n per project without gaps, allocated under the project row lock. */
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(),
    before: jsonb('before').notNull().default(sql`'{}'::jsonb`),
    after: jsonb('after').notNull().default(sql`'{}'::jsonb`),
    reason: text('reason'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectFk: foreignKey({
      name: 'development_event_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [developmentProjects.workspaceId, developmentProjects.id],
    }).onDelete('restrict'),
    seqUq: unique('development_event_project_seq_uq').on(t.workspaceId, t.projectId, t.seq),
    seqCheck: check('development_event_seq_check', sql`${t.seq} >= 1`),
    kindCheck: check('development_event_kind_check', sql`${t.kind} in ${sql.raw(EVENT_KINDS)}`),
    beforeCheck: check('development_event_before_check', sql`jsonb_typeof(${t.before}) = 'object'`),
    afterCheck: check('development_event_after_check', sql`jsonb_typeof(${t.after}) = 'object'`),
    reasonCheck: check(
      'development_event_reason_check',
      sql`coalesce(char_length(${t.reason}), 0) <= ${sql.raw(String(REASON_MAX))}`,
    ),
  }),
);

export const validationRounds = logLifecycleSchema.table(
  'validation_round',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    projectId: uuid('project_id').notNull(),
    /** 1..n per project without gaps, allocated under the project row lock. */
    seq: integer('seq').notNull(),
    /** The project's stage when the round opened. */
    stage: text('stage').notNull(),
    status: text('status').notNull().default('open'),
    /** `{ files: [{ fileRef, order, sha256 }], sourceOwner }`; immutable from insert (guard trigger). */
    sampleSet: jsonb('sample_set').notNull(),
    sampleManifestDigest: text('sample_manifest_digest').notNull(),
    /** `{ revisionId, changeSetDigest }` or null (no published revision); immutable from insert. */
    specPin: jsonb('spec_pin'),
    note: text('note'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('validation_round_workspace_id_id_uq').on(t.workspaceId, t.id),
    projectFk: foreignKey({
      name: 'validation_round_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [developmentProjects.workspaceId, developmentProjects.id],
    }).onDelete('restrict'),
    seqUq: unique('validation_round_project_seq_uq').on(t.workspaceId, t.projectId, t.seq),
    // At most one open round per project.
    openProjectUq: uniqueIndex('validation_round_open_project_uq')
      .on(t.workspaceId, t.projectId)
      .where(sql`${t.status} = 'open'`),
    projectIdx: index('validation_round_project_idx').on(t.workspaceId, t.projectId, t.seq),
    seqCheck: check('validation_round_seq_check', sql`${t.seq} >= 1`),
    stageCheck: check('validation_round_stage_check', sql`${t.stage} in ${sql.raw(OPEN_STAGES)}`),
    statusCheck: check('validation_round_status_check', sql`${t.status} in ${sql.raw(ROUND_STATUSES)}`),
    sampleSetCheck: check('validation_round_sample_set_check', sql`jsonb_typeof(${t.sampleSet}) = 'object'`),
    digestCheck: check('validation_round_digest_check', sql`${t.sampleManifestDigest} ~ '^[0-9a-f]{64}$'`),
    specPinCheck: check(
      'validation_round_spec_pin_check',
      sql`${t.specPin} is null or jsonb_typeof(${t.specPin}) = 'object'`,
    ),
    noteCheck: check(
      'validation_round_note_check',
      sql`coalesce(char_length(${t.note}), 0) <= ${sql.raw(String(NOTE_MAX))}`,
    ),
    versionCheck: check('validation_round_row_version_check', sql`${t.rowVersion} >= 1`),
    closedCheck: check(
      'validation_round_closed_check',
      sql`(${t.status} = 'closed') = (${t.closedAt} is not null and ${t.closedBy} is not null)`,
    ),
  }),
);

// Validation request queue (#1445 node d, design §3, ADR-0117). A request belongs to one round (round_id required); the
// round's sample_set is immutable from insert (round_guard), so a request always reads the samples it was made for.
// The runtime role holds INSERT + a column-limited UPDATE on request and attempt, INSERT only on rule results and
// excerpts (no UPDATE, no DELETE anywhere).
const REQUEST_STATES = "('queued','claimed','succeeded','failed','cancelled','expired')";
const ATTEMPT_OUTCOMES = "('running','succeeded','failed','lease_expired')";
const VERDICT_VALUES = "('pass','fail','incomplete')";
const RULE_RESULT_VALUES = "('PASS','FAIL','WARN','NOT_CHECKED','SKIPPED','NOT_APPLICABLE','ERROR')";

export const executionRequests = logLifecycleSchema.table(
  'execution_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** The request subject (ADR-0117 amendment, #1479): exactly one of `roundId` and `suiteRunItemId` is set. */
    roundId: uuid('round_id'),
    /** A suite run item of log-datasets: a plain uuid, no cross-schema FK (module boundary); one request per item. */
    suiteRunItemId: uuid('suite_run_item_id'),
    /** The suite run the item belongs to (same lifetime as the item): the unit of the per-user run cap and of the excerpt retention clock. */
    suiteRunId: uuid('suite_run_id'),
    /** A suite subject's sample list, resolved and pinned when the request is registered (the claim response reads it from here; lifecycle never reads log-datasets). */
    subjectSampleSet: jsonb('subject_sample_set'),
    subjectSampleManifestDigest: text('subject_sample_manifest_digest'),
    /** 0..2, a higher number is claimed first. */
    priority: integer('priority').notNull(),
    immediate: boolean('immediate').notNull().default(false),
    state: text('state').notNull().default('queued'),
    /** sha256 of the canonical {roundId, sampleManifestDigest, engineProfileRef}. */
    requestDigest: text('request_digest').notNull(),
    engineProfileRef: text('engine_profile_ref'),
    requestedByActorId: uuid('requested_by_actor_id')
      .notNull()
      .references(() => actors.id),
    idempotencyKey: text('idempotency_key').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    notBefore: timestamp('not_before', { withTimezone: true }),
    claimedByActorId: uuid('claimed_by_actor_id').references(() => actors.id),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({
    workspaceIdUq: unique('execution_request_workspace_id_id_uq').on(t.workspaceId, t.id),
    roundFk: foreignKey({
      name: 'execution_request_round_fk',
      columns: [t.workspaceId, t.roundId],
      foreignColumns: [validationRounds.workspaceId, validationRounds.id],
    }).onDelete('restrict'),
    idempotencyUq: unique('execution_request_idempotency_uq').on(t.workspaceId, t.requestedByActorId, t.idempotencyKey),
    claimIdx: index('execution_request_claim_idx').on(t.workspaceId, t.state, t.priority, t.createdAt),
    roundIdx: index('execution_request_round_idx').on(t.workspaceId, t.roundId),
    suiteItemUq: uniqueIndex('execution_request_suite_item_uq')
      .on(t.workspaceId, t.suiteRunItemId)
      .where(sql`${t.suiteRunItemId} is not null`),
    suiteRunIdx: index('execution_request_suite_run_idx')
      .on(t.workspaceId, t.suiteRunId, t.state)
      .where(sql`${t.suiteRunId} is not null`),
    // The subject is a Round XOR a suite run item; a suite subject carries its run and its pinned sample list, a Round one carries neither.
    subjectCheck: check(
      'execution_request_subject_check',
      sql`(${t.roundId} is not null) <> (${t.suiteRunItemId} is not null) and (${t.suiteRunItemId} is not null) = (${t.suiteRunId} is not null) and (${t.suiteRunItemId} is not null) = (${t.subjectSampleSet} is not null) and (${t.suiteRunItemId} is not null) = (${t.subjectSampleManifestDigest} is not null)`,
    ),
    subjectDigestCheck: check(
      'execution_request_subject_digest_check',
      sql`${t.subjectSampleManifestDigest} is null or ${t.subjectSampleManifestDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    stateCheck: check('execution_request_state_check', sql`${t.state} in ${sql.raw(REQUEST_STATES)}`),
    priorityCheck: check('execution_request_priority_check', sql`${t.priority} between 0 and 2`),
    attemptsCheck: check(
      'execution_request_attempts_check',
      sql`${t.maxAttempts} between 1 and 10 and ${t.attemptCount} between 0 and ${t.maxAttempts}`,
    ),
    digestCheck: check('execution_request_digest_check', sql`${t.requestDigest} ~ '^[0-9a-f]{64}$'`),
    profileCheck: check(
      'execution_request_profile_check',
      sql`coalesce(char_length(${t.engineProfileRef}), 0) <= 200 and coalesce(char_length(${t.cancelReason}), 0) <= ${sql.raw(String(REASON_MAX))}`,
    ),
    versionCheck: check('execution_request_row_version_check', sql`${t.rowVersion} >= 1`),
    // A claimed request carries its lease; every other state carries none.
    leaseCheck: check(
      'execution_request_lease_check',
      sql`(${t.state} = 'claimed') = (${t.claimedByActorId} is not null and ${t.leaseExpiresAt} is not null)`,
    ),
  }),
);

export const executionAttempts = logLifecycleSchema.table(
  'execution_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    requestId: uuid('request_id').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    workerActorId: uuid('worker_actor_id')
      .notNull()
      .references(() => actors.id),
    /** The API token the claim came in with (core.api_tokens, plain uuid: no cross-schema FK). */
    tokenId: uuid('token_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    outcome: text('outcome').notNull().default('running'),
    executorVersion: text('executor_version'),
    executorDigest: text('executor_digest'),
    ruleSetRevision: text('rule_set_revision'),
    inputManifestDigest: text('input_manifest_digest').notNull(),
    resultDigest: text('result_digest'),
    verdict: text('verdict'),
    /** The worker's own summary, kept for reference; the verdict never reads it. */
    workerSummary: jsonb('worker_summary'),
  },
  (t) => ({
    workspaceIdUq: unique('execution_attempt_workspace_id_id_uq').on(t.workspaceId, t.id),
    requestFk: foreignKey({
      name: 'execution_attempt_request_fk',
      columns: [t.workspaceId, t.requestId],
      foreignColumns: [executionRequests.workspaceId, executionRequests.id],
    }).onDelete('restrict'),
    attemptNoUq: unique('execution_attempt_request_no_uq').on(t.requestId, t.attemptNo),
    outcomeCheck: check('execution_attempt_outcome_check', sql`${t.outcome} in ${sql.raw(ATTEMPT_OUTCOMES)}`),
    verdictCheck: check('execution_attempt_verdict_check', sql`${t.verdict} is null or ${t.verdict} in ${sql.raw(VERDICT_VALUES)}`),
    noCheck: check('execution_attempt_no_check', sql`${t.attemptNo} >= 1`),
    digestCheck: check(
      'execution_attempt_digest_check',
      sql`${t.inputManifestDigest} ~ '^[0-9a-f]{64}$' and (${t.resultDigest} is null or ${t.resultDigest} ~ '^[0-9a-f]{64}$')`,
    ),
    summaryCheck: check(
      'execution_attempt_summary_check',
      sql`${t.workerSummary} is null or jsonb_typeof(${t.workerSummary}) = 'object'`,
    ),
    // Verdict and result digest exist exactly when the attempt succeeded.
    resultCheck: check(
      'execution_attempt_result_check',
      sql`(${t.outcome} = 'succeeded') = (${t.verdict} is not null and ${t.resultDigest} is not null)`,
    ),
    requestIdx: index('execution_attempt_request_idx').on(t.workspaceId, t.requestId, t.attemptNo),
  }),
);

export const ruleResults = logLifecycleSchema.table(
  'rule_result',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    attemptId: uuid('attempt_id').notNull(),
    ruleId: text('rule_id').notNull(),
    result: text('result').notNull(),
    required: boolean('required').notNull(),
    expected: text('expected'),
    observed: text('observed'),
    /** `[{ fileRef, line, fileSha256, hasExcerpt }]`, at most 20; the excerpt bodies live in rule_result_excerpt. */
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
  },
  (t) => ({
    workspaceIdUq: unique('rule_result_workspace_id_id_uq').on(t.workspaceId, t.id),
    attemptFk: foreignKey({
      name: 'rule_result_attempt_fk',
      columns: [t.workspaceId, t.attemptId],
      foreignColumns: [executionAttempts.workspaceId, executionAttempts.id],
    }).onDelete('restrict'),
    ruleUq: unique('rule_result_attempt_rule_uq').on(t.attemptId, t.ruleId),
    resultCheck: check('rule_result_result_check', sql`${t.result} in ${sql.raw(RULE_RESULT_VALUES)}`),
    textCheck: check(
      'rule_result_text_check',
      sql`char_length(${t.ruleId}) between 1 and 200 and coalesce(char_length(${t.expected}), 0) <= 500 and coalesce(char_length(${t.observed}), 0) <= 500`,
    ),
    evidenceCheck: check(
      'rule_result_evidence_check',
      sql`jsonb_typeof(${t.evidence}) = 'array' and jsonb_array_length(${t.evidence}) <= 20`,
    ),
  }),
);

/**
 * Normalized evidence locations of a rule result (#1470, log-explorer D4): one row per distinct `(file_ref, line, file_sha256)` of the
 * result's `evidence` array, written in the same transaction as the result. Location only, never log text. Insert-only for the runtime role.
 */
export const ruleResultEvidence = logLifecycleSchema.table(
  'rule_result_evidence',
  {
    ruleResultId: uuid('rule_result_id').notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    fileRef: text('file_ref').notNull(),
    line: bigint('line', { mode: 'number' }).notNull(),
    fileSha256: text('file_sha256').notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: 'rule_result_evidence_pk', columns: [t.ruleResultId, t.fileRef, t.line, t.fileSha256] }),
    ruleResultFk: foreignKey({
      name: 'rule_result_evidence_rule_result_fk',
      columns: [t.workspaceId, t.ruleResultId],
      foreignColumns: [ruleResults.workspaceId, ruleResults.id],
    }).onDelete('restrict'),
    reverseIdx: index('rule_result_evidence_reverse_idx').on(t.workspaceId, t.fileRef, t.line, t.fileSha256),
    lineCheck: check('rule_result_evidence_line_check', sql`${t.line} >= 1`),
    shaCheck: check('rule_result_evidence_sha_check', sql`${t.fileSha256} ~ '^[0-9a-f]{64}$'`),
    refCheck: check('rule_result_evidence_ref_check', sql`char_length(${t.fileRef}) between 1 and 1024`),
  }),
);

/** The log excerpt bodies, apart from rule_result: never in a list response, audit row, notification or export. */
export const ruleResultExcerpts = logLifecycleSchema.table(
  'rule_result_excerpt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    ruleResultId: uuid('rule_result_id').notNull(),
    evidenceIndex: integer('evidence_index').notNull(),
    excerpt: text('excerpt').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** Why the body was erased: `retention` (the purge job) or the administrator's reason. Set with `deleted_at`, never text of the log. */
    deletedReason: text('deleted_reason'),
  },
  (t) => ({
    ruleResultFk: foreignKey({
      name: 'rule_result_excerpt_rule_result_fk',
      columns: [t.workspaceId, t.ruleResultId],
      foreignColumns: [ruleResults.workspaceId, ruleResults.id],
    }).onDelete('restrict'),
    indexUq: unique('rule_result_excerpt_index_uq').on(t.ruleResultId, t.evidenceIndex),
    indexCheck: check('rule_result_excerpt_index_check', sql`${t.evidenceIndex} between 0 and 19`),
    // A live row holds 1..2000 characters; an erased row (deleted_at set) holds an empty body (ADR-0117 decision 7).
    lengthCheck: check(
      'rule_result_excerpt_length_check',
      sql`(${t.deletedAt} is null and char_length(${t.excerpt}) between 1 and 2000) or (${t.deletedAt} is not null and ${t.excerpt} = '')`,
    ),
    reasonCheck: check(
      'rule_result_excerpt_reason_check',
      sql`coalesce(char_length(${t.deletedReason}), 0) <= 2000 and (${t.deletedReason} is null or ${t.deletedAt} is not null)`,
    ),
  }),
);

/** Workspace queue settings (one row per workspace; a missing row resolves to the documented defaults). */
export const queueSettings = logLifecycleSchema.table(
  'queue_settings',
  {
    workspaceId: uuid('workspace_id')
      .primaryKey()
      .references(() => workspaces.id),
    runWindow: jsonb('run_window').notNull(),
    leaseSeconds: integer('lease_seconds').notNull().default(300),
    immediateLimit: integer('immediate_limit').notNull().default(5),
    excerptRetentionDays: integer('excerpt_retention_days').notNull().default(90),
    /** The in-house opinion scale (#1778, ADR-0117 amendment 2): `{ grades: [{ key, label }], marks: [{ key, label }] }`, array order = display order. */
    opinionScale: jsonb('opinion_scale').notNull().default(sql`'{"grades":[],"marks":[]}'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    windowCheck: check('queue_settings_run_window_check', sql`jsonb_typeof(${t.runWindow}) = 'object'`),
    leaseCheck: check('queue_settings_lease_check', sql`${t.leaseSeconds} between 30 and 3600`),
    limitCheck: check('queue_settings_immediate_limit_check', sql`${t.immediateLimit} between 0 and 50`),
    retentionCheck: check('queue_settings_retention_check', sql`${t.excerptRetentionDays} between 1 and 3650`),
    opinionScaleCheck: check(
      'queue_settings_opinion_scale_check',
      sql`jsonb_typeof(${t.opinionScale}) = 'object' and jsonb_typeof(${t.opinionScale} -> 'grades') = 'array' and jsonb_typeof(${t.opinionScale} -> 'marks') = 'array' and jsonb_array_length(${t.opinionScale} -> 'grades') <= 12 and jsonb_array_length(${t.opinionScale} -> 'marks') <= 12`,
    ),
  }),
);

/**
 * Opinions on the items of a succeeded attempt (#1778, ADR-0117 amendment 2): append-only, on their own axis. Not one-to-one with a
 * rule result (`rule_result_id` is set only when the same attempt has a rule result with `rule_id = item_key`). Nothing that computes
 * a verdict, a Gate decision or a regression comparison reads this table. Notes are untrusted text, capped per row and per attempt.
 */
export const attemptOpinions = logLifecycleSchema.table(
  'attempt_opinion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    attemptId: uuid('attempt_id').notNull(),
    itemKey: text('item_key').notNull(),
    ruleResultId: uuid('rule_result_id'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    /** The API token the write came in with (core.api_tokens, plain uuid: no cross-schema FK). */
    tokenId: uuid('token_id'),
    submissionId: text('submission_id').notNull(),
    grade: text('grade').notNull(),
    mark: text('mark'),
    note: text('note'),
    /** `[{ fileRef, line, fileSha256 }]`, at most 20; locations only. */
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    inputRevision: text('input_revision'),
    producer: text('producer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    attemptFk: foreignKey({
      name: 'attempt_opinion_attempt_fk',
      columns: [t.workspaceId, t.attemptId],
      foreignColumns: [executionAttempts.workspaceId, executionAttempts.id],
    }).onDelete('restrict'),
    ruleResultFk: foreignKey({
      name: 'attempt_opinion_rule_result_fk',
      columns: [t.workspaceId, t.ruleResultId],
      foreignColumns: [ruleResults.workspaceId, ruleResults.id],
    }).onDelete('restrict'),
    submissionUq: unique('attempt_opinion_submission_uq').on(t.attemptId, t.actorId, t.submissionId, t.itemKey),
    itemIdx: index('attempt_opinion_item_idx').on(t.workspaceId, t.attemptId, t.itemKey, t.createdAt.desc(), t.id.desc()),
    ruleResultIdx: index('attempt_opinion_rule_result_idx').on(t.ruleResultId).where(sql`${t.ruleResultId} is not null`),
    gradeCheck: check('attempt_opinion_grade_check', sql`${t.grade} ~ '^[a-z0-9_-]{1,32}$' and (${t.mark} is null or ${t.mark} ~ '^[a-z0-9_-]{1,32}$')`),
    textCheck: check(
      'attempt_opinion_text_check',
      sql`char_length(${t.itemKey}) between 1 and 200 and char_length(${t.submissionId}) between 1 and 200 and coalesce(char_length(${t.note}), 0) <= 1000 and coalesce(char_length(${t.inputRevision}), 0) <= 200 and coalesce(char_length(${t.producer}), 0) <= 200`,
    ),
    evidenceCheck: check('attempt_opinion_evidence_check', sql`jsonb_typeof(${t.evidence}) = 'array' and jsonb_array_length(${t.evidence}) <= 20`),
  }),
);

/** Who may read the excerpt bodies of a source (`sample_set.sourceOwner`): the right `lifecycle.excerpt.read`, per source owner. */
export const excerptReaders = logLifecycleSchema.table(
  'excerpt_reader',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceOwner: text('source_owner').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => actors.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    /** Set when the access is withdrawn; a later grant clears it. The row is never deleted. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    pk: unique('excerpt_reader_uq').on(t.workspaceId, t.sourceOwner, t.actorId),
    ownerCheck: check('excerpt_reader_owner_check', sql`char_length(${t.sourceOwner}) between 1 and 200`),
  }),
);

// Gate decision (#1446 node e, design §3): the human business approval of a stage, append-only (a DB trigger refuses
// UPDATE and DELETE for every role). `basis` freezes the evidence the decider saw; `self_approved` is stored, not derived
// later (requester of the latest 검증 요청 of the Round = decider; the Round's opener when it has no request).
const GATE_DECISIONS = "('approved','rejected','exception')";
const GATE_TARGET_STAGES = "('kickoff','alpha','beta','completed')";

export const gateDecisions = logLifecycleSchema.table(
  'gate_decision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    roundId: uuid('round_id').notNull(),
    /** The project's stage when the decision was taken. */
    fromStage: text('from_stage').notNull(),
    targetStage: text('target_stage').notNull(),
    decision: text('decision').notNull(),
    basis: jsonb('basis').notNull(),
    reason: text('reason').notNull(),
    /** `{ riskAcceptedBy, scope, until? }`, only when decision = 'exception'. */
    exception: jsonb('exception'),
    selfApproved: boolean('self_approved').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roundFk: foreignKey({
      name: 'gate_decision_round_fk',
      columns: [t.workspaceId, t.roundId],
      foreignColumns: [validationRounds.workspaceId, validationRounds.id],
    }).onDelete('restrict'),
    roundIdx: index('gate_decision_round_idx').on(t.workspaceId, t.roundId, t.at),
    decisionCheck: check('gate_decision_decision_check', sql`${t.decision} in ${sql.raw(GATE_DECISIONS)}`),
    stageCheck: check(
      'gate_decision_stage_check',
      sql`${t.targetStage} in ${sql.raw(GATE_TARGET_STAGES)} and ${t.fromStage} in ${sql.raw(OPEN_STAGES)}`,
    ),
    basisCheck: check('gate_decision_basis_check', sql`jsonb_typeof(${t.basis}) = 'object'`),
    reasonCheck: check(
      'gate_decision_reason_check',
      sql`char_length(${t.reason}) between 1 and ${sql.raw(String(REASON_MAX))}`,
    ),
    exceptionCheck: check(
      'gate_decision_exception_check',
      sql`(${t.decision} = 'exception') = (${t.exception} is not null) and (${t.exception} is null or jsonb_typeof(${t.exception}) = 'object')`,
    ),
  }),
);

// Evidence locations handed to a round (#1474 X-h, lead decision 2026-11-08): a body-free pointer `(file_ref, line,
// file_sha256)` with the status the round judged on receipt. Append-only (trigger + no UPDATE/DELETE grant); `seq` is
// 1..n per round without gaps, allocated under the round row lock. The same triple is stored once per round.
const EVIDENCE_REF_STATUSES = "('match','hash_mismatch','unresolved')";
export const roundEvidenceRefs = logLifecycleSchema.table(
  'round_evidence_ref',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    roundId: uuid('round_id').notNull(),
    seq: integer('seq').notNull(),
    fileRef: text('file_ref').notNull(),
    line: bigint('line', { mode: 'number' }).notNull(),
    fileSha256: text('file_sha256').notNull(),
    note: text('note'),
    status: text('status').notNull(),
    originKind: text('origin_kind').notNull(),
    originId: uuid('origin_id').notNull(),
    handedOffBy: uuid('handed_off_by')
      .notNull()
      .references(() => actors.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roundFk: foreignKey({
      name: 'round_evidence_ref_round_fk',
      columns: [t.workspaceId, t.roundId],
      foreignColumns: [validationRounds.workspaceId, validationRounds.id],
    }).onDelete('restrict'),
    seqUq: unique('round_evidence_ref_round_seq_uq').on(t.workspaceId, t.roundId, t.seq),
    tripleUq: unique('round_evidence_ref_round_triple_uq').on(t.workspaceId, t.roundId, t.fileRef, t.line, t.fileSha256),
    seqCheck: check('round_evidence_ref_seq_check', sql`${t.seq} between 1 and 1000`),
    fileRefCheck: check('round_evidence_ref_file_ref_check', sql`char_length(${t.fileRef}) between 1 and 1024`),
    lineCheck: check('round_evidence_ref_line_check', sql`${t.line} >= 1`),
    shaCheck: check('round_evidence_ref_sha_check', sql`${t.fileSha256} ~ '^[0-9a-f]{64}$'`),
    noteCheck: check('round_evidence_ref_note_check', sql`coalesce(char_length(${t.note}), 0) <= 500`),
    statusCheck: check('round_evidence_ref_status_check', sql`${t.status} in ${sql.raw(EVIDENCE_REF_STATUSES)}`),
    originCheck: check('round_evidence_ref_origin_check', sql`${t.originKind} in ('log_explorer')`),
  }),
);
