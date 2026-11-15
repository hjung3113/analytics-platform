import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const DIGEST = 'a'.repeat(64);
const base = {
  draftId: ID,
  proposalType: 'create',
  origin: 'human',
  targetItemId: null,
  draftRevNo: 1,
  payloadDigest: DIGEST,
  statusBefore: null,
  statusAfter: 'draft',
};

const review = { draftId: ID, reviewId: ID, draftRevNo: 2, payloadDigest: DIGEST, origin: 'human' };
const approved = { draftId: ID, reviewId: ID, draftRevNo: 2, approvedDigest: DIGEST, itemId: ID, revisionNo: 1, selfApproval: false, origin: 'human' };

describe('log knowledge draft review audit detail schemas (#1198 b)', () => {
  it.each([
    ['knowledge.draft.approved', approved],
    ['knowledge.draft.rejected', review],
    ['knowledge.draft.changes_requested', review],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['knowledge.draft.approved', { ...approved, rationale: 'x' }],
    ['knowledge.draft.approved', { ...approved, selfApproval: 'yes' }],
    ['knowledge.draft.rejected', { ...review, rationale: 'x' }],
    ['knowledge.draft.changes_requested', { ...review, payloadDigest: 'abc' }],
  ] as const)('%s rejects %j', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});

describe('log knowledge draft audit detail schemas (#1198 a)', () => {
  it.each([
    ['knowledge.draft.created', base],
    ['knowledge.draft.updated', { ...base, proposalType: 'revise', targetItemId: ID, draftRevNo: 2, statusBefore: 'submitted', statusAfter: 'submitted' }],
    ['knowledge.draft.created', { ...base, handoff: { originKind: 'log_explorer', originId: ID, refCount: 2 } }],
    ['knowledge.draft.updated', { ...base, draftRevNo: 2, handoff: { originKind: 'log_explorer', originId: ID, refCount: 1 } }],
    ['knowledge.draft.submitted', { ...base, statusBefore: 'draft', statusAfter: 'submitted' }],
    ['knowledge.draft.withdrawn', { ...base, statusBefore: 'changes_requested', statusAfter: 'withdrawn' }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['the title', { ...base, title: 'x' }],
    ['the withdraw reason', { ...base, reason: 'x' }],
    ['a short digest', { ...base, payloadDigest: 'abc' }],
    ['an unknown origin', { ...base, origin: 'robot' }],
    ['an unknown status', { ...base, statusAfter: 'published' }],
    ['revision 0', { ...base, draftRevNo: 0 }],
    ['a handoff note', { ...base, handoff: { originKind: 'log_explorer', originId: ID, refCount: 1, note: 'x' } }],
    ['a handoff with no refs', { ...base, handoff: { originKind: 'log_explorer', originId: ID, refCount: 0 } }],
  ] as const)('knowledge.draft.created rejects %s', (_label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS['knowledge.draft.created'].safeParse(detail).success).toBe(false);
  });
});
