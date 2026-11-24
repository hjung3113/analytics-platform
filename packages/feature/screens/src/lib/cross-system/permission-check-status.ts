export type PermissionCheckStatus = 'pending' | 'error' | 'success';

export function permissionCheckStatus(check: {
  isFetching: boolean;
  isPending: boolean;
  isError: boolean;
}): PermissionCheckStatus {
  if (check.isFetching || check.isPending) return 'pending';
  return check.isError ? 'error' : 'success';
}
