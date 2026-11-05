// Similarity PROPOSALS between spec targets of different models (#1196 e, design v0.6 §15.4). Pure and DB-free.
// A score is evidence for a human reviewer, never a verdict: the output is flagged `proposal`, is never stored as
// confirmed and is never read by an equivalence lookup. Same name never implies same concept — an identical name
// scores 1 and is still only a proposal. Basis (closed): `name_trgm` (trigram Jaccard of normalised names) and, for
// events, `field_overlap` (Jaccard of normalised field names).

export const SIMILARITY_MIN_SCORE = 0.5;
export const NAME_WEIGHT = 0.6;
export const FIELD_WEIGHT = 0.4;

export interface SimilarityBasis {
  name_trgm: number;
  field_overlap?: number;
}

/** Letters and digits of any script, lower case, NFKC; every other run is dropped (`Spindle-Start`, `spindle start`, `SpindleStart` coincide). */
export function normalizeName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Trigram similarity of two display names (0 when either normalises to nothing). */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === '' || y === '') return 0;
  return x === y ? 1 : jaccard(trigrams(x), trigrams(y));
}

/** Overlap of two field-name lists; null when either side has no field (nothing to compare). */
export function fieldOverlap(a: readonly string[], b: readonly string[]): number | null {
  const x = new Set(a.map(normalizeName).filter((n) => n !== ''));
  const y = new Set(b.map(normalizeName).filter((n) => n !== ''));
  if (x.size === 0 || y.size === 0) return null;
  return jaccard(x, y);
}

export interface SimilarityTarget {
  name: string;
  /** Field names of an event; empty for a module. */
  fields: readonly string[];
}

export function scoreTargets(a: SimilarityTarget, b: SimilarityTarget): { score: number; basis: SimilarityBasis } {
  const name = nameSimilarity(a.name, b.name);
  const overlap = fieldOverlap(a.fields, b.fields);
  const score = overlap === null ? name : name * NAME_WEIGHT + overlap * FIELD_WEIGHT;
  return {
    score: round3(score),
    basis: overlap === null ? { name_trgm: round3(name) } : { name_trgm: round3(name), field_overlap: round3(overlap) },
  };
}
