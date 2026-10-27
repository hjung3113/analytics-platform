// Analytics Areas registry (Slice 2 #11).
// The list read lives in ./registry-reads (bridge-safe, platform ADR-0071) and is re-exported here.

import { UnauthenticatedError } from './auth';
import type { AnalyticsAreaDto } from './registry-reads';
import { ApiError, type ApiErrorEnvelope } from './types';

export { type AnalyticsAreaDto, fetchAnalyticsAreas } from './registry-reads';

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

async function readEnvelope(res: Response): Promise<never> {
  let envelope: ApiErrorEnvelope = { code: 'internal.unexpected', message: 'request failed' };
  try {
    envelope = (await res.json()) as ApiErrorEnvelope;
  } catch {
    // body wasn't JSON
  }
  throw new ApiError(res.status, envelope);
}

export async function registerAnalyticsArea(
  body: RegisterAnalyticsAreaBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch('/analytics-areas', init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as AnalyticsAreaDto;
}

export async function updateAnalyticsArea(
  id: string,
  body: UpdateAnalyticsAreaBody,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = {
    method: 'PATCH',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/analytics-areas/${id}`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as AnalyticsAreaDto;
}

export async function archiveAnalyticsArea(
  id: string,
  options?: { idempotencyKey?: string; signal?: AbortSignal },
): Promise<AnalyticsAreaDto> {
  const headers: Record<string, string> = {};
  if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const init: RequestInit = { method: 'POST', credentials: 'same-origin', headers };
  if (options?.signal) init.signal = options.signal;
  const res = await fetch(`/analytics-areas/${id}/archive`, init);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status < 200 || res.status >= 300) return readEnvelope(res);
  return (await res.json()) as AnalyticsAreaDto;
}
