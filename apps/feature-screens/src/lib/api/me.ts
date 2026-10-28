// The caller's session read (`GET /me`) on `apiRequest`, so the platform bridge reaches it through `client.ts`
// (`/api/features` base path, 401 hook — platform ADR-0071). This module imports neither `auth.ts`, the `@/lib/api` barrel nor
// `lib/auth/`: `auth.ts` re-exports `MeResponse` and `MeRequestError` from here, and `lib/auth/useMe.ts` shares the
// `['me']` key and the 429 retry rule below. The standalone `fetchMe` in `auth.ts` stays raw `fetch`.

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { apiRequest } from './client';
import { ApiError, ApiParseError } from './types';
import { UnauthenticatedError } from './unauthenticated';

export interface MeResponse {
  actor: {
    id: string;
    external_id: string;
    email: string;
    display_name: string;
    role_level: string;
  };
  workspace_id: string;
}

export class MeRequestError extends Error {
  readonly status: number;
  readonly retryAfter?: string;

  constructor(status: number, retryAfter?: string) {
    super('Unable to load the current session.');
    this.name = 'MeRequestError';
    this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

export const ME_QUERY_KEY = ['me'] as const;

export const ME_STALE_TIME = 5 * 60 * 1000;
const MAX_429_RETRIES = 2;
const MAX_RETRY_DELAY = 5 * 1000;
const DEFAULT_RETRY_DELAY = 250;

function retryAfterMilliseconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const retryAt = Date.parse(trimmed);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, retryAt - Date.now());
}

export function meRetryDelay(attemptIndex: number, error: unknown): number {
  if (error instanceof MeRequestError && error.retryAfter !== undefined) {
    const retryAfter = retryAfterMilliseconds(error.retryAfter);
    if (retryAfter !== undefined) return Math.min(MAX_RETRY_DELAY, retryAfter);
  }
  return Math.min(MAX_RETRY_DELAY, DEFAULT_RETRY_DELAY * 2 ** attemptIndex);
}

export function meRetry(failureCount: number, error: unknown): boolean {
  return error instanceof MeRequestError && error.status === 429 && failureCount < MAX_429_RETRIES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Narrow runtime parser (no `@ap/feature-shared` schema exists for /me): the fields the shell reads must have the declared type.
export function parseMeResponse(data: unknown): MeResponse {
  if (!isRecord(data) || !isRecord(data.actor) || typeof data.workspace_id !== 'string') {
    throw new TypeError('Malformed /me response');
  }
  const { actor } = data;
  for (const key of ['id', 'external_id', 'email', 'display_name', 'role_level']) {
    if (typeof actor[key] !== 'string') throw new TypeError('Malformed /me response');
  }
  return data as unknown as MeResponse;
}

// 401 → UnauthenticatedError (after `client.ts` ran `onUnauthorized`); any other failure → MeRequestError so the 429
// retry rule above keeps working. A malformed 2xx body surfaces as the client's ApiParseError.
export async function fetchMeViaClient(signal?: AbortSignal): Promise<MeResponse> {
  try {
    const response = await apiRequest('GET', '/me', parseMeResponse, signal ? { signal } : {});
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && !(error instanceof ApiParseError)) {
      if (error.status === 401) throw new UnauthenticatedError();
      throw new MeRequestError(
        error.status,
        error.retryAfterSeconds !== undefined ? String(error.retryAfterSeconds) : undefined,
      );
    }
    throw error;
  }
}

export function meBridgeQueryOptions() {
  return {
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchMeViaClient(signal),
    staleTime: ME_STALE_TIME,
    retry: meRetry,
    retryDelay: meRetryDelay,
  } as const;
}

export function useMeBridge(): UseQueryResult<MeResponse> {
  return useQuery<MeResponse>(meBridgeQueryOptions());
}
