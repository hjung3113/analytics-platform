// Bridge-safe variant of `usePermissionCheck`: the same query key and result, fetched through `client.ts`
// (`fetchPermissionCheckViaClient`) and without the `@/lib/api` barrel the platform bridge graph bans.

import { useQuery } from '@tanstack/react-query';

import {
  type PermissionCheckResponse,
  fetchPermissionCheckViaClient,
} from '@/lib/api/permission-reads';

export interface UsePermissionCheckArgs {
  capability: string;
  managedSystemId?: string;
}

export function permissionCheckQueryKey(args: UsePermissionCheckArgs) {
  return ['permission-check', args.capability, args.managedSystemId ?? null] as const;
}

export function usePermissionCheckBridge(args: UsePermissionCheckArgs) {
  return useQuery<PermissionCheckResponse>({
    queryKey: permissionCheckQueryKey(args),
    queryFn: ({ signal }) =>
      fetchPermissionCheckViaClient(args.capability, {
        ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
        signal,
      }),
    retry: false,
    staleTime: 30_000,
  });
}
