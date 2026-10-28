// Managed System and Analytics Area writes on the shared API client, so hosts can supply the API base path and 401 hook.
// Unlike the prior raw-fetch exports, 401 now follows the client's ApiError and unauthorized-hook behavior.

import { apiClient } from './client';
import type { AnalyticsAreaDto, ManagedSystemDto } from './registry-reads';

export interface RegisterManagedSystemBody {
  slug: string;
  name: string;
  external_key?: string | null;
  default_owner_actor_id?: string | null;
  default_owner_team_id?: string | null;
  default_reviewer_actor_id?: string | null;
  default_reviewer_team_id?: string | null;
}

export interface UpdateManagedSystemBody {
  name?: string;
  external_key?: string | null;
  default_owner_actor_id?: string | null;
  default_owner_team_id?: string | null;
  default_reviewer_actor_id?: string | null;
  default_reviewer_team_id?: string | null;
}

export interface RegisterAnalyticsAreaBody {
  managed_system_id: string;
  slug: string;
  name: string;
  owner_team_id?: string | null;
}

export interface UpdateAnalyticsAreaBody {
  name?: string;
  owner_team_id?: string | null;
}

function clientOptions(options?: { idempotencyKey?: string; signal?: AbortSignal }) {
  return {
    ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    ...(options?.signal ? { signal: options.signal } : {}),
  };
}

export async function registerManagedSystem(
  body: RegisterManagedSystemBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto> {
  return (
    await apiClient<ManagedSystemDto>('POST', '/managed-systems', {
      body,
      ...clientOptions(options),
    })
  ).data;
}

export async function updateManagedSystem(
  id: string,
  body: UpdateManagedSystemBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto> {
  return (
    await apiClient<ManagedSystemDto>('PATCH', `/managed-systems/${id}`, {
      body,
      ...clientOptions(options),
    })
  ).data;
}

export async function archiveManagedSystem(
  id: string,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto & { cascaded_analytics_area_ids: string[] }> {
  return (
    await apiClient<ManagedSystemDto & { cascaded_analytics_area_ids: string[] }>(
      'POST',
      `/managed-systems/${id}/archive`,
      clientOptions(options),
    )
  ).data;
}

export async function registerAnalyticsArea(
  body: RegisterAnalyticsAreaBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  return (
    await apiClient<AnalyticsAreaDto>('POST', '/analytics-areas', {
      body,
      ...clientOptions(options),
    })
  ).data;
}

export async function updateAnalyticsArea(
  id: string,
  body: UpdateAnalyticsAreaBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  return (
    await apiClient<AnalyticsAreaDto>('PATCH', `/analytics-areas/${id}`, {
      body,
      ...clientOptions(options),
    })
  ).data;
}

export async function archiveAnalyticsArea(
  id: string,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  return (
    await apiClient<AnalyticsAreaDto>(
      'POST',
      `/analytics-areas/${id}/archive`,
      clientOptions(options),
    )
  ).data;
}
