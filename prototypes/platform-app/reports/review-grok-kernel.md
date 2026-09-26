# Review — Platform layer (grok-kernel)

- **Scope:** `prototypes/platform-app` `src/kernel/**`, `src/shell/**`, `src/platform/**`, `src/mock/server.ts`, `src/App.tsx`, checked against `docs/06_platform_ui_contract.md` §5–§11, §15–§20, §22, §26. PR #13, branch `hjung3113/platform-app-prototype` @ `8d64001`.
- **Method:** read-only. Existing `src/kernel/url.test.ts` (10/10 pass) plus a `/tmp` `vite-node` script for codec edges, explicit-empty `serve()`, multi-equipment `time_domain`, and `validateScope` abort. `npx tsc --noEmit` clean. Dev server on port 5190 was not started or killed. No source file was edited.
- **Counts: P0 = 2 · P1 = 6 · P2 = 5.**

## P0 findings

### P0-1. `metricId` without `metricVersion` is accepted on every route

§6.1 (Decided): a query that has only `metricId` is incomplete input allowed solely at an entry point that declares initialization; the server then writes the confirmed published version into the URL before querying. If that confirmation fails, the UI stays in a selection state. **Any other path is a contract error.** Version-without-id is correctly rejected. Id-without-version is not.

`parseQuery` stores a null version and returns success (`src/kernel/url.ts:144-147`). `url.test.ts:41` locks that in. `App.tsx:19` shows `ContractErrorView` only when `parseQuery` throws, so `/equipment?v=1&scopeId=ICH&metricId=cycle_time` renders the page. Nothing in the registry declares an initialization entry, and nothing writes a server-confirmed version back onto the URL.

Failure beyond the gate: cycle time treats that URL as an applied pair and **substitutes the page default version** for the query while leaving the URL incomplete (`src/pages/analytics/cycleData.ts:83-85`, `global.metricVersion ?? PAGE_METRIC_VERSION`). §6.1 forbids filling a missing or unconfirmed version. The catalog only shows a warning (`MetricCatalog.tsx` `id-only`) and still queries. Neither path is the contract-error screen.

### P0-2. Multi-equipment queries merge with `outcome=ok` and no time-domain assertion

§6.3 (Decided): merging different equipment onto one time axis is allowed only when a server-owned `(equipmentId, timeDomainId, validFrom, validTo)` assertion covers the whole requested `[from, to)` with one `timeDomainId`. Otherwise the outcome is `error` (`time_domain_unverified` / `time_domain_mismatch`), not `empty`, not `unknown`, and not “warn and continue”. `scopeId` is not proof.

`serve()` never checks a time domain. For engineer + `scopeId=ICH` + a 24h period it returns `outcome: 'ok'` and a count **greater than 1**, while the `time_domain` assessment is `{ state: 'unknown', reason: 'source_unavailable' }` (`src/mock/server.ts:125-149`, fall-through at `135-139`). Reproduced with `vite-node` (`latency: 0`, `kinds` including `time_domain`). Productivity and cycle time render those numbers. The unknown chip does not stop the merge, which is the disguise §6.3 forbids. (Single-equipment naive queries are still allowed by the contract; this path does not special-case them.)

## P1 findings

### P1-1. `returnTo` is not restricted to a local registered route

§6.4 / the review check: back-navigation must restore the entry URL and must not be an open redirect.

`linkTo(..., { returnTo: true })` writes the current path+search as an opaque page value (`src/kernel/platform.tsx:133`). `parseQuery` does not validate page values (`src/kernel/url.ts:149-153`). Scratch check: `?returnTo=https://evil.example/phish` round-trips as that string.

Consumers navigate to it raw:

- Execution detail puts it on an `<a href>` (`src/pages/analytics/ExecutionDetail.tsx:28-46`). `PlatformLink` (`platform.tsx:212-219`) only `preventDefault`s a primary unmodified click, then `pushState`. Cmd-click, middle-click, and “Open in new tab” follow `href` off-origin (`https://…` or protocol-relative `//evil.example`). A normal click calls `pushState` on a cross-origin URL, which throws `SecurityError` and leaves the button looking dead.
- Equipment detail calls `navigate(pageParam('returnTo'))` (`src/pages/equipment/EquipmentDetail.tsx:60`) with the same unchecked string.

There is no `matchRoute` allowlist (same-origin path, registered menu, no scheme, no `//`). A crafted `/analytics/executions/:id?entityType=job&anchor=…&returnTo=https://evil.example` is enough.

### P1-2. Unknown `scopeId` is shown as “no access”

§6.2 / §19: an unknown id is not a permission denial, and permission copy is only for a server-confirmed `forbidden`. `checkScope` returns `unknown_scope` when the id is not a site (`src/mock/server.ts:53-56`) and `forbidden` only when the site exists but the role has no grant.

`PlatformPage` (`src/platform/PlatformPage.tsx:36-43`) treats every non-`validating`, non-`none` status as `stateForbidden` (“You do not have access to this scope” / “서버가 현재 사용자 권한으로 요청을 거부했습니다”). `TopBar.tsx:51` labels the same statuses `scopeForbidden` (“No access”). `?scopeId=NOT_A_SITE` is therefore described as a grant failure. `XIA` for `engineer` (real site, no grant) is correctly `forbidden`; the two cases are collapsed.

### P1-3. Table page/sort refresh shows the next page index on the previous rows

§11 allows keeping the previous result only for a **same-context** refresh, with an explicit refreshing label. A context change must hide it.

Context changes do hide rows: `shown` is null unless `JSON.parse(result.identity)[0] === contextIdentity` (`src/platform/PlatformDataTable.tsx:93-95`), and the body becomes a skeleton (`195`). That part is correct.

Page and sort are **not** part of `contextIdentity` (`70`) but they are part of `requestIdentity` (`80`). `effectivePage` updates immediately (`73`) while `shown` stays on the previous response for the whole `serve()` latency (~450ms, longer in the slow scenario). The status line prints the **new** page number (`169`) over the **old** rows. Same mismatch when a header sort resets to page 0 via `onSortingChange` (`116`) while page-2 rows are still on screen. The refreshing spinner is shown (`171`), but the label claims those rows are already the new page.

### P1-4. `PlatformDataTable` swallows every `loadPage` rejection

`usePlatformQuery` maps a non-abort rejection to `outcome: 'error'` with a correlation id (`src/kernel/query.ts:34-37`). The table does not:

```86:87:prototypes/platform-app/src/platform/PlatformDataTable.tsx
      .then(response => { if (!controller.signal.aborted) setResult({ identity: requestIdentity, response }); })
      .catch(() => { /* aborted */ });
```

Abort is not distinguished from a thrown `compute`. `loading` stays true (`95`: `result.identity !== requestIdentity`) until a later successful response. With no prior `shown`, the skeleton never resolves and no correlation id appears. With a prior same-context result, the spinner stays on the stale page for good. §19 requires a server error to show the correlation id.

### P1-5. `role="radio"` groups are not arrow-key operable

§26 keyboard access. The period preset group handles Left/Right (`GlobalContextBar.tsx:105-130`) but never moves DOM focus onto the newly checked radio, so focus stays on a `tabIndex={-1}` button after the URL update. The other groups expose `role="radiogroup"` / `role="radio"` and do not handle arrows at all, so a screen reader that announces “radio” gets no selection change from the arrow keys:

- date vs date-time (`GlobalContextBar.tsx:160-164`)
- absent / explicit / empty (`201-204`)
- condition axis (`253-255`)
- scenario (`TopBar.tsx:79-83`)

Tab + Enter still activates them (they are `<button>`s). The role contract is what fails.

### P1-6. Below 1440px the drawer covers the page but does not take it out of the tab order

Non-modal behavior that **does** work: `aria-modal="false"` (`DetailDrawer.tsx:26`), focus moves to the close button and returns to the opener on unmount (`18-24`), and Escape closes when the event reaches the `<aside>` (`27`).

§25’s 1024–1439 band is in scope. `wide` is 1440px (`style.css:78-81`). Below that, `wide:pr-[32rem]` is not applied, and the drawer is `fixed` at `32rem` over the list (`DetailDrawer.tsx:28`). The covered page is not `inert`. Tab leaves the drawer and lands on controls the panel is covering. Escape is not listened for on `document`, so once focus is outside the aside the drawer stays open. At ≥1440 the list is reflowed beside the drawer; this finding is the overlay breakpoint only.

## P2 findings

### P2-1. Duplicate registered page keys are kept

§6.4 cardinality-1 duplicates are errors for global singletons (that part is enforced). A repeated registered page key is not. `parseQuery('?granularity=hour&granularity=day', ['granularity'])` returns both pairs (`url.ts:149-153`). `pageParam` uses the first (`platform.tsx:195`). A later `setGlobal` rebuilds the query from `page` and writes both values back, so the URL and the value the page reads can disagree.

### P2-2. Explicit empty selection is `outcome=ok` unless the caller passes `isEmpty`

§6.1: a supported explicit empty set, with the rest of the request valid, is `outcome=empty`. `resolveEquipment` correctly filters `selection: []` to no rows (`server.ts:83-87`). `serve()` then returns `ok` + `[]` when `isEmpty` is omitted (`133-143`). Reproduced. Equipment master’s inner `loadPage` and the productivity queries pass `isEmpty`, so those screens do show the empty state. The server default does not implement the rule; a caller that forgets `isEmpty` renders an empty success payload (`EquipmentMaster.tsx:23` source query is one such caller; the inner table hides it).

### P2-3. Menu permission is enforced only in the client route gate

§17: the same permission rule applies to menu visibility, route access, and query results, and the server re-validates. `App.tsx:21-22` and `visibleMenus` (`platform.tsx:139`) do hide the page and show a denial that is distinct from empty — that UI split is correct. `serve()` never reads `menu.permission` or `USERS[role].permissions` (only scope/room grants). The denial copy says the server rejects the direct URL (`App.tsx:22`); the mock server would still compute the data if the page mounted or a caller invoked `serve()` directly.

### P2-4. Apply-mode Lot / PPID / Recipe / metric cannot be edited from the context bar

Room and Selection implement absent (`null`) / explicit empty (`[]`) / selected, and Apply is explicit (`GlobalContextBar.tsx` `SetEditor`, `187-224`). Condition Apply sends only `{ condition }` (`266`) and does not touch Selection. Verified in code.

Lot, PPID, Recipe, and the metric pair are only removable carried chips, and only when the value is already non-null (`37-40`), even on cycle time where those capabilities are `apply` (`registry.ts:104`). An absent Lot cannot be turned into an explicit empty set or a selection from the shell. The codec can represent those states; the bar cannot author them.

### P2-5. Reset drops unregistered keys; the first scope paint ignores the URL

`resetContext` rebuilds the query without `extras` (`platform.tsx:125`). §6.4 says unregistered keys stay on the current URL (they are not promoted, not deleted by a context edit). Reset of analysis context also strips `utm`-style extras. `setGlobal` does keep them (`114`).

Separately, `scope` is initialized to `{ status: 'none' }` (`platform.tsx:66`) even when the URL already has `scopeId`. The first paint of a deep link takes the “Select a scope” gate (`PlatformPage.tsx:39-41`), including the session-suggestion button, until the effect flips to `validating`. Queries do not run in that paint (children are unmounted). It is a wrong gate, not a session fill — `lastScope` is not written into the URL unless the user clicks.

## Checked, no finding

- **URL codec (except P0-1 and P2-1).** Repeated set ids are de-duplicated and sorted by Unicode code point, not trimmed or case-folded (`é` and `e\u0301` stay distinct). Whitespace-only ids fail `invalid_id`. `equipmentSelection=none` is explicit empty; marker+ids (including the `equipmentIds` alias) is `invalid_set`; `equipmentIds=` is `invalid_id`. Identical duplicate singletons (`ppid`, `metricId`, `scopeId`) fail `duplicate_singleton` with no first/last-value guess. `v` other than a positive integer `1` is `invalid_version` or `unsupported_version` and is not rewritten. Omitted `v` is accepted as v1; new canonical URLs emit `v=1`. Partial `from`/`to`, `Z`, offsets, fractions, date-only, and impossible calendar dates (`2025-02-29`, `from == to`) are rejected. Naive `shift` across month-end and a leap day matches calendar arithmetic (`2026-03-01T00:00:00` − 24h → `2026-02-28T00:00:00`). Default materialization uses `DEFAULT_RANGE_TO` from the mock world, not `Date.now()`, and only when both ends are absent on a `time: 'apply'` menu (`platform.tsx:173-176`).
- **Context Link helper preserve vs apply.** `linkTo` copies the full global context regardless of the target’s capability and does not copy current page keys or unregistered extras (`platform.tsx:127-135`). Sidebar and palette hops use that helper. Unsupported values stay in the URL and render as a dashed “not used” chip (`GlobalContextBar.tsx` `CarriedChip`). Applying vs preserving at query time is the caller’s `global` argument to `serve()` (execution detail strips reference filters; that strip is page code, not a helper bug).
- **Condition vs Selection.** Changing or clearing Condition does not patch `selection`. Scope change is different on purpose: a new `scopeId` clears room, condition, selection, lot, recipe, and ppid and toasts (`platform.tsx:106-113`), matching the site boundary rather than a silent condition edit. Selection outside the current condition is listed and not auto-removed (`GlobalContextBar.tsx:279-284`).
- **`usePlatformQuery` races.** Result identity is `(role, serialized global, page inputs, scenario)` (`query.ts:19`). A change nulls `response` until the new request settles, so the previous payload is not shown as the new context. The effect aborts on cleanup and ignores an aborted resolution (`31`, `35`). Same-identity `refetch` keeps the previous payload and reports `refreshing`. `validateScope` rejects when aborted before the 350ms timer (reproduced, including an abort at ~349ms). The effect does not apply a rejected call (`platform.tsx:164-168`). Session `lastScope` is not copied into the URL on load.
- **Permission UI split.** A role without the menu permission gets a warning state, not the empty-data state (`App.tsx:21-22`). Sidebar, palette, and favorites are filtered through `visibleMenus`. Direct URL to an unknown path is `notFound`, distinct from both.
- **Chart frame state split (§16 / §6.1).** Zoom and brush live in component state (`AnalysisChartFrame.tsx:75-79`). `datazoom` only calls `setZoom` (`155-158`). Brush stores a local selection; “Apply analysis range…” opens a confirm step and only then calls `setGlobal` (`238-244`). Cancel clears the preview and leaves the local brush. `resetLocal` (`91-93`) does not touch `annotationStore`; annotations survive Reset. Point click does not call `setGlobal` (`159-163`). ECharts is `useUTC: true`, consistent with the UTC-labelled naive clock.
- **Data trust and §19 mapping.** `unknown` is not rendered as healthy (`DataTrustIndicator.tsx:29-36`). `OutcomeView` uses different components for `empty` and `forbidden` (`StateView.tsx:42-48`). Omitted assessments are not rewritten to `clear`. `collection` is always `unknown` / `source_unavailable`, which matches “source not implemented” rather than a fake `clear`.
- **Shell keyboard, aside from P1-5.** Expanded accordion headers are buttons with `aria-expanded` and `hidden` on the collapsed list (`Sidebar.tsx:108-116`). The collapsed rail uses Radix popovers (Escape and focus). The palette is a combobox: arrows move the active option, Enter navigates, Radix Dialog traps focus and closes on Escape (`CommandPalette.tsx:40-54`). Language changes do not write the URL (`i18n.tsx:110-114`).
- **Drawer, aside from P1-6.** Initial focus, focus restore, and Escape-while-inside work as cited above. Equipment master remounts the drawer with `key={focus}`, so a new row re-runs the focus effect.
