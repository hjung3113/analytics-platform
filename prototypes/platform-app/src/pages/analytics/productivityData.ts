/**
 * Synthetic productivity metrics for the Overview screen (wireframe 11).
 * All metric definitions (numerator/denominator, Job attribution, coverage, versions) are
 * prototype Candidates — docs/11 §6 keeps them Open. Values are deterministic: every number
 * derives from seeded generators keyed by equipmentId + bucket start, so the same Context
 * always yields the same numbers (no Date.now / Math.random).
 *
 * Additivity invariant: period KPIs are the sum of the same hour buckets the trend charts
 * read, so the trend total always equals the KPI card (wireframe 11 §4).
 */
import type { Equipment } from '../../mock/world';
import { formatDateTime, parseDateTime } from '../../kernel/url';

export type Granularity = 'hour' | 'day' | 'week';
export type KpiKey = 'occupancy' | 'dwell' | 'cycleTime' | 'throughput';

/** Candidate metric versions (wireframe 11 §3.1); the registry has no page-owned version keys yet. */
export const METRIC_VERSIONS: Record<KpiKey, string> = {
  occupancy: '3', dwell: '2', cycleTime: '4', throughput: '1',
};

/** Mirrors the mock server's trust.dataThrough; buckets ending after it are unknown (§19), never 0. */
export const DATA_THROUGH = '2026-09-26T08:00:00';

const HOUR = 3_600_000;
const dataThroughMs = parseDateTime(DATA_THROUGH, 'dataThrough').getTime();

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

type Profile = { occRate: number; jobsPerHour: number; dwellPerJobMin: number; cycleMedianMin: number; tailSpread: number; dropRate: number };
const profiles = new Map<string, Profile>();
function profileOf(e: Equipment): Profile {
  const cached = profiles.get(e.equipmentId);
  if (cached) return cached;
  const r = lcg(fnv(e.equipmentId));
  const p: Profile = {
    occRate: 0.42 + r() * 0.36,          // physical occupancy 42–78%
    jobsPerHour: 1.5 + r() * 3.5,        // completed jobs per hour
    dwellPerJobMin: 6 + r() * 26,        // non-process dwell minutes per job
    cycleMedianMin: 28 + r() * 34,       // job cycle-time median (minutes)
    tailSpread: 1.35 + r() * 0.75,       // slow-tail multiplier spread
    dropRate: 0.005 + r() * 0.03,        // started-but-not-counted share (coverage denominator)
  };
  profiles.set(e.equipmentId, p);
  return p;
}

function cycleMinutes(p: Profile, r: () => number): number {
  const base = p.cycleMedianMin * (0.8 + r() * 0.45);
  return r() < 0.08 ? base * p.tailSpread * (1.05 + r() * 0.6) : base;
}

/** Bucket boundaries are absolute naive wall-clock: hour → hour, day → midnight, week → Monday 00:00 (week start is Open; Monday is the Candidate). Partial buckets at both ends are clipped and attributed to their aligned bucket. */
function align(t: number, g: Granularity): number {
  const d = new Date(t);
  if (g === 'hour') { d.setUTCMinutes(0, 0, 0); return d.getTime(); }
  d.setUTCHours(0, 0, 0, 0);
  if (g === 'week') d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.getTime();
}

export type Bucket = { start: string; from: number; to: number; known: boolean };

export function buckets(from: string, to: string, g: Granularity): Bucket[] {
  const t0 = parseDateTime(from, 'from').getTime();
  const t1 = parseDateTime(to, 'to').getTime();
  const step = g === 'hour' ? HOUR : g === 'day' ? 24 * HOUR : 168 * HOUR;
  const out: Bucket[] = [];
  for (let s = align(t0, g); s < t1; s += step) {
    const end = Math.min(s + step, t1);
    out.push({ start: formatDateTime(new Date(s)), from: Math.max(s, t0), to: end, known: end <= dataThroughMs });
  }
  return out;
}

type BucketAgg = {
  start: string; known: boolean; hours: number; equipmentCount: number;
  jobs: number; started: number; occupiedHours: number; observableHours: number; dwellHours: number;
  durations: number[];
};

function aggregateBucket(equipment: Equipment[], b: Bucket, withDurations: boolean): BucketAgg {
  const agg: BucketAgg = { start: b.start, known: b.known, hours: (b.to - b.from) / HOUR, equipmentCount: equipment.length, jobs: 0, started: 0, occupiedHours: 0, observableHours: 0, dwellHours: 0, durations: [] };
  if (!b.known) return agg; // unknown bucket: no fabricated zeros (§19)
  for (const e of equipment) {
    const p = profileOf(e);
    const r = lcg(fnv(e.equipmentId + '|' + b.start));
    const effHours = (b.to - b.from) / HOUR;
    const jobs = Math.max(0, Math.round(p.jobsPerHour * effHours * (0.7 + r() * 0.6)));
    agg.occupiedHours += Math.min(effHours, p.occRate * effHours * (0.9 + r() * 0.2));
    agg.observableHours += effHours;
    for (let j = 0; j < jobs; j++) {
      const rj = lcg(fnv(e.equipmentId + '|' + b.start + '|' + j));
      if (withDurations) agg.durations.push(cycleMinutes(p, rj));
      agg.dwellHours += p.dwellPerJobMin * (0.7 + rj() * 0.7) / 60;
    }
    agg.jobs += jobs;
    agg.started += jobs > 0 ? jobs / (1 - p.dropRate) : 0;
  }
  return agg;
}

function rollup(equipment: Equipment[], from: string, to: string, g: Granularity, withDurations: boolean): BucketAgg[] {
  return buckets(from, to, g).map(b => aggregateBucket(equipment, b, withDurations));
}

/** P-values over the pooled job population (docs/11 §6: never average per-equipment/day P95s). */
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
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
  const aggs = rollup(equipment, from, to, 'hour', true);
  const known = aggs.filter(a => a.known);
  const sum = (f: (a: BucketAgg) => number) => known.reduce((acc, a) => acc + f(a), 0);
  const jobs = sum(a => a.jobs);
  const den = sum(a => a.observableHours);
  const durations = known.flatMap(a => a.durations);
  return {
    equipmentCount: equipment.length,
    knownBuckets: known.length,
    occupancy: den > 0 ? { num: sum(a => a.occupiedHours), den, pct: (sum(a => a.occupiedHours) / den) * 100 } : null,
    dwell: jobs > 0 ? { hours: sum(a => a.dwellHours), jobs, perJobH: sum(a => a.dwellHours) / jobs } : null,
    cycle: { jobs, p50: quantile(durations, 0.5), p95: quantile(durations, 0.95) },
    throughput: { jobs, started: sum(a => a.started) },
  };
}

export type TrendBucket = {
  start: string; known: boolean;
  occupancyPct: number | null; dwellPerJobH: number | null;
  jobs: number | null; p50: number | null; p95: number | null;
};

/** Per-bucket series values at the page-owned granularity. Unknown buckets carry nulls, not zeros. */
export function trendBuckets(equipment: Equipment[], from: string, to: string, g: Granularity): TrendBucket[] {
  return rollup(equipment, from, to, g, true).map(a => ({
    start: a.start,
    known: a.known,
    occupancyPct: a.known && a.observableHours > 0 ? (a.occupiedHours / a.observableHours) * 100 : null,
    dwellPerJobH: a.known && a.jobs > 0 ? a.dwellHours / a.jobs : null,
    jobs: a.known ? a.jobs : null,
    p50: quantile(a.durations, 0.5),
    p95: quantile(a.durations, 0.95),
  }));
}

export type BreakdownRow = { key: string; equipmentCount: number; occupiedHours: number; observableHours: number; jobs: number };

/** Occupancy composition per room_name or StGroup (deterministic; sorted by key). */
export function occupancyBreakdown(equipment: Equipment[], from: string, to: string, axis: 'room' | 'stgroup'): BreakdownRow[] {
  const groups = new Map<string, { rows: BreakdownRow; ids: Set<string> }>();
  for (const b of buckets(from, to, 'hour')) {
    if (!b.known) continue;
    const effHours = (b.to - b.from) / HOUR;
    for (const e of equipment) {
      const key = axis === 'room' ? e.room : e.stgroup;
      const r = lcg(fnv(e.equipmentId + '|' + b.start));
      const jobs = Math.max(0, Math.round(profileOf(e).jobsPerHour * effHours * (0.7 + r() * 0.6)));
      const occupied = Math.min(effHours, profileOf(e).occRate * effHours * (0.9 + r() * 0.2));
      let g = groups.get(key);
      if (!g) { g = { rows: { key, equipmentCount: 0, occupiedHours: 0, observableHours: 0, jobs: 0 }, ids: new Set() }; groups.set(key, g); }
      g.rows.occupiedHours += occupied;
      g.rows.observableHours += effHours;
      g.rows.jobs += jobs;
      g.ids.add(e.equipmentId);
    }
  }
  return [...groups.values()].map(g => ({ ...g.rows, equipmentCount: g.ids.size })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export type AttentionRow = {
  equipmentId: string; name: string; room: string; stgroup: string; jobs: number;
  kind: 'dwell' | 'p95'; dwellPerJobH: number | null; p95Min: number | null;
};

/** Top equipment by non-process dwell per job and by slowest pooled P95. Ranking only — no threshold verdicts (wireframe 11 §1). */
export function attentionRows(equipment: Equipment[], from: string, to: string, topN = 3): AttentionRow[] {
  const per = equipment.map(e => {
    let dwellHours = 0; let jobs = 0; const durations: number[] = [];
    for (const b of buckets(from, to, 'hour')) {
      if (!b.known) continue;
      const agg = aggregateBucket([e], b, true);
      dwellHours += agg.dwellHours; jobs += agg.jobs; durations.push(...agg.durations);
    }
    return { e, jobs, dwellPerJobH: jobs > 0 ? dwellHours / jobs : null, p95Min: quantile(durations, 0.95) };
  });
  const base = (x: typeof per[number], kind: AttentionRow['kind']): AttentionRow => ({
    equipmentId: x.e.equipmentId, name: x.e.name, room: x.e.room, stgroup: x.e.stgroup, jobs: x.jobs, kind,
    dwellPerJobH: x.dwellPerJobH, p95Min: x.p95Min,
  });
  const dwell = per.filter(x => x.dwellPerJobH !== null).sort((a, b) => (b.dwellPerJobH ?? 0) - (a.dwellPerJobH ?? 0)).slice(0, topN).map(x => base(x, 'dwell'));
  const slow = per.filter(x => x.p95Min !== null).sort((a, b) => (b.p95Min ?? 0) - (a.p95Min ?? 0)).slice(0, topN).map(x => base(x, 'p95'));
  return [...dwell, ...slow];
}
