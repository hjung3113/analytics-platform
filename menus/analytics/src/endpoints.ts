/**
 * Analytics query endpoints (packages/contracts/src/menu-query.ts, #114–#115).
 * Client-safe: declarations, params/data types and display constants only — computation
 * handlers live in `src/mock/` and never enter the client bundle.
 * Pages import from here, never from `src/mock/**`.
 */
import { defineEndpoint, parseDateTime, shift, type PageQuery, type PageResult, type PageSort } from '@ap/contracts';

export type Granularity = 'hour' | 'day' | 'week';
export type KpiKey = 'occupancy' | 'dwell' | 'cycleTime' | 'throughput';

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

export type OccurrenceResult =
  | { access: 'missing' }
  | { access: 'forbidden' }
  | { access: 'ok'; execution: Execution; segments: Segment[] };

/** Candidate metric versions (wireframe 11 §3.1); the registry has no page-owned version keys yet. */
export const METRIC_VERSIONS: Record<KpiKey, string> = {
  occupancy: '3', dwell: '2', cycleTime: '4', throughput: '1',
};

export type KpiSet = {
  equipmentCount: number;
  knownBuckets: number;
  /** Physical occupancy: occupied hours ÷ observable hours. null = denominator 0 (미확인), never 0%. */
  occupancy: { num: number; den: number; pct: number } | null;
  /** Non-process dwell per job in hours. null = no completed job in known buckets. */
  dwell: { hours: number; jobs: number; perJobH: number } | null;
  /** Cycle time over pooled jobs; p50/p95 null when no durations. */
  cycle: { jobs: number; p50: number | null; p95: number | null };
  /** Job throughput: completed ÷ started (coverage numerator/denominator). */
  throughput: { jobs: number; started: number };
};

export type TrendBucket = {
  start: string; known: boolean;
  occupancyPct: number | null; dwellPerJobH: number | null;
  jobs: number | null; p50: number | null; p95: number | null;
};

export type TrendData = { equipmentCount: number; current: TrendBucket[]; previous: TrendBucket[] };
export type KpisData = { current: KpiSet; previous: KpiSet | null };

export type BreakdownRow = { key: string; equipmentCount: number; occupiedHours: number; observableHours: number; jobs: number };

export type AttentionRow = {
  equipmentId: string; name: string; room: string; stgroup: string; jobs: number;
  kind: 'dwell' | 'p95'; dwellPerJobH: number | null; p95Min: number | null;
};

/** Prototype guard against unbounded analytics (wireframe 11 §6; real limits are Open). */
const MAX_QUERY_HOURS = 2160;

/** Exactly what the productivity-overview manifest applies; `metric` stays reference, `lot` unsupported. */
const context = { time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', ppid: 'apply', recipe: 'apply' } as const;

export const kpisEndpoint = defineEndpoint<Record<never, true>, KpisData>({
  id: 'analytics.productivity.kpis',
  menuId: 'productivity-overview',
  paramKeys: {},
  permission: 'analytics:view',
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage', 'time_domain'],
  limits: { maxHours: MAX_QUERY_HOURS },
  mergeTimeDomain: true,
});

export const trendEndpoint = defineEndpoint<{ kpi: KpiKey; granularity: Granularity }, TrendData>({
  id: 'analytics.productivity.trend',
  menuId: 'productivity-overview',
  paramKeys: { kpi: true, granularity: true },
  permission: 'analytics:view',
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  limits: { maxHours: MAX_QUERY_HOURS },
  mergeTimeDomain: true,
});

export const breakdownEndpoint = defineEndpoint<{ axis: 'room' | 'stgroup' }, BreakdownRow[]>({
  id: 'analytics.productivity.breakdown',
  menuId: 'productivity-overview',
  paramKeys: { axis: true },
  permission: 'analytics:view',
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  limits: { maxHours: MAX_QUERY_HOURS },
  mergeTimeDomain: true,
});

export const attentionEndpoint = defineEndpoint<Record<never, true>, AttentionRow[]>({
  id: 'analytics.productivity.attention',
  menuId: 'productivity-overview',
  paramKeys: {},
  permission: 'analytics:view',
  requiresScope: true,
  context,
  kinds: ['collection', 'processing_delay', 'coverage'],
  limits: { maxHours: MAX_QUERY_HOURS },
  mergeTimeDomain: true,
});

export type OccurrenceParams = {
  equipmentId: string;
  entityType: string;
  anchor: string;
  metricVersion: string;
};

/** Entity types the execution-detail page opens today (Candidate: job only). Part of the occurrence identity (06 §22); the server must reject others, not resolve them as job. */
export const OCCURRENCE_ENTITY_TYPES: readonly string[] = ['job'];

/** The page resolves metric from its reference Context and sends that version as a computation input, not a filter. */
export const occurrenceEndpoint = defineEndpoint<OccurrenceParams, OccurrenceResult>({
  id: 'analytics.execution.occurrence',
  menuId: 'execution-detail',
  paramKeys: { equipmentId: true, entityType: true, anchor: true, metricVersion: true },
  permission: 'analytics:view',
  requiresScope: true,
  context: {},
  kinds: ['collection', 'processing_delay', 'coverage'],
  mergeTimeDomain: false,
});

// ---- cycle-time (#127) ----

/** Version note shown next to cycle-time figures (display constant shared by both analytics pages). */
export const CYCLE_VERSION_NOTE = {
  ko: '완료 Job 건수는 버전과 무관합니다. 생산성 개요의 사이클타임 분은 cycle_time v4(큐 대기 포함)이고, 사이클타임 상세의 기본 v3는 같은 Job에서 큐 대기만 뺍니다. 그래서 P50·P95는 다를 수 있고 건수는 같습니다.',
  en: 'Completed-job counts ignore version. Productivity cycle-time minutes are cycle_time v4 (queue wait included); cycle-time detail’s default v3 drops only that queue wait on the same jobs, so P50/P95 can differ while the count matches.',
};

export const PAGE_METRIC_ID = 'cycle_time';
/** cycle_time versions the synthetic series computes (v3 drops queue wait, v4 includes it). The server rejects others (#123). */
export const CYCLE_SERIES_VERSIONS: readonly string[] = ['3', '4'];
export const PAGE_METRIC_VERSION = '3';
/** Analysis limit: a 90-day contract link is too_large. */
export const CYCLE_MAX_HOURS = 24 * 31;

export type TailMode = 'p50' | 'p95' | 'all';
export type SlowRow = Execution & { delta: number | null };

export type ResolvedMetric =
  | { kind: 'page-default'; metricId: typeof PAGE_METRIC_ID; metricVersion: typeof PAGE_METRIC_VERSION }
  | { kind: 'applied'; metricId: typeof PAGE_METRIC_ID; metricVersion: string; versionIsPageDefault: boolean }
  | { kind: 'not-applied'; metricId: typeof PAGE_METRIC_ID; metricVersion: typeof PAGE_METRIC_VERSION; globalMetricId: string; globalMetricVersion: string }
  | { kind: 'unconfirmed'; metricId: string };

/**
 * Shared by the page (banner, query gate) and the server (computation version): absent global metric → page
 * default cycle_time v3; id-only is unconfirmed and never filled with PAGE_METRIC_VERSION.
 */
export function resolveMetric(global: { metricId: string | null; metricVersion: string | null }): ResolvedMetric {
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

/** The version a cycle-time computation uses; null when the metric pair is unconfirmed (the page does not query). */
export function cycleVersionOf(metric: ResolvedMetric): string | null {
  return metric.kind === 'unconfirmed' ? null : metric.metricVersion;
}

const ANCHOR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Second-precision occurrence anchor (never shortened to join or display). */
export function isAnchor(value: string | null): value is string {
  if (!value || !ANCHOR.test(value)) return false;
  try { parseDateTime(value, 'anchor'); return true; } catch { return false; }
}

export const BINS = [
  { id: '0-30', min: 0, max: 30 },
  { id: '30-45', min: 30, max: 45 },
  { id: '45-60', min: 45, max: 60 },
  { id: '60-75', min: 60, max: 75 },
  { id: '75-90', min: 75, max: 90 },
  { id: '90+', min: 90, max: Number.POSITIVE_INFINITY },
] as const;

export function binIndex(id: string): number {
  return BINS.findIndex(bin => bin.id === id);
}

export function bucketEnd(start: string, granularity: Granularity): string {
  return shift(start, granularity === 'hour' ? 1 : granularity === 'day' ? 24 : 168);
}

export type CycleKpi = { p50: number | null; p95: number | null; count: number; slowCount: number; prevP50: number | null; prevP95: number | null };
export type CycleTrend = { p50: [string, number | null][]; p95: [string, number | null][] };
export type CycleTrendData = { count: number; populationP95: number | null; current: CycleTrend; previous: CycleTrend };
export type CycleDistData = { count: number; bins: { id: string; count: number }[] };

/** Page list filters: tail threshold, one chart bucket (aligned start) and a bin range. */
export type SlowFilter = { tail: TailMode; granularity: Granularity; bucket: string | null; bin: { from: string; to: string } | null };
export type SlowPageParams = SlowFilter & PageQuery;

/** Exactly what the cycle-time manifest applies; `metric` applies so the server resolves the computation version. */
const cycleContext = { time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' } as const;
const cycleBase = {
  menuId: 'cycle-time',
  permission: 'analytics:view',
  requiresScope: true,
  context: cycleContext,
  kinds: ['collection', 'processing_delay', 'coverage'],
  // Analysis reads refuse a cross-time-domain equipment set (06 §6.3) — the default the analysis reads had before #127.
  mergeTimeDomain: true,
} as const;

export const cycleKpiEndpoint = defineEndpoint<Record<never, true>, CycleKpi>({
  ...cycleBase, id: 'analytics.cycle.kpi', paramKeys: {}, limits: { maxHours: CYCLE_MAX_HOURS },
});

export const cycleTrendEndpoint = defineEndpoint<{ granularity: Granularity }, CycleTrendData>({
  ...cycleBase, id: 'analytics.cycle.trend', paramKeys: { granularity: true }, limits: { maxHours: CYCLE_MAX_HOURS },
});

export const cycleDistEndpoint = defineEndpoint<Record<never, true>, CycleDistData>({
  ...cycleBase, id: 'analytics.cycle.dist', paramKeys: {}, limits: { maxHours: CYCLE_MAX_HOURS },
});

/** One page of the slow-execution table (06 §15). */
export const cycleSlowPageEndpoint = defineEndpoint<SlowPageParams, PageResult<SlowRow>>({
  ...cycleBase, id: 'analytics.cycle.slow', limits: { maxHours: CYCLE_MAX_HOURS },
  paramKeys: { tail: true, granularity: true, bucket: true, bin: true, page: true, pageSize: true, sorting: true },
});

/** Page list filters plus an explicit row selection (execution keys, `null` = every filtered row) and the table's active sort for export. */
export type SlowExportFilter = SlowFilter & { ids: string[] | null; sorting: PageSort[] };

/**
 * Every slow row for export, narrowed to the selection ids when given. Permission and Scope are re-checked per
 * request. `mergeTimeDomain` matches the page endpoints (#173 P3-10): export refuses the same cross-time-domain
 * sets the screen refuses. `sorting` is the table's active sort — export order = page order (#173 UX P2-6).
 */
export const cycleExportEndpoint = defineEndpoint<SlowExportFilter, SlowRow[]>({
  ...cycleBase, id: 'analytics.cycle.export',
  paramKeys: { tail: true, granularity: true, bucket: true, bin: true, ids: true, sorting: true },
  // Prototype row cap judged after the ids filter (06 §15); the period cap matches the page endpoints (#175 review P3-6).
  limits: { maxRows: 50_000, maxHours: CYCLE_MAX_HOURS },
});

/** Row key of an execution (equipment + anchor): the table row id and the export selection ids share this codec. */
export function executionKey(row: { equipmentId: string; anchor: string }): string {
  return `${row.equipmentId}|${row.anchor}`;
}
