import { readFileSync } from 'node:fs';
import { AUDIT_EVENT_TYPES } from '@fops/shared';
import { describe, expect, it } from 'vitest';

import { AUDIT_ACTION_BY_EVENT_TYPE, PLATFORM_AUDIT_ACTIONS } from '../audit-actions.js';
import { toAuditEvent } from '../audit-service.js';

// The platform's `AuditAction` (repo root, outside this workspace — read as text, not imported).
const AUDIT_TS = new URL(
  '../../../../../../../../packages/contracts/src/audit.ts',
  import.meta.url,
);

function platformActions(): string[] {
  const text = readFileSync(AUDIT_TS, 'utf8');
  const union = /export type AuditAction\s*=\s*([^;]+);/.exec(text)?.[1];
  if (union === undefined) throw new Error('AuditAction not found in audit.ts');
  return [...union.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('audit action map vs packages/contracts AuditAction', () => {
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
