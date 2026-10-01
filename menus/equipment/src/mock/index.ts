/**
 * Mock server half of the equipment-master endpoints (#128). The app composition root registers this list via
 * `@ap/menu-equipment/mock`; pages never import this module. Filtering moved here from the page so the export
 * and every table page are answered — and permission re-checked — by the server.
 */
import { sortAndPage } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint, type Equipment } from '@ap/mock-server';
import { equipmentListEndpoint, equipmentPageEndpoint, type EquipmentFilter } from '../endpoints';

export function filterEquipment(rows: Equipment[], { q, status, maker }: EquipmentFilter): Equipment[] {
  const search = q.trim().toLowerCase();
  return rows.filter(e => (!search || `${e.equipmentId} ${e.name}`.toLowerCase().includes(search)) && (!status || e.status === status) && (!maker || e.maker === maker));
}

export const equipmentMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(equipmentListEndpoint, {
    handle: ({ equipment, params }) => filterEquipment(equipment, params),
    isEmpty: rows => rows.length === 0,
  }),
  defineMockEndpoint(equipmentPageEndpoint, {
    handle: ({ equipment, params: { q, status, maker, page, pageSize, sorting } }) =>
      sortAndPage(filterEquipment(equipment, { q, status, maker }), { page, pageSize, sorting }),
    isEmpty: data => data.total === 0,
  }),
];
