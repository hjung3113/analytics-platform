## Summary

- Done: throwaway D/E/F and merged screens, gated by `variant`; ordinary UI remains the default. Code left in place, uncommitted.
- D: analysis stages replace system navigation; four ordered stages are the home focal point.
  Merge removes source controls/tags; users learn the stage structure now and retain it later.
- E: one searchable menu board replaces the switcher/sidebar; home repeats that board.
  Merge changes the grouping default and removes the toggle; the menu-opening/search action stays familiar.
- F: home leads with the last authorized visit; Move/search replaces system selection, with a section sidebar on work screens.
  Merge removes system labels, keeps old-name aliases and the same home composition; users relearn names rather than placement.
- Contracts: spec table confirmed with additions: ADR-0070, kernel §9, shell layout and future ownership affect all. Merge migration: preserve URLs/menu IDs, saved views and favorites; declare grouping/source/aliases in app Registry metadata; seed unified resume from the latest valid legacy target. Not implemented as production migration.
- `apps/platform-web/src/menus.ts`: private stage/source metadata, query registration and merged display labels.
- `packages/sdk/shell/src/frame/prototype1189q.tsx`: private destination, board, search and stage-sidebar components.
- `packages/sdk/shell/src/frame/AppShell.tsx`: gated shell composition and internal-link flag carry.
- `packages/sdk/shell/src/frame/AppRail.tsx`: gated Home entry and reduced rail.
- `packages/sdk/shell/src/frame/AppSidebar.tsx`: flags and merged labels; original sidebar remains for F work sections and D auxiliary destinations.
- `packages/sdk/shell/src/routing/CommandPalette.tsx`: flags and legacy source-name aliases.
- `platform/home/src/pages/HomePrototype.tsx`: three private home structures.
- `platform/home/src/pages/OperationsHome.tsx`: gated composition reusing existing behavior and slots.
- `.review/selfcheck.sh`, `apps/platform-e2e/w1189q-selfcheck.mjs`: local Ego capture/interaction harness; report and evidence also written under `.review/`.
- Critique: balanced E columns, reduced duplicate F destinations, aligned D stage rows/source controls, shorter favorite action and no prototype explanatory footer. Single-context critique, not independent review.
- Captures: 26 PNGs, 1440×900 CSS / 2880×1800 pixels / DPR 2, admin/ko; all seven contexts; E collapsed is N/A. Lock-protected port 4198 stopped; Ego TaskSpace 2 closed.
- Checks: three package typechecks 0; focused ESLint for all eight UI/app files 0; one-off harness ESLint 0; JS/bash syntax 0; final capture batch 0; detector 0 (`[]`).
- Limits: zero-space/restricted-role, held-navigation and saved-view persistence inspected in source, not exercised; no tests, E2E, root checks, build or production migration. Final published captures belong to the separate capture worker.
- Process deviation: one initial prohibited `git status --short` read; no Git writes or later Git commands. Root ESLint lookup failed (1); package-scoped checks passed.
- Upstream: supplied Playwright harness was adapted to mandatory Ego browser control; use specific board/result selectors and wait for Popover animation/focus completion.

## Details

### Design before implementation

- User task: resume analysis or find an authorized menu, with unchanged Context and addresses, across today's three systems and a future combined analysis destination.
- IA: D = Analysis → ordered stages → menus; source is a filter. E = Menu → complete board → system or stage grouping. F = My work → resume / favorites / search; destinations remain in the move panel.
- Screen inventory: home and navigation, today and merged, with empty and collapsed states.
- Wireframe D: utility rail | destination + source + stage sidebar | four-stage horizontal flow, recent/favorites, Todo, notices.
- Wireframe E: utility rail | top Menu control | search + grouping; favorites/recents at left, menu columns at right; Todo and notices below.
- Wireframe F: utility rail | current-section sidebar on work screens | Move bar; home = resume lead, favorites and recents, Todo, notices.
- Components: PlatformPage, PlatformLink, navRowVariants, Popover, SearchInput, Button, Tooltip; existing shell tools and command palette remain.
- Data: live Registry, canOpen, accessibleSpaces, spaceEntry, favorites, recent URLs, homeTodo and existing notice query; no invented counts or records. Todo figures in captures come from the existing injected slot.
- Decisions: spec bounds the IA and prototype gate; DESIGN.md remains authoritative. No PRODUCT.md/docs or public API additions. Draft grouping is private app-owned metadata, not a public Registry extension.
- Reversible calls: preserve real menu inventory rather than invent separate Process/StGroup/equipment or cycle equipment/organization menu IDs. Those are existing drill/preset concepts. `navHidden` entries, including execution detail, stay hidden. Preserve the long E board with one vertical scroll rather than remove destinations to fit one viewport.

### Contract confirmation and corrections

These are changes a chosen production direction would need. No ADR, product contract or public SDK API was changed in this throwaway.

| Variant | Confirmed spec entries | Corrections/additions |
| --- | --- | --- |
| D | ADR-0042 system switcher/rail; ADR-0102 home launcher; GLOSSARY work-system ownership; R7.1; multi-workspace §3.1/3.2; stage/source declaration | Also ADR-0070 home/global navigation and kernel §9; layout shell/sidebar assumptions. The source filter is presentation, not a new authorization Scope. Source gaps remain visible and disabled. |
| E | ADR-0042; ADR-0028 section navigation; ADR-0102; multi-workspace §3.1/3.2; kernel §9; app-declared alternate grouping | Also ADR-0070 and layout shell/sidebar assumptions. Future system ownership integration needs the same GLOSSARY/R7.1 decision as D. Shared board consumes declarations; the SDK must not encode MARS/CLAS/BRAVO. |
| F | ADR-0042; ADR-0102; ADR-0070; multi-workspace §3.1/3.2; palette/search contract | Also kernel §9 and layout topbar/global-sidebar assumptions. The existing command palette remains available; Move is an additional primary path in this prototype. Actual ownership integration still needs GLOSSARY/R7.1, even though this home needs no stage grouping API immediately. |

The future merge concerns MARS, CLAS and BRAVO only. Standard log development, Workflow, Tools and Operations remain independent destinations in every variant. Prototype space IDs and ownership are unchanged; merged mode clones display labels only. Existing analysis work-page composition and section membership remain real source-owned consumers, rather than simulating a new backend.

| State/contract | Prototype behavior | Production migration when systems merge |
| --- | --- | --- |
| URLs | Actual paths and menu IDs retained; `variant`/`merged` registered as private page keys and carried on navigation. Scope, period and existing URL keys retained. | Keep legacy paths valid. If canonical paths change, add explicit aliases/redirect mapping that preserves allowed global/page keys. No destructive rewrite based on source name. |
| Saved views | Storage/schema untouched. | Preserve menu IDs, carry sets and page filters; if menus consolidate, version an explicit ID/filter mapping before migrating stored views. This prototype implements no such mapping. |
| Favorites | Existing IDs, permission filtering and toggle/removal behavior retained. | No rewrite if IDs remain stable. If equivalent menu IDs consolidate, map and deduplicate deliberately; preserve order and inaccessible-state semantics. |
| Registry | App attaches private structural `prototype1189` metadata: stage/label, source/alias/order and optional merged label. No public type or barrel export. | Approve reusable app-declared grouping/source/aliases separately from authorization and destination identity; determine ownership under the revised GLOSSARY/R7.1 contract. D needs stages; E alternate grouping; F aliases and an eventual analysis destination. |
| Resume | Existing `spaceEntry` URLs for independent destinations; combined Analysis selects the latest authorized analysis recent URL, falling back to the first accessible entry. F resumes the actual last authorized recent URL, including stored conditions. | Introduce a unified analysis resume key seeded from the latest valid authorized legacy entry; retain legacy per-space sessions during compatibility. Validate target/filter compatibility; do not clear all resume state. |
| Context | Existing linkTo/spaceEntry/navigate pipeline retained. | Source must not silently become Scope. Preserve existing validated Scope/time semantics while changing display/navigation ownership. |

### Behavior preservation and boundaries

- All proposed listings use Registry entries and `canOpen`; favorites/recents also verify that the referenced menu still exists. Normal navigation lists keep `navHidden` hidden. A previously visited hidden page can remain a legitimate resume target.
- Existing home favorite removal focus, permission-request zero-space message, notice querying/dismissal/errors and injected `homeTodo.Todo` are reused. F's large resume link uses the actual recorded URL; favorites retain existing default-view behavior and recents retain visit URLs.
- Shared modal overlay sessions claim/release focus ownership; navigation is deferred until close autofocus releases the trap. Escape returns to the trigger. Modified link clicks retain native behavior through real query-preserving hrefs.
- No-param helpers return original hrefs; original shell/home render branches remain selected. Current baseline was captured in the same harness. No claim of a pre-change automated pixel comparison is made.
- No CSS file, dependency, token family, package manifest, public index/barrel, SDK changelog, generator template, planning file, committed test or product document was changed.

### Critique and screenshot review

⚠️ DEGRADED: single-context critique; worker rules prohibit dispatch. No independent review is claimed.
- D: stage order is the focal point, with equal column starts, shared row rhythm, separators rather than nested boxes and muted origin tags. Changed source buttons to shared toolbar sizing and app-declared MARS → CLAS → BRAVO order; labels retain readable two-row wrapping within the existing sidebar width. Reduced lower-section spacing. Merged home keeps stage placement and removes origin labels. Source-filter CLAS exposes 16 inactive rows rather than dropping unavailable capabilities.
- E: first pass stretched grid rows to MARS's inventory and pushed smaller groups below large blank gaps. Replaced that with four independently stacked balanced columns, systems before global utilities, and suppressed redundant tags in system grouping. The merged board leads with the four stages and includes the fifth basis-information group outside the sequence. All menus remain reachable by scrolling or search; Todo/notices follow the full inventory.
- F: one resume target dominates the home; favorites/recents and existing Todo/notices follow without directory tiles. Removed duplicate analysis/system destination blocks from Move, kept direct systems today and one Analysis after merge, and compacted global links to three columns. Merged mode drops system tags and changes CLAS's display label to 동작시간 분석 while retaining CLAS as a search alias. The home structure stays fixed.
- All: prototype explanatory sidebar footer hidden only under the gate; favorite action shortened visually to 제거 while preserving its full accessible name. Shared focus rings and token surfaces retained. Reviewed home/nav screenshots for D/E/F and merged variants, plus empty/collapsed samples; no horizontal overflow observed in captured layouts.
- Impeccable detector ran once before the final small permission/recent and capture-selector adjustments: exit 0, output `[]` in `.review/impeccable-detect.json`. Final package checks and visual review followed; detector output is not an independent accessibility audit.

### Capture evidence and interaction results

Command (final exit 0):

```sh
CONDUCTOR_MAIN=/Users/hyojung/orca/projects/analytics-platform WITH_LOCK_OWNER=home-1189q bash ~/.agents/skills/issue-wave-conductor/scripts/lanes/with-lock.sh browser.lock "1189q self-check" -- bash .review/selfcheck.sh
```

- `.review/selfcheck/{home-empty,home,nav}-{current,D,E,F,D-merged,E-merged,F-merged}.png`: 21 files.
- `.review/selfcheck/collapsed-{current,D,F,D-merged,F-merged}.png`: 5 files. E intentionally has no sidebar, so two collapsed states are N/A.
- All 26 PNG IHDR dimensions verified as 2880×1800. Observed browser geometry for every context: 1440×900, DPR 2.
- Dedicated local origin `127.0.0.1:4198`, fresh admin, Korean, sidebar expanded. Home sequence: first visit → MARS productivity overview → star → CLAS operation time → home. Nav opened from MARS. Own server process group is trapped/stopped inside the lock, including failed harness attempts. Final listener check found no listener (lsof exit 1, no output).
- Ego TaskSpace 2 and Page p1 reused throughout; original dedicated-origin storage restored on successful completion; `finish({keep: []})` completed. No browser tabs retained.
- `.review/selfcheck/observations.json` contains all seven contexts: focus enters modal, 12 Tab steps remain inside, Escape restores trigger, selection closes menu and focuses destination H1, Scope MEM and from/to retained, variant/merged retained where applicable, favorite removal focuses the empty message, and notice count changes 1 → 0.
- E/F CLAS alias searches found operation-time results today and merged; selection retained original `/clas/operation-time` route. E system/stage toggle and empty search message checked. D CLAS filter produced 16 disabled source-gap rows.
- Earlier harness repairs: keyboard-triggered collapse avoids an unchanged baseline tooltip intercept; specific board/result scopes avoid duplicate recent/result CLAS links; capture waits for dialog animations and Escape focus completion. One intermediate capture round used CSS-pixel screenshots; every final file was overwritten with DPR-2 capture.
- No published Artifact created by this worker: task assigns final captures/publication to a different worker. These are self-check inputs for that next authorized step.

### Checks actually run

| Command | Exit/result |
| --- | --- |
| `pnpm --filter @ap/shell typecheck` | 0 |
| `pnpm --filter @ap/menu-home typecheck` | 0 |
| `pnpm --filter @ap/platform-web typecheck` | 0 |
| `pnpm --config.verify-deps-before-run=false --filter @ap/shell exec eslint src/frame/prototype1189q.tsx src/frame/AppShell.tsx src/frame/AppRail.tsx src/frame/AppSidebar.tsx src/routing/CommandPalette.tsx` | 0 |
| `pnpm --config.verify-deps-before-run=false --filter @ap/menu-home exec eslint src/pages/HomePrototype.tsx src/pages/OperationsHome.tsx` | 0 |
| `pnpm --config.verify-deps-before-run=false --filter @ap/platform-web exec eslint src/menus.ts` | 0 |
| `pnpm --config.verify-deps-before-run=false --filter @ap/platform-e2e exec eslint w1189q-selfcheck.mjs` | 0 |
| `node --check apps/platform-e2e/w1189q-selfcheck.mjs` | 0 |
| `bash -n .review/selfcheck.sh` | 0 |
| Final locked self-check harness | 0 |
| Impeccable detector (once) | 0; `[]` |

The initial `pnpm exec eslint ...` root lookup returned 1 because root has no eslint binary; package-scoped invocations above passed. No dependency install was attempted. No test was added or changed; no unit suite, E2E, root lint/typecheck/test/build or production build ran, as instructed.

### Verification limits / host-only work

- Zero accessible spaces, restricted roles, permission revocation during an open overlay, held navigation and persisted saved-view behavior were source-inspected, not browser-exercised. Existing guards/storage APIs remain; these are not claims of runtime verification.
- Production integration, Registry/public API/ADR changes and data migrations are not implemented because this task is explicitly a discarded visual prototype. Reopen only after owner selection through the conductor's existing #1189 work; the migration decisions above identify the required follow-on work without starting it here.
- Host/capture worker: take final owner-facing captures and publish an Artifact after reviewing these self-checks; no localhost link is an owner approval deliverable. No full implementation verification is claimed or required for this throwaway.

### Process notes

- One initial `git status --short` read ran, contrary to the no-Git addendum. It produced no output. No Git writes occurred; no further Git commands ran.
- No agents dispatched, no conductor operations, no outward publication or external-system mutation. The mandatory Ego browser skill replaced the supplied Playwright browser-control mechanism; only the dedicated local app was navigated.

<!-- W-1189q-DONE -->
