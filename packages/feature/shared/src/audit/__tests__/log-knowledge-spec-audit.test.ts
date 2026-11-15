import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const HASH = 'a'.repeat(64);
const counts = { modules: 1, events: 2, relations: 0 };

describe('log knowledge spec audit detail schemas (ADR-0111)', () => {
  it.each([
    ['knowledge.spec.draft_saved', { modelId: ID, revisionNo: 1, mode: 'append', added: counts }],
    ['knowledge.spec.draft_saved', { modelId: ID, revisionNo: 2, mode: 'replace', added: counts, replacedRevisionId: ID }],
    // #1196 b2: the input provenance of a save, and an unknown provenance value
    ['knowledge.spec.draft_saved', { modelId: ID, revisionNo: 1, mode: 'append', input: 'tsv', added: counts }],
    ['knowledge.spec.draft_saved', { modelId: ID, revisionNo: 3, mode: 'append', input: 'paste', added: counts }],
    ['knowledge.spec.published', { modelId: ID, revisionNo: 1, outcome: 'published', contentSha256: HASH, counts }],
    ['knowledge.spec.published', { modelId: ID, revisionNo: 2, outcome: 'unchanged', contentSha256: HASH, counts, existingRevisionId: ID }],
    ['knowledge.spec.rejected', { modelId: ID, revisionNo: 1, reasonLength: 12 }],
    // #1196 c: the flag count of a publish and the three SW change events
    ['knowledge.spec.published', { modelId: ID, revisionNo: 2, outcome: 'published', contentSha256: HASH, counts, flagged: 3 }],
    ['knowledge.spec.change_added', { modelId: ID, changeId: ID, softwareId: ID, endsBeforeSoftwareId: null, targetKind: 'event', changeKind: 'changed', basedOnRevNo: 1 }],
    ['knowledge.spec.change_added', { modelId: ID, changeId: ID, softwareId: ID, endsBeforeSoftwareId: ID, targetKind: 'field', changeKind: 'added', basedOnRevNo: 2, replacesChangeId: ID }],
    ['knowledge.spec.change_retired', { modelId: ID, changeId: ID }],
    ['knowledge.spec.change_retired', { modelId: ID, changeId: ID, replacementChangeId: ID }],
    ['knowledge.spec.change_confirmed', { modelId: ID, changeId: ID, revalidationRevNo: 2 }],
    // #1196 e: the three concept mapping events
    ['knowledge.spec.concept_proposed', { modelId: ID, mappingId: ID, conceptId: ID, targetKind: 'event', relationKind: 'equivalent', origin: 'human' }],
    ['knowledge.spec.concept_proposed', { modelId: ID, mappingId: ID, conceptId: ID, targetKind: 'module', relationKind: 'related', origin: 'similarity' }],
    ['knowledge.spec.concept_confirmed', { modelId: ID, mappingId: ID, conceptId: ID, relationKind: 'equivalent' }],
    ['knowledge.spec.concept_rejected', { modelId: ID, mappingId: ID, conceptId: ID, priorState: 'confirmed' }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['knowledge.spec.rejected', 'the reason text', { modelId: ID, revisionNo: 1, reasonLength: 1, reason: 'x' }],
    ['knowledge.spec.draft_saved', 'a module body', { modelId: ID, revisionNo: 1, mode: 'append', added: counts, modules: [] }],
    // #1196 fix C5: the published hash stays exactly 64 lowercase hex characters, next to the provenance case
    ['knowledge.spec.published', 'a malformed content hash', { modelId: ID, revisionNo: 1, outcome: 'published', contentSha256: 'x', counts }],
    // #1196 c: the target key, the note and the change body stay out of the audit detail
    ['knowledge.spec.change_added', 'the target key', { modelId: ID, changeId: ID, softwareId: ID, endsBeforeSoftwareId: null, targetKind: 'event', changeKind: 'changed', basedOnRevNo: 1, targetKey: 'a/b' }],
    ['knowledge.spec.change_added', 'a note', { modelId: ID, changeId: ID, softwareId: ID, endsBeforeSoftwareId: null, targetKind: 'event', changeKind: 'behavior', basedOnRevNo: 1, note: 'x' }],
    ['knowledge.spec.change_confirmed', 'a change body', { modelId: ID, changeId: ID, change: {} }],
    // #1196 e: the target key, a label and the reject reason stay out of the audit detail
    ['knowledge.spec.concept_proposed', 'the target key', { modelId: ID, mappingId: ID, conceptId: ID, targetKind: 'event', relationKind: 'equivalent', origin: 'human', targetKey: 'a/b' }],
    ['knowledge.spec.concept_proposed', 'an unknown origin', { modelId: ID, mappingId: ID, conceptId: ID, targetKind: 'event', relationKind: 'equivalent', origin: 'confirmed' }],
    ['knowledge.spec.concept_rejected', 'the reason text', { modelId: ID, mappingId: ID, conceptId: ID, priorState: 'proposed', reason: 'x' }],
    ['knowledge.spec.concept_rejected', 'a rejected prior state', { modelId: ID, mappingId: ID, conceptId: ID, priorState: 'rejected' }],
    ['knowledge.spec.published', 'a negative flag count', { modelId: ID, revisionNo: 1, outcome: 'published', contentSha256: HASH, counts, flagged: -1 }],
    ['knowledge.spec.draft_saved', 'an unknown provenance', { modelId: ID, revisionNo: 1, mode: 'append', input: 'file', added: counts }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
