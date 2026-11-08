import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const DIGEST = 'a'.repeat(64);

describe('log test dataset audit detail schemas (#1477 D-a)', () => {
  it.each([
    ['dataset.created', { shareScope: 'private', scenarioTags: ['normal', 'boundary'], modelCount: 2, synthetic: false }],
    ['dataset.updated', { changed: ['name', 'scenarioTags'] }],
    ['dataset.archived', { revisionCount: 3 }],
    ['dataset.revision_created', { datasetId: ID, seq: 1, fileCount: 4, digest: DIGEST, availability: 'unverified' }],
    ['dataset.candidate_created', { origin: 'round_evidence', fileCount: 2, evidenceCount: 5 }],
    ['dataset.candidate_approved', { datasetId: ID, revisionId: ID, fileCount: 2 }],
    ['dataset.candidate_rejected', { reasonLength: 12 }],
    ['dataset.baseline_created', { datasetId: ID, revisionId: ID, seq: 1, expectationCount: 0, copied: false }],
    ['dataset.baseline_updated', { changed: ['expectations'], expectationCount: 3 }],
    ['dataset.baseline_approved', { datasetId: ID, revisionId: ID, seq: 2, expectationCount: 3, supersededSeq: 1, reasonLength: 9, selfApproved: true }],
    ['dataset.baseline_approved', { datasetId: ID, revisionId: ID, seq: 1, expectationCount: 3, supersededSeq: null, reasonLength: 9, selfApproved: false }],
    ['dataset.baseline_superseded', { datasetId: ID, revisionId: ID, seq: 1, bySeq: 2, from: 'approved' }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['dataset.created', 'an unknown tag', { shareScope: 'private', scenarioTags: ['smoke'], modelCount: 0, synthetic: false }],
    ['dataset.created', 'the purpose text', { shareScope: 'private', scenarioTags: [], modelCount: 0, synthetic: false, purpose: 'x' }],
    ['dataset.updated', 'no changed field', { changed: [] }],
    ['dataset.revision_created', 'a file location', { datasetId: ID, seq: 1, fileCount: 1, digest: DIGEST, availability: 'available', fileRef: 's3://x' }],
    ['dataset.revision_created', 'a file list', { datasetId: ID, seq: 1, fileCount: 1, digest: DIGEST, availability: 'available', files: [] }],
    ['dataset.revision_created', 'an unknown availability', { datasetId: ID, seq: 1, fileCount: 1, digest: DIGEST, availability: 'confirmed' }],
    ['dataset.revision_created', 'a short digest', { datasetId: ID, seq: 1, fileCount: 1, digest: 'abc', availability: 'available' }],
    ['dataset.candidate_created', 'an evidence list', { origin: 'manual', fileCount: 1, evidenceCount: 0, evidenceRefs: [] }],
    ['dataset.candidate_created', 'an LLM origin', { origin: 'llm', fileCount: 1, evidenceCount: 0 }],
    ['dataset.candidate_rejected', 'the reason text', { reasonLength: 3, reason: 'bad' }],
    ['dataset.baseline_created', 'the expectations', { datasetId: ID, revisionId: ID, seq: 1, expectationCount: 1, copied: false, expectations: [] }],
    ['dataset.baseline_updated', 'no changed field', { changed: [], expectationCount: 0 }],
    ['dataset.baseline_approved', 'the reason text', { datasetId: ID, revisionId: ID, seq: 1, expectationCount: 1, supersededSeq: null, reasonLength: 3, selfApproved: false, reason: 'ok' }],
    ['dataset.baseline_approved', 'a missing self-approval marker', { datasetId: ID, revisionId: ID, seq: 1, expectationCount: 1, supersededSeq: null, reasonLength: 3 }],
    ['dataset.baseline_approved', 'an empty reason', { datasetId: ID, revisionId: ID, seq: 1, expectationCount: 1, supersededSeq: null, reasonLength: 0, selfApproved: false }],
    ['dataset.baseline_superseded', 'an unknown prior status', { datasetId: ID, revisionId: ID, seq: 1, bySeq: 2, from: 'final' }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
