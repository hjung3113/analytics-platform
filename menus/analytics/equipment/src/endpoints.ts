/**
 * Equipment query endpoints (packages/contracts/src/menu-query.ts, #128).
 * Client-safe: declarations, params/data types and display constants only — filtering, sorting and paging
 * live in `src/mock/` (the server half). Pages import from here, never from `src/mock/**`.
 */
import { defineEndpoint, type PageQuery, type PageResult, type PageSort } from '@ap/contracts';

/** Destination type for the equipment detail (docs/06 §22). A literal: the menu learns no mock internals. */
export const EQUIPMENT_ENTITY_TYPE = 'equipment';

export type Equipment = {
  equipmentId: string; site: string; room: string; line: string;
  stgroup: string; team: string; maker: string; model: string; chamberType: string;
  status: 'active' | 'idle' | 'maintenance' | 'retired';
  validFrom: string; validTo: string | null; updatedAt: string; updatedBy: string;
};

/** Page-owned list filters (URL page keys q/status/maker). '' means no constraint. */
export type EquipmentFilter = { q: string; status: string; maker: string };
export type EquipmentPageParams = EquipmentFilter & PageQuery;

/** Exactly what the equipment-master manifest applies; `time` stays reference. */
const context = { roomNames: 'apply', condition: 'apply', selection: 'apply' } as const;

/** One table page (06 §15): the same filtered set, sorted and sliced by the server. */
export const equipmentPageEndpoint = defineEndpoint<EquipmentPageParams, PageResult<Equipment>>({
  id: 'equipment.master.page',
  menuId: 'equipment-master',
  paramKeys: { q: true, status: true, maker: true, page: true, pageSize: true, sorting: true },
  permission: 'equipment:view',
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  mergeTimeDomain: false,
});

/**
 * Maker options for the page filter (#173 review P2-4): distinct makers within the granted Scope — the same options
 * the screen offered when it read the full list (independent of the other page filters), now as a small `string[]`
 * so the screen never reads the full list as its render gate.
 */
export const equipmentMakersEndpoint = defineEndpoint<Record<never, never>, string[]>({
  id: 'equipment.master.makers',
  menuId: 'equipment-master',
  paramKeys: {},
  permission: 'equipment:view',
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  mergeTimeDomain: false,
});

/** Page filters plus an explicit row selection (`null` = every filtered row) and the table's active sort for export. */
export type EquipmentExportFilter = EquipmentFilter & { ids: string[] | null; sorting: PageSort[] };

/**
 * The export set for the table-owned export (#173): same permission/Context/filters as the page, plus selection ids.
 * `sorting` is the table's active sort, so export order = page order (#173 UX P2-6).
 */
export const equipmentExportEndpoint = defineEndpoint<EquipmentExportFilter, Equipment[]>({
  id: 'equipment.master.export',
  menuId: 'equipment-master',
  paramKeys: { q: true, status: true, maker: true, ids: true, sorting: true },
  permission: 'equipment:view',
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  // Whole-result row cap judged after the ids filter (06 §15, #175). The page endpoint is the screen's data source and declares none.
  limits: { maxRows: 50_000 },
  mergeTimeDomain: false,
});

