import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const HASH = 'a'.repeat(64);
const counts = { modules: 1, events: 2, relations: 0 };

describe('log knowledge spec audit detail schemas (ADR-0111)', () => {
  it.each([
    ['knowledge.spec.draft_saved', { modelId: ID, revisionNo: 1, mode: 'append', added: counts }],
    ['knowledge.spec.draft_saved', { modelId: ID, revisionNo: 2, mode: 'replace', added: counts, replacedRevisionId: ID }],
    ['knowledge.spec.published', { modelId: ID, revisionNo: 1, outcome: 'published', contentSha256: HASH, counts }],
    ['knowledge.spec.published', { modelId: ID, revisionNo: 2, outcome: 'unchanged', contentSha256: HASH, counts, existingRevisionId: ID }],
    ['knowledge.spec.rejected', { modelId: ID, revisionNo: 1, reasonLength: 12 }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['knowledge.spec.rejected', 'the reason text', { modelId: ID, revisionNo: 1, reasonLength: 1, reason: 'x' }],
    ['knowledge.spec.draft_saved', 'a module body', { modelId: ID, revisionNo: 1, mode: 'append', added: counts, modules: [] }],
    ['knowledge.spec.published', 'a malformed hash', { modelId: ID, revisionNo: 1, outcome: 'published', contentSha256: 'x', counts }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
