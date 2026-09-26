# Review — Consumer screens & cross-screen consistency (omp-screens)

- **Scope:** `prototypes/platform-app` `src/pages/**` (home, equipment, analytics, metrics) and how they consume `src/kernel` / `src/platform`. PR #13, branch `hjung3113/platform-app-prototype` @ `8d64001`.
- **Method:** full read of all 9 page files + data modules + kernel/platform consumption; `npx tsc --noEmit` (clean) and `npx vitest run` (10/10 pass); deterministic data recomputation via `vite-node` scratch scripts; live browser verification against the running dev server at `http://127.0.0.1:5190` (read-only), including all §19 scenarios through the top-bar flask simulator and the documented 11 → 12 → execution-detail → back flow.
- **Counts: P0 = 0 · P1 = 2 · P2 = 3.**

## P1 findings

### P1-1. Screen 11 contradicts itself: trend-chart total ≠ KPI-card total while the chart asserts "KPI 카드와 동일 합산"

Reproduced live at the page's default state (`/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T00:00:00&to=2026-09-26T00:00:00`, 7-day period → default granularity `day`):

- KPI card: `Job 처리량 19,888 Job · 기간 내 완료 … 완료 19,888 / 착수 20,337`
- Trend chart subtitle (same page, same request): `… 합계 19,904 Job (KPI 카드와 동일 합산)`

The parenthetical claim is false whenever granularity ≠ `hour` (i.e. the default for any period > 48 h). Recomputed across all ICH equipment for the same period: KPI 29,454 completed vs daily-bucket sum 29,544.

Root cause — the two widgets aggregate at different bucket grains from per-bucket randomized rounding:

- `src/pages/analytics/productivityData.ts:138` — `computeKpis` rolls up **`'hour'`** buckets.
- `src/pages/analytics/productivityData.ts:161-171` — `trendBuckets` rolls up at the **page granularity** (`day`/`week`).
- `src/pages/analytics/productivityData.ts:97` — jobs are `Math.round(p.jobsPerHour * effHours * (0.7 + r()*0.6))` per bucket with a per-(equipment, bucket-start) RNG (`:95`), so Σ(24 hourly buckets) ≠ 1 daily bucket.
- `src/pages/analytics/ProductivityOverview.tsx:188` computes the chart total from the trend buckets and `:253` prints the "(KPI 카드와 동일 합산)" assertion next to it.

Why it matters: wireframe 11 §4 makes "차트의 일별 합은 KPI 1,248과 일치한다" an explicit data checkpoint of this screen, and 11 §6 (계산 세대, Decided consumption of 06 §18) requires the card, chart and table to come from the same completed generation. Two numbers for the same metric in one viewport, one of them labeled "identical", is exactly the inconsistency the checkpoint exists to prevent. (The occupancy KPI vs the breakdown table do agree — both verified 5,351.5 h / 9,072.0 h — so the fix is to derive throughput (and dwell/cycle pools) from one shared bucketing.)

### P1-2. Screens 11 and 12 give contradictory counts and quantiles for the same equipment + period

The README's "검증한 교차 흐름" (생산성 개요 → 주의 항목 → 사이클타임) lands a user on two views of the *same* completed-job population that disagree by 10–30×:

Live, same scope/period, no selection (engineer grants):

| Screen | P50 | P95 | count |
| --- | --- | --- | --- |
| 11 생산성 개요 KPI | 45.3 분 | 89.1 분 | 완료 Job 모집단 **n=19,888** |
| 12 사이클타임 상세 KPI | 48.2 분 | 94.7 분 | 실행 수 **1,176** ("완료된 합성 Job") |

Per-equipment (computed deterministically, same inputs each page uses):

| Equipment | 11 (productivityData) | 12 (cycleData) |
| --- | --- | --- |
| ICH-PHOTO-0111 | attention n=646, P95 89.9 | n=21, P50 46.5 / P95 54.1 |
| ICH-CVD-0146 | n=543, P95 87.9 | n=28, P50 50.4 / P95 108.4 |
| ICH-ETCH-0125 | n=561, P95 150.9 | n=28, P50 59.6 / P95 67.8 |

Root cause: two independent synthetic generators model the "same" world — `productivityData.ts:40-54` (`jobsPerHour` 1.5–5.0/h ⇒ ~19.9k jobs/week) vs `cycleData.ts:329-367` (`allExecutions`, 3–6 jobs/day ⇒ ~1.2k/week). The attention rows on 11 (`ProductivityOverview.tsx:347`) deep-link to 12 (`selectedEquipmentIds=…`), so the contradiction is visible in a single two-click flow: 11 says "P95 상위 … n=646", one click later 12 says 21 executions for that equipment and period.

The version difference (11 labels cycle v4, 12 defaults to cycle_time v3) can justify different *durations*, not different *completed-job counts*; neither screen's copy explains the population gap. This breaks the synthetic-world internal consistency this review was asked to check and undercuts the §22 demo value of the flow (a reviewer cannot tell whether the Context Link preserved the population). Fix options: derive 12's executions from 11's profile generator (or vice versa), or subsample one shared generator; the counts must match for identical scope/equipment/period.

## P2 findings

### P2-1. Registry declares `features.export = false` for the metric catalog, but the screen implements CSV export

`src/kernel/registry.ts:126` — `metric-catalog` has `features: noFeatures` (export false), yet `src/pages/metrics/MetricCatalog.tsx:203-215` implements `onExport` (CSV of filtered/selected rows), which the table renders as an Export button. `features` is not consumed anywhere in `src/` (grep: no reader), so the declaration is dead metadata that contradicts both the screen and wireframe 13 (선택 내보내기 is a listed secondary action). Set `export: true` or stop declaring the field — a Menu Registry field that disagrees with reality is exactly the drift §5 (menus declare, shell consumes) exists to prevent.

### P2-2. `granularity` page key has different value domains on 11 vs 12; `week` is a hard error on 12

Live: `/analytics/productivity?...&granularity=week` activates the Week radio (valid), but `/analytics/cycle-time?...&granularity=week` renders "Invalid page key — granularity=week is not a registered value. Allowed: hour|day, …". `cycleData.ts:96-100` (`resolveGranularity`) accepts only `hour|day`, while wireframe 12 §3.1 registers `granularity=hour|day|week` (Candidate) and 06 §6.1's granularity example lists `hour`/`day`/`week`. Same key name, same archetype family, divergent contract — a shared link or a user who learned the key on 11 gets a contract-error screen on 12. Either implement `week` bucketing on 12 or document the narrowing in the registry/wireframe.

### P2-3. Productivity overview keeps share-worthy state out of the URL (KPI selection, breakdown axis, breakdown sort)

`ProductivityOverview.tsx:41-43` — `selectedKpi` (which KPI the main trend shows), breakdown `axis`, and the breakdown table's `sort` are `useState`-only. The app README's page-authoring rule 4 puts tab/filter/sort state that must survive a share link into registered page keys; the sibling screen 12 registers `sort` (and `percentile`) but 11 registers only `granularity`. Consequence: a reader sent "the P95 trend, occupancy sorted by denominator" gets the default view instead. The README's "남은 플랫폼 과제" already acknowledges unregistered table sort/pagination keys generally, but not `selectedKpi`/`axis`; listing them here so the gap is explicit rather than implicit.

## Verified clean (no finding)

- **Page-authoring rules (README §페이지 작성 가이드):** all 9 pages render `PlatformPage` with slots only (`title/description/primaryAction/secondaryActions/contextExtension/dataTrustSummary/crumbs/children`); no page builds its own date or Scope picker (the only `type="date"` inputs live in the shell's `GlobalContextBar`); every data path goes through `usePlatformQuery(serve(...)) → QueryView` / `PlatformDataTable.loadPage→serve` envelope; no hand-built URL strings in `src/pages` (grep — navigation is exclusively `linkTo`/`PlatformLink`/`navigate(returnTo)`; the only `window.location` use is MetricDetail's clipboard copy, not navigation); every `setPage`/`pageParam` key is in the route's registered `pageKeys` (checked per page against `registry.ts`); styles are token-utility-only in `src/pages` (no raw hex / shadow stacks; hex fallbacks exist only in platform `EChart.tsx`, and the drawer/popover overlay shadows are already flagged in the README's remaining-tasks list).
- **ko/en copy:** EN-mode sweep of 7 URLs (home, equipment list/detail, productivity, cycle-time, metric catalog/detail) found zero Korean leftovers; master values (IDs, team names) stay untranslated as specified.
- **Cross-menu flows:** selection overrides happen only on explicit user actions, each labeled — attention "사이클타임 상세 →" link (carries `selectedEquipmentIds=…`, verified live), equipment drawer "관련 분석" tab and both bulk actions ("선택 설비로 분석" / "Narrow analysis…"); opening a detail never touches Selection. Destination IDs travel as `params`/page keys only (`/equipment/:equipmentId`, `/analytics/executions/:equipmentId?entityType&anchor`), separate from `Selection`; `returnTo` restores the departure URL **exactly** (verified byte-identical for both equipment-detail and execution-detail round trips, list filters `q/status/focus` included). `metricId`+`metricVersion` travel as bare tokens; the catalog's "사용처 열기" (`/metrics/cycle_time?version=3` → `/analytics/cycle-time?...&metricId=cycle_time&metricVersion=3`) applies the pair on 12 and preserves a different-metric pair instead of overwriting it (`judgeGlobalPair`/`resolveMetric` + banner copy).
- **§19 per-widget states (flask simulator, live):** normal / slow / empty / partial / forbidden / too_large / timeout / error / unknown_status all render per-widget on the productivity overview — partial fails only alternating widgets (KPI cards stayed up with deltas while trend/attention showed the error + correlation path), empty shows "조건에 맞는 결과가 없습니다" with the explicit-empty-selection escape hatch, forbidden/too_large/timeout/error each render their taxonomy message in every widget independently, unknown_status renders data with "일부 상태 미확인" trust state.
- **Archetype structure:** 11+home follow Overview §12.1 area order (KPI → main trend → attention, trust in header slot); 12 follows Analysis Workspace §12.2 (KPI → primary chart → selection → breakdown table → trust) with bucket/histogram filters local-only as annotated on-screen; 09 follows Management §12.3 with DetailDrawer (focus deep link + Full Page both live) and Audit tab; 13 follows Catalog §12.4 with a Full-Page detail (per §20) showing Version/Ownership/Coverage/Usage/History without hidden tabs. Registry context declarations match wireframe Decided capabilities checked (09: Time △/Equipment O/Lot X/Metric X; 13: Metric Version O, others reference/unsupported).
- **Build/tests:** `npx tsc --noEmit` clean; `npx vitest run` 10/10 (kernel URL contract tests).

## Notes (not findings)

- Known/acknowledged gaps I deliberately did not re-report as new: unregistered table sort/pagination, cycle-time bucket/histogram filters, equipment drawer tab, per-metric version page keys, single `metricVersion` field in the Trust envelope, overlay shadows, bundle size — all already in the app README's "남은 플랫폼 과제".
- `cycleData` anchors are second-precision synthetic values, so the full-precision anchor-preservation rule (§6.1) is not exercised by the data; the page does reject rounded/missing anchors with the correct copy (`ExecutionDetail.tsx:177-184`).
