// `GET /me/permissions/declared-capabilities` (ADR-0157 decision 9): the capabilities this deployment's bundle declares,
// with display name, `sensitive` and whether the reader's Role Level may request them. Display only — the server judges
// the reason requirement, the Role Level and tokens. Its own module so bridge pages reach it without the `@/lib/api` barrel.

import { type DeclaredCapabilityItem, listDeclaredCapabilitiesResponseSchema } from '@ap/feature-shared';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './client';

export type { DeclaredCapabilityItem };

export const declaredCapabilitiesKey = ['permissions', 'declared-capabilities'] as const;

export async function fetchDeclaredCapabilities(signal?: AbortSignal): Promise<DeclaredCapabilityItem[]> {
  const response = await apiRequest(
    'GET',
    '/me/permissions/declared-capabilities',
    listDeclaredCapabilitiesResponseSchema,
    signal ? { signal } : {},
  );
  return response.data.items;
}

/** Empty until loaded (or on failure): a declared name then shows its id, which is still accurate. */
export function useDeclaredCapabilities(enabled = true): readonly DeclaredCapabilityItem[] {
  const query = useQuery({
    queryKey: declaredCapabilitiesKey,
    queryFn: ({ signal }) => fetchDeclaredCapabilities(signal),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  return query.data ?? EMPTY;
}

const EMPTY: readonly DeclaredCapabilityItem[] = Object.freeze([]);
