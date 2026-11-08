// #1474 X-h — the pure side of the round evidence-location intake: shape re-validation, status and sample-set judgment.

import { describe, expect, it } from 'vitest';

import {
  evidenceRefStatus,
  parseEvidenceRefOrigin,
  parseEvidenceRefs,
  sampleSetMisses,
} from '../domain/evidence-ref-intake.js';

const H = (c: string) => c.repeat(64);
const ref = (extra: Record<string, unknown> = {}) => ({ fileRef: 's3://b/a.log', line: 3, fileSha256: H('a'), sourceResolved: true, ...extra });
const errs = (raw: unknown) => {
  const r = parseEvidenceRefs(raw);
  return r.ok ? [] : r.errors.map((e) => `${e.path.join('.')}:${e.code}`);
};

describe('parseEvidenceRefs', () => {
  it('accepts a pointer, lower-cases the hash and trims a blank note to null', () => {
    const r = parseEvidenceRefs([ref({ fileSha256: 'A'.repeat(64), note: '  ' }), ref({ line: 4, note: ' hi ' })]);
    expect(r).toEqual({
      ok: true,
      value: [
        { fileRef: 's3://b/a.log', line: 3, fileSha256: H('a'), note: null, sourceResolved: true },
        { fileRef: 's3://b/a.log', line: 4, fileSha256: H('a'), note: 'hi', sourceResolved: true },
      ],
    });
  });

  it.each([
    ['missing list', undefined, ['refs:required']],
    ['empty list', [], ['refs:required']],
    ['not a list', {}, ['refs:malformed']],
    ['101 pointers', Array.from({ length: 101 }, (_, i) => ref({ line: i + 1 })), ['refs:too_many']],
    ['not an object', [1], ['refs.0:malformed']],
    ['unknown key', [ref({ excerpt: 'x' })], ['refs.0.excerpt:malformed']],
    ['no fileRef', [{ line: 1, fileSha256: H('a'), sourceResolved: true }], ['refs.0.fileRef:required']],
    ['control character in fileRef', [ref({ fileRef: 'a\u0007b' })], ['refs.0.fileRef:malformed']],
    ['fileRef over 1024', [ref({ fileRef: 'x'.repeat(1025) })], ['refs.0.fileRef:too_long']],
    ['line 0', [ref({ line: 0 })], ['refs.0.line:malformed']],
    ['fractional line', [ref({ line: 1.5 })], ['refs.0.line:malformed']],
    ['short hash', [ref({ fileSha256: 'abc' })], ['refs.0.fileSha256:malformed']],
    ['note over 500', [ref({ note: 'x'.repeat(501) })], ['refs.0.note:too_long']],
    ['no sourceResolved', [{ fileRef: 'f', line: 1, fileSha256: H('a') }], ['refs.0.sourceResolved:required']],
    ['string sourceResolved', [ref({ sourceResolved: 'yes' })], ['refs.0.sourceResolved:malformed']],
    ['duplicate triple (hash case ignored)', [ref(), ref({ fileSha256: 'A'.repeat(64), note: 'other' })], ['refs.1:duplicate']],
  ] as const)('refuses %s', (_label, raw, expected) => {
    expect(errs(raw)).toEqual(expected);
  });

  it('keeps the same fileRef with another line or hash', () => {
    expect(errs([ref(), ref({ line: 4 }), ref({ fileSha256: H('b') })])).toEqual([]);
  });
});

describe('parseEvidenceRefOrigin', () => {
  const id = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
  it('accepts the explorer origin', () => {
    expect(parseEvidenceRefOrigin({ kind: 'log_explorer', id })).toEqual({ ok: true, value: { kind: 'log_explorer', id } });
  });
  it.each([
    [undefined, ['origin:required']],
    ['x', ['origin:malformed']],
    [{ kind: 'voc', id }, ['origin.kind:malformed']],
    [{ kind: 'log_explorer', id: 'nope' }, ['origin.id:malformed']],
    [{ kind: 'log_explorer', id, extra: 1 }, ['origin.extra:malformed']],
  ] as const)('refuses %j', (raw, expected) => {
    const r = parseEvidenceRefOrigin(raw);
    expect(r.ok ? [] : r.errors.map((e) => `${e.path.join('.')}:${e.code}`)).toEqual(expected);
  });
});

describe('evidenceRefStatus', () => {
  it.each([
    [{ sourceResolved: false, fileSha256: H('a') }, H('a'), 'unresolved'],
    [{ sourceResolved: false, fileSha256: H('b') }, H('a'), 'unresolved'],
    [{ sourceResolved: true, fileSha256: H('b') }, H('a'), 'hash_mismatch'],
    [{ sourceResolved: true, fileSha256: H('a') }, H('a'), 'match'],
  ] as const)('%j against %s is %s', (r, sample, status) => {
    expect(evidenceRefStatus(r, sample)).toBe(status);
  });
});

describe('sampleSetMisses', () => {
  const set = { sourceOwner: 'o', files: [{ fileRef: 's3://b/a.log', order: 1, sha256: H('a') }] };
  it('names every pointer whose file is not in the sample set', () => {
    const refs = [
      { fileRef: 's3://b/a.log', line: 1, fileSha256: H('a'), note: null, sourceResolved: true },
      { fileRef: 's3://b/other.log', line: 1, fileSha256: H('a'), note: null, sourceResolved: true },
    ];
    expect(sampleSetMisses(refs, set)).toEqual([{ path: ['refs', '1', 'fileRef'], code: 'not_in_sample_set' }]);
  });
});
