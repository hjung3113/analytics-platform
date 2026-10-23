// Whole-catalog reads over GET /analytics-areas. A separate module from the single-page client so
// the walk goes through the exported `fetchAnalyticsAreas` (and a test can replace it).

import { type AnalyticsAreaDto, fetchAnalyticsAreas } from './analytics-areas';
import { walkAnalyticsAreaPages } from './registry-reads';

/**
 * Walk every page of GET /analytics-areas (see `walkAnalyticsAreaPages`) through the exported
 * `fetchAnalyticsAreas`, so a test that replaces it sees every page request.
 */
export function fetchEveryAnalyticsAreaPage(options: {
  managedSystemId?: string;
  includeArchived?: boolean;
  signal?: AbortSignal;
}): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
  return walkAnalyticsAreaPages(fetchAnalyticsAreas, options);
}

/** Every Area (archived included) of one Managed System, or of all of them. */
export function fetchAllAnalyticsAreas(options?: {
  managedSystemId?: string;
  signal?: AbortSignal;
}): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
  return fetchEveryAnalyticsAreaPage({ ...options, includeArchived: true });
}
