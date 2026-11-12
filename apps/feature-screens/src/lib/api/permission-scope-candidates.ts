// `GET /permission-requests/scope-candidates` (ADR-0154 decision 5): the Scope catalog's sites and rooms with the
// caller's coverage. The only source of ungranted room names; screens never derive them from the session.
// Its own module so the bridge 권한 요청 page reaches it without the `@/lib/api` barrel.

import {
  type PermissionScopeCatalogCandidate,
  permissionScopeCandidatesResponseSchema,
} from '@ap/feature-shared';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './client';

export type { PermissionScopeCatalogCandidate };

export const permissionScopeCandidatesKey = ['permission-requests', 'scope-candidates'] as const;

export async function fetchPermissionScopeCandidates(
  signal?: AbortSignal,
): Promise<PermissionScopeCatalogCandidate[]> {
  const response = await apiRequest(
    'GET',
    '/permission-requests/scope-candidates',
    permissionScopeCandidatesResponseSchema,
    signal ? { signal } : {},
  );
  return response.data.sites;
}

export function usePermissionScopeCandidates(enabled: boolean) {
  return useQuery({
    queryKey: permissionScopeCandidatesKey,
    queryFn: ({ signal }) => fetchPermissionScopeCandidates(signal),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}
