// Filter fields of the knowledge draft list (#1198 a). Wire shape and parser are the catalog's (`parseCatalogFilters`,
// ADR-0105); only the fields differ.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';
import { DRAFT_STATUSES } from './draft-transitions.js';

export const DRAFT_ORIGINS = ['human', 'ai', 'validator'] as const;

const SCALAR_OPS = ['in', 'notIn'] as const;
const enumField = (allowed: readonly string[]): CatalogFilterFieldSpec => ({
  ops: SCALAR_OPS,
  multiple: true,
  cell: 'scalar',
  values: 'enum',
  allowed,
});

export const DRAFT_FILTER_SPECS = {
  status: enumField(DRAFT_STATUSES),
  origin: enumField(DRAFT_ORIGINS),
  proposalType: enumField(['create', 'revise']),
  ownerModelId: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'uuid' },
} as const satisfies Record<string, CatalogFilterFieldSpec>;
