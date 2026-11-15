import { vocCreateTargetsSchema } from '@ap/feature-shared';
import { apiRequest } from './client';

/** Query key of the targets; the bridge's `availability()` reads the same cache entry. */
export const VOC_CREATE_TARGETS_QUERY_KEY = ['vocs', 'create-targets'] as const;

/**
 * How long a cached answer counts as current. The compose screen's query `staleTime` and the bridge's `availability()`
 * both use this one value, so the report button's `denied` and the form's own judgment never disagree on freshness.
 */
export const VOC_CREATE_TARGETS_STALE_MS = 15 * 1000;

/** `GET /vocs/create-targets` (#1358): which live Managed Systems the signed-in actor may file a VOC in. */
export async function fetchVocCreateTargets(signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    '/vocs/create-targets',
    vocCreateTargetsSchema,
    signal ? { signal } : {},
  );
  return response.data.items;
}
