import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';

// Equipment visualization server module (#1645, #1607 step 5, ADR-0132, ADR-0135): Layouts and Templates only. Every table is
// workspace-scoped. `layout_draft`, `layout_revision` and `template` carry a uuid `id` because `core.audit_log.subject_id` is a uuid;
// the natural keys (`layout_id`, `template_id`: `idSchema` text; `revision`: the `sha256:<hex>` of `layoutRevision`) are unique per
// workspace. `equipment.model_id` is a Hub catalog id (ADR-0132 decision 7) with no FK across the module boundary: the write path
// checks it through `knowledgeLookup`. Bindings, Mapping and Sample Window tables arrive with steps 8 and 9.
export const eqvSchema = pgSchema('eqv');

const REVISION_PATTERN = "'^sha256:[0-9a-f]{64}$'";
const ID_PATTERN = "'^[a-z][a-z0-9]*(-[a-z0-9]+)*$'";

export const layoutDrafts = eqvSchema.table(
  'layout_draft',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    layoutId: text('layout_id').notNull(),
    document: jsonb('document').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    createdBy: uuid('created_by').notNull().references(() => actors.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedBy: uuid('updated_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('layout_draft_workspace_id_id_uq').on(t.workspaceId, t.id),
    layoutUq: unique('layout_draft_workspace_layout_uq').on(t.workspaceId, t.layoutId),
    idCheck: check('layout_draft_layout_id_check', sql`${t.layoutId} ~ ${sql.raw(ID_PATTERN)}`),
    versionCheck: check('layout_draft_version_check', sql`${t.version} >= 1`),
    documentCheck: check('layout_draft_document_check', sql`jsonb_typeof(${t.document}) = 'object'`),
  }),
);

export const layoutRevisions = eqvSchema.table(
  'layout_revision',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    layoutId: text('layout_id').notNull(),
    revision: text('revision').notNull(),
    document: jsonb('document').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(sql`now()`),
    publishedBy: uuid('published_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('layout_revision_workspace_id_id_uq').on(t.workspaceId, t.id),
    naturalUq: unique('layout_revision_workspace_layout_revision_uq').on(t.workspaceId, t.layoutId, t.revision),
    listIdx: index('layout_revision_workspace_layout_published_idx').on(t.workspaceId, t.layoutId, t.publishedAt),
    idCheck: check('layout_revision_layout_id_check', sql`${t.layoutId} ~ ${sql.raw(ID_PATTERN)}`),
    revisionCheck: check('layout_revision_revision_check', sql`${t.revision} ~ ${sql.raw(REVISION_PATTERN)}`),
    documentCheck: check('layout_revision_document_check', sql`jsonb_typeof(${t.document}) = 'object'`),
  }),
);

export const templates = eqvSchema.table(
  'template',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    templateId: text('template_id').notNull(),
    name: text('name').notNull(),
    document: jsonb('document').notNull(),
    promotedFromLayoutId: text('promoted_from_layout_id').notNull(),
    promotedFromRevision: text('promoted_from_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    createdBy: uuid('created_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('template_workspace_id_id_uq').on(t.workspaceId, t.id),
    naturalUq: unique('template_workspace_template_uq').on(t.workspaceId, t.templateId),
    sourceIdx: index('template_workspace_source_idx').on(t.workspaceId, t.promotedFromLayoutId, t.promotedFromRevision),
    sourceFk: foreignKey({
      name: 'template_promoted_from_fk',
      columns: [t.workspaceId, t.promotedFromLayoutId, t.promotedFromRevision],
      foreignColumns: [layoutRevisions.workspaceId, layoutRevisions.layoutId, layoutRevisions.revision],
    }).onDelete('restrict'),
    idCheck: check('template_template_id_check', sql`${t.templateId} ~ ${sql.raw(ID_PATTERN)}`),
    nameCheck: check('template_name_check', sql`char_length(btrim(${t.name})) between 1 and 200`),
    documentCheck: check('template_document_check', sql`jsonb_typeof(${t.document}) = 'object'`),
  }),
);

// Read-only for the runtime role in this issue; Onboarding (step 8) adds the write action.
export const equipment = eqvSchema.table(
  'equipment',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    equipmentId: text('equipment_id').notNull(),
    label: text('label').notNull(),
    modelId: uuid('model_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ name: 'equipment_pk', columns: [t.workspaceId, t.equipmentId] }),
    modelIdx: index('equipment_workspace_model_idx').on(t.workspaceId, t.modelId),
    labelCheck: check('equipment_label_check', sql`char_length(btrim(${t.label})) between 1 and 200`),
  }),
);
