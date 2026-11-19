// Bridge-safe variant of `usePermissionCheck`: the same query key and result, fetched through `client.ts`
// (`fetchPermissionCheckViaClient`) and without the `../api` barrel the platform bridge graph bans.

import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { fetchPermissionCheckViaClient } from '../api/permission-reads';

export interface UsePermissionCheckArgs {
  capability: string;
  managedSystemId?: string;
}

export function permissionCheckQueryKey(args: UsePermissionCheckArgs) {
  return ['permission-check', args.capability, args.managedSystemId ?? null] as const;
}

export function permissionCheckQueryOptions(args: UsePermissionCheckArgs) {
  return {
    queryKey: permissionCheckQueryKey(args),
    queryFn: ({ signal }: QueryFunctionContext) =>
      fetchPermissionCheckViaClient(args.capability, {
        ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
        signal,
      }),
    retry: false as const,
    staleTime: 30_000,
  };
}

export function usePermissionCheckBridge(
  args: UsePermissionCheckArgs,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({ ...permissionCheckQueryOptions(args), enabled });
}
