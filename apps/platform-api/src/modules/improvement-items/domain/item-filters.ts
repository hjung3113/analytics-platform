// Closed vocabularies of the improvement item (design docs/design/features/improvement-items.md §1) and the filter
// fields of the item list. The wire shape and parser are the shared list-params library's (ADR-0105).
// `notIn` on a nullable field (assignee, questId, origin) also excludes rows without a value; `isEmpty` finds them.

import type { CatalogFilterFieldSpec } from '../../../lib/list-params/catalog-filters.js';

export const ITEM_STATUSES = ['open', 'in_progress', 'done', 'verified', 'dropped'] as const;
export const TARGET_KINDS = ['equipment', 'process'] as const;
export const EVENT_TYPES = ['created', 'updated', 'status_changed', 'assigned', 'quest_linked', 'reopened'] as const;
/** The literal an `assignee` filter accepts for the signed-in actor; resolved before the query. */
export const ASSIGNEE_ME = 'me';
export const TEXT_FIELD_MAX = 200;

const SCALAR_OPS = ['in', 'notIn'] as const;

export const ITEM_FILTER_SPECS = {
  status: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'enum', allowed: ITEM_STATUSES },
  assignee: {
    ops: ['in', 'notIn', 'isEmpty', 'isNotEmpty'],
    multiple: true,
    cell: 'scalar',
    values: 'uuid',
    literals: [ASSIGNEE_ME],
  },
  questId: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'text', maxLength: TEXT_FIELD_MAX },
  questLinked: { ops: ['in'], multiple: false, cell: 'scalar', values: 'boolean' },
  origin: { ops: SCALAR_OPS, multiple: true, cell: 'scalar', values: 'text', maxLength: TEXT_FIELD_MAX },
} as const satisfies Record<string, CatalogFilterFieldSpec>;
