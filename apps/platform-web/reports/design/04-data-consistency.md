# Screens 11 and 12 — one synthetic job population

Implementation design. Paste the blocks. Do not keep the old per-bucket RNG.

Review: `prototypes/platform-app/reports/review-omp-screens.md` **P1-1, P1-2, P2-2, P2-3**.

Screen 11 (`productivityData.ts`) invents jobs per bucket with `Math.round(jobsPerHour * hours * …)`, so an hour rollup and a day rollup of the same period are different integers, while the chart says they match. Screen 12 (`cycleData.ts` `allExecutions`) invents 3–6 jobs per day with different durations. The same equipment and period cannot be both ~20k completed jobs and ~1k executions.

Designs 1–3 are already applied. Do not edit `server.ts`, the time-domain exports in `world.ts`, `returnTo` / `safeReturnTo`, or `resolveMetric`. Anchor by function name. Tests call the data functions, never `serve()` — a 7-day multi-equipment ICH query is `time_domain_unverified` on purpose.

## Rules you must not reinterpret

- One generator, `src/mock/jobs.ts`, memoized per `(equipmentId, YYYY-MM-DD)`. Both screens read it. Delete the `jobsPerHour` rounding in `aggregateBucket` and the eager `allExecutions` cache.
- A job is one completed execution. Identity (equipment, `anchor`, `end`, recipe, lot, ppid, quality, segments) does not depend on metric version. **Completed count does not depend on version.**
- `cycleMinV3` is process time only. `cycleMinV4 = round1(cycleMinV3 + queueMin)` adds queue wait. Screen 11’s cycle KPI and cycle trend always use **v4** (`METRIC_VERSIONS.cycleTime` stays `'4'`). Screen 12 writes `cycleMinV4` onto `Execution.cycleMin` only when the applied version is `'4'`; every other version, including page default `'3'`, uses `cycleMinV3`.
- When both sides use v4, P50 and P95 are the same function: `jobPercentile` (linear interpolation, then one decimal). Screen 12’s `percentile` delegates to it. Do not leave productivity on the unrounded `quantile`.
- v3 vs v4 may differ in minutes. Counts still match. Both screens show the fixed sentence in `CYCLE_VERSION_NOTE`. Do not “fix” the gap by changing `PAGE_METRIC_VERSION` to `'4'`.
- A job is inside a period iff `from <= anchor < to` and `anchor < DATA_THROUGH` (`2026-09-26T08:00:00`). No second window. No per-bucket re-roll.
- KPI completed jobs = trend sum of `jobs` for `hour`, `day`, and `week`. Unknown buckets (`jobs === null`) add nothing. Keep the subtitle “KPI 카드와 동일 합산” / “same sum as the KPI card”.
- Coarser buckets **sum the same jobs**. They do not draw a new integer for the whole day or week.
- Week buckets start Monday 00:00 naive, via `bucketStart`. Screen 12 accepts `granularity=week`.
- `kpi`, `axis`, and `sort` on screen 11 are the registered page keys. Invalid values use screen 12’s contract message and do not fall back. `null` means the default (`throughput`, `room`, `key:asc`).
- Do not change screen 11’s existing granularity fallback (unknown `granularity` still warns and uses the ≤48h rule). That is not `kpi` / `axis` / `sort`.

## Files to change

| File | What |
| --- | --- |
| `prototypes/platform-app/src/mock/jobs.ts` | **New.** The only generator |
| `prototypes/platform-app/src/pages/analytics/productivityData.ts` | KPIs, trend, breakdown, attention read `jobsInPeriod` |
| `prototypes/platform-app/src/pages/analytics/cycleData.ts` | Population, week buckets, `percentile` → `jobPercentile` |
| `prototypes/platform-app/src/pages/analytics/CycleTimeDrilldown.tsx` | Pass version into `population`; week control; version note |
| `prototypes/platform-app/src/pages/analytics/ExecutionDetail.tsx` | Pass the applied version into `lookupOccurrence` |
| `prototypes/platform-app/src/pages/analytics/ProductivityOverview.tsx` | URL `kpi` / `axis` / `sort`; invalid-key gate; keep the job-total subtitle |
| `prototypes/platform-app/src/mock/jobs.test.ts` | **New.** Full file below |

Do not edit `registry.ts` (the keys `granularity`, `kpi`, `axis`, `sort` are already on `productivity-overview`), `world.ts`, or `server.ts`.

## 1. `src/mock/jobs.ts`

Create this file. It must not import `cycleData.ts` or `productivityData.ts`.

```ts
import { formatDateTime, parseDateTime } from '../kernel/url';
import type { Equipment } from './world';

export const DATA_THROUGH = '2026-09-26T08:00:00';
export type Grain = 'hour' | 'day' | 'week';

export const CYCLE_VERSION_NOTE = {
  ko: '완료 Job 건수는 버전과 무관합니다. 생산성 개요의 사이클타임 분은 cycle_time v4(큐 대기 포함)이고, 사이클타임 상세의 기본 v3는 같은 Job에서 큐 대기만 뺍니다. 그래서 P50·P95는 다를 수 있고 건수는 같습니다.',
  en: 'Completed-job counts ignore version. Productivity cycle-time minutes are cycle_time v4 (queue wait included); cycle-time detail’s default v3 drops only that queue wait on the same jobs, so P50/P95 can differ while the count matches.',
};

export type JobSegment = {
  kind: 'XFR' | 'FNC' | 'PRC';
  module: string;
  slot: string;
  start: string;
  end: string;
  durationMin: number;
};

export type Job = {
  equipmentId: string;
  room: string;
  anchor: string;
  end: string;
  recipe: string;
  lotId: string;
  ppid: string;
  quality: 'unknown' | 'review';
  cycleMinV3: number;
  cycleMinV4: number;
  queueMin: number;
  dwellMin: number;
  occupiedMin: number;
  segments: JobSegment[];
};

const RECIPES = ['RCP-A', 'RCP-B', 'RCP-C', 'RCP-D'] as const;
const PPIDS = ['PPID-100', 'PPID-240', 'PPID-380'] as const;
const dayCache = new Map<string, Job[]>();

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function addSeconds(value: string, seconds: number): string {
  return formatDateTime(new Date(parseDateTime(value, 'anchor').getTime() + seconds * 1000));
}

/** Linear interpolation, then 0.1 min. Both screens call this for cycle P50/P95. */
export function jobPercentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const value = lo === hi ? sorted[lo] : sorted[lo] * (hi - index) + sorted[hi] * (index - lo);
  return round1(value);
}

export function bucketStart(instant: string, grain: Grain): string {
  if (grain === 'hour') return `${instant.slice(0, 13)}:00:00`;
  if (grain === 'day') return `${instant.slice(0, 10)}T00:00:00`;
  const midnight = parseDateTime(`${instant.slice(0, 10)}T00:00:00`, 'day');
  const mondayOffset = (midnight.getUTCDay() + 6) % 7;
  return formatDateTime(new Date(midnight.getTime() - mondayOffset * 86_400_000));
}

function segmentsFor(anchor: string, processMin: number, equipmentId: string): JobSegment[] {
  const total = Math.max(60, Math.round(processMin * 60));
  const xfr = Math.max(20, Math.round(total * 0.12));
  const fnc = Math.max(15, Math.round(total * 0.08));
  const prc = Math.max(20, total - xfr - fnc);
  const moduleA = `MD-${(fnv(equipmentId) % 3) + 1}`;
  const slot = `SL-${(fnv(anchor) % 2) + 1}`;
  let cursor = anchor;
  const out: JobSegment[] = [];
  for (const piece of [
    { kind: 'XFR' as const, seconds: xfr },
    { kind: 'FNC' as const, seconds: fnc },
    { kind: 'PRC' as const, seconds: prc },
  ]) {
    const end = addSeconds(cursor, piece.seconds);
    out.push({ kind: piece.kind, module: moduleA, slot, start: cursor, end, durationMin: round1(piece.seconds / 60) });
    cursor = end;
  }
  return out;
}

/** 2 or 3 jobs per clock hour. Cached per equipment and calendar day. */
export function jobsForEquipmentDay(equipment: Equipment, day: string): Job[] {
  const key = `${equipment.equipmentId}|${day}`;
  const hit = dayCache.get(key);
  if (hit) return hit;
  const perHour = 2 + (fnv(equipment.equipmentId) % 2);
  const jobs: Job[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let j = 0; j < perHour; j++) {
      const rnd = lcg(fnv(`${equipment.equipmentId}|${day}|${hour}|${j}`));
      const anchor = `${day}T${pad(hour)}:${pad(Math.floor(rnd() * 60))}:${pad(Math.floor(rnd() * 60))}`;
      const queueMin = round1(2 + rnd() * 6);
      const processMin = round1(18 + rnd() * 30 + (rnd() < 0.08 ? 20 + rnd() * 30 : 0));
      const segments = segmentsFor(anchor, processMin, equipment.equipmentId);
      jobs.push({
        equipmentId: equipment.equipmentId,
        room: equipment.room,
        anchor,
        end: addSeconds(anchor, Math.round((processMin + queueMin) * 60)),
        recipe: RECIPES[Math.floor(rnd() * RECIPES.length)],
        lotId: `LOT-${day.replace(/-/g, '')}-${equipment.equipmentId}-${hour}-${j + 1}`,
        ppid: PPIDS[Math.floor(rnd() * PPIDS.length)],
        quality: rnd() < 0.15 ? 'review' : 'unknown',
        cycleMinV3: processMin,
        cycleMinV4: round1(processMin + queueMin),
        queueMin,
        dwellMin: queueMin,
        occupiedMin: Math.min(processMin, Math.floor(60 / perHour)),
        segments,
      });
    }
  }
  dayCache.set(key, jobs);
  return jobs;
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from.slice(0, 10);
  const last = to.slice(0, 10);
  while (cursor <= last && days.length < 400) {
    days.push(cursor);
    const next = new Date(parseDateTime(`${cursor}T00:00:00`, 'day').getTime() + 86_400_000);
    cursor = formatDateTime(next).slice(0, 10);
  }
  return days;
}

/** Completed jobs in [from, to) whose anchor is before DATA_THROUGH. */
export function jobsInPeriod(equipment: Equipment[], from: string, to: string): Job[] {
  const out: Job[] = [];
  for (const equipmentRow of equipment) {
    for (const day of eachDay(from, to)) {
      for (const job of jobsForEquipmentDay(equipmentRow, day)) {
        if (job.anchor >= from && job.anchor < to && job.anchor < DATA_THROUGH) out.push(job);
      }
    }
  }
  return out;
}

export function cycleMinutes(job: Job, version: string): number {
  return version === '4' ? job.cycleMinV4 : job.cycleMinV3;
}

/** Hours strictly before DATA_THROUGH that overlap [from, to). */
export function observableHours(from: string, to: string): number {
  const start = parseDateTime(from, 'from').getTime();
  const end = Math.min(parseDateTime(to, 'to').getTime(), parseDateTime(DATA_THROUGH, 'through').getTime());
  if (end <= start) return 0;
  return (end - start) / 3_600_000;
}
```

`occupiedMin` is capped at `60 / perHour` so one hour of jobs cannot occupy more than 60 minutes. Summing jobs is the occupancy numerator. Do not roll occupancy with a second RNG.

## 2. `src/pages/analytics/productivityData.ts`

Import `jobsInPeriod`, `jobPercentile`, `observableHours`, `bucketStart`, `DATA_THROUGH`, and `type Grain` from `../../mock/jobs`. Re-export `DATA_THROUGH` (the constant moves; the name stays). Delete `profileOf`, `cycleMinutes`, `aggregateBucket`, and the `quantile` helper. `Granularity` stays `'hour' | 'day' | 'week'`.

Replace `buckets` so each bucket’s `known` is `observableHours(bucket.from, bucket.to) > 0`. Keep the exported `Bucket` shape. Build bucket edges with `bucketStart` and the same hour/day/week steps as now (1h / 24h / 168h), clipped to `[from, to)`.

`computeKpis(equipment, from, to)`:

- `const jobs = jobsInPeriod(equipment, from, to)`.
- `throughput.jobs` = `jobs.length`.
- `throughput.started` = `jobs.length + jobs.filter(j => fnv(j.equipmentId + '|' + j.anchor) % 20 === 0).length`. Copy `fnv` or export it from `jobs.ts`. This extra is a pure function of the same jobs, not a per-bucket round.
- `cycle.p50` / `p95` = `jobPercentile(jobs.map(j => j.cycleMinV4), 0.5 | 0.95)`. Always v4.
- `dwell` = sum of `dwellMin / 60` over `jobs`, divided by `jobs.length` (null when length is 0).
- `occupancy` numerator = sum of `occupiedMin / 60`. Denominator = `observableHours(from, to) * equipment.length`. `pct = num / den * 100` when den > 0, else null.
- `knownBuckets` = number of **hour** buckets with `observableHours > 0`. `isEmpty` still treats 0 as empty.

`trendBuckets(equipment, from, to, g)`: for each bucket, `const rows = jobs.filter(j => bucketStart(j.anchor, g) === bucket.start)` but only among `jobsInPeriod` (already clipped). If `observableHours(bucket.from, bucket.to) === 0`, emit `known: false` and `jobs: null`, `p50: null`, `p95: null`, `occupancyPct: null`, `dwellPerJobH: null`. Otherwise `known: true`, `jobs: rows.length` (0 is allowed), `p50`/`p95` from `cycleMinV4`, occupancy and dwell from those rows and `observableHours(bucket.from, bucket.to) * equipment.length`.

`occupancyBreakdown`: group `jobsInPeriod` by `room` or `stgroup`. `jobs` is the group length. `occupiedHours` is the group’s `occupiedMin / 60` sum. `observableHours` is `observableHours(from, to) * distinct equipment in the group`. Do not loop hour buckets and re-round.

`attentionRows`: one `jobsInPeriod([e], from, to)` per equipment. `jobs` is that length. `dwellPerJobH` and `p95Min` use `dwellMin` and `jobPercentile(..., cycleMinV4)`. The `n=` on screen 11 is this length. Screen 12’s `population([e], { from, to })` must return the same length.

## 3. `src/pages/analytics/cycleData.ts`

Keep these exports and their names. Design 2 already owns `resolveMetric`; do not rewrite it. `ExecutionDetail` imports `isAnchor`, `lookupOccurrence`, `resolveMetric`, `OccurrenceResult`, `Segment`, `SegmentKind`. Those stay.

- `export type Granularity = 'hour' | 'day' | 'week'`.
- `percentile` body becomes `return jobPercentile(values, p);`.
- `bucketStart` delegates to `jobs.ts` `bucketStart`.
- `bucketEnd`: `shift(start, granularity === 'hour' ? 1 : granularity === 'day' ? 24 : 168)`.
- `enumerateBuckets`: step `1` / `24` / `168` for hour / day / week.
- `resolveGranularity`: accept `'week'` the same way as `'hour'` and `'day'`. Unset still returns hour when `hours <= 48`, otherwise day. Never default to week.

`population(equipment, global, version = '3')` — the third argument is optional so existing callers still typecheck:

```ts
export function population(equipment: Equipment[], global: GlobalContext, version = '3'): Execution[] {
  if (!global.from || !global.to) return [];
  return jobsInPeriod(equipment, global.from, global.to).filter(job => {
    if (global.lotIds !== null && !global.lotIds.includes(job.lotId)) return false;
    if (global.recipeIds !== null && !global.recipeIds.includes(job.recipe)) return false;
    if (global.ppid !== null && job.ppid !== global.ppid) return false;
    return true;
  }).map(job => ({
    equipmentId: job.equipmentId,
    room: job.room,
    recipe: job.recipe,
    lotId: job.lotId,
    ppid: job.ppid,
    anchor: job.anchor,
    cycleMin: version === '4' ? job.cycleMinV4 : job.cycleMinV3,
    quality: job.quality,
  }));
}
```

`findExecution(equipmentId, anchor)` loads `jobsForEquipmentDay` for `EQUIPMENT.find(e => e.equipmentId === equipmentId)` and that anchor’s calendar day. It does not scan every tool. `lookupOccurrence` gains an optional fourth argument `version = '3'` and passes it into the execution it returns (`cycleMin` selected as above). Three-argument calls keep v3 minutes.

`segmentsFor(execution)` returns the job’s `segments` mapped into `Segment`. Do not rebuild a different timeline from `cycleMin`. The classified stages cover process time (v3). The job `end` is v4 (process + queue). The queue gap stays unclassified.

Delete the eager `allExecutions` cache (`WINDOW_FROM` / `WINDOW_TO` loop over every tool). Replace `allExecutions` with a function that is **not** used by `population` or `findExecution`. If you keep the export, implement it as `jobsInPeriod(EQUIPMENT, '2026-06-20T00:00:00', '2026-09-26T09:00:00').map(...)` and do not call it from a page.

## 4. `src/pages/analytics/CycleTimeDrilldown.tsx`

Design 2 gates queries when the metric is unconfirmed. Do not remove that gate.

Every `population(...)` call in this file, including `summarize`, the trend compute, the distribution compute, `loadPage`, and export, passes the applied version:

```ts
const cycleVersion = metric.kind === 'page-default' || metric.kind === 'applied' || metric.kind === 'not-applied'
  ? metric.metricVersion
  : null;
```

`not-applied` still calculates with the page default version (that is the existing page-default number, not v4). `unconfirmed` stays `null` and must not call `population`. `summarize(equipment, global, cycleVersion)` threads it through.

Add a Week control next to Hour and Day. `setPage({ granularity: 'week' })`. Label `주` / `Week`. The invalid-key sentence that says `hour|day` becomes `hour|day|week`. The trend description’s grain word includes week (`주` / `week`).

In `MetricBanner`, after the existing kind branches (keep design 2’s `unconfirmed` branch first):

- If the banner’s version is `'4'`, append `CYCLE_VERSION_NOTE` is the wrong text. Append instead: `분은 생산성 개요의 cycle_time v4와 같습니다.` / `Minutes match productivity’s cycle_time v4.`
- Otherwise append `CYCLE_VERSION_NOTE.ko` / `.en`.

## 5. `src/pages/analytics/ExecutionDetail.tsx`

The `lookupOccurrence(...)` call passes the applied version as the fourth argument when design 2’s `metricVersion` is non-null. When it is null, the query stays disabled (design 2). Do not touch `returnTarget` / `safeReturnTo`.

## 6. `src/pages/analytics/ProductivityOverview.tsx`

Remove `useState` for `selectedKpi`, `axis`, and `sort`.

```ts
const KPI_KEYS = ['occupancy', 'dwell', 'cycleTime', 'throughput'] as const;
const AXES = ['room', 'stgroup'] as const;
const SORT_KEYS = ['key', 'occ', 'obs', 'pct', 'jobs'] as const;

function resolveChoice<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): { ok: true; value: T } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: fallback };
  return (allowed as readonly string[]).includes(raw) ? { ok: true, value: raw as T } : { ok: false };
}
function resolveBreakdownSort(raw: string | null): { ok: true; key: typeof SORT_KEYS[number]; dir: 1 | -1 } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, key: 'key', dir: 1 };
  const match = /^(key|occ|obs|pct|jobs):(asc|desc)$/.exec(raw);
  if (!match) return { ok: false };
  return { ok: true, key: match[1] as typeof SORT_KEYS[number], dir: match[2] === 'asc' ? 1 : -1 };
}
```

Put those next to the component (module scope). Inside the component:

```ts
const kpiResult = resolveChoice(pageParam('kpi'), KPI_KEYS, 'throughput');
const axisResult = resolveChoice(pageParam('axis'), AXES, 'room');
const sortResult = resolveBreakdownSort(pageParam('sort'));
const invalidPage = !kpiResult.ok || !axisResult.ok || !sortResult.ok;
const selectedKpi = kpiResult.ok ? kpiResult.value : 'throughput';
const axis = axisResult.ok ? axisResult.value : 'room';
const sort = sortResult.ok ? { key: sortResult.key, dir: sortResult.dir } : { key: 'key' as const, dir: 1 as const };
const enabled = from !== null && to !== null && scope.status === 'valid' && !invalidPage;
```

`selectedKpi` / `axis` / `sort` are still the names the JSX uses, but they come from the URL. Card click:

```ts
onClick={() => setPage({ kpi: kpi === 'throughput' ? null : kpi })}
```

Axis radio: `setPage({ axis: a === 'room' ? null : a })`. Header sort keeps today’s flip rule (same column flips direction; a new metric column starts at `desc`; `key` starts at `asc`) and writes `` `${key}:${dir === 1 ? 'asc' : 'desc'}` ``, or `null` when that string is `key:asc`.

When `invalidPage`, render the same `StateMessage` screen 12 uses, and do not render `QueryView`s:

```tsx
<StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={ko ? '페이지 키 값이 올바르지 않습니다' : 'Invalid page key'}
  body={ko
    ? `${errors} 은 이 화면의 등록 값이 아닙니다. kpi=occupancy|dwell|cycleTime|throughput, axis=room|stgroup, sort=key|occ|obs|pct|jobs:asc|desc 만 허용하며 다른 값으로 바꾸지 않습니다.`
    : `${errors} is not a registered value. Allowed: kpi=occupancy|dwell|cycleTime|throughput, axis=room|stgroup, sort=key|occ|obs|pct|jobs:asc|desc. Nothing was substituted.`} />
```

`errors` lists only the bad keys, e.g. `kpi=nope`. Import `StateMessage` and `AlertTriangle` if they are not already imported.

Replace the caption “카드를 누르면 아래 추세가 전환됩니다 (페이지 로컬 상태, URL 미기록)…” with: the click writes `kpi`, the axis writes `axis`, the table sort writes `sort`, and deltas are still the previous equal-length period. Under that caption, always render `CYCLE_VERSION_NOTE`.

The axis radiogroup’s `aria-label` currently says “페이지 로컬”. Change it to “URL 키 axis” / “URL key axis”.

Leave the throughput chart subtitle parenthetical in place.

## 7. Tests

Create `prototypes/platform-app/src/mock/jobs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '../kernel/url';
import { computeKpis, trendBuckets } from '../pages/analytics/productivityData';
import { percentile, population } from '../pages/analytics/cycleData';
import { EQUIPMENT } from './world';
import { cycleMinutes, jobsInPeriod } from './jobs';

const FROM = '2026-09-20T00:00:00';
const TO = '2026-09-25T00:00:00';
const DAY_FROM = '2026-09-25T09:00:00';
const DAY_TO = '2026-09-26T09:00:00';

function ich(room?: string) {
  return EQUIPMENT.filter(e => e.site === 'ICH' && (!room || e.room === room)).slice(0, room ? 4 : 6);
}

describe('screen 11 and 12 share one job population', () => {
  it('matches completed counts for several equipment sets and periods', () => {
    const cases = [
      { equipment: ich('PH-101'), from: FROM, to: TO },
      { equipment: ich('ET-102').slice(0, 1), from: FROM, to: TO },
      { equipment: ich(), from: DAY_FROM, to: DAY_TO },
    ];
    for (const { equipment, from, to } of cases) {
      const jobs = jobsInPeriod(equipment, from, to);
      const kpi = computeKpis(equipment, from, to);
      const v3 = population(equipment, { ...emptyGlobal, from, to }, '3');
      const v4 = population(equipment, { ...emptyGlobal, from, to }, '4');
      expect(jobs.length).toBeGreaterThan(0);
      expect(kpi.throughput.jobs).toBe(jobs.length);
      expect(v3.length).toBe(jobs.length);
      expect(v4.length).toBe(jobs.length);
      expect(v3.map(row => row.anchor).sort()).toEqual(v4.map(row => row.anchor).sort());
      expect(v3.some((row, i) => row.cycleMin !== v4[i].cycleMin)).toBe(true);
    }
  });

  it('matches v4 P50/P95 and keeps v3 minutes different', () => {
    const equipment = ich('PH-101').slice(0, 2);
    const kpi = computeKpis(equipment, FROM, TO);
    const v4 = population(equipment, { ...emptyGlobal, from: FROM, to: TO }, '4');
    const v3 = population(equipment, { ...emptyGlobal, from: FROM, to: TO }, '3');
    expect(percentile(v4.map(row => row.cycleMin), 0.5)).toBe(kpi.cycle.p50);
    expect(percentile(v4.map(row => row.cycleMin), 0.95)).toBe(kpi.cycle.p95);
    expect(percentile(v3.map(row => row.cycleMin), 0.5)).not.toBe(kpi.cycle.p50);
    expect(v4.every((row, i) => row.cycleMin >= v3[i].cycleMin)).toBe(true);
  });

  it('sums the same jobs at hour, day, and week', () => {
    const equipment = ich('PH-101').slice(0, 3);
    const kpi = computeKpis(equipment, FROM, TO);
    for (const grain of ['hour', 'day', 'week'] as const) {
      const total = trendBuckets(equipment, FROM, TO, grain).reduce((sum, bucket) => sum + (bucket.jobs ?? 0), 0);
      expect(total).toBe(kpi.throughput.jobs);
    }
  });

  it('uses v4 minutes only when the version is 4', () => {
    const equipment = ich().slice(0, 1);
    const [job] = jobsInPeriod(equipment, DAY_FROM, DAY_TO);
    expect(cycleMinutes(job, '4')).toBe(job.cycleMinV4);
    expect(cycleMinutes(job, '3')).toBe(job.cycleMinV3);
    expect(job.cycleMinV4).toBeGreaterThan(job.cycleMinV3);
    expect(job.anchor < '2026-09-26T08:00:00').toBe(true);
  });
});
```

`population` maps `jobsInPeriod` in generator order, and the v3 and v4 calls use that same order, so comparing `cycleMin` by index is valid. Do not sort those two arrays before the compare. The anchor-sort assertion above is only for identity.

## Acceptance

From `prototypes/platform-app`:

```sh
npx tsc --noEmit
npx vitest run src/mock/jobs.test.ts
npx vitest run
```

All three must pass. A failure here is a wrong generator, not a reason to call `serve()`.

Browser: `npm run dev` (`http://127.0.0.1:5173`, or the port Vite prints). Role **공정 엔지니어**. Scenario **정상**. Use a **1-day** multi-equipment URL so the time-domain guard does not error: `from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&scopeId=ICH`. For a longer window, add one `selectedEquipmentIds` (a single tool is allowed through the 7-day guard).

1. `/analytics/productivity?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00` — throughput card Job count equals the trend subtitle total on **시간**, **일**, and **주**. The subtitle still says **KPI 카드와 동일 합산**. The version note under the KPI heading is the `CYCLE_VERSION_NOTE` sentence.
2. Same URL plus `&granularity=week`. Week is selected. The subtitle total is unchanged.
3. Same URL plus `&kpi=cycleTime&axis=stgroup&sort=occ:desc`. Reload. The cycle trend is selected, the breakdown axis is StGroup, and the occupied-hours column is descending. The address bar still has those three keys.
4. `&kpi=nope` — title **페이지 키 값이 올바르지 않습니다**, body contains `kpi=nope`, and the KPI cards are absent. The URL is not rewritten to `throughput`.
5. Open cycle time for the same scope, period, and no selection: `/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00`. Execution count equals the productivity throughput count from step 1. The banner includes the v3-vs-v4 sentence. P50/P95 need not equal the productivity cycle card.
6. Add `&metricId=cycle_time&metricVersion=4` (design 2 will leave a finished pair alone). After load, P50 and P95 match the productivity cycle card for that same URL without a conflicting version, and the banner says the minutes match v4. The execution count is unchanged.
7. `/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&granularity=week` — Week is selected, not **Invalid page key**.
8. From productivity, open one attention row’s **사이클타임 상세** link (it sets one `selectedEquipmentIds`). That page’s execution count equals the `n=` on the attention row.

Desktop width is enough.

## Not in this task

- The time-domain guard, metric-pair initialization, and `returnTo` allowlist.
- Changing `PAGE_METRIC_VERSION` from `'3'` to `'4'`.
- Making screen 11’s unknown `granularity` a hard error (it already warns and falls back).
- P2-1 metric-catalog `features.export`.
- Lot/ppid/recipe filters on screen 11 (lot is unsupported there). Screen 12 still applies them inside `population`.
- Bucket and histogram filters on screen 12 (still local state).
- Replacing occupancy or dwell definitions in the wireframe. They move onto the shared jobs; the published formulas stay Candidate.
