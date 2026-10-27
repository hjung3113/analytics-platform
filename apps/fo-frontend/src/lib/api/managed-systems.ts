import {
  managedSystemDefaultCandidatesSchema,
  managedSystemDefaultDiagnosticsSchema,
} from '@fops/shared';
import { apiRequest } from './client';
import type { ManagedSystemDto } from './registry-reads';
// Managed Systems registry (Slice 2 #10).
// The list read lives in ./registry-reads (bridge-safe, platform ADR-0071) and is re-exported here.

import { UnauthenticatedError } from './auth';
import { ApiError, type ApiErrorEnvelope } from './types';

export { fetchManagedSystems, type ManagedSystemDto } from './registry-reads';

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

async function readEnvelope(res: Response): Promise<never> {
  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
  try {
    envelope = (await res.json()) as ApiErrorEnvelope;
  } catch {
    // body wasn't JSON
  }
  throw new ApiError(res.status, envelope);
}

export async function registerManagedSystem(
  body: RegisterManagedSystemBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch('/managed-systems', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as ManagedSystemDto;
}

export async function updateManagedSystem(
  id: string,
  body: UpdateManagedSystemBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'PATCH',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/managed-systems/${id}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as ManagedSystemDto;
}

export async function archiveManagedSystem(
  id: string,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<ManagedSystemDto & { cascaded_analytics_area_ids: string[] }> {
  const headers: Record<string, string> = {};
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = { method: 'POST', credentials: 'same-origin', headers };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/managed-systems/${id}/archive`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as ManagedSystemDto & { cascaded_analytics_area_ids: string[] };
}

export async function fetchManagedSystemDefaultDiagnostics(signal?: AbortSignal) {
  const result = await apiRequest(
    'GET',
    '/managed-systems/default-diagnostics',
    managedSystemDefaultDiagnosticsSchema,
    signal ? { signal } : {},
  );
  return result.data;
}

export async function fetchManagedSystemDefaultCandidates(
  managedSystemId?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (managedSystemId) params.set('managed_system_id', managedSystemId);
  const result = await apiRequest(
    'GET',
    `/managed-systems/default-candidates${params.size ? `?${params}` : ''}`,
    managedSystemDefaultCandidatesSchema,
    signal ? { signal } : {},
  );
  return result.data;
}
