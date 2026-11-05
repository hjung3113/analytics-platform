import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
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
    // Release order inside the model (design v0.6 §15.2): "from SW X onward" is judged by it. Not unique (a later
    // editing action swaps two orders). 0 = "not assigned": a BEFORE INSERT trigger (migration 0091) turns it into
    // max + 1 of the model, so every insert path (create action, import, fixtures) gets the registration order.
    releaseOrder: integer('release_order').notNull().default(0),
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
    releaseOrderIdx: index('software_version_model_release_order_idx').on(t.workspaceId, t.modelId, t.releaseOrder),
    workspaceIdUq: unique('software_version_workspace_id_id_uq').on(t.workspaceId, t.id),
    // Target of the same-model composite FKs of `spec_sw_change` (#1196 c).
    workspaceModelIdUq: unique('software_version_workspace_model_id_uq').on(t.workspaceId, t.modelId, t.id),
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
    releaseOrderCheck: check('software_version_release_order_check', sql`${t.releaseOrder} >= 1`),
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

// Log knowledge items (ADR-0109, #1197 a): design v0.6 §5.2 rows 19–24. An item belongs to exactly one model or
// one software version and never changes owner; revisions, evidence, assessment events and links are
// append-only (the runtime role holds SELECT and INSERT only, see migration 0082).
const ITEM_TEXT_MAX = 20000;
const VERIFICATION_STATES = "('not_checked','observed','verified','disputed')";
const PROCESSING_STATES = "('open','under_investigation','resolved')";

/** Per-workspace allocator of `knowledge_item.item_no`: one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`. */
export const itemCounters = knowledgeSchema.table('item_counter', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id),
  lastItemNo: integer('last_item_no').notNull(),
});

export const knowledgeItems = knowledgeSchema.table(
  'knowledge_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemNo: integer('item_no').notNull(),
    ownerModelId: uuid('owner_model_id'),
    ownerSoftwareId: uuid('owner_software_id'),
    latestRevisionNo: integer('latest_revision_no').notNull(),
    publicationState: text('publication_state').notNull(),
    verificationState: text('verification_state').notNull().default('not_checked'),
    processingState: text('processing_state').notNull().default('open'),
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
    workspaceIdUq: unique('knowledge_item_workspace_id_id_uq').on(t.workspaceId, t.id),
    itemNoUq: uniqueIndex('knowledge_item_workspace_item_no_uq').on(t.workspaceId, t.itemNo),
    modelFk: foreignKey({
      name: 'knowledge_item_owner_model_fk',
      columns: [t.workspaceId, t.ownerModelId],
      foreignColumns: [equipmentModels.workspaceId, equipmentModels.id],
    }).onDelete('restrict'),
    softwareFk: foreignKey({
      name: 'knowledge_item_owner_software_fk',
      columns: [t.workspaceId, t.ownerSoftwareId],
      foreignColumns: [softwareVersions.workspaceId, softwareVersions.id],
    }).onDelete('restrict'),
    modelIdx: index('knowledge_item_owner_model_idx').on(t.workspaceId, t.ownerModelId),
    softwareIdx: index('knowledge_item_owner_software_idx').on(t.workspaceId, t.ownerSoftwareId),
    ownerXor: check('knowledge_item_owner_xor', sql`num_nonnulls(${t.ownerModelId}, ${t.ownerSoftwareId}) = 1`),
    itemNoCheck: check('knowledge_item_item_no_check', sql`${t.itemNo} >= 1`),
    latestCheck: check('knowledge_item_latest_revision_no_check', sql`${t.latestRevisionNo} >= 1`),
    publicationCheck: check(
      'knowledge_item_publication_state_check',
      sql`${t.publicationState} in ('published','archived')`,
    ),
    verificationCheck: check(
      'knowledge_item_verification_state_check',
      sql`${t.verificationState} in ${sql.raw(VERIFICATION_STATES)}`,
    ),
    processingCheck: check(
      'knowledge_item_processing_state_check',
      sql`${t.processingState} in ${sql.raw(PROCESSING_STATES)}`,
    ),
    versionCheck: check('knowledge_item_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const knowledgeItemRevisions = knowledgeSchema.table(
  'knowledge_item_revision',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemId: uuid('item_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    title: text('title').notNull(),
    typeCode: text('type_code').notNull(),
    observation: text('observation'),
    expected: text('expected'),
    analysisOpinion: text('analysis_opinion'),
    improvement: text('improvement'),
    changeNote: text('change_note'),
    publishedBy: uuid('published_by')
      .notNull()
      .references(() => actors.id),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'knowledge_item_revision_pk', columns: [t.workspaceId, t.itemId, t.revisionNo] }),
    itemFk: foreignKey({
      name: 'knowledge_item_revision_item_fk',
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [knowledgeItems.workspaceId, knowledgeItems.id],
    }).onDelete('restrict'),
    revisionCheck: check('knowledge_item_revision_no_check', sql`${t.revisionNo} >= 1`),
    titleCheck: check(
      'knowledge_item_revision_title_check',
      sql`char_length(${t.title}) between 1 and 200 and btrim(${t.title}) <> ''`,
    ),
    typeCheck: check(
      'knowledge_item_revision_type_code_check',
      sql`${t.typeCode} in ('anomaly','needs_check','behavior_note','guideline')`,
    ),
    textCheck: check(
      'knowledge_item_revision_text_check',
      sql`coalesce(char_length(${t.observation}), 0) <= ${sql.raw(String(ITEM_TEXT_MAX))} and coalesce(char_length(${t.expected}), 0) <= ${sql.raw(String(ITEM_TEXT_MAX))} and coalesce(char_length(${t.analysisOpinion}), 0) <= ${sql.raw(String(ITEM_TEXT_MAX))} and coalesce(char_length(${t.improvement}), 0) <= ${sql.raw(String(ITEM_TEXT_MAX))}`,
    ),
    contentCheck: check(
      'knowledge_item_revision_content_check',
      sql`btrim(coalesce(${t.observation}, '')) <> '' or btrim(coalesce(${t.expected}, '')) <> ''`,
    ),
  }),
);

export const itemRevisionEvidence = knowledgeSchema.table(
  'item_revision_evidence',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemId: uuid('item_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    ordinal: integer('ordinal').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceOwner: text('source_owner').notNull(),
    sourceRef: text('source_ref').notNull(),
    sourceVersion: text('source_version'),
    contentHash: text('content_hash'),
    locator: text('locator'),
    note: text('note'),
  },
  (t) => ({
    pk: primaryKey({
      name: 'item_revision_evidence_pk',
      columns: [t.workspaceId, t.itemId, t.revisionNo, t.ordinal],
    }),
    revisionFk: foreignKey({
      name: 'item_revision_evidence_revision_fk',
      columns: [t.workspaceId, t.itemId, t.revisionNo],
      foreignColumns: [
        knowledgeItemRevisions.workspaceId,
        knowledgeItemRevisions.itemId,
        knowledgeItemRevisions.revisionNo,
      ],
    }).onDelete('restrict'),
    ordinalCheck: check('item_revision_evidence_ordinal_check', sql`${t.ordinal} >= 1`),
    kindCheck: check(
      'item_revision_evidence_source_kind_check',
      sql`${t.sourceKind} in ('log_file','spec','image','validation_run','other')`,
    ),
    sourceCheck: check(
      'item_revision_evidence_source_check',
      sql`btrim(${t.sourceOwner}) <> '' and btrim(${t.sourceRef}) <> ''`,
    ),
    noteCheck: check('item_revision_evidence_note_check', sql`coalesce(char_length(${t.note}), 0) <= 500`),
  }),
);

export const itemAssessmentEvents = knowledgeSchema.table(
  'item_assessment_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemId: uuid('item_id').notNull(),
    basedOnRevisionNo: integer('based_on_revision_no').notNull(),
    dimension: text('dimension').notNull(),
    priorState: text('prior_state').notNull(),
    newState: text('new_state').notNull(),
    rationale: text('rationale').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdUq: unique('item_assessment_event_workspace_id_id_uq').on(t.workspaceId, t.id),
    itemIdx: index('item_assessment_event_item_idx').on(t.workspaceId, t.itemId, t.observedAt),
    itemFk: foreignKey({
      name: 'item_assessment_event_item_fk',
      columns: [t.workspaceId, t.itemId],
      foreignColumns: [knowledgeItems.workspaceId, knowledgeItems.id],
    }).onDelete('restrict'),
    revisionFk: foreignKey({
      name: 'item_assessment_event_revision_fk',
      columns: [t.workspaceId, t.itemId, t.basedOnRevisionNo],
      foreignColumns: [
        knowledgeItemRevisions.workspaceId,
        knowledgeItemRevisions.itemId,
        knowledgeItemRevisions.revisionNo,
      ],
    }).onDelete('restrict'),
    dimensionCheck: check(
      'item_assessment_event_states_check',
      sql`(${t.dimension} = 'verification' and ${t.priorState} in ${sql.raw(VERIFICATION_STATES)} and ${t.newState} in ${sql.raw(VERIFICATION_STATES)}) or (${t.dimension} = 'processing' and ${t.priorState} in ${sql.raw(PROCESSING_STATES)} and ${t.newState} in ${sql.raw(PROCESSING_STATES)})`,
    ),
    rationaleCheck: check(
      'item_assessment_event_rationale_check',
      sql`char_length(${t.rationale}) between 1 and 2000 and btrim(${t.rationale}) <> ''`,
    ),
  }),
);

export const itemLinks = knowledgeSchema.table(
  'item_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    sourceItemId: uuid('source_item_id').notNull(),
    targetItemId: uuid('target_item_id').notNull(),
    linkKind: text('link_kind').notNull(),
    // `derived_from`: the revision of the target (the original) the new item was derived from.
    sourceRevisionNo: integer('source_revision_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
  },
  (t) => ({
    workspaceIdUq: unique('item_link_workspace_id_id_uq').on(t.workspaceId, t.id),
    pairUq: uniqueIndex('item_link_pair_uq').on(t.workspaceId, t.sourceItemId, t.targetItemId, t.linkKind),
    targetIdx: index('item_link_target_idx').on(t.workspaceId, t.targetItemId),
    sourceFk: foreignKey({
      name: 'item_link_source_fk',
      columns: [t.workspaceId, t.sourceItemId],
      foreignColumns: [knowledgeItems.workspaceId, knowledgeItems.id],
    }).onDelete('restrict'),
    targetFk: foreignKey({
      name: 'item_link_target_fk',
      columns: [t.workspaceId, t.targetItemId],
      foreignColumns: [knowledgeItems.workspaceId, knowledgeItems.id],
    }).onDelete('restrict'),
    revisionFk: foreignKey({
      name: 'item_link_target_revision_fk',
      columns: [t.workspaceId, t.targetItemId, t.sourceRevisionNo],
      foreignColumns: [
        knowledgeItemRevisions.workspaceId,
        knowledgeItemRevisions.itemId,
        knowledgeItemRevisions.revisionNo,
      ],
    }).onDelete('restrict'),
    kindCheck: check('item_link_kind_check', sql`${t.linkKind} in ('derived_from','related')`),
    selfCheck: check('item_link_not_self_check', sql`${t.sourceItemId} <> ${t.targetItemId}`),
    revisionCheck: check(
      'item_link_revision_check',
      sql`(${t.linkKind} = 'derived_from') = (${t.sourceRevisionNo} is not null)`,
    ),
  }),
);

// Catalog import staging (#1195 a, design v0.6 §6.2 steps ①–③): an uploaded file is parsed into rows, mapped and
// validated here; nothing in these tables touches the catalog. The file bytes are not stored (name, size, type and
// sha256 only). The runtime role has SELECT/INSERT/UPDATE, no DELETE (migration of #1195 a).
const IMPORT_ENTITY_TYPES = "('vendor','process','model','software')";
const IMPORT_JOB_STATUSES =
  "('uploaded','mapped','validated','review_required','applying','completed','partial_failure','failed','cancelled')";
const IMPORT_PLAN_STATES = "('pending','new','unchanged','update','conflict','error')";
const IMPORT_APPLY_STATUSES =
  "('applied','unchanged','skipped','excluded','unresolved','conflict','failed')";
const IMPORT_RESOLUTIONS = "('skip','map','create','abort')";

export const catalogImportJobs = knowledgeSchema.table(
  'catalog_import_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    entityType: text('entity_type').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    fileType: text('file_type').notNull(),
    fileSha256: text('file_sha256').notNull(),
    headers: jsonb('headers').notNull(),
    mappingJson: jsonb('mapping_json'),
    status: text('status').notNull().default('uploaded'),
    planVersion: integer('plan_version').notNull().default(1),
    sealedPlanHash: text('sealed_plan_hash'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    // Incremented by every mapping and validation: a resolution counts only for the generation it was written in.
    validationGeneration: integer('validation_generation').notNull().default(0),
    // Apply pass (#1195 b): 0 before the seal, 1 after it, +1 for each retry of failed rows.
    applyPass: integer('apply_pass').notNull().default(0),
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
    workspaceIdUq: unique('catalog_import_job_workspace_id_id_uq').on(t.workspaceId, t.id),
    entityCheck: check(
      'catalog_import_job_entity_type_check',
      sql`${t.entityType} in ${sql.raw(IMPORT_ENTITY_TYPES)}`,
    ),
    fileTypeCheck: check('catalog_import_job_file_type_check', sql`${t.fileType} in ('csv','xlsx')`),
    statusCheck: check(
      'catalog_import_job_status_check',
      sql`${t.status} in ${sql.raw(IMPORT_JOB_STATUSES)}`,
    ),
    planVersionCheck: check('catalog_import_job_plan_version_check', sql`${t.planVersion} >= 1`),
    versionCheck: check('catalog_import_job_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const catalogImportRows = knowledgeSchema.table(
  'catalog_import_row',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    jobId: uuid('job_id').notNull(),
    rowNo: integer('row_no').notNull(),
    rawJson: jsonb('raw_json').notNull(),
    // Immutable after upload: cell errors found while reading the file (`formula`, `merged`, `unsupported_cell`).
    parseErrors: jsonb('parse_errors').notNull().default(sql`'[]'::jsonb`),
    normalizedJson: jsonb('normalized_json'),
    validationErrors: jsonb('validation_errors').notNull().default(sql`'[]'::jsonb`),
    planState: text('plan_state').notNull().default('pending'),
    targetId: uuid('target_id'),
    targetVersion: integer('target_version'),
    planHash: text('plan_hash'),
    applyStatus: text('apply_status'),
    applyError: text('apply_error'),
    // The pass of the job (`apply_pass`) in which the row was last attempted.
    applyPass: integer('apply_pass'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    resultTargetId: uuid('result_target_id'),
  },
  (t) => ({
    pk: primaryKey({ name: 'catalog_import_row_pk', columns: [t.workspaceId, t.jobId, t.rowNo] }),
    jobFk: foreignKey({
      name: 'catalog_import_row_job_fk',
      columns: [t.workspaceId, t.jobId],
      foreignColumns: [catalogImportJobs.workspaceId, catalogImportJobs.id],
    }).onDelete('restrict'),
    planStateIdx: index('catalog_import_row_plan_state_idx').on(t.workspaceId, t.jobId, t.planState),
    planStateCheck: check(
      'catalog_import_row_plan_state_check',
      sql`${t.planState} in ${sql.raw(IMPORT_PLAN_STATES)}`,
    ),
    rowNoCheck: check('catalog_import_row_row_no_check', sql`${t.rowNo} >= 1`),
    applyStatusCheck: check(
      'catalog_import_row_apply_status_check',
      sql`${t.applyStatus} is null or ${t.applyStatus} in ${sql.raw(IMPORT_APPLY_STATUSES)}`,
    ),
  }),
);

export const catalogImportResolutions = knowledgeSchema.table(
  'catalog_import_resolution',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    jobId: uuid('job_id').notNull(),
    rowNo: integer('row_no').notNull(),
    resolution: text('resolution').notNull(),
    mapTargetId: uuid('map_target_id'),
    expectedTargetVersion: integer('expected_target_version'),
    // The job's validation generation when written; stale once the job is mapped or validated again.
    basedOnValidation: integer('based_on_validation').notNull().default(0),
    resolvedBy: uuid('resolved_by')
      .notNull()
      .references(() => actors.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'catalog_import_resolution_pk', columns: [t.workspaceId, t.jobId, t.rowNo] }),
    rowFk: foreignKey({
      name: 'catalog_import_resolution_row_fk',
      columns: [t.workspaceId, t.jobId, t.rowNo],
      foreignColumns: [catalogImportRows.workspaceId, catalogImportRows.jobId, catalogImportRows.rowNo],
    }).onDelete('restrict'),
    resolutionCheck: check(
      'catalog_import_resolution_resolution_check',
      sql`${t.resolution} in ${sql.raw(IMPORT_RESOLUTIONS)}`,
    ),
  }),
);

// Model spec (design v0.6 §15, #1196 a): the model's spec revision is the source of truth. A published revision and
// its modules/events/relations never change (the runtime role holds SELECT and INSERT only, see migration 0091).
const SPEC_STATES = "('draft','published','rejected')";

export const modelSpecRevisions = knowledgeSchema.table(
  'model_spec_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    modelId: uuid('model_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    state: text('state').notNull(),
    // `{ docLabel, docVersion, link? }` (§15.5): where the content was read from, never a file.
    sourceDocRef: jsonb('source_doc_ref').notNull(),
    // SHA-256 of the normalised submitted content; null until published.
    contentSha256: text('content_sha256'),
    schemaVersion: integer('schema_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    publishedBy: uuid('published_by').references(() => actors.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Version of the draft for the write actions' compare-and-set (#1196 b1); only a draft's version moves.
    rowVersion: integer('row_version').notNull().default(1),
    // Why a draft was rejected (≤ 500); who and when are in the audit row only.
    rejectReason: text('reject_reason'),
  },
  (t) => ({
    workspaceIdUq: unique('model_spec_revision_workspace_id_id_uq').on(t.workspaceId, t.id),
    revisionUq: uniqueIndex('model_spec_revision_workspace_model_revision_no_uq').on(
      t.workspaceId,
      t.modelId,
      t.revisionNo,
    ),
    modelFk: foreignKey({
      name: 'model_spec_revision_model_fk',
      columns: [t.workspaceId, t.modelId],
      foreignColumns: [equipmentModels.workspaceId, equipmentModels.id],
    }).onDelete('restrict'),
    // One open draft per model (#1196 b1).
    openDraftUq: uniqueIndex('model_spec_revision_open_draft_uq')
      .on(t.workspaceId, t.modelId)
      .where(sql`${t.state} = 'draft'`),
    rejectReasonCheck: check(
      'model_spec_revision_reject_reason_check',
      sql`${t.rejectReason} is null or char_length(${t.rejectReason}) <= 500`,
    ),
    stateIdx: index('model_spec_revision_model_state_idx').on(t.workspaceId, t.modelId, t.state, t.revisionNo),
    revisionNoCheck: check('model_spec_revision_no_check', sql`${t.revisionNo} >= 1`),
    stateCheck: check('model_spec_revision_state_check', sql`${t.state} in ${sql.raw(SPEC_STATES)}`),
    schemaVersionCheck: check('model_spec_revision_schema_version_check', sql`${t.schemaVersion} >= 1`),
    sourceDocCheck: check(
      'model_spec_revision_source_doc_ref_check',
      sql`jsonb_typeof(${t.sourceDocRef}) = 'object' and coalesce(jsonb_typeof(${t.sourceDocRef} -> 'docLabel'), '') = 'string' and coalesce(jsonb_typeof(${t.sourceDocRef} -> 'docVersion'), '') = 'string' and (${t.sourceDocRef} - 'docLabel' - 'docVersion' - 'link') = '{}'::jsonb and (not (${t.sourceDocRef} ? 'link') or jsonb_typeof(${t.sourceDocRef} -> 'link') = 'string')`,
    ),
    hashCheck: check(
      'model_spec_revision_content_sha256_check',
      sql`${t.contentSha256} is null or ${t.contentSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    publishedCheck: check(
      'model_spec_revision_published_check',
      sql`(${t.state} = 'published') = (${t.publishedAt} is not null) and (${t.state} = 'published') = (${t.publishedBy} is not null) and (${t.state} <> 'published' or ${t.contentSha256} is not null)`,
    ),
  }),
);

export const specModules = knowledgeSchema.table(
  'spec_module',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    specRevId: uuid('spec_rev_id').notNull(),
    moduleKey: text('module_key').notNull(),
    name: text('name').notNull(),
    parentModuleId: uuid('parent_module_id'),
  },
  (t) => ({
    workspaceIdUq: unique('spec_module_workspace_id_id_uq').on(t.workspaceId, t.id),
    // Target of the same-revision composite FKs below (a parent, an event's module).
    revisionIdUq: unique('spec_module_workspace_rev_id_uq').on(t.workspaceId, t.specRevId, t.id),
    keyUq: uniqueIndex('spec_module_workspace_rev_module_key_uq').on(t.workspaceId, t.specRevId, t.moduleKey),
    revisionFk: foreignKey({
      name: 'spec_module_revision_fk',
      columns: [t.workspaceId, t.specRevId],
      foreignColumns: [modelSpecRevisions.workspaceId, modelSpecRevisions.id],
    }).onDelete('restrict'),
    parentFk: foreignKey({
      name: 'spec_module_parent_fk',
      columns: [t.workspaceId, t.specRevId, t.parentModuleId],
      foreignColumns: [t.workspaceId, t.specRevId, t.id],
    }).onDelete('restrict'),
    keyCheck: check('spec_module_key_check', sql`char_length(${t.moduleKey}) between 1 and 200`),
    nameCheck: check(
      'spec_module_name_check',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX))}`,
    ),
    notSelfCheck: check('spec_module_not_self_parent_check', sql`${t.parentModuleId} is distinct from ${t.id}`),
  }),
);

export const specEvents = knowledgeSchema.table(
  'spec_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    specRevId: uuid('spec_rev_id').notNull(),
    moduleId: uuid('module_id').notNull(),
    eventKey: text('event_key').notNull(),
    name: text('name').notNull(),
    // `fields_json` v1: `{ name, type, unit?, allowedValues?, description }[]`, validated by the write node.
    fieldsJson: jsonb('fields_json').notNull(),
    triggerRule: text('trigger_rule'),
    // A pointer to the detail section of the source document (free text, not a file).
    detailDocRef: text('detail_doc_ref'),
  },
  (t) => ({
    workspaceIdUq: unique('spec_event_workspace_id_id_uq').on(t.workspaceId, t.id),
    revisionIdUq: unique('spec_event_workspace_rev_id_uq').on(t.workspaceId, t.specRevId, t.id),
    keyUq: uniqueIndex('spec_event_workspace_rev_module_event_key_uq').on(
      t.workspaceId,
      t.specRevId,
      t.moduleId,
      t.eventKey,
    ),
    revisionFk: foreignKey({
      name: 'spec_event_revision_fk',
      columns: [t.workspaceId, t.specRevId],
      foreignColumns: [modelSpecRevisions.workspaceId, modelSpecRevisions.id],
    }).onDelete('restrict'),
    moduleFk: foreignKey({
      name: 'spec_event_module_fk',
      columns: [t.workspaceId, t.specRevId, t.moduleId],
      foreignColumns: [specModules.workspaceId, specModules.specRevId, specModules.id],
    }).onDelete('restrict'),
    keyCheck: check('spec_event_key_check', sql`char_length(${t.eventKey}) between 1 and 200`),
    nameCheck: check(
      'spec_event_name_check',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(NAME_MAX))}`,
    ),
    fieldsCheck: check('spec_event_fields_json_check', sql`jsonb_typeof(${t.fieldsJson}) = 'array'`),
  }),
);

export const specEventRelations = knowledgeSchema.table(
  'spec_event_relation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    specRevId: uuid('spec_rev_id').notNull(),
    sourceEventId: uuid('source_event_id').notNull(),
    predicate: text('predicate').notNull(),
    targetEventId: uuid('target_event_id').notNull(),
    ruleRef: text('rule_ref'),
  },
  (t) => ({
    workspaceIdUq: unique('spec_event_relation_workspace_id_id_uq').on(t.workspaceId, t.id),
    edgeUq: uniqueIndex('spec_event_relation_edge_uq').on(
      t.workspaceId,
      t.specRevId,
      t.sourceEventId,
      t.predicate,
      t.targetEventId,
    ),
    revisionFk: foreignKey({
      name: 'spec_event_relation_revision_fk',
      columns: [t.workspaceId, t.specRevId],
      foreignColumns: [modelSpecRevisions.workspaceId, modelSpecRevisions.id],
    }).onDelete('restrict'),
    sourceFk: foreignKey({
      name: 'spec_event_relation_source_fk',
      columns: [t.workspaceId, t.specRevId, t.sourceEventId],
      foreignColumns: [specEvents.workspaceId, specEvents.specRevId, specEvents.id],
    }).onDelete('restrict'),
    targetFk: foreignKey({
      name: 'spec_event_relation_target_fk',
      columns: [t.workspaceId, t.specRevId, t.targetEventId],
      foreignColumns: [specEvents.workspaceId, specEvents.specRevId, specEvents.id],
    }).onDelete('restrict'),
    predicateCheck: check(
      'spec_event_relation_predicate_check',
      sql`char_length(${t.predicate}) between 1 and 100 and btrim(${t.predicate}) <> ''`,
    ),
    notSelfCheck: check('spec_event_relation_not_self_check', sql`${t.sourceEventId} <> ${t.targetEventId}`),
  }),
);

// SW change rows (design v0.6 §15.2, #1196 c): what differs for a software version from the published model spec.
// Append-only for the runtime role: INSERT, and UPDATE of the flag / retire / version columns only (migration 0096
// grant + `spec_sw_change_guard`); no DELETE. `release_order` is mutable, so the range is judged when read.
const SPEC_CHANGE_TARGET_KINDS = "('module','event','field','relation')";
const SPEC_CHANGE_KINDS = "('added','removed','changed','behavior')";

export const specSwChanges = knowledgeSchema.table(
  'spec_sw_change',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    modelId: uuid('model_id').notNull(),
    // The change applies FROM this software version (by release_order) up to, not including, `endsBeforeSoftwareId`.
    softwareId: uuid('software_id').notNull(),
    endsBeforeSoftwareId: uuid('ends_before_software_id'),
    targetKind: text('target_kind').notNull(),
    // Escaped stable key, grammar in `domain/spec-target-key.ts` (design §15.2).
    targetKey: text('target_key').notNull(),
    changeKind: text('change_kind').notNull(),
    // closed v1: added {after}, removed {before}, changed {before, after}, behavior {}.
    changeJson: jsonb('change_json').notNull(),
    note: text('note'),
    // The published revision number the change was written against (server-set).
    basedOnRevNo: integer('based_on_rev_no').notNull(),
    evidenceRef: text('evidence_ref'),
    needsRevalidation: boolean('needs_revalidation').notNull().default(false),
    // The revision number that last touched the key (the cause of the flag).
    revalidationRevNo: integer('revalidation_rev_no'),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    retiredBy: uuid('retired_by').references(() => actors.id),
    // Set only when the retire carried a replacement.
    retiredByChangeId: uuid('retired_by_change_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rowVersion: integer('row_version').notNull().default(1),
  },
  (t) => ({
    workspaceIdUq: unique('spec_sw_change_workspace_id_id_uq').on(t.workspaceId, t.id),
    workspaceModelIdUq: unique('spec_sw_change_workspace_model_id_uq').on(t.workspaceId, t.modelId, t.id),
    modelFk: foreignKey({
      name: 'spec_sw_change_model_fk',
      columns: [t.workspaceId, t.modelId],
      foreignColumns: [equipmentModels.workspaceId, equipmentModels.id],
    }).onDelete('restrict'),
    softwareFk: foreignKey({
      name: 'spec_sw_change_software_fk',
      columns: [t.workspaceId, t.modelId, t.softwareId],
      foreignColumns: [softwareVersions.workspaceId, softwareVersions.modelId, softwareVersions.id],
    }).onDelete('restrict'),
    endsBeforeFk: foreignKey({
      name: 'spec_sw_change_ends_before_fk',
      columns: [t.workspaceId, t.modelId, t.endsBeforeSoftwareId],
      foreignColumns: [softwareVersions.workspaceId, softwareVersions.modelId, softwareVersions.id],
    }).onDelete('restrict'),
    retiredByChangeFk: foreignKey({
      name: 'spec_sw_change_retired_by_change_fk',
      columns: [t.workspaceId, t.modelId, t.retiredByChangeId],
      foreignColumns: [t.workspaceId, t.modelId, t.id],
    }).onDelete('restrict'),
    openKeyIdx: index('spec_sw_change_open_key_idx')
      .on(t.workspaceId, t.modelId, t.targetKey)
      .where(sql`${t.retiredAt} is null`),
    listIdx: index('spec_sw_change_model_created_idx').on(t.workspaceId, t.modelId, t.createdAt, t.id),
    targetKindCheck: check('spec_sw_change_target_kind_check', sql`${t.targetKind} in ${sql.raw(SPEC_CHANGE_TARGET_KINDS)}`),
    changeKindCheck: check('spec_sw_change_change_kind_check', sql`${t.changeKind} in ${sql.raw(SPEC_CHANGE_KINDS)}`),
    targetKeyCheck: check('spec_sw_change_target_key_check', sql`char_length(${t.targetKey}) between 1 and 1200`),
    // 17408 = the app's 16 KiB compact cap (SPEC_CHANGE_JSON_MAX_BYTES) plus headroom for jsonb ::text separator
    // spaces (≤ ~420 bytes over the closed v1 shapes); see migration 0096 for the bound.
    changeJsonCheck: check(
      'spec_sw_change_change_json_check',
      sql`jsonb_typeof(${t.changeJson}) = 'object' and octet_length(${t.changeJson}::text) <= 17408`,
    ),
    noteCheck: check('spec_sw_change_note_check', sql`${t.note} is null or char_length(${t.note}) <= 1000`),
    evidenceCheck: check('spec_sw_change_evidence_ref_check', sql`${t.evidenceRef} is null or char_length(${t.evidenceRef}) <= 500`),
    basedOnCheck: check('spec_sw_change_based_on_check', sql`${t.basedOnRevNo} >= 1`),
    revalidationCheck: check(
      'spec_sw_change_revalidation_check',
      sql`(${t.revalidationRevNo} is null or ${t.revalidationRevNo} >= 1) and (not ${t.needsRevalidation} or ${t.revalidationRevNo} is not null)`,
    ),
    retiredCheck: check(
      'spec_sw_change_retired_check',
      sql`((${t.retiredAt} is null) = (${t.retiredBy} is null)) and (${t.retiredByChangeId} is null or ${t.retiredAt} is not null) and (${t.retiredAt} is null or not ${t.needsRevalidation})`,
    ),
    versionCheck: check('spec_sw_change_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

// ---- concept mapping (#1196 e, design v0.6 §15.2/15.4) ---------------------------------------------------------------
// A concept row alone asserts nothing; equivalence exists only as a HUMAN-CONFIRMED `equivalent` mapping row. Targets are
// pointed to by stable key (`domain/spec-target-key.ts`), never by a spec row id, so a mapping survives new revisions.

const CONCEPT_KINDS = "('module','event')";
const CONCEPT_RELATIONS = "('equivalent','related')";
const CONCEPT_REVIEW_STATES = "('proposed','confirmed','rejected')";

export const commonConcepts = knowledgeSchema.table(
  'common_concept',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    kind: text('kind').notNull(),
    canonicalLabel: text('canonical_label').notNull(),
    // `toCodeKey(canonicalLabel)`: the concept's identity inside (workspace, kind).
    labelKey: text('label_key').notNull(),
    description: text('description'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rowVersion: integer('row_version').notNull().default(1),
  },
  (t) => ({
    workspaceIdUq: unique('common_concept_workspace_id_id_uq').on(t.workspaceId, t.id),
    // Target of the mapping's composite FK: a mapping's target kind must be its concept's kind.
    workspaceKindUq: unique('common_concept_workspace_id_kind_uq').on(t.workspaceId, t.id, t.kind),
    labelUq: unique('common_concept_workspace_kind_label_key_uq').on(t.workspaceId, t.kind, t.labelKey),
    kindCheck: check('common_concept_kind_check', sql`${t.kind} in ${sql.raw(CONCEPT_KINDS)}`),
    labelCheck: check(
      'common_concept_label_check',
      sql`char_length(${t.canonicalLabel}) between 1 and 200 and char_length(${t.labelKey}) between 1 and 200`,
    ),
    descriptionCheck: check('common_concept_description_check', sql`${t.description} is null or char_length(${t.description}) <= 1000`),
    versionCheck: check('common_concept_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

export const specConceptMappings = knowledgeSchema.table(
  'spec_concept_mapping',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    conceptId: uuid('concept_id').notNull(),
    modelId: uuid('model_id').notNull(),
    targetKind: text('target_kind').notNull(),
    // Escaped stable key (`module_key` or `module_key/event_key`), grammar in `domain/spec-target-key.ts`.
    targetKey: text('target_key').notNull(),
    relationKind: text('relation_kind').notNull(),
    reviewState: text('review_state').notNull().default('proposed'),
    origin: text('origin').notNull(),
    // Only a `similarity` origin carries a score / basis (a proposal's evidence, never a verdict).
    similarityScore: doublePrecision('similarity_score'),
    // closed v1: { name_trgm?: number, field_overlap?: number }.
    similarityBasis: jsonb('similarity_basis'),
    rejectReason: text('reject_reason'),
    proposedBy: uuid('proposed_by')
      .notNull()
      .references(() => actors.id),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid('reviewed_by').references(() => actors.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rowVersion: integer('row_version').notNull().default(1),
  },
  (t) => ({
    workspaceIdUq: unique('spec_concept_mapping_workspace_id_id_uq').on(t.workspaceId, t.id),
    conceptFk: foreignKey({
      name: 'spec_concept_mapping_concept_fk',
      columns: [t.workspaceId, t.conceptId, t.targetKind],
      foreignColumns: [commonConcepts.workspaceId, commonConcepts.id, commonConcepts.kind],
    }).onDelete('restrict'),
    modelFk: foreignKey({
      name: 'spec_concept_mapping_model_fk',
      columns: [t.workspaceId, t.modelId],
      foreignColumns: [equipmentModels.workspaceId, equipmentModels.id],
    }).onDelete('restrict'),
    // One OPEN (proposed or confirmed) row per pair; a REJECTED pair stays as one memory row and is never re-proposed.
    openUq: uniqueIndex('spec_concept_mapping_open_uq')
      .on(t.workspaceId, t.conceptId, t.modelId, t.targetKey)
      .where(sql`${t.reviewState} in ('proposed','confirmed')`),
    rejectedUq: uniqueIndex('spec_concept_mapping_rejected_uq')
      .on(t.workspaceId, t.conceptId, t.modelId, t.targetKey)
      .where(sql`${t.reviewState} = 'rejected'`),
    // A target is the same thing as at most one concept: one confirmed `equivalent` per (model, target).
    equivalentUq: uniqueIndex('spec_concept_mapping_confirmed_equivalent_uq')
      .on(t.workspaceId, t.modelId, t.targetKey)
      .where(sql`${t.reviewState} = 'confirmed' and ${t.relationKind} = 'equivalent'`),
    modelIdx: index('spec_concept_mapping_model_idx').on(t.workspaceId, t.modelId, t.targetKey),
    conceptIdx: index('spec_concept_mapping_concept_idx').on(t.workspaceId, t.conceptId, t.reviewState),
    targetKindCheck: check('spec_concept_mapping_target_kind_check', sql`${t.targetKind} in ${sql.raw(CONCEPT_KINDS)}`),
    targetKeyCheck: check('spec_concept_mapping_target_key_check', sql`char_length(${t.targetKey}) between 1 and 1200`),
    relationCheck: check('spec_concept_mapping_relation_kind_check', sql`${t.relationKind} in ${sql.raw(CONCEPT_RELATIONS)}`),
    stateCheck: check('spec_concept_mapping_review_state_check', sql`${t.reviewState} in ${sql.raw(CONCEPT_REVIEW_STATES)}`),
    originCheck: check('spec_concept_mapping_origin_check', sql`${t.origin} in ('human','similarity')`),
    similarityCheck: check(
      'spec_concept_mapping_similarity_check',
      sql`((${t.origin} = 'similarity' and ${t.similarityScore} is not null and ${t.similarityBasis} is not null) or (${t.origin} = 'human' and ${t.similarityScore} is null and ${t.similarityBasis} is null)) and (${t.similarityScore} is null or ${t.similarityScore} between 0 and 1) and (${t.similarityBasis} is null or jsonb_typeof(${t.similarityBasis}) = 'object')`,
    ),
    reviewCheck: check(
      'spec_concept_mapping_review_check',
      sql`((${t.reviewState} = 'proposed') = (${t.reviewedBy} is null and ${t.reviewedAt} is null)) and ((${t.reviewState} = 'rejected') = (${t.rejectReason} is not null)) and (${t.rejectReason} is null or char_length(${t.rejectReason}) between 1 and 500)`,
    ),
    versionCheck: check('spec_concept_mapping_row_version_check', sql`${t.rowVersion} >= 1`),
  }),
);

// ---- Item subject link (#1196 f, design v0.6 §15.2) -------------------------------------------------------------------
// The target a knowledge item revision is about, by stable key (no FK to spec rows: a new spec revision keeps the link).
export const itemRevisionSubjects = knowledgeSchema.table(
  'item_revision_subject',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    itemId: uuid('item_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    modelId: uuid('model_id').notNull(),
    targetKind: text('target_kind').notNull(),
    targetKey: text('target_key').notNull(),
    subjectRelation: text('subject_relation').notNull(),
    // The published spec revision the key was checked against at link time; null when the model had none yet.
    specRevNoAtLink: integer('spec_rev_no_at_link'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      name: 'item_revision_subject_pk',
      columns: [t.workspaceId, t.itemId, t.revisionNo, t.modelId, t.targetKind, t.targetKey],
    }),
    revisionFk: foreignKey({
      name: 'item_revision_subject_revision_fk',
      columns: [t.workspaceId, t.itemId, t.revisionNo],
      foreignColumns: [knowledgeItemRevisions.workspaceId, knowledgeItemRevisions.itemId, knowledgeItemRevisions.revisionNo],
    }).onDelete('restrict'),
    modelFk: foreignKey({
      name: 'item_revision_subject_model_fk',
      columns: [t.workspaceId, t.modelId],
      foreignColumns: [equipmentModels.workspaceId, equipmentModels.id],
    }).onDelete('restrict'),
    keyIdx: index('item_revision_subject_key_idx').on(t.workspaceId, t.modelId, t.targetKey),
    targetKindCheck: check('item_revision_subject_target_kind_check', sql`${t.targetKind} in ('module','event')`),
    targetKeyCheck: check('item_revision_subject_target_key_check', sql`char_length(${t.targetKey}) between 1 and 1200`),
    relationCheck: check('item_revision_subject_relation_check', sql`${t.subjectRelation} in ('about','context')`),
    specRevCheck: check('item_revision_subject_spec_rev_check', sql`${t.specRevNoAtLink} is null or ${t.specRevNoAtLink} >= 1`),
  }),
);
