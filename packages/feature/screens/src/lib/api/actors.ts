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
  // The endpoint bounds each identity list separately. Deduplicate before chunking so
  // accumulated pages do not re-request an identity within the same resolution.
  const RESOLVE_BATCH_SIZE = 200;
  const actorIds = [...new Set(params.actorIds ?? [])];
  const teamIds = [...new Set(params.teamIds ?? [])];
  const result: ResolveActorsResponse = { actors: [], teams: [] };
  const total = Math.max(actorIds.length, teamIds.length, 1);
  try {
    for (let offset = 0; offset < total; offset += RESOLVE_BATCH_SIZE) {
      const search = new URLSearchParams();
      const actors = actorIds.slice(offset, offset + RESOLVE_BATCH_SIZE);
      const teams = teamIds.slice(offset, offset + RESOLVE_BATCH_SIZE);
      if (actors.length > 0) search.set('actor_ids', actors.join(','));
      if (teams.length > 0) search.set('team_ids', teams.join(','));
      const url = `/actors/resolve${search.size ? `?${search.toString()}` : ''}`;
      const response = await apiRequest('GET', url, parseResolveActors, signal ? { signal } : {});
      result.actors.push(...response.data.actors);
      result.teams.push(...response.data.teams);
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError && !(error instanceof ApiParseError)) {
      if (error.status === 401) throw new UnauthenticatedError();
      throw new Error(`/actors/resolve failed: ${error.status}`);
    }
    throw error;
  }
}
