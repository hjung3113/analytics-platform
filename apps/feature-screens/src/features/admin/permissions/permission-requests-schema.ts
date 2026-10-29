import { isSearchFieldValueValid, parseRouteSearch, returnToField } from '@/lib/host/search-fields';
import { z } from 'zod';

// Router-free (and free of the copy/enum-labels barrel) so the bridge's admin-search entry imports it; permission-requests-search.ts re-exports it.
// Tab + selection are URL state (docs/design/features/routes-and-layout.md §URL State
// Rules): /admin/permissions/requests?tab=approved&selected=:requestId.
// `pending` is the default tab and omitted from the URL.
export const permissionRequestsSearchSchema = z
  .object({
    returnTo: returnToField,
    tab: z.enum(['needs_more_info', 'approved', 'rejected', 'all']).optional(),
    selected: z.string().uuid().optional(),
  })
  .strict();

export type PermissionRequestsSearch = z.infer<typeof permissionRequestsSearchSchema>;

export function validatePermissionRequestsSearch(raw: unknown) {
  return parseRouteSearch(permissionRequestsSearchSchema, raw);
}

/** Strict per-field check against {@link permissionRequestsSearchSchema}. */
export function isPermissionRequestsSearchValueValid(key: string, value: string): boolean {
  return isSearchFieldValueValid(permissionRequestsSearchSchema, key, value);
}
