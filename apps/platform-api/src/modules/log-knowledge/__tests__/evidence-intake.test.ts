// #1474 X-h — the pure side of the knowledge-draft evidence intake: shape re-validation, the pointer mapping, the hash-mismatch
// marker, the refusal of unresolved pointers and the merge by (sourceRef, locator, contentHash).

import { describe, expect, it } from 'vitest';

import {
  HASH_MISMATCH_MARKER,
  markHashMismatch,
  mergePointers,
  parseDraftEvidenceOrigin,
  parseDraftEvidenceRefs,
  parseSourceOwner,
} from '../domain/evidence-intake.js';
import { EVIDENCE_MAX, EVIDENCE_NOTE_MAX } from '../domain/item-input.js';

const H = (c: string) => c.repeat(64);
const ref = (extra: Record<string, unknown> = {}) => ({ fileRef: 's3://b/a.log', line: 3, fileSha256: H('a'), sourceResolved: true, ...extra });
const errs = (raw: unknown) => {
  const r = parseDraftEvidenceRefs(raw, 'fab-team');
  return r.ok ? [] : r.errors.map((e) => `${e.path.join('.')}:${e.code}`);
};

describe('parseDraftEvidenceRefs mapping', () => {
  it('maps a pointer to a log_file evidence pointer with a line locator, the hash and the note', () => {
    const r = parseDraftEvidenceRefs([ref({ fileSha256: 'A'.repeat(64), note: 'see here' })], 'fab-team');
    expect(r).toEqual({
      ok: true,
      value: [
        { sourceKind: 'log_file', sourceOwner: 'fab-team', sourceRef: 's3://b/a.log', sourceVersion: null, contentHash: H('a'), locator: 'line:3', note: 'see here' },
      ],
    });
  });

  it('starts the note of a hash mismatch with the fixed marker (a bare marker without a note)', () => {
    const r = parseDraftEvidenceRefs([ref({ hashMismatch: true, note: 'x' }), ref({ line: 4, hashMismatch: true })], 'o');
    expect(r.ok && r.value.map((p) => p.note)).toEqual([`${HASH_MISMATCH_MARKER} x`, HASH_MISMATCH_MARKER]);
  });

  it('cuts a marked note to the note limit by code points', () => {
    const marked = markHashMismatch('가'.repeat(EVIDENCE_NOTE_MAX));
    expect([...marked]).toHaveLength(EVIDENCE_NOTE_MAX);
    expect(marked.startsWith(`${HASH_MISMATCH_MARKER} `)).toBe(true);
  });

  it('refuses an unresolved pointer at its index and writes nothing', () => {
    expect(errs([ref(), ref({ line: 4, sourceResolved: false })])).toEqual(['refs.1:unresolved']);
  });

  it.each([
    ['empty list', [], ['refs:required']],
    ['more pointers than an item may carry', Array.from({ length: EVIDENCE_MAX + 1 }, (_, i) => ref({ line: i + 1 })), ['refs:too_many']],
    ['unknown key', [ref({ excerpt: 'x' })], ['refs.0.excerpt:malformed']],
    ['bad hash', [ref({ fileSha256: 'zz' })], ['refs.0.fileSha256:malformed']],
    ['hashMismatch not a boolean', [ref({ hashMismatch: 'yes' })], ['refs.0.hashMismatch:malformed']],
    ['fileRef over the evidence field limit', [ref({ fileRef: 'x'.repeat(1001) })], ['refs.0.fileRef:too_long']],
    ['duplicate', [ref(), ref()], ['refs.1:duplicate']],
    ['blank fileRef', [ref({ fileRef: '   ' })], ['refs.0.fileRef:required']],
    ['duplicate that differs only by padding', [ref(), ref({ fileRef: ' s3://b/a.log ' })], ['refs.1:duplicate']],
  ] as const)('refuses %s', (_label, raw, expected) => {
    expect(errs(raw)).toEqual(expected);
  });

  it('trims the fileRef into the stored sourceRef', () => {
    const r = parseDraftEvidenceRefs([ref({ fileRef: '  s3://b/a.log\t' })], 'o');
    expect(r.ok && r.value[0]?.sourceRef).toBe('s3://b/a.log');
  });

  it('takes exactly EVIDENCE_MAX pointers', () => {
    expect(errs(Array.from({ length: EVIDENCE_MAX }, (_, i) => ref({ line: i + 1 })))).toEqual([]);
  });
});

describe('parseSourceOwner / parseDraftEvidenceOrigin', () => {
  it('trims the owner and refuses blank, control and over-long values', () => {
    expect(parseSourceOwner(' fab ')).toEqual({ ok: true, value: 'fab' });
    for (const bad of [undefined, '  ', 7, 'a\u0001', 'x'.repeat(1001)]) expect(parseSourceOwner(bad).ok).toBe(false);
  });
  it('accepts the explorer origin only', () => {
    const id = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
    expect(parseDraftEvidenceOrigin({ kind: 'log_explorer', id }).ok).toBe(true);
    expect(parseDraftEvidenceOrigin({ kind: 'other', id }).ok).toBe(false);
    expect(parseDraftEvidenceOrigin({ kind: 'log_explorer', id: 'x' }).ok).toBe(false);
  });
});

describe('mergePointers', () => {
  const p = (line: number, hash = H('a'), note: string | null = null) => ({
    sourceKind: 'log_file' as const,
    sourceOwner: 'o',
    sourceRef: 'f',
    sourceVersion: null,
    contentHash: hash,
    locator: `line:${line}`,
    note,
  });
  it('keeps stored pointers first, drops those already stored (the stored one wins) and counts the new ones', () => {
    const r = mergePointers([p(1, H('a'), 'old')], [p(1, H('a'), 'new'), p(2), p(1, H('b'))]);
    expect(r.added).toBe(2);
    expect(r.merged.map((x) => `${x.locator}/${x.contentHash?.[0]}/${x.note}`)).toEqual(['line:1/a/old', 'line:2/a/null', 'line:1/b/null']);
  });
});
