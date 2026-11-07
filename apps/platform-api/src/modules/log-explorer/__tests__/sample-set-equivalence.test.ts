// The log-explorer sample set (@ap/contract-schemas) must refuse what the lifecycle contract refuses (design §3.2 delegates the shape
// to log-lifecycle). The schema is stricter in exactly one way: it refuses an untrimmed identifier where lifecycle trims it.
import { sourceSampleSetSchema } from '@ap/contract-schemas';
import { describe, expect, it } from 'vitest';

import { parseSampleSet } from '../../log-lifecycle/domain/sample-set.js';
import { createSyntheticScenario } from '../adapters/synthetic/index.js';

const sha = 'a'.repeat(64);
const file = (fileRef: string, order: number) => ({ fileRef, order, sha256: sha });
const set = (files: unknown[], sourceOwner = 'o') => ({ sourceOwner, files });

describe('sample set: lifecycle equivalence', () => {
  it.each([
    ['one file', set([file('a', 1)])],
    ['files in confirmed order', set([file('b', 2), file('a', 1)])],
    ['order 0', set([file('a', 0)])],
    ['order beyond n', set([file('a', 2)])],
    ['duplicate order', set([file('a', 1), file('b', 1)])],
    ['duplicate file ref', set([file('a', 1), file('a', 2)])],
    ['empty file list', set([])],
    ['control character', set([file('a\u0007', 1)])],
    ['NUL owner', set([file('a', 1)], 'o\u0000')],
    ['lone surrogate', set([file('a\ud800', 1)])],
    ['blank file ref', set([file('  ', 1)])],
    ['blank owner', set([file('a', 1)], '  ')],
    ['bad sha', set([{ fileRef: 'a', order: 1, sha256: 'zz' }])],
    ['unknown key', { ...set([file('a', 1)]), extra: 1 }],
    ['1024 astral code points', set([file('😀'.repeat(1024), 1)])],
    ['1025 code points', set([file('a'.repeat(1025), 1)])],
  ])('agrees with parseSampleSet: %s', (_name, input) => {
    expect(sourceSampleSetSchema.safeParse(input).success).toBe(parseSampleSet(input).ok);
  });
  it('differs only by refusing, not trimming, an untrimmed identifier', () => {
    const input = set([file(' a ', 1)]);
    expect(parseSampleSet(input).ok).toBe(true);
    expect(sourceSampleSetSchema.safeParse(input).success).toBe(false);
  });
  it('every synthetic scenario builds a sample set the lifecycle contract accepts', () => {
    for (const name of ['typical', 'many_rows', 'long_line', 'partial', 'time_reversal'] as const) {
      const { sampleSet } = createSyntheticScenario(name);
      expect(parseSampleSet(sampleSet).ok).toBe(true);
      expect(sourceSampleSetSchema.safeParse(sampleSet).success).toBe(true);
    }
  });
});
