// Permission checks kept for standalone callers; admin APIs and the bridge-safe variants live in client modules.

import { UnauthenticatedError } from './auth';
import type { CapabilityScope, PermissionCheckResponse } from './permission-reads';

// The requester's permission-request calls keep their existing public import path.
export {
  type CreatePermissionRequestBody,
  type CreatePermissionRequestSuccess,
  type MinePermissionRequestRow,
  createPermissionRequest,
  fetchPermissionRequestOwnerDetail,
  fetchPermissionRequestsMine,
  permissionRequestOwnerDetailKey,
  permissionRequestsMineKey,
  updateOwnPermissionRequest,
  withdrawPermissionRequest,
} from './permission-requests';

// Admin APIs moved to bridge-safe modules; these exports preserve standalone and barrel imports.
export * from './permission-admin';
export {
  type AdminPermissionRequestRow,
  type CapabilityScope,
  type FrontendPermissionState,
  type PermissionCheckResponse,
  type PermissionDecision,
  type PermissionRequestReviewStatus,
  fetchPermissionRequestsAllViaClient as fetchPermissionRequestsAll,
} from './permission-reads';

export async function fetchCapabilityScope(
  capability: string,
  options?: { signal?: AbortSignal },
): Promise<{ scope: CapabilityScope }> {
  const init: RequestInit = { credentials: 'same-origin' };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(
    `/me/permissions/scope?${new URLSearchParams({ capability }).toString()}`,
    init,
  );
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/me/permissions/scope failed: ${res.status}`);
  return (await res.json()) as { scope: CapabilityScope };
}

export async function fetchPermissionCheck(
  capability: string,
  options?: { managedSystemId?: string; signal?: AbortSignal },
): Promise<PermissionCheckResponse> {
  const params = new URLSearchParams({ capability });
  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
  const init: RequestInit = { credentials: 'same-origin' };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/me/permissions/check?${params.toString()}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`/me/permissions/check failed: ${res.status}`);
  return (await res.json()) as PermissionCheckResponse;
}
