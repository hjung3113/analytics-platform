import { sql } from 'drizzle-orm';
import {
  bigint,
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

// Improvement items (#1328 node a, design docs/design/features/improvement-items.md, ADR-0106 amendment 2): one
// problem inferred from an analysis plus its one-line action, with the targets it concerns and an append-only
// history. Every improvement->improvement reference is a composite same-workspace FK (ON DELETE RESTRICT); actor
// columns are plain FKs to core.actors (as knowledge, 0082): core.actors has no (workspace_id, id) key, so the
// write path (node b) checks that an assignee belongs to the session workspace.
//
// The origin-or-target rule (an item carries `origin_*` or at least one `item_target`) needs a second table, so it
// is NOT a CHECK here; migration 0094 enforces it with a deferrable constraint trigger (`improvement_item_origin_or_target`) and
// the write path validates it first.
export const improvementSchema = pgSchema('improvement');

const PROBLEM_MAX = 500;
const LONG_TEXT_MAX = 2000;
const SHORT_TEXT_MAX = 200;
const STATUSES = "('open','in_progress','done','verified','dropped')";
const EFFECT_RESULTS = "('effective','ineffective','inconclusive')";
const TARGET_KINDS = "('equipment','process')";
const EVENT_TYPES = "('created','updated','status_changed','assigned','quest_linked','reopened')";

/** Per-workspace allocator of `item.item_no` (`IM-<n>`): one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`. */
export const improvementItemCounters = improvementSchema.table('item_counter', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id),
  lastItemNo: integer('last_item_no').notNull(),
});

export const improvementItems = improvementSchema.table(
  'item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemNo: integer('item_no').notNull(),
    problem: text('problem').notNull(),
    action: text('action'),
    /** Date only (wall-clock, no time zone): the base day of the effect check. */
    actionDate: date('action_date', { mode: 'string' }),
    status: text('status').notNull().default('open'),
    assigneeId: uuid('assignee_id').references(() => actors.id),
    questId: text('quest_id'),
    questTitleSnapshot: text('quest_title_snapshot'),
    originMenuId: text('origin_menu_id'),
    originContext: jsonb('origin_context'),
    effectResult: text('effect_result'),
    effectNote: text('effect_note'),
    effectCompareLink: text('effect_compare_link'),
    dropReason: text('drop_reason'),
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
    workspaceIdUq: unique('improvement_item_workspace_id_id_uq').on(t.workspaceId, t.id),
    itemNoUq: uniqueIndex('improvement_item_workspace_item_no_uq').on(t.workspaceId, t.itemNo),
    statusIdx: index('improvement_item_status_idx').on(t.workspaceId, t.status),
    assigneeIdx: index('improvement_item_assignee_idx').on(t.workspaceId, t.assigneeId),
    questIdx: index('improvement_item_quest_idx').on(t.workspaceId, t.questId),
    createdIdx: index('improvement_item_created_idx').on(t.workspaceId, t.createdAt),
    itemNoCheck: check('improvement_item_item_no_check', sql`${t.itemNo} >= 1`),
    problemCheck: check(
      'improvement_item_problem_check',
      sql`char_length(${t.problem}) between 1 and ${sql.raw(String(PROBLEM_MAX))} and btrim(${t.problem}) <> ''`,
    ),
    actionCheck: check(
      'improvement_item_action_check',
      sql`coalesce(char_length(${t.action}), 0) <= ${sql.raw(String(LONG_TEXT_MAX))}`,
    ),
    statusCheck: check('improvement_item_status_check', sql`${t.status} in ${sql.raw(STATUSES)}`),
    questPairCheck: check(
      'improvement_item_quest_pair_check',
      sql`(${t.questId} is null) = (${t.questTitleSnapshot} is null)`,
    ),
    questTextCheck: check(
      'improvement_item_quest_text_check',
      sql`coalesce(char_length(${t.questId}), 0) <= ${sql.raw(String(SHORT_TEXT_MAX))} and coalesce(char_length(${t.questTitleSnapshot}), 0) <= ${sql.raw(String(SHORT_TEXT_MAX))} and btrim(coalesce(${t.questId}, 'x')) <> ''`,
    ),
    originPairCheck: check(
      'improvement_item_origin_pair_check',
      sql`(${t.originMenuId} is null) = (${t.originContext} is null)`,
    ),
    originMenuCheck: check(
      'improvement_item_origin_menu_check',
      sql`coalesce(char_length(${t.originMenuId}), 0) <= ${sql.raw(String(SHORT_TEXT_MAX))} and btrim(coalesce(${t.originMenuId}, 'x')) <> ''`,
    ),
    originContextCheck: check(
      'improvement_item_origin_context_check',
      sql`${t.originContext} is null or jsonb_typeof(${t.originContext}) = 'object'`,
    ),
    effectResultCheck: check(
      'improvement_item_effect_result_check',
      sql`${t.effectResult} is null or ${t.effectResult} in ${sql.raw(EFFECT_RESULTS)}`,
    ),
    effectNoteCheck: check(
      'improvement_item_effect_note_check',
      sql`coalesce(char_length(${t.effectNote}), 0) <= ${sql.raw(String(LONG_TEXT_MAX))}`,
    ),
    // Same-origin relative path only: one leading slash, then neither another slash nor a backslash, and no
    // C0 control or DEL (a URL parser strips TAB/CR/LF, so `/<TAB>/evil` would become `//evil`).
    effectLinkCheck: check(
      'improvement_item_effect_compare_link_check',
      sql`${t.effectCompareLink} is null or (char_length(${t.effectCompareLink}) <= ${sql.raw(String(LONG_TEXT_MAX))} and ${t.effectCompareLink} ~ ${sql.raw(String.raw`'^/[^/\\]'`)} and ${t.effectCompareLink} !~ ${sql.raw(String.raw`'[\u0001-\u001f\u007f]'`)})`,
    ),
    dropReasonCheck: check(
      'improvement_item_drop_reason_check',
      sql`coalesce(char_length(${t.dropReason}), 0) <= ${sql.raw(String(LONG_TEXT_MAX))}`,
    ),
    versionCheck: check('improvement_item_row_version_check', sql`${t.rowVersion} >= 1`),
    // Cumulative status rules. effect_* and drop_reason may stay after a reopen (history lives in item_event).
    actionRequiredCheck: check(
      'improvement_item_action_required_check',
      sql`${t.status} not in ('in_progress','done','verified') or btrim(coalesce(${t.action}, '')) <> ''`,
    ),
    actionDateRequiredCheck: check(
      'improvement_item_action_date_required_check',
      sql`${t.status} not in ('done','verified') or ${t.actionDate} is not null`,
    ),
    verifiedEffectCheck: check(
      'improvement_item_verified_effect_check',
      sql`${t.status} <> 'verified' or ${t.effectResult} is not null`,
    ),
    droppedReasonCheck: check(
      'improvement_item_dropped_reason_check',
      sql`${t.status} <> 'dropped' or btrim(coalesce(${t.dropReason}, '')) <> ''`,
    ),
    effectDetailCheck: check(
      'improvement_item_effect_detail_check',
      sql`${t.effectResult} is not null or (${t.effectNote} is null and ${t.effectCompareLink} is null)`,
    ),
  }),
);

export const improvementItemTargets = improvementSchema.table(
  'item_target',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemId: uuid('item_id').notNull(),
    kind: text('kind').notNull(),
    /** The key in the source system; the platform has no equipment master. */
    externalKey: text('external_key').notNull(),
    displayNameSnapshot: text('display_name_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemFk: foreignKey({
      name: 'improvement_item_target_item_fk',
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [improvementItems.workspaceId, improvementItems.id],
    }).onDelete('restrict'),
    targetUq: uniqueIndex('improvement_item_target_item_kind_key_uq').on(
      t.workspaceId,
      t.itemId,
      t.kind,
      t.externalKey,
    ),
    // Per-equipment history: every item that touches one target.
    targetKeyIdx: index('improvement_item_target_key_idx').on(t.workspaceId, t.kind, t.externalKey),
    kindCheck: check('improvement_item_target_kind_check', sql`${t.kind} in ${sql.raw(TARGET_KINDS)}`),
    keyCheck: check(
      'improvement_item_target_key_check',
      sql`char_length(${t.externalKey}) between 1 and ${sql.raw(String(SHORT_TEXT_MAX))} and btrim(${t.externalKey}) <> ''`,
    ),
    nameCheck: check(
      'improvement_item_target_name_check',
      sql`char_length(${t.displayNameSnapshot}) <= ${sql.raw(String(SHORT_TEXT_MAX))}`,
    ),
  }),
);

/** Append-only history of an item: the runtime role holds INSERT (0094) and never UPDATE or DELETE. */
export const improvementItemEvents = improvementSchema.table(
  'item_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigint('seq', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemId: uuid('item_id').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    eventType: text('event_type').notNull(),
    /** `{ before, after }` of the changed fields. */
    changes: jsonb('changes').notNull().default(sql`'{}'::jsonb`),
    reason: text('reason'),
  },
  (t) => ({
    itemFk: foreignKey({
      name: 'improvement_item_event_item_fk',
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [improvementItems.workspaceId, improvementItems.id],
    }).onDelete('restrict'),
    seqUq: unique('improvement_item_event_seq_uq').on(t.seq),
    itemIdx: index('improvement_item_event_item_idx').on(t.workspaceId, t.itemId, t.seq),
    typeCheck: check('improvement_item_event_type_check', sql`${t.eventType} in ${sql.raw(EVENT_TYPES)}`),
    changesCheck: check('improvement_item_event_changes_check', sql`jsonb_typeof(${t.changes}) = 'object'`),
    reasonCheck: check(
      'improvement_item_event_reason_check',
      sql`coalesce(char_length(${t.reason}), 0) <= ${sql.raw(String(LONG_TEXT_MAX))}`,
    ),
  }),
);
