import { readFileSync } from 'node:fs';
import { AUDIT_EVENT_TYPES, CAPABILITIES, isSensitiveCapability } from '@ap/feature-shared';
import { describe, expect, it } from 'vitest';

import { AUDIT_ACTION_BY_EVENT_TYPE, PLATFORM_AUDIT_ACTIONS } from '../audit-actions.js';
import { parseAuditQuery } from '../audit-query.js';
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
    ['knowledge.catalog.created', 'create'],
    ['knowledge.catalog.updated', 'update'],
    ['knowledge.catalog.deactivated', 'retire'],
    ['knowledge.catalog.reactivated', 'update'],
    ['knowledge.catalog.identity_mapped', 'update'],
    ['knowledge.model_topview.linked', 'update'],
    ['knowledge.model_topview.unlinked', 'update'],
    ['knowledge.item.created', 'create'],
    ['knowledge.item.derived', 'create'],
    ['knowledge.item.revised', 'update'],
    ['knowledge.item.assessed', 'update'],
    ['knowledge.item.restored', 'update'],
    ['knowledge.item.archived', 'retire'],
    ['lifecycle.project.created', 'create'],
    ['lifecycle.project.updated', 'update'],
    ['lifecycle.project.stage_changed', 'update'],
    ['lifecycle.project.reopened', 'update'],
    ['lifecycle.project.cancelled', 'retire'],
    ['lifecycle.round.opened', 'create'],
    ['lifecycle.round.closed', 'retire'],
    ['lifecycle.round.evidence_attached', 'update'],
    ['lifecycle.round.evidence_ref_attached', 'update'],
    ['lifecycle.request.created', 'create'],
    ['lifecycle.request.cancelled', 'retire'],
    ['lifecycle.request.claimed', 'update'],
    ['lifecycle.request.result_submitted', 'update'],
    ['lifecycle.request.failed', 'update'],
    ['lifecycle.request.lease_expired', 'update'],
    ['lifecycle.excerpt.read', 'update'],
    ['lifecycle.queue_settings.updated', 'update'],
    ['lifecycle.excerpt_access.set', 'update'],
    ['lifecycle.excerpt.deleted', 'retire'],
    ['lifecycle.excerpt.purged', 'retire'],
    ['lifecycle.opinion.recorded', 'create'],
    ['dataset.created', 'create'],
    ['dataset.updated', 'update'],
    ['dataset.archived', 'retire'],
    ['dataset.revision_created', 'create'],
    ['dataset.candidate_created', 'create'],
    ['dataset.candidate_approved', 'retire'],
    ['dataset.candidate_rejected', 'retire'],
    ['dataset.baseline_created', 'create'],
    ['dataset.baseline_updated', 'update'],
    ['dataset.baseline_approved', 'update'],
    ['dataset.baseline_superseded', 'retire'],
    ['lifecycle.gate.decided', 'update'],
    ['dataset.suite_created', 'create'],
    ['dataset.suite_updated', 'update'],
    ['dataset.suite_run_requested', 'create'],
    ['dataset.review_label_added', 'create'],
    ['knowledge.access.mode_changed', 'update'],
    ['knowledge.access.rule_added', 'create'],
    ['knowledge.access.rule_revoked', 'retire'],
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
    // Latest migration (by drizzle journal order) that defines the allowlist; a renumber needs no edit here.
    const journal = JSON.parse(
      readFileSync(new URL('../../../../migrations/meta/_journal.json', import.meta.url), 'utf8'),
    ) as { entries: { tag: string }[] };
    const pattern = /\(l\.detail ->> 'capability'\) = ANY \(ARRAY\[([^\]]+)\]/;
    let list: string | undefined;
    for (const { tag } of [...journal.entries].reverse()) {
      const sql = readFileSync(new URL(`../../../../migrations/${tag}.sql`, import.meta.url), 'utf8');
      list = pattern.exec(sql)?.[1];
      if (list !== undefined) break;
    }
    if (list === undefined) throw new Error('capability allowlist not found in any journaled migration');
    const listed = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] as string).sort();
    expect(listed).toEqual(CAPABILITIES.filter((c) => !isSensitiveCapability(c)).sort());
  });
});

describe('parseAuditQuery type token (#1091, ADR-0101)', () => {
  it.each(['voc', 'equipment', 'managed_system', 'Future.Type:v2-x', 'a'.repeat(80)])(
    'accepts %s unchanged',
    (type) => {
      expect(parseAuditQuery({ type })).toMatchObject({ type });
    },
  );

  it('accepts targetId with a type and rejects targetId alone', () => {
    expect(parseAuditQuery({ type: 'voc', targetId: 'x' })).toMatchObject({
      type: 'voc',
      targetId: 'x',
    });
    expect(parseAuditQuery({ targetId: 'x' })).toBeNull();
  });

  it.each([
    '',
    '1voc',
    'voc x',
    'voc&x',
    'voc#x',
    'voc?x',
    ' voc',
    'vocé',
    'a'.repeat(81),
    5,
    null,
  ])('rejects %j', (type) => {
    expect(parseAuditQuery({ type })).toBeNull();
  });
});
