# M2 batch 2 — THROWAWAY, never merge

Branch: `hjung3113/proto-m2-batch2`. Local issue sources: `.review/207-issue.md`, `54-issue.md`, `55-issue.md`.
No decision is approved by this bundle. No commit, network, server, tests, or FeedbackOps source edit was performed.

Run from repository root: `pnpm dev` (coordinator only). Default origin: `http://127.0.0.1:5173`.

## Questions / platform verification

- Q1 #207: Which legend and line encoding distinguishes series and periods? Verifies shared Chart Frame, §16 interactions and §26 non-colour cues.
- Q2 #54: Shared filter row or category popover? Verifies a common component consumed by existing Management/Catalog screens. No new menu screen or table-toolbar change.
- Q3 #55: How should several widgets report the same observed outcome? Verifies shared §19 state rendering within the existing Overview archetype.

Existing IA, navigation, Kernel requests, permissions, data and URL keys remain the inputs. Only presentation is a candidate. No production API promotion or canonical DESIGN/ROADMAP decision is made.

## A/B/C

| Question | A | B | C |
| --- | --- | --- | --- |
| Q1 | Existing line-shaped legend; existing Compare encoding | Legend groups by current/previous period; filled 12px bar square with 2px stroke; current P50 solid/P95 dashed; previous P50 dotted/P95 dash-dot `[8,3,2,3]` | Legend table aligns current/previous columns by quantile; outlined filled bar square; P50 solid/P95 dashed in both periods; previous P50 circle/P95 triangle symbols shown in plot and legend |
| Q2 | Existing native controls | Shared PageFilterBar row: labelled search/text inputs, shadcn Select, existing reset/apply actions | Search/text inputs inline; categorical Select controls in a popover; active category chips clear one key; existing reset/apply actions |
| Q3 | Repeated full-size StateMessage | One page summary banner + icon/title/body/retry compact rows in widgets | One page summary banner + slim widget status chip rows; details disclosure for body; local actions and correlation IDs retained |

Q1 B/C use an opaque `proto-amber-stroke` alias for previous-period lines and their legend samples. Fill identities stay unchanged. A stays the current reference, including its known amber and blue-line legend contrast limitations.

Q3 groups two or more responses only when outcome, message and confirmed empty explanations match. The banner says the responses match, without asserting an unobserved collection cause. Each widget retains its correlation ID; the page banner has no correlation ID. Its single retry refreshes only the queries represented by the matching response group; successful widgets remain visible. Empty retains its local empty escape action; the page banner offers one retry for its affected queries. Forbidden/too_large do not get folded into the shared-cause banner.

## Exact entry URLs

Open each URL with `variant=A`, `variant=B`, and `variant=C` (all three values are supported):

- Q1 histogram: `http://127.0.0.1:5173/analytics/cycle-time?v=1&scopeId=ICH&protoQuestion=chart&variant=B`
- Q1 Compare: `http://127.0.0.1:5173/analytics/productivity?v=1&scopeId=ICH&kpi=cycleTime&protoQuestion=chart&variant=B`
- Q2 equipment: `http://127.0.0.1:5173/equipment?v=1&scopeId=ICH&protoQuestion=filters&variant=B`
- Q2 metrics: `http://127.0.0.1:5173/metrics?v=1&scopeId=ICH&protoQuestion=filters&variant=B`
- Q2 audit: `http://127.0.0.1:5173/admin/audit?v=1&protoQuestion=filters&variant=B`
- Q3 shared states: `http://127.0.0.1:5173/analytics/productivity?v=1&scopeId=ICH&protoQuestion=states&variant=B`

The floating bar shows question + variant + name, supports ←/→ with wraparound, and offers Q1/Q3 question buttons on productivity. It excludes text inputs, editable content, select/combobox, menu/listbox/tablist/dialog controls and modified keypresses. Clicks preserve Kernel history state and page keys. Entry params are captured before Kernel canonicalization. Versioned localStorage stores each question independently (`platform:proto-m2-batch2:v1:chart|filters|states|context`) because Kernel drops unknown URL keys on its next navigation. Production builds render original children without the provider or bar. To compare one question in isolation, set the other question to A using the bar. No chosen design is persisted beyond these prototype preferences.

## Coordinator browser steps

1. On the app rail bottom, open the flask button **응답 시나리오**; choose **정상** for Q1/Q2. For audit, open **역할(데모 전환)** and choose the admin role. Let permission/Scope validation settle, then revisit the audit URL if needed.
2. Q1 histogram: find **실행 수** legend. Verify B/C show filled square + outlined edge, legend checkbox still hides/restores series. Q1 productivity: click **Compare** in the main cycle-time trend chart. It is local chart state; there is no new Compare URL key. Confirm all four line encodings in plot/legend and grayscale, switch A/B/C without resetting Compare. Check tooltip, More/table, Brush, Zoom and Reset retain existing behavior.
3. Q2: type search; change each category; check original page key and `page` reset. Equipment uses `q/status/maker`; metrics `q/status/domain`. Clear a C category chip; confirm only that category clears. Full reset retains the route's existing key set. Unknown status/domain/maker selections remain visible rather than silently becoming All. Verify equipment table actions and toolbar layout are unchanged.
4. Audit: type actor/targetId/fromAt/toAt; confirm they stay draft until **적용** or Enter. Type/action/source changes apply immediately and reset page. Reset clears the original `AUDIT_PAGE_KEYS` (including existing sort/page reset), and clears drafts. Check both C popover categories and inline draft fields.
5. Q3: open flask **응답 시나리오**, choose **서버 오류 (error)**; wait for all four widget results. A repeats large boxes, B/C show exactly one shared summary banner. Check **데이터를 불러오지 못했습니다** and danger tone, local IDs and retries, and banner retry. Repeat **0건 (empty)**: **조건에 맞는 결과가 없습니다**, neutral tone; no claim of collection stop/delay. Repeat **시간 초과 (timeout)**: **조회 시간이 초과되었습니다**, danger tone with period/granularity advice. C must expose advice via **상세 안내**. Also check **일부 위젯 실패**: successful widgets stay visible and a single failure has no shared banner. Return scenario to **정상**.
6. Keyboard: Tab through search/Select/popover/chips/retry/legend controls; arrow keys inside controls must not switch variants. Check bar at narrow viewport and lower-page focus targets. Capture screenshots of all variants; visual layout, accessibility behavior and runtime rendering are UNVERIFIED by this worker (no server allowed).

## Q1 contrast — opaque sRGB calculation

WCAG relative luminance: linearize each sRGB channel, `L = .2126R + .7152G + .0722B`; contrast `(lighter+.05)/(darker+.05)`. Surfaces verified from live CSS token declarations. Values below are static calculations, not screenshot measurements.

| Mark / alias | Hex | Card #fbfdff | Canvas #f3f7fe | Sunken #edf3fb |
| --- | --- | ---: | ---: | ---: |
| A previous amber | #d97706 | 3.125 | 2.965 | 2.854 |
| B/C previous amber stroke | #b45309 | 4.925 | 4.674 | 4.499 |
| Blue square fill (not thin edge) | #3b9cff | 2.789 | 2.647 | 2.547 |
| Blue square outline/current P50 | #2577cc | 4.488 | 4.259 | 4.100 |
| Purple outline/current P95 | #8154ce | 5.032 | 4.776 | 4.597 |

All candidate thin lines, previous markers, and histogram square boundaries meet ≥3:1; fill identity is protected by the outlined shape. The existing named remainder bar swatch uses `border-control` for its edge. Essential labels use opaque text-secondary or semantic danger/warning label tokens; new control boundaries use border-control. Amber stroke is a mark token, never a small-text label (sunken 4.499 is below 4.5).

## Primitive finding / implementation choice

Read FeedbackOps ListToolbar, ListFilterButton, SearchInput, Select, EmptyState and Callout sources. FeedbackOps `SearchInput` currently has only placeholder/className props and renders a disabled input with a “next slice” tooltip. Direct reuse cannot preserve working search. The prototype uses exported `@ap/ui` Input with a search icon and controlled callbacks, mirroring its anatomy without changing the submodule. B uses the actual shadcn Select re-export. C follows ListFilterButton's category-popover structure but keeps single-valued Select categories; the original ListFilterButton is multi-select and would change page-key semantics. Existing table toolbar is untouched. Widget candidates reuse OutcomeView's current mapping; the page banner uses Callout anatomy with the same §19 title/tone mapping.

## Fix round 1 capture checklist

All nine coordinator findings were applied. Re-capture Q3 B/C in error, empty, timeout and partial scenarios: failed widgets retain their name on a neutral card with neutral compact surface; semantic label/icon tones remain. B puts body in a full-width message row and wraps actions/ID below; C uses a chip and disclosure. The page banner has an icon/title, one summary line and one affected-query retry, with no widget ID. A remains the original full-size widget state reference.

For Q2 C, capture the category popover open, then equipment with one status selected and metrics with one domain selected from their live option lists. Chip text is opaque secondary and removal has an explicit localized accessible name. Only equipment/metrics q inputs show Search; exact-match and time draft inputs have no icon. For Q1, capture histogram and productivity with Compare off (plain legend, no period headings), then Compare on (B period groups/C column headings). The P95 reference line and its label use opaque neutral text-secondary in A/B/C.

## Round 2 — Q4 (#56 Context bar compression)

Question id `context`, label `Q4 · #56`, is available on every route in the existing bottom switcher. Preferences use `platform:proto-m2-batch2:v1:context`, entry params are captured before Kernel canonicalization, and production keeps the existing Context bar via A defaults. Q1–Q3 preferences remain independent.

### Variants and measurements

- **A — current:** original wrapping Context bar; no extra Scope selector.
- **B — priority overflow:** a single row. On mount, measure the actual full controls, label, actions and an inert overflow-label probe in `useLayoutEffect` (one set of real editors, no duplicate measurement queries). `ResizeObserver` observes the bar's own DOM width, so a docked panel or sidebar changes the available space without changing viewport width. Available width excludes its 12px side padding. Keep time first; retain remaining controls in order `roomNames → condition → selection → lot → ppid → recipe → metric`, moving the suffix into the overflow popover. Reserve overflow and icon-action widths before adding another indivisible key. Narrow period button can truncate with a full range title/accessible name; its existing day/week/custom presets move into the period popover. Full controls, including capability badges, remain available in the overflow popover. Button says “조건 N개 더 · M개 적용 중”; M counts non-default values among hidden keys (including explicit empty sets and carried/reference values), without claiming server-confirmed application.
- **C — summary + disclosure:** the same full-control width measurement decides when the full bar no longer fits. Narrow state has one 48px row (47px inner line plus 1px bottom border): complete read-only values for every Context key in a truncated summary with full text in its title, fixed capability-count badges (titles list their keys), `Context 편집`, and icon-only link/reset actions. Disclosure has `aria-expanded`/`aria-controls`, opens the existing full controls inline below, and closes on Escape, explicit application or reset. Focus returns to the disclosure after collapse. Wide mode shows the full controls directly. The expanded state is intentionally taller than 48px.

The wrapper is remeasured when global values/capabilities/language/variant change, so initial intrinsic widths and active-key count follow the current Context. It preserves the existing editors, adapter calls, setGlobal/resetContext/link-copy callbacks, URL serialization, permissions, defaults, explicit empty sets and Scope ownership. No second Scope selector was added. Q4 explicitly exposes apply as well as reference/unsupported capability tags. Its actions have accessible names and titles when their text is hidden. No winning design or canonical layout-contract change is claimed.

### Files

- `packages/ui/src/proto/context.ts` — independent context variant with A default.
- `apps/platform-web/src/proto/PrototypeVariants.tsx` — Q4 configuration and availability on every route.
- `packages/shell/src/proto/ContextBar.tsx` — own-width measurement, overflow priority, active count, summary/disclosure and apply/Escape collapse.
- `packages/shell/src/GlobalContextBar.tsx` — candidate composition using existing controls and callbacks; compact period presets; edit completion notifications; capability tags.
- `.review/m2-batch2-README.md` and `.review/proto-report.md` — Q4 handoff.

### Exact capture URLs

Open each with `variant=A`, `variant=B`, `variant=C`:

- `http://127.0.0.1:5173/analytics/productivity?v=1&scopeId=ICH&kpi=cycleTime&protoQuestion=context&variant=B`
- `http://127.0.0.1:5173/equipment?v=1&scopeId=ICH&focus=ICH-PHOTO-0103&protoQuestion=context&variant=B`
- `http://127.0.0.1:5173/metrics?v=1&scopeId=ICH&protoQuestion=context&variant=B`
- `http://127.0.0.1:5173/admin/audit?v=1&protoQuestion=context&variant=B` (admin role)

Use `pnpm dev` only as coordinator; switch DevTools response scenario to **정상**, and admin role for audit. Q4 is selectable on other routes as well. Set Q1/Q2/Q3 to A to isolate Q4. Capture productivity and docked equipment at 1280px and 1024px; keep the detail panel open and sidebar state recorded. Measure the region named **전역 Context**: B and collapsed C target exactly 48px and one row; A remains the wrapping reference. Verify no horizontal overflow at 1024px with the detail panel open.

B: open overflow, apply one room/condition/selection using existing editors, then verify M updates. Exercise explicit empty selection too; it counts as non-default. Verify period presets/custom range, reference/apply badges, clipboard copy and reset; reopen/close the docked detail to confirm own-container resize response. C: inspect summary title for all values, expand by keyboard, apply a change and Escape from an editor, verify collapse and disclosure focus, and exercise copy/reset in collapsed state. Check wide full mode and narrow disclosure separately. Runtime measurements, rendered layout, nested popover keyboard behavior and screenshots remain **UNVERIFIED** by this worker; coordinator owns capture.

### Checks

PASS: `pnpm --config.verify-deps-before-run=false --filter @ap/ui --filter @ap/shell --filter @ap/platform-web run typecheck` and the same selectors with `run lint`, after final code edits. These are all packages changed in Round 2. PASS `git diff --check`; `git status --short products/feedbackops` remains empty. An initial typecheck found apply-notification hook placement errors; these were corrected before the passing runs.

No network, tests, build, dev server, browser, commit, FeedbackOps source edit or `.agents/` edit was performed. Existing coordinator capture/probe scripts were preserved. Height claims above describe the implementation target and static CSS, not a performed browser measurement.
