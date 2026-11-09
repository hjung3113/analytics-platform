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

/** The one UUID check of this menu's pages and mock: case-insensitive and anchored, so an upper-case id from a pasted link is accepted like the lower-case one (#1393 Q5). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

export const LOG_KNOWLEDGE_MENU_ID = 'log-knowledge-catalog';
/** Menu permission of the catalog management menu and of its write actions (design v0.6 §2.1, admin-capability menu). */
export const CATALOG_MANAGE_PERMISSION: Permission = menuPermission('knowledge:catalog-manage');

type Stamps = { id: string; code: string; name: string; active: boolean; version: string; createdAt: string; updatedAt: string };
export type VendorRow = Stamps & { modelCount: number };
export type ProcessRow = Stamps & { modelCount: number };
export type ModelRow = Stamps & { vendorId: string; vendorName: string; processes: { id: string; name: string }[]; softwareCount: number; latestSoftwareLabel: string | null };
export type SoftwareRow = Stamps & { modelId: string; versionLabel: string; releaseOrder: number };

/** Quick search, paging, sorting and the table's filter conditions of one catalog read. */
export type CatalogPageParams = { q: string | null; page: number; pageSize: number; sorting: PageSort[]; filters?: ColumnFilter[] };

export const VENDOR_SORT_IDS = ['code', 'name', 'active', 'modelCount', 'createdAt', 'updatedAt'] as const;
export const PROCESS_SORT_IDS = VENDOR_SORT_IDS;
export const MODEL_SORT_IDS = ['code', 'name', 'vendorName', 'active', 'softwareCount', 'createdAt', 'updatedAt'] as const;
export const SOFTWARE_SORT_IDS = ['versionLabel', 'name', 'releaseOrder', 'active', 'createdAt', 'updatedAt'] as const;

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

/** `modelSpec` data (docs/architecture/platform-api/api/log-knowledge.md §Model spec reads); `null` when the model has no published revision. */
export type ModelSpecData = {
  revision: {
    id: string; modelId: string; revisionNo: number; state: 'published'; schemaVersion: number;
    sourceDocRef: { docLabel: string; docVersion: string; link?: string };
    contentSha256: string | null; publishedAt: string | null; publishedBy: string | null;
  };
  /** Flat list; the tree is `parentModuleId` (null = a root module). */
  modules: { id: string; moduleKey: string; name: string; parentModuleId: string | null }[];
  events: { id: string; moduleId: string; eventKey: string; name: string; fields: unknown; triggerRule: string | null; detailDocRef: string | null }[];
  relations: { id: string; sourceEventId: string; predicate: string; targetEventId: string; ruleRef: string | null }[];
};
/** `softwareId` (#1196 c): the version whose effective spec is read; the answer is then `ModelSpecEffective`. */
export type ModelSpecParams = { modelId: string; softwareId?: string };
export type SpecRevisionHeader = {
  id: string; revisionNo: number; state: 'draft' | 'published' | 'rejected'; publishedAt: string | null; publishedBy: string | null;
  contentSha256: string | null; eventCount: number;
  /** `row_version`: the `expectedVersion` of a draft write. */
  version: number;
};
export type ModelSpecRevisionsParams = { modelId: string; page?: number; pageSize?: number };

export type SpecTargetKind = 'module' | 'event' | 'field' | 'relation';
export type SpecChangeKind = 'added' | 'removed' | 'changed' | 'behavior';
/** What touched an entry of the effective spec. */
export type SpecChangeMark = { changeId: string; changeKind: SpecChangeKind; targetKind: SpecTargetKind; targetKey: string };
type SpecMarked = { origin: 'revision' | 'change'; changed: SpecChangeMark[]; needsRevalidation: boolean };
/** `modelSpec` with a `softwareId` and no applicable change: exactly the model spec, flagged `effective: false`. */
export type ModelSpecUnchanged = ModelSpecData & { effective: false };
/** `modelSpec` with a `softwareId` and at least one applicable change (`id`s are null for change-added entries). */
export type ModelSpecEffective = {
  revision: ModelSpecData['revision']; effective: true; softwareId: string;
  modules: (SpecMarked & { id: string | null; moduleKey: string; name: string; parentModuleId: string | null; parentModuleKey: string | null })[];
  events: (SpecMarked & { id: string | null; moduleId: string | null; moduleKey: string; eventKey: string; name: string; fields: unknown; triggerRule: string | null; detailDocRef: string | null })[];
  relations: (SpecMarked & {
    id: string | null; sourceEventId: string | null; targetEventId: string | null; sourceModuleKey: string; sourceEventKey: string;
    predicate: string; targetModuleKey: string; targetEventKey: string; ruleRef: string | null;
  })[];
  /** Changes that could not be applied (the revision moved on); not applied, listed for review. */
  stale: (SpecChangeMark & { reason: 'exists' | 'gone' | 'before_mismatch' | 'parent_missing' | 'malformed'; needsRevalidation: boolean })[];
  /** Targets a `removed` change took out. */
  removed: (SpecChangeMark & { needsRevalidation: boolean })[];
};

export const modelSpecEndpoint = defineEndpoint<ModelSpecParams, ModelSpecData | ModelSpecUnchanged | ModelSpecEffective | null>({
  id: 'logKnowledge.modelSpec', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, paramKeys: { modelId: true, softwareId: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export const modelSpecRevisionsEndpoint = defineEndpoint<ModelSpecRevisionsParams, PageResult<SpecRevisionHeader>>({
  id: 'logKnowledge.modelSpecRevisions', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, paramKeys: { modelId: true, page: true, pageSize: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

/** 명세 커버리지 summary for the spec screen badge (#1496 R-f): counts by state, or why it cannot be computed. A configuration summary, never a pass/fail. Server: log-knowledge/spec-coverage-endpoint.ts. */
export type SpecCoverageState = 'no_rule' | 'unsupported' | 'unknown' | 'partial' | 'covered';
export type SpecCoverageData =
  | { computable: true; counts: Record<SpecCoverageState, number> & { total: number }; coverageDigest: string }
  | { computable: false; reason: 'no_catalog' | 'no_spec' | 'ambiguous_key' | 'no_requirement_ids' | 'unavailable' };
export const specCoverageEndpoint = defineEndpoint<ModelSpecParams, SpecCoverageData | null>({
  id: 'logKnowledge.specCoverage', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, paramKeys: { modelId: true, softwareId: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

// ---- model spec writes and the draft read (ADR-0111, #1196 b1) ---------------------------------------------------
// Owned by the `log-knowledge-models` menu, judged with their own right (`knowledge:spec-publish`; Admin, or a Developer
// with the workspace grant `knowledge.spec.publish`) although the menu is `platform:view`. The server mirror is
// `apps/platform-api/src/modules/log-knowledge/spec-actions.ts` / `spec-endpoints.ts`; the drift test compares both.
// Types only: the mock server answers them with the screen node.

export const SPEC_PUBLISH_PERMISSION: Permission = menuPermission('knowledge:spec-publish');
export const SPEC_FIELD_TYPES = ['string', 'int', 'float', 'bool', 'enum', 'timestamp'] as const;
export type SpecFieldType = (typeof SPEC_FIELD_TYPES)[number];
/** Call caps of `specDraftSave` (the server's `domain/spec-input.ts`): larger specs stream in several calls. */
export const SPEC_SAVE_LIMITS = { rows: 2000, bodyBytes: 512 * 1024, rejectReason: 500 } as const;
export type SpecSourceDocRef = { docLabel: string; docVersion: string; link?: string };
export type SpecFieldInput = { name: string; type: SpecFieldType; unit?: string | null; allowedValues?: string[]; description: string };
export type SpecModuleInput = { name: string; parentModule?: string | null };
export type SpecEventInput = { module: string; name: string; fields?: SpecFieldInput[] | null; triggerRule?: string | null; detailDocRef?: string | null };
export type SpecRelationInput = { sourceModule: string; sourceEvent: string; predicate: string; targetModule: string; targetEvent: string; ruleRef?: string | null };

export type SpecDraftData = {
  revision: {
    id: string; modelId: string; revisionNo: number; state: 'draft'; schemaVersion: number; sourceDocRef: SpecSourceDocRef;
    version: number; createdAt: string; createdBy: string;
  };
  modules: ModelSpecData['modules']; events: ModelSpecData['events']; relations: ModelSpecData['relations'];
};
export type SpecDraftParams = { revisionId: string };
export const specDraftEndpoint = defineEndpoint<SpecDraftParams, SpecDraftData | null>({
  id: 'logKnowledge.specDraft', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, paramKeys: { revisionId: true }, permission: SPEC_PUBLISH_PERMISSION,
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

// ---- SW changes (#1196 c) ----------------------------------------------------------------------------------------
export const SPEC_CHANGE_LIMITS = { changeJsonBytes: 16 * 1024, note: 1000, evidenceRef: 500, openPerModel: 500 } as const;
export type SpecChangeStatus = 'open' | 'retired' | 'all';
export type SpecChangesParams = { modelId: string; softwareId?: string; needsRevalidation?: boolean; status?: SpecChangeStatus; page?: number; pageSize?: number };
export type SpecChangeRow = {
  id: string; softwareId: string; softwareLabel: string; endsBeforeSoftwareId: string | null; endsBeforeLabel: string | null;
  targetKind: SpecTargetKind; targetKey: string; changeKind: SpecChangeKind;
  /** closed v1: added {after}, removed {before}, changed {before, after}, behavior {}. */
  change: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  note: string | null; basedOnRevNo: number; evidenceRef: string | null; needsRevalidation: boolean; revalidationRevNo: number | null;
  retiredAt: string | null; retiredBy: string | null; retiredByChangeId: string | null; createdAt: string; createdBy: string;
  /** `row_version`: the `expectedVersion` of retire / confirm. */
  version: number;
};
export const specChangesEndpoint = defineEndpoint<SpecChangesParams, PageResult<SpecChangeRow>>({
  id: 'logKnowledge.specChanges', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
  paramKeys: { modelId: true, softwareId: true, needsRevalidation: true, status: true, page: true, pageSize: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

// ---- concept mapping (#1196 e, design v0.6 §15.4) ---------------------------------------------------------------
// Equivalence is HUMAN-CONFIRMED only: a mapping is `proposed` until a person confirms it; a similarity suggestion is a
// proposal computed on read, never stored as confirmed. Targets are stable keys (`module_key` or `module_key/event_key`).
// The mock server answers them (`src/mock/concept*.ts`); the spec screen's concept tab and the Item subject picker use them.
export const CONCEPT_KINDS = ['module', 'event'] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];
export const CONCEPT_RELATIONS = ['equivalent', 'related'] as const;
export type ConceptRelation = (typeof CONCEPT_RELATIONS)[number];
export const CONCEPT_REVIEW_STATES = ['proposed', 'confirmed', 'rejected'] as const;
export type ConceptReviewState = (typeof CONCEPT_REVIEW_STATES)[number];
export const CONCEPT_LIMITS = { description: 1000, rejectReason: 500 } as const;
export type ConceptMappingsParams = { modelId?: string; conceptId?: string; reviewState?: ConceptReviewState; kind?: ConceptKind; page?: number; pageSize?: number };
export type ConceptMappingRow = {
  id: string; conceptId: string; conceptLabel: string; kind: ConceptKind; modelId: string; modelName: string;
  targetKind: ConceptKind; targetKey: string;
  /** The target's name in the model's current published spec; null when it is gone. */
  targetName: string | null;
  /** `target_gone`: a later revision removed the key; the row is kept, never deleted. */
  targetState: 'present' | 'target_gone';
  relationKind: ConceptRelation; reviewState: ConceptReviewState; origin: 'human' | 'similarity';
  similarityScore: number | null; similarityBasis: { name_trgm?: number; field_overlap?: number } | null; rejectReason: string | null;
  proposedBy: string; proposedAt: string; reviewedBy: string | null; reviewedAt: string | null;
  /** `row_version`: the `expectedVersion` of confirm / reject. */
  version: number;
};
export const conceptMappingsEndpoint = defineEndpoint<ConceptMappingsParams, PageResult<ConceptMappingRow>>({
  id: 'logKnowledge.conceptMappings', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
  paramKeys: { modelId: true, conceptId: true, reviewState: true, kind: true, page: true, pageSize: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export type ConceptSuggestionsParams = { modelId: string; kind?: ConceptKind; page?: number; pageSize?: number };
/** A proposal for a human to review: never stored, never an equivalence (`proposal` is always true). */
export type ConceptSuggestion = {
  kind: ConceptKind;
  source: { modelId: string; targetKey: string; name: string };
  candidate: { modelId: string; modelName: string; targetKey: string; name: string };
  score: number; basis: { name_trgm: number; field_overlap?: number }; proposal: true;
};
/** The exact compared memberships to reuse, and the targets that still need a proposal. */
export function conceptPairPlan(suggestion: ConceptSuggestion, rows: readonly ConceptMappingRow[]): { conceptId: string | null; existing: ConceptMappingRow[]; missing: ConceptSuggestion['source'][] } {
  const targets = [suggestion.source, suggestion.candidate];
  const compared = rows.filter(r => r.kind === suggestion.kind && r.relationKind === 'equivalent' && r.reviewState !== 'rejected' && targets.some(t => t.modelId === r.modelId && t.targetKey === r.targetKey));
  const anchor = compared.find(r => r.reviewState === 'confirmed') ?? compared.find(r => r.modelId === suggestion.source.modelId) ?? compared[0];
  const existing = anchor ? compared.filter(r => r.conceptId === anchor.conceptId) : [];
  return { conceptId: anchor?.conceptId ?? null, existing, missing: targets.filter(t => !existing.some(r => r.modelId === t.modelId && r.targetKey === t.targetKey)) };
}
/** `truncated`: a scan or suggestion cap cut the list short, so it is incomplete (the server always answers it). */
export type ConceptSuggestionsResult = PageResult<ConceptSuggestion> & { truncated?: boolean };
export const conceptSuggestionsEndpoint = defineEndpoint<ConceptSuggestionsParams, ConceptSuggestionsResult>({
  id: 'logKnowledge.conceptSuggestions', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
  paramKeys: { modelId: true, kind: true, page: true, pageSize: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

// ---- Item subject link (#1196 f, design v0.6 §15.2) ---------------------------------------------------------------
export const ITEM_SUBJECT_LIMITS = { subjects: 20 } as const;
export type SubjectRelation = 'about' | 'context';
export type SubjectState = 'resolved' | 'gone' | 'no_spec';
export type ItemSubject = {
  modelId: string; modelName: string; targetKind: ConceptKind; targetKey: string; subjectRelation: SubjectRelation;
  /** The spec revision the key was checked against at link time; null when the model had no published spec yet. */
  specRevNoAtLink: number | null;
  /** `gone`: the current published revision no longer holds the key; `no_spec`: the model has no published revision. */
  state: SubjectState;
  /** The target's name in the current published spec; null unless `resolved`. */
  targetName: string | null;
};
// ---- Item Event relation record (#1505 S-b, ADR-0125) -------------------------------------------------------------------
export const ITEM_RELATION_LIMITS = { relations: 20 } as const;
export type ItemRelationKind = 'observed' | 'expected';
/** One side of a relation input: the module and event keys (normalised to the stable `MODULE/EVENT` key by the server). */
export type ItemRelationEventInput = { module: string; event: string };
/** `after` is accepted but never stored: the server swaps source and target and keeps `before`. */
export type ItemRelationInput = { kind: ItemRelationKind; source: ItemRelationEventInput; target: ItemRelationEventInput; predicate?: 'before' | 'after' };
export type ItemRelation = {
  ordinal: number; kind: ItemRelationKind; source: string; predicate: 'before'; target: string;
  /** Whether the owner's effective spec held both keys when the record was written. */
  resolved: boolean;
  /** The event's name in the owner's current effective spec; null when it is not there now. */
  sourceLabel: string | null; targetLabel: string | null;
};
export type SpecSubjectItemsParams = { modelId: string; targetKey: string; page?: number; pageSize?: number };
export type SpecSubjectItemRow = ItemRow & { subjectRelation: SubjectRelation };
export const specSubjectItemsEndpoint = defineEndpoint<SpecSubjectItemsParams, PageResult<SpecSubjectItemRow>>({
  id: 'logKnowledge.specSubjectItems', menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
  paramKeys: { modelId: true, targetKey: true, page: true, pageSize: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

/** The model spec reads (#1196 a, b1, c, e, f), after the model reads in the server's order. */
export const modelSpecEndpointSpecs = [
  modelSpecEndpoint, modelSpecRevisionsEndpoint, specDraftEndpoint, specChangesEndpoint, specCoverageEndpoint,
  conceptMappingsEndpoint, conceptSuggestionsEndpoint, specSubjectItemsEndpoint,
] as const;

export type SpecDraftCreateInput = { modelId: string; sourceDocRef: SpecSourceDocRef };
export type SpecDraftSaveInput = {
  revisionId: string; mode: 'append' | 'replace'; sourceDocRef?: SpecSourceDocRef;
  modules?: SpecModuleInput[]; events?: SpecEventInput[]; relations?: SpecRelationInput[];
  /** #1196 b2 — TSV text instead of rows: `tsv` = a .txt file's content read by the screen, `paste` = pasted text.
   *  Exactly one of rows or text per call; the parser and the caps are the server's (`domain/spec-tsv.ts`). */
  text?: string; format?: 'tsv' | 'paste';
};
export type SpecPublishInput = { revisionId: string };
export type SpecRejectInput = { revisionId: string; reason: string };
export type SpecCounts = { modules: number; events: number; relations: number };
export type SpecDraftCreateResult = { revisionId: string; version: string };
/** `revisionId` is the NEW draft's id after a `replace`. */
export type SpecDraftSaveResult = { revisionId: string; version: string; counts: SpecCounts };
export type SpecPublishResult =
  | { outcome: 'published'; revisionId: string; contentSha256: string }
  | { outcome: 'unchanged'; revisionId: string };
export type SpecRejectResult = { revisionId: string };

const specWrites = [modelSpecEndpoint, modelSpecRevisionsEndpoint, specDraftEndpoint, specChangesEndpoint, specCoverageEndpoint];
const specWrite = <I, O>(name: string, inputKeys: Record<keyof I & string, true>, concurrency: 'none' | 'version') =>
  defineAction<I, O>({
    id: `logKnowledge.${name}`, menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, inputKeys, permission: SPEC_PUBLISH_PERMISSION,
    requiresScope: false, concurrency, invalidates: specWrites,
  });
export const specDraftCreate = specWrite<SpecDraftCreateInput, SpecDraftCreateResult>('specDraftCreate', { modelId: true, sourceDocRef: true }, 'none');
export const specDraftSave = specWrite<SpecDraftSaveInput, SpecDraftSaveResult>('specDraftSave', { revisionId: true, mode: true, sourceDocRef: true, modules: true, events: true, relations: true, text: true, format: true }, 'version');
export const specPublish = specWrite<SpecPublishInput, SpecPublishResult>('specPublish', { revisionId: true }, 'version');
export const specReject = specWrite<SpecRejectInput, SpecRejectResult>('specReject', { revisionId: true, reason: true }, 'version');

// SW change writes (#1196 c): same right, `invalidates` = the change list, the model spec and its coverage badge (the draft and revision reads do not move).
export type SpecChangeTarget =
  | { module: string }
  | { module: string; event: string }
  | { module: string; event: string; field: string }
  | { sourceModule: string; sourceEvent: string; predicate: string; targetModule: string; targetEvent: string };
type SpecChangeBody = {
  softwareId: string; endsBeforeSoftwareId?: string | null; targetKind: SpecTargetKind; target: SpecChangeTarget; changeKind: SpecChangeKind;
  change?: { before?: Record<string, unknown>; after?: Record<string, unknown> }; note?: string | null; evidenceRef?: string | null;
};
export type SpecChangeAddInput = SpecChangeBody & { modelId: string };
export type SpecChangeRetireInput = { changeId: string; replacement?: SpecChangeBody | null };
export type SpecChangeConfirmInput = { changeId: string };
export type SpecChangeAddResult = { changeId: string };
export type SpecChangeRetireResult = { changeId: string; replacementChangeId?: string };
export type SpecChangeConfirmResult = { changeId: string };
const specChangeReads = [specChangesEndpoint, modelSpecEndpoint, specCoverageEndpoint];
const specChangeWrite = <I, O>(name: string, inputKeys: Record<keyof I & string, true>, concurrency: 'none' | 'version') =>
  defineAction<I, O>({
    id: `logKnowledge.${name}`, menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, inputKeys, permission: SPEC_PUBLISH_PERMISSION,
    requiresScope: false, concurrency, invalidates: specChangeReads,
  });
export const specChangeAdd = specChangeWrite<SpecChangeAddInput, SpecChangeAddResult>('specChangeAdd', { modelId: true, softwareId: true, endsBeforeSoftwareId: true, targetKind: true, target: true, changeKind: true, change: true, note: true, evidenceRef: true }, 'none');
export const specChangeRetire = specChangeWrite<SpecChangeRetireInput, SpecChangeRetireResult>('specChangeRetire', { changeId: true, replacement: true }, 'version');
export const specChangeConfirm = specChangeWrite<SpecChangeConfirmInput, SpecChangeConfirmResult>('specChangeConfirm', { changeId: true }, 'version');

// Concept mapping writes (#1196 e): same right (`knowledge:spec-publish`); `invalidates` = the mapping list and the suggestions.
export type ConceptTargetBody = { module: string } | { module: string; event: string };
export type ConceptPairWith = { modelId: string; targetKind: ConceptKind; target: ConceptTargetBody };
/** Exactly one of `conceptId` / `canonicalLabel` (`required_one` on `concept`). `pairWith` accepts a suggestion: both targets are proposed on one concept, scored server-side. */
export type ConceptProposeInput = {
  modelId: string; targetKind: ConceptKind; target: ConceptTargetBody; conceptId?: string | null; canonicalLabel?: string | null;
  description?: string | null; relationKind?: ConceptRelation; pairWith?: ConceptPairWith | null;
};
export type ConceptConfirmInput = { mappingId: string };
export type ConceptRejectInput = { mappingId: string; reason: string };
export type ConceptProposeResult = { conceptId: string; mappingId: string; pairMappingId?: string };
export type ConceptReviewResult = { mappingId: string };
const conceptReads = [conceptMappingsEndpoint, conceptSuggestionsEndpoint];
const conceptWrite = <I, O>(name: string, inputKeys: Record<keyof I & string, true>, concurrency: 'none' | 'version') =>
  defineAction<I, O>({
    id: `logKnowledge.${name}`, menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, inputKeys, permission: SPEC_PUBLISH_PERMISSION,
    requiresScope: false, concurrency, invalidates: conceptReads,
  });
export const conceptPropose = conceptWrite<ConceptProposeInput, ConceptProposeResult>('conceptPropose', { modelId: true, targetKind: true, target: true, conceptId: true, canonicalLabel: true, description: true, relationKind: true, pairWith: true }, 'none');
export const conceptConfirm = conceptWrite<ConceptConfirmInput, ConceptReviewResult>('conceptConfirm', { mappingId: true }, 'version');
export const conceptReject = conceptWrite<ConceptRejectInput, ConceptReviewResult>('conceptReject', { mappingId: true, reason: true }, 'version');

/** The four spec writes, the three SW change writes and the three concept mapping writes in the server's order. */
export const specActionSpecs = [specDraftCreate, specDraftSave, specPublish, specReject, specChangeAdd, specChangeRetire, specChangeConfirm, conceptPropose, conceptConfirm, conceptReject] as const;

/** What every write answers: the row's identity and its new version. */
export type CatalogSummary = { id: string; code: string; name: string; active: boolean; version: string };

type CodeName = { code: string; name: string };
/** A create may leave `code` out or blank: the server takes the name as the code (ADR-0107 decision 2 supplement). */
type NameWithOptionalCode = { code?: string; name: string };
type SetActiveInput = { id: string; active: boolean };
export type VendorCreateInput = NameWithOptionalCode;
export type VendorUpdateInput = CodeName & { id: string };
export type ModelCreateInput = NameWithOptionalCode & { vendorId: string; processIds: string[] };
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
export const processCreate = create<NameWithOptionalCode>('processCreate', { code: true, name: true }, processReads);
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
  /** The targets of the shown revision, resolved against each model's current published specification. */
  subjects: ItemSubject[];
  /** The Event relation records of the shown revision; empty for an item without any. */
  relations: ItemRelation[];
};

export const ITEM_SORT_IDS = ['itemNo', 'title', 'updatedAt'] as const;
const itemEnum = (values: readonly string[], labels: Record<string, string>, multiple?: false): ColumnFilterSpec => ({
  kind: 'enum', options: values.map(value => ({ value, label: labels[value] ?? value })), ops: ['in', 'notIn'], ...(multiple === false ? { multiple: false as const } : {}),
});
export const ITEM_TYPE_LABEL: Record<ItemTypeCode, string> = { anomaly: '이상 사례', needs_check: '확인 필요', behavior_note: '동작 설명', guideline: '작업 기준' };
export const VERIFICATION_LABEL: Record<VerificationState, string> = { not_checked: '미확인', observed: '관찰됨', verified: '검증됨', disputed: '이견 있음' };
export const PROCESSING_LABEL: Record<ProcessingState, string> = { open: '열림', under_investigation: '조사 중', resolved: '해결됨' };
export const PUBLICATION_LABEL: Record<PublicationState, string> = { published: '발행됨', archived: '보관됨' };

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
  /** #1196 f: items whose latest revision has this subject target key (escaped stable key; one value, no closed vocabulary). Pair it with `ownerModelId` to scope the key to a model. */
  subject: { kind: 'enum', options: [], ops: ['in'], multiple: false },
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

// ---- Knowledge search (#1509 S-f; wire schema: sdk/contract-schemas/knowledge-search.ts) --------------------------
export const LOG_KNOWLEDGE_SEARCH_MENU_ID = 'log-knowledge-search';
export type SearchKind = 'all' | 'observed' | 'expected';
export type SearchRelation = { source: string; predicate: 'before' | 'after'; target: string };
export type SearchOwnerFilter = { modelId?: string | null; softwareId?: string | null; includeSoftware?: boolean };
export type KnowledgeSearchParams = { q?: string | null; ownerFilter?: SearchOwnerFilter | null; relation?: SearchRelation | null; kind?: SearchKind | null; includeOpposite?: boolean; cursor?: string | null; limit?: number };
export type SearchReason = 'observed_same_direction' | 'expected_same_direction' | 'exact_token' | 'concept_mapping' | 'approved_alias' | 'text';
export type SearchDirection = { origin: 'explicit' | 'operator'; source: string; target: string; kind: SearchKind; swapped: boolean };
export type KnowledgeSearchItem = {
  itemId: string; itemNo: number; title: string; excerpt: string; typeCode: string; revisionNo: number;
  publicationState: string; verificationState: string; processingState: string; publishedAt: string;
  owner: { modelId: string; modelCode: string; modelName: string; softwareId: string | null; softwareLabel: string | null };
  reasons: SearchReason[]; stage: number; expectedOnly: boolean; relatedCount: number;
};
export type KnowledgeSearchData = {
  version: 'v0'; interpretation: { original: string; tokens: string[]; direction: SearchDirection | null };
  items: KnowledgeSearchItem[]; opposite: KnowledgeSearchItem[] | null; oppositeHasMore: boolean;
  hasMore: boolean; nextCursor: string | null; capped: boolean;
  indexLag: { lagSeconds: number | null; backfill: { state: 'running' | 'done' | 'none'; percent: number } };
};
export type SearchSuggestParams = { q: string; ownerFilter?: SearchOwnerFilter | null };
export type SearchSuggestData = { version: 'v0'; suggestions: { kind: 'title' | 'eventKey'; text: string }[] };
export const searchEndpoint = defineEndpoint<KnowledgeSearchParams, KnowledgeSearchData>({
  id: 'logKnowledge.search', menuId: LOG_KNOWLEDGE_SEARCH_MENU_ID,
  paramKeys: { q: true, ownerFilter: true, relation: true, kind: true, includeOpposite: true, cursor: true, limit: true },
  permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export const searchSuggestEndpoint = defineEndpoint<SearchSuggestParams, SearchSuggestData>({
  id: 'logKnowledge.searchSuggest', menuId: LOG_KNOWLEDGE_SEARCH_MENU_ID, paramKeys: { q: true, ownerFilter: true },
  permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export const searchEndpointSpecs = [searchEndpoint, searchSuggestEndpoint] as const;

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
/** A target the revision is about (#1196 f): the item's owner model and a module / event key of its spec. `relation` defaults to `about`. */
export type ItemSubjectInput = { modelId: string; targetKind: ConceptKind; target: ConceptTargetBody; relation?: SubjectRelation };
export type ItemCreateInput = ItemOwnerInput & ItemContentInput & { evidence?: EvidenceInput[] | null; subjects?: ItemSubjectInput[] | null; relations?: ItemRelationInput[] | null };
/** `subjects` omitted keeps the previous revision's subjects; a list (even empty) replaces them. */
export type ItemReviseInput = ItemContentInput & { id: string; evidence?: EvidenceInput[] | null; subjects?: ItemSubjectInput[] | null; relations?: ItemRelationInput[] | null; changeNote: string };
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

export const itemCreate = itemWrite<ItemCreateInput, ItemWriteResult>('itemCreate', { ownerModelId: true, ownerSoftwareId: true, ...contentKeys, evidence: true, subjects: true, relations: true }, 'none');
export const itemRevise = itemWrite<ItemReviseInput, ItemReviseResult>('itemRevise', { id: true, ...contentKeys, evidence: true, subjects: true, relations: true, changeNote: true }, 'version');
export const itemAssess = itemWrite<ItemAssessInput, ItemWriteResult>('itemAssess', { id: true, dimension: true, newState: true, rationale: true }, 'version');
export const itemDerive = itemWrite<ItemDeriveInput, ItemWriteResult>('itemDerive', { sourceItemId: true, sourceRevisionNo: true, ownerModelId: true, ownerSoftwareId: true, ...contentKeys }, 'none');
export const itemSetArchived = itemWrite<ItemSetArchivedInput, ItemWriteResult>('itemSetArchived', { id: true, archived: true }, 'version');

/** The five item writes in the server's order. */
export const itemActionSpecs = [itemCreate, itemRevise, itemAssess, itemDerive, itemSetArchived] as const;

// ---- catalog import staging (#1195 a/b, design v0.6 §6.2) -----------------------------------------------------
// Specs only (no screen, no mock). A menu reaches the server only through `useMenuFetch` and menu actions, so the
// wizard uses `importPaste` (pasted text or a CSV the browser read) and `importApply`. API-only paths, not offered
// to a menu: the multipart upload `POST /api/v1/log-knowledge/imports` (CSV or XLSX, every entity), the apply route
// `POST …/imports/:jobId/apply` and `GET …/imports/:jobId/report.csv`. The server mirror is `apps/platform-api/src/modules/log-knowledge/import-actions.ts` /
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
  /** Model rows: the maker and processes this row creates when they do not exist yet (`null` when none). */
  creates: { vendor?: string; processes: string[] } | null;
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

export type ImportPasteInput = { text: string; sourceName?: string };
/** `status` is `mapped` when the headers were recognized, else `uploaded` (cannot happen for a recognized model sheet). */
export type ImportPasteResult = { jobId: string; rowCount: number; status: 'mapped' | 'uploaded' };
/** Model entity only; at most 256 KiB of UTF-8 and 1,000 data rows; tab-delimited when the first non-empty line holds a tab, else comma. A refusal is `invalid` with `{path:['text'], code}` plus `{path:['text','headers',<header>], code}` per named header and creates no job. */
export const importPaste = defineAction<ImportPasteInput, ImportPasteResult>({
  id: 'logKnowledge.importPaste', menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys: { text: true, sourceName: true },
  permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, concurrency: 'none', invalidates: [importDetailEndpoint],
});

export type ImportApplyInput = { jobId: string; expectedPlanVersion: number };
export type ImportApplyProgress = { jobId: string; status: ImportJobStatus; planVersion: number; remaining: number; counts: ImportApplyCounts };
/** The action engine returns only `ok` data, so conflict, not-found and busy are discriminants of an `ok` answer. */
export type ImportApplyResult =
  | ({ outcome: 'progress' } & ImportApplyProgress)
  | { outcome: 'not_found' }
  | { outcome: 'conflict'; reason: 'plan_version' | 'state' }
  | { outcome: 'busy' };
/** One call applies rows within a time budget; call again with a fresh idempotency key until `remaining` is 0 (`completed` or `partial_failure`). A busy answer is recorded for replay: retry with a new key. */
export const importApply = defineAction<ImportApplyInput, ImportApplyResult>({
  id: 'logKnowledge.importApply', menuId: LOG_KNOWLEDGE_MENU_ID, inputKeys: { jobId: true, expectedPlanVersion: true },
  permission: CATALOG_MANAGE_PERMISSION, requiresScope: false, concurrency: 'none', invalidates: [importDetailEndpoint],
});

export const importActionSpecs = [importMap, importValidate, importResolve, importCancel, importPaste, importApply] as const;
export const importEndpointSpecs = [importDetailEndpoint] as const;
