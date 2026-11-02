/**
 * Equipment query endpoints (packages/sdk/contracts/src/menu/menu-query.ts, #128).
 * Client-safe: declarations, params/data types and display constants only — filtering, sorting and paging
 * live in `src/mock/` (the server half). Pages import from here, never from `src/mock/**`.
 */
import { defineEndpoint, type ColumnFilter, type ColumnFilterSpec, type GroupedPageResult, type PageSort, type TableQuery } from '@ap/contracts';
import { PERMISSION } from './permission';

/** Destination type for the equipment detail (docs/06 §22). A literal: the menu learns no mock internals. */
export const EQUIPMENT_ENTITY_TYPE = 'equipment';

export type Equipment = {
  equipmentId: string; site: string; room: string; line: string;
  stgroup: string; team: string; maker: string; model: string; chamberType: string;
  status: 'active' | 'idle' | 'maintenance' | 'retired';
  validFrom: string; validTo: string | null; updatedAt: string; updatedBy: string;
};

/** Page-owned list filter (URL page key `q`). '' means no constraint. Status, Maker and every column condition travel in `filters` (ADR-0105). */
export type EquipmentFilter = { q: string };
/** The quick search plus the table's filter conditions and row group (`TableQuery.filters`/`groupBy`, ADR-0104/0105). */
export type EquipmentPageParams = EquipmentFilter & TableQuery;

/** Production lines the mock generates (`L1`–`L4`, world.ts). */
const LINES = ['L1', 'L2', 'L3', 'L4'];
/** Statuses of `Equipment.status`. */
export const EQUIPMENT_STATUS_VALUES: readonly Equipment['status'][] = ['active', 'idle', 'maintenance', 'retired'];
const TEXT_OPS = ['contains', 'notContains', 'startsWith', 'equals', 'notEquals', 'isEmpty', 'isNotEmpty'] as const;

/**
 * Wire meaning of every filterable field (ADR-0105, P11): the kind and the operators the server supports. The mock — and a real server —
 * rejects a condition on a field or operator outside this list; the page derives its editor from the same list and adds display words.
 * Maker's options are data (the makers endpoint), so the wire list is empty; enum values are not checked against options.
 */
export const equipmentFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = {
  line: { kind: 'enum', options: LINES.map(value => ({ value, label: value })), ops: ['in', 'notIn'] },
  status: { kind: 'enum', options: EQUIPMENT_STATUS_VALUES.map(value => ({ value, label: value })), ops: ['in', 'notIn'] },
  maker: { kind: 'enum', options: [], ops: ['in', 'notIn'] },
  model: { kind: 'text', ops: TEXT_OPS },
  updatedBy: { kind: 'text', ops: TEXT_OPS },
  validFrom: { kind: 'date', ops: ['between', 'before', 'after', 'isEmpty'] },
  validTo: { kind: 'date', ops: ['between', 'before', 'after', 'isEmpty'] },
};

/** Exactly what the equipment-master manifest applies; `time` stays reference. */
const context = { roomNames: 'apply', condition: 'apply', selection: 'apply' } as const;

/** One table page (06 §15): the same filtered set, sorted and sliced by the server. */
export const equipmentPageEndpoint = defineEndpoint<EquipmentPageParams, GroupedPageResult<Equipment>>({
  id: 'equipment.master.page',
  menuId: 'equipment-master',
  paramKeys: { q: true, page: true, pageSize: true, sorting: true, filters: true, groupBy: true },
  permission: PERMISSION,
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  mergeTimeDomain: false,
});

/**
 * Maker options for the Maker filter field (#173 review P2-4): distinct makers within the granted Scope — the same options
 * the screen offered when it read the full list (independent of the other conditions), now as a small `string[]`
 * so the screen never reads the full list as its render gate.
 */
export const equipmentMakersEndpoint = defineEndpoint<Record<never, never>, string[]>({
  id: 'equipment.master.makers',
  menuId: 'equipment-master',
  paramKeys: {},
  permission: PERMISSION,
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  mergeTimeDomain: false,
});

/** The quick search and conditions plus an explicit row selection (`null` = every filtered row; `excludedIds` = every filtered row but these, for a select-all-results selection #556c) and the table's active sort for export. */
export type EquipmentExportFilter = EquipmentFilter & { ids: string[] | null; sorting: PageSort[]; filters?: ColumnFilter[]; excludedIds?: string[] };

/**
 * The export set for the table-owned export (#173): same permission/Context/filters as the page, plus selection ids.
 * `sorting` is the table's active sort, so export order = page order (#173 UX P2-6).
 */
export const equipmentExportEndpoint = defineEndpoint<EquipmentExportFilter, Equipment[]>({
  id: 'equipment.master.export',
  menuId: 'equipment-master',
  paramKeys: { q: true, ids: true, sorting: true, filters: true, excludedIds: true },
  permission: PERMISSION,
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  // Whole-result row cap judged after the ids filter (06 §15, #175). The page endpoint is the screen's data source and declares none.
  limits: { maxRows: 50_000 },
  mergeTimeDomain: false,
});

