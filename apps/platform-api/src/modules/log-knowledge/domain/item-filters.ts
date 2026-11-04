// Closed vocabularies of the knowledge item (ADR-0109) and the filter fields of the item reads. The wire shape
// and parser are the catalog's (`parseCatalogFilters`, ADR-0105); only the fields differ.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';

export const ITEM_TYPE_CODES = ['anomaly', 'needs_check', 'behavior_note', 'guideline'] as const;
export const VERIFICATION_STATES = ['not_checked', 'observed', 'verified', 'disputed'] as const;
export const PROCESSING_STATES = ['open', 'under_investigation', 'resolved'] as const;
export const PUBLICATION_STATES = ['published', 'archived'] as const;
export const OWNER_KINDS = ['model', 'software'] as const;
export const LINK_KINDS = ['derived_from', 'related'] as const;

const SCALAR_OPS = ['in', 'notIn'] as const;
const uuidField: CatalogFilterFieldSpec = { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'uuid' };
const enumField = (allowed: readonly string[]): CatalogFilterFieldSpec => ({
  ops: SCALAR_OPS,
  multiple: true,
  cell: 'scalar',
  values: 'enum',
  allowed,
});

/** Filter fields of the item list. `includeSoftware` only widens `ownerModelId` (a model's items + its SW versions' items); default false. */
export const ITEM_FILTER_SPECS = {
  ownerKind: enumField(OWNER_KINDS),
  ownerModelId: uuidField,
  ownerSoftwareId: uuidField,
  includeSoftware: { ops: ['in'], multiple: false, cell: 'scalar', values: 'boolean' },
  typeCode: enumField(ITEM_TYPE_CODES),
  verificationState: enumField(VERIFICATION_STATES),
  processingState: enumField(PROCESSING_STATES),
  publicationState: enumField(PUBLICATION_STATES),
} as const satisfies Record<string, CatalogFilterFieldSpec>;
