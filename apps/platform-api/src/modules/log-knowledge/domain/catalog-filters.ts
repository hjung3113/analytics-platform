// Filter fields of the log knowledge catalog reads (ADR-0105). The wire shape, value kinds and parser are the
// shared list-params library's (`src/lib/list-params/`); only the per-endpoint field specs live here. The menu's
// `src/endpoints.ts` declares the same specs and a drift test pins both sides.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';

const SCALAR_OPS = ['in', 'notIn'] as const;
const ACTIVE: CatalogFilterFieldSpec = { ops: SCALAR_OPS, multiple: false, cell: 'scalar', values: 'boolean' };
const UUID_FIELD: CatalogFilterFieldSpec = { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'uuid' };

/** Filter fields of each read endpoint. */
export const CATALOG_FILTER_SPECS = {
  vendors: { active: ACTIVE, id: UUID_FIELD },
  processes: { active: ACTIVE, id: UUID_FIELD },
  models: {
    active: ACTIVE,
    id: UUID_FIELD,
    vendorId: UUID_FIELD,
    processes: {
      ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'],
      multiple: true,
      cell: 'many',
      values: 'uuid',
    },
  },
  softwareVersions: { active: ACTIVE, id: UUID_FIELD, modelId: UUID_FIELD },
} as const satisfies Record<string, Record<string, CatalogFilterFieldSpec>>;

export type CatalogEndpointName = keyof typeof CATALOG_FILTER_SPECS;
