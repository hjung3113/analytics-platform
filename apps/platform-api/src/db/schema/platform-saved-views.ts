import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';
import { platformSchema } from './platform.js';

// Platform saved views (#1105, ADR-0099). Object ACL only: nothing here grants menu or Scope access. Every
// row carries `workspace_id` and every query filters on it. The `content` column holds the approved/current
// body (context, page, chartOptions, layout, panels, menuSchemaVersion); `pending` holds an official copy's
// proposed change (name + body + approval state) apart from it, so readers keep the approved copy.
export const platformSavedViews = platformSchema.table(
  'saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => actors.id),
    kind: text('kind').notNull(),
    // null for a condition set
    menuId: text('menu_id'),
    name: text('name').notNull(),
    content: jsonb('content').notNull(),
    version: integer('version').notNull().default(1),
    // epoch ms: the port's `updatedAt`
    updatedAtMs: bigint('updated_at_ms', { mode: 'number' }).notNull(),
    visibilityKind: text('visibility_kind').notNull().default('private'),
    approval: text('approval').notNull().default('none'),
    approvalNote: text('approval_note'),
    pending: jsonb('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    listIdx: index('saved_views_list_idx').on(t.workspaceId, t.menuId),
    ownerIdx: index('saved_views_owner_idx').on(t.workspaceId, t.ownerId),
    kindCheck: check('saved_views_kind_check', sql`${t.kind} in ('condition-set', 'menu-view')`),
    menuCheck: check(
      'saved_views_menu_check',
      sql`(${t.kind} = 'menu-view') = (${t.menuId} is not null)`,
    ),
    visibilityCheck: check(
      'saved_views_visibility_check',
      sql`${t.visibilityKind} in ('private', 'people', 'groups', 'official')`,
    ),
    approvalCheck: check(
      'saved_views_approval_check',
      sql`${t.approval} in ('none', 'pending', 'approved', 'rejected')`,
    ),
  }),
);

export const savedViewPeople = platformSchema.table(
  'saved_view_people',
  {
    viewId: uuid('view_id')
      .notNull()
      .references(() => platformSavedViews.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.viewId, t.actorId] }) }),
);

export const savedViewGroups = platformSchema.table(
  'saved_view_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ workspaceIdx: index('saved_view_groups_workspace_idx').on(t.workspaceId) }),
);

// A person may be a member, a manager, or both; a row with neither is deleted.
export const savedViewGroupMembers = platformSchema.table(
  'saved_view_group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => savedViewGroups.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    isMember: boolean('is_member').notNull().default(true),
    isManager: boolean('is_manager').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.actorId] }),
    actorIdx: index('saved_view_group_members_actor_idx').on(t.actorId),
    anyCheck: check('saved_view_group_members_any_check', sql`${t.isMember} or ${t.isManager}`),
  }),
);

export const savedViewGroupShares = platformSchema.table(
  'saved_view_group_shares',
  {
    viewId: uuid('view_id')
      .notNull()
      .references(() => platformSavedViews.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => savedViewGroups.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.viewId, t.groupId] }) }),
);

// One personal default per actor and menu. `menu_key` is '' for condition sets (a menu id is never empty).
export const savedViewDefaults = platformSchema.table(
  'saved_view_defaults',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    menuKey: text('menu_key').notNull(),
    viewId: uuid('view_id')
      .notNull()
      .references(() => platformSavedViews.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.actorId, t.menuKey] }) }),
);

// Import mapping and tombstones. `view_id` has no foreign key: after the view is removed the row stays, so a
// retry of the same import answers with the committed id and never re-creates the view.
export const savedViewImports = platformSchema.table(
  'saved_view_imports',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    importToken: text('import_token').notNull(),
    legacyKey: text('legacy_key').notNull(),
    contentHash: text('content_hash').notNull(),
    viewId: uuid('view_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.actorId, t.importToken, t.legacyKey] }),
    viewUq: uniqueIndex('saved_view_imports_view_uq').on(t.viewId),
  }),
);
