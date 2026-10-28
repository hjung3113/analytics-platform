// Client-based permission APIs used by the admin features. Kept separate from permissions.ts, whose standalone
// scope/check fetchers retain their legacy transport behavior.

import {
  type ApprovePermissionRequest,
  type DirectPermissionGrant,
  type PermissionDecisionResult,
  type PermissionGrantOptions,
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

import { apiRequest } from './client';
import { permissionRequestAdminDetailKey } from './permission-requests';

export { permissionRequestAdminDetailKey };

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
