// /surveys and /surveys/:surveyId search schemas — owned by the feature layer and free of the router (findings-search.ts precedent) so the route files, the
// screens and the platform bridge's entry import one definition. The route files re-export these names for existing consumers.

import {
  isSearchFieldValueValid,
  parseRouteSearch,
  platformReturnField,
  recoverySearchFields,
} from '@/lib/host/search-fields';
import { z } from 'zod';

// Selection + Managed System scope are URL state (docs/feedbackops/frontend/routes-and-layout.md
// §URL State Rules): /surveys?managedSystem=:managedSystemId|all&selected=:surveyId.
// Defaults (scope union / nothing selected) are omitted from the URL. `all` and an
// absent managedSystem both query WITHOUT managed_system_id (the backend applies the
// caller's effective scope union); a uuid is passed through as the backend's
// `managed_system_id` query param. The route has no Managed System selector UI —
// the URL param is supported for deep links only.
export const surveysSearchSchema = z
  .object({
    platformReturn: platformReturnField,
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    selected: z.string().uuid().optional(),
    'filter.analytics_area': z.union([z.string().uuid(), z.literal('unset')]).optional(),
    status: z.literal('open').optional(),
    follow_up: z.literal('needed').optional(),
  })
  .strict();

export type SurveysSearch = z.infer<typeof surveysSearchSchema>;

export function validateSurveysSearch(raw: unknown) {
  return parseRouteSearch(surveysSearchSchema, raw);
}

/** Strict per-field check against {@link surveysSearchSchema} (platform ADR-0071 decision 9): a host that rejects instead of dropping asks this. */
export function isSurveysSearchValueValid(key: string, value: string): boolean {
  return isSearchFieldValueValid(surveysSearchSchema, key, value);
}

// The detail route (and its `results` / `follow-up` children, which inherit it) carries the list scope back, plus the builder switch and the recovery
// `returnTo`.
export const surveyDetailSearchSchema = z
  .object({
    builder: z.boolean().optional(),
    returnTo: recoverySearchFields.returnTo,
    platformReturn: platformReturnField,
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    'filter.analytics_area': z.union([z.string().uuid(), z.literal('unset')]).optional(),
    status: z.literal('open').optional(),
    follow_up: z.literal('needed').optional(),
  })
  .strict();

export function validateSurveyDetailSearch(raw: unknown) {
  return parseRouteSearch(surveyDetailSearchSchema, raw);
}

/** Strict per-field check against {@link surveyDetailSearchSchema}. `builder` is a boolean in the schema (the router decodes `?builder=true`); a host's value is the string `'true'`. */
export function isSurveyDetailSearchValueValid(key: string, value: string): boolean {
  if (key === 'builder') return value === 'true';
  return isSearchFieldValueValid(surveyDetailSearchSchema, key, value);
}
