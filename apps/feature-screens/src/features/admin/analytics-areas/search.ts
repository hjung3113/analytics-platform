import type { HostSearch } from '@/lib/host/search';
import { isSearchFieldValueValid, parseRouteSearch } from '@/lib/host/search-fields';
import { z } from 'zod';

// List filters + selection are URL state (docs/design/features/routes-and-layout.md
// §URL State Rules): /admin/analytics-areas?managedSystem=:uuid&includeArchived=true&selected=:uuid.
// Defaults (all MS / archived hidden / nothing selected) are omitted from the
// URL. Keys are camelCase URL keys; the API keeps its own snake_case params.
export const analyticsAreasSearchSchema = z
  .object({
    managedSystem: z.string().uuid().optional(),
    // TanStack decodes URL `true` as a boolean; the host seam supplies semantic URL values as strings.
    includeArchived: z.preprocess(
      (value) => (value === 'true' ? true : value),
      z.boolean().optional(),
    ),
    selected: z.string().uuid().optional(),
  })
  .strict();
const analyticsAreasSearchKeys = new Set(Object.keys(analyticsAreasSearchSchema.shape));

export type AnalyticsAreasSearch = z.infer<typeof analyticsAreasSearchSchema>;
export type AnalyticsAreasHostSearch = Omit<AnalyticsAreasSearch, 'includeArchived'> & {
  includeArchived?: string | undefined;
} & Record<string, string | undefined>;

/** Host-facing validator: screen writes retain string-valued keys owned by other host layers. */
export function validateAnalyticsAreasSearch(raw: HostSearch): AnalyticsAreasHostSearch {
  const parsed = parseRouteSearch(analyticsAreasSearchSchema, raw);
  // Host search values are strings; the shared schema validates `true` as a
  // boolean first, then this host-facing validator restores its URL spelling.
  // Preserve unrelated host URL state so a screen write cannot clear keys it
  // does not own.
  const extras = Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) => !analyticsAreasSearchKeys.has(key) && value !== 'undefined',
    ),
  );
  const known = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => analyticsAreasSearchKeys.has(key)),
  ) as AnalyticsAreasSearch;
  const { includeArchived, ...rest } = known;
  // The host seam carries opaque URL strings. Preserve non-empty identifiers
  // here so the screen can resolve them against its loaded lists (standalone
  // test routers may supply non-UUID fixture IDs); the TanStack route validator
  // below remains strict and enforces the UUID route contract.
  const managedSystem =
    raw.managedSystem && raw.managedSystem !== 'undefined' ? raw.managedSystem : rest.managedSystem;
  const selected = raw.selected && raw.selected !== 'undefined' ? raw.selected : rest.selected;
  return {
    ...extras,
    ...rest,
    ...(managedSystem !== undefined ? { managedSystem } : {}),
    ...(selected !== undefined ? { selected } : {}),
    ...(includeArchived === true ? { includeArchived: 'true' } : {}),
  };
}

/** TanStack route validator: unrecognized URL fields follow the route cleanup contract. */
export function validateAnalyticsAreasRouteSearch(raw: unknown): AnalyticsAreasSearch {
  return parseRouteSearch(analyticsAreasSearchSchema, raw);
}

/** Strict per-field check against {@link analyticsAreasSearchSchema}. `includeArchived` is a boolean in the schema (the router decodes `?includeArchived=true`); a host's value is the string `'true'`. */
export function isAnalyticsAreasSearchValueValid(key: string, value: string): boolean {
  if (key === 'includeArchived') return value === 'true';
  return isSearchFieldValueValid(analyticsAreasSearchSchema, key, value);
}
