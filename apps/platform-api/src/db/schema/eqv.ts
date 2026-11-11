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
// checks it through `knowledgeLookup`. Sample Window tables arrive with a later step; Onboarding tables are at the end of this file (#1658).
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

// Onboarding storage (#1658, ADR-0139): alias rules and Type Dictionary per Mapping Scope, immutable Mapping Versions and Baselines, and
// the Bindings of one equipment. Scope keys are Hub ids (maker = `knowledge.vendor.id`, model = `knowledge.equipment_model.id`), never free
// strings; neither has an FK (Hub is another module). Wall-clock columns are Site Wall-clock text, compared as strings and never truncated.
const WALL_CLOCK_PATTERN = "'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}$'";

export const aliasRules = eqvSchema.table(
  'alias_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    level: text('level').notNull(),
    vendorId: uuid('vendor_id'),
    modelId: uuid('model_id'),
    equipmentId: text('equipment_id'),
    document: jsonb('document').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    createdBy: uuid('created_by').notNull().references(() => actors.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedBy: uuid('updated_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('alias_rules_workspace_id_id_uq').on(t.workspaceId, t.id),
    scopeUq: unique('alias_rules_workspace_scope_uq').on(t.workspaceId, t.level, t.vendorId, t.modelId, t.equipmentId).nullsNotDistinct(),
    equipmentFk: foreignKey({
      name: 'alias_rules_equipment_fk',
      columns: [t.workspaceId, t.equipmentId],
      foreignColumns: [equipment.workspaceId, equipment.equipmentId],
    }).onDelete('restrict'),
    levelCheck: check('alias_rules_level_check', sql`${t.level} in ('global', 'maker', 'model', 'equipment')`),
    scopeCheck: check(
      'alias_rules_scope_check',
      sql`(${t.level} = 'global' and ${t.vendorId} is null and ${t.modelId} is null and ${t.equipmentId} is null)
        or (${t.level} = 'maker' and ${t.vendorId} is not null and ${t.modelId} is null and ${t.equipmentId} is null)
        or (${t.level} = 'model' and ${t.vendorId} is not null and ${t.modelId} is not null and ${t.equipmentId} is null)
        or (${t.level} = 'equipment' and ${t.vendorId} is null and ${t.modelId} is null and ${t.equipmentId} is not null)`,
    ),
    versionCheck: check('alias_rules_version_check', sql`${t.version} >= 1`),
    documentCheck: check('alias_rules_document_check', sql`jsonb_typeof(${t.document}) = 'object'`),
  }),
);

// Same shape without the equipment level (core: a Type Dictionary has global, maker and model scopes only).
export const typeDictionaries = eqvSchema.table(
  'type_dictionary',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    level: text('level').notNull(),
    vendorId: uuid('vendor_id'),
    modelId: uuid('model_id'),
    document: jsonb('document').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    createdBy: uuid('created_by').notNull().references(() => actors.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedBy: uuid('updated_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('type_dictionary_workspace_id_id_uq').on(t.workspaceId, t.id),
    scopeUq: unique('type_dictionary_workspace_scope_uq').on(t.workspaceId, t.level, t.vendorId, t.modelId).nullsNotDistinct(),
    levelCheck: check('type_dictionary_level_check', sql`${t.level} in ('global', 'maker', 'model')`),
    scopeCheck: check(
      'type_dictionary_scope_check',
      sql`(${t.level} = 'global' and ${t.vendorId} is null and ${t.modelId} is null)
        or (${t.level} = 'maker' and ${t.vendorId} is not null and ${t.modelId} is null)
        or (${t.level} = 'model' and ${t.vendorId} is not null and ${t.modelId} is not null)`,
    ),
    versionCheck: check('type_dictionary_version_check', sql`${t.version} >= 1`),
    documentCheck: check('type_dictionary_document_check', sql`jsonb_typeof(${t.document}) = 'object'`),
  }),
);

// Immutable. `layout_revision` is the Revision the hash was first published with; a Binding carries its own Revision.
export const mappingVersions = eqvSchema.table(
  'mapping_version',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    equipmentId: text('equipment_id').notNull(),
    layoutId: text('layout_id').notNull(),
    layoutRevision: text('layout_revision').notNull(),
    hash: text('hash').notNull(),
    document: jsonb('document').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().default(sql`now()`),
    publishedBy: uuid('published_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('mapping_version_workspace_id_id_uq').on(t.workspaceId, t.id),
    naturalUq: unique('mapping_version_workspace_equipment_hash_uq').on(t.workspaceId, t.equipmentId, t.hash),
    listIdx: index('mapping_version_workspace_equipment_published_idx').on(t.workspaceId, t.equipmentId, t.publishedAt),
    equipmentFk: foreignKey({
      name: 'mapping_version_equipment_fk',
      columns: [t.workspaceId, t.equipmentId],
      foreignColumns: [equipment.workspaceId, equipment.equipmentId],
    }).onDelete('restrict'),
    revisionFk: foreignKey({
      name: 'mapping_version_layout_revision_fk',
      columns: [t.workspaceId, t.layoutId, t.layoutRevision],
      foreignColumns: [layoutRevisions.workspaceId, layoutRevisions.layoutId, layoutRevisions.revision],
    }).onDelete('restrict'),
    hashCheck: check('mapping_version_hash_check', sql`${t.hash} ~ ${sql.raw(REVISION_PATTERN)}`),
    revisionCheck: check('mapping_version_layout_revision_check', sql`${t.layoutRevision} ~ ${sql.raw(REVISION_PATTERN)}`),
    documentCheck: check('mapping_version_document_check', sql`jsonb_typeof(${t.document}) = 'object'`),
  }),
);

// Immutable: the Inventory a Mapping Version was published against (Drift baseline). The first one per hash stays (ONBOARDING D5).
export const baselineInventories = eqvSchema.table(
  'baseline_inventory',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    equipmentId: text('equipment_id').notNull(),
    mappingHash: text('mapping_hash').notNull(),
    document: jsonb('document').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    createdBy: uuid('created_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('baseline_inventory_workspace_id_id_uq').on(t.workspaceId, t.id),
    naturalUq: unique('baseline_inventory_workspace_equipment_hash_uq').on(t.workspaceId, t.equipmentId, t.mappingHash),
    mappingFk: foreignKey({
      name: 'baseline_inventory_mapping_fk',
      columns: [t.workspaceId, t.equipmentId, t.mappingHash],
      foreignColumns: [mappingVersions.workspaceId, mappingVersions.equipmentId, mappingVersions.hash],
    }).onDelete('restrict'),
    documentCheck: check('baseline_inventory_document_check', sql`jsonb_typeof(${t.document}) = 'object'`),
  }),
);

// Only `effective_to` is ever updated (closing the open latest Binding at the next publish).
export const bindings = eqvSchema.table(
  'binding',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
    equipmentId: text('equipment_id').notNull(),
    layoutId: text('layout_id').notNull(),
    layoutRevision: text('layout_revision').notNull(),
    mappingHash: text('mapping_hash').notNull(),
    effectiveFrom: text('effective_from').notNull(),
    effectiveTo: text('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    createdBy: uuid('created_by').notNull().references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('binding_workspace_id_id_uq').on(t.workspaceId, t.id),
    fromUq: unique('binding_workspace_equipment_from_uq').on(t.workspaceId, t.equipmentId, t.effectiveFrom),
    equipmentFk: foreignKey({
      name: 'binding_equipment_fk',
      columns: [t.workspaceId, t.equipmentId],
      foreignColumns: [equipment.workspaceId, equipment.equipmentId],
    }).onDelete('restrict'),
    revisionFk: foreignKey({
      name: 'binding_layout_revision_fk',
      columns: [t.workspaceId, t.layoutId, t.layoutRevision],
      foreignColumns: [layoutRevisions.workspaceId, layoutRevisions.layoutId, layoutRevisions.revision],
    }).onDelete('restrict'),
    mappingFk: foreignKey({
      name: 'binding_mapping_fk',
      columns: [t.workspaceId, t.equipmentId, t.mappingHash],
      foreignColumns: [mappingVersions.workspaceId, mappingVersions.equipmentId, mappingVersions.hash],
    }).onDelete('restrict'),
    fromCheck: check('binding_effective_from_check', sql`${t.effectiveFrom} ~ ${sql.raw(WALL_CLOCK_PATTERN)}`),
    toCheck: check(
      'binding_effective_to_check',
      sql`${t.effectiveTo} is null or (${t.effectiveTo} ~ ${sql.raw(WALL_CLOCK_PATTERN)} and ${t.effectiveFrom} < ${t.effectiveTo})`,
    ),
    revisionCheck: check('binding_layout_revision_check', sql`${t.layoutRevision} ~ ${sql.raw(REVISION_PATTERN)}`),
  }),
);
