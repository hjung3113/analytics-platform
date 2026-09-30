/**
 * Analytics query endpoints (docs/integration/menu-query-port.md §2.2, #114–#115).
 * Client-safe: declarations, params/data types and display constants only — computation
 * handlers live in `src/mock/` and never enter the client bundle.
 * Pages import from here, never from `src/mock/**`.
 */
import { defineEndpoint } from '@ap/contracts';

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
