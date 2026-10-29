import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';

// Platform port's own tables (ADR-0069 decision 1). Identity fields only: no URL, query,
// message or stack ever lands here (http-adapter-contract §1, UsageEvent rule).
export const platformSchema = pgSchema('platform');

export const usageEvents = platformSchema.table(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    name: text('name').notNull(),
    menuId: text('menu_id').notNull(),
    spaceId: text('space_id'),
    path: text('path').notNull(),
    // Client epoch ms: stored, never used for the summary (that reads `received_at`).
    clientAt: bigint('client_at', { mode: 'number' }).notNull(),
    sessionId: text('session_id').notNull(),
    dwellMs: integer('dwell_ms'),
    enteredAt: bigint('entered_at', { mode: 'number' }),
    source: text('source').notNull().default('main'),
    stayId: text('stay_id'),
    via: text('via'),
    fromMenuId: text('from_menu_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    summaryTimeIdx: index('usage_events_summary_time_idx').on(t.workspaceId, t.name, t.receivedAt),
    summaryMenuIdx: index('usage_events_summary_menu_idx').on(t.workspaceId, t.name, t.menuId),
    // Dwell merge (real-server-checklist l.130): the last dwell for one stay wins.
    dwellEnteredUq: uniqueIndex('usage_events_dwell_entered_uq')
      .on(t.workspaceId, t.actorId, t.sessionId, t.menuId, t.enteredAt)
      .where(sql`${t.name} = 'dwell' and ${t.stayId} is null`),
    dwellStayUq: uniqueIndex('usage_events_dwell_stay_uq')
      .on(t.workspaceId, t.actorId, t.sessionId, t.menuId, t.stayId)
      .where(sql`${t.name} = 'dwell' and ${t.stayId} is not null`),
    nameCheck: check('usage_events_name_check', sql`${t.name} in ('entry', 'dwell')`),
    sourceCheck: check('usage_events_source_check', sql`${t.source} in ('main', 'board')`),
    viaCheck: check(
      'usage_events_via_check',
      sql`${t.via} is null or ${t.via} in ('sidebar', 'switcher', 'palette', 'board', 'return', 'crossLink', 'drill', 'history', 'direct', 'link')`,
    ),
    dwellMsCheck: check(
      'usage_events_dwell_ms_check',
      sql`${t.dwellMs} is null or ${t.dwellMs} >= 0`,
    ),
    stayCheck: check('usage_events_stay_check', sql`${t.stayId} is null or ${t.source} = 'board'`),
  }),
);

export const clientErrors = platformSchema.table('client_errors', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => actors.id),
  correlationId: text('correlation_id').notNull(),
  menuId: text('menu_id').notNull(),
  spaceId: text('space_id'),
  path: text('path').notNull(),
  name: text('name').notNull(),
  // The server's request id for the report call, not the client correlation id.
  requestId: text('request_id').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

// Notices (ADR-0098 §4, #1106). `until` is a naive Asia/Seoul wall-clock instant like the Home
// `until` (06 §6.3), so it is `timestamp without time zone`; `created_at`/`updated_at` are real
// instants the server stamps and never returns. `revision` renders as the opaque `v<revision>`.
// `scope_id` is targeting, not an access boundary (a site grant is not required to hold the value).
export const notices = platformSchema.table(
  'notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    authorActorId: uuid('author_actor_id')
      .notNull()
      .references(() => actors.id),
    titleKo: text('title_ko').notNull(),
    titleEn: text('title_en').notNull(),
    contentKo: text('content_ko').notNull(),
    contentEn: text('content_en').notNull(),
    scopeId: text('scope_id'),
    until: timestamp('until', { mode: 'string' }).notNull(),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceUntilIdx: index('notices_workspace_until_idx').on(t.workspaceId, t.until),
    revisionCheck: check('notices_revision_check', sql`${t.revision} >= 1`),
    titleKoCheck: check('notices_title_ko_check', sql`char_length(${t.titleKo}) <= 200`),
    titleEnCheck: check('notices_title_en_check', sql`char_length(${t.titleEn}) <= 200`),
    contentKoCheck: check('notices_content_ko_check', sql`char_length(${t.contentKo}) <= 10000`),
    contentEnCheck: check('notices_content_en_check', sql`char_length(${t.contentEn}) <= 10000`),
  }),
);
