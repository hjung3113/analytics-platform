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

/**
 * Incremental FNV-1a 64 over UTF-16 code units, in four 16-bit limbs (no BigInt, so a million rows hash in seconds).
 * A change detector for the dataset checksum, not a security hash.
 */
export function createChecksum(): { update(text: string): void; digest(): string } {
  // Offset basis 0xcbf29ce484222325, low limb first.
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  return {
    update(text) {
      for (let i = 0; i < text.length; i++) {
        h0 ^= text.charCodeAt(i);
        // × 0x100000001b3 mod 2^64 = × 0x1b3 plus a 40-bit left shift (limbs 0 and 1 move 8 bits into limbs 2 and 3).
        const t0 = h0 * 0x1b3;
        const t1 = h1 * 0x1b3 + (t0 >>> 16);
        const t2 = h2 * 0x1b3 + (h0 << 8) + (t1 >>> 16);
        const t3 = h3 * 0x1b3 + (h1 << 8) + (t2 >>> 16);
        h0 = t0 & 0xffff; h1 = t1 & 0xffff; h2 = t2 & 0xffff; h3 = t3 & 0xffff;
      }
    },
    digest: () => [h3, h2, h1, h0].map((limb) => limb.toString(16).padStart(4, '0')).join(''),
  };
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
