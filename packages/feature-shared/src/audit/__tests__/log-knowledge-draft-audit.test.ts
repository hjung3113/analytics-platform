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

describe('log knowledge draft audit detail schemas (#1198 a)', () => {
  it.each([
    ['knowledge.draft.created', base],
    ['knowledge.draft.updated', { ...base, proposalType: 'revise', targetItemId: ID, draftRevNo: 2, statusBefore: 'submitted', statusAfter: 'submitted' }],
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
  ] as const)('knowledge.draft.created rejects %s', (_label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS['knowledge.draft.created'].safeParse(detail).success).toBe(false);
  });
});
