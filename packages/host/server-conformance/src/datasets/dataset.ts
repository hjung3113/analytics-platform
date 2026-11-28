/** Dataset core (#3204): parameter validation, the batch stream and the in-memory collection. Overview in `index.ts`. */
import { INTERVAL_STEPS_DEFAULTS, intervalStepsRows, type IntervalStepsParams, type RunRow, type StepRow } from './interval-steps';
import { createChecksum } from './random';
import { SHARED_RESOURCE_DEFAULTS, sharedResourceRows, type EventRow, type LinkRow, type SharedResourceParams } from './shared-resource';

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
  checksum: string;
};

type Tables<N extends SyntheticDatasetName> = Datasets[N]['tables'];
/** Table names in their fixed order (the checksum and the files follow it). */
export const SYNTHETIC_TABLES: { [N in SyntheticDatasetName]: Array<keyof Tables<N> & string> } = { 'interval-steps': ['runs', 'steps'], 'shared-resource': ['events', 'links'] };

export type SyntheticDatasetStream<N extends SyntheticDatasetName = SyntheticDatasetName> = Omit<SyntheticDataset<N>, 'tables' | 'checksum'> & {
  /** Batches of up to `batchParents` parent rows with their child rows; iterate once. */
  batches: Iterable<Tables<N>>;
  /**
   * Row counts and the checksum, available once `batches` is exhausted. The checksum is FNV-1a 64 over
   * `<table>:<FNV-1a 64 of the table's rows as JSON lines>` lines, in table order; a change detector, not a security hash.
   */
  summary(): { rows: Record<string, number>; checksum: string };
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
export function streamSyntheticDataset<N extends SyntheticDatasetName>(dataset: N, seed: string, params: Partial<Datasets[N]['params']> = {}, { batchParents = 10_000 } = {}): SyntheticDatasetStream<N> {
  if (!Number.isInteger(batchParents) || batchParents < 1) throw new RangeError(`batchParents=${batchParents}: needs an integer ≥ 1`);
  const settings = { ...DEFAULTS[dataset], ...params } as Datasets[N]['params'];
  validate(settings);
  const seedText = `${dataset}:${SYNTHETIC_DATASET_VERSION}:${seed}`;
  const names = SYNTHETIC_TABLES[dataset] as string[];
  const sums = names.map(() => createChecksum());
  const rows: Record<string, number> = Object.fromEntries(names.map((name) => [name, 0]));
  let done = false;
  const parts = (dataset === 'interval-steps' ? intervalStepsRows(seedText, settings as IntervalStepsParams) : sharedResourceRows(seedText, settings as SharedResourceParams)) as Iterable<Record<string, unknown[]>>;
  function* batches(): Generator<Tables<N>> {
    let batch = Object.fromEntries(names.map((name) => [name, [] as unknown[]]));
    let parents = 0;
    const flush = (): Tables<N> => {
      names.forEach((name, i) => { for (const row of batch[name]!) sums[i]!.update(`${JSON.stringify(row)}\n`); rows[name]! += batch[name]!.length; });
      const out = batch as Tables<N>;
      batch = Object.fromEntries(names.map((name) => [name, [] as unknown[]]));
      parents = 0;
      return out;
    };
    for (const part of parts) {
      for (const name of names) batch[name]!.push(...part[name]!);
      if (++parents === batchParents) yield flush();
    }
    if (parents > 0) yield flush();
    done = true;
  }
  return {
    dataset, version: SYNTHETIC_DATASET_VERSION, seed, params: settings, batches: { [Symbol.iterator]: batches },
    summary() {
      if (!done) throw new Error('summary() before the batches were exhausted');
      const total = createChecksum();
      names.forEach((name, i) => total.update(`${name}:${sums[i]!.digest()}\n`));
      return { rows: { ...rows }, checksum: total.digest() };
    },
  };
}

/** The whole dataset in memory: `streamSyntheticDataset` collected, with the same rows and checksum. */
export function generateSyntheticDataset<N extends SyntheticDatasetName>(dataset: N, seed: string, params: Partial<Datasets[N]['params']> = {}): SyntheticDataset<N> {
  const stream = streamSyntheticDataset(dataset, seed, params);
  const tables = Object.fromEntries(SYNTHETIC_TABLES[dataset].map((name) => [name, [] as unknown[]])) as Record<string, unknown[]>;
  for (const batch of stream.batches) for (const [name, list] of Object.entries(batch as Record<string, unknown[]>)) tables[name]!.push(...list);
  const { dataset: name, version, seed: seedValue, params: settings } = stream;
  return { dataset: name, version, seed: seedValue, params: settings, tables: tables as Tables<N>, checksum: stream.summary().checksum };
}
