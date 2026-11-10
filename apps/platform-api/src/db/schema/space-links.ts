import { boolean, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { coreSchema, managedSystems, workspaces } from './core.js';

// #1289 node i (ADR-0110 decision 5): which business-system space a registry-owned Managed System was registered for.
// Navigation and default-selection metadata only — NO permission decision reads this table (platform ADR-0068 decision 1).
// `declared` is false once the space stops declaring `feedbackTracking`; the row is then shown as disconnected and
// never archived. Owned by the managed-systems module.
export const spaceLinks = coreSchema.table(
  'space_links',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    spaceId: text('space_id').notNull(),
    managedSystemId: uuid('managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    declared: boolean('declared').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'space_links_pk', columns: [t.workspaceId, t.spaceId] }),
  }),
);
