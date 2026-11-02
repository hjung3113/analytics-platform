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
