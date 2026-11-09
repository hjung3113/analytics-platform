// DB-free checks of the evaluation set itself (#1508 S-e): deterministic, ground truth consistent, metrics correct.

import { describe, expect, it } from 'vitest';

import { QUERY_TYPES, buildCorpus } from './corpus.js';
import { percentile, precisionAt, recallAt, reciprocalRank, scoreQuery } from './metrics.js';

describe('search evaluation corpus (#1508 S-e)', () => {
  const corpus = buildCorpus({ fillerItems: 200 });

  it('is deterministic', () => {
    expect(buildCorpus({ fillerItems: 200 })).toEqual(corpus);
    expect(buildCorpus({ fillerItems: 200, seed: 7 }).items.length).toBe(corpus.items.length);
  });

  it('covers every query type, or states why one is skipped', () => {
    const present = new Set(corpus.queries.map((q) => q.type));
    const skipped = new Set(corpus.skipped.map((s) => s.type));
    for (const type of QUERY_TYPES) expect(present.has(type) || skipped.has(type), type).toBe(true);
  });

  it('points every query at existing Items and gives it ground truth', () => {
    const keys = new Set(corpus.items.map((i) => i.key));
    expect(new Set(corpus.queries.map((q) => q.id)).size).toBe(corpus.queries.length);
    for (const q of corpus.queries) {
      expect(q.relevant.length, q.id).toBeGreaterThan(0);
      for (const k of [...q.relevant, ...(q.otherDirection ?? []), ...(q.otherKind ?? [])]) expect(keys.has(k), `${q.id} ${k}`).toBe(true);
    }
  });

  it('keeps the two directions apart in the ground truth', () => {
    const fwd = corpus.queries.find((q) => q.id === 'dir-fwd-0-0');
    const rev = corpus.queries.find((q) => q.id === 'dir-rev-0-0');
    expect(fwd && rev).toBeTruthy();
    const onlyReverse = new Set(fwd?.otherDirection);
    expect(onlyReverse.size).toBeGreaterThan(0);
    for (const k of fwd?.relevant ?? []) expect(onlyReverse.has(k)).toBe(false);
    for (const k of rev?.otherDirection ?? []) expect(rev?.relevant.includes(k)).toBe(false);
  });

  it('filler never carries a probe word', () => {
    const probeWords = ['lotmismatch', 'calibration', 'interlock', '압력센서', 'step_process', 'oven_temp'];
    const filler = corpus.items.slice(-200);
    for (const item of filler) for (const w of probeWords) expect(`${item.title} ${item.observation}`.toLowerCase().includes(w)).toBe(false);
  });
});

describe('ranking metrics', () => {
  const relevant = new Set(['a', 'b', 'c']);
  it('computes recall, precision and reciprocal rank', () => {
    expect(recallAt(['x', 'a', 'b'], relevant, 20)).toBeCloseTo(2 / 3);
    expect(precisionAt(['x', 'a', 'b'], relevant, 10)).toBeCloseTo(2 / 10);
    expect(precisionAt(['a', 'b', 'c', 'x'], relevant, 4)).toBeCloseTo(3 / 4);
    expect(reciprocalRank(['x', 'y', 'c'], relevant)).toBeCloseTo(1 / 3);
    expect(reciprocalRank(['x'], relevant)).toBe(0);
    expect(scoreQuery([], ['a'])).toEqual({ recall20: 0, precision10: 0, rr: 0 });
  });
  it('cuts at k and takes nearest-rank percentiles', () => {
    expect(recallAt(['x', 'a'], relevant, 1)).toBe(0);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });
});
