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
// path checks workspace membership where it matters. Baselines, suites and runs arrive with nodes b–d.
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
