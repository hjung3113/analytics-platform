/**
 * Synthetic cycle-time executions for the cycle-time drilldown.
 * Seeded from EQUIPMENT. Not parser data. Percentile, bins, timeline and quality
 * are Candidate choices — see the page captions. Anchors stay second-precision
 * strings and are never shortened to join or display.
 */
import { formatDateTime, parseDateTime, shift, type GlobalContext } from '../../kernel/url';
import { EQUIPMENT, type Equipment } from '../../mock/world';
import { bucketStart as jobBucketStart, cycleMinutes, jobPercentile, jobsForEquipmentDay, jobsInPeriod, type Job } from '../../mock/jobs';

export const PAGE_METRIC_ID = 'cycle_time';
export const PAGE_METRIC_VERSION = '3';
/** Analysis page passes this to serve() so the 90-day contract link is too_large. */
export const MAX_HOURS = 24 * 31;

export type Granularity = 'hour' | 'day' | 'week';
export type TailMode = 'p50' | 'p95' | 'all';
export type Quality = 'unknown' | 'review';
export type SegmentKind = 'XFR' | 'FNC' | 'PRC';

export type Execution = {
  equipmentId: string;
  room: string;
  recipe: string;
  lotId: string;
  ppid: string;
  /** Occurrence anchor. Full second string; lotId is not a substitute key. */
  anchor: string;
  cycleMin: number;
  quality: Quality;
};

export type Segment = {
  kind: SegmentKind;
  module: string;
  slot: string;
  start: string;
  end: string;
  durationMin: number;
};

export type SlowRow = Execution & { delta: number | null };

export type ResolvedMetric =
  | { kind: 'page-default'; metricId: typeof PAGE_METRIC_ID; metricVersion: typeof PAGE_METRIC_VERSION }
  | { kind: 'applied'; metricId: typeof PAGE_METRIC_ID; metricVersion: string; versionIsPageDefault: boolean }
  | { kind: 'not-applied'; metricId: typeof PAGE_METRIC_ID; metricVersion: typeof PAGE_METRIC_VERSION; globalMetricId: string; globalMetricVersion: string }
  | { kind: 'unconfirmed'; metricId: string };

export const BINS = [
  { id: '0-30', min: 0, max: 30 },
  { id: '30-45', min: 30, max: 45 },
  { id: '45-60', min: 45, max: 60 },
  { id: '60-75', min: 60, max: 75 },
  { id: '75-90', min: 75, max: 90 },
  { id: '90+', min: 90, max: Number.POSITIVE_INFINITY },
] as const;

export const SORT_COLUMNS = ['cycleMin', 'delta', 'anchor', 'equipmentId', 'room', 'recipe', 'lotId', 'quality'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export const DEFAULT_SORT = 'cycleMin:desc';

export type OccurrenceResult =
  | { access: 'missing' }
  | { access: 'forbidden' }
  | { access: 'ok'; execution: Execution; segments: Segment[] };

const ANCHOR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

export function isAnchor(value: string | null): value is string {
  if (!value || !ANCHOR.test(value)) return false;
  try { parseDateTime(value, 'anchor'); return true; } catch { return false; }
}

/** Absent global metric → page default cycle_time v3, not written to the URL. Id-only is unconfirmed: never fill PAGE_METRIC_VERSION. */
export function resolveMetric(global: GlobalContext): ResolvedMetric {
  if (global.metricId === null) {
    return { kind: 'page-default', metricId: PAGE_METRIC_ID, metricVersion: PAGE_METRIC_VERSION };
  }
  if (global.metricVersion === null) return { kind: 'unconfirmed', metricId: global.metricId };
  if (global.metricId === PAGE_METRIC_ID) {
    return { kind: 'applied', metricId: PAGE_METRIC_ID, metricVersion: global.metricVersion, versionIsPageDefault: global.metricVersion === PAGE_METRIC_VERSION };
  }
  return {
    kind: 'not-applied',
    metricId: PAGE_METRIC_ID,
    metricVersion: PAGE_METRIC_VERSION,
    globalMetricId: global.metricId,
    globalMetricVersion: global.metricVersion,
  };
}

export function resolveGranularity(raw: string | null, hours: number | null): { ok: true; value: Granularity; explicit: boolean } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: hours !== null && hours <= 48 ? 'hour' : 'day', explicit: false };
  if (raw === 'hour' || raw === 'day' || raw === 'week') return { ok: true, value: raw, explicit: true };
  return { ok: false };
}

export function resolveTail(raw: string | null): { ok: true; value: TailMode; explicit: boolean } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: 'p95', explicit: false };
  if (raw === 'p50' || raw === 'p95' || raw === 'all') return { ok: true, value: raw, explicit: true };
  return { ok: false };
}

export function parseSortParam(raw: string | null): { ok: true; id: SortColumn; desc: boolean; explicit: boolean } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, id: 'cycleMin', desc: true, explicit: false };
  const match = /^([A-Za-z]+):(asc|desc)$/.exec(raw);
  if (!match || !SORT_COLUMNS.includes(match[1] as SortColumn)) return { ok: false };
  return { ok: true, id: match[1] as SortColumn, desc: match[2] === 'desc', explicit: true };
}

export function encodeSort(id: string, desc: boolean): string {
  return `${id}:${desc ? 'desc' : 'asc'}`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Candidate percentile: linear interpolation, then round to 0.1 min before ≥ comparisons. */
export function percentile(values: number[], p: number): number | null {
  return jobPercentile(values, p);
}

export function addSeconds(value: string, seconds: number): string {
  return formatDateTime(new Date(parseDateTime(value, 'anchor').getTime() + seconds * 1000));
}

export function previousWindow(from: string, to: string): { from: string; to: string } {
  const span = parseDateTime(to, 'to').getTime() - parseDateTime(from, 'from').getTime();
  return { from: formatDateTime(new Date(parseDateTime(from, 'from').getTime() - span)), to: from };
}

export function bucketStart(anchor: string, granularity: Granularity): string {
  return jobBucketStart(anchor, granularity);
}

export function bucketEnd(start: string, granularity: Granularity): string {
  return shift(start, granularity === 'hour' ? 1 : granularity === 'day' ? 24 : 168);
}

export function bucketContaining(instant: string, granularity: Granularity): string | null {
  if (!isAnchor(instant)) return null;
  return bucketStart(instant, granularity);
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

function binIndex(id: string): number {
  return BINS.findIndex(bin => bin.id === id);
}

export function histogram(rows: Execution[]): { id: string; count: number }[] {
  const counts = new Map<string, number>(BINS.map(bin => [bin.id, 0]));
  for (const row of rows) counts.set(binIdFor(row.cycleMin), (counts.get(binIdFor(row.cycleMin)) ?? 0) + 1);
  return BINS.map(bin => ({ id: bin.id, count: counts.get(bin.id) ?? 0 }));
}

export type Trend = { p50: [string, number | null][]; p95: [string, number | null][] };

export function trendOf(rows: Execution[], from: string, to: string, granularity: Granularity): Trend {
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

export function executionKey(row: { equipmentId: string; anchor: string }): string {
  return `${row.equipmentId}|${row.anchor}`;
}

export function equipmentIdFromKey(key: string): string {
  const split = key.indexOf('|');
  return split === -1 ? key : key.slice(0, split);
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
