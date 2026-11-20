import { isPermissionDenied } from '../api/types';
import type { ScopedEmptyListPermission } from './useScopedEmptyListPermission';

export type ListReadDenial = {
  /** The list read is refused: a permission 403, or a settled blocked check of an empty scoped result. */
  denied: boolean;
  /** The server refused for a role, which no permission request can fix. */
  roleRequired: boolean;
  /** The permission the actor may request, from the blocked check or from the 403's `requestable_permission`. */
  request: { capability: string; managedSystemId?: string; pending?: boolean } | null | undefined;
};

/**
 * One judgment for a refused list read, so every list screen offers the same [권한 요청] or «요청 불가» for the same server answer (#2639).
 * A 403 wins over the empty-result check; a `role_required` 403 offers no request.
 */
export function listReadDenial(error: unknown, scoped: ScopedEmptyListPermission): ListReadDenial {
  const permissionError = isPermissionDenied(error) ? error : null;
  const roleRequired = permissionError?.detail?.reason === 'role_required';
  if (permissionError === null) {
    const blocked = scoped.state === 'blocked';
    return { denied: blocked, roleRequired: false, request: blocked ? scoped.request : undefined };
  }
  const requestable = roleRequired ? undefined : permissionError.envelope.requestable_permission;
  const request = requestable && {
    capability: requestable.permission,
    ...(typeof requestable.managed_system_id === 'string' ? { managedSystemId: requestable.managed_system_id } : {}),
  };
  return { denied: true, roleRequired, request };
}
