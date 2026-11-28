// #3204 slice 3, opt-in: loads both synthetic datasets into PostgreSQL and checks that SQL over them gives the answers
// computed from the generated rows here — the analysis rules #1704 states (parent totals do not inflate through a join,
// events ≠ participants ≠ covered time, `ratioOfSums` ≠ the mean of ratios). Never in default CI: it runs only when
// SYNTHETIC_DATASETS_PG_URL names a database the caller may write a scratch schema to. The schema is dropped after.
//
//   SYNTHETIC_DATASETS_PG_URL=postgres://… pnpm --filter @ap/platform-api exec vitest run src/__tests__/synthetic-datasets.pg.test.ts
//
// A pass shows the loader and these SQL shapes agree with the in-process answers on synthetic data. It is not an in-house
// performance or business-meaning pass (#3204, docs/integration/synthetic-dataset-engines.md).
import { generateSyntheticDataset, type EventRow, type RunRow, type StepRow } from '@ap/server-conformance/datasets';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dropSyntheticSchema, loadSyntheticDataset } from '../test-support/synthetic-datasets-pg.js';

const url = process.env.SYNTHETIC_DATASETS_PG_URL ?? '';
const SEED = 'pg-engine';

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const minutes = (i: { startAt: string; endAt: string }): number => (Date.parse(i.endAt) - Date.parse(i.startAt)) / 60_000;
const currentRuns = (runs: RunRow[]): RunRow[] => {
  const byId = new Map<string, RunRow>();
  for (const run of runs) if ((byId.get(run.runId)?.revision ?? 0) < run.revision) byId.set(run.runId, run);
  return [...byId.values()];
};
const unionMinutes = (intervals: EventRow[]): number => {
  const covered = new Set<number>();
  for (const i of intervals) for (let t = Date.parse(i.startAt); t < Date.parse(i.endAt); t += 60_000) covered.add(t);
  return covered.size;
};

describe.skipIf(!url)('synthetic datasets in PostgreSQL (opt-in, #3204)', () => {
  const client = new pg.Client({ connectionString: url });
  const schemas = { steps: `synthetic_interval_steps_${process.pid}`, shared: `synthetic_shared_resource_${process.pid}` };
  const steps = generateSyntheticDataset('interval-steps', SEED);
  const shared = generateSyntheticDataset('shared-resource', SEED);
  const one = async (text: string): Promise<number> => Number(Object.values((await client.query(text)).rows[0] as object)[0]);

  beforeAll(async () => {
    await client.connect();
    expect(await loadSyntheticDataset(client, steps, schemas.steps)).toEqual({ runs: steps.tables.runs.length, steps: steps.tables.steps.length });
    expect(await loadSyntheticDataset(client, shared, schemas.shared)).toEqual({ events: shared.tables.events.length, links: shared.tables.links.length });
  });
  afterAll(async () => {
    await dropSyntheticSchema(client, schemas.steps);
    await dropSyntheticSchema(client, schemas.shared);
    await client.end();
  });

  it('keeps every row: counts and the instants round-trip', async () => {
    const s = schemas.steps;
    expect(await one(`SELECT count(*) FROM "${s}".runs`)).toBe(steps.tables.runs.length);
    expect(await one(`SELECT count(*) FROM "${s}".steps`)).toBe(steps.tables.steps.length);
    expect(await one(`SELECT count(*) FROM "${s}".runs WHERE end_at IS NULL`)).toBe(steps.tables.runs.filter((r) => r.endAt === null).length);
    const first = steps.tables.runs[0];
    const { rows } = await client.query(`SELECT start_at FROM "${s}".runs WHERE run_id = $1 AND revision = $2`, [first?.runId, first?.revision]);
    expect((rows[0] as { start_at: Date }).start_at.toISOString()).toBe(first?.startAt);
  });

  it('a parent total is counted at the parent grain; the naive join inflates it', async () => {
    const s = schemas.steps;
    const current = currentRuns(steps.tables.runs);
    const byId = new Map(current.map((run) => [run.runId, run]));
    const parent = sum(current.map((run) => run.quantity));
    const joined = sum(steps.tables.steps.map((step: StepRow) => byId.get(step.runId)?.quantity ?? 0));
    const currentSql = `(SELECT DISTINCT ON (run_id) * FROM "${s}".runs ORDER BY run_id, revision DESC)`;
    expect(await one(`SELECT sum(quantity) FROM ${currentSql} c`)).toBe(parent);
    expect(await one(`SELECT sum(c.quantity) FROM ${currentSql} c JOIN "${s}".steps t USING (run_id)`)).toBe(joined);
    expect(joined).not.toBe(parent);
  });

  it('elapsed time in mixed units sums in one unit', async () => {
    const current = currentRuns(steps.tables.runs);
    const seconds = sum(current.map((run) => (run.elapsed === null ? 0 : run.elapsedUnit === 'ms' ? run.elapsed / 1000 : run.elapsed)));
    const sql = `SELECT sum(CASE elapsed_unit WHEN 'ms' THEN elapsed / 1000.0 ELSE elapsed END) FROM (SELECT DISTINCT ON (run_id) * FROM "${schemas.steps}".runs ORDER BY run_id, revision DESC) c`;
    expect(await one(sql)).toBeCloseTo(seconds, 6);
  });

  it('ratioOfSums is not the mean of the ratios', async () => {
    const pairs = steps.tables.steps.filter((step) => step.amount !== null && minutes(step) > 0).map((step) => [step.amount as number, minutes(step)] as const);
    const ratio = sum(pairs.map(([n]) => n)) / sum(pairs.map(([, d]) => d));
    const meanOfRatios = sum(pairs.map(([n, d]) => n / d)) / pairs.length;
    const where = `FROM "${schemas.steps}".steps WHERE amount IS NOT NULL AND end_at > start_at`;
    const mins = 'extract(epoch FROM end_at - start_at) / 60';
    expect(await one(`SELECT sum(amount) / sum(${mins}) ${where}`)).toBeCloseTo(ratio, 9);
    expect(await one(`SELECT avg(amount / (${mins})) ${where}`)).toBeCloseTo(meanOfRatios, 9);
    expect(ratio).not.toBeCloseTo(meanOfRatios, 3);
  });

  it('physical events, participating objects and covered time are three different numbers', async () => {
    const s = schemas.shared;
    const { events, links } = shared.tables;
    const known = new Set(events.map((event) => event.eventId));
    const participants = new Set(links.filter((link) => known.has(link.eventId)).map((link) => link.objectKey)).size;
    const byResource = new Map<string, EventRow[]>();
    for (const event of events) byResource.set(event.resourceKey, [...(byResource.get(event.resourceKey) ?? []), event]);
    const covered = sum([...byResource.values()].map(unionMinutes));
    const summed = sum(events.map(minutes));
    expect(await one(`SELECT count(*) FROM "${s}".events`)).toBe(events.length);
    expect(await one(`SELECT count(DISTINCT l.object_key) FROM "${s}".links l JOIN "${s}".events e USING (event_id)`)).toBe(participants);
    expect(await one(`SELECT coalesce(sum(extract(epoch FROM upper(r) - lower(r)) / 60), 0) FROM (SELECT unnest(range_agg(tstzrange(start_at, end_at))) r FROM "${s}".events GROUP BY resource_key) u`)).toBe(covered);
    expect(await one(`SELECT sum(extract(epoch FROM end_at - start_at) / 60) FROM "${s}".events`)).toBe(summed);
    expect(new Set([events.length, participants]).size).toBe(2);
    expect(covered).toBeLessThan(summed);
  });
});
