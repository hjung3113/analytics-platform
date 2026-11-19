import { OPEN_PERMISSION_REQUEST_STATUSES } from '@ap/feature-shared';
import type { FrontendPermissionState } from './permission-reads';
import type { MinePermissionRequestRow } from './permission-requests';

export function isRequestablePermissionState(state: FrontendPermissionState | null): boolean {
  return state === 'request_access' || state === 'expired' || state === 'revoked';
}

export function permissionRequestProgress(
  rows: readonly MinePermissionRequestRow[],
  capability: string,
  managedSystemId: string | undefined,
  { pending }: { pending?: boolean } = {},
): 'none' | 'pending' | 'approved-partial' {
  const sameCapability = rows.filter(row => row.requested_capability === capability && row.requested_object_id === null);
  const hasPending = pending ?? sameCapability.some(
    row => row.requested_managed_system_id === (managedSystemId ?? null) && OPEN_PERMISSION_REQUEST_STATUSES.has(row.status),
  );
  if (hasPending) return 'pending';
  if (managedSystemId && sameCapability.some(row => row.status === 'approved'
    && row.requested_managed_system_id !== null && row.requested_managed_system_id !== managedSystemId)) return 'approved-partial';
  return 'none';
}
