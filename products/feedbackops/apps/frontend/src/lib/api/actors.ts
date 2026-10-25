// Actor / team identity resolution (issue #87).
// GET /actors/resolve?actor_ids=...&team_ids=... → display names for owner chips.
// The frontend uses this purely for presentation; it never gates behavior on it.

import { apiRequest } from './client';
import { ApiError, ApiParseError } from './types';
import { UnauthenticatedError } from './unauthenticated';

export interface ResolvedActor {
  id: string;
  display_name: string;
  email: string;
}

export interface ResolvedTeam {
  id: string;
  name: string;
}

export interface ResolveActorsResponse {
  actors: ResolvedActor[];
  teams: ResolvedTeam[];
}

function parseResolveActors(data: unknown): ResolveActorsResponse {
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as { actors?: unknown }).actors) ||
    !Array.isArray((data as { teams?: unknown }).teams)
  ) {
    throw new TypeError('Malformed /actors/resolve response');
  }
  return data as ResolveActorsResponse;
}

export async function resolveActors(
  params: { actorIds?: string[]; teamIds?: string[] },
  signal?: AbortSignal,
): Promise<ResolveActorsResponse> {
  const search = new URLSearchParams();
  if (params.actorIds && params.actorIds.length > 0) {
    search.set('actor_ids', params.actorIds.join(','));
  }
  if (params.teamIds && params.teamIds.length > 0) {
    search.set('team_ids', params.teamIds.join(','));
  }
  const url = `/actors/resolve${search.size ? `?${search.toString()}` : ''}`;
  try {
    const response = await apiRequest('GET', url, parseResolveActors, signal ? { signal } : {});
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && !(error instanceof ApiParseError)) {
      if (error.status === 401) throw new UnauthenticatedError();
      throw new Error(`/actors/resolve failed: ${error.status}`);
    }
    throw error;
  }
}
