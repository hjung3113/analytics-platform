import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { permissionRequestAdminDetailSchema } from '../selected-detail.js';

// Shape returned by selected-read-service.adminDetail; synthetic identities only.
const body = {
  id: '01919b8c-0000-7000-8000-000000000001',
  requester_actor_id: '01919b8c-0000-7000-8000-000000000003',
  requested_capability: 'voc.read',
  requested_managed_system_id: null,
  requested_object_type: null,
  requested_object_id: null,
  reason: 'Review access',
  requested_expiration: null,
  source_object_type: null,
  source_object_id: null,
  source_action_id: null,
  return_route_intent: null,
  source_summary: null,
  status: 'pending',
  revision: 1,
  created_at: '2026-11-13T00:00:00.000Z',
  updated_at: '2026-11-13T00:00:00.000Z',
  requester: {
    id: '01919b8c-0000-7000-8000-000000000003',
    display_name: 'Synthetic requester',
    role_level: 'user',
  },
  effective_access: {
    decision: {
      allow: false,
      reason: 'no_grant',
      requestable: [{ workspace_id: '00000000-0000-0000-0000-000000000001' }],
    },
    scope: { kind: 'all' },
    expires_at: null,
    granted_managed_system_id: null,
  },
  administrative_authority: {
    capability: 'workspace.admin',
    allowed: true,
    is_requester: false,
    permission_self_approval: 'forbidden',
    self_approval_required: false,
  },
  approval_scope_candidates: [],
  matching_denies: [],
  risk_indicators: [],
  allowed_actions: ['reject', 'need_more_info', 'deny'],
};

describe('permission admin detail server body (#1856)', () => {
  it.each(['00000000-0000-0000-0000-000000000001', randomUUID()])(
    'accepts requestable workspace_id %s without changing UUID validation',
    workspace_id => {
      const response = {
        ...body,
        effective_access: {
          ...body.effective_access,
          decision: { ...body.effective_access.decision, requestable: [{ workspace_id }] },
        },
      };
      expect(permissionRequestAdminDetailSchema.parse(response)).toEqual(response);
    },
  );
});
