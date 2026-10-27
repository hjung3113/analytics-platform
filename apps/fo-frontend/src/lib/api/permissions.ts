// Permission check + permission request endpoints (issues #4, #5).
// Mirrors GET /me/permissions/check and POST /permission-requests.
// The frontend never enforces backend permissions as truth (AGENTS.md:69) —
// these types only describe what the server returned so the UI can pick a state.

import {
  type ApprovePermissionRequest,
  type DirectPermissionGrant,
  type PermissionDecisionResult,
  type PermissionGrantOptions,
  type PermissionRequestStatus,
  directPermissionGrantSchema,
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionDecisionResultSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
  permissionRequestAdminDetailSchema,
  revokePermissionBodySchema,
  revokePermissionResultSchema,
} from '@fops/shared';

import { UnauthenticatedError } from './auth';
import { apiRequest } from './client';
import { ApiError, type ApiErrorEnvelope } from './types';

// The requester calls live in their own bridge-safe module (#657); every caller still imports them from here.
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

// Types live with the bridge-safe reads (`permission-reads.ts`); re-exported so every caller keeps this import path.
export type {
  CapabilityScope,
  FrontendPermissionState,
  PermissionCheckResponse,
  PermissionDecision,
} from './permission-reads';
import type { CapabilityScope, PermissionCheckResponse } from './permission-reads';

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

// Admin workspace-wide list. 403 for non-admins → ApiError.
export interface AdminPermissionRequestRow {
  id: string;
  revision: number;
  requester_actor_id: string;
  requested_capability: string;
  requested_managed_system_id: string | null;
  requested_expiration: string | null;
  reason: string;
  status: PermissionRequestStatus;
  created_at: string;
}

export type PermissionRequestReviewStatus = AdminPermissionRequestRow['status'] | 'all';

export async function fetchPermissionGrants(signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    '/permissions/grants',
    listPermissionGrantsResponseSchema,
    signal ? { signal } : {},
  );
  return response.data.items;
}

export async function fetchPermissionDenies(signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    '/permissions/denies',
    listPermissionDeniesResponseSchema,
    signal ? { signal } : {},
  );
  return response.data.items;
}

export async function revokePermission(
  kind: 'grants' | 'denies',
  id: string,
  reason: string,
  idempotencyKey: string,
) {
  const body = revokePermissionBodySchema.parse({ reason });
  const response = await apiRequest(
    'POST',
    `/permissions/${kind}/${id}/revoke`,
    revokePermissionResultSchema,
    { body, idempotencyKey },
  );
  return response.data;
}

export const permissionGrantOptionsKey = (actorId: string) =>
  ['permission-grant-options', actorId] as const;

export async function fetchPermissionGrantOptions(
  actorId: string,
  signal?: AbortSignal,
): Promise<PermissionGrantOptions> {
  const params = new URLSearchParams({ actor_id: actorId });
  const response = await apiRequest(
    'GET',
    `/permissions/grant-options?${params.toString()}`,
    permissionGrantOptionsSchema,
    signal ? { signal } : {},
  );
  return response.data;
}

export async function createDirectPermissionGrant(
  body: DirectPermissionGrant,
  idempotencyKey: string,
) {
  const parsedBody = directPermissionGrantSchema.parse(body);
  const response = await apiRequest('POST', '/permissions/grants', permissionGrantAdminItemSchema, {
    body: parsedBody,
    idempotencyKey,
  });
  return response.data;
}

export async function fetchPermissionRequestsAll(
  options?: { status?: PermissionRequestReviewStatus; signal?: AbortSignal } | AbortSignal,
): Promise<{ requests: AdminPermissionRequestRow[]; count: number }> {
  const normalized = options instanceof AbortSignal ? { signal: options } : options;
  const params = new URLSearchParams();
  if (normalized?.status) params.set('status', normalized.status);
  const init: RequestInit = { credentials: 'same-origin' };
  if (normalized?.signal) init.signal = normalized.signal;
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const res = await fetch(`/permissions/requests${suffix}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) {
    let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
    try {
      envelope = (await res.json()) as ApiErrorEnvelope;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(res.status, envelope);
  }
  return (await res.json()) as { requests: AdminPermissionRequestRow[]; count: number };
}

export type PermissionRequestDecisionAction = 'approve' | 'reject' | 'need-more-info' | 'deny';

export async function decidePermissionRequest(
  id: string,
  action: PermissionRequestDecisionAction,
  reason: string,
  idempotencyKey: string,
  expectedRevision: number,
  selfApproval?: ApprovePermissionRequest['self_approval'],
  expiration?: ApprovePermissionRequest['expiration'],
  grantedManagedSystemId?: ApprovePermissionRequest['granted_managed_system_id'],
): Promise<PermissionDecisionResult> {
  const body =
    action === 'need-more-info'
      ? { expected_revision: expectedRevision, ...(reason ? { note: reason } : {}) }
      : {
          expected_revision: expectedRevision,
          ...(reason ? { reason } : {}),
          ...(action === 'approve' && grantedManagedSystemId !== undefined
            ? { granted_managed_system_id: grantedManagedSystemId }
            : {}),
          ...(action === 'approve' && expiration !== undefined ? { expiration } : {}),
          ...(action === 'approve' && selfApproval !== undefined
            ? { self_approval: selfApproval }
            : {}),
        };
  const response = await apiRequest(
    'POST',
    `/permissions/requests/${id}/${action}`,
    permissionDecisionResultSchema,
    { body, idempotencyKey },
  );
  return response.data;
}

export { permissionRequestAdminDetailKey } from './permission-requests';

export async function fetchPermissionRequestAdminDetail(id: string, signal?: AbortSignal) {
  return (
    await apiRequest(
      'GET',
      `/permissions/requests/${id}`,
      permissionRequestAdminDetailSchema,
      signal ? { signal } : {},
    )
  ).data;
}
