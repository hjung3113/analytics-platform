import { isRequestablePermissionState } from '../api/permission-request-progress';
import { usePermissionCheckBridge } from './usePermissionCheckBridge';

type ScopedEmptyListPermission =
  | { state: 'unchecked' | 'checking' | 'allowed' }
  | { state: 'error'; retry: () => void }
  | { state: 'blocked'; request: { capability: string; managedSystemId: string; pending: boolean } | null };

/** An empty scoped result can mean the server filtered out every row the actor cannot read. */
export function useScopedEmptyListPermission({
  capability,
  managedSystemId,
  empty,
}: {
  capability: string;
  managedSystemId: string | undefined;
  empty: boolean;
}): ScopedEmptyListPermission {
  const enabled = empty && managedSystemId !== undefined;
  const check = usePermissionCheckBridge({
    capability,
    ...(managedSystemId === undefined ? {} : { managedSystemId }),
  }, { enabled });
  if (!enabled) return { state: 'unchecked' };
  if (check.isFetching) return { state: 'checking' };
  if (check.isError) return { state: 'error', retry: () => void check.refetch() };
  if (!check.isSuccess) return { state: 'checking' };
  if (check.data.decision.allow) return { state: 'allowed' };

  const { state } = check.data;
  const pending = state === 'pending_request';
  const request = pending || isRequestablePermissionState(state) ? { capability, managedSystemId, pending } : null;
  return { state: 'blocked', request };
}
