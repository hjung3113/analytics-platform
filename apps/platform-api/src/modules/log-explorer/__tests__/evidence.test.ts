import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_MAX,
  type EvidenceRef,
  addEvidence,
  parseEvidenceKey,
  parseEvidenceRef,
  removeEvidence,
  storedEvidence,
} from '../domain/evidence.js';

const H = 'a'.repeat(64);
const ref = (over: Record<string, unknown> = {}) => ({ fileRef: 's3://x/a.log', line: 12, fileSha256: H, ...over });

describe('parseEvidenceRef', () => {
  it('keeps exactly fileRef, line, fileSha256 and a trimmed note', () => {
    const r = parseEvidenceRef(ref({ fileRef: '  s3://x/a.log ', note: '  look here ' }));
    expect(r).toEqual({ ok: true, value: { fileRef: 's3://x/a.log', line: 12, fileSha256: H, note: 'look here' } });
  });

  it('drops a blank or null note', () => {
    expect(parseEvidenceRef(ref({ note: '   ' }))).toEqual({ ok: true, value: { fileRef: 's3://x/a.log', line: 12, fileSha256: H } });
    expect(parseEvidenceRef(ref({ note: null }))).toEqual({ ok: true, value: { fileRef: 's3://x/a.log', line: 12, fileSha256: H } });
  });

  it.each([
    ['a body field', ref({ body: 'ERROR x' }), 'ref.body', 'malformed'],
    ['an excerpt field', ref({ excerpt: 'ERROR x' }), 'ref.excerpt', 'malformed'],
    ['no fileRef', ref({ fileRef: undefined }), 'ref.fileRef', 'required'],
    ['a blank fileRef', ref({ fileRef: '  ' }), 'ref.fileRef', 'required'],
    ['a control character in fileRef', ref({ fileRef: 'a\u0000b' }), 'ref.fileRef', 'malformed'],
    ['a fileRef over 1024 characters', ref({ fileRef: 'x'.repeat(1025) }), 'ref.fileRef', 'too_long'],
    ['no line', ref({ line: undefined }), 'ref.line', 'required'],
    ['line 0', ref({ line: 0 }), 'ref.line', 'malformed'],
    ['a fractional line', ref({ line: 1.5 }), 'ref.line', 'malformed'],
    ['a string line', ref({ line: '3' }), 'ref.line', 'malformed'],
    ['a short hash', ref({ fileSha256: 'abc' }), 'ref.fileSha256', 'malformed'],
    ['an upper-case hash', ref({ fileSha256: 'A'.repeat(64) }), 'ref.fileSha256', 'malformed'],
    ['no hash', ref({ fileSha256: undefined }), 'ref.fileSha256', 'required'],
    ['a note over 500 characters', ref({ note: 'n'.repeat(501) }), 'ref.note', 'too_long'],
    ['a note with a control character', ref({ note: 'a\u0007b' }), 'ref.note', 'malformed'],
  ])('refuses %s', (_label, raw, path, code) => {
    expect(parseEvidenceRef(raw)).toEqual({ ok: false, errors: [{ path: path.split('.'), code }] });
  });

  it.each([[undefined, 'required'], [null, 'required'], ['x', 'malformed'], [[], 'malformed']])('refuses %j as the whole ref', (raw, code) => {
    expect(parseEvidenceRef(raw)).toEqual({ ok: false, errors: [{ path: ['ref'], code }] });
  });
});

describe('parseEvidenceKey', () => {
  it('takes fileRef and line only', () => {
    expect(parseEvidenceKey({ fileRef: ' s3://x/a.log', line: 3 })).toEqual({ ok: true, value: { fileRef: 's3://x/a.log', line: 3 } });
    expect(parseEvidenceKey({ fileRef: 's3://x/a.log', line: 3, fileSha256: H })).toEqual({ ok: false, errors: [{ path: ['ref', 'fileSha256'], code: 'malformed' }] });
  });
});

describe('addEvidence / removeEvidence', () => {
  const one = (line: number): EvidenceRef => ({ fileRef: 's3://x/a.log', line, fileSha256: H });

  it('appends in order and refuses the same location twice (the note does not make it new)', () => {
    const first = addEvidence([], one(1));
    expect(first).toEqual({ ok: true, evidence: [one(1)] });
    expect(addEvidence([one(1)], { ...one(1), note: 'again' })).toEqual({ ok: false, code: 'duplicate' });
    expect(addEvidence([one(1)], { ...one(1), fileRef: 's3://x/b.log' })).toMatchObject({ ok: true });
  });

  it('holds at most 100: the 101st is too_many, the 100th still fits', () => {
    const ninetyNine = Array.from({ length: EVIDENCE_MAX - 1 }, (_v, i) => one(i + 1));
    const full = addEvidence(ninetyNine, one(EVIDENCE_MAX));
    expect(full).toMatchObject({ ok: true });
    if (!full.ok) throw new Error('unreachable');
    expect(full.evidence).toHaveLength(EVIDENCE_MAX);
    expect(addEvidence(full.evidence, one(EVIDENCE_MAX + 1))).toEqual({ ok: false, code: 'too_many' });
  });

  it('removes by (fileRef, line) and says not_found for a location it does not hold', () => {
    expect(removeEvidence([one(1), one(2)], { fileRef: 's3://x/a.log', line: 1 })).toEqual({ ok: true, evidence: [one(2)] });
    expect(removeEvidence([one(1)], { fileRef: 's3://x/a.log', line: 9 })).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('storedEvidence', () => {
  it('reads back only the four ref fields and skips malformed entries', () => {
    expect(storedEvidence([{ fileRef: 'f', line: 1, fileSha256: H, note: 'n', body: 'x' }, { fileRef: 1 }, null, 'x'])).toEqual([
      { fileRef: 'f', line: 1, fileSha256: H, note: 'n' },
    ]);
    expect(storedEvidence(null)).toEqual([]);
  });
});
