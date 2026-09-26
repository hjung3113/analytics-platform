# P0-1 — `metricId` without `metricVersion`

Implementation design. Paste the blocks. Do not invent a second rule.

Contract: `docs/06_platform_ui_contract.md` §6.1 paragraph **전역 지표 Context: `metricId` + `metricVersion` 쌍**. Review: `prototypes/platform-app/reports/review-grok-kernel.md` **P0-1**.

Today `parseQuery` stores a null version and returns success (`src/kernel/url.ts` around the `metricId` / `metricVersion` lines). `url.test.ts` locks that in. `App.tsx` shows `ContractErrorView` only when `parseQuery` throws, so `/equipment?v=1&scopeId=ICH&metricId=cycle_time` renders the page. Cycle time then does `global.metricVersion ?? PAGE_METRIC_VERSION` (`src/pages/analytics/cycleData.ts`). The catalog only warns. §6.1 allows an id-only query only at an entry that declares initialization, and only so the server can write the confirmed published version into the URL before any query. Anywhere else it is a contract error. A failed confirmation is a selection state, never a fallback version.

## Rules you must not reinterpret

- Version-without-id stays `metric_pair` inside `parseQuery`. Do not rename it. Do not make `parseQuery` throw on id-only. The codec must still parse `metricId` with `metricVersion: null`, because the initialization routes have to read that URL. The product error is route-gated, after the route is known.
- Id-only (`metricId !== null && metricVersion === null`) on a menu whose `initializesMetric` is not `true` is `new ContractError('metric_pair_incomplete', ...)`. `ContractErrorView` shows it. The page component does not mount. Do not add `metricVersion` on that route.
- `initializesMetric: true` is only on menu ids `cycle-time` and `metric-detail`. No other menu.
- On those two, id-only calls the published-version table. A non-null published version is written with `navigate(..., { replace: true })` as `metricVersion=<bare token>` (`4`, not `v4`). The page does not mount until that replace has landed.
- Unknown id, or a known id whose published version is `null` (`queue_time`, `setup_time`), does not navigate and does not substitute `cycle_time`, `PAGE_METRIC_VERSION` (`'3'`), the path `:metricId`, or the draft. Show a selection state. The URL keeps the id and still has no `metricVersion`.
- A pair that already has both fields is left alone. Do not rewrite `metricVersion=3` to the published `4`.
- Both fields absent is not id-only. Do not materialize a pair. Cycle time keeps its existing page-default banner (`cycle_time` v3, not written to the URL).
- Do not overwrite a global `metricId` with the metric-detail path id. Completing `?metricId=occupancy_physical` on `/metrics/cycle_time` writes `metricVersion=3` and leaves the path as `/metrics/cycle_time`.
- Remove `global.metricVersion ?? PAGE_METRIC_VERSION`. Do not change the constant `PAGE_METRIC_VERSION` (`'3'`). Published `cycle_time` is `'4'`, which is a different fact.
- Time-domain work is landing in `src/mock/server.ts` and `src/mock/world.ts` at the same time. Do not edit `server.ts`. In `world.ts`, only append new exports. Do not touch `DEFAULT_RANGE_TO`, `EQUIPMENT`, or any `TIME_DOMAIN_*` / `LATE_TIME_DOMAIN_*` symbols if they are already there.

## Files to change

| File | What |
| --- | --- |
| `prototypes/platform-app/src/mock/world.ts` | Append the published-version table and `classifyMetricInit` |
| `prototypes/platform-app/src/kernel/registry.ts` | `initializesMetric?` on `cycle-time` and `metric-detail` only |
| `prototypes/platform-app/src/kernel/url.ts` | `incompleteMetricPair` |
| `prototypes/platform-app/src/kernel/url.test.ts` | Replace the test that locks id-only as success |
| `prototypes/platform-app/src/kernel/platform.tsx` | Gate, replace-write, expose `metricInit` |
| `prototypes/platform-app/src/App.tsx` | Contract error already works; add pending + blocked views |
| `prototypes/platform-app/src/pages/analytics/cycleData.ts` | Delete the `?? PAGE_METRIC_VERSION` fill |
| `prototypes/platform-app/src/pages/analytics/CycleTimeDrilldown.tsx` | Do not query an unconfirmed pair |
| `prototypes/platform-app/src/pages/analytics/ExecutionDetail.tsx` | Same, one query |
| `prototypes/platform-app/src/mock/published-metrics.test.ts` | New file, full contents below |

Do not edit `src/mock/server.ts`, `src/shell/TopBar.tsx` (design 1 owns that file), `MetricCatalog.tsx`, or `MetricDetail.tsx`. Catalog and detail id-only banners become unreachable: catalog is `metric_pair_incomplete` before mount; detail is either replaced to a full pair or blocked before mount. Leave `judgeGlobalPair`'s `id-only` arm in place so the switch stays exhaustive. Do not make that banner write a version.

## 1. `src/mock/world.ts`

Append at end of file. Catalog order. `publishedVersion: null` means the id is known and has no published pointer.

```ts
/** Server-owned published pointer per metricId (§6.1). Bare version token, not `v4`. Null = known, unpublished. */
export type PublishedMetric = { metricId: string; publishedVersion: string | null };

export const PUBLISHED_METRICS: readonly PublishedMetric[] = [
  { metricId: 'cycle_time', publishedVersion: '4' },
  { metricId: 'occupancy_physical', publishedVersion: '3' },
  { metricId: 'non_process_dwell', publishedVersion: '2' },
  { metricId: 'job_throughput', publishedVersion: '1' },
  { metricId: 'wafer_move_count', publishedVersion: '2' },
  { metricId: 'queue_time', publishedVersion: null },
  { metricId: 'availability_scheduled', publishedVersion: '2' },
  { metricId: 'alarm_count', publishedVersion: '1' },
  { metricId: 'recipe_changeover', publishedVersion: '1' },
  { metricId: 'lot_hold_dwell', publishedVersion: '3' },
  { metricId: 'chamber_utilization', publishedVersion: '1' },
  { metricId: 'rework_rate', publishedVersion: '2' },
  { metricId: 'energy_per_wafer', publishedVersion: '1' },
  { metricId: 'setup_time', publishedVersion: null },
];

export type MetricInit =
  | { phase: 'skip' }
  | { phase: 'confirm'; metricVersion: string }
  | { phase: 'blocked'; reason: 'unknown_metric' | 'unpublished' };

/** Id-only on an initialization route. A finished pair, or a route that does not initialize, is `skip`. */
export function classifyMetricInit(initializesMetric: boolean, metricId: string | null, metricVersion: string | null): MetricInit {
  if (!initializesMetric || metricId === null || metricVersion !== null) return { phase: 'skip' };
  const row = PUBLISHED_METRICS.find(m => m.metricId === metricId);
  if (!row) return { phase: 'blocked', reason: 'unknown_metric' };
  if (row.publishedVersion === null) return { phase: 'blocked', reason: 'unpublished' };
  return { phase: 'confirm', metricVersion: row.publishedVersion };
}
```

Do not import `METRICS` from `pages/metrics/data.ts` into `world.ts`. The test below is what keeps the two lists equal. If it fails, change `PUBLISHED_METRICS` to match `METRICS`, not the catalog.

## 2. `src/kernel/registry.ts`

On `MenuEntry`, after `pageKeys`:

```ts
  /** Id-only metricId is completed from PUBLISHED_METRICS. Every other menu rejects it as metric_pair_incomplete. */
  initializesMetric?: boolean;
```

On the `cycle-time` object and the `metric-detail` object only, add `initializesMetric: true` next to `pageKeys`. Do not set it on `metric-catalog`, `execution-detail`, or `productivity-overview`.

## 3. `src/kernel/url.ts`

Add after `formatMetricVersion` (or just below the metric parse block). `parseQuery` itself stays as it is, including the `metric_pair` throw for version-without-id and the null version for id-only.

```ts
/** Id-only is a contract error except on a menu that declares initialization (§6.1). */
export function incompleteMetricPair(
  menu: { initializesMetric?: boolean } | null,
  metricId: string | null,
  metricVersion: string | null,
): ContractError | null {
  if (metricId === null || metricVersion !== null) return null;
  if (menu?.initializesMetric) return null;
  return new ContractError('metric_pair_incomplete', `metricId=${metricId} requires metricVersion on this route`);
}
```

## 4. `src/kernel/url.test.ts`

Import `incompleteMetricPair` from `./url`. Replace the whole test `'keeps the metric pair together'` with:

```ts
  it('rejects version-without-id and gates id-only by route', () => {
    expect(code(() => parseQuery('?metricVersion=v3'))).toBe('metric_pair');
    const idOnly = parseQuery('?metricId=cycle_time').global;
    expect(idOnly.metricId).toBe('cycle_time');
    expect(idOnly.metricVersion).toBeNull();
    const menu = (id: string) => MENUS.find(m => m.id === id)!;
    expect(incompleteMetricPair(menu('equipment-master'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('metric-catalog'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('productivity-overview'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('execution-detail'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('cycle-time'), 'cycle_time', null)).toBeNull();
    expect(incompleteMetricPair(menu('metric-detail'), 'cycle_time', null)).toBeNull();
    expect(incompleteMetricPair(menu('equipment-master'), 'cycle_time', '4')).toBeNull();
    expect(incompleteMetricPair(menu('equipment-master'), null, null)).toBeNull();
    expect(MENUS.filter(m => m.initializesMetric).map(m => m.id).sort()).toEqual(['cycle-time', 'metric-detail']);
  });
```

## 5. `src/kernel/platform.tsx`

Import `classifyMetricInit` from `../mock/world` and `incompleteMetricPair` from `./url`.

After `const global = parsed?.global ?? emptyGlobal;`:

```ts
  const pairError = contractError ? null : incompleteMetricPair(route?.menu ?? null, global.metricId, global.metricVersion);
  const routeContractError = contractError ?? pairError;
  const metricInit = classifyMetricInit(route?.menu.initializesMetric === true, global.metricId, global.metricVersion);
```

Pass `routeContractError` out as `contractError` (the context field name stays `contractError`). Every existing `if (!route || contractError` check in this file must use `routeContractError`, so a pair error does not also rewrite `from`/`to`. Add `metricInit` to the `Platform` type and to the `value` object.

New effect, directly after the default-period effect. Do not merge it into that effect. Each replace spreads the global from its own render; a second render picks up the other field. That two-step replace is correct.

```ts
  useEffect(() => {
    if (!route || routeContractError || metricInit.phase !== 'confirm') return;
    navigate(pathname + buildQuery({ ...global, metricVersion: metricInit.metricVersion }, page, extras), { replace: true });
  }, [route, routeContractError, metricInit, global, page, extras, pathname, navigate]);
```

`classifyMetricInit` returns a new object every call. That is fine: once the URL has `metricVersion`, the phase is `skip` and the effect returns.

## 6. `src/App.tsx`

Replace the `usePlatform()` line in `RouteOutlet` with:

```tsx
  const { route, contractError, can, url, global, metricInit, setGlobal } = usePlatform();
```

`lang` is already taken from `useI18n()`. Order, after the not-found check:

```tsx
  if (contractError) return <ContractErrorView />;
  if (metricInit.phase === 'confirm') {
    return <KernelMessage icon={<Link2Off className="size-4" aria-hidden />} title={lang === 'ko' ? '게시 버전 확인 중' : 'Confirming the published version'}
      body={lang === 'ko' ? '서버가 확인한 버전을 URL에 기록하기 전에는 조회하지 않습니다.' : 'Nothing is queried until the server-confirmed version is written into the URL.'} />;
  }
  if (metricInit.phase === 'blocked') {
    const id = global.metricId ?? '';
    return <div className="p-6"><StateMessage tone="warning" icon={<Link2Off className="size-4" aria-hidden />}
      title={metricInit.reason === 'unknown_metric'
        ? (lang === 'ko' ? '지표를 확인하지 못했습니다' : 'The metric could not be confirmed')
        : (lang === 'ko' ? '게시 버전이 없습니다' : 'No published version')}
      body={<span className="t-mono">{metricInit.reason}: {id}</span>}
      action={<Button size="sm" variant="secondary" onClick={() => setGlobal({ metricId: null, metricVersion: null }, { replace: true })}>{lang === 'ko' ? '이 지표 쌍 지우기' : 'Clear this metric pair'}</Button>} /></div>;
  }
```

`KernelMessage` does not receive `setGlobal`. The blocked branch is raw JSX, as above, so the button can call `setGlobal`. Pull `global` from `usePlatform` too. Do not offer another version, and do not link to a substituted metric.

`confirm` is one frame. The effect then replaces. Do not mount `route.menu.component` in that frame.

## 7. `src/pages/analytics/cycleData.ts`

Extend `ResolvedMetric`:

```ts
export type ResolvedMetric =
  | { kind: 'page-default'; metricId: typeof PAGE_METRIC_ID; metricVersion: typeof PAGE_METRIC_VERSION }
  | { kind: 'applied'; metricId: typeof PAGE_METRIC_ID; metricVersion: string; versionIsPageDefault: boolean }
  | { kind: 'not-applied'; metricId: typeof PAGE_METRIC_ID; metricVersion: typeof PAGE_METRIC_VERSION; globalMetricId: string; globalMetricVersion: string }
  | { kind: 'unconfirmed'; metricId: string };
```

Replace `resolveMetric` with:

```ts
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
```

The `??` expression must not remain anywhere in this file.

## 8. `src/pages/analytics/CycleTimeDrilldown.tsx`

There are already `useState` calls both above and below `resolveMetric`. Do not add an early `return` between them. Replace these three lines:

```ts
  const periodReady = global.from !== null && global.to !== null;
  const enabled = !invalidPage && periodReady;
  const metric = resolveMetric(global);
```

with:

```ts
  const periodReady = global.from !== null && global.to !== null;
  const metric = resolveMetric(global);
  const metricVersion = metric.kind === 'unconfirmed' ? null : metric.metricVersion;
  const enabled = !invalidPage && periodReady && metricVersion !== null;
```

Then:

- `const inputs = [metric.metricVersion, metric.kind];` → `const inputs = [metricVersion, metric.kind];`
- Every `metricVersion: metric.metricVersion` passed to `serve` → `metricVersion: metricVersion ?? undefined`. `enabled` is already false when `metricVersion` is null, so those queries do not run.
- `metricLabel`: first line `if (metric.kind === 'unconfirmed') return `${metric.metricId} unconfirmed`;`
- `MetricBanner`: first branch, before `page-default`:

```tsx
  if (metric.kind === 'unconfirmed') {
    return <p className="text-[12px] text-text-secondary" data-testid="metric-banner">{ko ? `${metric.metricId} 버전이 확인되지 않았습니다. 페이지 기본 버전으로 채우지 않습니다.` : `${metric.metricId} has no confirmed version. The page default is not filled in.`}</p>;
  }
```

The kernel blocks this state before the page mounts. The branch is so a missed gate cannot query.

## 9. `src/pages/analytics/ExecutionDetail.tsx`

This route does not initialize. Id-only never mounts it. Still stop the query if `resolveMetric` is unconfirmed:

```ts
  const metric = resolveMetric(global);
  const metricVersion = metric.kind === 'unconfirmed' ? null : metric.metricVersion;
```

Pass `metricVersion: metricVersion ?? undefined` into `serve`, and change the `usePlatformQuery` enabled flag from `valid` to `valid && metricVersion !== null`.

## 10. Tests

Create `prototypes/platform-app/src/mock/published-metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '../kernel/url';
import { resolveMetric } from '../pages/analytics/cycleData';
import { METRICS } from '../pages/metrics/data';
import { classifyMetricInit, PUBLISHED_METRICS } from './world';

describe('published metric versions', () => {
  it('equals the catalog published pointers, in catalog order', () => {
    expect(PUBLISHED_METRICS.map(m => [m.metricId, m.publishedVersion])).toEqual(
      METRICS.map(m => [m.metricId, m.publishedPointer]),
    );
  });

  it('confirms a published id and blocks unknown or unpublished', () => {
    expect(classifyMetricInit(true, 'cycle_time', null)).toEqual({ phase: 'confirm', metricVersion: '4' });
    expect(classifyMetricInit(true, 'occupancy_physical', null)).toEqual({ phase: 'confirm', metricVersion: '3' });
    expect(classifyMetricInit(true, 'queue_time', null)).toEqual({ phase: 'blocked', reason: 'unpublished' });
    expect(classifyMetricInit(true, 'setup_time', null)).toEqual({ phase: 'blocked', reason: 'unpublished' });
    expect(classifyMetricInit(true, 'no_such_metric', null)).toEqual({ phase: 'blocked', reason: 'unknown_metric' });
    expect(classifyMetricInit(true, 'cycle_time', '3')).toEqual({ phase: 'skip' });
    expect(classifyMetricInit(true, null, null)).toEqual({ phase: 'skip' });
    expect(classifyMetricInit(false, 'cycle_time', null)).toEqual({ phase: 'skip' });
  });

  it('does not fill a missing cycle_time version with the page default', () => {
    expect(resolveMetric({ ...emptyGlobal, metricId: 'cycle_time', metricVersion: null })).toEqual({ kind: 'unconfirmed', metricId: 'cycle_time' });
    expect(resolveMetric({ ...emptyGlobal, metricId: 'occupancy_physical', metricVersion: null })).toEqual({ kind: 'unconfirmed', metricId: 'occupancy_physical' });
    expect(resolveMetric({ ...emptyGlobal, metricId: 'cycle_time', metricVersion: '4' })).toEqual({
      kind: 'applied', metricId: 'cycle_time', metricVersion: '4', versionIsPageDefault: false,
    });
    expect(resolveMetric(emptyGlobal)).toMatchObject({ kind: 'page-default', metricId: 'cycle_time', metricVersion: '3' });
  });
});
```

## Acceptance

From `prototypes/platform-app`:

```sh
npx tsc --noEmit
npx vitest run src/kernel/url.test.ts src/mock/published-metrics.test.ts
npx vitest run
```

All three must pass. Do not weaken the catalog-equality test.

Browser: `npm run dev` (`http://127.0.0.1:5173`, or the port Vite prints). Role **공정 엔지니어**. Scenario **정상**. Language Korean is the default. Wait past the one-frame "게시 버전 확인 중" on initialization routes.

1. `/equipment?v=1&scopeId=ICH&metricId=cycle_time` — title **URL 계약 오류: metric_pair_incomplete**. The equipment table does not render. The address bar does not gain `metricVersion`.
2. `/analytics/productivity?v=1&scopeId=ICH&metricId=cycle_time` — same contract error. No KPI numbers.
3. `/metrics?v=1&metricId=cycle_time` — same contract error. Not the catalog banner **미완성 쌍**.
4. `/analytics/cycle-time?v=1&scopeId=ICH&metricId=cycle_time` — address bar gains `metricVersion=4` (not `3`, not `v4`). Banner `data-testid="metric-banner"` shows applied **cycle_time v4**, not **페이지 기본값** and not v3. KPI numbers render. Back does not return to the id-only URL (`replace`).
5. `/analytics/cycle-time?v=1&scopeId=ICH&metricId=no_such_metric` — title **지표를 확인하지 못했습니다**, body `unknown_metric: no_such_metric`. No `metricVersion` in the URL. No KPI. **이 지표 쌍 지우기** removes `metricId` and then the page-default v3 banner appears, still without writing a pair.
6. `/analytics/cycle-time?v=1&scopeId=ICH&metricId=queue_time` — title **게시 버전이 없습니다**, body `unpublished: queue_time`. URL unchanged. Not rewritten to `cycle_time` or version `1`.
7. `/metrics/cycle_time?v=1&metricId=occupancy_physical` — path stays `/metrics/cycle_time`. Query gains `metricVersion=3`. The detail banner says the global pair is a different metric (occupancy), not that the path id replaced it.
8. `/analytics/cycle-time?v=1&scopeId=ICH` — no `metricId`. Banner **페이지 기본값** `cycle_time v3`. The URL still has no metric pair. Period materialization may add `from`/`to`; that is existing behavior.
9. `/equipment?v=1&metricVersion=3` — **URL 계약 오류: metric_pair**, not `metric_pair_incomplete`.

Desktop width is enough. This change does not move layout.

## Not in this task

- P0-2 time-domain merge (`server.ts`, time-domain exports in `world.ts`, the TopBar 7-day link).
- Membership check of a finished pair (`metricId=cycle_time&metricVersion=99`). Do not replace it with published `4`. Catalog `version-not-member` copy stays as it is.
- Materializing both-absent into a URL pair, on cycle time or on metric detail.
- Copying a version-only query onto the path `:metricId` (§6.1 third bullet). Version-only remains `metric_pair`.
- Writing the page-owned `version` key on metric detail from the published pointer.
- Changing `PAGE_METRIC_VERSION` from `'3'` to `'4'`, or making the synthetic series follow the published pointer.
- i18n dictionary keys. The new sentences are inline in `App.tsx`.
- A TopBar contract-test link.
- Context Link changes. `linkTo` already copies a finished pair and does not invent a version.
