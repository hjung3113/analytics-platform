# 5b — one `api.ts` per menu group (D8, rule 3)

Apply on top of finished 5a (pages import `@ap/mock-server`; mock lives in `packages/mock-server`). Do not start on a half-moved tree. No `menus/*` (5c). No behavior change. Do not edit `products/feedbackops`, `prototypes/`, `reports/`, `docs/reviews/`, `HANDOFF.md`.

Rule 3 for this step: under `apps/platform-web/src/pages/`, the only files that may import `@ap/mock-server` are the four `api.ts` files below. `main.tsx` and `src/dev/DevTools.tsx` stay direct importers (composition root and the dev simulator; not a menu). Empty groups (`masterData`, `noticeVoc`, `admin`) get no `api.ts`.

`api.ts` imports `@ap/mock-server` and re-exports. It must not import `./cycleData`, `./productivityData`, `./data`, or any page. Calc modules may import `./api`. That direction is one-way.

## Decision — hybrid (C), not (A) or (B)

Job math (`computeKpis`, `trendBuckets`, `occupancyBreakdown`, `attentionRows`, `population`, `findExecution`, `lookupOccurrence`, `segmentsFor`, histogram/trend/slow-list) runs in the menu today, inside `serve({ compute })`, on equipment the server already scoped. A real mart would own that math. **5b does not move it.**

- **Not (B).** Those functions encode menu Candidates (`METRIC_VERSIONS`, `PAGE_METRIC_VERSION` v3, histogram `BINS`, dwell-vs-P95 ranking). `@ap/mock-server` may depend only on `@ap/contracts` and must not learn menu formulas. Moving them also drags `jobs-population.test.ts` into the mock package or forces it to import pages (forbidden). `serve()` adds 450ms plus jitter and a `partial` counter; routing CSV export through `serve()` would change timing and toasts (below).
- **Not bare (A).** Do not `export *` from the mock. The barrel below is the closed list the screens already use. Calc files switch their imports to `./api` and keep their bodies. The real-server swap then edits `api.ts` only for `serve`, and edits the calc files only for the functions named in "Swap later".
- **(C) now:** import wall + closed re-exports. Same function references, same sync calls, same UI.

**Swap later (not this PR).** Replace `serve` inside each `api.ts` with that group's HTTP. These sync readers are the ones that become endpoints, after which the `compute` callbacks shrink to identity: `jobsInPeriod`, `jobsForEquipmentDay`, `cycleMinutes`, `jobPercentile`, `bucketStart`, `observableHours`, `EQUIPMENT` (via `population` / `findExecution` / `lookupOccurrence` / `segmentsFor` / `allExecutions` / `computeKpis` / `trendBuckets` / `occupancyBreakdown` / `attentionRows` / `buckets`). Do that after 5c, in the menu package, not in `@ap/mock-server`.

`periodHours` is client date math (`(to-from)/3_600_000` on `GlobalContext`) that happens to live in the mock. The page needs it before `usePlatformQuery` to pick granularity and `enabled`. Do not fold it into the response. Re-export it. On the real swap, move the four-line body next to the page; do not fetch it.

## 1. `getScenario` / `resolveEquipment` / export

Only `CycleTimeDrilldown.tsx` `exportRows` uses them (lines 119–131). It is synchronous on purpose.

`serve()` is the wrong pipe. It sleeps ~450ms, and `partial` can return `error` while export today still downloads. Scenario `too_large` refuses export even when Selection is narrow; `serve` returns `too_large` only past `maxHours` with a wide Selection. Scenario `forbidden` toasts "not available for this response state"; `resolveEquipment(...).forbidden` toasts "server rejected". Scenario `empty` downloads a header-only CSV and the success toast, not the refusal toast.

Add this function to `cycleData.ts` (it already owns `population`). Do not put it in `api.ts` (that would import `cycleData` and cycle).

```ts
export function rowsForExport(global: GlobalContext, version: string | null):
  | { status: 'unavailable' } | { status: 'rejected' } | { status: 'ok'; rows: Execution[] } {
  const scenario = getScenario();
  if (version === null || scenario === 'error' || scenario === 'forbidden' || scenario === 'timeout' || scenario === 'too_large') {
    return { status: 'unavailable' };
  }
  const resolved = resolveEquipment(global);
  if (resolved.forbidden || !global.from || !global.to) return { status: 'rejected' };
  const rows = scenario === 'empty' ? [] : population(resolved.rows, global, version);
  return { status: 'ok', rows };
}
```

`exportRows` keeps CSV building, object URLs, and the two toast strings. `unavailable` → existing refusal toast and return. `rejected` → existing rejection toast and return. `ok` → the current filter/sort/download/success toast, using `result.rows` where the code used `rows`. Delete the `getScenario` / `resolveEquipment` calls from the TSX. No other call site changes.

## 2. Domain types

Do **not** move `Equipment`, `Job`, or `Grain` to `@ap/contracts`. Contracts are the platform port (URL, manifest, response envelope, `PlatformAdapter`). These are menu/server-world shapes.

Re-export them from the group's `api.ts`. Analytics and equipment each re-export `Equipment` from `@ap/mock-server` (two facades, no cross-group import). `Granularity` stays a local alias of `Grain` inside `productivityData.ts` and `cycleData.ts`. Metrics never names `Equipment`: `buildDefinition` already passes the `serve` equipment list into `populationExamples`. Drop the `= EQUIPMENT` default so `metrics/data.ts` has zero mock imports. The only caller is `populationExamples(metric.populationRule, equipment)` — same values.

`RoleId` / `USERS` stay on `DevTools.tsx` via `@ap/mock-server`, not on a page `api.ts`.

## 3. Cross-group (rule 2)

No page file imports another area. Cross-menu navigation is already `linkTo(...)` only. Do not add a shared data module.

The only cross-area edge is `src/published-metrics.test.ts`: `resolveMetric` from analytics `cycleData`, `METRICS` from metrics `data`, `PUBLISHED_METRICS` from `@ap/mock-server`, `classifyMetricInit` from `@ap/kernel`. `resolveMetric` does not read the catalog; the test is what joins them. **5b does not make either `api.ts` export `PUBLISHED_METRICS` and does not move the test.** 5c must leave this file in the app (a menu package cannot import the other menu). Splitting it into two single-group tests is optional later, not 5b.

`jobs-population.test.ts` is intra-analytics (`productivityData` + `cycleData`) plus mock symbols. Retarget those mock symbols at `./pages/analytics/api` (same bindings). Do not move the file. 5c can then move it with the analytics group without a direct `@ap/mock-server` import.

## 4. New files — exact exports

`apps/platform-web/src/pages/home/api.ts`

```ts
export { serve } from '@ap/mock-server';
```

`apps/platform-web/src/pages/equipment/api.ts`

```ts
export { serve } from '@ap/mock-server';
export type { Equipment } from '@ap/mock-server';
```

`apps/platform-web/src/pages/metrics/api.ts`

```ts
export { serve } from '@ap/mock-server';
```

`apps/platform-web/src/pages/analytics/api.ts`

```ts
export {
  serve, periodHours, getScenario, resolveEquipment, CYCLE_VERSION_NOTE,
  EQUIPMENT, DATA_THROUGH, jobsInPeriod, jobsForEquipmentDay, cycleMinutes,
  jobPercentile, bucketStart, observableHours,
} from '@ap/mock-server';
export type { Equipment, Job, Grain, Scenario } from '@ap/mock-server';
```

No new `@ap/mock-server` file and no `index.ts` edit. 5a's barrel already exports every name above. Do not add `styles.css`.

## 5. Import rewrites

Change only the module specifier, except where a line is deleted or `rowsForExport` / `populationExamples` is named. Keep aliases (`bucketStart as jobBucketStart`).

| File | After 5a | 5b |
| --- | --- | --- |
| `pages/home/OperationsHome.tsx` | `serve` from `@ap/mock-server` | `from './api'` |
| `pages/equipment/EquipmentMaster.tsx` | `serve` and `type Equipment` from `@ap/mock-server` | one import `from './api'` |
| `pages/equipment/EquipmentDetail.tsx` | `type Equipment` from `@ap/mock-server` | `from './api'` |
| `pages/equipment/data.ts` | `type Equipment` and `serve` from `@ap/mock-server` | both `from './api'` |
| `pages/metrics/MetricCatalog.tsx` | `serve` from `@ap/mock-server` | `from './api'` |
| `pages/metrics/MetricDetail.tsx` | `serve` from `@ap/mock-server` | `from './api'` |
| `pages/metrics/data.ts` | `EQUIPMENT` from `@ap/mock-server` | delete the import. Signature: `populationExamples(rule, equipment)` with no default |
| `pages/analytics/ExecutionDetail.tsx` | `serve` from `@ap/mock-server` | `from './api'` |
| `pages/analytics/ProductivityOverview.tsx` | `CYCLE_VERSION_NOTE`, `periodHours`, `serve` | all `from './api'` |
| `pages/analytics/CycleTimeDrilldown.tsx` | `CYCLE_VERSION_NOTE`, `getScenario`, `periodHours`, `resolveEquipment`, `serve` | `CYCLE_VERSION_NOTE`, `periodHours`, `serve`, and `rowsForExport` (plus existing `population` helpers) from `./cycleData` / `./api` as follows: mock names from `./api`; add `rowsForExport` to the existing `./cycleData` import; delete `getScenario` and `resolveEquipment` |
| `pages/analytics/productivityData.ts` | `bucketStart`, `DATA_THROUGH`, `jobPercentile`, `jobsInPeriod`, `observableHours`, `type Grain`, `type Job`, `type Equipment` | those names `from './api'`. Keep `export { DATA_THROUGH }` (re-export the api binding) |
| `pages/analytics/cycleData.ts` | `EQUIPMENT`, `type Equipment`, `bucketStart as jobBucketStart`, `cycleMinutes`, `jobPercentile`, `jobsForEquipmentDay`, `jobsInPeriod`, `type Job` | same names `from './api'`, plus `getScenario` and `resolveEquipment` for `rowsForExport` only |
| `src/jobs-population.test.ts` | `cycleMinutes`, `EQUIPMENT`, `jobsInPeriod` from `@ap/mock-server` | `from './pages/analytics/api'` |
| `src/main.tsx`, `src/dev/DevTools.tsx`, `src/published-metrics.test.ts` | unchanged | unchanged |

Do not rewrite `serve({...})` option objects. Do not introduce `fetch`.

## 6. Tests

No file moves. Count stays **67** (kernel 13, components 3, mock-server 30, app 21). Semantics unchanged, so do not add a test. `jobs-population` (4) still imports `computeKpis` / `trendBuckets` / `percentile` / `population` from the page modules. `published-metrics` (3) stays at `apps/platform-web/src/published-metrics.test.ts`.

After 5c: `jobs-population.test.ts` travels with `menus/analytics`. `published-metrics.test.ts` stays in the app. Mock-only tests (`adapter`, `explicit-empty`, `time-domain`) stay in `@ap/mock-server`.

## 7. Docs

1. `apps/platform-web/AGENTS.md` — replace the 5a D8 sentence with: 페이지·`data.ts`·`cycleData.ts`·`productivityData.ts`는 `@ap/mock-server`를 import하지 않는다. 그룹의 `pages/<area>/api.ts`만 import한다(`home`, `equipment`, `analytics`, `metrics`). 화면은 아직 `api.ts`가 다시 내보낸 `serve`를 호출한다. 집계 함수는 메뉴에 둔다(5b는 mock 패키지로 옮기지 않음). `api.ts`를 새로 만들지 말고 그 넷만 고친다.
2. `apps/platform-web/README.md` page-writing guide — step 2: `serve` comes from `./api`, not from `@ap/mock-server`. Add: 데이터 원천 import는 `api.ts` 한 파일. 다른 메뉴 폴더를 import하지 않고 이동은 `linkTo`만. Step 10: `EQUIPMENT`는 각 화면이 `serve`의 `compute`로 받은 목록을 쓰고, metrics 카탈로그는 월드 표를 직접 읽지 않는다.
3. `docs/integration/platform-packages.md` §7 — mark **5b done**: 그룹마다 `pages/<area>/api.ts`가 `@ap/mock-server`의 유일한 페이지 접점. D8의 import 벽만 해소. 집계의 서버 이관과 `menus/*`는 5c 이후. Banner: 5b 완료, 5c·6 남음. Do not check off rule 3 for `menu-*` packages; they do not exist yet. The pages tree is the stand-in.
4. `packages/mock-server/AGENTS.md` (the file 5a adds) — replace "pages call `serve` directly" with: 메뉴 코드는 이 패키지를 직접 import하지 않는다. `apps/platform-web/src/pages/<area>/api.ts`와 앱 조립(`main.tsx`, `src/dev/DevTools.tsx`)만 import한다. 생산성·사이클 집계는 메뉴 쪽에 둔다.

## 8. Acceptance

`pnpm typecheck`, `pnpm test`, `pnpm build` from the root. Test total **67**, same four-way split as 5a. No new failure and no new test.

```sh
grep -rn "@ap/mock-server" apps/platform-web/src/pages
```

Expected, only these four lines (exit 0):

- `pages/home/api.ts`
- `pages/equipment/api.ts`
- `pages/metrics/api.ts`
- `pages/analytics/api.ts`

`grep -rn "@ap/mock-server" apps/platform-web/src/pages -g '!**/api.ts'` → no output, exit 1.

CSS selector set unchanged (no class edits). Same command as 5a:

```sh
tr '}' '\n' < apps/platform-web/dist/assets/*.css | sed 's/{.*//' | tr ',' '\n' | grep '^\.' | sort -u
```

Diff against the 5a build must be empty.

Browser (`pnpm dev`, http://127.0.0.1:5173), engineer role, scope ICH, default 1-day range. Dev-tools scenario back to `normal` after each case.

- `/` — notice for ICH renders; dismiss hides it for the session.
- `/equipment` — table loads; status filter changes rows; open the drawer; CSV download still fires.
- Equipment detail — from the master table, open the first row's full page. Fields and audit render. Do not guess an id; the world is seeded (`ICH-PHOTO-0103` is a known late tool, not necessarily row 1).
- `/analytics/productivity` — four KPI cards show numbers, not the error state; granularity `주` redraws the trend; cycle-time note under the chart is the v4 string.
- `/analytics/cycle-time` — KPI count > 0; export downloads `cycle-time-executions.csv`. Set scenario `empty`, export again: file has a header and the success toast, not the refusal toast. Set scenario `error`: refusal toast, no download. Set scenario `forbidden`: same refusal toast. Restore `normal`.
- From the slow-execution table, open one detail (`/analytics/executions/:equipmentId?...&anchor=...`) — occurrence panel, not the missing state. Back returns to cycle time.
- `/metrics` — catalog rows; open `cycle_time`. Definition, usage, and history sections load. Pair banner does not invent a version when the global pair is absent.
- Toggle role to `viewer` on productivity: forbidden or a reduced equipment set, previous engineer numbers not left on screen. Toggle back.

## 9. Resolved vs open

Resolved here: (C) not (B); types on `api.ts` not contracts; export stays sync; `periodHours` stays a re-export; no cross-group import; metrics drops the `EQUIPMENT` default; no mock-server API growth; tests unmoved; dev tools stay direct importers.

Not a 5b blocker (do not ask the implementer to choose): when the deferred mart move in "Swap later" happens. Default is after 5c, inside the menu package.

Open for the user, not this PR: whether `published-metrics.test.ts` should be split into two single-group tests before 5c, or kept as a permanent app integration test. 5b keeps it in the app either way.
