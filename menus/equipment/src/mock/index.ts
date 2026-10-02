/**
 * Mock server half of the equipment-master endpoints (#128). The app composition root registers this list via
 * `@ap/menu-equipment/mock`; pages never import this module. Filtering moved here from the page so the export
 * and every table page are answered — and permission re-checked — by the server.
 */
import { sortAndPage, type PageSort } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint, type Equipment } from '@ap/mock-server';
import { equipmentExportEndpoint, equipmentMakersEndpoint, equipmentPageEndpoint, type EquipmentFilter } from '../endpoints';

export function filterEquipment(rows: Equipment[], { q, status, maker }: EquipmentFilter): Equipment[] {
  const search = q.trim().toLowerCase();
  return rows.filter(e => (!search || `${e.equipmentId} ${e.name}`.toLowerCase().includes(search)) && (!status || e.status === status) && (!maker || e.maker === maker));
}

/** The page endpoint's sort without its slice (#173 UX P2-6): export order = page order. */
function sortAllRows<T>(rows: T[], sorting: PageSort[]): T[] {
  return sortAndPage(rows, { page: 0, pageSize: Number.MAX_SAFE_INTEGER, sorting }).rows;
}

export const equipmentMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(equipmentMakersEndpoint, {
    // Distinct makers within the granted Scope (page filters do not narrow the options) — small enough for the select.
    handle: ({ equipment }) => [...new Set(equipment.map(e => e.maker))].sort(),
    isEmpty: makers => makers.length === 0,
  }),
  defineMockEndpoint(equipmentPageEndpoint, {
    handle: ({ equipment, params: { q, status, maker, page, pageSize, sorting } }) =>
      sortAndPage(filterEquipment(equipment, { q, status, maker }), { page, pageSize, sorting }),
    isEmpty: data => data.total === 0,
  }),
  defineMockEndpoint(equipmentExportEndpoint, {
    // Selection export: the server filters by ids itself, so the cap is judged on the selection, not the whole filter result.
    handle: ({ equipment, params }) => {
      const rows = filterEquipment(equipment, params);
      const { ids, sorting = [] } = params;
      return sortAllRows(ids == null ? rows : rows.filter(e => ids.includes(e.equipmentId)), sorting);
    },
  }),
];
