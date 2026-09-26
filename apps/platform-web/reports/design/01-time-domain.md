# P0-2 — Multi-equipment time-domain merge guard

Implementation design for a less capable implementer. Paste the blocks below. Do not invent a second rule.

Contract: `docs/06_platform_ui_contract.md` §6.3 paragraph **복수 설비 시간축 병합 가드**. Review: `prototypes/platform-app/reports/review-grok-kernel.md` **P0-2**.

`serve()` today never checks a time domain. Engineer + `scopeId=ICH` + a period returns `outcome: 'ok'` for many equipment, and a declared `time_domain` assessment falls through to `{ state: 'unknown', reason: 'source_unavailable' }` (`src/mock/server.ts`). That unknown chip does not stop the merge. §6.3 forbids that disguise.

## Rules you must not reinterpret

- Assertions are server-owned. `scopeId` is not proof. There is no client `timeDomainId`. Do not add a URL key.
- Tuple is `(equipmentId, timeDomainId, validFrom, validTo)`. Range is half-open `[validFrom, validTo)` on the equipment's naive wall-clock (`YYYY-MM-DDTHH:mm:ss`). Compare with `parseDateTime` from `src/kernel/url.ts` (UTC-labelled container). Do not use `new Date(string)` or `Date.now()`.
- A merge is a query that places **2 or more resolved equipment** on one requested `[from, to)`. It is allowed only when every one of those equipment is covered for the whole request by assertions whose `timeDomainId` is exactly one value. A domain change inside one equipment across the request is a conflict, not coverage to stretch.
- A gap (including "no rows") is `time_domain_unverified`. A full cover with two or more domain ids is `time_domain_mismatch`. If any equipment has a gap, the code is **unverified even if another equipment has a different domain**. Do not flip that order.
- Both are `outcome: 'error'`, `data: null`, `assessments: []`, `trust: null`, plus the existing `correlationId`. Not `empty`, not `unknown`, not ok-with-a-warning. Do not call `compute` on that path.
- `message` is exactly `` `${code}: ${detail}` ``. Detail for unverified is the gapped equipment ids, sorted with default `[...ids].sort()`, joined by `', '`. Detail for mismatch is the domain ids, same sort and join. No extra sentence.
- Do not backfill. An assertion that starts inside the request does not prove the earlier part. Do not copy `Equipment.validFrom` / `Equipment.validTo` (master validity is a different interval). Do not use `validTo: null` as "open forever".
- **0 or 1 resolved equipment is not a merge.** Return the normal outcome. A single equipment whose assertions do not cover the request, or that contains two domains, is still allowed (naive single-equipment query). Its `time_domain` assessment stays `unknown` / `source_unavailable`. Do not mark it `clear`.
- **On a real pass** (evaluation `ok`, including one equipment that is fully covered by exactly one domain, and two or more that share one domain): if the caller listed `time_domain` in `kinds`, that assessment is `{ state: 'clear', statusSource: 'time-domain-registry', observedAt: OBSERVED, detail: <the one timeDomainId> }`. Do not add `time_domain` when the caller did not declare it. `unknown_status` still forces every declared kind to `unknown` (existing first branch). `collection` stays `unknown`.
- No `[from, to)` (either end null): there is no axis to merge. Skip the guard.
- Opt-out `mergeTimeDomain: false` skips the guard and must **not** set `clear`. Default is on (`o.mergeTimeDomain !== false`).
- Guard order inside `serve`, unchanged steps stay where they are: scenario `timeout` / `error` / failing `partial` → scope `forbidden` → `too_large` → **this guard, on `resolved.rows` before the empty-scenario substitution** → compute. A 7-day illegal merge under scenario `empty` is still `error`, not `empty`. The 90-day cycle-time link stays `too_large`.
- Seed so the **default 24h page still renders**. `DEFAULT_RANGE_TO` is `2026-09-26T09:00:00`. The app materializes `[2026-09-25T09:00:00, 2026-09-26T09:00:00)`. That window must pass for ICH. The failure window is the 7-day preset `[2026-09-19T09:00:00, 2026-09-26T09:00:00)` (`shift(DEFAULT_RANGE_TO, -168)`).

## Files to change

| File | What |
| --- | --- |
| `prototypes/platform-app/src/mock/world.ts` | Assertion rows + the two late ICH ids |
| `prototypes/platform-app/src/mock/server.ts` | `evaluateTimeDomainMerge`, `mergeTimeDomain`, guard, clear assessment |
| `prototypes/platform-app/src/pages/equipment/EquipmentMaster.tsx` | Opt out, both `serve` calls |
| `prototypes/platform-app/src/pages/equipment/data.ts` | Opt out `equipmentRequest` |
| `prototypes/platform-app/src/pages/home/OperationsHome.tsx` | Opt out notices |
| `prototypes/platform-app/src/pages/metrics/MetricCatalog.tsx` | Opt out both `serve` calls |
| `prototypes/platform-app/src/pages/metrics/MetricDetail.tsx` | Opt out all three `serve` calls |
| `prototypes/platform-app/src/pages/analytics/ExecutionDetail.tsx` | Opt out the occurrence lookup |
| `prototypes/platform-app/src/shell/TopBar.tsx` | One contract-test link |
| `prototypes/platform-app/README.md` | One phrase on the `serve` bullet |
| `prototypes/platform-app/src/mock/time-domain.test.ts` | New file, full contents below |

Do **not** edit `ProductivityOverview.tsx` or `CycleTimeDrilldown.tsx`. Their eight `serve` calls merge equipment onto one period. The default `mergeTimeDomain: true` is the fix. Do not pass `false` there. Do not add `time_domain` to kinds that do not already have it. Productivity KPI already passes `kinds: ['collection', 'processing_delay', 'coverage', 'time_domain']`.

No other `serve(` calls exist under `src/pages`.

## 1. `src/mock/world.ts`

Append after the `DEFAULT_RANGE_TO` line. Do not change the `EQUIPMENT` generator.

```ts
/** Explicit exclusive end. Not a null snapshot and not equipment-master validTo. */
export const TIME_DOMAIN_OPEN_END = '9999-01-01T00:00:00';
/** Well before DEFAULT_RANGE_TO and before the prototype's 90-day links. */
export const TIME_DOMAIN_SEEDED_FROM = '2020-01-01T00:00:00';
/**
 * Inside the last 7 days before DEFAULT_RANGE_TO
 * ([2026-09-19T09:00:00, 2026-09-26T09:00:00)) and on or before the default
 * 24h start 2026-09-25T09:00:00, so a 1-day merge still covers these rows.
 */
export const TIME_DOMAIN_LATE_FROM = '2026-09-22T00:00:00';

export type TimeDomainAssertion = {
  equipmentId: string;
  timeDomainId: string;
  validFrom: string;
  validTo: string;
};

/** First two ICH PH-101 ids (sorted). Engineer and admin both resolve PH-101. Viewer has no analytics menu. */
export const LATE_TIME_DOMAIN_EQUIPMENT_IDS: readonly string[] = EQUIPMENT
  .filter(e => e.site === 'ICH' && e.room === 'PH-101')
  .map(e => e.equipmentId)
  .sort()
  .slice(0, 2);

function timeDomainIdFor(site: string): string {
  if (site === 'ICH' || site === 'CJU') return 'KR-WALL';
  if (site === 'XIA') return 'CN-XIA';
  throw new Error(`no time domain for site ${site}`);
}

/** One row per equipment. Read this array on each request; do not copy it at startup. */
export const TIME_DOMAIN_ASSERTIONS: TimeDomainAssertion[] = EQUIPMENT.map(e => ({
  equipmentId: e.equipmentId,
  timeDomainId: timeDomainIdFor(e.site),
  validFrom: LATE_TIME_DOMAIN_EQUIPMENT_IDS.includes(e.equipmentId) ? TIME_DOMAIN_LATE_FROM : TIME_DOMAIN_SEEDED_FROM,
  validTo: TIME_DOMAIN_OPEN_END,
}));
```

Current seed (`seeded(7)`) makes `LATE_TIME_DOMAIN_EQUIPMENT_IDS` equal `['ICH-PHOTO-0103', 'ICH-PHOTO-0105']`. The test locks those ids. Do not hardcode them in `world.ts`; derive them with the filter above. Do not pick a DIF-202 tool (engineer has no DIF-202 grant, so the default ICH query would not see it).

## 2. `src/mock/server.ts`

Extend the world import:

```ts
import { EQUIPMENT, SITES, TIME_DOMAIN_ASSERTIONS, USERS, type Equipment, type RoleId, type TimeDomainAssertion } from './world';
```

Add to `ServeOptions`, under the `source?` field:

```ts
  /**
   * Default true. Set false when this query does not merge equipment onto one time axis
   * (master list, catalog, notices, one occurrence). §6.3.
   */
  mergeTimeDomain?: boolean;
```

Insert this exported function above `const OBSERVED`. `serve` must call it. Do not reimplement the comparison inside `serve`.

```ts
export type TimeDomainMergeResult =
  | { ok: true; timeDomainId: string }
  | { ok: false; code: 'time_domain_unverified' | 'time_domain_mismatch'; message: string };

const wallMs = (value: string) => parseDateTime(value, 'time').getTime();

/** §6.3. No scopeId argument. Call only when [from, to) exists. Length 1 is a coverage check, not a rejection by itself. */
export function evaluateTimeDomainMerge(
  equipmentIds: readonly string[],
  from: string,
  to: string,
  assertions: readonly TimeDomainAssertion[],
): TimeDomainMergeResult {
  const fromMs = wallMs(from);
  const toMs = wallMs(to);
  const unverified: string[] = [];
  const domains = new Set<string>();
  for (const equipmentId of equipmentIds) {
    const slices = assertions
      .filter(a => a.equipmentId === equipmentId)
      .map(a => ({
        domain: a.timeDomainId,
        start: Math.max(wallMs(a.validFrom), fromMs),
        end: Math.min(wallMs(a.validTo), toMs),
      }))
      .filter(s => s.start < s.end)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = fromMs;
    const local = new Set<string>();
    for (const slice of slices) {
      if (slice.start > cursor) break;
      local.add(slice.domain);
      if (slice.end > cursor) cursor = slice.end;
      if (cursor >= toMs) break;
    }
    if (cursor < toMs || local.size === 0) unverified.push(equipmentId);
    else for (const domain of local) domains.add(domain);
  }
  if (unverified.length) {
    const ids = [...new Set(unverified)].sort();
    return { ok: false, code: 'time_domain_unverified', message: `time_domain_unverified: ${ids.join(', ')}` };
  }
  const domainIds = [...domains].sort();
  if (domainIds.length !== 1) {
    return { ok: false, code: 'time_domain_mismatch', message: `time_domain_mismatch: ${domainIds.join(', ')}` };
  }
  return { ok: true, timeDomainId: domainIds[0] };
}
```

Replace the block that starts at `const equipment = s === 'empty'` and ends at the closing `});` of the assessment `map` with this whole block. Leave the scenario / scope / `too_large` returns above it, and leave the final `return { correlationId, outcome, ... }` below it, exactly as they are. Do not drop `compute`, `isEmpty`, or `kinds`.

```ts
  let verifiedDomain: string | null = null;
  if (o.mergeTimeDomain !== false && o.global.from && o.global.to && resolved.rows.length >= 1) {
    const verdict = evaluateTimeDomainMerge(
      resolved.rows.map(e => e.equipmentId),
      o.global.from,
      o.global.to,
      TIME_DOMAIN_ASSERTIONS,
    );
    if (!verdict.ok) {
      if (resolved.rows.length >= 2) return { ...base, outcome: 'error', message: verdict.message };
    } else {
      verifiedDomain = verdict.timeDomainId;
    }
  }

  const equipment = s === 'empty' ? [] : resolved.rows;
  const data = o.compute({ equipment });
  const empty = s === 'empty' || (o.isEmpty ? o.isEmpty(data) : false);
  const kinds = o.kinds ?? ['collection', 'processing_delay', 'coverage'];
  const assessments: Assessment[] = kinds.map(kind => {
    if (s === 'unknown_status' || kind === 'collection') return { kind, state: 'unknown', reason: 'source_unavailable' };
    if (kind === 'processing_delay') return { kind, state: 'clear', statusSource: 'mart-watermark', observedAt: OBSERVED };
    if (kind === 'coverage') return { kind, state: 'clear', statusSource: 'coverage-service', observedAt: OBSERVED, detail: '98.7%' };
    if (kind === 'time_domain' && verifiedDomain) return { kind, state: 'clear', statusSource: 'time-domain-registry', observedAt: OBSERVED, detail: verifiedDomain };
    return { kind, state: 'unknown', reason: 'source_unavailable' };
  });
```

`OBSERVED` stays `'2026-09-26T08:58:00'`. Pass the exported `TIME_DOMAIN_ASSERTIONS` binding on each call. Do not `.slice()` it into another module-level array (a test pushes one row and pops it).

## 3. Opt-out call sites

Add `mergeTimeDomain: false` to each object. No other edits.

`EquipmentMaster.tsx` source query:

```ts
  const source = usePlatformQuery(signal => serve({ role, global, signal, mergeTimeDomain: false, compute: ({ equipment }) => equipment }), null, scope.status === 'valid');
```

`EquipmentMaster.tsx` `loadPage`:

```ts
      loadPage={(page, signal) => serve({ role, global, signal, mergeTimeDomain: false, compute: ({ equipment }) => sortAndPage(filterEquipment(equipment, q, status, maker), page), isEmpty: data => data.total === 0 })}
```

`equipment/data.ts` `equipmentRequest`:

```ts
  return serve({ role, global: { ...global, roomNames: null, condition: null, selection: [id] }, signal, mergeTimeDomain: false,
    compute: ({ equipment }) => equipment.find(e => e.equipmentId === id) ?? null, isEmpty: e => e === null });
```

`OperationsHome.tsx` notices:

```ts
    role, global, signal, requiresScope: false, mergeTimeDomain: false, latency: 250, kinds: [],
```

`MetricCatalog.tsx` pair banner (`latency: 180`) and catalog `loadPage` (`latency: 280`). Both already have `requiresScope: false`. Add the flag beside it:

```ts
    role, global, signal, requiresScope: false, mergeTimeDomain: false, latency: 180, kinds: ['processing_delay'],
```

```ts
          role, global, signal, requiresScope: false, mergeTimeDomain: false, latency: 280, kinds: ['processing_delay'],
```

`MetricDetail.tsx` definition, usage, and history. Same flag on all three. History has no `metricVersion`; still opt out:

```ts
    role, global, signal, requiresScope: false, mergeTimeDomain: false, latency: 280, kinds: ['processing_delay'],
```

```ts
    role, global, signal, requiresScope: false, mergeTimeDomain: false, latency: 320, kinds: ['processing_delay'],
```

```ts
    role, global, signal, requiresScope: false, mergeTimeDomain: false, latency: 240, kinds: ['processing_delay'],
```

`ExecutionDetail.tsx`: the lookup clears selection, so `serve` would see every granted equipment and treat a carried period as a merge. The page is one occurrence, not an axis merge. Add the flag to that object:

```ts
  const query = usePlatformQuery(signal => serve<OccurrenceResult>({
    role,
    global: { ...global, selection: null, roomNames: null, condition: null, lotIds: null, ppid: null, recipeIds: null },
    signal,
    mergeTimeDomain: false,
    metricVersion: metric.metricVersion,
    isEmpty: data => data.access === 'missing',
    compute: ({ equipment }) => lookupOccurrence(equipment, equipmentId, anchor!),
  }), [equipmentId, entityType, anchor], valid);
```

Why these and not the analytics pages: equipment master lists rows; `equipmentRequest` loads one master record; notices and the metric catalog/detail do not bucket equipment in time (`requiresScope: false` would otherwise see ICH `KR-WALL` and XIA `CN-XIA` together whenever `from`/`to` were carried onto the URL); execution detail looks up one object. Productivity and cycle time do merge. Leave them on the default.

## 4. `src/shell/TopBar.tsx`

README says pages do not edit the shell. This task is the exception: the repro lives in the existing contract-test list. Add one entry after the 90-day item:

```ts
              { ko: '7일 복수 설비 (time_domain_unverified)', en: '7-day multi-equipment (time_domain_unverified)', url: '/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00' },
```

No `selectedEquipmentIds`. The resolved set is every granted ICH room, which includes PH-101 and therefore both late ids.

## 5. `README.md`

In the `serve({ ... })` bullet, add `mergeTimeDomain` to the parameter list and this sentence immediately after the existing Korean sentence about equipment already being resolved:

`mergeTimeDomain` defaults to true: 2대 이상과 `[from, to)`가 있으면 서버 assertion 없이 시간축을 합치지 않는다. 마스터 목록·카탈로그·공지·occurrence 단건은 `mergeTimeDomain: false`.

## 6. Tests

Create `prototypes/platform-app/src/mock/time-domain.test.ts` with exactly this file:

```ts
import { describe, expect, it } from 'vitest';
import { emptyGlobal, type GlobalContext } from '../kernel/url';
import { evaluateTimeDomainMerge, serve, setScenario } from './server';
import {
  DEFAULT_RANGE_TO, EQUIPMENT, LATE_TIME_DOMAIN_EQUIPMENT_IDS, TIME_DOMAIN_ASSERTIONS,
  TIME_DOMAIN_LATE_FROM, TIME_DOMAIN_OPEN_END, TIME_DOMAIN_SEEDED_FROM, type TimeDomainAssertion,
} from './world';

const DAY_FROM = '2026-09-25T09:00:00';
const WEEK_FROM = '2026-09-19T09:00:00';
const WEEK_TO = DEFAULT_RANGE_TO;

function ctx(over: Partial<GlobalContext> = {}): GlobalContext {
  return { ...emptyGlobal, scopeId: 'ICH', from: DAY_FROM, to: DEFAULT_RANGE_TO, ...over };
}

const coveredIch = EQUIPMENT
  .filter(e => e.site === 'ICH' && e.room === 'PH-101' && !LATE_TIME_DOMAIN_EQUIPMENT_IDS.includes(e.equipmentId))
  .map(e => e.equipmentId)
  .sort();

const row = (equipmentId: string, timeDomainId: string, validFrom: string, validTo: string): TimeDomainAssertion =>
  ({ equipmentId, timeDomainId, validFrom, validTo });

describe('time-domain assertions (world)', () => {
  it('pins two late ICH PH-101 tools and maps sites without using master validity', () => {
    expect(LATE_TIME_DOMAIN_EQUIPMENT_IDS).toEqual(['ICH-PHOTO-0103', 'ICH-PHOTO-0105']);
    expect(TIME_DOMAIN_LATE_FROM >= WEEK_FROM && TIME_DOMAIN_LATE_FROM < DEFAULT_RANGE_TO).toBe(true);
    expect(TIME_DOMAIN_LATE_FROM <= DAY_FROM).toBe(true);
    expect(TIME_DOMAIN_ASSERTIONS).toHaveLength(EQUIPMENT.length);
    for (const e of EQUIPMENT) {
      const a = TIME_DOMAIN_ASSERTIONS.filter(x => x.equipmentId === e.equipmentId);
      expect(a).toHaveLength(1);
      expect(a[0].validTo).toBe(TIME_DOMAIN_OPEN_END);
      expect(a[0].validFrom).not.toBe(e.validFrom);
      const late = LATE_TIME_DOMAIN_EQUIPMENT_IDS.includes(e.equipmentId);
      expect(a[0].validFrom).toBe(late ? TIME_DOMAIN_LATE_FROM : TIME_DOMAIN_SEEDED_FROM);
      expect(a[0].timeDomainId).toBe(e.site === 'XIA' ? 'CN-XIA' : 'KR-WALL');
    }
  });
});

describe('evaluateTimeDomainMerge', () => {
  const open = TIME_DOMAIN_OPEN_END;
  const full = TIME_DOMAIN_SEEDED_FROM;

  it('rejects a gap and does not backfill a later assertion', () => {
    const assertions = [
      row('A', 'KR-WALL', TIME_DOMAIN_LATE_FROM, open),
      row('B', 'CN-XIA', full, open),
    ];
    expect(evaluateTimeDomainMerge(['B', 'A'], WEEK_FROM, WEEK_TO, assertions)).toEqual({
      ok: false,
      code: 'time_domain_unverified',
      message: 'time_domain_unverified: A',
    });
  });

  it('rejects two domains when both equipment are fully covered', () => {
    const assertions = [row('A', 'KR-WALL', full, open), row('B', 'CN-XIA', full, open)];
    expect(evaluateTimeDomainMerge(['A', 'B'], DAY_FROM, DEFAULT_RANGE_TO, assertions)).toEqual({
      ok: false,
      code: 'time_domain_mismatch',
      message: 'time_domain_mismatch: CN-XIA, KR-WALL',
    });
  });

  it('rejects a mid-request domain change even when the two segments abut', () => {
    const assertions = [
      row('A', 'KR-WALL', full, '2026-09-20T00:00:00'),
      row('A', 'CN-XIA', '2026-09-20T00:00:00', open),
      row('B', 'KR-WALL', full, open),
    ];
    expect(evaluateTimeDomainMerge(['A', 'B'], WEEK_FROM, WEEK_TO, assertions)).toEqual({
      ok: false,
      code: 'time_domain_mismatch',
      message: 'time_domain_mismatch: CN-XIA, KR-WALL',
    });
  });

  it('accepts abutting segments of the same domain', () => {
    const assertions = [
      row('A', 'KR-WALL', full, '2026-09-20T00:00:00'),
      row('A', 'KR-WALL', '2026-09-20T00:00:00', open),
      row('B', 'KR-WALL', full, open),
    ];
    expect(evaluateTimeDomainMerge(['A', 'B'], WEEK_FROM, WEEK_TO, assertions)).toEqual({ ok: true, timeDomainId: 'KR-WALL' });
  });

  it('treats a one-second hole as unverified', () => {
    const assertions = [
      row('A', 'KR-WALL', full, '2026-09-20T00:00:00'),
      row('A', 'KR-WALL', '2026-09-20T00:00:01', open),
      row('B', 'KR-WALL', full, open),
    ];
    const hole = evaluateTimeDomainMerge(['A', 'B'], WEEK_FROM, WEEK_TO, assertions);
    expect(hole).toEqual({ ok: false, code: 'time_domain_unverified', message: 'time_domain_unverified: A' });
  });

  it('does not treat a missing assertion as proof', () => {
    expect(evaluateTimeDomainMerge(['B', 'A'], DAY_FROM, DEFAULT_RANGE_TO, [])).toEqual({
      ok: false,
      code: 'time_domain_unverified',
      message: 'time_domain_unverified: A, B',
    });
  });
});

describe('serve time-domain guard', () => {
  const kinds = ['collection', 'time_domain'] as const;

  it('errors a 7-day ICH merge and does not compute', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      kinds: [...kinds],
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
    expect(res.data).toBeNull();
    expect(res.assessments).toEqual([]);
    expect(res.trust).toBeNull();
    expect(res.correlationId).toMatch(/^corr-/);
  });

  it('passes the default 24h ICH merge with a registry clear', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx(),
      latency: 0,
      kinds: [...kinds],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBeGreaterThan(1);
    expect(res.assessments).toEqual([
      { kind: 'collection', state: 'unknown', reason: 'source_unavailable' },
      { kind: 'time_domain', state: 'clear', statusSource: 'time-domain-registry', observedAt: '2026-09-26T08:58:00', detail: 'KR-WALL' },
    ]);
  });

  it('passes a 7-day CJU merge (no late tools there)', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ scopeId: 'CJU', from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBeGreaterThan(1);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', statusSource: 'time-domain-registry', detail: 'KR-WALL' });
  });

  it('passes a multi-equipment XIA merge as CN-XIA', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx({ scopeId: 'XIA' }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBeGreaterThan(1);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', detail: 'CN-XIA', statusSource: 'time-domain-registry' });
  });

  it('passes a 7-day selection that excludes the late tools', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [coveredIch[0], coveredIch[1]] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.map(e => e.equipmentId),
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toEqual([coveredIch[0], coveredIch[1]]);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', detail: 'KR-WALL' });
  });

  it('covers the late tools when the request starts at their validFrom', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: TIME_DOMAIN_LATE_FROM, to: WEEK_TO, selection: [...LATE_TIME_DOMAIN_EQUIPMENT_IDS] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBe(2);
    expect(res.assessments[0]).toMatchObject({ state: 'clear', detail: 'KR-WALL' });
  });

  it('rejects the late tools one second before their validFrom', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: '2026-09-21T23:59:59', to: WEEK_TO, selection: [...LATE_TIME_DOMAIN_EQUIPMENT_IDS] }),
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
  });

  it('allows one equipment through a gap and does not claim clear', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [LATE_TIME_DOMAIN_EQUIPMENT_IDS[0]] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBe(1);
    expect(res.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
  });

  it('allows one fully covered equipment to clear', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [coveredIch[0]] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.assessments[0]).toMatchObject({ state: 'clear', statusSource: 'time-domain-registry', detail: 'KR-WALL' });
  });

  it('does not turn an explicit empty selection into a time-domain error', async () => {
    const res = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO, selection: [] }),
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment,
      isEmpty: rows => rows.length === 0,
    });
    expect(res.outcome).toBe('empty');
    expect(res.message ?? '').not.toMatch(/time_domain_/);
  });

  it('mismatches when one request sees KR-WALL and CN-XIA', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx(),
      requiresScope: false,
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_mismatch: CN-XIA, KR-WALL');
    expect(res.assessments).toEqual([]);
  });

  it('lets a gap win over a cross-site domain conflict', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      requiresScope: false,
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
  });

  it('opt-out skips the guard and does not claim clear', async () => {
    const res = await serve({
      role: 'admin',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      requiresScope: false,
      mergeTimeDomain: false,
      latency: 0,
      kinds: ['time_domain'],
      compute: ({ equipment }) => equipment.length,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBe(EQUIPMENT.length);
    expect(res.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
  });

  it('does not invent a time_domain assessment, but still rejects an undeclared merge', async () => {
    const ok = await serve({
      role: 'engineer',
      global: ctx(),
      latency: 0,
      compute: () => 1,
    });
    expect(ok.outcome).toBe('ok');
    expect(ok.assessments.map(a => a.kind)).toEqual(['collection', 'processing_delay', 'coverage']);
    const bad = await serve({
      role: 'engineer',
      global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      compute: () => { throw new Error('must not merge'); },
    });
    expect(bad.outcome).toBe('error');
    expect(bad.message?.startsWith('time_domain_unverified')).toBe(true);
  });

  it('does not let the empty scenario disguise an illegal merge', async () => {
    setScenario('empty');
    try {
      const bad = await serve({
        role: 'engineer',
        global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
        latency: 0,
        kinds: ['time_domain'],
        compute: () => { throw new Error('must not merge'); },
      });
      expect(bad.outcome).toBe('error');
      expect(bad.message).toBe('time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105');
      const quiet = await serve({
        role: 'engineer',
        global: ctx(),
        latency: 0,
        kinds: ['time_domain'],
        compute: () => 1,
        isEmpty: () => true,
      });
      expect(quiet.outcome).toBe('empty');
      expect(quiet.assessments[0]).toMatchObject({ state: 'clear', statusSource: 'time-domain-registry', detail: 'KR-WALL' });
    } finally {
      setScenario('normal');
    }
  });

  it('keeps unknown_status ahead of a passing registry', async () => {
    setScenario('unknown_status');
    try {
      const res = await serve({
        role: 'engineer',
        global: ctx(),
        latency: 0,
        kinds: ['time_domain'],
        compute: () => 1,
      });
      expect(res.outcome).toBe('ok');
      expect(res.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
    } finally {
      setScenario('normal');
    }
  });

  it('lets scenario error and scope forbidden and too_large win over the guard', async () => {
    setScenario('error');
    try {
      const failed = await serve({
        role: 'engineer',
        global: ctx({ from: WEEK_FROM, to: WEEK_TO }),
        latency: 0,
        compute: () => 1,
      });
      expect(failed).toMatchObject({ outcome: 'error', message: 'Upstream mart query failed' });
    } finally {
      setScenario('normal');
    }
    const denied = await serve({
      role: 'engineer',
      global: ctx({ scopeId: 'XIA', from: WEEK_FROM, to: WEEK_TO }),
      latency: 0,
      compute: () => 1,
    });
    expect(denied.outcome).toBe('forbidden');
    expect(denied.message ?? '').not.toMatch(/time_domain_/);
    const huge = await serve({
      role: 'engineer',
      global: ctx({ from: '2026-06-28T09:00:00', to: DEFAULT_RANGE_TO }),
      maxHours: 24 * 31,
      latency: 0,
      compute: () => { throw new Error('must not run'); },
    });
    expect(huge.outcome).toBe('too_large');
    expect(huge.message ?? '').not.toMatch(/time_domain_/);
  });

  it('does not reject one equipment whose assertions conflict', async () => {
    const id = coveredIch[0];
    TIME_DOMAIN_ASSERTIONS.push(row(id, 'CN-XIA', TIME_DOMAIN_SEEDED_FROM, TIME_DOMAIN_OPEN_END));
    try {
      const alone = await serve({
        role: 'engineer',
        global: ctx({ selection: [id] }),
        latency: 0,
        kinds: ['time_domain'],
        compute: ({ equipment }) => equipment.length,
      });
      expect(alone.outcome).toBe('ok');
      expect(alone.data).toBe(1);
      expect(alone.assessments).toEqual([{ kind: 'time_domain', state: 'unknown', reason: 'source_unavailable' }]);
      const pair = await serve({
        role: 'engineer',
        global: ctx({ selection: [id, coveredIch[1]] }),
        latency: 0,
        compute: () => { throw new Error('must not merge'); },
      });
      expect(pair.outcome).toBe('error');
      expect(pair.message).toBe('time_domain_mismatch: CN-XIA, KR-WALL');
    } finally {
      TIME_DOMAIN_ASSERTIONS.pop();
    }
  });
});
```

The mutation test requires `serve` to read the exported array by reference. `pop()` must run in `finally`.

## Acceptance

From `prototypes/platform-app`:

```sh
npx tsc --noEmit
npx vitest run src/mock/time-domain.test.ts
npx vitest run
```

All three must pass. Existing `src/kernel/url.test.ts` must stay green. Do not weaken a failing assertion to make the seed match; the late ids are the first two sorted `ICH` / `PH-101` equipment ids.

Browser, after `npm run dev` (`http://127.0.0.1:5173`, or the port Vite prints). Header: role **공정 엔지니어 / Process engineer** (`localStorage` `platform:role`, default `engineer`). Flask popover: scenario **정상 / Normal**. Language default is Korean. Wait out the skeleton (~1s). Do not judge the skeleton as the result.

1. Flask → **계약 검증 링크** → **7일 복수 설비 (time_domain_unverified)**. URL becomes `/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00`. All four widgets (KPI, trend, breakdown, attention) show title **데이터를 불러오지 못했습니다**, body `time_domain_unverified: ICH-PHOTO-0103, ICH-PHOTO-0105`, and a **Correlation ID** `corr-…`. No KPI numbers, no chart series, no empty-state title **조건에 맞는 결과가 없습니다**. The **데이터 신뢰** button is absent (`trust` is null).
2. Same page, period preset **7일**, with Scope ICH and no Selection chip, is the same URL and the same error. **1일** goes back to `from=2026-09-25T09:00:00&to=2026-09-26T09:00:00`, KPI numbers render, and **데이터 신뢰** shows **시간역** badge `clear` with `time-domain-registry` (not `unknown`).
3. `/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&selectedEquipmentIds=ICH-PHOTO-0103` renders numbers (one tool). Data trust **시간역** is `unknown`, not `clear`.
4. `/equipment?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00` shows the equipment table (an `ICH-PHOTO-` id), not `time_domain_unverified`.
5. `/metrics?v=1&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00` shows the catalog table, not `time_domain_unverified`.
6. `/?v=1&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00` shows the home menu grid, not `time_domain_unverified`.
7. Existing link **90일 조회 (too_large)** still shows **조회 범위가 너무 큽니다**, not a `time_domain_` message.
8. Existing link **명시적 빈 설비 선택** still shows **조건에 맞는 결과가 없습니다**, not a `time_domain_` message.
9. Existing link **권한 없는 Scope (XIA)** still shows the forbidden title **이 Scope에 접근 권한이 없습니다**, not a `time_domain_` message.

Desktop width is enough. This change does not move layout.

## Not in this task

- P0-1 (`metricId` without `metricVersion`) and every P1/P2 in `review-grok-kernel.md`.
- A screen to register or edit assertions (`PLATFORM_REQUIREMENTS.md` time-domain mapping UI).
- Edits to `docs/06_platform_ui_contract.md`, ADRs, or wireframes.
- A client or URL `timeDomainId`. Translating the error code in `i18n.tsx` (the body is the raw `message`; the title stays `stateError`).
- Adding `time_domain` to productivity trend/breakdown/attention or to cycle-time widgets. The guard still runs on those calls because they do not opt out; only the productivity KPI already shows the clear chip.
- Wafer journey, the notices menu, VOC, and admin pages. They do not call `serve()`.
- A database table or migration. `validTo: null`. Copying master `validFrom` / `validTo`.
- Changing `sleep` / the random 0–200ms jitter.
- Making the default 24h productivity query fail. Seeding a second domain onto an ICH tool that overlaps `2026-09-25T09:00:00`.
- Menu-permission checks inside `serve` (review P2-3). Rewriting the 90-day link.
- Separate-query product UI. Two requests, one per domain, stay legal; this task does not add a "split by time domain" button.
