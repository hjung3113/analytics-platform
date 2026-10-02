/**
 * Mock server half of the cycle-time endpoints (#127) and the occurrence lookup shared with execution-detail.
 * Synthetic cycle-time executions seeded from EQUIPMENT. Not parser data. Percentile, bins, timeline and quality
 * are Candidate choices — see the page captions. Anchors stay second-precision strings.
 */
import { bucketStart, formatDateTime, parseDateTime, shift, sortAndPage, type GlobalContext } from '@ap/contracts';
import { cycleMinutes, defineMockEndpoint, EQUIPMENT, jobPercentile, jobsForEquipmentDay, jobsInPeriod, type AnyMockEndpoint, type Equipment, type Job } from '@ap/mock-server';
import {
  BINS, binIndex, bucketEnd, cycleDistEndpoint, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint, cycleTrendEndpoint,
  cycleVersionOf, executionKey, isAnchor, resolveMetric,
  type CycleKpi, type CycleTrend, type CycleTrendData, type Execution, type Granularity, type OccurrenceResult, type Segment,
  type SlowFilter, type SlowRow, type TailMode,
} from '../endpoints';

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Candidate percentile: linear interpolation, then round to 0.1 min before ≥ comparisons. */
export function percentile(values: number[], p: number): number | null {
  return jobPercentile(values, p);
}

export function previousWindow(from: string, to: string): { from: string; to: string } {
  const span = parseDateTime(to, 'to').getTime() - parseDateTime(from, 'from').getTime();
  return { from: formatDateTime(new Date(parseDateTime(from, 'from').getTime() - span)), to: from };
}

export function enumerateBuckets(from: string, to: string, granularity: Granularity): string[] {
  const out: string[] = [];
  let cursor = bucketStart(from, granularity);
  const step = granularity === 'hour' ? 1 : granularity === 'day' ? 24 : 168;
  while (cursor < to && out.length < 4000) {
    out.push(cursor);
    const next = shift(cursor, step);
    if (next <= cursor) break;
    cursor = next;
  }
  return out;
}

export function binIdFor(cycleMin: number): string {
  return BINS.find(bin => cycleMin >= bin.min && cycleMin < bin.max)?.id ?? '90+';
}

export function histogram(rows: Execution[]): { id: string; count: number }[] {
  const counts = new Map<string, number>(BINS.map(bin => [bin.id, 0]));
  for (const row of rows) counts.set(binIdFor(row.cycleMin), (counts.get(binIdFor(row.cycleMin)) ?? 0) + 1);
  return BINS.map(bin => ({ id: bin.id, count: counts.get(bin.id) ?? 0 }));
}

export function trendOf(rows: Execution[], from: string, to: string, granularity: Granularity): CycleTrend {
  const buckets = enumerateBuckets(from, to, granularity);
  const grouped = new Map<string, number[]>(buckets.map(bucket => [bucket, []]));
  for (const row of rows) grouped.get(bucketStart(row.anchor, granularity))?.push(row.cycleMin);
  return {
    p50: buckets.map(bucket => [bucket, percentile(grouped.get(bucket) ?? [], 0.5)]),
    p95: buckets.map(bucket => [bucket, percentile(grouped.get(bucket) ?? [], 0.95)]),
  };
}

/** Scope-resolved equipment × applied period × lot/ppid/recipe. Does not apply page filters. */
export function population(equipment: Equipment[], global: GlobalContext, version = '3'): Execution[] {
  if (!global.from || !global.to) return [];
  return jobsInPeriod(equipment, global.from, global.to).filter(job => {
    if (global.lotIds !== null && !global.lotIds.includes(job.lotId)) return false;
    if (global.recipeIds !== null && !global.recipeIds.includes(job.recipe)) return false;
    if (global.ppid !== null && job.ppid !== global.ppid) return false;
    return true;
  }).map(job => executionFromJob(job, version));
}

export function slowExecutions(
  rows: Execution[],
  mode: TailMode,
  p50: number | null,
  p95: number | null,
  bucket: { from: string; to: string } | null,
  bin: { from: string; to: string } | null,
): SlowRow[] {
  const threshold = mode === 'all' ? null : mode === 'p50' ? p50 : p95;
  let binLo: number | null = null;
  let binHi: number | null = null;
  if (bin) {
    const from = binIndex(bin.from);
    const to = binIndex(bin.to);
    if (from < 0 || to < 0) return [];
    binLo = Math.min(from, to);
    binHi = Math.max(from, to);
  }
  const out: SlowRow[] = [];
  for (const row of rows) {
    if (threshold !== null && !(row.cycleMin >= threshold)) continue;
    if (bucket && (row.anchor < bucket.from || row.anchor >= bucket.to)) continue;
    if (binLo !== null && binHi !== null) {
      const index = binIndex(binIdFor(row.cycleMin));
      if (index < binLo || index > binHi) continue;
    }
    out.push({ ...row, delta: p95 === null ? null : round1(row.cycleMin - p95) });
  }
  return out;
}

export function findExecution(equipmentId: string, anchor: string, version = '3'): Execution | null {
  if (!isAnchor(anchor)) return null;
  const equipment = EQUIPMENT.find(item => item.equipmentId === equipmentId);
  if (!equipment) return null;
  const job = jobsForEquipmentDay(equipment, anchor.slice(0, 10)).find(item => item.anchor === anchor);
  return job ? executionFromJob(job, version) : null;
}

/**
 * Identity lookup. `equipment` must already be the grant set (selection/room/period not applied).
 * An id that exists but is outside that set is forbidden; an unknown id or unknown anchor is missing.
 * Neither case is replaced with a nearby execution.
 */
export function lookupOccurrence(equipment: Equipment[], equipmentId: string, anchor: string, version = '3'): OccurrenceResult {
  if (equipment.length === 0) return { access: 'missing' };
  const known = EQUIPMENT.some(item => item.equipmentId === equipmentId);
  const granted = equipment.some(item => item.equipmentId === equipmentId);
  if (known && !granted) return { access: 'forbidden' };
  if (!granted) return { access: 'missing' };
  const execution = findExecution(equipmentId, anchor, version);
  if (!execution) return { access: 'missing' };
  return { access: 'ok', execution, segments: segmentsFor(execution) };
}

/** Candidate timeline: one job split into XFR/FNC/PRC. Gaps are unclassified, not wait or scrap. */
export function segmentsFor(execution: Execution): Segment[] {
  const equipment = EQUIPMENT.find(item => item.equipmentId === execution.equipmentId);
  const job = equipment
    ? jobsForEquipmentDay(equipment, execution.anchor.slice(0, 10)).find(item => item.anchor === execution.anchor)
    : undefined;
  return job?.segments.map(segment => ({ ...segment })) ?? [];
}

export function allExecutions(): Execution[] {
  return jobsInPeriod(EQUIPMENT, '2026-06-20T00:00:00', '2026-09-26T09:00:00')
    .map(job => executionFromJob(job, '3'));
}

function executionFromJob(job: Job, version: string): Execution {
  return {
    equipmentId: job.equipmentId,
    room: job.room,
    recipe: job.recipe,
    lotId: job.lotId,
    ppid: job.ppid,
    anchor: job.anchor,
    cycleMin: cycleMinutes(job, version),
    quality: job.quality,
  };
}

/** The server resolves the computation version from the applied metric pair, like the page banner does. */
function versionOf(context: GlobalContext): string | null {
  return cycleVersionOf(resolveMetric(context));
}

function versioned(equipment: Equipment[], context: GlobalContext): Execution[] {
  const version = versionOf(context);
  return version === null ? [] : population(equipment, context, version);
}

function slowRows(equipment: Equipment[], context: GlobalContext, { tail, granularity, bucket, bin }: SlowFilter): SlowRow[] {
  const rows = versioned(equipment, context);
  const values = rows.map(row => row.cycleMin);
  const range = bucket === null ? null : { from: bucket, to: bucketEnd(bucket, granularity) };
  return slowExecutions(rows, tail, percentile(values, 0.5), percentile(values, 0.95), range, bin);
}

const metricVersion = ({ context }: { context: GlobalContext }) => versionOf(context) ?? undefined;

export const cycleMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(cycleKpiEndpoint, {
    handle: ({ equipment, context }): CycleKpi => {
      const rows = versioned(equipment, context);
      const values = rows.map(row => row.cycleMin);
      const p50 = percentile(values, 0.5);
      const p95 = percentile(values, 0.95);
      const prev = context.from && context.to ? previousWindow(context.from, context.to) : null;
      const prevValues = prev ? versioned(equipment, { ...context, from: prev.from, to: prev.to }).map(row => row.cycleMin) : [];
      return {
        p50, p95, count: rows.length,
        slowCount: p95 === null ? 0 : rows.filter(row => row.cycleMin >= p95).length,
        prevP50: percentile(prevValues, 0.5),
        prevP95: percentile(prevValues, 0.95),
      };
    },
    isEmpty: data => data.count === 0,
    metricVersion,
  }),
  defineMockEndpoint(cycleTrendEndpoint, {
    handle: ({ equipment, context, params }): CycleTrendData => {
      const rows = versioned(equipment, context);
      const from = context.from!;
      const to = context.to!;
      const prev = previousWindow(from, to);
      return {
        count: rows.length,
        populationP95: percentile(rows.map(row => row.cycleMin), 0.95),
        current: trendOf(rows, from, to, params.granularity),
        previous: trendOf(versioned(equipment, { ...context, from: prev.from, to: prev.to }), prev.from, prev.to, params.granularity),
      };
    },
    isEmpty: data => data.count === 0,
    metricVersion,
  }),
  defineMockEndpoint(cycleDistEndpoint, {
    handle: ({ equipment, context }) => {
      const rows = versioned(equipment, context);
      return { count: rows.length, bins: histogram(rows) };
    },
    isEmpty: data => data.count === 0,
    metricVersion,
  }),
  defineMockEndpoint(cycleSlowPageEndpoint, {
    handle: ({ equipment, context, params: { tail, granularity, bucket, bin, page, pageSize, sorting } }) =>
      sortAndPage(slowRows(equipment, context, { tail, granularity, bucket, bin }), { page, pageSize, sorting }),
    isEmpty: data => data.total === 0,
    metricVersion,
  }),
  defineMockEndpoint(cycleExportEndpoint, {
    // Selection export: the server filters by execution keys itself, so the row cap is judged on the selection.
    handle: ({ equipment, context, params }) => {
      const rows = slowRows(equipment, context, params);
      const { ids } = params;
      return ids == null ? rows : rows.filter(row => ids.includes(executionKey(row)));
    },
    metricVersion,
  }),
];
