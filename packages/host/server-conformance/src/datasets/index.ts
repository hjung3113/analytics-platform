/**
 * Synthetic analysis datasets (#3204): reproducible virtual inputs for the minimal analysis contract tests (#1704) and
 * the engine measurements (#2918), the same logical data for every engine. The same dataset, `version`, seed and
 * parameters give the same rows and checksum. Every row is invented: synthetic identifiers (`R-000001`, `S-0001`,
 * `Q-01`, …), times in a virtual 2030, arbitrary parameter defaults. Real parameters and baselines are injected and
 * kept in-house only (#2974, docs/integration/upstream-feedback-procedure.md §3); never commit them here.
 *
 * Fixed counterexamples come first in every dataset (repeats, unresolved relations, midnight, zero length, missing
 * values, unit differences, late loads, reprocessing, nested and overlapping intervals); random rows follow.
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

/** Every parameter varies on its own; anything not given keeps its default. */
export function generateSyntheticDataset<N extends SyntheticDatasetName>(dataset: N, seed: string, params: Partial<Datasets[N]['params']> = {}): SyntheticDataset<N> {
  const settings = { ...DEFAULTS[dataset], ...params } as Datasets[N]['params'];
  const seedText = `${dataset}:${SYNTHETIC_DATASET_VERSION}:${seed}`;
  const tables = (dataset === 'interval-steps'
    ? generateIntervalSteps(seedText, settings as IntervalStepsParams)
    : generateSharedResource(seedText, settings as SharedResourceParams)) as Datasets[N]['tables'];
  return { dataset, version: SYNTHETIC_DATASET_VERSION, seed, params: settings, tables, checksum: checksum64(JSON.stringify(tables)) };
}
