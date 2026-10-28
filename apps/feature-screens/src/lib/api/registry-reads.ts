// Managed System and Analytics Area list reads. Their own module so the platform bridge's compose screen
// reaches them through `client.ts` (`/api/features`, platform ADR-0071); `managed-systems.ts` and `analytics-areas.ts`
// re-export the reads and the `client.ts` write twins from `registry-writes.ts`.

import { analyticsAreaListSchema, managedSystemListSchema } from '@ap/feature-shared';
import { apiRequest } from './client';

export interface ManagedSystemDto {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  external_key: string | null;
  default_owner_actor_id: string | null;
  default_owner_team_id: string | null;
  default_reviewer_actor_id: string | null;
  default_reviewer_team_id: string | null;
  archived_at: string | null;
  archived_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsAreaDto {
  id: string;
  workspace_id: string;
  managed_system_id: string;
  slug: string;
  name: string;
  owner_team_id: string | null;
  archived_at: string | null;
  archived_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchManagedSystems(options?: {
  includeArchived?: boolean;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ items: ManagedSystemDto[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.includeArchived) params.set('include_archived', 'true');
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  const url = `/managed-systems${params.size ? `?${params.toString()}` : ''}`;
  const result = await apiRequest(
    'GET',
    url,
    managedSystemListSchema,
    options?.signal ? { signal: options.signal } : {},
  );
  // The schema checks the envelope only (see registry-lists.ts); the rows are the server's, typed as before.
  return result.data as unknown as { items: ManagedSystemDto[]; total: number };
}

export async function fetchAnalyticsAreas(options?: {
  managedSystemId?: string;
  includeArchived?: boolean;
  /** Page size; the endpoint caps this at 500. */
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
  if (options?.includeArchived) params.set('include_archived', 'true');
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));
  const url = `/analytics-areas${params.size ? `?${params.toString()}` : ''}`;
  const result = await apiRequest(
    'GET',
    url,
    analyticsAreaListSchema,
    options?.signal ? { signal: options.signal } : {},
  );
  return result.data as unknown as { items: AnalyticsAreaDto[]; total: number };
}

// GET /analytics-areas caps limit at 500; paginate rather than raise it (F4).
const ANALYTICS_AREAS_PAGE_LIMIT = 500;

/**
 * Walk every page of GET /analytics-areas through `fetchPage`. Stops once the items in hand reach
 * `total`, or when a page comes back empty while `total` is still ahead.
 */
export async function walkAnalyticsAreaPages(
  fetchPage: typeof fetchAnalyticsAreas,
  options: { managedSystemId?: string; includeArchived?: boolean; signal?: AbortSignal },
): Promise<{ items: AnalyticsAreaDto[]; total: number }> {
  const items: AnalyticsAreaDto[] = [];
  let total = 0;
  do {
    const page = await fetchPage({
      ...options,
      limit: ANALYTICS_AREAS_PAGE_LIMIT,
      offset: items.length,
    });
    total = page.total;
    if (page.items.length === 0) break;
    items.push(...page.items);
  } while (items.length < total);
  return { items, total };
}
