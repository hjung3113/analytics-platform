/**
 * Independent oracle for the synthetic datasets (#3204): brute-force reference answers written without the generator
 * code, so a generator bug and an oracle bug cannot cancel out. Times are ISO strings; durations are minutes.
 */
import type { EventRow, LinkRow, RunRow, StepRow } from '../../datasets';

const minutes = (startAt: string, endAt: string): number => (Date.parse(endAt) - Date.parse(startAt)) / 60_000;
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** The current row of each run: its highest revision. */
export function currentRuns(runs: RunRow[]): RunRow[] {
  const byId = new Map<string, RunRow>();
  for (const run of runs) if ((byId.get(run.runId)?.revision ?? 0) < run.revision) byId.set(run.runId, run);
  return [...byId.values()];
}

/** Parent total at the parent grain: each current run once. */
export const parentQuantity = (runs: RunRow[]): number => sum(currentRuns(runs).map((run) => run.quantity));

/** The wrong answer a join gives: the run's quantity once per matching step (fan-out), zero for a run without steps. */
export function joinedQuantity(runs: RunRow[], steps: StepRow[]): number {
  const current = new Map(currentRuns(runs).map((run) => [run.runId, run]));
  return sum(steps.map((step) => current.get(step.runId)?.quantity ?? 0));
}

/** Steps whose run exists. */
export const resolvedSteps = (runs: RunRow[], steps: StepRow[]): StepRow[] => steps.filter((step) => runs.some((run) => run.runId === step.runId));

/** Elapsed in seconds whatever the unit; null stays null. */
export const elapsedSeconds = (run: RunRow): number | null => (run.elapsed === null ? null : run.elapsedUnit === 'ms' ? run.elapsed / 1000 : run.elapsed);

/** Links whose event exists. */
export const resolvedLinks = (events: EventRow[], links: LinkRow[]): LinkRow[] => links.filter((link) => events.some((event) => event.eventId === link.eventId));

/** Distinct participating objects (resolved links only). */
export const participantCount = (events: EventRow[], links: LinkRow[]): number => new Set(resolvedLinks(events, links).map((link) => link.objectKey)).size;

/** Sum of interval lengths, overlaps counted twice. */
export const summedMinutes = (intervals: Array<{ startAt: string; endAt: string }>): number => sum(intervals.map((i) => minutes(i.startAt, i.endAt)));

/** Length of the union of the intervals: overlapping time counted once. Brute force over minute marks. */
export function unionMinutes(intervals: Array<{ startAt: string; endAt: string }>): number {
  const covered = new Set<number>();
  for (const { startAt, endAt } of intervals) for (let t = Date.parse(startAt); t < Date.parse(endAt); t += 60_000) covered.add(t);
  return covered.size;
}

/** Time attributed to participants: each resolved link gets its event's whole length. */
export function attributedMinutes(events: EventRow[], links: LinkRow[]): number {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  return sum(resolvedLinks(events, links).map((link) => summedMinutes([byId.get(link.eventId)!])));
}

/** Union minutes per UTC calendar day: an interval crossing midnight counts on both days. */
export function unionMinutesByDay(intervals: Array<{ startAt: string; endAt: string }>): Record<string, number> {
  const days: Record<string, number> = {};
  const covered = new Set<number>();
  for (const { startAt, endAt } of intervals) for (let t = Date.parse(startAt); t < Date.parse(endAt); t += 60_000) covered.add(t);
  for (const t of covered) {
    const day = new Date(t).toISOString().slice(0, 10);
    days[day] = (days[day] ?? 0) + 1;
  }
  return days;
}

/** Nearest-rank quantile of the raw values (`recomputeFromDistribution`). */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!;
}

/** `ratioOfSums`: Σ numerators / Σ denominators. */
export const ratioOfSums = (pairs: Array<[number, number]>): number => sum(pairs.map(([n]) => n)) / sum(pairs.map(([, d]) => d));

/** The wrong recombination: the mean of the parts' ratios, parts with a zero denominator dropped. */
export function meanOfRatios(pairs: Array<[number, number]>): number {
  const ratios = pairs.filter(([, d]) => d !== 0).map(([n, d]) => n / d);
  return sum(ratios) / ratios.length;
}
