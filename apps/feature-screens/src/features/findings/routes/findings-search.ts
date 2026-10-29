// /findings search schema — owned by the feature layer and free of the router (voc-search.ts precedent) so the route file, the screen and the
// platform bridge's entry import one definition. The route file re-exports `findingsSearchSchema` and `validateFindingsSearch` for existing consumers.

import { vocSearchSchema } from '@/features/voc/routes/voc-search';
import { isSearchFieldValueValid, parseRouteSearch } from '@/lib/host/search-fields';
import { listFindingsQuerySchema } from '@ap/feature-shared';
import { z } from 'zod';

// Selection + Managed System scope are URL state (docs/design/features/routes-and-layout.md
// §URL State Rules): /findings?managedSystem=:managedSystemId|all&selected=:findingId.
// Defaults (scope union / nothing selected) are omitted from the URL. `all` and an
// absent managedSystem both query WITHOUT managed_system_id (the backend applies the
// caller's effective scope union); a uuid is passed through.
// execution=none is the coverage gap hop. `returnTo` carries a same-origin VOC list URL.
// Absent execution stays unfiltered.
export const findingsSearchSchema = z
  .object({
    q: listFindingsQuerySchema.shape.q,
    'filter.analytics_area': z.union([z.string().uuid(), z.literal('unset')]).optional(),
    status: z.literal('active').optional(),
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    selected: z.string().uuid().optional(),
    execution: z.literal('none').optional(),
    assignment: z.enum(['assigned', 'unassigned']).optional(),
    returnTo: z.string().max(2048).optional(),
  })
  .strict();

export type FindingsSearch = z.infer<typeof findingsSearchSchema>;

export function validateFindingsSearch(raw: unknown) {
  return parseRouteSearch(findingsSearchSchema, raw);
}

/**
 * Strict per-field check: whether `value` is one `key` accepts under {@link findingsSearchSchema}. `validateFindingsSearch` drops a value that fails
 * and the screen then lists a default; a host that must reject instead (platform ADR-0071 decision 9) asks this before mounting.
 */
export function isFindingsSearchValueValid(key: string, value: string): boolean {
  return isSearchFieldValueValid(findingsSearchSchema, key, value);
}

export function getSafeVocReturnTo(value: string | undefined): string | null {
  if (value === undefined || !value.startsWith('/vocs')) return null;

  try {
    const url = new URL(value, 'http://platform.local');
    if (url.origin !== 'http://platform.local' || url.pathname !== '/vocs' || url.hash) {
      return null;
    }

    const searchEntries = [...url.searchParams.entries()];
    if (new Set(searchEntries.map(([key]) => key)).size !== searchEntries.length) return null;
    if (!vocSearchSchema.safeParse(Object.fromEntries(searchEntries)).success) return null;

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
