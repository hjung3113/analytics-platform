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

// Log rules (#1491 node R-a, design docs/design/features/log-rules/README.md §3, ADR-0122): the rule catalog the
// external Validator reports over a service token. Every row is insert-only; a report is a full snapshot, a newer
// accepted report of the same source only marks the previous one `superseded` (the one allowed change). Nothing here
// holds a rule body, condition, threshold, parameter or script: there is no column for them. Every reference between
// log_rules tables is a composite same-workspace FK (ON DELETE RESTRICT); the reporter is a plain FK to core.actors.
export const logRulesSchema = pgSchema('log_rules');

const OUTCOMES = "('accepted','rejected')";
const REVISION_STATUSES = "('active','retired')";
const SUPPORTS = "('supported','partial','unsupported','unknown')";

export const catalogReports = logRulesSchema.table(
  'catalog_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** The Validator's identifier; null on a rejected report whose own value failed the identifier or secret check. */
    sourceSystem: text('source_system'),
    reportedByActorId: uuid('reported_by_actor_id')
      .notNull()
      .references(() => actors.id),
    validatorVersion: text('validator_version'),
    /** SHA-256 of the canonical serialization (accepted) or of the raw body bytes (rejected: its content is not kept). */
    reportDigest: text('report_digest').notNull(),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    outcome: text('outcome').notNull(),
    rejectReason: text('reject_reason'),
    /** Set once, by the accept transaction of the next report of the same source. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededByReportId: uuid('superseded_by_report_id'),
  },
  (t) => ({
    workspaceIdUq: unique('catalog_report_workspace_id_id_uq').on(t.workspaceId, t.id),
    digestUq: unique('catalog_report_digest_uq').on(t.workspaceId, t.reportDigest),
    // Exactly one current accepted report per source system.
    currentUq: uniqueIndex('catalog_report_current_uq')
      .on(t.workspaceId, t.sourceSystem)
      .where(sql`${t.outcome} = 'accepted' and ${t.supersededAt} is null`),
    reportedIdx: index('catalog_report_reported_idx').on(t.workspaceId, t.reportedAt),
    supersededByFk: foreignKey({
      name: 'catalog_report_superseded_by_fk',
      columns: [t.workspaceId, t.supersededByReportId],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete('restrict'),
    outcomeCheck: check('catalog_report_outcome_check', sql`${t.outcome} in ${sql.raw(OUTCOMES)}`),
    digestCheck: check('catalog_report_digest_check', sql`${t.reportDigest} ~ '^[0-9a-f]{64}$'`),
    shapeCheck: check(
      'catalog_report_shape_check',
      sql`(${t.outcome} = 'accepted' and ${t.sourceSystem} is not null and ${t.validatorVersion} is not null and ${t.rejectReason} is null)
        or (${t.outcome} = 'rejected' and ${t.rejectReason} is not null and ${t.supersededAt} is null)`,
    ),
    supersededCheck: check(
      'catalog_report_superseded_check',
      sql`(${t.supersededAt} is null) = (${t.supersededByReportId} is null)`,
    ),
  }),
);

export const ruleSetRevisions = logRulesSchema.table(
  'rule_set_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    reportId: uuid('report_id').notNull(),
    ruleSetKey: text('rule_set_key').notNull(),
    revision: text('revision').notNull(),
    /** What the Validator writes as `rule_set_revision` in a result submission; the reported `revision` when absent. */
    resultRef: text('result_ref').notNull(),
    revisionDigest: text('revision_digest').notNull(),
    /** Not part of the v0 report body: reserved for a Validator that reports it. */
    releasedAt: timestamp('released_at', { withTimezone: true }),
    status: text('status').notNull(),
    /** The Validator-reported revision this one replaces (an opaque string; the only continuity claim). */
    supersedes: text('supersedes'),
  },
  (t) => ({
    workspaceIdUq: unique('rule_set_revision_workspace_id_id_uq').on(t.workspaceId, t.id),
    keyUq: unique('rule_set_revision_key_uq').on(t.workspaceId, t.reportId, t.ruleSetKey, t.revision),
    resultRefUq: unique('rule_set_revision_result_ref_uq').on(
      t.workspaceId,
      t.reportId,
      t.ruleSetKey,
      t.resultRef,
    ),
    // The read path resolves an attempt's revision string through `result_ref` across reports.
    resultRefIdx: index('rule_set_revision_result_ref_idx').on(t.workspaceId, t.resultRef),
    reportFk: foreignKey({
      name: 'rule_set_revision_report_fk',
      columns: [t.workspaceId, t.reportId],
      foreignColumns: [catalogReports.workspaceId, catalogReports.id],
    }).onDelete('restrict'),
    statusCheck: check('rule_set_revision_status_check', sql`${t.status} in ${sql.raw(REVISION_STATUSES)}`),
    digestCheck: check('rule_set_revision_digest_check', sql`${t.revisionDigest} ~ '^[0-9a-f]{64}$'`),
  }),
);

export const rules = logRulesSchema.table(
  'rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    ruleSetRevisionId: uuid('rule_set_revision_id').notNull(),
    ruleKey: text('rule_key').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    support: text('support').notNull(),
    /** Closed keys: logTypes[], processes[], modelIds[], softwareRange?, inputFormats[] (validated at the boundary). */
    scope: jsonb('scope'),
    requiredDefault: boolean('required_default'),
    ruleDigest: text('rule_digest').notNull(),
  },
  (t) => ({
    workspaceIdUq: unique('rule_workspace_id_id_uq').on(t.workspaceId, t.id),
    keyUq: unique('rule_key_uq').on(t.workspaceId, t.ruleSetRevisionId, t.ruleKey),
    ruleKeyIdx: index('rule_rule_key_idx').on(t.workspaceId, t.ruleKey),
    revisionFk: foreignKey({
      name: 'rule_revision_fk',
      columns: [t.workspaceId, t.ruleSetRevisionId],
      foreignColumns: [ruleSetRevisions.workspaceId, ruleSetRevisions.id],
    }).onDelete('restrict'),
    supportCheck: check('rule_support_check', sql`${t.support} in ${sql.raw(SUPPORTS)}`),
    titleCheck: check('rule_title_check', sql`char_length(${t.title}) between 1 and 120`),
    summaryCheck: check('rule_summary_check', sql`char_length(${t.summary}) between 1 and 300`),
    scopeCheck: check('rule_scope_check', sql`${t.scope} is null or jsonb_typeof(${t.scope}) = 'object'`),
    digestCheck: check('rule_digest_check', sql`${t.ruleDigest} ~ '^[0-9a-f]{64}$'`),
  }),
);

export const ruleTargets = logRulesSchema.table(
  'rule_target',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    ruleId: uuid('rule_id').notNull(),
    /** Order of the declaration inside the rule. */
    position: integer('position').notNull(),
    /** The Validator's own format name. */
    format: text('format').notNull(),
    /** The declaration, verbatim: the platform never interprets or normalizes it. */
    target: text('target').notNull(),
    requirementIds: text('requirement_ids').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => ({
    positionUq: unique('rule_target_position_uq').on(t.workspaceId, t.ruleId, t.position),
    ruleFk: foreignKey({
      name: 'rule_target_rule_fk',
      columns: [t.workspaceId, t.ruleId],
      foreignColumns: [rules.workspaceId, rules.id],
    }).onDelete('restrict'),
    positionCheck: check('rule_target_position_check', sql`${t.position} >= 0`),
    formatCheck: check('rule_target_format_check', sql`char_length(${t.format}) between 1 and 40`),
    targetCheck: check('rule_target_target_check', sql`char_length(${t.target}) between 1 and 500`),
    requirementsCheck: check(
      'rule_target_requirement_ids_check',
      sql`coalesce(array_length(${t.requirementIds}, 1), 0) <= 50`,
    ),
  }),
);
