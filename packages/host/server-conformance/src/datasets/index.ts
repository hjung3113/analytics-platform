/**
 * Synthetic analysis datasets (#3204): reproducible virtual inputs for the minimal analysis contract tests (#1704) and
 * the engine measurements (#2918), the same logical data for every engine. The same dataset, `version`, seed and
 * parameters give the same rows and checksum. Every row is invented: synthetic identifiers (`R-000001`, `S-0001`,
 * `Q-01`, …), times in a virtual 2030, arbitrary parameter defaults. Real parameters and baselines are injected and
 * kept in-house only (#2974, docs/integration/upstream-feedback-procedure.md §3); never commit them here.
 *
 * Fixed counterexamples come first in every dataset (repeats, unresolved relations, midnight, zero length, missing
 * values, unit differences, late loads, reprocessing, nested and overlapping intervals); random rows follow. Times
 * fall on whole minutes. Each parent row comes from its own stream (`…#index`), so a bounded-memory batch API can
 * yield the same rows later (#3204 slice 2) without changing them.
 */
import { generateIntervalSteps, INTERVAL_STEPS_DEFAULTS, type IntervalStepsParams, type RunRow, type StepRow } from './interval-steps';
import { checksum64 } from './random';
import { generateSharedResource, SHARED_RESOURCE_DEFAULTS, type EventRow, type LinkRow, type SharedResourceParams } from './shared-resource';

export type { EventRow, IntervalStepsParams, LinkRow, RunRow, SharedResourceParams, StepRow };
export { INTERVAL_STEPS_DEFAULTS, SHARED_RESOURCE_DEFAULTS };

/** Bumped whenever the same inputs would give different rows; a golden fixture records the version it was made with. */
export const SYNTHETIC_DATASET_VERSION = 1;

type Datasets = {
  'interval-steps': { params: IntervalStepsParams; tables: { runs: RunRow[]; steps: StepRow[] } };
  'shared-resource': { params: SharedResourceParams; tables: { events: EventRow[]; links: LinkRow[] } };
};
export type SyntheticDatasetName = keyof Datasets;

export type SyntheticDataset<N extends SyntheticDatasetName = SyntheticDatasetName> = {
  dataset: N;
  version: number;
  seed: string;
  params: Datasets[N]['params'];
  tables: Datasets[N]['tables'];
  /** FNV-1a 64 of the tables' canonical JSON; a change detector, not a security hash. */
  checksum: string;
};

const DEFAULTS: { [N in SyntheticDatasetName]: Datasets[N]['params'] } = { 'interval-steps': INTERVAL_STEPS_DEFAULTS, 'shared-resource': SHARED_RESOURCE_DEFAULTS };

/** Counts that must be at least this; every other number is a rate in [0, 1], `skew` (≥ 0) or a `{ min, max }` range. */
const LEAST: Record<string, number> = { runs: 0, events: 0, subjects: 1, resources: 1, objects: 1, spanDays: 1 };

/** Throws a RangeError naming the first parameter outside its domain, before any row is made. */
function validate(params: Record<string, unknown>): void {
  const fail = (key: string, value: unknown, rule: string): never => { throw new RangeError(`synthetic dataset parameter ${key}=${JSON.stringify(value)}: ${rule}`); };
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'object' && value !== null) {
      const { min, max } = value as { min: number; max: number };
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) fail(key, value, 'needs integers 0 ≤ min ≤ max');
    } else if (key in LEAST) {
      if (!Number.isInteger(value) || (value as number) < LEAST[key]!) fail(key, value, `needs an integer ≥ ${LEAST[key]}`);
    } else if (key === 'skew') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(key, value, 'needs a finite number ≥ 0');
    } else if (typeof value !== 'number' || !(value >= 0 && value <= 1)) fail(key, value, 'needs a rate in [0, 1]');
  }
}

/** Every parameter varies on its own; anything not given keeps its default. Row `n` depends only on the seed and the parameters, never on rows before it. */
export function generateSyntheticDataset<N extends SyntheticDatasetName>(dataset: N, seed: string, params: Partial<Datasets[N]['params']> = {}): SyntheticDataset<N> {
  const settings = { ...DEFAULTS[dataset], ...params } as Datasets[N]['params'];
  validate(settings);
  const seedText = `${dataset}:${SYNTHETIC_DATASET_VERSION}:${seed}`;
  const tables = (dataset === 'interval-steps'
    ? generateIntervalSteps(seedText, settings as IntervalStepsParams)
    : generateSharedResource(seedText, settings as SharedResourceParams)) as Datasets[N]['tables'];
  return { dataset, version: SYNTHETIC_DATASET_VERSION, seed, params: settings, tables, checksum: checksum64(JSON.stringify(tables)) };
}
