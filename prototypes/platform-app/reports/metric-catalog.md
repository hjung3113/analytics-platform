# Metric catalog / detail — consumer report

Catalog archetype consumer for `metric-catalog` (`/metrics`) and `metric-detail` (`/metrics/:metricId`). Synthetic data only. Registry was not edited.

## What was built

- **Catalog list** (`MetricCatalog.tsx`): `PlatformDataTable` over 14 seeded metrics (`cycle_time`, `occupancy_physical`, `non_process_dwell`, `job_throughput`, `wafer_move_count`, `queue_time`, `availability_scheduled`, `alarm_count`, `recipe_changeover`, `lot_hold_dwell`, `chamber_utilization`, `rework_rate`, `energy_per_wafer`, `setup_time`). Columns: `metricId` (mono), ko/en name, domain, grain, numerator, denominator, stored published pointer, status badge (draft neutral / published success / deprecated warning), owner, `updatedAt`. Page filters `q`, `status`, `domain` stay in the URL. Page size 8 so pagination is real. Row links open an explicit version. A separate draft link does not change the global pair. CSV export uses the same filtered set or the current selection.
- **Definition detail** (`MetricDetail.tsx`): full page, not a drawer. Visible at once: definition (formula contract, grain, unit, numerator/denominator, filters, wall-clock `[from, to)`), version list with a diff against the previous version (`version` page key), ownership, coverage basis, usage, history (`AuditTimeline`). `tab` scrolls to a section and does not hide the others.
- **Global pair** (`metricId` + `metricVersion`): banner validates the pair through `serve()`. “이 버전을 분석 Context로 사용” calls `setGlobal({ metricId, metricVersion })` with both fields. A different global metric is labelled and kept until that explicit click. The same metric with two versions is a conflict with no automatic winner. A version that does not belong to the metric is an error; nothing falls back to the pointer or the latest number. Drafts cannot be written into the analysis pair.
- **Usage links** carry the viewed pair via `linkTo` to `productivity-overview` and `cycle-time`. `requiresScope: false` on every `serve()`.

## Platform contracts exercised

| Contract | How |
| --- | --- |
| §12.4 Catalog | List → definition → version → ownership → coverage → usage → history |
| §6.1 metric pair | Pair travels together; membership failure is an error; destination id does not overwrite a different global metric |
| §15 table | Sort, column prefs, selection, export, server-style page envelope |
| §19 states | Each widget uses `serve()` + `QueryView` or `PlatformDataTable` |
| §20 full page | Detail is a page, not an edit drawer |
| §22 links | Consumers get `global: { metricId, metricVersion }` of the viewed version, separate from the path id |
| Scope | Catalog does not require Scope; selection is reference-only and does not zero the list |

## Candidate choices (Open items, labelled in the UI)

- Published pointer and the catalog summary version are fields on the record. The client does not compute `max(version)`.
- The list status badge is that stored status. A published metric can still have a draft column. The status filter matches the badge, not “also has a draft”.
- `tab` is an anchor. Definition, coverage, usage and history stay on the page.
- Registration, draft save and publish are Open and are not implemented. There is no formula editor.
- An id-only global pair is not auto-completed with the pointer.
- On the list, an applied metric pair highlights the row. It is not a list filter.
- Usage rows are declared menu bindings for this prototype (`declared-dependency`, observed time unknown). A successful zero means that scope only.
- Coverage is the definition basis plus up to three example equipment ids from `EQUIPMENT`. It is not a runtime percent.
- Queries declare only `processing_delay`, so a runtime coverage assessment is not added.

## Platform gaps

- `metric-detail` page keys are only `tab` and `version`. There is no `returnTo`, and `linkTo` does not copy the catalog’s `q` / `status` / `domain`. The shell breadcrumb back to the catalog drops those filters too. Restoring the list would need a registry change.
- The flask scenario is process-global. Definition, usage and history cannot fail separately, so the wireframe case “history failed, definition kept” cannot be shown.
- `serve()` always stamps `trust.coverage` (about 98.7%). The definition panel says not to read that as this metric’s coverage. The mock cannot omit the percent without editing `server.ts`.
- `collection` assessments are hard-coded `unknown`, so this screen does not declare that kind. `unknown_status` is visible because `processing_delay` flips to unknown.
- `productivity-overview` declares `metric: reference`, not `apply`. The usage link still puts the pair on the URL; the destination shell shows it as reference-only. That is kernel behavior.

## Verification

- `npx vite build` in `prototypes/platform-app`: succeeded (twice, including after the trust-indicator addition).
- `npx tsc --noEmit`: passed once while this screen was the only new page. A later run fails only in `src/pages/analytics/ExecutionDetail.tsx` (`data` is `unknown` at lines 43, 80, 86). That file was not edited here.
- Browser at `http://127.0.0.1:5190` with `scopeId=ICH` (desktop 1440 and mobile 390):
  - List rendered 8 then 6 rows (14). Search `wafer` kept `wafer_move_count` and `energy_per_wafer` (English name). Status `draft` kept `queue_time`. Domain `movement` kept `wafer_move_count`. `metricId` sort set `aria-sort=ascending`.
  - Opening `cycle_time` landed on `version=4`. Apply wrote both `metricId=cycle_time` and `metricVersion=4`. Usage hrefs were `/analytics/productivity?...&metricId=cycle_time&metricVersion=4` and the same pair on `/analytics/cycle-time`.
  - Occupancy detail with global `cycle_time @ 4` showed the preserved-other-metric banner. The button then replaced the whole pair with `occupancy_physical @ 3`.
  - `version=99` and global `metricVersion=99` showed membership errors and did not render the formula. Same-metric `version=3` vs global `4` showed the conflict. Draft `v5` disabled the apply control.
  - `wafer_move_count` v2 usage was a successful empty state. `queue_time` with no version asked for an explicit selection and did not write the pointer.
  - Language 한/EN switched “대기 시간” / “Queue time”.
  - Flask: empty, error, forbidden, timeout, too_large, unknown status, then back to normal. Unknown status showed “일부 상태 미확인” on both the detail trust line and the catalog table.
  - Mobile 390: all six detail sections present, document did not overflow the viewport (`pageOverflow: false`). The wide table scrolls inside the table region.
- Not exercised: the slow scenario, opening the downloaded CSV, clicking through into the productivity page after the link (href only), and an explicit empty equipment selection (the reference-only copy is on the page, but a selection was not applied in the browser).

## Files

- `src/pages/metrics/data.ts`
- `src/pages/metrics/MetricCatalog.tsx`
- `src/pages/metrics/MetricDetail.tsx`
- `reports/metric-catalog.md`
