/**
 * Synthetic productivity metrics for the Overview screen (wireframe 11).
 * Both productivity and cycle-time detail read the same deterministic job population;
 * metric definitions remain prototype Candidates (docs/11 §6).
 */
import { formatDateTime, parseDateTime } from '@ap/contracts';
import {
  bucketStart, DATA_THROUGH, jobPercentile, jobsInPeriod, observableHours,
  type Grain, type Job,
} from '../api';
import type { Equipment } from '../api';

export { DATA_THROUGH };

export type Granularity = Grain;
export type KpiKey = 'occupancy' | 'dwell' | 'cycleTime' | 'throughput';

/** Candidate metric versions (wireframe 11 §3.1); the registry has no page-owned version keys yet. */
export const METRIC_VERSIONS: Record<KpiKey, string> = {
  occupancy: '3', dwell: '2', cycleTime: '4', throughput: '1',
};

const HOUR = 3_600_000;

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Bucket boundaries are absolute naive wall-clock: hour → hour, day → midnight, week → Monday 00:00. */
export type Bucket = { start: string; from: number; to: number; known: boolean };

export function buckets(from: string, to: string, g: Granularity): Bucket[] {
  const t0 = parseDateTime(from, 'from').getTime();
  const t1 = parseDateTime(to, 'to').getTime();
  const step = g === 'hour' ? HOUR : g === 'day' ? 24 * HOUR : 168 * HOUR;
  const first = parseDateTime(bucketStart(from, g), 'bucketStart').getTime();
  const out: Bucket[] = [];
  for (let startMs = first; startMs < t1; startMs += step) {
    const bucketFrom = Math.max(startMs, t0);
    const bucketTo = Math.min(startMs + step, t1);
    const fromValue = formatDateTime(new Date(bucketFrom));
    const toValue = formatDateTime(new Date(bucketTo));
    out.push({
      start: formatDateTime(new Date(startMs)),
      from: bucketFrom,
      to: bucketTo,
      known: observableHours(fromValue, toValue) > 0,
    });
  }
  return out;
}

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

export function computeKpis(equipment: Equipment[], from: string, to: string): KpiSet {
  const jobs = jobsInPeriod(equipment, from, to);
  const dwellHours = jobs.reduce((sum, job) => sum + job.dwellMin / 60, 0);
  const occupiedHours = jobs.reduce((sum, job) => sum + job.occupiedMin / 60, 0);
  const observable = observableHours(from, to) * equipment.length;
  const started = jobs.length + jobs.filter(job => fnv(job.equipmentId + '|' + job.anchor) % 20 === 0).length;
  const cycleValues = jobs.map(job => job.cycleMinV4);
  return {
    equipmentCount: equipment.length,
    knownBuckets: buckets(from, to, 'hour').filter(bucket => bucket.known).length,
    occupancy: observable > 0 ? { num: occupiedHours, den: observable, pct: (occupiedHours / observable) * 100 } : null,
    dwell: jobs.length ? { hours: dwellHours, jobs: jobs.length, perJobH: dwellHours / jobs.length } : null,
    cycle: { jobs: jobs.length, p50: jobPercentile(cycleValues, 0.5), p95: jobPercentile(cycleValues, 0.95) },
    throughput: { jobs: jobs.length, started },
  };
}

export type TrendBucket = {
  start: string; known: boolean;
  occupancyPct: number | null; dwellPerJobH: number | null;
  jobs: number | null; p50: number | null; p95: number | null;
};

/** Per-bucket values are sums and percentiles over the same clipped job population. */
export function trendBuckets(equipment: Equipment[], from: string, to: string, g: Granularity): TrendBucket[] {
  const jobs = jobsInPeriod(equipment, from, to);
  return buckets(from, to, g).map(bucket => {
    const fromValue = formatDateTime(new Date(bucket.from));
    const toValue = formatDateTime(new Date(bucket.to));
    const hours = observableHours(fromValue, toValue);
    if (hours === 0) {
      return { start: bucket.start, known: false, jobs: null, p50: null, p95: null, occupancyPct: null, dwellPerJobH: null };
    }
    const rows = jobs.filter(job => bucketStart(job.anchor, g) === bucket.start);
    const occupiedHours = rows.reduce((sum, job) => sum + job.occupiedMin / 60, 0);
    const dwellHours = rows.reduce((sum, job) => sum + job.dwellMin / 60, 0);
    const denominator = hours * equipment.length;
    const values = rows.map(job => job.cycleMinV4);
    return {
      start: bucket.start,
      known: true,
      jobs: rows.length,
      p50: jobPercentile(values, 0.5),
      p95: jobPercentile(values, 0.95),
      occupancyPct: denominator > 0 ? (occupiedHours / denominator) * 100 : null,
      dwellPerJobH: rows.length ? dwellHours / rows.length : null,
    };
  });
}

export type BreakdownRow = { key: string; equipmentCount: number; occupiedHours: number; observableHours: number; jobs: number };

/** Occupancy composition per room_name or StGroup, grouped from the shared job population. */
export function occupancyBreakdown(equipment: Equipment[], from: string, to: string, axis: 'room' | 'stgroup'): BreakdownRow[] {
  const equipmentById = new Map(equipment.map(row => [row.equipmentId, row]));
  const groups = new Map<string, { equipmentIds: Set<string>; occupiedHours: number; jobs: number }>();
  for (const job of jobsInPeriod(equipment, from, to)) {
    const key = axis === 'room' ? job.room : equipmentById.get(job.equipmentId)?.stgroup ?? 'unknown';
    let group = groups.get(key);
    if (!group) {
      group = { equipmentIds: new Set(), occupiedHours: 0, jobs: 0 };
      groups.set(key, group);
    }
    group.equipmentIds.add(job.equipmentId);
    group.occupiedHours += job.occupiedMin / 60;
    group.jobs++;
  }
  const hours = observableHours(from, to);
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      equipmentCount: group.equipmentIds.size,
      occupiedHours: group.occupiedHours,
      observableHours: hours * group.equipmentIds.size,
      jobs: group.jobs,
    }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export type AttentionRow = {
  equipmentId: string; name: string; room: string; stgroup: string; jobs: number;
  kind: 'dwell' | 'p95'; dwellPerJobH: number | null; p95Min: number | null;
};

/** Top equipment by non-process dwell per job and by slowest pooled P95. Ranking only. */
export function attentionRows(equipment: Equipment[], from: string, to: string, topN = 3): AttentionRow[] {
  const per = equipment.map(e => {
    const jobs: Job[] = jobsInPeriod([e], from, to);
    const dwellHours = jobs.reduce((sum, job) => sum + job.dwellMin / 60, 0);
    return {
      e,
      jobs: jobs.length,
      dwellPerJobH: jobs.length ? dwellHours / jobs.length : null,
      p95Min: jobPercentile(jobs.map(job => job.cycleMinV4), 0.95),
    };
  });
  const base = (x: typeof per[number], kind: AttentionRow['kind']): AttentionRow => ({
    equipmentId: x.e.equipmentId, name: x.e.name, room: x.e.room, stgroup: x.e.stgroup, jobs: x.jobs, kind,
    dwellPerJobH: x.dwellPerJobH, p95Min: x.p95Min,
  });
  const dwell = per.filter(x => x.dwellPerJobH !== null).sort((a, b) => (b.dwellPerJobH ?? 0) - (a.dwellPerJobH ?? 0)).slice(0, topN).map(x => base(x, 'dwell'));
  const slow = per.filter(x => x.p95Min !== null).sort((a, b) => (b.p95Min ?? 0) - (a.p95Min ?? 0)).slice(0, topN).map(x => base(x, 'p95'));
  return [...dwell, ...slow];
}
