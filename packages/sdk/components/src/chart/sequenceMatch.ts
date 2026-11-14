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
  /** Shortest step sequence reported (default 3, at least 1; a non-finite value means the default, as for the other two). */
  minLength?: number;
  /**
   * Longest step sequence reported (default `SEQUENCE_MAX_LENGTH`). A performance bound only: the work is at most
   * steps × maxLength. A longer repeat comes back as every maxLength-step window of it (overlapping windows, each its own result).
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

/** A finite option rounded down and clamped to `min`; anything else falls back to `fallback`. */
function count(value: number | undefined, fallback: number, min: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(min, Math.floor(value)) : fallback;
}

/**
 * Step sequences of `minLength`…`maxLength` steps that occur at least `minCount` times (non-overlapping, across all lanes).
 * Only maximal ones are kept: a sequence is dropped when one longer reported sequence with the same number of occurrences holds
 * every one of its occurrences. Sorted by steps (longest first), then occurrences (most first), then first occurrence.
 *
 * Sequences grow one step at a time and only while they still occur `minCount` times, so the work follows the repeats found,
 * at most steps × maxLength.
 */
export function findRepeatedSequences<T>(lanes: readonly SequenceLane<T>[], options: RepeatedSequenceOptions<T>): RepeatedSequence<T>[] {
  const collapse = options.collapseRuns ?? false;
  const minLength = count(options.minLength, 3, 1);
  const maxLength = Math.max(minLength, count(options.maxLength, SEQUENCE_MAX_LENGTH, 1));
  const minCount = count(options.minCount, 2, 2);
  // All lanes in one code array, each lane followed by -1, so a position is one number and no sequence crosses a lane end.
  const ids = new Map<string, number>();
  const codes: number[] = []; const at: [number, number][] = [];
  const laneSteps = lanes.map((lane, l) => {
    const steps = stepsOf(lane.items, options.symbol, collapse);
    steps.forEach((s, k) => {
      let id = ids.get(s.symbol);
      if (id === undefined) { id = ids.size; ids.set(s.symbol, id); }
      codes.push(id); at.push([l, k]);
    });
    codes.push(-1); at.push([l, -1]);
    return { lane, steps };
  });
  /** The greedy non-overlapping starts (the most there can be for equal lengths), from ascending starts. */
  const apart = (starts: readonly number[], length: number) => {
    const kept: number[] = []; let end = -1;
    for (const p of starts) if (p > end) { kept.push(p); end = p + length - 1; }
    return kept;
  };
  type Found = { length: number; starts: number[] };
  const found: Found[] = [];
  // A longer sequence never occurs apart more often than its prefix, so a level keeps only prefixes that still can repeat.
  const first = new Map<number, number[]>();
  codes.forEach((c, p) => { if (c >= 0) { const list = first.get(c); if (list) list.push(p); else first.set(c, [p]); } });
  let level = [...first.values()];
  for (let length = 1; level.length > 0; length++) {
    const next: number[][] = [];
    for (const starts of level) {
      const kept = apart(starts, length);
      if (kept.length < minCount) continue;
      if (length >= minLength) found.push({ length, starts: kept });
      if (length === maxLength) continue;
      const grown = new Map<number, number[]>();
      for (const p of starts) {
        const c = codes[p + length];
        if (c < 0) continue;
        const list = grown.get(c); if (list) list.push(p); else grown.set(c, [p]);
      }
      for (const list of grown.values()) if (list.length >= minCount) next.push(list);
    }
    level = next;
  }
  found.sort((a, b) => b.length - a.length || b.starts.length - a.starts.length || a.starts[0] - b.starts[0]);
  // Kept sequences by each occurrence start, and each kept sequence's start set, to test cover by one sequence.
  const byStart = new Map<number, Found[]>();
  const startSets = new Map<Found, Set<number>>();
  const holds = (outer: Found, q: number, length: number) => {
    const set = startSets.get(outer)!;
    for (let s = Math.max(0, q + length - outer.length); s <= q; s++) if (set.has(s)) return true;
    return false;
  };
  const kept: Found[] = [];
  for (const g of found) {
    const p0 = g.starts[0];
    let covered = false;
    for (let s = Math.max(0, p0 + g.length - maxLength); s <= p0 && !covered; s++) {
      for (const outer of byStart.get(s) ?? []) {
        if (outer.length <= g.length || outer.starts.length !== g.starts.length || s + outer.length < p0 + g.length) continue;
        if (g.starts.every(q => holds(outer, q, g.length))) { covered = true; break; }
      }
    }
    if (covered) continue;
    kept.push(g);
    startSets.set(g, new Set(g.starts));
    for (const s of g.starts) { const list = byStart.get(s); if (list) list.push(g); else byStart.set(s, [g]); }
  }
  return kept.map(g => {
    const [l0, k0] = at[g.starts[0]];
    return {
      steps: laneSteps[l0].steps.slice(k0, k0 + g.length).map(s => s.symbol),
      matches: g.starts.map(p => { const [l, k] = at[p]; return match(laneSteps[l].lane, laneSteps[l].steps, k, g.length); }),
    };
  });
}
