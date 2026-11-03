/**
 * Log knowledge hub catalog declarations (#1194, design v0.6 §7, ADR-0107): the four paged reads and the twelve
 * write actions of the catalog. Client-safe: declarations, params/data types and filter specs only — the mock
 * half lives in `src/mock/`. The real server (`apps/platform-api/src/modules/log-knowledge`) declares the same ids,
 * keys and filter fields; `apps/platform-api/.../catalog-menu-drift.test.ts` fails when the two differ.
 *
 * Reads speak the table filter model (ADR-0105): every filter travels in `filters`, each field's wire meaning is its
 * `ColumnFilterSpec` below. With no `active` condition a read answers every row; the screen pins `active in [true]`.
 */
import { defineAction, defineEndpoint, menuPermission, type AnyEndpointSpec, type ColumnFilter, type Permission, type ColumnFilterSpec, type PageResult, type PageSort } from '@ap/contracts';

export const LOG_KNOWLEDGE_MENU_ID = 'log-knowledge-catalog';
/** Menu permission of the catalog management menu and of its write actions (design v0.6 §2.1, admin-capability menu). */
export const CATALOG_MANAGE_PERMISSION: Permission = menuPermission('knowledge:catalog-manage');

type Stamps = { id: string; code: string; name: string; active: boolean; version: string; createdAt: string; updatedAt: string };
export type VendorRow = Stamps & { modelCount: number };
export type ProcessRow = Stamps & { modelCount: number };
export type ModelRow = Stamps & { vendorId: string; vendorName: string; processes: { id: string; name: string }[]; softwareCount: number; latestSoftwareLabel: string | null };
export type SoftwareRow = Stamps & { modelId: string; versionLabel: string };

/** Quick search, paging, sorting and the table's filter conditions of one catalog read. */
export type CatalogPageParams = { q: string | null; page: number; pageSize: number; sorting: PageSort[]; filters?: ColumnFilter[] };

export const VENDOR_SORT_IDS = ['code', 'name', 'active', 'modelCount', 'createdAt', 'updatedAt'] as const;
export const PROCESS_SORT_IDS = VENDOR_SORT_IDS;
export const MODEL_SORT_IDS = ['code', 'name', 'vendorName', 'active', 'softwareCount', 'createdAt', 'updatedAt'] as const;
export const SOFTWARE_SORT_IDS = ['versionLabel', 'name', 'active', 'createdAt', 'updatedAt'] as const;

const activeSpec: ColumnFilterSpec = {
  kind: 'enum',
  options: [{ value: 'true', label: '활성' }, { value: 'false', label: '비활성' }],
  ops: ['in', 'notIn'],
  multiple: false,
};
/** Options are data (the other lists), so the wire list is empty; the server accepts any uuid and checks the shape. `id` is the drawer's by-id lookup. */
const idSpec: ColumnFilterSpec = { kind: 'enum', options: [], ops: ['in', 'notIn'] };

/** Filter fields per read (the wire meaning, ADR-0105): the mock and the server refuse a field, operator or value outside it. */
export const vendorFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = { active: activeSpec, id: idSpec };
export const processFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = { active: activeSpec, id: idSpec };
export const modelFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = {
  active: activeSpec,
  id: idSpec,
  vendorId: idSpec,
  // The model's mapped processes: an array cell. `isEmpty` finds unmapped models.
  processes: { kind: 'enum', options: [], ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'], cell: 'many' },
};
export const softwareFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = { active: activeSpec, id: idSpec, modelId: idSpec };

const paramKeys = { q: true, page: true, pageSize: true, sorting: true, filters: true } as const;
const read = <T>(name: string) =>
  defineEndpoint<CatalogPageParams, PageResult<T>>({
    id: `logKnowledge.${name}`, menuId: LOG_KNOWLEDGE_MENU_ID, paramKeys, permission: 'platform:view',
    requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
  });

export const vendorsEndpoint = read<VendorRow>('vendors');
export const processesEndpoint = read<ProcessRow>('processes');
export const modelsEndpoint = read<ModelRow>('models');
export const softwareVersionsEndpoint = read<SoftwareRow>('softwareVersions');

/** The model reads' owning menu (#1197 s1): the explore table and the profile screen, a navHidden child, share it. */
export const LOG_KNOWLEDGE_MODELS_MENU_ID = 'log-knowledge-models';
/** `exploreModels` row: the `models` row plus the published items the model owns directly. */
export type ExploreModelRow = ModelRow & { modelItemCount: number };
/** `modelProfile` data (docs/architecture/platform-api/api/log-knowledge.md §Item reads); `null` when the id is unknown. */
export type ModelProfileData = {
  model: {
    id: string; code: string; name: string; active: boolean;
    vendor: { id: string; code: string; name: string; active: boolean };
    processes: { id: string; code: string; name: string }[]; createdAt: string; updatedAt: string;
  };
  softwareVersions: { id: string; versionLabel: string; name: string; active: boolean; itemCount: number; updatedAt: string }[];
  truncated: boolean;
  modelItems: { total: number };
};
export type ModelProfileParams = { modelId: string };

/** Same filter fields and sort columns as the `models` read. */
export const exploreModelsEndpoint = defineEndpoint<CatalogPageParams, PageResult<ExploreModelRow>>({
  id: 'logKnowledge.exploreModels', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, paramKeys, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export const modelProfileEndpoint = defineEndpoint<ModelProfileParams, ModelProfileData | null>({
  id: 'logKnowledge.modelProfile', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, paramKeys: { modelId: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
/** The model reads in the server's order (`item-endpoints.ts`). */
export const modelEndpointSpecs = [exploreModelsEndpoint, modelProfileEndpoint] as const;

/** What every write answers: the row's identity and its new version. */
export type CatalogSummary = { id: string; code: string; name: string; active: boolean; version: string };

type CodeName = { code: string; name: string };
type SetActiveInput = { id: string; active: boolean };
export type VendorCreateInput = CodeName;
export type VendorUpdateInput = CodeName & { id: string };
export type ModelCreateInput = CodeName & { vendorId: string; processIds: string[] };
export type ModelUpdateInput = CodeName & { id: string; processIds: string[] };
export type SoftwareCreateInput = { modelId: string; versionLabel: string; name: string };
export type SoftwareUpdateInput = { id: string; versionLabel: string; name: string };

const create = <I>(name: string, inputKeys: Record<keyof I & string, true>, invalidates: AnyEndpointSpec[]) =>
  defineAction<I, CatalogSummary>({
    id: `logKnowledge.${name}`, menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys, permission: CATALOG_MANAGE_PERMISSION,
    requiresScope: false, concurrency: 'none', invalidates,
  });
const versioned = <I>(name: string, inputKeys: Record<keyof I & string, true>, invalidates: AnyEndpointSpec[]) =>
  defineAction<I, CatalogSummary>({
    id: `logKnowledge.${name}`, menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys, permission: CATALOG_MANAGE_PERMISSION,
    requiresScope: false, concurrency: 'version', invalidates,
  });

/** Reads each kind of write changes (same lists as the server's). */
const vendorReads = [vendorsEndpoint, modelsEndpoint];
const processReads = [processesEndpoint, modelsEndpoint];
const modelReads = [modelsEndpoint, vendorsEndpoint, processesEndpoint, softwareVersionsEndpoint];
const softwareReads = [softwareVersionsEndpoint, modelsEndpoint];

export const vendorCreate = create<VendorCreateInput>('vendorCreate', { code: true, name: true }, vendorReads);
export const vendorUpdate = versioned<VendorUpdateInput>('vendorUpdate', { id: true, code: true, name: true }, vendorReads);
export const vendorSetActive = versioned<SetActiveInput>('vendorSetActive', { id: true, active: true }, vendorReads);
export const processCreate = create<CodeName>('processCreate', { code: true, name: true }, processReads);
export const processUpdate = versioned<VendorUpdateInput>('processUpdate', { id: true, code: true, name: true }, processReads);
export const processSetActive = versioned<SetActiveInput>('processSetActive', { id: true, active: true }, processReads);
export const modelCreate = create<ModelCreateInput>('modelCreate', { vendorId: true, code: true, name: true, processIds: true }, modelReads);
export const modelUpdate = versioned<ModelUpdateInput>('modelUpdate', { id: true, code: true, name: true, processIds: true }, modelReads);
export const modelSetActive = versioned<SetActiveInput>('modelSetActive', { id: true, active: true }, modelReads);
export const softwareCreate = create<SoftwareCreateInput>('softwareCreate', { modelId: true, versionLabel: true, name: true }, softwareReads);
export const softwareUpdate = versioned<SoftwareUpdateInput>('softwareUpdate', { id: true, versionLabel: true, name: true }, softwareReads);
export const softwareSetActive = versioned<SetActiveInput>('softwareSetActive', { id: true, active: true }, softwareReads);

/** The twelve writes in the server's order (create, update, set-active per kind: vendor, process, model, software). */
export const catalogActionSpecs = [
  vendorCreate, vendorUpdate, vendorSetActive, processCreate, processUpdate, processSetActive,
  modelCreate, modelUpdate, modelSetActive, softwareCreate, softwareUpdate, softwareSetActive,
] as const;
export const catalogEndpointSpecs = [vendorsEndpoint, processesEndpoint, modelsEndpoint, softwareVersionsEndpoint] as const;

// ---- knowledge item reads (ADR-0109, #1197 s2) -------------------------------------------------------------------
// Owned by the `log-knowledge-items` menu; the navHidden detail screen `log-knowledge-item` reads its parent's endpoints.
// The server mirror is `apps/platform-api/src/modules/log-knowledge/item-endpoints.ts`; the drift test compares both.

export const LOG_KNOWLEDGE_ITEMS_MENU_ID = 'log-knowledge-items';

export const ITEM_TYPE_CODES = ['anomaly', 'needs_check', 'behavior_note', 'guideline'] as const;
export const VERIFICATION_STATES = ['not_checked', 'observed', 'verified', 'disputed'] as const;
export const PROCESSING_STATES = ['open', 'under_investigation', 'resolved'] as const;
export const PUBLICATION_STATES = ['published', 'archived'] as const;
export const OWNER_KINDS = ['model', 'software'] as const;
export type ItemTypeCode = (typeof ITEM_TYPE_CODES)[number];
export type VerificationState = (typeof VERIFICATION_STATES)[number];
export type ProcessingState = (typeof PROCESSING_STATES)[number];
export type PublicationState = (typeof PUBLICATION_STATES)[number];

export type ItemOwner = { kind: 'model' | 'software'; modelId: string; modelName: string; softwareId?: string; versionLabel?: string };
export type ItemRow = {
  id: string; itemNo: number; title: string; typeCode: ItemTypeCode; owner: ItemOwner;
  verificationState: VerificationState; processingState: ProcessingState; publicationState: PublicationState;
  latestRevisionNo: number; updatedAt: string;
};
export type ItemEvidence = {
  ordinal: number; sourceKind: string; sourceOwner: string; sourceRef: string; sourceVersion: string | null;
  contentHash: string | null; locator: string | null; note: string | null;
};
export type ItemRevision = {
  revisionNo: number; title: string; typeCode: ItemTypeCode; observation: string | null; expected: string | null;
  analysisOpinion: string | null; improvement: string | null; changeNote: string | null; publishedBy: string; publishedAt: string;
  evidence: ItemEvidence[];
};
export type ItemAssessment = {
  id: string; dimension: 'verification' | 'processing' | 'publication' | string; priorState: string; newState: string;
  rationale: string; actorId: string; basedOnRevisionNo: number; observedAt: string;
};
export type ItemLinkRow = {
  kind: 'derived_from' | 'related'; direction: 'outgoing' | 'incoming'; itemId: string; itemNo: number; title: string;
  owner: ItemOwner; sourceRevisionNo: number | null;
};
export type ItemDetail = {
  item: ItemRow & { version: string; createdBy: string; createdAt: string };
  revision: ItemRevision;
  revisions: { revisionNo: number; title: string; publishedBy: string; publishedAt: string; changeNote: string | null }[];
  assessments: ItemAssessment[];
  links: ItemLinkRow[];
};

export const ITEM_SORT_IDS = ['itemNo', 'title', 'updatedAt'] as const;
const itemEnum = (values: readonly string[], labels: Record<string, string>, multiple?: false): ColumnFilterSpec => ({
  kind: 'enum', options: values.map(value => ({ value, label: labels[value] ?? value })), ops: ['in', 'notIn'], ...(multiple === false ? { multiple: false as const } : {}),
});
export const ITEM_TYPE_LABEL: Record<ItemTypeCode, string> = { anomaly: '이상 사례', needs_check: '확인 필요', behavior_note: '동작 설명', guideline: '작업 기준' };
export const VERIFICATION_LABEL: Record<VerificationState, string> = { not_checked: '미확인', observed: '관찰됨', verified: '검증됨', disputed: '이견 있음' };
export const PROCESSING_LABEL: Record<ProcessingState, string> = { open: '열림', under_investigation: '조사 중', resolved: '해결됨' };
export const PUBLICATION_LABEL: Record<PublicationState, string> = { published: '게시됨', archived: '보관됨' };

/** Filter fields of the item list (wire meaning, ADR-0105). No `publicationState` condition = published items only (the server's rule). */
export const itemFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = {
  ownerKind: itemEnum(OWNER_KINDS, { model: '모델', software: 'SW 버전' }),
  ownerModelId: idSpec,
  ownerSoftwareId: idSpec,
  includeSoftware: { kind: 'enum', options: [{ value: 'true', label: '예' }, { value: 'false', label: '아니오' }], ops: ['in'], multiple: false },
  typeCode: itemEnum(ITEM_TYPE_CODES, ITEM_TYPE_LABEL),
  verificationState: itemEnum(VERIFICATION_STATES, VERIFICATION_LABEL),
  processingState: itemEnum(PROCESSING_STATES, PROCESSING_LABEL),
  publicationState: itemEnum(PUBLICATION_STATES, PUBLICATION_LABEL),
};

export const itemsEndpoint = defineEndpoint<CatalogPageParams, PageResult<ItemRow>>({
  id: 'logKnowledge.items', menuId: LOG_KNOWLEDGE_ITEMS_MENU_ID, paramKeys, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export type ItemDetailParams = { itemId: string; revisionNo?: number };
/** `null` data: an unknown id, another workspace's item, or a revision the item does not have (the outcome set has no `not_found`). */
export const itemDetailEndpoint = defineEndpoint<ItemDetailParams, ItemDetail | null>({
  id: 'logKnowledge.itemDetail', menuId: LOG_KNOWLEDGE_ITEMS_MENU_ID, paramKeys: { itemId: true, revisionNo: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export const itemEndpointSpecs = [itemsEndpoint, itemDetailEndpoint] as const;

// ---- knowledge item writes (ADR-0109, #1197 s3a) -----------------------------------------------------------------
// Owned by the `log-knowledge-items` menu, judged with its own right (`knowledge:item-publish`) although the menu itself
// is `platform:view` — reading is open, publishing is not. The server mirror is
// `apps/platform-api/src/modules/log-knowledge/item-actions.ts`; the drift test compares both.

/** Permission of the five item writes (design v0.6 §2.1): Admin, or a Developer with the workspace grant. Not any menu's entry permission, so the app lists it in its vocabulary. */
export const ITEM_PUBLISH_PERMISSION: Permission = menuPermission('knowledge:item-publish');

export const EVIDENCE_SOURCE_KINDS = ['log_file', 'spec', 'image', 'validation_run', 'other'] as const;
export const ASSESSMENT_DIMENSIONS = ['verification', 'processing'] as const;
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];
export type AssessmentDimension = (typeof ASSESSMENT_DIMENSIONS)[number];
/** Input limits (code points), the server's: migration 0082 CHECKs and the API caps. */
export const ITEM_LIMITS = { title: 200, body: 20000, evidence: 20, evidenceField: 1000, evidenceNote: 500, changeNote: 500, rationale: 2000 } as const;

export type EvidenceInput = {
  sourceKind: EvidenceSourceKind; sourceOwner: string; sourceRef: string;
  sourceVersion?: string | null; contentHash?: string | null; locator?: string | null; note?: string | null;
};
/** The four body texts and the type: `observation` or `expected` must have text (`required_one`). Blank optional texts are stored as null. */
export type ItemContentInput = {
  typeCode: ItemTypeCode; title: string;
  observation?: string | null; expected?: string | null; analysisOpinion?: string | null; improvement?: string | null;
};
/** Exactly one owner (`required_one` on `owner`); never changed afterwards. */
export type ItemOwnerInput = { ownerModelId?: string | null; ownerSoftwareId?: string | null };
export type ItemCreateInput = ItemOwnerInput & ItemContentInput & { evidence?: EvidenceInput[] | null };
export type ItemReviseInput = ItemContentInput & { id: string; evidence?: EvidenceInput[] | null; changeNote: string };
export type ItemAssessInput = { id: string; dimension: AssessmentDimension; newState: string; rationale: string };
export type ItemDeriveInput = ItemOwnerInput & ItemContentInput & { sourceItemId: string; sourceRevisionNo: number };
export type ItemSetArchivedInput = { id: string; archived: boolean };
export type ItemWriteResult = { id: string; itemNo: number };
export type ItemReviseResult = ItemWriteResult & { revisionNo: number };

/** Reads an item write changes — those of its own menu (the engine invalidates only within an action's menu; the model-side counts are a stale-until-refresh limit). */
const itemWriteReads = [itemsEndpoint, itemDetailEndpoint];
const itemWrite = <I, O>(name: string, inputKeys: Record<keyof I & string, true>, concurrency: 'none' | 'version') =>
  defineAction<I, O>({
    id: `logKnowledge.${name}`, menuId: LOG_KNOWLEDGE_ITEMS_MENU_ID, inputKeys, permission: ITEM_PUBLISH_PERMISSION,
    requiresScope: false, concurrency, invalidates: itemWriteReads,
  });
const contentKeys = { typeCode: true, title: true, observation: true, expected: true, analysisOpinion: true, improvement: true } as const;

export const itemCreate = itemWrite<ItemCreateInput, ItemWriteResult>('itemCreate', { ownerModelId: true, ownerSoftwareId: true, ...contentKeys, evidence: true }, 'none');
export const itemRevise = itemWrite<ItemReviseInput, ItemReviseResult>('itemRevise', { id: true, ...contentKeys, evidence: true, changeNote: true }, 'version');
export const itemAssess = itemWrite<ItemAssessInput, ItemWriteResult>('itemAssess', { id: true, dimension: true, newState: true, rationale: true }, 'version');
export const itemDerive = itemWrite<ItemDeriveInput, ItemWriteResult>('itemDerive', { sourceItemId: true, sourceRevisionNo: true, ownerModelId: true, ownerSoftwareId: true, ...contentKeys }, 'none');
export const itemSetArchived = itemWrite<ItemSetArchivedInput, ItemWriteResult>('itemSetArchived', { id: true, archived: true }, 'version');

/** The five item writes in the server's order. */
export const itemActionSpecs = [itemCreate, itemRevise, itemAssess, itemDerive, itemSetArchived] as const;

// ---- catalog import staging (#1195 a/b, design v0.6 §6.2) -----------------------------------------------------
// Specs only (no screen, no mock): the upload itself is a multipart route (`POST /api/v1/log-knowledge/imports`), not a
// menu action. The server mirror is `apps/platform-api/src/modules/log-knowledge/import-actions.ts` /
// `import-endpoints.ts`; the drift test compares both. The actions are judged with the server capability
// `knowledge.catalog.import`; they declare the catalog menu permission (a manager's entry, the server decides).

export const IMPORT_ENTITY_TYPES = ['vendor', 'process', 'model', 'software'] as const;
export const IMPORT_PLAN_STATES = ['pending', 'new', 'unchanged', 'update', 'conflict', 'error'] as const;
export const IMPORT_ROW_SORT_IDS = ['rowNo'] as const;
export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];
export type ImportPlanState = (typeof IMPORT_PLAN_STATES)[number];
export const IMPORT_APPLY_STATUSES = ['applied', 'unchanged', 'skipped', 'excluded', 'unresolved', 'conflict', 'failed'] as const;
export type ImportApplyStatus = (typeof IMPORT_APPLY_STATUSES)[number];
export const IMPORT_RESOLUTIONS = ['skip', 'map', 'create'] as const;
export type ImportResolution = (typeof IMPORT_RESOLUTIONS)[number];
export type ImportJobStatus = 'uploaded' | 'mapped' | 'validated' | 'review_required' | 'applying' | 'completed' | 'partial_failure' | 'failed' | 'cancelled';

export const importRowFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = {
  planState: { kind: 'enum', options: IMPORT_PLAN_STATES.map((value) => ({ value, label: value })), ops: ['in', 'notIn'] },
  applyStatus: { kind: 'enum', options: IMPORT_APPLY_STATUSES.map((value) => ({ value, label: value })), ops: ['in', 'notIn'] },
};

export type ImportDetailParams = { jobId: string; page?: number; pageSize?: number; sorting?: PageSort[]; filters?: ColumnFilter[] };
export type ImportJobView = {
  id: string; entityType: ImportEntityType; fileName: string; fileSize: number; fileType: 'csv' | 'xlsx'; fileSha256: string;
  headers: string[]; mapping: Record<string, string> | null; status: ImportJobStatus; planVersion: number; rowVersion: number;
  createdAt: string; updatedAt: string;
};
export type ImportRowView = {
  rowNo: number; raw: Record<string, string>; normalized: unknown; errors: { field: string; code: string }[];
  planState: ImportPlanState; targetId: string | null; targetVersion: number | null;
  /** The resolution written for the job's current validation (a stale one is not shown). */
  resolution: ImportResolution | null; mapTargetId: string | null;
  applyStatus: ImportApplyStatus | null; applyError: string | null; resultTargetId: string | null;
};
/** Rows per apply outcome; `remaining` = rows still to attempt in the current pass. */
export type ImportApplyCounts = Record<ImportApplyStatus | 'remaining', number>;
/** The outcome set has no `not_found`: an unknown or other-workspace job answers `error` with message `not_found`. */
export type ImportDetail = { job: ImportJobView; rows: ImportRowView[]; total: number; applyCounts: ImportApplyCounts };

export const importDetailEndpoint = defineEndpoint<ImportDetailParams, ImportDetail>({
  id: 'logKnowledge.importDetail', menuId: LOG_KNOWLEDGE_MENU_ID,
  paramKeys: { jobId: true, page: true, pageSize: true, sorting: true, filters: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

export type ImportMapInput = { jobId: string; mapping: Record<string, string> };
export type ImportValidateInput = { jobId: string };
/** Counts and ids only (the replayed answer is capped at 128 KiB). */
export type ImportStepResult = { jobId: string; status: ImportJobStatus; planVersion: number; counts?: Record<ImportPlanState, number> };

export const importMap = defineAction<ImportMapInput, ImportStepResult>({
  id: 'logKnowledge.importMap', menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys: { jobId: true, mapping: true },
  permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, concurrency: 'version', invalidates: [importDetailEndpoint],
});
export const importValidate = defineAction<ImportValidateInput, ImportStepResult>({
  id: 'logKnowledge.importValidate', menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys: { jobId: true },
  permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, concurrency: 'version', invalidates: [importDetailEndpoint],
});

export type ImportResolveInput = { jobId: string; resolutions: { rowNo: number; resolution: ImportResolution; mapTargetId?: string }[] };
export type ImportCancelInput = { jobId: string };
export const importResolve = defineAction<ImportResolveInput, ImportStepResult & { resolved: number }>({
  id: 'logKnowledge.importResolve', menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys: { jobId: true, resolutions: true },
  permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, concurrency: 'version', invalidates: [importDetailEndpoint],
});
export const importCancel = defineAction<ImportCancelInput, ImportStepResult>({
  id: 'logKnowledge.importCancel', menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys: { jobId: true },
  permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, concurrency: 'version', invalidates: [importDetailEndpoint],
});
/** Apply is not a menu action: `POST /api/v1/log-knowledge/imports/:jobId/apply` (seal + resumable apply) and `GET …/report.csv`. */
export const importActionSpecs = [importMap, importValidate, importResolve, importCancel] as const;
export const importEndpointSpecs = [importDetailEndpoint] as const;
