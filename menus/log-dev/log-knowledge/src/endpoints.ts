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
/** Options are data (the other lists), so the wire list is empty; the server accepts any uuid and checks the shape. */
const idSpec: ColumnFilterSpec = { kind: 'enum', options: [], ops: ['in', 'notIn'] };

/** Filter fields per read (the wire meaning, ADR-0105): the mock and the server refuse a field, operator or value outside it. */
export const vendorFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = { active: activeSpec };
export const processFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = { active: activeSpec };
export const modelFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = {
  active: activeSpec,
  vendorId: idSpec,
  // The model's mapped processes: an array cell. `isEmpty` finds unmapped models.
  processes: { kind: 'enum', options: [], ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'], cell: 'many' },
};
export const softwareFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = { active: activeSpec, modelId: idSpec };

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
