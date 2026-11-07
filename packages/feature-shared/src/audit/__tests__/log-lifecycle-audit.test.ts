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
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
