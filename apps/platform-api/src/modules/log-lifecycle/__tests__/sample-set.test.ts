import { describe, expect, it } from 'vitest';

import { FILE_REF_MAX, SAMPLE_FILES_MAX, SOURCE_OWNER_MAX, parseSampleSet, sampleManifestDigest } from '../domain/sample-set.js';

const H = (c: string) => c.repeat(64);
const file = (n: number, over: Record<string, unknown> = {}) => ({ fileRef: `s3://logs/f${n}.log`, order: n, sha256: H('a'), ...over });
const set = (over: Record<string, unknown> = {}) => ({ files: [file(1), file(2)], sourceOwner: 'fab-team', ...over });
const errorOf = (raw: unknown) => {
  const r = parseSampleSet(raw);
  if (r.ok) throw new Error('expected a refusal');
  return r.errors.map((e) => `${e.path.join('.')}:${e.code}`);
};

describe('parseSampleSet', () => {
  it('accepts a valid set, trims fileRef and sourceOwner and keeps the given order', () => {
    const r = parseSampleSet({ files: [file(2, { fileRef: ' b ' }), file(1, { fileRef: 'a' })], sourceOwner: ' fab ' });
    expect(r).toEqual({
      ok: true,
      value: {
        files: [
          { fileRef: 'b', order: 2, sha256: H('a') },
          { fileRef: 'a', order: 1, sha256: H('a') },
        ],
        sourceOwner: 'fab',
      },
    });
  });

  it.each([
    ['null', null, 'sampleSet:required'],
    ['array', [], 'sampleSet:malformed'],
    ['unknown top key', set({ extra: 1 }), 'sampleSet.extra:malformed'],
    ['no files', { sourceOwner: 'x' }, 'sampleSet.files:required'],
    ['empty files', set({ files: [] }), 'sampleSet.files:required'],
    ['files not a list', set({ files: {} }), 'sampleSet.files:malformed'],
    ['no sourceOwner', { files: [file(1)] }, 'sampleSet.sourceOwner:required'],
    ['blank sourceOwner', set({ sourceOwner: '  ' }), 'sampleSet.sourceOwner:required'],
    ['long sourceOwner', set({ sourceOwner: 'x'.repeat(SOURCE_OWNER_MAX + 1) }), 'sampleSet.sourceOwner:too_long'],
    ['control in sourceOwner', set({ sourceOwner: 'a\u0007b' }), 'sampleSet.sourceOwner:malformed'],
    ['file not an object', set({ files: ['x'] }), 'sampleSet.files.0:malformed'],
    ['unknown file key', set({ files: [file(1, { size: 3 })] }), 'sampleSet.files.0.size:malformed'],
    ['blank fileRef', set({ files: [file(1, { fileRef: ' ' })] }), 'sampleSet.files.0.fileRef:required'],
    ['numeric fileRef', set({ files: [file(1, { fileRef: 5 })] }), 'sampleSet.files.0.fileRef:required'],
    ['long fileRef', set({ files: [file(1, { fileRef: 'x'.repeat(FILE_REF_MAX + 1) })] }), 'sampleSet.files.0.fileRef:too_long'],
    ['control fileRef', set({ files: [file(1, { fileRef: 'a\nb' })] }), 'sampleSet.files.0.fileRef:malformed'],
    ['DEL fileRef', set({ files: [file(1, { fileRef: 'a\u007fb' })] }), 'sampleSet.files.0.fileRef:malformed'],
    ['duplicate fileRef (after trim)', set({ files: [file(1, { fileRef: 'a' }), file(2, { fileRef: ' a ' })] }), 'sampleSet.files.1.fileRef:duplicate'],
    ['order 0', set({ files: [file(1, { order: 0 }), file(2)] }), 'sampleSet.files.0.order:order_invalid'],
    ['order beyond n', set({ files: [file(1), file(3)] }), 'sampleSet.files.1.order:order_invalid'],
    ['order twice', set({ files: [file(1), file(2, { order: 1 })] }), 'sampleSet.files.1.order:order_invalid'],
    ['fractional order', set({ files: [file(1, { order: 1.5 }), file(2)] }), 'sampleSet.files.0.order:order_invalid'],
    ['string order', set({ files: [file(1, { order: '1' }), file(2)] }), 'sampleSet.files.0.order:order_invalid'],
    ['upper-case hash', set({ files: [file(1, { sha256: H('A') })] }), 'sampleSet.files.0.sha256:malformed'],
    ['short hash', set({ files: [file(1, { sha256: 'abc' })] }), 'sampleSet.files.0.sha256:malformed'],
    ['missing hash', set({ files: [{ fileRef: 'a', order: 1 }] }), 'sampleSet.files.0.sha256:malformed'],
  ])('refuses %s', (_name, raw, expected) => {
    expect(errorOf(raw)).toEqual([expected]);
  });

  it('accepts exactly the file limit and refuses one more', () => {
    const many = (n: number) => ({
      files: Array.from({ length: n }, (_v, i) => file(i + 1, { fileRef: `f${i + 1}` })),
      sourceOwner: 'x',
    });
    expect(parseSampleSet(many(SAMPLE_FILES_MAX)).ok).toBe(true);
    expect(errorOf(many(SAMPLE_FILES_MAX + 1))).toEqual(['sampleSet.files:too_many']);
  });
});

describe('sampleManifestDigest', () => {
  const parse = (raw: unknown) => {
    const r = parseSampleSet(raw);
    if (!r.ok) throw new Error('invalid');
    return r.value;
  };

  it('is a SHA-256 hex and identical input gives an identical digest', () => {
    const a = sampleManifestDigest(parse(set()));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sampleManifestDigest(parse(set()))).toBe(a);
  });

  it('does not depend on the array position, only on the order field', () => {
    const forward = parse(set());
    const shuffled = parse(set({ files: [file(2), file(1)] }));
    expect(sampleManifestDigest(shuffled)).toBe(sampleManifestDigest(forward));
  });

  it('changes when the files are reordered (order values swapped), a hash, a ref or the owner changes', () => {
    const base = sampleManifestDigest(parse(set()));
    const swapped = parse(set({ files: [file(1, { fileRef: 's3://logs/f2.log' }), file(2, { fileRef: 's3://logs/f1.log' })] }));
    expect(sampleManifestDigest(swapped)).not.toBe(base);
    expect(sampleManifestDigest(parse(set({ files: [file(1, { sha256: H('b') }), file(2)] })))).not.toBe(base);
    expect(sampleManifestDigest(parse(set({ sourceOwner: 'other' })))).not.toBe(base);
  });
});
