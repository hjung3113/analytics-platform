import { describe, expect, it } from 'vitest';
import { evidenceStateRows } from '../domain/evidence-states.js';

const ref = { fileRef: 'synthetic/file.log', line: 12, fileSha256: 'a'.repeat(64) };
const files = [{ fileRef: ref.fileRef, sha256: ref.fileSha256 }];

describe('evidence state projection', () => {
  it.each([
    [false, undefined, 'not_submitted'],
    [true, { evidenceIndex: 0, deletedAt: null }, 'not_loaded'],
    [true, { evidenceIndex: 0, deletedAt: new Date() }, 'unknown'],
    [true, undefined, 'unknown'],
  ] as const)('projects submitted=%s and metadata=%s as %s', (hasExcerpt, metadata, state) => {
    expect(evidenceStateRows('result', [{ ...ref, hasExcerpt }], files, true, metadata ? [metadata] : [])[0]?.excerptState).toBe(state);
  });

  it('keeps duplicate evidence indices and emits only the declared reference fields', () => {
    const rows = evidenceStateRows('result', [{ ...ref, hasExcerpt: true }, { ...ref, hasExcerpt: false }], files, true, [{ evidenceIndex: 0, deletedAt: null }]);
    expect(rows).toEqual([
      { ruleResultId: 'result', evidenceIndex: 0, evidenceRef: ref, excerptState: 'not_loaded', sourceState: 'not_checked' },
      { ruleResultId: 'result', evidenceIndex: 1, evidenceRef: ref, excerptState: 'not_submitted', sourceState: 'not_checked' },
    ]);
  });

  it('reveals only missing permission for submitted excerpts and sources without the right', () => {
    expect(evidenceStateRows('result', [{ ...ref, hasExcerpt: true }, { ...ref, hasExcerpt: false }], files, false, []).map(({ excerptState, sourceState }) => [excerptState, sourceState]))
      .toEqual([['no_permission', 'no_permission'], ['not_submitted', 'no_permission']]);
  });

  it.each([
    [files, 'not_checked'],
    [[], 'not_checked'],
    [[{ fileRef: 'other', sha256: 'b'.repeat(64) }], 'not_checked'],
    [[{ fileRef: ref.fileRef, sha256: 'b'.repeat(64) }], 'hash_mismatch'],
  ])('uses only the same-file manifest hash, otherwise leaves Source unchecked', (manifest, state) => {
    expect(evidenceStateRows('result', [{ ...ref, hasExcerpt: false }], manifest, true, [])[0]?.sourceState).toBe(state);
  });
});
