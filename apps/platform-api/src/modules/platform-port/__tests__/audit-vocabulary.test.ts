import { readFileSync } from 'node:fs';
import { AUDIT_EVENT_TYPES, CAPABILITIES, isSensitiveCapability } from '@fops/shared';
import { describe, expect, it } from 'vitest';

import { AUDIT_ACTION_BY_EVENT_TYPE, PLATFORM_AUDIT_ACTIONS } from '../audit-actions.js';
import { toAuditEvent } from '../audit-service.js';
import { platformVocab } from './platform-vocab.js';

// The platform's `AuditAction` vocabulary (@ap/contracts/vocab.json).
const platformActions = (): string[] => platformVocab().auditActions;

describe('audit action map vs @ap/contracts AuditAction', () => {
  it('uses only platform actions, and the action list is the whole platform vocabulary', () => {
    const vocabulary = platformActions();
    expect([...PLATFORM_AUDIT_ACTIONS].sort()).toEqual([...vocabulary].sort());
    for (const type of AUDIT_EVENT_TYPES) {
      expect(vocabulary, type).toContain(AUDIT_ACTION_BY_EVENT_TYPE[type]);
    }
    expect(Object.keys(AUDIT_ACTION_BY_EVENT_TYPE).sort()).toEqual([...AUDIT_EVENT_TYPES].sort());
  });

  it('has no sync event: a future system recompute needs its own decision', () => {
    expect(AUDIT_EVENT_TYPES.filter((t) => AUDIT_ACTION_BY_EVENT_TYPE[t] === 'sync')).toEqual([]);
  });

  it.each([
    ['finding_created_from_voc', 'create'],
    ['finding_created_from_survey_response', 'create'],
    ['task_request_created_from_finding', 'create'],
    ['task_created_from_request', 'create'],
    ['permission_requested', 'create'],
    ['entity_link.created', 'create'],
    ['entity_link.detached', 'delete'],
    ['voc_cluster_member_removed', 'delete'],
    ['survey_question_deleted', 'delete'],
    ['managed_system_archived', 'retire'],
    ['permission_deny_revoked', 'retire'],
    ['voc_recommendation_dismissed', 'retire'],
    ['task_request_approved', 'update'],
    ['voc_recommendation_confirmed', 'update'],
  ] as const)('%s → %s', (type, action) => {
    expect(AUDIT_ACTION_BY_EVENT_TYPE[type]).toBe(action);
  });
});

describe('toAuditEvent field mapping', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    at: '2026-10-01T00:00:00.000Z',
    actor: 'sub-1',
    actorType: 'internal_member',
    eventType: 'voc_created',
    subjectType: 'voc',
    subjectId: '22222222-2222-4222-8222-222222222222',
  };

  it('maps a user row to the contract AuditEvent without changes/reason', () => {
    expect(toAuditEvent(row)).toEqual({
      id: row.id,
      at: row.at,
      actor: 'sub-1',
      action: 'create',
      source: 'user',
      target: { type: 'voc', id: row.subjectId, scopeId: null },
    });
  });

  it('marks a system actor as source system', () => {
    expect(toAuditEvent({ ...row, actorType: 'system' }).source).toBe('system');
  });
});

describe('0074 permission allowlist vs the capability registry', () => {
  it('lists exactly the non-sensitive capabilities (DB-free twin of the integration it.each)', () => {
    const sql = readFileSync(
      new URL('../../../../migrations/0074_platform_audit_projection.sql', import.meta.url),
      'utf8',
    );
    const list = /\(l\.detail ->> 'capability'\) = ANY \(ARRAY\[([^\]]+)\]/.exec(sql)?.[1];
    if (list === undefined) throw new Error('capability allowlist not found in 0074');
    const listed = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] as string).sort();
    expect(listed).toEqual(CAPABILITIES.filter((c) => !isSensitiveCapability(c)).sort());
  });
});
