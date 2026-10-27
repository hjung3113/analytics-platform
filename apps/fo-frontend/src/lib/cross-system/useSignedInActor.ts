// The signed-in actor, read from GET /me through the host-aware API client.
//
// useMe is not usable from the platform bridge: it fetches `/me` without the client's base path and imports the
// `@/lib/api` barrel, which `src/global-screens` must not reach. One query, own key (never ['me']: that key's
// queryFn is useMe's).

import { apiRequest } from '@/lib/api/client';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const signedInActorSchema = z.object({
  actor: z.object({ id: z.string().min(1), display_name: z.string() }),
});

export interface SignedInActor {
  id: string;
  display_name: string;
}

export const signedInActorQueryKey = ['me', 'actor'] as const;

export function useSignedInActor(): UseQueryResult<SignedInActor> {
  return useQuery<SignedInActor>({
    queryKey: signedInActorQueryKey,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await apiRequest('GET', '/me', signedInActorSchema, { signal });
      return { id: res.data.actor.id, display_name: res.data.actor.display_name };
    },
  });
}
