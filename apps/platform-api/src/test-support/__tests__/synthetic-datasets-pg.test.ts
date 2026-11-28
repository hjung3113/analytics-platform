// #3204 slice 3: the loader's statements and its column drift guard, without a database (the opt-in run against
// PostgreSQL is src/__tests__/synthetic-datasets.pg.test.ts).
import { generateSyntheticDataset } from '@ap/server-conformance/datasets';
import { describe, expect, it } from 'vitest';
import { columnName, columnsFor, dropSyntheticSchema, loadSyntheticDataset, type Queryable, type SyntheticTables } from '../synthetic-datasets-pg.js';

function recorder(failOn?: RegExp): Queryable & { calls: Array<{ text: string; values: unknown[] | undefined }> } {
  const calls: Array<{ text: string; values: unknown[] | undefined }> = [];
  return {
    calls,
    query: async (text, values) => {
      calls.push({ text, values });
      if (failOn?.test(text)) throw new Error('refused');
      return {};
    },
  };
}

describe('synthetic dataset PostgreSQL loader', () => {
  it('declares a column for every field of both datasets and no column without a field', () => {
    for (const name of ['interval-steps', 'shared-resource'] as const) {
      const data = generateSyntheticDataset(name, 'columns');
      for (const [table, rows] of Object.entries(data.tables)) {
        const fields = Object.keys((rows as Array<Record<string, unknown>>)[0] ?? {}).sort();
        expect(columnsFor(data, table).map(([field]) => field).sort(), `${name}.${table}`).toEqual(fields);
      }
    }
  });

  it('fails before any SQL when a generated field has no column', async () => {
    const data = generateSyntheticDataset('shared-resource', 'drift');
    const drifted: SyntheticTables = { ...data, tables: { ...data.tables, links: data.tables.links.map((link) => ({ ...link, weight: 1 })) } };
    const client = recorder();
    await expect(loadSyntheticDataset(client, drifted, 'synthetic_drift')).rejects.toThrow(/no column: weight/);
    expect(client.calls).toEqual([]);
  });

  it('creates the schema and tables and inserts every row in batches inside one transaction', async () => {
    const data = generateSyntheticDataset('interval-steps', 'batches', { runs: 700 });
    const client = recorder();
    const counts = await loadSyntheticDataset(client, data, 'synthetic_batches');
    expect(counts).toEqual({ runs: data.tables.runs.length, steps: data.tables.steps.length });
    const texts = client.calls.map((call) => call.text);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toBe('CREATE SCHEMA "synthetic_batches"');
    expect(texts).toContain('CREATE TABLE "synthetic_batches"."steps" ("step_id" text, "run_id" text, "start_at" timestamptz, "end_at" timestamptz, "amount" double precision)');
    expect(texts.at(-1)).toBe('COMMIT');
    const inserted = (table: string) => client.calls.filter((call) => call.text.startsWith(`INSERT INTO "synthetic_batches"."${table}"`));
    const runsColumns = columnsFor(data, 'runs').length;
    expect(inserted('runs').reduce((n, call) => n + (call.values?.length ?? 0), 0)).toBe(data.tables.runs.length * runsColumns);
    expect(inserted('runs').length).toBe(Math.ceil(data.tables.runs.length / 500));
    // A missing value is SQL NULL, not the string "undefined".
    expect(inserted('runs').flatMap((call) => call.values ?? [])).not.toContain(undefined);
  });

  it('rolls back when a statement fails', async () => {
    const client = recorder(/^INSERT/);
    await expect(loadSyntheticDataset(client, generateSyntheticDataset('shared-resource', 'rollback'), 'synthetic_rollback')).rejects.toThrow('refused');
    expect(client.calls.at(-1)?.text).toBe('ROLLBACK');
  });

  it('refuses a schema name that is not a plain identifier or names public or pg_*', async () => {
    const data = generateSyntheticDataset('shared-resource', 'names');
    for (const schema of ['public', 'pg_temp', 'Synthetic', 'a"b', 'x; drop table y', '']) {
      await expect(loadSyntheticDataset(recorder(), data, schema)).rejects.toThrow(/refusing schema name/);
      await expect(dropSyntheticSchema(recorder(), schema)).rejects.toThrow(/refusing schema name/);
    }
  });

  it('names columns in snake case', () => {
    expect(columnName('elapsedUnit')).toBe('elapsed_unit');
    expect(columnName('runId')).toBe('run_id');
  });
});
