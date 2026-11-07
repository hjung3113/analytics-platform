import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';

describe('log lifecycle audit detail schemas (#1444 c)', () => {
  it.each([
    ['lifecycle.project.created', { modelId: ID, softwareId: null, kind: 'new', ownerActorId: ID }],
    ['lifecycle.project.updated', { changed: ['ownerActorId', 'targetDate'] }],
    ['lifecycle.project.stage_changed', { from: 'registered', to: 'kickoff' }],
    ['lifecycle.project.cancelled', { from: 'alpha' }],
    ['lifecycle.project.reopened', { from: 'cancelled', to: 'alpha' }],
    ['lifecycle.round.opened', { projectId: ID, seq: 1, stage: 'alpha', fileCount: 3, pinned: true }],
    ['lifecycle.round.closed', { projectId: ID, seq: 1 }],
    ['lifecycle.round.evidence_attached', { projectId: ID, seq: 1, count: 2 }],
    ['lifecycle.request.created', { roundId: ID, priority: 2, immediate: true, maxAttempts: 3 }],
    ['lifecycle.request.cancelled', { roundId: ID, from: 'claimed' }],
    ['lifecycle.request.claimed', { attemptNo: 1, immediate: false }],
    ['lifecycle.request.result_submitted', { attemptNo: 1, verdict: 'incomplete', ruleCount: 4, excerptCount: 1, late: false }],
    ['lifecycle.request.failed', { attemptNo: 2, late: true }],
    ['lifecycle.request.lease_expired', { attemptNo: 1, to: 'expired' }],
    ['lifecycle.excerpt.read', { attemptId: ID, ruleResultId: ID, evidenceIndex: 0 }],
    ['lifecycle.queue_settings.updated', { changed: ['runWindow'] }],
    ['lifecycle.excerpt_access.set', { actorId: ID, allowed: false }],
    ['lifecycle.excerpt.deleted', { scope: 'attempt', count: 2, attemptId: ID }],
    ['lifecycle.excerpt.purged', { count: 3, retentionDays: 90 }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['lifecycle.project.cancelled', 'the reason text', { from: 'alpha', reason: 'x' }],
    ['lifecycle.project.cancelled', 'a closed stage', { from: 'completed' }],
    ['lifecycle.project.stage_changed', 'an unknown stage', { from: 'registered', to: 'sealed' }],
    ['lifecycle.project.updated', 'no changed field', { changed: [] }],
    ['lifecycle.round.opened', 'a file location', { projectId: ID, seq: 1, stage: 'alpha', fileCount: 1, pinned: false, fileRef: 's3://x' }],
    ['lifecycle.round.opened', 'a closed stage', { projectId: ID, seq: 1, stage: 'completed', fileCount: 1, pinned: false }],
    ['lifecycle.round.closed', 'a digest', { projectId: ID, seq: 1, digest: 'x' }],
    ['lifecycle.round.evidence_attached', 'a filename', { projectId: ID, seq: 1, count: 1, name: 'a.png' }],
    ['lifecycle.round.evidence_attached', 'a zero count', { projectId: ID, seq: 1, count: 0 }],
    ['lifecycle.request.result_submitted', 'an excerpt body', { attemptNo: 1, verdict: 'pass', ruleCount: 1, excerptCount: 1, late: false, excerpt: 'x' }],
    ['lifecycle.request.result_submitted', 'a worker verdict outside the set', { attemptNo: 1, verdict: 'ok', ruleCount: 1, excerptCount: 0, late: false }],
    ['lifecycle.excerpt.read', 'the text read', { attemptId: ID, ruleResultId: ID, evidenceIndex: 0, excerpt: 'x' }],
    ['lifecycle.excerpt.deleted', 'a reason text', { scope: 'round', count: 1, reason: 'x' }],
    ['lifecycle.request.created', 'a priority above 2', { roundId: ID, priority: 3, immediate: false, maxAttempts: 3 }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
