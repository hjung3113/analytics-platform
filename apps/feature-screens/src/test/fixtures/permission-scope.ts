// Server-shaped Site·공정 (scope.read) bodies from the #1844c API (docs/architecture/platform-api/api/permissions.md).
// Synthetic site and room names only (ADR-0151). Each builder parses through the shared transport schema, so a
// fixture that drifts from the server DTO fails where it is built.

import {
  createPermissionRequestResultSchema,
  minePermissionRequestRowSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
  permissionRequestAdminDetailSchema,
  permissionScopeCandidatesResponseSchema,
} from '@ap/feature-shared';

export const SCOPE_AT = '2026-11-12T00:00:00.000Z';
export const SCOPE_ACTOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const SCOPE_ADMIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** SITE-A has RA1 granted and RA2/RA3 open; SITE-B is fully ungranted; SITE-C is held whole. */
export const scopeCandidatesBody = () =>
  permissionScopeCandidatesResponseSchema.parse({
    sites: [
      {
        site: 'SITE-A',
        label: 'Synthetic A',
        rooms: [
          { room: 'RA1', granted: true },
          { room: 'RA2', granted: false },
          { room: 'RA3', granted: false },
        ],
        siteGranted: false,
      },
      {
        site: 'SITE-B',
        label: 'Synthetic B',
        rooms: [
          { room: 'RB1', granted: false },
          { room: 'RB4', granted: false },
        ],
        siteGranted: false,
      },
      {
        site: 'SITE-C',
        label: 'Synthetic C',
        rooms: [{ room: 'RC1', granted: true }],
        siteGranted: true,
      },
    ],
  });

export const scopeCreateResultBody = (
  id: string,
  kind: 'site' | 'site_room',
  site: string,
  room: string | null = null,
) =>
  createPermissionRequestResultSchema.parse({
    id,
    status: 'pending',
    created_at: SCOPE_AT,
    requested_scope_kind: kind,
    requested_scope_site: site,
    requested_scope_room: room,
  });

export const scopeMineRowBody = (
  id: string,
  status: string,
  kind: 'site' | 'site_room',
  site: string,
  room: string | null = null,
) =>
  minePermissionRequestRowSchema.parse({
    id,
    requested_capability: 'scope.read',
    requested_scope_kind: kind,
    requested_scope_site: site,
    requested_scope_room: room,
    requested_managed_system_id: null,
    reason: `${site} 조회 사유`,
    requested_object_type: null,
    requested_object_id: null,
    source_object_type: null,
    source_object_id: null,
    source_action_id: null,
    revision: 2,
    requested_expiration: null,
    updated_at: SCOPE_AT,
    return_route_intent: null,
    status,
    created_at: SCOPE_AT,
  });

/** The admin collection row (`GET /permissions/requests`), which the console reads unparsed. */
export const scopeAdminRowBody = (
  id: string,
  kind: 'site' | 'site_room',
  site: string,
  room: string | null = null,
) => ({
  id,
  revision: 2,
  requester_actor_id: SCOPE_ACTOR,
  requested_capability: 'scope.read',
  requested_managed_system_id: null,
  requested_scope_kind: kind,
  requested_scope_site: site,
  requested_scope_room: room,
  requested_expiration: null,
  reason: `${site} 조회 사유`,
  status: 'pending' as const,
  created_at: SCOPE_AT,
});

/** Mirrors `selected-read-service.ts` for a site/room request: candidates hold only the request target. */
export const scopeAdminDetailBody = (row: ReturnType<typeof scopeAdminRowBody>) =>
  permissionRequestAdminDetailSchema.parse({
    ...row,
    requested_object_type: null,
    requested_object_id: null,
    source_object_type: null,
    source_object_id: null,
    source_action_id: null,
    return_route_intent: null,
    source_summary: null,
    updated_at: SCOPE_AT,
    requester: { id: SCOPE_ACTOR, display_name: '', role_level: 'user' },
    effective_access: {
      decision: { allow: false, reason: 'no_grant', requestable: null },
      scope: { kind: 'scoped', managed_system_ids: [] },
      scope_kind: row.requested_scope_kind,
      scope_site: row.requested_scope_site,
      scope_room: row.requested_scope_room,
      expires_at: null,
      granted_managed_system_id: null,
    },
    administrative_authority: {
      capability: 'workspace.admin',
      allowed: true,
      is_requester: false,
      permission_self_approval: 'allowed',
      self_approval_required: false,
    },
    approval_scope_candidates: [
      {
        managed_system_id: null,
        scope_kind: row.requested_scope_kind,
        scope_site: row.requested_scope_site,
        scope_room: row.requested_scope_room,
      },
    ],
    matching_denies: [],
    risk_indicators: [{ code: 'no_expiration', evidence: { requested_expiration: null } }],
    allowed_actions: ['approve', 'reject', 'need_more_info'],
  });

export const scopeGrantItemBody = (
  id: string,
  kind: 'site' | 'site_room',
  site: string,
  room: string | null,
  inCatalog: boolean,
) =>
  permissionGrantAdminItemSchema.parse({
    id,
    actor_id: SCOPE_ACTOR,
    capability: 'scope.read',
    managed_system_id: null,
    scope_kind: kind,
    scope_site: site,
    scope_room: room,
    in_catalog: inCatalog,
    granted_by_actor_id: SCOPE_ADMIN,
    granted_at: SCOPE_AT,
    expires_at: null,
  });

/** Grant options with the advisory `scope.read` candidate (`scope_kinds: ['site', 'site_room']`). */
export const scopeGrantOptionsBody = (recipientId: string, displayName: string) =>
  permissionGrantOptionsSchema.parse({
    recipient: { id: recipientId, display_name: displayName, role_level: 'user' },
    self_policy: 'allowed',
    self_approval_required: false,
    candidates: [
      {
        capability: 'workspace.read',
        managed_system_id: null,
        governance_required: false,
        preflight: { state: 'available' },
      },
      {
        capability: 'scope.read',
        managed_system_id: null,
        scope_kinds: ['site', 'site_room'],
        governance_required: false,
        preflight: { state: 'available' },
      },
    ],
  });
