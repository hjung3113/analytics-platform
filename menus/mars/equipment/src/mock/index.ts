/**
 * Mock server half of the equipment-master endpoints (#128). The app composition root registers this list via
 * `@ap/menu-equipment/mock`; pages never import this module. Filtering moved here from the page so the export
 * and every table page are answered — and permission re-checked — by the server.
 */
import { filterRows, groupPage, sortAndPage, sortRows, validateFilters, type ColumnFilter } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint, type Equipment } from '@ap/mock-server';
import { equipmentExportEndpoint, equipmentFilterSpecs, equipmentMakersEndpoint, equipmentPageEndpoint, type EquipmentFilter } from '../endpoints';

export function filterEquipment(rows: Equipment[], { q }: EquipmentFilter): Equipment[] {
  const search = q.trim().toLowerCase();
  return rows.filter(e => !search || e.equipmentId.toLowerCase().includes(search));
}

/** ADR-0105 / P11: a condition on an undeclared field, an operator outside the field's `ops` or a malformed value is a malformed request, never an empty answer. */
const rejectUndeclared = ({ params }: { params: { filters?: ColumnFilter[] } }): string | null => {
  const check = validateFilters(params.filters ?? [], equipmentFilterSpecs);
  return check.ok ? null : `invalid filter ${check.filter.id}:${check.filter.op} (${check.reason})`;
};


export const equipmentMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(equipmentMakersEndpoint, {
    // Distinct makers within the granted Scope (page filters do not narrow the options) — small enough for the select.
    handle: ({ equipment }) => [...new Set(equipment.map(e => e.maker))].sort(),
    isEmpty: makers => makers.length === 0,
  }),
  defineMockEndpoint(equipmentPageEndpoint, {
    validate: rejectUndeclared,
    handle: ({ equipment, params: { q, page, pageSize, sorting, filters, groupBy } }) => {
      const rows = filterRows(filterEquipment(equipment, { q }), filters, undefined, { specs: equipmentFilterSpecs });
      // #556d: grouped = ordered by group then the sorting; `groups` describe the whole filtered set. No numeric column here, so a count only (no subtotalColumns).
      return groupBy ? groupPage(rows, { groupBy, sorting, page, pageSize }) : sortAndPage(rows, { page, pageSize, sorting });
    },
    isEmpty: data => data.total === 0,
  }),
  defineMockEndpoint(equipmentExportEndpoint, {
    validate: rejectUndeclared,
    // Selection export: the server filters by ids itself, so the cap is judged on the selection, not the whole filter result.
    handle: ({ equipment, params }) => {
      const rows = filterRows(filterEquipment(equipment, params), params.filters, undefined, { specs: equipmentFilterSpecs });
      const { ids, excludedIds, sorting = [] } = params;
      // #556c: `excludedIds` = the whole filtered set minus these ids (the server recomputes it; no id list travels).
      const excluded = excludedIds ? new Set(excludedIds) : null;
      return sortRows(excluded ? rows.filter(e => !excluded.has(e.equipmentId)) : ids == null ? rows : rows.filter(e => ids.includes(e.equipmentId)), sorting);
    },
  }),
];
