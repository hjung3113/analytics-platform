// Router-free home of the /voc-clusters search schema, so the list screen (bridge entry) can parse its host's search
// without importing the route. `routes/_authed/voc-clusters/index.tsx` re-exports it.
import { parseRouteSearch } from '@/lib/host/search-fields';
import { z } from 'zod';

// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /voc-clusters?managedSystem=:managedSystemId|all&selected=:clusterId.
// Defaults (scope union / nothing selected) are omitted from the URL. `all` and an
// absent managedSystem both query WITHOUT managed_system_id (the backend applies the
// caller's effective scope union); a uuid is passed through. The route has no
// Managed System selector UI — the URL param is supported for deep links only.
export const vocClustersSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    selected: z.string().uuid().optional(),
  })
  .strict();

export type VocClustersSearch = z.infer<typeof vocClustersSearchSchema>;

export function validateVocClustersSearch(raw: unknown): VocClustersSearch {
  return parseRouteSearch(vocClustersSearchSchema, raw);
}
