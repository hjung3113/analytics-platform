/**
 * Synthetic cycle-time executions for the cycle-time drilldown.
 * Seeded from EQUIPMENT. Not parser data. Percentile, bins, timeline and quality
 * are Candidate choices — see the page captions. Anchors stay second-precision
 * strings and are never shortened to join or display.
 */
import { formatDateTime, parseDateTime, shift, type GlobalContext } from '../../kernel/url';
import { EQUIPMENT, type Equipment } from '../../mock/world';

export const PAGE_METRIC_ID = 'cycle_time';
export const PAGE_METRIC_VERSION = '3';
/** Analysis page passes this to serve() so the 90-day contract link is too_large. */
export const MAX_HOURS = 24 * 31;

const WINDOW_FROM = '2026-06-20T00:00:00';
const WINDOW_TO = '2026-09-26T09:00:00';
const RECIPES = ['RCP-A', 'RCP-B', 'RCP-C', 'RCP-D'] as const;
const PPIDS = ['PPID-100', 'PPID-240', 'PPID-380'] as const;

export type Granularity = 'hour' | 'day';
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
  if (raw === 'hour' || raw === 'day') return { ok: true, value: raw, explicit: true };
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
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const value = lo === hi ? sorted[lo] : sorted[lo] * (hi - index) + sorted[hi] * (index - lo);
  return round1(value);
}

export function addSeconds(value: string, seconds: number): string {
  return formatDateTime(new Date(parseDateTime(value, 'anchor').getTime() + seconds * 1000));
}

export function previousWindow(from: string, to: string): { from: string; to: string } {
  const span = parseDateTime(to, 'to').getTime() - parseDateTime(from, 'from').getTime();
  return { from: formatDateTime(new Date(parseDateTime(from, 'from').getTime() - span)), to: from };
}

export function bucketStart(anchor: string, granularity: Granularity): string {
  return granularity === 'hour' ? `${anchor.slice(0, 13)}:00:00` : `${anchor.slice(0, 10)}T00:00:00`;
}

export function bucketEnd(start: string, granularity: Granularity): string {
  return shift(start, granularity === 'hour' ? 1 : 24);
}

export function bucketContaining(instant: string, granularity: Granularity): string | null {
  if (!isAnchor(instant)) return null;
  return bucketStart(instant, granularity);
}

export function enumerateBuckets(from: string, to: string, granularity: Granularity): string[] {
  const out: string[] = [];
  let cursor = bucketStart(from, granularity);
  const step = granularity === 'hour' ? 1 : 24;
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
export function population(equipment: Equipment[], global: GlobalContext): Execution[] {
  if (!global.from || !global.to) return [];
  const ids = new Set(equipment.map(equipment => equipment.equipmentId));
  const from = global.from;
  const to = global.to;
  const lots = global.lotIds;
  const recipes = global.recipeIds;
  const ppid = global.ppid;
  return allExecutions().filter(row => {
    if (!ids.has(row.equipmentId)) return false;
    if (row.anchor < from || row.anchor >= to) return false;
    if (lots !== null && !lots.includes(row.lotId)) return false;
    if (recipes !== null && !recipes.includes(row.recipe)) return false;
    if (ppid !== null && row.ppid !== ppid) return false;
    return true;
  });
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

export function findExecution(equipmentId: string, anchor: string): Execution | null {
  allExecutions();
  return byKey.get(executionKey({ equipmentId, anchor })) ?? null;
}

/**
 * Identity lookup. `equipment` must already be the grant set (selection/room/period not applied).
 * An id that exists but is outside that set is forbidden; an unknown id or unknown anchor is missing.
 * Neither case is replaced with a nearby execution.
 */
export function lookupOccurrence(equipment: Equipment[], equipmentId: string, anchor: string): OccurrenceResult {
  if (equipment.length === 0) return { access: 'missing' };
  const known = EQUIPMENT.some(item => item.equipmentId === equipmentId);
  const granted = equipment.some(item => item.equipmentId === equipmentId);
  if (known && !granted) return { access: 'forbidden' };
  if (!granted) return { access: 'missing' };
  const execution = findExecution(equipmentId, anchor);
  if (!execution) return { access: 'missing' };
  return { access: 'ok', execution, segments: segmentsFor(execution) };
}

/** Candidate timeline: one job split into XFR/FNC/PRC. Gaps are unclassified, not wait or scrap. */
export function segmentsFor(execution: Execution): Segment[] {
  const rnd = rng(hash(`${execution.equipmentId}|${execution.anchor}|timeline`));
  const total = Math.max(90, Math.round(execution.cycleMin * 60));
  const xfr = clamp(Math.round(total * (0.08 + rnd() * 0.04)), 20, total);
  const fnc = clamp(Math.round(total * (0.06 + rnd() * 0.04)), 15, total - xfr);
  const prc1 = clamp(Math.round(total * (0.28 + rnd() * 0.1)), 30, Math.max(30, total - xfr - fnc));
  const remain = total - xfr - fnc - prc1;
  const gapBudget = Math.max(0, Math.round(remain * 0.22));
  const prc2 = remain - gapBudget;
  const gap1 = Math.round(gapBudget * 0.45);
  const gap2 = gapBudget - gap1;
  const moduleA = `MD-${(hash(execution.equipmentId) % 3) + 1}`;
  const slotA = `SL-${(hash(execution.anchor) % 2) + 1}`;
  const moduleB = `MD-${(hash(execution.equipmentId + ':b') % 3) + 1}`;
  const slotB = slotA === 'SL-1' ? 'SL-2' : 'SL-1';
  const pieces: { kind: SegmentKind | 'gap'; seconds: number; module: string; slot: string }[] = prc2 >= 20
    ? [
        { kind: 'XFR', seconds: xfr, module: moduleA, slot: slotA },
        { kind: 'gap', seconds: gap1, module: moduleA, slot: slotA },
        { kind: 'FNC', seconds: fnc, module: moduleA, slot: slotA },
        { kind: 'PRC', seconds: prc1, module: moduleA, slot: slotA },
        { kind: 'gap', seconds: gap2, module: moduleB, slot: slotB },
        { kind: 'PRC', seconds: prc2, module: moduleB, slot: slotB },
      ]
    : [
        { kind: 'XFR', seconds: xfr, module: moduleA, slot: slotA },
        { kind: 'gap', seconds: gap1, module: moduleA, slot: slotA },
        { kind: 'FNC', seconds: fnc, module: moduleA, slot: slotA },
        { kind: 'PRC', seconds: prc1 + Math.max(0, prc2), module: moduleA, slot: slotA },
        { kind: 'gap', seconds: gap2, module: moduleA, slot: slotA },
      ];
  let cursor = execution.anchor;
  const segments: Segment[] = [];
  for (const piece of pieces) {
    const end = addSeconds(cursor, piece.seconds);
    if (piece.kind !== 'gap' && piece.seconds > 0) {
      segments.push({
        kind: piece.kind,
        module: piece.module,
        slot: piece.slot,
        start: cursor,
        end,
        durationMin: round1(piece.seconds / 60),
      });
    }
    cursor = end;
  }
  return segments;
}

let cache: Execution[] | null = null;
let byKey = new Map<string, Execution>();

export function allExecutions(): Execution[] {
  if (cache) return cache;
  const rows: Execution[] = [];
  const days: string[] = [];
  for (let cursor = WINDOW_FROM; cursor < WINDOW_TO; cursor = shift(cursor, 24)) days.push(cursor.slice(0, 10));
  for (const equipment of EQUIPMENT) {
    const seen = new Set<string>();
    const perDay = 3 + (hash(equipment.equipmentId) % 4);
    for (const day of days) {
      for (let index = 0; index < perDay; index++) {
        const rnd = rng(hash(`${equipment.equipmentId}|${day}|${index}`));
        const hour = Math.floor(rnd() * 24);
        const minute = Math.floor(rnd() * 60);
        const second = Math.floor(rnd() * 60);
        let anchor = `${day}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
        while (seen.has(anchor)) anchor = addSeconds(anchor, 1);
        if (anchor < WINDOW_FROM || anchor >= WINDOW_TO) continue;
        seen.add(anchor);
        const personality = 28 + (hash(equipment.equipmentId) % 25);
        const cycleMin = round1(Math.max(8, personality + rnd() * 18 + (rnd() < 0.07 ? 30 + rnd() * 80 : 0)));
        const recipe = RECIPES[Math.floor(rnd() * RECIPES.length)];
        const ppid = PPIDS[Math.floor(rnd() * PPIDS.length)];
        rows.push({
          equipmentId: equipment.equipmentId,
          room: equipment.room,
          recipe,
          lotId: `LOT-${day.replace(/-/g, '')}-${equipment.equipmentId}-${index + 1}`,
          ppid,
          anchor,
          cycleMin,
          quality: rnd() < 0.15 ? 'review' : 'unknown',
        });
      }
    }
  }
  cache = rows;
  byKey = new Map(rows.map(row => [executionKey(row), row]));
  return cache;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hash(value: string): number {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ (char.codePointAt(0) ?? 0), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
