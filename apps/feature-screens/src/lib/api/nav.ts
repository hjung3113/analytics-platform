import { type NavResolveResponse, navResolveResponseSchema } from '@fops/shared';

import { apiRequest } from './client';
import { ApiError, ApiParseError } from './types';
import { UnauthenticatedError } from './unauthenticated';

export type NavCounts = Partial<Record<NavCountKey, number>>;
export type NavCountKey =
  | 'voc.inbox'
  | 'voc.triage'
  | 'voc.my'
  | 'voc.tab.high'
  | 'voc.tab.unassigned'
  | 'voc.tab.untriaged'
  | 'voc.tab.waiting'
  | 'voc.inbox.no-link'
  | 'voc.clusters'
  | 'findings.all'
  | 'surveys.all'
  | 'home.unassigned-voc'
  | 'home.high-severity-unlinked'
  | 'home.actionable-finding-no-execution'
  | 'home.released-task-unresolved-voc'
  | 'home.bad-outcome-no-followup'
  | 'home.permission-requests-pending';

export interface NavCountsResponse {
  counts: NavCounts;
}

/**
 * The `Partial<Record<...>>` count type intentionally preserves an omitted key.
 * `undefined` means no visible backing queue; zero is a visible, empty queue.
 */
export async function fetchNavCounts(options?: {
  managedSystemId?: string;
  signal?: AbortSignal;
}): Promise<NavCountsResponse> {
  const params = new URLSearchParams();
  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
  const path = `/nav/counts${params.size ? `?${params.toString()}` : ''}`;
  try {
    const response = await apiRequest(
      'GET',
      path,
      (data) => data as NavCountsResponse,
      options?.signal ? { signal: options.signal } : {},
    );
    return response.data;
  } catch (error) {
    // 401 keeps the standalone redirect class (client.ts already ran onUnauthorized).
    if (error instanceof ApiError && !(error instanceof ApiParseError)) {
      if (error.status === 401) throw new UnauthenticatedError();
      throw new Error(`/nav/counts failed: ${error.status}`);
    }
    throw error;
  }
}

/**
 * Command palette display-id resolution (#611): `GET /nav/resolve?display_id=`
 * per docs/feedbackops/implementation/api/navigation.md. Missing, foreign-workspace, and
 * not-readable records all arrive as the identical `404 not_found.record`
 * ApiError; malformed ids are `422 validation.failed`.
 */
export async function fetchNavResolve(
  displayId: string,
  options?: { signal?: AbortSignal },
): Promise<NavResolveResponse> {
  const response = await apiRequest(
    'GET',
    `/nav/resolve?display_id=${encodeURIComponent(displayId)}`,
    navResolveResponseSchema,
    {
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    },
  );
  return response.data;
}
