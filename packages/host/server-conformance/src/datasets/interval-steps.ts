import { createRandom, id, type Random } from './random';

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
const MINUTES_PER_DAY = 24 * 60;
const DAY = MINUTES_PER_DAY * MINUTE;
const iso = (ms: number): string => new Date(ms).toISOString();

/** A step draft: start, end, amount and whether its run reference is left unresolved. */
type StepDraft = [start: number, end: number, amount: number | null, orphan: boolean];
type Draft = { start: number; end: number | null; subject: number; steps: StepDraft[]; reprocess: boolean; late: boolean; ms: boolean; quantity: number };

/**
 * The fixed counterexamples, runs 1–4 before any random run: a run crossing midnight with steps on both sides, a
 * zero-length run and step, a run without an end (its step names a missing run), a run reprocessed into revision 2
 * and loaded late, two runs of one subject (repeat), and both elapsed units. They use subjects 1–3 whatever
 * `subjects` says.
 */
function counterexamples(): Draft[] {
  const night = BASE + DAY - 30 * MINUTE;
  const plain = { reprocess: false, late: false };
  return [
    { ...plain, start: night, end: night + 60 * MINUTE, subject: 0, ms: true, quantity: 3, steps: [[night, night + 20 * MINUTE, 3, false], [night + 20 * MINUTE, night + 60 * MINUTE, 5, false]] },
    { ...plain, start: BASE + 2 * DAY, end: BASE + 2 * DAY, subject: 1, ms: false, quantity: 7, steps: [[BASE + 2 * DAY, BASE + 2 * DAY, 0, false]] },
    { ...plain, start: BASE + 3 * DAY, end: null, subject: 0, ms: false, quantity: 2, steps: [[BASE + 3 * DAY, BASE + 3 * DAY + 10 * MINUTE, null, true]] },
    { start: BASE + 4 * DAY, end: BASE + 4 * DAY + 90 * MINUTE, subject: 2, ms: false, quantity: 4, reprocess: true, late: true, steps: [[BASE + 4 * DAY, BASE + 4 * DAY + 30 * MINUTE, 2, false]] },
  ];
}

/** One random run from its own stream: every draw happens in a fixed order, so a rate only toggles its own anomaly. */
function randomDraft(random: Random, params: IntervalStepsParams): Draft {
  const start = BASE + random.int(0, params.spanDays * MINUTES_PER_DAY - 1) * MINUTE;
  const length = random.int(1, 240) * MINUTE;
  const missingEnd = random.chance(params.missingEndRate);
  const count = random.int(params.stepsPerRun.min, params.stepsPerRun.max);
  const steps: StepDraft[] = [];
  for (let s = 0, at = start; s < count; s++) {
    const stepLength = random.int(0, Math.max(1, Math.floor(length / MINUTE / count))) * MINUTE;
    const amount = random.int(0, 20);
    const missing = random.chance(params.missingAmountRate);
    steps.push([at, at + stepLength, missing ? null : amount, random.chance(params.unresolvedStepRate)]);
    at += stepLength;
  }
  return {
    start, end: missingEnd ? null : start + length, steps, subject: random.pick(params.subjects, params.skew), reprocess: random.chance(params.reprocessRate),
    late: random.chance(params.lateLoadRate), ms: random.chance(params.millisecondUnitRate), quantity: random.int(1, 9),
  };
}

/**
 * Run by run: run `index` comes from its own stream (`seedText#index`), so it never depends on the runs before it and
 * a caller can stop or batch at any run. Unresolved references point past every run id the dataset uses.
 */
export function* intervalStepsRows(seedText: string, params: IntervalStepsParams): Generator<{ runs: RunRow[]; steps: StepRow[] }> {
  const fixed = counterexamples();
  const orphanBase = Math.max(900_000, params.runs);
  let stepNumber = 0;
  for (let index = 0; index < params.runs; index++) {
    const draft = fixed[index] ?? randomDraft(createRandom(`${seedText}#${index}`), params);
    const runId = id('R', index + 1, 6);
    const elapsed = draft.end === null ? null : (draft.end - draft.start) / (draft.ms ? 1 : 1000);
    const loaded = (draft.end ?? draft.start) + (draft.late ? 3 * DAY : 5 * MINUTE);
    const row = (revision: number, quantity: number, loadedAt: number): RunRow => ({
      runId, revision, subjectKey: id('S', draft.subject + 1, 4), startAt: iso(draft.start), endAt: draft.end === null ? null : iso(draft.end),
      loadedAt: iso(loadedAt), quantity, elapsed, elapsedUnit: draft.ms ? 'ms' : 's',
    });
    const runs = [row(1, draft.quantity, loaded), ...(draft.reprocess ? [row(2, draft.quantity + 1, loaded + DAY)] : [])];
    const steps = draft.steps.map(([start, end, amount, orphan]): StepRow => {
      stepNumber++;
      return { stepId: id('T', stepNumber, 6), runId: orphan ? id('R', orphanBase + stepNumber, 6) : runId, startAt: iso(start), endAt: iso(end), amount };
    });
    yield { runs, steps };
  }
}

export function generateIntervalSteps(seedText: string, params: IntervalStepsParams): { runs: RunRow[]; steps: StepRow[] } {
  const runs: RunRow[] = [];
  const steps: StepRow[] = [];
  for (const part of intervalStepsRows(seedText, params)) {
    runs.push(...part.runs);
    steps.push(...part.steps);
  }
  return { runs, steps };
}
