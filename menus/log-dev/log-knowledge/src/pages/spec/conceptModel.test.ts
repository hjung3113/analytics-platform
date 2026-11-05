import { describe, expect, it } from 'vitest';
import type { ConceptMappingRow } from '../../endpoints';
import {
  CONCEPT_ORIGIN_LABEL, CONCEPT_RELATION_LABEL, CONCEPT_STATE_LABEL, canConfirm, canReject, conceptFieldErrors, countsByTarget, filterByTarget, groupByConcept,
  mappingLabels, proposedQueue, recoverConflict, reviewDraft, reviewOutcome, sortMappings,
} from './conceptModel';

const row = (id: string, patch: Partial<ConceptMappingRow> = {}): ConceptMappingRow => ({
  id, conceptId: 'c1', conceptLabel: '개념', kind: 'event', modelId: 'm1', modelName: 'Alpha', targetKind: 'event', targetKey: 'A/B', targetName: 'B', targetState: 'present',
  relationKind: 'equivalent', reviewState: 'proposed', origin: 'human', similarityScore: null, similarityBasis: null, rejectReason: null, proposedBy: 'u', proposedAt: '2026-11-01T00:00:00Z',
  reviewedBy: null, reviewedAt: null, version: 1, ...patch,
});

describe('words', () => {
  it('never shows the wire words equivalent / related', () => {
    for (const table of [CONCEPT_RELATION_LABEL, CONCEPT_STATE_LABEL, CONCEPT_ORIGIN_LABEL]) {
      for (const [wire, words] of Object.entries(table)) {
        expect(words.ko).not.toMatch(/[A-Za-z]/); // Korean copy has no English wire word in it
        expect(words.en).not.toBe(wire); // and the English copy is a phrase, not the raw value
      }
    }
    expect(CONCEPT_RELATION_LABEL.equivalent.ko).toBe('같은 개념');
    expect(CONCEPT_RELATION_LABEL.related.ko).toBe('관련 개념');
    expect(CONCEPT_ORIGIN_LABEL.human.ko).toBe('사람 제안');
    expect(CONCEPT_ORIGIN_LABEL.similarity.ko).toBe('유사도 제안');
  });
  it('labels a row; the score shows only on a similarity proposal; a gone target falls back to its key', () => {
    expect(mappingLabels(row('1', { origin: 'similarity', similarityScore: 0.8, targetName: null, targetState: 'target_gone' }))).toMatchObject({ score: 0.8, gone: true, targetName: 'A/B', origin: { ko: '유사도 제안' } });
    expect(mappingLabels(row('1', { similarityScore: 0.9 })).score).toBeNull();
  });
});

describe('grouping and sorting', () => {
  const rows = [
    row('r', { reviewState: 'rejected', proposedAt: '2026-11-03T00:00:00Z' }), row('c', { reviewState: 'confirmed', proposedAt: '2026-11-03T00:00:00Z' }),
    row('p-old', { proposedAt: '2026-11-01T00:00:00Z' }), row('p-new', { proposedAt: '2026-11-02T00:00:00Z' }), row('p-tie', { proposedAt: '2026-11-02T00:00:00Z' }),
  ];
  it('puts the proposed queue first, newest first, ties by id', () => {
    expect(sortMappings(rows).map(r => r.id)).toEqual(['p-new', 'p-tie', 'p-old', 'c', 'r']);
    expect(proposedQueue(rows).map(r => r.id)).toEqual(['p-new', 'p-tie', 'p-old']);
  });
  it('counts rows per target by state and filters by the event key', () => {
    const counts = countsByTarget([...rows, row('x', { targetKey: 'A/C', reviewState: 'confirmed' })]);
    expect(counts.get('A/B')).toEqual({ proposed: 3, confirmed: 1, rejected: 1, total: 5 });
    expect(counts.get('A/C')).toMatchObject({ confirmed: 1, total: 1 });
    expect(filterByTarget([...rows, row('x', { targetKey: 'A/C' })], 'A/C').map(r => r.id)).toEqual(['x']);
    expect(filterByTarget(rows, null)).toHaveLength(5);
  });
  it('orders concept groups: a group with a proposed row first, then by label', () => {
    const groups = groupByConcept([row('1', { conceptId: 'z', conceptLabel: 'Z', reviewState: 'confirmed' }), row('2', { conceptId: 'a', conceptLabel: 'A', reviewState: 'confirmed' }), row('3', { conceptId: 'm', conceptLabel: 'M', targetState: 'target_gone' })]);
    expect(groups.map(g => g.conceptId)).toEqual(['m', 'a', 'z']);
    expect(groups[0]).toMatchObject({ hasProposed: true, hasGone: true, counts: { proposed: 1, total: 1 } });
  });
});

describe('what a person may do', () => {
  it('confirms only a proposed row whose target is still there; rejects anything not yet rejected', () => {
    expect(canConfirm(row('1'))).toBe(true);
    expect(canConfirm(row('1', { targetState: 'target_gone' }))).toBe(false);
    expect(canConfirm(row('1', { reviewState: 'confirmed' }))).toBe(false);
    expect(canReject(row('1', { targetState: 'target_gone' }))).toBe(true);
    expect(canReject(row('1', { reviewState: 'confirmed' }))).toBe(true);
    expect(canReject(row('1', { reviewState: 'rejected' }))).toBe(false);
  });
  it('needs a reason (1..500 after trimming) only when rejecting', () => {
    expect(reviewDraft('confirm', '')).toEqual({ ok: true, reason: null });
    expect(reviewDraft('reject', '')).toEqual({ ok: false, error: 'required' });
    expect(reviewDraft('reject', '  \n ')).toEqual({ ok: false, error: 'required' });
    expect(reviewDraft('reject', ' 다름 ')).toEqual({ ok: true, reason: '다름' });
    expect(reviewDraft('reject', 'x'.repeat(500))).toMatchObject({ ok: true });
    expect(reviewDraft('reject', 'x'.repeat(501))).toEqual({ ok: false, error: 'too_long' });
    expect(reviewDraft('reject', '😀'.repeat(500))).toMatchObject({ ok: true }); // code points, not UTF-16 units
  });
});

describe('write answers and conflict recovery', () => {
  it('maps each outcome; a conflict keeps the typed reason', () => {
    expect(reviewOutcome({ outcome: 'ok', fieldErrors: [] })).toEqual({ kind: 'done' });
    expect(reviewOutcome({ outcome: 'conflict', fieldErrors: [] })).toMatchObject({ kind: 'conflict', keepReason: true });
    expect(reviewOutcome({ outcome: 'forbidden', fieldErrors: [] }).kind).toBe('forbidden');
    expect(reviewOutcome({ outcome: 'unknown', fieldErrors: [] }).kind).toBe('failed');
    expect(reviewOutcome({ outcome: 'invalid', fieldErrors: [{ path: ['mapping'], code: 'already_rejected' }] })).toMatchObject({ kind: 'invalid', fieldErrors: { mapping: { ko: expect.stringContaining('기각') } } });
  });
  it('after a re-read: retry with the new version, show a decision made meanwhile, or report the row gone', () => {
    expect(recoverConflict({ id: '1' }, [row('1', { version: 4 })])).toMatchObject({ status: 'retry', version: '4' });
    expect(recoverConflict({ id: '1' }, [row('1', { reviewState: 'confirmed', version: 2 })])).toMatchObject({ status: 'already_decided' });
    expect(recoverConflict({ id: '1' }, [row('2')])).toEqual({ status: 'row_missing' });
  });
  it('field errors: the first text per path; an unknown code gets the generic text', () => {
    const out = conceptFieldErrors([{ path: ['pairWith', 'target'], code: 'already_rejected' }, { path: ['pairWith', 'target'], code: 'required' }, { path: ['x'], code: 'weird' }]);
    expect(out['pairWith.target']!.ko).toContain('기각');
    expect(out['x']!.ko).toBe('입력을 확인해 주세요.');
  });
});
