import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';

// Log explorer (#1468 node b, design docs/design/features/log-explorer/README.md §3.2, ADR-0119): the shareable state of
// one investigation. `round_id` is a plain uuid into `log_lifecycle.validation_round` (no cross-schema FK, module
// boundary): a round-origin investigation does not copy the round's sample set, the read resolves it through the
// lifecycle read port. `evidence` holds `EvidenceRef`s (`{ fileRef, line, fileSha256, note? }`) and never a body.
export const logExplorerSchema = pgSchema('log_explorer');

const ORIGINS = "('standalone','round')";
const STATUSES = "('open','archived')";
export const TITLE_MAX = 200;
export const EVIDENCE_MAX = 100;

export const investigations = logExplorerSchema.table(
  'investigation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    title: text('title').notNull(),
    ownerActorId: uuid('owner_actor_id')
      .notNull()
      .references(() => actors.id),
    origin: text('origin').notNull(),
    roundId: uuid('round_id'),
    /** Standalone only: the sample set shape of `log_lifecycle.validation_round.sample_set`. Null for a round origin. */
    sampleSet: jsonb('sample_set'),
    filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('open'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdUq: unique('investigation_workspace_id_id_uq').on(t.workspaceId, t.id),
    ownerIdx: index('investigation_owner_idx').on(t.workspaceId, t.ownerActorId, t.updatedAt),
    titleCheck: check(
      'investigation_title_check',
      sql`char_length(${t.title}) between 1 and ${sql.raw(String(TITLE_MAX))}`,
    ),
    originCheck: check('investigation_origin_check', sql`${t.origin} in ${sql.raw(ORIGINS)}`),
    originShapeCheck: check(
      'investigation_origin_shape_check',
      sql`(${t.origin} = 'round' and ${t.roundId} is not null and ${t.sampleSet} is null) or (${t.origin} = 'standalone' and ${t.roundId} is null and ${t.sampleSet} is not null and jsonb_typeof(${t.sampleSet}) = 'object')`,
    ),
    filtersCheck: check('investigation_filters_check', sql`jsonb_typeof(${t.filters}) = 'object'`),
    evidenceCheck: check(
      'investigation_evidence_check',
      sql`jsonb_typeof(${t.evidence}) = 'array' and jsonb_array_length(${t.evidence}) <= ${sql.raw(String(EVIDENCE_MAX))}`,
    ),
    statusCheck: check('investigation_status_check', sql`${t.status} in ${sql.raw(STATUSES)}`),
    versionCheck: check('investigation_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);
