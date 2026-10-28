// The requester's permission-request calls. Their own module so the platform bridge's 권한 요청 page reaches
// them through `client.ts` (`/api/fo`, platform ADR-0071); `permissions.ts` re-exports them, and its check,
// scope and admin calls still use raw `fetch`.

import {
  type CancelPermissionRequest,
  type CreatePermissionRequestResult,
  type EditPermissionRequest,
  type MinePermissionRequestRow,
  type MinePermissionRequestsResponse,
  cancelPermissionRequestResultSchema,
  cancelPermissionRequestSchema,
  createPermissionRequestResultSchema,
  editPermissionRequestSchema,
  minePermissionRequestsResponseSchema,
  permissionRequestOwnerDetailSchema,
  submitMoreInfoPermissionRequestResultSchema,
} from '@fops/shared';

import { apiRequest } from './client';

export type { MinePermissionRequestRow };

export interface CreatePermissionRequestBody {
  requested_capability: string;
  requested_managed_system_id?: string;
  requested_object_type?: string;
  requested_object_id?: string;
  reason: string;
  requested_expiration?: string;
  source_object_type?: string;
  source_object_id?: string;
  source_action_id?: string;
  return_route_intent?: string;
}

export type CreatePermissionRequestSuccess = CreatePermissionRequestResult;

// Issue #5: shared query key for the caller's requests. The bridge page keys its `status=all` list under it, so
// the standalone `invalidateQueries({ queryKey: permissionRequestsMineKey })` calls match both by prefix.
export const permissionRequestsMineKey = ['permission-requests-mine'] as const;
// The `status=all` list the caller's requests page and the platform home `내 할 일` share, so a withdraw or an admin decision
// that invalidates `permissionRequestsMineKey` refreshes both.
export const permissionRequestsMineAllKey = [
  ...permissionRequestsMineKey,
  { status: 'all' },
] as const;
export const permissionRequestOwnerDetailKey = (id: string) =>
  ['permission-requests', 'owner-detail', id] as const;
// The admin review detail key lives here so the owner dialog can invalidate it without importing `permissions.ts`.
export const permissionRequestAdminDetailKey = (id: string) =>
  ['permission-requests', 'admin-detail', id] as const;

export async function createPermissionRequest(
  body: CreatePermissionRequestBody,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<CreatePermissionRequestSuccess> {
  const response = await apiRequest(
    'POST',
    '/permission-requests',
    createPermissionRequestResultSchema,
    {
      body,
      idempotencyKey: options.idempotencyKey,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  return response.data;
}

// No `status`: the caller's open requests. `all`: every status of the caller's own requests (newest 50).
export async function fetchPermissionRequestsMine(options?: {
  status?: 'all';
  signal?: AbortSignal;
}): Promise<MinePermissionRequestsResponse> {
  const suffix = options?.status ? `?${new URLSearchParams({ status: options.status })}` : '';
  const response = await apiRequest(
    'GET',
    `/permission-requests/mine${suffix}`,
    minePermissionRequestsResponseSchema,
    options?.signal ? { signal: options.signal } : {},
  );
  return response.data;
}

export async function fetchPermissionRequestOwnerDetail(id: string, signal?: AbortSignal) {
  return (
    await apiRequest(
      'GET',
      `/permission-requests/${id}`,
      permissionRequestOwnerDetailSchema,
      signal ? { signal } : {},
    )
  ).data;
}

export async function updateOwnPermissionRequest(
  id: string,
  action: 'edit' | 'supplement',
  body: EditPermissionRequest,
  idempotencyKey: string,
) {
  return (
    await apiRequest(
      action === 'edit' ? 'PATCH' : 'POST',
      `/permission-requests/${id}${action === 'supplement' ? '/submit-more-info' : ''}`,
      submitMoreInfoPermissionRequestResultSchema,
      { body: editPermissionRequestSchema.parse(body), idempotencyKey },
    )
  ).data;
}

export async function withdrawPermissionRequest(
  id: string,
  body: CancelPermissionRequest,
  idempotencyKey: string,
) {
  return (
    await apiRequest(
      'POST',
      `/permission-requests/${id}/cancel`,
      cancelPermissionRequestResultSchema,
      { body: cancelPermissionRequestSchema.parse(body), idempotencyKey },
    )
  ).data;
}
