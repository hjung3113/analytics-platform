// /integration, /integration/evidence, /integration/coverage and /integration/links search schemas — owned by the feature layer and free of the
// router (voc-search.ts precedent) so the route files, the screens and the platform bridge's entry import one definition. Each route file
// re-exports its schema and `validate…` for existing consumers.

import { parseRouteSearch, recoverySearchFields } from '@/lib/host/search-fields';
import { z } from 'zod';

export const integrationDashboardSearchSchema = z
  .object({
    ...recoverySearchFields,
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
  })
  .strict();
export type IntegrationDashboardSearch = z.infer<typeof integrationDashboardSearchSchema>;

export function validateIntegrationDashboardSearch(raw: unknown) {
  return parseRouteSearch(integrationDashboardSearchSchema, raw);
}

export const evidenceSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    source: z.enum(['voc', 'survey_response', 'note']).optional(),
    q: z
      .string()
      .trim()
      .max(200)
      .transform((value) => value || undefined)
      .optional(),
    selected: z.string().uuid().optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type EvidenceSearch = z.infer<typeof evidenceSearchSchema>;

export function validateEvidenceSearch(raw: unknown) {
  return parseRouteSearch(evidenceSearchSchema, raw);
}

// docs/frontend/routes-and-layout.md: /integration/coverage?managedSystem=:managedSystemId|all
export const integrationCoverageSearchSchema = z
  .object({
    view: z.literal('areas').optional(),
    'filter.analytics_area': z.union([z.string().uuid(), z.literal('unset')]).optional(),
    cursor: z.string().min(1).optional(),
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
  })
  .strict();
export type IntegrationCoverageSearch = z.infer<typeof integrationCoverageSearchSchema>;

export function validateIntegrationCoverageSearch(raw: unknown) {
  return parseRouteSearch(integrationCoverageSearchSchema, raw);
}

export const integrationLinksSearchSchema = z
  .object({
    status: z.enum(['active', 'stale', 'detached', 'revoked']).optional(),
    type: z.enum(['related_to']).optional(),
    managedSystem: z.string().optional(),
  })
  .strict();
export type IntegrationLinksSearch = z.infer<typeof integrationLinksSearchSchema>;

export function validateIntegrationLinksSearch(raw: unknown) {
  return parseRouteSearch(integrationLinksSearchSchema, raw);
}

function isSearchValueValid(schema: z.AnyZodObject, key: string, value: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(schema.shape, key)) return false;
  return schema.shape[key].safeParse(value).success;
}

/**
 * Strict per-field checks: whether `value` is one `key` accepts under the matching schema. The `validate…` functions drop a value that fails and the
 * screen then shows a default; a host that must reject instead (platform ADR-0071 decision 9) asks these before mounting. One per schema, because
 * the schemas differ per key (Links `managedSystem` is any string, the dashboard `selected` is a queue item id, Evidence `selected` a uuid).
 */
export function isIntegrationDashboardSearchValueValid(key: string, value: string): boolean {
  return isSearchValueValid(integrationDashboardSearchSchema, key, value);
}
export function isEvidenceSearchValueValid(key: string, value: string): boolean {
  return isSearchValueValid(evidenceSearchSchema, key, value);
}
export function isIntegrationCoverageSearchValueValid(key: string, value: string): boolean {
  return isSearchValueValid(integrationCoverageSearchSchema, key, value);
}
export function isIntegrationLinksSearchValueValid(key: string, value: string): boolean {
  return isSearchValueValid(integrationLinksSearchSchema, key, value);
}
