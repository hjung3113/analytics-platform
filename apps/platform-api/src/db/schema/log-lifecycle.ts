import { sql } from 'drizzle-orm';
import {
  check,
  date,
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
