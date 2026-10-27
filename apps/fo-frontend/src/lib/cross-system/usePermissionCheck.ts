// TanStack Query hook for GET /me/permissions/check.
//
// Keyed on `(capability, managed_system_id|null)` so multiple gates on the
// same screen with different scopes don't collide. Per AGENTS.md:69 the
// frontend never enforces backend permissions as truth — this hook only
// surfaces what the server returned.

import { useQuery } from '@tanstack/react-query';

import { type PermissionCheckResponse, fetchPermissionCheck } from '@/lib/api';

import { type UsePermissionCheckArgs, permissionCheckQueryKey } from './usePermissionCheckBridge';

// The key and args live in the bridge-safe variant (one key shape for both hooks); re-exported for existing callers.
export { type UsePermissionCheckArgs, permissionCheckQueryKey };

// Issue #5: shared query key for the open-requests list, defined next to its fetch (#657) and re-exported here
// so the request-access button can invalidate both keys on a successful POST.
export { permissionRequestsMineKey } from '@/lib/api/permission-requests';

export function usePermissionCheck(args: UsePermissionCheckArgs) {
  return useQuery<PermissionCheckResponse>({
    queryKey: permissionCheckQueryKey(args),
    queryFn: ({ signal }) =>
      fetchPermissionCheck(args.capability, {
        ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
        signal,
      }),
    retry: false,
    // The decision is allowed to change as soon as admins flip a grant; we
    // don't aggressively poll, but we also don't cache stale forever.
    staleTime: 30_000,
  });
}
