import { createRandom, id } from './random';

/**
 * `interval-steps`: virtual parent intervals (runs) with child steps, 1:N (#3204). Generic counterexamples only; no
 * real schema, name or distribution. Grains: a run row is one (runId, revision); the current row of a run is its
 * highest revision. A step row is one step and names its run by `runId`, which may not exist (an unresolved relation).
 */
export type RunRow = {
  runId: string;
  revision: number;
  /** Synthetic business key; several runs share one (a repeated occurrence). */
  subjectKey: string;
  startAt: string;
  /** null: the run has no end yet. */
  endAt: string | null;
  /** When the row was loaded; a late completion or a reprocessed revision loads long after its end. */
  loadedAt: string;
  /** Additive count measure of the run itself (`sum`). */
  quantity: number;
  /** Elapsed time in `elapsedUnit`: the same quantity arrives in seconds or milliseconds. */
  elapsed: number | null;
  elapsedUnit: 's' | 'ms';
};

export type StepRow = {
  stepId: string;
  runId: string;
  startAt: string;
  endAt: string;
  /** Additive measure of the step; null when missing. */
  amount: number | null;
};

export type IntervalStepsParams = {
  runs: number;
  subjects: number;
  stepsPerRun: { min: number; max: number };
  /** Bias of subject choice toward a few subjects (0 = uniform). */
  skew: number;
  unresolvedStepRate: number;
  missingEndRate: number;
  missingAmountRate: number;
  reprocessRate: number;
  lateLoadRate: number;
  millisecondUnitRate: number;
  spanDays: number;
};

/** Arbitrary test values, not measured from any real system. */
export const INTERVAL_STEPS_DEFAULTS: IntervalStepsParams = {
  runs: 40, subjects: 8, stepsPerRun: { min: 0, max: 4 }, skew: 1, unresolvedStepRate: 0.05, missingEndRate: 0.05,
  missingAmountRate: 0.1, reprocessRate: 0.1, lateLoadRate: 0.1, millisecondUnitRate: 0.3, spanDays: 7,
};

const BASE = Date.UTC(2030, 0, 1);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number): string => new Date(ms).toISOString();

/** A step draft: start, end, amount and whether its run reference is left unresolved. */
type StepDraft = [start: number, end: number, amount: number | null, orphan?: boolean];
type Draft = { start: number; end: number | null; subject: number; steps: StepDraft[]; reprocess: boolean; late: boolean };

/**
 * The fixed counterexamples, before any random run: a run crossing midnight with steps on both sides, a zero-length
 * run and step, a run without an end (its step names a missing run), a run reprocessed into revision 2 and loaded
 * late, and two runs of one subject (repeat).
 */
function counterexamples(): Draft[] {
  const night = BASE + DAY - 30 * MINUTE;
  return [
    { start: night, end: night + 60 * MINUTE, subject: 0, steps: [[night, night + 20 * MINUTE, 3], [night + 20 * MINUTE, night + 60 * MINUTE, 5]], reprocess: false, late: false },
    { start: BASE + 2 * DAY, end: BASE + 2 * DAY, subject: 1, steps: [[BASE + 2 * DAY, BASE + 2 * DAY, 0]], reprocess: false, late: false },
    { start: BASE + 3 * DAY, end: null, subject: 0, steps: [[BASE + 3 * DAY, BASE + 3 * DAY + 10 * MINUTE, null, true]], reprocess: false, late: false },
    { start: BASE + 4 * DAY, end: BASE + 4 * DAY + 90 * MINUTE, subject: 2, steps: [[BASE + 4 * DAY, BASE + 4 * DAY + 30 * MINUTE, 2]], reprocess: true, late: true },
  ];
}

export function generateIntervalSteps(seedText: string, params: IntervalStepsParams): { runs: RunRow[]; steps: StepRow[] } {
  const random = createRandom(seedText);
  const drafts = counterexamples();
  for (let i = drafts.length; i < params.runs; i++) {
    const start = BASE + random.int(0, params.spanDays * DAY - 1);
    const length = random.int(1, 240) * MINUTE;
    const end = random.chance(params.missingEndRate) ? null : start + length;
    const count = random.int(params.stepsPerRun.min, params.stepsPerRun.max);
    const steps: StepDraft[] = [];
    for (let s = 0, at = start; s < count; s++) {
      const stepLength = random.int(0, Math.max(1, Math.floor(length / MINUTE / Math.max(1, count)))) * MINUTE;
      steps.push([at, at + stepLength, random.chance(params.missingAmountRate) ? null : random.int(0, 20), random.chance(params.unresolvedStepRate)]);
      at += stepLength;
    }
    drafts.push({ start, end, subject: random.pick(params.subjects, params.skew), steps, reprocess: random.chance(params.reprocessRate), late: random.chance(params.lateLoadRate) });
  }
  const runs: RunRow[] = [];
  const steps: StepRow[] = [];
  drafts.slice(0, params.runs).forEach((draft, index) => {
    const runId = id('R', index + 1, 6);
    const subjectKey = id('S', draft.subject + 1, 4);
    const ms = random.chance(params.millisecondUnitRate);
    const elapsed = draft.end === null ? null : (draft.end - draft.start) / (ms ? 1 : 1000);
    const loaded = (draft.end ?? draft.start) + (draft.late ? 3 * DAY : 5 * MINUTE);
    const quantity = random.int(1, 9);
    const row = (revision: number, quantity: number, loadedAt: number): RunRow => ({
      runId, revision, subjectKey, startAt: iso(draft.start), endAt: draft.end === null ? null : iso(draft.end), loadedAt: iso(loadedAt), quantity, elapsed, elapsedUnit: ms ? 'ms' : 's',
    });
    runs.push(row(1, quantity, loaded));
    if (draft.reprocess) runs.push(row(2, quantity + 1, loaded + DAY));
    for (const [start, end, amount, orphan] of draft.steps) {
      // An unresolved reference points into a range no run id uses.
      steps.push({ stepId: id('T', steps.length + 1, 6), runId: orphan ? id('R', 900_000 + steps.length + 1, 6) : runId, startAt: iso(start), endAt: iso(end), amount });
    }
  });
  return { runs, steps };
}
