import { describe, expect, it } from 'vitest';
import { approvePermissionRequestSchema, createPermissionRequestSchema } from '../decisions.js';
import { directPermissionGrantSchema, permissionGrantAdminItemSchema } from '../admin.js';
import { submitMoreInfoPermissionRequestSchema } from '../submit-more-info.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('Scope kind wire compatibility', () => {
  it.each([
    [createPermissionRequestSchema, { requested_capability: 'workspace.read', reason: 'Read' }],
    [approvePermissionRequestSchema, { expected_revision: 1 }],
    [directPermissionGrantSchema, { actor_id: id, capability: 'workspace.read', reason: 'Read' }],
    [submitMoreInfoPermissionRequestSchema, { expected_revision: 1, reason: 'Read' }],
    [permissionGrantAdminItemSchema, { id, actor_id: id, capability: 'workspace.read', managed_system_id: null, granted_by_actor_id: id, granted_at: '2026-11-12T00:00:00.000Z', expires_at: null }],
  ] as const)('round trips a legacy managed-system payload unchanged', (schema, payload) => {
    expect(schema.parse(payload)).toEqual(payload);
  });
  it('accepts site-room requests and site-to-room approval fields', () => {
    const request = { requested_capability: 'scope.read', reason: 'Read', requested_scope_kind: 'site_room', requested_scope_site: 'SITE-A', requested_scope_room: 'RA1' };
    expect(createPermissionRequestSchema.parse(request)).toEqual(request);
    const approval = { expected_revision: 1, granted_scope_kind: 'site_room', granted_scope_site: 'SITE-A', granted_scope_room: 'RA1' };
    expect(approvePermissionRequestSchema.parse(approval)).toEqual(approval);
  });
});

// Legacy response/audit fixtures retain the existing wire keys, including nullable values.
import { minePermissionRequestRowSchema, createPermissionRequestResultSchema } from '../mine.js';
import { permissionDecisionResultSchema } from '../decisions.js';
import { permissionGrantOptionsSchema } from '../admin.js';
import { permissionRequestOwnerDetailSchema, permissionRequestAdminDetailSchema } from '../selected-detail.js';
import { cancelPermissionRequestResultSchema, submitMoreInfoPermissionRequestResultSchema, permissionScopeCandidateSchema } from '../submit-more-info.js';
import { PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS, permissionMoreInfoPreviousSchema } from '../../audit/permission.js';
const at = '2026-11-12T00:00:00.000Z';
const mine = { id, requested_capability: 'workspace.read', requested_managed_system_id: null,
  reason: 'Read', requested_object_type: null, requested_object_id: null,
  source_object_type: null, source_object_id: null, source_action_id: null,
  revision: 1, requested_expiration: null, updated_at: at, return_route_intent: null,
  status: 'pending', created_at: at };
const selected = { ...mine, requester_actor_id: id, source_summary: null };
const previous = { reason: 'Read', managed_system_id: null, requested_object_type: null, requested_object_id: null, requested_expiration: null };
const auditBase = { previous_revision: 1, revision: 2, capability: 'workspace.read', managed_system_id: null, requester_actor_id: id };
const candidate = { managed_system_id: null };
const decision = { allow: false, reason: 'no_grant', requestable: null };
describe('legacy response and audit round trips', () => {
  it.each([
    [minePermissionRequestRowSchema, mine],
    [createPermissionRequestResultSchema, { id, status: 'pending', created_at: at }],
    [permissionDecisionResultSchema, { id, status: 'approved', revision: 2, updated_at: at, requested_managed_system_id: null, granted_managed_system_id: null, requested_expiration: null, granted_expiration: null, grant_id: id }],
    [submitMoreInfoPermissionRequestResultSchema, { id, status: 'pending', revision: 2, updated_at: at }],
    [cancelPermissionRequestResultSchema, { id, status: 'cancelled', revision: 2, updated_at: at }],
    [permissionScopeCandidateSchema, candidate],
    [permissionGrantOptionsSchema, { recipient: { id, display_name: 'Synthetic actor', role_level: 'user' }, self_policy: 'allowed', self_approval_required: false, candidates: [{ capability: 'workspace.read', managed_system_id: null, governance_required: false, preflight: { state: 'available' } }] }],
    [permissionRequestOwnerDetailSchema, { ...selected, latest_admin_question: null, editable_scope_candidates: [candidate], allowed_actions: ['edit', 'withdraw'] }],
    [permissionRequestAdminDetailSchema, { ...selected, requester: { id, display_name: 'Synthetic actor', role_level: 'user' }, effective_access: { decision, scope: { kind: 'scoped', managed_system_ids: [] }, expires_at: null, granted_managed_system_id: null }, administrative_authority: { capability: 'workspace.admin', allowed: true, is_requester: false, permission_self_approval: 'allowed', self_approval_required: false }, approval_scope_candidates: [candidate], matching_denies: [], risk_indicators: [], allowed_actions: ['approve', 'reject', 'need_more_info', 'deny'] }],
    [permissionMoreInfoPreviousSchema, previous],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_requested, { revision: 1, capability: 'workspace.read', managed_system_id: null, reason: 'Read', sensitive: false, source_object_type: null, source_object_id: null, source_action_id: null }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_approved, { ...auditBase, reason: null, requested_managed_system_id: null, granted_managed_system_id: null, grant_id: id, requested_expiration: null, granted_expiration: null }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_rejected, { ...auditBase, reason: 'Read' }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_needs_more_info, { ...auditBase, note: 'Read' }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_denied, { ...auditBase, reason: 'Read', deny_id: id }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_more_info_submitted, { ...auditBase, reason: 'Read', sensitive: false, requested_object_type: null, requested_object_id: null, requested_expiration: null, previous }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_request_updated, { capability: 'workspace.read', requester_actor_id: id, previous_revision: 1, revision: 2, previous, resulting: previous }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_request_cancelled, { ...auditBase, requested_object_type: null, requested_object_id: null, previous_status: 'pending' }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_revoked, { grant_id: id, capability: 'workspace.read', managed_system_id: null, grantee_actor_id: id, reason: 'Read' }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_deny_revoked, { deny_id: id, capability: 'workspace.read', managed_system_id: null, denied_actor_id: id, reason: 'Read' }],
    [PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS.permission_granted, { grant_id: id, grantee_actor_id: id, capability: 'workspace.read', managed_system_id: null, reason: 'Read', expires_at: null, mode: 'create' }],
  ] as const)('preserves legacy fixture %#', (schema, payload) => {
    expect(schema.parse(payload)).toEqual(payload);
  });
});
