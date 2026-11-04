// Common list params of the paged menu reads (log knowledge, improvement items): `q`, `page`, `pageSize`, `sorting`, `filters` (ADR-0105). A value
// the endpoint cannot honour is a refusal message for the engine's params judgment, never an empty page.

import { unsafeText } from '../../modules/platform-port/text-safety.js';
import { type CatalogFilterFieldSpec, parseCatalogFilters } from './catalog-filters.js';
import type { ListQuery } from './types.js';

export const PAGE_SIZE_MAX = 200;
export const Q_MAX = 200;
const SORT_KEYS_MAX = 3;

export type Parsed = { ok: true; value: ListQuery } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Parses the common list params; an absent key takes its default, an explicit null is a refusal (except q, where null means no search). `filterSpecs` are the endpoint's filter fields (ADR-0105); no `filters` = every row. */
export function parseListParams(
  params: Record<string, unknown>,
  sortIds: readonly string[],
  filterSpecs: Readonly<Record<string, CatalogFilterFieldSpec>>,
  defaultSort: { id: string; desc: boolean } = { id: sortIds[0] as string, desc: false },
): Parsed {
  const q = params.q ?? null;
  if (q !== null && (typeof q !== 'string' || q.length > Q_MAX || unsafeText(q))) {
    return fail(`q must be a string of at most ${Q_MAX} characters or null`);
  }
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return fail('page must be a non-negative integer (0-based)');
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`);
  }
  const sorting = params.sorting === undefined ? [] : params.sorting;
  if (!Array.isArray(sorting) || sorting.length > SORT_KEYS_MAX) {
    return fail(`sorting must be a list of at most ${SORT_KEYS_MAX} sort keys`);
  }
  const seen = new Set<string>();
  const sorts: { id: string; desc: boolean }[] = [];
  for (const entry of sorting as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return fail('a sort key must be an object');
    const { id, desc, ...rest } = entry as Record<string, unknown>;
    if (Object.keys(rest).length > 0 || typeof id !== 'string' || typeof desc !== 'boolean') {
      return fail('a sort key is { id: string, desc: boolean }');
    }
    if (!sortIds.includes(id)) return fail(`sorting by ${id} is not supported`);
    if (seen.has(id)) return fail(`sorting by ${id} twice`);
    seen.add(id);
    sorts.push({ id, desc });
  }
  const filters = parseCatalogFilters(params.filters, filterSpecs);
  if (!filters.ok) return filters;
  return {
    ok: true,
    value: {
      workspaceId: '',
      q: q as string | null,
      conditions: filters.value,
      page,
      pageSize,
      sorting: sorts.length > 0 ? sorts : [defaultSort],
    },
  };
}

