import {
  archivePermissionGroupSchema, archivePermissionGroupResultSchema,
  createPermissionGroupSchema, updatePermissionGroupSchema, sharePermissionGroupSchema,
  listPermissionGroupsQuerySchema, listPermissionGroupsResponseSchema, permissionGroupItemSchema,
  decidePermissionRequestBatchSchema, decidePermissionRequestBatchResultSchema,
  submitMoreInfoPermissionRequestBatchSchema, submitMoreInfoPermissionRequestBatchResultSchema,
  type ArchivePermissionGroup, type CreatePermissionGroup, type UpdatePermissionGroup,
  type SharePermissionGroup, type ListPermissionGroupsQuery, type DecidePermissionRequestBatch,
  type SubmitMoreInfoPermissionRequestBatch,
} from '@ap/feature-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './client';
import { apiPath, withRequestedId } from './path';

export const permissionGroupsKey = ['permission-groups'] as const;
export async function fetchPermissionGroups(query: ListPermissionGroupsQuery = {}, signal?: AbortSignal) {
  const parsed = listPermissionGroupsQuerySchema.parse(query);
  const params = new URLSearchParams();
  if (parsed.kind) params.set('kind', parsed.kind);
  if (parsed.scope) params.set('scope', parsed.scope);
  const suffix = params.size ? `?${params}` : '';
  return (await apiRequest('GET', `/permission-groups${suffix}`, listPermissionGroupsResponseSchema, signal ? { signal } : {})).data.items;
}
export async function fetchPermissionGroup(id: string, signal?: AbortSignal) {
  return (await apiRequest('GET', apiPath`/permission-groups/${id}`, withRequestedId(permissionGroupItemSchema, id), signal ? { signal } : {})).data;
}
export async function createPermissionGroup(body: CreatePermissionGroup, idempotencyKey: string) {
  return (await apiRequest('POST', '/permission-groups', permissionGroupItemSchema, { body: createPermissionGroupSchema.parse(body), idempotencyKey })).data;
}
export async function updatePermissionGroup(id: string, body: UpdatePermissionGroup, idempotencyKey: string) {
  return (await apiRequest('PATCH', apiPath`/permission-groups/${id}`, withRequestedId(permissionGroupItemSchema, id), { body: updatePermissionGroupSchema.parse(body), idempotencyKey })).data;
}
export async function archivePermissionGroup(id: string, body: ArchivePermissionGroup, idempotencyKey: string) {
  return (await apiRequest('POST', apiPath`/permission-groups/${id}/archive`, withRequestedId(archivePermissionGroupResultSchema, id), { body: archivePermissionGroupSchema.parse(body), idempotencyKey })).data;
}
export async function sharePermissionGroup(id: string, body: SharePermissionGroup, idempotencyKey: string) {
  return (await apiRequest('PUT', apiPath`/permission-groups/${id}/shares`, withRequestedId(permissionGroupItemSchema, id), { body: sharePermissionGroupSchema.parse(body), idempotencyKey })).data;
}
export async function decidePermissionRequestBatch(id: string, body: DecidePermissionRequestBatch, idempotencyKey: string) {
  return (await apiRequest('POST', apiPath`/permissions/requests/batch/${id}/decide`, decidePermissionRequestBatchResultSchema, { body: decidePermissionRequestBatchSchema.parse(body), idempotencyKey })).data;
}
export async function submitMoreInfoPermissionRequestBatch(id: string, body: SubmitMoreInfoPermissionRequestBatch, idempotencyKey: string) {
  return (await apiRequest('POST', apiPath`/permission-requests/batch/${id}/submit-more-info`, submitMoreInfoPermissionRequestBatchResultSchema, { body: submitMoreInfoPermissionRequestBatchSchema.parse(body), idempotencyKey })).data;
}
export function usePermissionGroups(query: ListPermissionGroupsQuery = {}, enabled = true) {
  return useQuery({ queryKey: [...permissionGroupsKey, query], queryFn: ({ signal }) => fetchPermissionGroups(query, signal), retry: false, enabled });
}
export function usePermissionGroupWrite<T, R>(write: (args: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: write, retry: false, onSuccess: () => client.invalidateQueries({ queryKey: permissionGroupsKey }) });
}
