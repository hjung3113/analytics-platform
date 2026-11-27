/**
 * Synthetic analysis datasets (#3204): reproducible virtual inputs for the minimal analysis contract tests (#1704) and
 * the engine measurements (#2918), the same logical data for every engine. The same dataset, `version`, seed and
 * parameters give the same rows and checksum. Every row is invented: synthetic identifiers (`R-000001`, `S-0001`,
 * `Q-01`, …), times in a virtual 2030, arbitrary parameter defaults. Real parameters and baselines are injected and
 * kept in-house only (#2974, docs/integration/upstream-feedback-procedure.md §3); never commit them here.
 *
 * Fixed counterexamples come first in every dataset (repeats, unresolved relations, midnight, zero length, missing
 * values, unit differences, late loads, reprocessing, nested and overlapping intervals); random rows follow. Times
 * fall on whole minutes. Each parent row comes from its own stream (`…#index`): `streamSyntheticDataset` yields the
 * same rows in batches with bounded memory, and `generateSyntheticDataset` collects that stream.
 */
export type { EventRow, LinkRow, SharedResourceParams } from './shared-resource';
export type { IntervalStepsParams, RunRow, StepRow } from './interval-steps';
export { INTERVAL_STEPS_DEFAULTS } from './interval-steps';
export { SHARED_RESOURCE_DEFAULTS } from './shared-resource';
export {
  generateSyntheticDataset, streamSyntheticDataset, SYNTHETIC_DATASET_VERSION, SYNTHETIC_TABLES, type SyntheticDataset, type SyntheticDatasetName, type SyntheticDatasetStream,
} from './dataset';
export { SYNTHETIC_WORKLOAD_PROFILES, writeSyntheticWorkload, type SyntheticWorkloadFormat, type SyntheticWorkloadSink } from './workload';
