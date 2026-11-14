import type { AxisRange } from './useRangeBrush';

/**
 * Order-only sequence matching (#1861): time is left out, only the order of the symbols a menu declares counts. The SDK gives
 * symbols no meaning: a menu maps its own items (intervals, states, actions) to a string with `symbol`, and the same symbol
 * string means the same step. Matching is exact (no gaps, no substitutions).
 */

/** One lane's items, already in the lane's order (the caller sorts them). */
export type SequenceLane<T> = { id: string; items: readonly T[] };

/** Options both searches share. */
export type SequenceMatchOptions<T> = {
  /** The step an item stands for; equal strings are the same step. */
  symbol: (item: T) => string;
  /** Treat a run of equal neighbouring symbols as one step (default false: every item is a step). */
  collapseRuns?: boolean;
};

/** One occurrence: `items` are the lane's items from `from` to `to` (inclusive indices into `SequenceLane.items`). */
export type SequenceMatch<T> = { laneId: string; from: number; to: number; items: readonly T[] };

/** A repeated step sequence and its non-overlapping occurrences, in lane order then position. */
export type RepeatedSequence<T> = { steps: readonly string[]; matches: readonly SequenceMatch<T>[] };

export type RepeatedSequenceOptions<T> = SequenceMatchOptions<T> & {
  /** Shortest step sequence reported (default 3, at least 1). */
  minLength?: number;
  /**
   * Longest step sequence indexed (default `SEQUENCE_MAX_LENGTH`). A performance bound only: indexing costs steps × maxLength;
   * a longer repeat is still reported, as its maxLength-step pieces. Raise it when the lanes are short.
   */
  maxLength?: number;
  /** Fewest occurrences a sequence needs (default 2, at least 2). */
  minCount?: number;
};

/** Default `maxLength` of `findRepeatedSequences`: a performance bound, not a domain limit. */
export const SEQUENCE_MAX_LENGTH = 32;

type Step = { symbol: string; from: number; to: number };

function stepsOf<T>(items: readonly T[], symbol: (item: T) => string, collapseRuns: boolean): Step[] {
  const steps: Step[] = [];
  items.forEach((item, index) => {
    const s = symbol(item);
    const last = steps[steps.length - 1];
    if (collapseRuns && last && last.symbol === s) last.to = index;
    else steps.push({ symbol: s, from: index, to: index });
  });
  return steps;
}

function match<T>(lane: SequenceLane<T>, steps: readonly Step[], start: number, length: number): SequenceMatch<T> {
  const from = steps[start].from; const to = steps[start + length - 1].to;
  return { laneId: lane.id, from, to, items: lane.items.slice(from, to + 1) };
}

/**
 * Every place in `lanes` where the steps equal `pattern`, in lane order then position. Occurrences in one lane do not overlap
 * (left to right, the earliest wins). An empty pattern matches nothing. With `collapseRuns`, a run of equal symbols is one step
 * in both the lanes and the pattern, and a match covers the whole runs.
 */
export function findSequenceMatches<T>(lanes: readonly SequenceLane<T>[], pattern: readonly string[], options: SequenceMatchOptions<T>): SequenceMatch<T>[] {
  const collapse = options.collapseRuns ?? false;
  const wanted = collapse ? pattern.filter((s, i) => i === 0 || pattern[i - 1] !== s) : [...pattern];
  if (wanted.length === 0) return [];
  const out: SequenceMatch<T>[] = [];
  for (const lane of lanes) {
    const steps = stepsOf(lane.items, options.symbol, collapse);
    for (let i = 0; i + wanted.length <= steps.length;) {
      let k = 0;
      while (k < wanted.length && steps[i + k].symbol === wanted[k]) k++;
      if (k === wanted.length) { out.push(match(lane, steps, i, k)); i += k; } else i++;
    }
  }
  return out;
}

/** The step symbols of `items` (with `collapseRuns`, one per run): a pattern for `findSequenceMatches`. */
export function sequenceSteps<T>(items: readonly T[], options: SequenceMatchOptions<T>): string[] {
  return stepsOf(items, options.symbol, options.collapseRuns ?? false).map(s => s.symbol);
}

/**
 * The items lying wholly inside `range` (inclusive), in their given order: the bridge from a `useRangeBrush` range to a pattern.
 * `span` gives an item's `[start, end]` on the same axis as the range (epoch ms or order positions).
 */
export function itemsInRange<T>(items: readonly T[], range: AxisRange, span: (item: T) => readonly [number, number]): T[] {
  const [lo, hi] = range[0] <= range[1] ? range : [range[1], range[0]];
  return items.filter(item => { const [s, e] = span(item); return s >= lo && e <= hi; });
}

/**
 * Step sequences of `minLength`…`maxLength` steps that occur at least `minCount` times (non-overlapping, across all lanes).
 * Only maximal ones are kept: a sequence is dropped when each of its occurrences lies inside an occurrence of a longer reported
 * sequence with the same number of occurrences. Sorted by steps (longest first), then occurrences (most first), then first occurrence.
 */
export function findRepeatedSequences<T>(lanes: readonly SequenceLane<T>[], options: RepeatedSequenceOptions<T>): RepeatedSequence<T>[] {
  const collapse = options.collapseRuns ?? false;
  const minLength = Math.max(1, Math.floor(options.minLength ?? 3));
  const maxLength = Math.max(minLength, Math.floor(options.maxLength ?? SEQUENCE_MAX_LENGTH));
  const minCount = Math.max(2, Math.floor(options.minCount ?? 2));
  const ids = new Map<string, number>();
  const laneSteps = lanes.map(lane => {
    const steps = stepsOf(lane.items, options.symbol, collapse);
    return { lane, steps, codes: steps.map(s => { let id = ids.get(s.symbol); if (id === undefined) { id = ids.size; ids.set(s.symbol, id); } return id; }) };
  });
  // key → occurrences as [lane index, step start]; a key is the step codes joined, so equal keys are equal step sequences.
  type Group = { length: number; at: [number, number][]; lastEnd: number[] };
  const groups = new Map<string, Group>();
  laneSteps.forEach(({ codes }, l) => {
    for (let i = 0; i < codes.length; i++) {
      let key = '';
      for (let len = 1; len <= maxLength && i + len <= codes.length; len++) {
        key += (len > 1 ? ',' : '') + codes[i + len - 1];
        if (len < minLength) continue;
        let g = groups.get(key);
        if (!g) { g = { length: len, at: [], lastEnd: [] }; groups.set(key, g); }
        // Non-overlapping, left to right: starts arrive in increasing order per lane.
        if ((g.lastEnd[l] ?? -1) < i) { g.at.push([l, i]); g.lastEnd[l] = i + len - 1; }
      }
    }
  });
  const kept = [...groups.values()].filter(g => g.at.length >= minCount)
    .sort((a, b) => b.length - a.length || b.at.length - a.at.length || a.at[0][0] - b.at[0][0] || a.at[0][1] - b.at[0][1]);
  // Every sub-window of a kept occurrence → the occurrence counts of the kept groups holding it, so a shorter group tests
  // cover with one lookup per occurrence.
  const covers = new Map<string, Set<number>>();
  const result: Group[] = [];
  for (const g of kept) {
    if (g.at.every(([l, i]) => covers.get(`${l}:${i}:${g.length}`)?.has(g.at.length))) continue;
    for (const [l, i] of g.at) for (let s = i; s < i + g.length; s++) for (let e = s + minLength; e <= i + g.length; e++) {
      const key = `${l}:${s}:${e - s}`;
      const counts = covers.get(key);
      if (counts) counts.add(g.at.length); else covers.set(key, new Set([g.at.length]));
    }
    result.push(g);
  }
  return result.map(g => {
    const { steps } = laneSteps[g.at[0][0]];
    return {
      steps: steps.slice(g.at[0][1], g.at[0][1] + g.length).map(s => s.symbol),
      matches: g.at.map(([l, i]) => match(laneSteps[l].lane, laneSteps[l].steps, i, g.length)),
    };
  });
}
