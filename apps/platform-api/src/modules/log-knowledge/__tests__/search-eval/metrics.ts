// Ranking metrics of the search evaluation (#1508 S-e). Pure. `ranked` is the result list in rank order, `relevant` the ground truth.

export const recallAt = (ranked: readonly string[], relevant: ReadonlySet<string>, k: number): number =>
  relevant.size === 0 ? 1 : ranked.slice(0, k).filter((x) => relevant.has(x)).length / relevant.size;

export const precisionAt = (ranked: readonly string[], relevant: ReadonlySet<string>, k: number): number => {
  const top = ranked.slice(0, k);
  return top.length === 0 ? 0 : top.filter((x) => relevant.has(x)).length / top.length;
};

/** Reciprocal rank of the first relevant result; 0 when none is returned. */
export const reciprocalRank = (ranked: readonly string[], relevant: ReadonlySet<string>): number => {
  const i = ranked.findIndex((x) => relevant.has(x));
  return i < 0 ? 0 : 1 / (i + 1);
};

export interface QueryScore {
  recall20: number;
  precision10: number;
  rr: number;
}

export function scoreQuery(ranked: readonly string[], relevant: readonly string[]): QueryScore {
  const set = new Set(relevant);
  return { recall20: recallAt(ranked, set, 20), precision10: precisionAt(ranked, set, 10), rr: reciprocalRank(ranked, set) };
}

export interface TypeSummary {
  queries: number;
  recall20: number;
  precision10: number;
  mrr: number;
}

export function summarize(scores: readonly QueryScore[]): TypeSummary {
  const mean = (f: (s: QueryScore) => number) => (scores.length === 0 ? 0 : scores.reduce((a, s) => a + f(s), 0) / scores.length);
  return { queries: scores.length, recall20: mean((s) => s.recall20), precision10: mean((s) => s.precision10), mrr: mean((s) => s.rr) };
}

/** Nearest-rank percentile of a list of durations (ms). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] as number;
}
