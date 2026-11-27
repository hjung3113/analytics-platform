/**
 * Deterministic building blocks for the synthetic datasets (#3204): a seeded PRNG and a content checksum. Pure and
 * runtime-free, so the same seed gives the same rows in Node and in a browser. Neither is cryptographic.
 */

/** FNV-1a 32-bit hash of a string: turns `dataset:version:seed` into the PRNG state. */
export function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** FNV-1a 64-bit hash as 16 hex digits: the dataset checksum, over the canonical JSON of the tables. */
export function checksum64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export type Random = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Index in [0, n): uniform at `skew` 0, increasingly biased toward low indexes as `skew` grows. */
  pick(n: number, skew: number): number;
};

/** Mulberry32 seeded from `seedText`. */
export function createRandom(seedText: string): Random {
  let state = hash32(seedText);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (n, skew) => Math.min(n - 1, Math.floor(n * next() ** (1 + skew))),
  };
}

/** A zero-padded synthetic identifier: `id('R', 7, 6)` → `R-000007`. */
export const id = (prefix: string, n: number, width: number): string => `${prefix}-${String(n).padStart(width, '0')}`;
