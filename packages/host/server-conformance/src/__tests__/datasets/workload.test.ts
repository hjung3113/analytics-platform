import { describe, expect, it } from 'vitest';
import { generateSyntheticDataset, streamSyntheticDataset, writeSyntheticWorkload, type SyntheticDatasetName } from '../../datasets';
import { createChecksum } from '../../datasets/random';

/** Reference FNV-1a 64 with BigInt, the textbook form: the limb version must agree with it. */
function fnv64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) hash = ((hash ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n) & 0xffffffffffffffffn;
  return hash.toString(16).padStart(16, '0');
}

const NAMES: SyntheticDatasetName[] = ['interval-steps', 'shared-resource'];

describe('synthetic workloads (#3204 slice 2)', () => {
  it('the limb checksum is FNV-1a 64, in one update or many', () => {
    for (const text of ['', 'a', 'foobar', '{"runId":"R-000001","amount":null}\n', 'é—ü'.repeat(50)]) {
      const one = createChecksum();
      one.update(text);
      expect(one.digest()).toBe(fnv64(text));
      const many = createChecksum();
      for (const char of text) many.update(char);
      expect(many.digest()).toBe(fnv64(text));
    }
  });

  it.each(NAMES)('%s: batches of any size give the in-memory rows and checksum', (name) => {
    const whole = generateSyntheticDataset(name, 'w', { [name === 'interval-steps' ? 'runs' : 'events']: 53 });
    for (const batchParents of [1, 7, 53, 1000]) {
      const stream = streamSyntheticDataset(name, 'w', whole.params, { batchParents });
      const collected: Record<string, unknown[]> = {};
      let batches = 0;
      for (const batch of stream.batches) {
        batches++;
        for (const [table, rows] of Object.entries(batch as Record<string, unknown[]>)) (collected[table] ??= []).push(...rows);
      }
      expect(batches).toBe(Math.ceil(53 / batchParents));
      expect(collected).toEqual(whole.tables);
      expect(stream.summary().checksum).toBe(whole.checksum);
    }
  });

  it('streams lazily: the first batch of a billion-run dataset arrives at once, and the summary waits for the end', () => {
    const stream = streamSyntheticDataset('interval-steps', 'huge', { runs: 1_000_000_000 }, { batchParents: 100 });
    const started = performance.now();
    const first = stream.batches[Symbol.iterator]().next();
    expect(performance.now() - started).toBeLessThan(1000);
    expect(new Set((first.value as { runs: Array<{ runId: string }> }).runs.map((run) => run.runId)).size).toBe(100);
    expect(() => stream.summary()).toThrow(/exhausted/);
    expect(() => streamSyntheticDataset('interval-steps', 'x', {}, { batchParents: 0 })).toThrow(RangeError);
  });

  it.each(NAMES)('%s: NDJSON reads back as the same rows, with the manifest checksum of the dataset', (name) => {
    const whole = generateSyntheticDataset(name, 'n');
    const files: Record<string, string> = {};
    const manifest = writeSyntheticWorkload(name, 'n', {}, 'ndjson', { write: (table, text) => { files[table] = (files[table] ?? '') + text; } }, { batchParents: 6 });
    const parsed = Object.fromEntries(Object.entries(files).map(([table, text]) => [table, text.trimEnd().split('\n').map((line) => JSON.parse(line) as unknown)]));
    expect(parsed).toEqual(whole.tables);
    expect(manifest).toMatchObject({ dataset: name, version: whole.version, seed: 'n', params: whole.params, format: 'ndjson', checksum: whole.checksum });
    expect(manifest.rows).toEqual(Object.fromEntries(Object.entries(whole.tables).map(([table, rows]) => [table, (rows as unknown[]).length])));
  });

  it('CSV has one header per table, empty cells for null and one line per row', () => {
    const files: Record<string, string> = {};
    const manifest = writeSyntheticWorkload('interval-steps', 'c', { runs: 12 }, 'csv', { write: (table, text) => { files[table] = (files[table] ?? '') + text; } }, { batchParents: 5 });
    const runs = files.runs!.trimEnd().split('\n');
    expect(runs[0]).toBe('runId,revision,subjectKey,startAt,endAt,loadedAt,quantity,elapsed,elapsedUnit');
    expect(runs).toHaveLength(manifest.rows.runs! + 1);
    // R-000003 has no end and no elapsed time.
    expect(runs.find((line) => line.startsWith('R-000003,1,'))).toMatch(/^R-000003,1,S-0001,2030-01-04T00:00:00\.000Z,,[^,]+,2,,s$/);
    expect(files.steps!.split('\n')[0]).toBe('stepId,runId,startAt,endAt,amount');
  });
});
