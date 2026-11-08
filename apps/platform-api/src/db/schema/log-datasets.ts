import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';

// Log test datasets (#1477 node D-a, design docs/design/features/log-test-datasets/README.md §3, ADR-0120): a named
// dataset, its immutable revisions and the candidates that become datasets. `model_ids` are log-knowledge stable ids and
// `source_ref.roundId` a log-lifecycle id: plain uuids, no cross-schema FK (module boundary). Every reference inside the
// schema is a composite same-workspace FK (ON DELETE RESTRICT); actor columns are plain FKs to core.actors, so the write
// path checks workspace membership where it matters. Baselines (node b, #1478) are below; suites and runs arrive with nodes c–d.
export const logDatasetsSchema = pgSchema('log_datasets');

const NAME_MAX = 200;
const PURPOSE_MAX = 2000;
const NOTE_MAX = 2000;
const SHARE_SCOPES = "('private','workspace')";
const DATASET_STATUSES = "('active','archived')";
const CANDIDATE_ORIGINS = "('manual','round_evidence')";
const CANDIDATE_STATUSES = "('draft','approved','rejected')";
const SCENARIO_TAGS = "'normal','exception','boundary','regression','file_boundary','carryover','partial_support'";

export const datasets = logDatasetsSchema.table(
  'dataset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    purpose: text('purpose').notNull().default(''),
    ownerActorId: uuid('owner_actor_id')
      .notNull()
      .references(() => actors.id),
    shareScope: text('share_scope').notNull().default('private'),
    /** log-knowledge model ids; empty = independent of any model. No FK. */
    modelIds: uuid('model_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** Closed set `SCENARIO_TAGS`. */
    scenarioTags: text('scenario_tags').array().notNull().default(sql`'{}'::text[]`),
    status: text('status').notNull().default('active'),
    /** A fixture dataset (never shown as an operational result). */
    synthetic: boolean('synthetic').notNull().default(false),
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
    workspaceIdUq: unique('dataset_workspace_id_id_uq').on(t.workspaceId, t.id),
    listIdx: index('dataset_workspace_status_idx').on(t.workspaceId, t.status, t.updatedAt),
    nameCheck: check('dataset_name_check', sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX))}`),
    purposeCheck: check('dataset_purpose_check', sql`char_length(${t.purpose}) <= ${sql.raw(String(PURPOSE_MAX))}`),
    shareCheck: check('dataset_share_scope_check', sql`${t.shareScope} in ${sql.raw(SHARE_SCOPES)}`),
    statusCheck: check('dataset_status_check', sql`${t.status} in ${sql.raw(DATASET_STATUSES)}`),
    tagsCheck: check(
      'dataset_scenario_tags_check',
      sql`${t.scenarioTags} <@ array[${sql.raw(SCENARIO_TAGS)}]::text[]`,
    ),
    versionCheck: check('dataset_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const datasetRevisions = logDatasetsSchema.table(
  'dataset_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    datasetId: uuid('dataset_id').notNull(),
    /** 1..n per dataset without gaps, allocated under the dataset row lock. */
    seq: integer('seq').notNull(),
    /** `{ files: [{ fileRef, order, sha256 }], sourceOwner }` — the lifecycle shape; immutable. */
    sampleSet: jsonb('sample_set').notNull(),
    sampleManifestDigest: text('sample_manifest_digest').notNull(),
    /** Confirmed encoding / format only; never a guess. */
    inputMeta: jsonb('input_meta').notNull().default(sql`'{}'::jsonb`),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('dataset_revision_workspace_id_id_uq').on(t.workspaceId, t.id),
    datasetFk: foreignKey({
      name: 'dataset_revision_dataset_fk',
      columns: [t.workspaceId, t.datasetId],
      foreignColumns: [datasets.workspaceId, datasets.id],
    }).onDelete('restrict'),
    seqUq: unique('dataset_revision_dataset_seq_uq').on(t.workspaceId, t.datasetId, t.seq),
    // The same content twice in one dataset is refused; another dataset may hold it.
    digestUq: uniqueIndex('dataset_revision_dataset_digest_uq').on(t.workspaceId, t.datasetId, t.sampleManifestDigest),
    seqCheck: check('dataset_revision_seq_check', sql`${t.seq} >= 1`),
    sampleSetCheck: check('dataset_revision_sample_set_check', sql`jsonb_typeof(${t.sampleSet}) = 'object'`),
    digestCheck: check('dataset_revision_digest_check', sql`${t.sampleManifestDigest} ~ '^[0-9a-f]{64}$'`),
    inputMetaCheck: check('dataset_revision_input_meta_check', sql`jsonb_typeof(${t.inputMeta}) = 'object'`),
    noteCheck: check(
      'dataset_revision_note_check',
      sql`coalesce(char_length(${t.note}), 0) <= ${sql.raw(String(NOTE_MAX))}`,
    ),
  }),
);

export const datasetCandidates = logDatasetsSchema.table(
  'dataset_candidate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    origin: text('origin').notNull(),
    /** `{ roundId?, evidenceRefs: EvidenceRef[] }`: pointers only, never a line body. */
    sourceRef: jsonb('source_ref').notNull().default(sql`'{}'::jsonb`),
    /** What approval creates: `{ name, purpose, modelIds, scenarioTags, sampleSet, inputMeta, note }` — data references only. */
    proposal: jsonb('proposal').notNull(),
    proposedBy: uuid('proposed_by')
      .notNull()
      .references(() => actors.id),
    status: text('status').notNull().default('draft'),
    reviewerActorId: uuid('reviewer_actor_id').references(() => actors.id),
    reason: text('reason'),
    /** Set on approval: the dataset it created. */
    datasetId: uuid('dataset_id'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => ({
    workspaceIdUq: unique('dataset_candidate_workspace_id_id_uq').on(t.workspaceId, t.id),
    datasetFk: foreignKey({
      name: 'dataset_candidate_dataset_fk',
      columns: [t.workspaceId, t.datasetId],
      foreignColumns: [datasets.workspaceId, datasets.id],
    }).onDelete('restrict'),
    statusIdx: index('dataset_candidate_status_idx').on(t.workspaceId, t.status, t.createdAt),
    originCheck: check('dataset_candidate_origin_check', sql`${t.origin} in ${sql.raw(CANDIDATE_ORIGINS)}`),
    statusCheck: check('dataset_candidate_status_check', sql`${t.status} in ${sql.raw(CANDIDATE_STATUSES)}`),
    sourceRefCheck: check('dataset_candidate_source_ref_check', sql`jsonb_typeof(${t.sourceRef}) = 'object'`),
    proposalCheck: check('dataset_candidate_proposal_check', sql`jsonb_typeof(${t.proposal}) = 'object'`),
    reasonCheck: check(
      'dataset_candidate_reason_check',
      sql`coalesce(char_length(${t.reason}), 0) <= ${sql.raw(String(NOTE_MAX))}`,
    ),
    versionCheck: check('dataset_candidate_row_version_check', sql`${t.rowVersion} >= 1`),
    decidedCheck: check(
      'dataset_candidate_decided_check',
      sql`(${t.status} = 'draft') = (${t.decidedAt} is null and ${t.reviewerActorId} is null)`,
    ),
  }),
);

const BASELINE_STATUSES = "('draft','approved','superseded')";
const REASON_MAX = 2000;

// Expected baseline of one dataset revision (#1478 node b, design §3.3): the human-approved expectation per rule. Not the metric
// Baseline of the glossary. `seq` is 1..n per revision. A draft is editable; `approved` and `superseded` are immutable (guard
// trigger). At most one `approved` per revision (partial unique index). `expectations` is validated in the app (the vocabulary
// PASS·FAIL·WARN·NOT_APPLICABLE·EXPECTED_UNSUPPORTED); the database holds the shape (arrays/objects, size).
export const expectedBaselines = logDatasetsSchema.table(
  'expected_baseline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    datasetRevisionId: uuid('dataset_revision_id').notNull(),
    seq: integer('seq').notNull(),
    status: text('status').notNull().default('draft'),
    /** `{ specPin?, ruleSetRevision?, parserVersion?, engineProfileRef? }` — only what is known; no key = unknown. */
    profilePin: jsonb('profile_pin').notNull().default(sql`'{}'::jsonb`),
    /** `rule_id[]` the baseline decided to check. */
    expectedScope: jsonb('expected_scope').notNull().default(sql`'[]'::jsonb`),
    /** `{ ruleId, expected, exception?, evidence? }[]`. */
    expectations: jsonb('expectations').notNull().default(sql`'[]'::jsonb`),
    /** Location + digest of an externally owned parser golden; never its content. */
    parserGoldenRef: jsonb('parser_golden_ref'),
    authorActorId: uuid('author_actor_id')
      .notNull()
      .references(() => actors.id),
    approvedByActorId: uuid('approved_by_actor_id').references(() => actors.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdUq: unique('expected_baseline_workspace_id_id_uq').on(t.workspaceId, t.id),
    revisionFk: foreignKey({
      name: 'expected_baseline_revision_fk',
      columns: [t.workspaceId, t.datasetRevisionId],
      foreignColumns: [datasetRevisions.workspaceId, datasetRevisions.id],
    }).onDelete('restrict'),
    seqUq: unique('expected_baseline_revision_seq_uq').on(t.workspaceId, t.datasetRevisionId, t.seq),
    oneApprovedUq: uniqueIndex('expected_baseline_one_approved_uq')
      .on(t.workspaceId, t.datasetRevisionId)
      .where(sql`${t.status} = 'approved'`),
    statusCheck: check('expected_baseline_status_check', sql`${t.status} in ${sql.raw(BASELINE_STATUSES)}`),
    seqCheck: check('expected_baseline_seq_check', sql`${t.seq} >= 1`),
    profilePinCheck: check('expected_baseline_profile_pin_check', sql`jsonb_typeof(${t.profilePin}) = 'object'`),
    scopeCheck: check('expected_baseline_scope_check', sql`jsonb_typeof(${t.expectedScope}) = 'array'`),
    expectationsCheck: check('expected_baseline_expectations_check', sql`jsonb_typeof(${t.expectations}) = 'array'`),
    goldenCheck: check(
      'expected_baseline_golden_check',
      sql`${t.parserGoldenRef} is null or jsonb_typeof(${t.parserGoldenRef}) = 'object'`,
    ),
    versionCheck: check('expected_baseline_row_version_check', sql`${t.rowVersion} >= 1`),
    approvedCheck: check(
      'expected_baseline_approved_check',
      sql`(${t.status} = 'draft') = (${t.approvedAt} is null and ${t.approvedByActorId} is null)`,
    ),
    supersededCheck: check(
      'expected_baseline_superseded_check',
      sql`(${t.status} = 'superseded') = (${t.supersededAt} is not null)`,
    ),
  }),
);

// Append-only history of a baseline's state changes (design §3.3): one row per create / update / approve / supersede, written in
// the same transaction as the change. `before` / `after` are status + seq + counts + digest (never the expectation bodies' notes);
// no UPDATE and no DELETE for any role (trigger).
export const baselineEvents = logDatasetsSchema.table(
  'baseline_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    baselineId: uuid('baseline_id').notNull(),
    kind: text('kind').notNull(),
    before: jsonb('before'),
    after: jsonb('after').notNull(),
    reason: text('reason'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    selfApproved: boolean('self_approved').notNull().default(false),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    baselineFk: foreignKey({
      name: 'baseline_event_baseline_fk',
      columns: [t.workspaceId, t.baselineId],
      foreignColumns: [expectedBaselines.workspaceId, expectedBaselines.id],
    }).onDelete('restrict'),
    baselineIdx: index('baseline_event_baseline_idx').on(t.workspaceId, t.baselineId, t.at),
    kindCheck: check('baseline_event_kind_check', sql`${t.kind} in ('created','updated','approved','superseded')`),
    beforeCheck: check('baseline_event_before_check', sql`${t.before} is null or jsonb_typeof(${t.before}) = 'object'`),
    afterCheck: check('baseline_event_after_check', sql`jsonb_typeof(${t.after}) = 'object'`),
    reasonCheck: check(
      'baseline_event_reason_check',
      sql`coalesce(char_length(${t.reason}), 0) <= ${sql.raw(String(REASON_MAX))}`,
    ),
  }),
);

// Regression suites and their runs (#1479 node c, design §3.5, ADR-0120): a suite is a named list of dataset items with a fixed
// execution profile; a run pins, at request time, the revision, baseline and digests every item resolved to. A suite run has NO stored
// state: it is derived from the states of its items' requests in log-lifecycle (`execution_request`, read through the lifecycle port).
// `suite_run` and `suite_run_item` are immutable (trigger, every role). `request_id` is a log-lifecycle id: a plain uuid, no cross-schema FK.
const SUITE_ITEMS_MAX = 20;

export const regressionSuites = logDatasetsSchema.table(
  'regression_suite',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    /** `{ datasetId, datasetRevisionId?, baselineId? }[]` in the user's order; an omitted revision is resolved (and pinned) at run time. */
    items: jsonb('items').notNull(),
    engineProfileRef: text('engine_profile_ref'),
    /** The pins a run requires of its baselines (known keys only, as `expected_baseline.profile_pin`). */
    requiredPin: jsonb('required_pin').notNull().default(sql`'{}'::jsonb`),
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
    workspaceIdUq: unique('regression_suite_workspace_id_id_uq').on(t.workspaceId, t.id),
    nameIdx: index('regression_suite_name_idx').on(t.workspaceId, t.name),
    nameCheck: check('regression_suite_name_check', sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX))}`),
    itemsCheck: check(
      'regression_suite_items_check',
      sql`jsonb_typeof(${t.items}) = 'array' and jsonb_array_length(${t.items}) between 1 and ${sql.raw(String(SUITE_ITEMS_MAX))}`,
    ),
    profileCheck: check('regression_suite_profile_check', sql`coalesce(char_length(${t.engineProfileRef}), 0) <= 200`),
    pinCheck: check('regression_suite_required_pin_check', sql`jsonb_typeof(${t.requiredPin}) = 'object'`),
    versionCheck: check('regression_suite_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const suiteRuns = logDatasetsSchema.table(
  'suite_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    suiteId: uuid('suite_id').notNull(),
    requestedByActorId: uuid('requested_by_actor_id')
      .notNull()
      .references(() => actors.id),
    idempotencyKey: text('idempotency_key').notNull(),
    /** The suite's profile and required pin as they were when the run was requested (a later suite edit never changes a run). */
    engineProfileRef: text('engine_profile_ref'),
    requiredPin: jsonb('required_pin').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdUq: unique('suite_run_workspace_id_id_uq').on(t.workspaceId, t.id),
    suiteFk: foreignKey({
      name: 'suite_run_suite_fk',
      columns: [t.workspaceId, t.suiteId],
      foreignColumns: [regressionSuites.workspaceId, regressionSuites.id],
    }).onDelete('restrict'),
    idempotencyUq: unique('suite_run_idempotency_uq').on(t.workspaceId, t.suiteId, t.requestedByActorId, t.idempotencyKey),
    suiteIdx: index('suite_run_suite_idx').on(t.workspaceId, t.suiteId, t.createdAt),
    keyCheck: check('suite_run_idempotency_key_check', sql`char_length(${t.idempotencyKey}) between 1 and 200`),
    profileCheck: check('suite_run_profile_check', sql`coalesce(char_length(${t.engineProfileRef}), 0) <= 200`),
    pinCheck: check('suite_run_required_pin_check', sql`jsonb_typeof(${t.requiredPin}) = 'object'`),
  }),
);

export const suiteRunItems = logDatasetsSchema.table(
  'suite_run_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    suiteRunId: uuid('suite_run_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    datasetId: uuid('dataset_id').notNull(),
    datasetRevisionId: uuid('dataset_revision_id').notNull(),
    baselineId: uuid('baseline_id').notNull(),
    /** Pinned at run time: the revision's manifest digest and a digest of the approved baseline's content. */
    sampleManifestDigest: text('sample_manifest_digest').notNull(),
    baselineDigest: text('baseline_digest').notNull(),
    /** The 기준 낡음 summary of the baseline when the run was requested (`{ state, reasons, unknown }`; ids and names only). */
    baselineStale: jsonb('baseline_stale').notNull(),
    /** The execution request registered for this item (log-lifecycle id). */
    requestId: uuid('request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdUq: unique('suite_run_item_workspace_id_id_uq').on(t.workspaceId, t.id),
    runFk: foreignKey({
      name: 'suite_run_item_run_fk',
      columns: [t.workspaceId, t.suiteRunId],
      foreignColumns: [suiteRuns.workspaceId, suiteRuns.id],
    }).onDelete('restrict'),
    datasetFk: foreignKey({
      name: 'suite_run_item_dataset_fk',
      columns: [t.workspaceId, t.datasetId],
      foreignColumns: [datasets.workspaceId, datasets.id],
    }).onDelete('restrict'),
    revisionFk: foreignKey({
      name: 'suite_run_item_revision_fk',
      columns: [t.workspaceId, t.datasetRevisionId],
      foreignColumns: [datasetRevisions.workspaceId, datasetRevisions.id],
    }).onDelete('restrict'),
    baselineFk: foreignKey({
      name: 'suite_run_item_baseline_fk',
      columns: [t.workspaceId, t.baselineId],
      foreignColumns: [expectedBaselines.workspaceId, expectedBaselines.id],
    }).onDelete('restrict'),
    ordinalUq: unique('suite_run_item_run_ordinal_uq').on(t.workspaceId, t.suiteRunId, t.ordinal),
    requestUq: unique('suite_run_item_request_uq').on(t.workspaceId, t.requestId),
    datasetIdx: index('suite_run_item_dataset_idx').on(t.workspaceId, t.datasetId),
    ordinalCheck: check('suite_run_item_ordinal_check', sql`${t.ordinal} >= 1`),
    digestCheck: check(
      'suite_run_item_digest_check',
      sql`${t.sampleManifestDigest} ~ '^[0-9a-f]{64}$' and ${t.baselineDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    staleCheck: check('suite_run_item_stale_check', sql`jsonb_typeof(${t.baselineStale}) = 'object'`),
  }),
);
