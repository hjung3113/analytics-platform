import { sql } from 'drizzle-orm';
import { check, jsonb, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';
import { platformSchema } from './platform.js';

// One row per (workspace, actor): the session user's preferences (ADR-0098). `values` is the whole key → JSON map;
// `imported_at` is the one-time browser import acknowledgement and never moves once set.
export const preferences = platformSchema.table(
  'preferences',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    values: jsonb('values').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'preferences_pk', columns: [t.workspaceId, t.actorId] }),
    valuesObjectCheck: check(
      'preferences_values_object_check',
      sql`jsonb_typeof(${t.values}) = 'object'`,
    ),
  }),
);
