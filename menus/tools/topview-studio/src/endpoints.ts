/**
 * @ap/menu-topview-studio — the Layouts menu (#1654, #1607 step 6): declarations of the server `eqv` module's six Studio reads and
 * three writes, copied exactly from `apps/platform-api/src/modules/eqv/{endpoints,actions,menu}.ts` (a drift test compares them).
 * Client-safe: no `@eqv/*` import here, because the mock and the server test import this file. Documents are plain JSON
 * (`LayoutJson`); the screen validates them with `@eqv/core`.
 */
import { defineAction, defineEndpoint, menuPermission } from '@ap/contracts';

export const EQV_STUDIO_MENU_ID = 'eqv-studio';

/** Entry permission of this menu: a platform permission with the same capability (`eqv.view`) as `eqv:view`, because the Kernel registry refuses a second non-module menu on an `eqv:*` name. */
export const STUDIO_VIEW_PERMISSION = menuPermission('eqv-studio:view');
/** What the server's reads declare (the module's namespace); the menu itself is entered with `STUDIO_VIEW_PERMISSION`. */
export const EQV_READ_PERMISSION = menuPermission('eqv:view');
export const LAYOUT_EDIT_PERMISSION = menuPermission('eqv-studio:layout-edit');
export const LAYOUT_PUBLISH_PERMISSION = menuPermission('eqv-studio:layout-publish');

/** A Layout or Template document as it travels: validated by `@eqv/core` on the screen and, finally, on the server. */
export type LayoutJson = Record<string, unknown> & { id: string; kind: string };

export const REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const TEMPLATE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export type LayoutRow = { id: string; layoutId: string; version: string; updatedAt: string };
export type LayoutDraft = { id: string; layoutId: string; version: string; document: LayoutJson; updatedAt: string };
export type RevisionRow = { id: string; layoutId: string; revision: string; publishedAt: string };
export type RevisionRead = RevisionRow & { document: LayoutJson };
export type TemplateRow = { id: string; templateId: string; name: string; promotedFromLayoutId: string; promotedFromRevision: string; createdAt: string };
export type TemplateRead = TemplateRow & { document: LayoutJson };

type LayoutParams = { layoutId: string };
type RevisionParams = { layoutId: string; revision: string };
type TemplateParams = { templateId: string };
type NoParams = Record<never, true>;

const read = <P, T>(id: string, paramKeys: Record<keyof P & string, true>) =>
  defineEndpoint<P, T>({ id, menuId: EQV_STUDIO_MENU_ID, paramKeys, permission: EQV_READ_PERMISSION, requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false });

export const layoutsEndpoint = read<NoParams, { rows: LayoutRow[] }>('eqv.layouts', {});
/** Answers `empty` (data null) while the Layout has no draft. */
export const layoutDraftEndpoint = read<LayoutParams, LayoutDraft | null>('eqv.layoutDraft', { layoutId: true });
export const layoutRevisionsEndpoint = read<LayoutParams, { rows: RevisionRow[] }>('eqv.layoutRevisions', { layoutId: true });
export const layoutRevisionEndpoint = read<RevisionParams, RevisionRead | null>('eqv.layoutRevision', { layoutId: true, revision: true });
export const templatesEndpoint = read<NoParams, { rows: TemplateRow[] }>('eqv.templates', {});
export const templateEndpoint = read<TemplateParams, TemplateRead | null>('eqv.template', { templateId: true });

/** The six reads in the server's order. */
export const studioReadSpecs = [layoutsEndpoint, layoutDraftEndpoint, layoutRevisionsEndpoint, layoutRevisionEndpoint, templatesEndpoint, templateEndpoint] as const;

export type SaveDraftInput = { layoutId: string; document: LayoutJson };
export type SaveDraftResult = { id: string; layoutId: string; version: string };
export type PublishRevisionInput = { layoutId: string };
export type PublishRevisionResult = { id: string; layoutId: string; revision: string; created: boolean };
export type PromoteTemplateInput = { layoutId: string; revision: string; templateId: string; name: string };
export type PromoteTemplateResult = { id: string; templateId: string };

/** `expectedVersion: '0'` creates the first draft; later saves carry the version the author saw. */
export const saveDraft = defineAction<SaveDraftInput, SaveDraftResult>({
  id: 'eqv.saveDraft', menuId: EQV_STUDIO_MENU_ID, inputKeys: { layoutId: true, document: true }, permission: LAYOUT_EDIT_PERMISSION,
  requiresScope: false, concurrency: 'version', invalidates: [layoutsEndpoint, layoutDraftEndpoint],
});
/** `expectedVersion` is the draft version the author saw. `created: false` means the same Revision already existed. */
export const publishRevision = defineAction<PublishRevisionInput, PublishRevisionResult>({
  id: 'eqv.publishRevision', menuId: EQV_STUDIO_MENU_ID, inputKeys: { layoutId: true }, permission: LAYOUT_PUBLISH_PERMISSION,
  requiresScope: false, concurrency: 'version', invalidates: [layoutRevisionsEndpoint, layoutRevisionEndpoint],
});
export const promoteTemplate = defineAction<PromoteTemplateInput, PromoteTemplateResult>({
  id: 'eqv.promoteTemplate', menuId: EQV_STUDIO_MENU_ID, inputKeys: { layoutId: true, revision: true, templateId: true, name: true }, permission: LAYOUT_PUBLISH_PERMISSION,
  requiresScope: false, concurrency: 'none', invalidates: [templatesEndpoint, templateEndpoint],
});

/** The three writes in the server's order. */
export const studioActionSpecs = [saveDraft, publishRevision, promoteTemplate] as const;

// ---- 설비 온보딩 (#1658, #1607 step 8): menu `eqv-onboarding` ----
// Documents travel as plain JSON here too; the screen validates and computes with `@eqv/core`, the server judges finally on publish.

export const EQV_ONBOARDING_MENU_ID = 'eqv-onboarding';
/** Alias-rule and Model/Maker Type Dictionary writes (capability `eqv.rules.edit`). */
export const RULES_EDIT_PERMISSION = menuPermission('eqv-studio:rules-edit');
/** A global-level rules or dictionary write also needs this one (capability `eqv.dictionary.global_edit`); the server checks it. */
export const DICTIONARY_GLOBAL_EDIT_PERMISSION = menuPermission('eqv-studio:dictionary-global-edit');
/** Mapping publish (capability `eqv.mapping.publish`). */
export const MAPPING_PUBLISH_PERMISSION = menuPermission('eqv-studio:mapping-publish');
/** Sample Window import, replace and retire, and equipment registration (capability `eqv.window.import`). */
export const WINDOW_IMPORT_PERMISSION = menuPermission('eqv-studio:window-import');

export type JsonDocument = Record<string, unknown>;
/** Scope level of an alias-rules file or a Type Dictionary. `vendorId` is the Hub vendor id (core «maker»), `modelId` the Hub model id. */
export type ScopeLevel = 'global' | 'maker' | 'model' | 'equipment';
export type ScopeParams = { level: ScopeLevel; vendorId?: string; modelId?: string; equipmentId?: string };
export type VersionedDocument = { document: JsonDocument; version: string };
export type EquipmentScope = { equipmentId: string; vendorId: string; modelId: string };
export type MappingVersionRow = { hash: string; layoutId: string; layoutRevision: string | null; entryCount: number; publishedAt: string };
/** The equipment's BindingsFile (`schemaVersion`, `equipmentId`, `bindings`) and the concurrency version of `publishMapping` (= the binding count). */
export type BindingsRead = { document: JsonDocument; version: string };
/** A stored Mapping Version with the Revision it was published against. */
export type MappingVersionRead = { layoutRevision: string | null; publishedAt: string; document: JsonDocument };

/** Fleet status codes; the screen owns the words (ONBOARDING §1, §6). */
export const FLEET_STATUSES = ['no-observations', 'unstarted', 'draft', 'published', 'drift', 'drift-unknown'] as const;
export type FleetStatusCode = typeof FLEET_STATUSES[number];
export type FleetRowDto = {
  equipmentId: string; label: string; vendorId: string; vendorName: string; modelId: string; modelName: string;
  status: FleetStatusCode;
  /** The latest active Sample Window; null for `no-observations`. */
  latestWindow: { hash: string; from: string; to: string } | null;
  /** Of the latest Binding against the latest window; null until published. `unmappedReferences` is known before publish too. */
  coverage: { referenceRatio: number | null; aliasRatio: number | null; assumedRatio: number | null } | null;
  unmappedReferences: number | null;
};
/** `staged`: a reprocessed Data Generation of an active window's range, waiting to replace it (EV#105). */
export const WINDOW_STATES = ['active', 'staged', 'replaced', 'retired'] as const;
export type WindowState = typeof WINDOW_STATES[number];
export type SampleWindowRow = {
  hash: string; from: string; to: string; dataGeneration: string; timeDomain: string; occurrences: number; state: WindowState;
  /** For `staged`: the active window it replaces; for `replaced`: the window that replaced it. */
  counterpart: string | null;
  /** Published Mapping Versions whose Baseline Inventory came from this window. */
  mappingCount: number;
};
export type BundledTemplateRow = { templateId: string; name: string; document: LayoutJson };

/** Site Wall-clock (EV ADR-0009) and the 64-hex part of a `sha256:` hash. */
export const WALL_CLOCK_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/;
export const WINDOW_HEX_PATTERN = /^[0-9a-f]{64}$/;
export const EQUIPMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const onboardingRead = <P, T>(id: string, paramKeys: Record<keyof P & string, true>) =>
  defineEndpoint<P, T>({ id, menuId: EQV_ONBOARDING_MENU_ID, paramKeys, permission: EQV_READ_PERMISSION, requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false });
const SCOPE_KEYS = { level: true, vendorId: true, modelId: true, equipmentId: true } as const;
type EquipmentParams = { equipmentId: string };

/** Answers `empty` when the scope has no file. */
export const aliasRulesEndpoint = onboardingRead<ScopeParams, VersionedDocument | null>('eqv.aliasRules', SCOPE_KEYS);
export const typeDictionaryEndpoint = onboardingRead<Omit<ScopeParams, 'equipmentId'>, VersionedDocument | null>('eqv.typeDictionary', { level: true, vendorId: true, modelId: true });
export const equipmentScopesEndpoint = onboardingRead<EquipmentParams, EquipmentScope | null>('eqv.equipmentScopes', { equipmentId: true });
export const mappingVersionsEndpoint = onboardingRead<EquipmentParams, { rows: MappingVersionRow[] }>('eqv.mappingVersions', { equipmentId: true });
export const mappingVersionEndpoint = onboardingRead<EquipmentParams & { hash: string }, MappingVersionRead | null>('eqv.mappingVersion', { equipmentId: true, hash: true });
/** Answers `empty` for an equipment the actor cannot address; an equipment without Bindings answers an empty `bindings` list at version `'0'`. */
export const bindingsEndpoint = onboardingRead<EquipmentParams, BindingsRead | null>('eqv.bindings', { equipmentId: true });
export const baselineInventoryEndpoint = onboardingRead<EquipmentParams & { mappingHash: string }, { document: JsonDocument } | null>('eqv.baselineInventory', { equipmentId: true, mappingHash: true });
/** Server: pending (#1658 Sample Window·Fleet PR). */
export const fleetEndpoint = onboardingRead<NoParams, { rows: FleetRowDto[] }>('eqv.fleet', {});
/** Server: pending (#1658 Sample Window·Fleet PR). */
export const sampleWindowsEndpoint = onboardingRead<EquipmentParams, { rows: SampleWindowRow[] }>('eqv.sampleWindows', { equipmentId: true });
/** Server: pending (#1658 Sample Window·Fleet PR). `windowHash` is the 64 hex digits; `empty` for an unknown window. */
export const observedInventoryEndpoint = onboardingRead<EquipmentParams & { windowHash: string }, JsonDocument | null>('eqv.observedInventory', { equipmentId: true, windowHash: true });
/** Server: pending (#1658 Sample Window·Fleet PR). The EV Templates the package ships (`BUNDLED_TEMPLATE_IDS`); `eqv.templates` lists promoted ones only. */
export const bundledTemplatesEndpoint = onboardingRead<NoParams, { rows: BundledTemplateRow[] }>('eqv.bundledTemplates', {});

/** The reads: the server storage PR's seven, then the four pending ones (`onboarding-menu-drift.test.ts` lists them). */
export const onboardingReadSpecs = [
  aliasRulesEndpoint, typeDictionaryEndpoint, equipmentScopesEndpoint, mappingVersionsEndpoint, mappingVersionEndpoint, bindingsEndpoint, baselineInventoryEndpoint,
  fleetEndpoint, sampleWindowsEndpoint, observedInventoryEndpoint, bundledTemplatesEndpoint,
] as const;

export type SaveScopedInput = ScopeParams & { document: JsonDocument };
/** `id` is the stored row's id. */
export type SaveScopedResult = { id: string; version: string };
export type PublishMappingInput = { equipmentId: string; layoutId: string; layoutRevision: string; baseline: JsonDocument; effectiveFrom: string };
export type PublishMappingResult = { mappingHash: string; bindingId: string; version: string };
export type WindowActionInput = { equipmentId: string; windowHash: string };
export type ReplaceWindowResult = { equipmentId: string; activeHash: string; replacedHash: string };
export type RetireWindowResult = { equipmentId: string; retiredHash: string };
/** `uploadId` is the id `PlatformAdapter.uploadFile` answered for the `*.batch.json`; the server reads the file by id (ADR-0140 §6). */
export type ImportWindowInput = { equipmentId: string; uploadId: string };
/** `vendorId`/`modelId` are Hub ids (EV `maker`/`model` scopes); `label` is what Fleet shows next to the id. */
export type RegisterEquipmentInput = { equipmentId: string; label: string; vendorId: string; modelId: string };
export type RegisterEquipmentResult = { equipmentId: string };
/** Longest equipment id the server accepts (`isEquipmentId`) and longest Fleet label. */
export const EQUIPMENT_ID_MAX = 200;
export const EQUIPMENT_LABEL_MAX = 120;
/** The file a Sample Window import takes (EV ADR-0010); the screen pre-checks it, the server decides. */
export const SAMPLE_WINDOW_FILE_SUFFIX = '.batch.json';

/** `expectedVersion` is the version the author read (`'0'` while the scope has no file). A global level also needs `eqv-studio:dictionary-global-edit`. */
export const saveAliasRules = defineAction<SaveScopedInput, SaveScopedResult>({
  id: 'eqv.saveAliasRules', menuId: EQV_ONBOARDING_MENU_ID, inputKeys: { ...SCOPE_KEYS, document: true }, permission: RULES_EDIT_PERMISSION,
  requiresScope: false, concurrency: 'version', invalidates: [aliasRulesEndpoint],
});
export const saveTypeDictionary = defineAction<Omit<SaveScopedInput, 'equipmentId'>, SaveScopedResult>({
  id: 'eqv.saveTypeDictionary', menuId: EQV_ONBOARDING_MENU_ID, inputKeys: { level: true, vendorId: true, modelId: true, document: true }, permission: RULES_EDIT_PERMISSION,
  requiresScope: false, concurrency: 'version', invalidates: [typeDictionaryEndpoint],
});
/**
 * `expectedVersion` is the equipment's binding count the author saw. The server flattens the saved rules against the published Layout
 * Revision, stores the Mapping Version and `baseline` (the selected window's ObservedInventory) and closes/opens the Binding; it refuses
 * `same-as-latest` (path `['mapping']`). The Revision must exist: the screen calls `publishRevision` first when the draft has none (both are idempotent).
 */
export const publishMapping = defineAction<PublishMappingInput, PublishMappingResult>({
  id: 'eqv.publishMapping', menuId: EQV_ONBOARDING_MENU_ID, inputKeys: { equipmentId: true, layoutId: true, layoutRevision: true, baseline: true, effectiveFrom: true },
  permission: MAPPING_PUBLISH_PERMISSION, requiresScope: false, concurrency: 'version',
  invalidates: [mappingVersionsEndpoint, bindingsEndpoint],
});
/** Server: pending (#1658 Sample Window·Fleet PR). Activates a `staged` window and marks the window it replaces `replaced`. */
export const replaceSampleWindow = defineAction<WindowActionInput, ReplaceWindowResult>({
  id: 'eqv.replaceSampleWindow', menuId: EQV_ONBOARDING_MENU_ID, inputKeys: { equipmentId: true, windowHash: true }, permission: WINDOW_IMPORT_PERMISSION,
  requiresScope: false, concurrency: 'none', invalidates: [sampleWindowsEndpoint, observedInventoryEndpoint, fleetEndpoint],
});
/** Server: pending (#1658 Sample Window·Fleet PR). Retires an active window; published Mapping Versions keep their Baseline Inventory. */
export const retireSampleWindow = defineAction<WindowActionInput, RetireWindowResult>({
  id: 'eqv.retireSampleWindow', menuId: EQV_ONBOARDING_MENU_ID, inputKeys: { equipmentId: true, windowHash: true }, permission: WINDOW_IMPORT_PERMISSION,
  requiresScope: false, concurrency: 'none', invalidates: [sampleWindowsEndpoint, observedInventoryEndpoint, fleetEndpoint],
});

/**
 * Server: pending (#1658 Sample Window·Fleet PR). Reads the uploaded `*.batch.json` by id, validates it like the dev tool (EV ADR-0010,
 * `@eqv/core` `checkSampleWindowImport`) and stores it; answers the stored window as an `eqv.sampleWindows` row. The same content again
 * answers the stored row. A reprocessed Data Generation of an active window's exact range is stored `staged` (EV#105), replaced only by
 * `replaceSampleWindow`. Refusals are `invalid`: `uploadId/not_found` (unknown, expired or another user's upload), `file/not_json`,
 * `file/<import code>` per validation issue, `file/staged_exists` (the active window already has a staged replacement), `file/retired`
 * (the content of a retired window: it stays retired), `equipmentId/not_found`.
 */
export const importSampleWindow = defineAction<ImportWindowInput, SampleWindowRow>({
  id: 'eqv.importSampleWindow', menuId: EQV_ONBOARDING_MENU_ID, inputKeys: { equipmentId: true, uploadId: true }, permission: WINDOW_IMPORT_PERMISSION,
  requiresScope: false, concurrency: 'none', invalidates: [sampleWindowsEndpoint, observedInventoryEndpoint, fleetEndpoint],
});
/**
 * Server: pending (#1658 Sample Window·Fleet PR). Registers an equipment under a Hub vendor and model; it appears in Fleet as
 * `no-observations`. Refusals are `invalid`: `equipmentId/invalid` (not an id), `equipmentId/exists` (also an id that differs only by
 * letter case, like the dev tool), `label/invalid`, `vendorId`·`modelId/not_found` (no such Hub vendor and model for the actor).
 */
export const registerEquipment = defineAction<RegisterEquipmentInput, RegisterEquipmentResult>({
  id: 'eqv.registerEquipment', menuId: EQV_ONBOARDING_MENU_ID, inputKeys: { equipmentId: true, label: true, vendorId: true, modelId: true }, permission: WINDOW_IMPORT_PERMISSION,
  requiresScope: false, concurrency: 'none', invalidates: [fleetEndpoint, equipmentScopesEndpoint],
});

/** The writes: the server storage PR's three, then the four pending ones. */
export const onboardingActionSpecs = [saveAliasRules, saveTypeDictionary, publishMapping, replaceSampleWindow, retireSampleWindow, importSampleWindow, registerEquipment] as const;
