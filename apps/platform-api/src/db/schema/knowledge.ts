import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actors, workspaces } from './core.js';

// Log knowledge hub catalog (ADR-0107, #1193): tables 1–6 of design v0.6 §5.2. `code` keeps the
// typed original; `code_key` is the module-computed comparison key (`toCodeKey`). Rows are never
// hard-deleted (deactivate only); only `model_process` mappings may be removed.
export const knowledgeSchema = pgSchema('knowledge');

const CODE_MAX = 64;
const NAME_MAX = 200;

export const vendors = knowledgeSchema.table(
  'vendor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    code: text('code').notNull(),
    codeKey: text('code_key').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('vendor_workspace_id_id_uq').on(t.workspaceId, t.id),
    codeKeyUq: uniqueIndex('vendor_workspace_code_key_uq').on(t.workspaceId, t.codeKey),
    codeCheck: check(
      'vendor_code_check',
      sql`char_length(${t.code}) between 1 and ${sql.raw(String(CODE_MAX))}`,
    ),
    nameCheck: check(
      'vendor_name_check',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX))}`,
    ),
    versionCheck: check('vendor_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const processCategories = knowledgeSchema.table(
  'process_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    code: text('code').notNull(),
    codeKey: text('code_key').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('process_category_workspace_id_id_uq').on(t.workspaceId, t.id),
    codeKeyUq: uniqueIndex('process_category_workspace_code_key_uq').on(t.workspaceId, t.codeKey),
    codeCheck: check(
      'process_category_code_check',
      sql`char_length(${t.code}) between 1 and ${sql.raw(String(CODE_MAX))}`,
    ),
    nameCheck: check(
      'process_category_name_check',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX))}`,
    ),
    versionCheck: check('process_category_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const equipmentModels = knowledgeSchema.table(
  'equipment_model',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    vendorId: uuid('vendor_id').notNull(),
    code: text('code').notNull(),
    codeKey: text('code_key').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('equipment_model_workspace_id_id_uq').on(t.workspaceId, t.id),
    vendorFk: foreignKey({
      name: 'equipment_model_vendor_fk',
      columns: [t.workspaceId, t.vendorId],
      foreignColumns: [vendors.workspaceId, vendors.id],
    }).onDelete('restrict'),
    codeKeyUq: uniqueIndex('equipment_model_workspace_vendor_code_key_uq').on(
      t.workspaceId,
      t.vendorId,
      t.codeKey,
    ),
    vendorIdx: index('equipment_model_vendor_idx').on(t.workspaceId, t.vendorId),
    codeCheck: check(
      'equipment_model_code_check',
      sql`char_length(${t.code}) between 1 and ${sql.raw(String(CODE_MAX))}`,
    ),
    nameCheck: check(
      'equipment_model_name_check',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX))}`,
    ),
    versionCheck: check('equipment_model_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const modelProcesses = knowledgeSchema.table(
  'model_process',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    modelId: uuid('model_id').notNull(),
    processId: uuid('process_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    pk: primaryKey({
      name: 'model_process_pk',
      columns: [t.workspaceId, t.modelId, t.processId],
    }),
    modelFk: foreignKey({
      name: 'model_process_model_fk',
      columns: [t.workspaceId, t.modelId],
      foreignColumns: [equipmentModels.workspaceId, equipmentModels.id],
    }).onDelete('restrict'),
    processFk: foreignKey({
      name: 'model_process_process_fk',
      columns: [t.workspaceId, t.processId],
      foreignColumns: [processCategories.workspaceId, processCategories.id],
    }).onDelete('restrict'),
    processIdx: index('model_process_process_idx').on(t.workspaceId, t.processId),
  }),
);

export const softwareVersions = knowledgeSchema.table(
  'software_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    modelId: uuid('model_id').notNull(),
    versionLabel: text('version_label').notNull(),
    versionKey: text('version_key').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('software_version_workspace_id_id_uq').on(t.workspaceId, t.id),
    modelFk: foreignKey({
      name: 'software_version_model_fk',
      columns: [t.workspaceId, t.modelId],
      foreignColumns: [equipmentModels.workspaceId, equipmentModels.id],
    }).onDelete('restrict'),
    versionKeyUq: uniqueIndex('software_version_workspace_model_version_key_uq').on(
      t.workspaceId,
      t.modelId,
      t.versionKey,
    ),
    labelCheck: check(
      'software_version_label_check',
      sql`char_length(${t.versionLabel}) between 1 and ${sql.raw(String(CODE_MAX))}`,
    ),
    nameCheck: check(
      'software_version_name_check',
      sql`char_length(${t.name}) between 0 and ${sql.raw(String(NAME_MAX))}`,
    ),
    versionCheck: check('software_version_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const externalIdentityMaps = knowledgeSchema.table(
  'external_identity_map',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceSystem: text('source_system').notNull(),
    sourceType: text('source_type').notNull(),
    externalKey: text('external_key').notNull(),
    targetKind: text('target_kind').notNull(),
    // Target existence is judged by the write service (design v0.6 §5.2 row 6): no FK across four tables.
    targetId: uuid('target_id').notNull(),
    mappingState: text('mapping_state').notNull().default('proposed'),
    acceptedBy: uuid('accepted_by').references(() => actors.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('external_identity_map_workspace_id_id_uq').on(t.workspaceId, t.id),
    sourceUq: uniqueIndex('external_identity_map_source_uq').on(
      t.workspaceId,
      t.sourceSystem,
      t.sourceType,
      t.externalKey,
    ),
    targetIdx: index('external_identity_map_target_idx').on(t.workspaceId, t.targetKind, t.targetId),
    targetKindCheck: check(
      'external_identity_map_target_kind_check',
      sql`${t.targetKind} in ('vendor','process','model','software')`,
    ),
    stateCheck: check(
      'external_identity_map_mapping_state_check',
      sql`${t.mappingState} in ('proposed','accepted','rejected')`,
    ),
    versionCheck: check('external_identity_map_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);
