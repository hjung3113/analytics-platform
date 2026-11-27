import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateSyntheticDataset, SYNTHETIC_DATASET_VERSION, type SyntheticDatasetName } from '../../datasets';
import {
  attributedMinutes, currentRuns, elapsedSeconds, joinedQuantity, meanOfRatios, parentQuantity, participantCount, quantile, ratioOfSums,
  resolvedLinks, resolvedSteps, summedMinutes, unionMinutes, unionMinutesByDay,
} from './oracle.test-support';

// Small golden inputs. Regenerate a file only on purpose, with SYNTHETIC_DATASET_VERSION raised:
// UPDATE_GOLDEN=1 pnpm --filter @ap/server-conformance exec vitest run src/__tests__/datasets
const GOLDEN: Array<{ name: SyntheticDatasetName; params: Record<string, unknown> }> = [
  { name: 'interval-steps', params: { runs: 6, subjects: 3, stepsPerRun: { min: 0, max: 2 } } },
  { name: 'shared-resource', params: { events: 7, resources: 2, objects: 6 } },
];
const goldenUrl = (name: string): URL => new URL(`../../__fixtures__/datasets/${name}.golden.json`, import.meta.url);
// One row per line, so a changed row shows as one changed line.
const format = (value: unknown): string => `${JSON.stringify(value, (key, v) => (Array.isArray(v) && key !== '' && typeof v[0] === 'object' ? v.map((row: unknown) => JSON.stringify(row)) : v), 1)
  .replace(/"(\{.*\})"/g, (_, row: string) => JSON.parse(`"${row}"`) as string)}\n`;

describe('synthetic datasets (#3204)', () => {
  it.each(GOLDEN)('$name: the golden fixture is what this version generates', ({ name, params }) => {
    const dataset = generateSyntheticDataset(name, 'golden', params);
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(goldenUrl(name), format(dataset));
    const golden = JSON.parse(readFileSync(goldenUrl(name), 'utf8')) as typeof dataset;
    expect(golden.version).toBe(SYNTHETIC_DATASET_VERSION);
    expect(dataset).toEqual(golden);
  });

  it('the same dataset, seed and parameters give the same checksum; any one of them changed gives another', () => {
    const base = generateSyntheticDataset('interval-steps', 'a');
    expect(generateSyntheticDataset('interval-steps', 'a').checksum).toBe(base.checksum);
    expect(generateSyntheticDataset('interval-steps', 'b').checksum).not.toBe(base.checksum);
    expect(generateSyntheticDataset('interval-steps', 'a', { skew: 0 }).checksum).not.toBe(base.checksum);
    expect(generateSyntheticDataset('shared-resource', 'a').checksum).not.toBe(base.checksum);
  });

  it('interval-steps counterexamples match hand-computed values', () => {
    const { runs, steps } = generateSyntheticDataset('interval-steps', 'hand', { runs: 4 }).tables;
    // Four runs, one reprocessed into revision 2; S-0001 occurs twice.
    expect(runs.map((r) => `${r.runId}/${r.revision}/${r.subjectKey}`)).toEqual(['R-000001/1/S-0001', 'R-000002/1/S-0002', 'R-000003/1/S-0001', 'R-000004/1/S-0003', 'R-000004/2/S-0003']);
    expect(currentRuns(runs).map(elapsedSeconds)).toEqual([3600, 0, null, 5400]);
    expect(runs[4]!.loadedAt > runs[3]!.loadedAt && Date.parse(runs[3]!.loadedAt) - Date.parse(runs[3]!.endAt!) >= 3 * 86_400_000).toBe(true);
    // The step of the run without an end names a missing run.
    expect(steps.filter((s) => !resolvedSteps(runs, steps).includes(s)).map((s) => s.stepId)).toEqual(['T-000004']);
    const resolved = resolvedSteps(runs, steps);
    // Durations 20, 40, 0, 30 minutes; amounts 3, 5, 0, 2; T-000002 crosses midnight.
    expect(resolved.map((s) => summedMinutes([s]))).toEqual([20, 40, 0, 30]);
    expect(unionMinutesByDay([resolved[1]!])).toEqual({ '2030-01-01': 10, '2030-01-02': 30 });
    // Parent sum at the parent grain vs the join: R-000001 counted twice, R-000003 (no resolved step) not at all.
    const [q1, , q3] = currentRuns(runs).map((r) => r.quantity);
    expect(joinedQuantity(runs, steps) - parentQuantity(runs)).toBe(q1! - q3!);
    // Summing every revision row counts R-000004 twice.
    expect(runs.reduce((a, r) => a + r.quantity, 0)).not.toBe(parentQuantity(runs));
    // Per run (resolved steps only): durations [20, 40], [0], [30]; [Σ amount, Σ minutes] [8, 60], [0, 0], [2, 30].
    const perRun = currentRuns(runs).map((run) => resolved.filter((s) => s.runId === run.runId)).filter((list) => list.length > 0);
    const durations = perRun.map((list) => list.map((s) => summedMinutes([s])));
    const pairs = perRun.map((list): [number, number] => [list.reduce((a, s) => a + (s.amount ?? 0), 0), summedMinutes(list)]);
    expect([durations, pairs]).toEqual([[[20, 40], [0], [30]], [[8, 60], [0, 0], [2, 30]]]);
    // Quantile recomputed from the distribution (P50 = 20) vs the mean of per-run P50s (20, 0, 30 → 16.67).
    expect(quantile(durations.flat(), 0.5)).toBe(20);
    expect(durations.reduce((a, d) => a + quantile(d, 0.5), 0) / durations.length).toBeCloseTo(16.667, 3);
    // Amount per minute: ratio of sums 10/90 vs the mean of per-run ratios (0/0 dropped) = 0.1.
    expect(ratioOfSums(pairs)).toBeCloseTo(0.1111, 4);
    expect(meanOfRatios(pairs)).toBeCloseTo(0.1, 4);
  });

  it('shared-resource counterexamples match hand-computed values', () => {
    const { events, links } = generateSyntheticDataset('shared-resource', 'hand', { events: 5 }).tables;
    expect(events).toHaveLength(5);
    expect(links).toHaveLength(8);
    expect(resolvedLinks(events, links)).toHaveLength(7);
    // Five physical events, five participating objects, seven participations (2 + 2 + 1 + 1 + 1).
    expect(participantCount(events, links)).toBe(5);
    // Summed 60 + 60 + 10 + 30 + 0 = 160 min; the union on Q-01 is 90 + 30 = 120; attributed to participants 280.
    expect(summedMinutes(events)).toBe(160);
    expect(unionMinutes(events)).toBe(120);
    expect(attributedMinutes(events, links)).toBe(280);
    // O-0002 is in two overlapping events: attributed 120 min, busy 90.
    const o2 = events.filter((e) => links.some((l) => l.eventId === e.eventId && l.objectKey === 'O-0002'));
    expect([summedMinutes(o2), unionMinutes(o2)]).toEqual([120, 90]);
    expect(unionMinutesByDay(events)).toEqual({ '2030-01-02': 105, '2030-01-03': 15 });
  });

  it('at default scale the oracle invariants hold for every seed tried', () => {
    for (const seed of ['s1', 's2', 's3']) {
      const a = generateSyntheticDataset('interval-steps', seed).tables;
      expect(new Set(currentRuns(a.runs).map((r) => r.subjectKey)).size).toBeLessThan(currentRuns(a.runs).length);
      expect(resolvedSteps(a.runs, a.steps).length).toBeLessThan(a.steps.length);
      const b = generateSyntheticDataset('shared-resource', seed).tables;
      for (const resource of new Set(b.events.map((e) => e.resourceKey))) {
        const on = b.events.filter((e) => e.resourceKey === resource);
        expect(unionMinutes(on)).toBeLessThanOrEqual(summedMinutes(on));
      }
      expect(participantCount(b.events, b.links)).toBeLessThanOrEqual(resolvedLinks(b.events, b.links).length);
      expect(attributedMinutes(b.events, b.links)).toBeGreaterThanOrEqual(summedMinutes(b.events.filter((e) => b.links.some((l) => l.eventId === e.eventId))));
    }
    // Dense random events on one resource in one day overlap: the union is shorter than the sum and fits the day plus the longest event.
    const dense = generateSyntheticDataset('shared-resource', 'dense', { events: 60, resources: 1, spanDays: 1 }).tables.events.slice(5);
    expect(unionMinutes(dense)).toBeLessThan(summedMinutes(dense));
    expect(unionMinutes(dense)).toBeLessThanOrEqual(24 * 60 + 180);
    expect(dense.every((e) => Date.parse(e.startAt) % 60_000 === 0)).toBe(true);
  });

  it('a row depends only on its own index: more rows or another rate leave earlier rows as they were', () => {
    const small = generateSyntheticDataset('interval-steps', 'p', { runs: 10 }).tables;
    const large = generateSyntheticDataset('interval-steps', 'p', { runs: 30 }).tables;
    expect(large.runs.slice(0, small.runs.length)).toEqual(small.runs);
    const base = generateSyntheticDataset('shared-resource', 'p').tables.events;
    expect(generateSyntheticDataset('shared-resource', 'p', { unresolvedLinkRate: 0.9 }).tables.events).toEqual(base);
    // Unresolved references point past every id the dataset uses, at any size.
    const big = generateSyntheticDataset('shared-resource', 'p', { events: 2000, spanDays: 30 }).tables;
    expect(resolvedLinks(big.events, big.links).length).toBe(big.links.filter((l) => Number(l.eventId.slice(2)) <= 2000).length);
  });

  it('refuses a parameter outside its domain before making rows; a high skew still terminates', () => {
    for (const bad of [{ runs: -1 }, { subjects: 0 }, { spanDays: 0 }, { skew: -1 }, { reprocessRate: 1.5 }, { stepsPerRun: { min: 3, max: 1 } }, { runs: 2.5 }]) {
      expect(() => generateSyntheticDataset('interval-steps', 'x', bad)).toThrow(RangeError);
    }
    expect(() => generateSyntheticDataset('shared-resource', 'x', { participantsPerEvent: { min: -1, max: 2 } })).toThrow(RangeError);
    expect(generateSyntheticDataset('interval-steps', 'x', { runs: 0 }).tables).toEqual({ runs: [], steps: [] });
    const skewed = generateSyntheticDataset('shared-resource', 'x', { skew: 50, objects: 3, participantsPerEvent: { min: 3, max: 3 } }).tables.links;
    expect(skewed.length).toBeGreaterThan(0);
  });

  it('holds no real identifier, name or time: synthetic keys, a virtual year and the documented fields only', () => {
    const KEY = /^(?:R-\d{6,}|S-\d{4,}|T-\d{6,}|E-\d{6,}|Q-\d{2,}|O-\d{4,})$/;
    const FIELDS = new Set(['runId', 'revision', 'subjectKey', 'startAt', 'endAt', 'loadedAt', 'quantity', 'elapsed', 'elapsedUnit', 'stepId', 'amount', 'eventId', 'resourceKey', 'objectKey']);
    for (const name of ['interval-steps', 'shared-resource'] as const) {
      for (const rows of Object.values(generateSyntheticDataset(name, 'scan', { spanDays: 30 }).tables) as Array<Array<Record<string, unknown>>>) {
        for (const row of rows) {
          for (const [field, value] of Object.entries(row)) {
            expect(FIELDS.has(field)).toBe(true);
            if (/(?:Id|Key)$/.test(field)) expect(value).toMatch(KEY);
            if (/At$/.test(field) && value !== null) expect(String(value)).toMatch(/^2030-/);
          }
        }
      }
    }
  });
});
