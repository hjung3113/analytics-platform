// The caller's permission reads — `GET /me/permissions/scope` and `/me/permissions/check` — on `apiRequest`, so the
// platform bridge reaches them through `client.ts` (`/api/fo` base path, 401 hook — platform ADR-0071). Imports neither
// `auth.ts` nor the `@/lib/api` barrel. `permissions.ts` re-exports the types and keeps its raw-`fetch` standalone
// fetchers of the same names; the frontend never enforces permissions as truth (AGENTS.md), these only surface the answer.

import { apiRequest } from './client';
import { ApiError, ApiParseError } from './types';
import { UnauthenticatedError } from './unauthenticated';

export type FrontendPermissionState =
  | 'approved'
  | 'blocked_non_requestable'
  | 'request_access'
  | 'pending_request'
  | 'hidden_existence'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'summary_visible';

export interface PermissionDecision {
  allow: boolean;
  via?: 'direct_grant' | 'role' | 'managed_system_scope';
  reason?: string;
  grant_id?: string;
  requestable?: Array<{ workspace_id: string; managed_system_id?: string }> | null;
}

export interface PermissionCheckResponse {
  state: FrontendPermissionState;
  decision: PermissionDecision;
}

export type CapabilityScope = { kind: 'all' } | { kind: 'scoped'; managed_system_ids: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCapabilityScope(data: unknown): { scope: CapabilityScope } {
  const scope = isRecord(data) ? data.scope : undefined;
  const valid =
    isRecord(scope) &&
    (scope.kind === 'all' ||
      (scope.kind === 'scoped' &&
        Array.isArray(scope.managed_system_ids) &&
        scope.managed_system_ids.every((id) => typeof id === 'string')));
  if (!valid) throw new TypeError('Malformed /me/permissions/scope response');
  return data as { scope: CapabilityScope };
}

function parsePermissionCheck(data: unknown): PermissionCheckResponse {
  if (
    !isRecord(data) ||
    typeof data.state !== 'string' ||
    !isRecord(data.decision) ||
    typeof data.decision.allow !== 'boolean'
  ) {
    throw new TypeError('Malformed /me/permissions/check response');
  }
  return data as unknown as PermissionCheckResponse;
}

// 401 → UnauthenticatedError (after `client.ts` ran `onUnauthorized`), like the standalone fetchers; other failures
// stay the client's ApiError.
async function read<T>(path: string, parser: (data: unknown) => T, signal?: AbortSignal) {
  try {
    return (await apiRequest('GET', path, parser, signal ? { signal } : {})).data;
  } catch (error) {
    if (error instanceof ApiError && !(error instanceof ApiParseError) && error.status === 401) {
      throw new UnauthenticatedError();
    }
    throw error;
  }
}

export function fetchCapabilityScopeViaClient(
  capability: string,
  options?: { signal?: AbortSignal },
): Promise<{ scope: CapabilityScope }> {
  const query = new URLSearchParams({ capability }).toString();
  return read(`/me/permissions/scope?${query}`, parseCapabilityScope, options?.signal);
}

export function fetchPermissionCheckViaClient(
  capability: string,
  options?: { managedSystemId?: string; signal?: AbortSignal },
): Promise<PermissionCheckResponse> {
  const params = new URLSearchParams({ capability });
  if (options?.managedSystemId) params.set('managed_system_id', options.managedSystemId);
  return read(`/me/permissions/check?${params.toString()}`, parsePermissionCheck, options?.signal);
}
