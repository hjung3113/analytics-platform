/**
 * Large synthetic workloads (#3204 slice 2): named scale profiles and a writer that turns a dataset stream into NDJSON
 * or CSV through a caller's sink, batch by batch, so memory stays at one batch whatever the scale. No file system
 * here (the package stays runtime-free): `tooling/scripts/synthetic-workload.mjs` gives it a file sink.
 */
import { streamSyntheticDataset, SYNTHETIC_TABLES, type SyntheticDatasetName } from './dataset';
import type { IntervalStepsParams } from './interval-steps';
import type { SharedResourceParams } from './shared-resource';

export type SyntheticWorkloadFormat = 'ndjson' | 'csv';

/**
 * Scales for a run, each one an arbitrary test size, never a measured one. `functional` is the defaults; `large` is
 * for opt-in engine measurement (#2918) only, never CI. In-house sizes are passed as parameters, not added here.
 */
export const SYNTHETIC_WORKLOAD_PROFILES: Record<'functional' | 'large', { 'interval-steps': Partial<IntervalStepsParams>; 'shared-resource': Partial<SharedResourceParams> }> = {
  functional: { 'interval-steps': {}, 'shared-resource': {} },
  large: {
    'interval-steps': { runs: 1_000_000, subjects: 20_000, spanDays: 90 },
    'shared-resource': { events: 1_000_000, resources: 200, objects: 50_000, spanDays: 90 },
  },
};

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** The sink receives each table's text in order: a CSV header first, then rows; each call ends with a newline. */
export type SyntheticWorkloadSink = { write(table: string, text: string): void };

/**
 * Writes the dataset through `sink` and returns what a manifest records: dataset, version, seed, the full parameters,
 * row counts and checksum (the same checksum `generateSyntheticDataset` gives for these inputs).
 */
export function writeSyntheticWorkload(
  dataset: SyntheticDatasetName, seed: string, params: Record<string, unknown>, format: SyntheticWorkloadFormat, sink: SyntheticWorkloadSink, { batchParents = 10_000 } = {},
): { dataset: SyntheticDatasetName; version: number; seed: string; params: Record<string, unknown>; format: SyntheticWorkloadFormat; rows: Record<string, number>; checksum: string } {
  const stream = streamSyntheticDataset(dataset, seed, params, { batchParents });
  const columns = new Map<string, string[]>();
  for (const batch of stream.batches) {
    for (const table of SYNTHETIC_TABLES[dataset] as string[]) {
      const rows = (batch as Record<string, Array<Record<string, unknown>>>)[table]!;
      if (rows.length === 0) continue;
      if (format === 'ndjson') {
        sink.write(table, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
        continue;
      }
      if (!columns.has(table)) {
        columns.set(table, Object.keys(rows[0]!));
        sink.write(table, `${columns.get(table)!.join(',')}\n`);
      }
      sink.write(table, rows.map((row) => `${columns.get(table)!.map((column) => csvCell(row[column])).join(',')}\n`).join(''));
    }
  }
  const { rows, checksum } = stream.summary();
  return { dataset, version: stream.version, seed, params: stream.params as Record<string, unknown>, format, rows, checksum };
}
