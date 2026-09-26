# Step 5 review — 6f19592..5fe3778

Reviewed 2026-09-27. HEAD was `5fe37787807d69d0dcaad7344b00250d69b017ca`, with a clean working tree before review. Scope: PRs #25–#27, the three Step 5 designs (including 5c §9 override), repository/package/menu/app instructions, and platform-packages §3 rules 1–6 and §5. Source was not edited; this report is the only authored file.

**Result: no P0/P1/P2 findings; three documentation nits.** No observed behavior, dependency, package-wiring, or test-split regression.

## 1. Behavior — no findings

- All 16 manifest entries match the baseline in order and content after normalizing only lazy import paths. `GROUPS` is byte-identical. Sidebar grouping/order, routes, permissions, page keys, and planned entries therefore remain unchanged.
- `menus/analytics/src/pages/CycleTimeDrilldown.tsx:118` delegates the old checks to `cycleData.ts:197`. The unavailable check still precedes equipment/context rejection; null versions and error/forbidden/timeout/too_large scenarios refuse export. Empty still produces an empty row list, allowing the unchanged header-only CSV and success toast. Partial/slow/unknown_status still follow the normal synchronous calculation path. The old `populationForVersion` simply guarded null before calling `population`, and null is already rejected in the new helper. CSV filtering, sorting, downloading, and toast text did not change.
- An in-memory differential probe of the extracted helper versus the old branch logic passed 54 cases: nine scenarios × null/v3/v4 × valid ICH period/missing context. It compares current unchanged population output, not a separately booted baseline app. The first probe tried the menu facade's intentionally unexported `setScenario`; it was corrected to use the mock-server public entry and rerun successfully.
- `menus/metrics/src/pages/data.ts:518` removes the default equipment argument. Its sole caller at line 597 already supplies the response equipment list. This is an intentional internal signature change in 5b, with no affected runtime caller.
- Production bundle inspection using Vite `build({ write: false })` found eight dynamic page entries: OperationsHome, EquipmentMaster, EquipmentDetail, ProductivityOverview, CycleTimeDrilldown, ExecutionDetail, MetricCatalog, MetricDetail. The startup chunk contains seven menu manifest modules but **no menu page or menu data modules**. Mock world/server/adapter are eager because the app injects the adapter; mock jobs remains deferred.
- Page isolation is not absolute: EquipmentMaster statically imports EquipmentDetail, and MetricDetail statically imports MetricCatalog. These edges already existed at `6f19592`; they were not introduced by package manifests. The extraction preserves route lazy loading rather than newly promising one independently loaded page per navigation.

## 2. Dependency rules — no findings

- Under `menus/`, mock-server imports/re-exports occur only in the four `src/api.ts` files, including test dependencies. Analytics jobs tests and metrics pointer tests consume their local facade.
- No menu imports another menu or the app. No cross-package deep imports were found in application/package/menu source or tests.
- Platform packages do not import menus or mock-server; mock-server imports only contracts as a workspace dependency. Contracts did not gain React/browser dependencies in this diff.
- The app's `published-metrics.test.ts:3` imports mock-server directly, as expressly retained by 5c §9. This is a legitimate upper-layer integration test, not a rule-6 violation. See documentation nit D2 for misleading summaries of this exception.

## 3. Package metadata, lockfile, CSS — no findings

- TypeScript AST inspection of imports and re-exports across all seven menu source trees found no undeclared dependencies or unused entries in their runtime `dependencies`. React/react-dom peer and development declarations follow the repository package convention. The four UI consumers' `@types/node` requirement is documented debt, not an accidental new runtime dependency. No unnecessary echarts dependency was added.
- Parsed every workspace package's dependency/devDependency/optionalDependency declarations against `pnpm-lock.yaml`: matching key sets/specifiers and valid workspace link targets/package names. No install was necessary; a fresh frozen installation was not run.
- All four packages containing pages/classes export `./styles.css`, each registers `@source "./"`, and app `src/style.css:5–8` imports all four. The three manifest-only packages contain no Tailwind class markup and need no stylesheet. Current CSS wiring is complete; D3 concerns the documentation template only.
- Build succeeded. A baseline CSS selector-set comparison and visual browser check were not run; no claim of visual parity beyond the source and current build evidence is made.

## 4. Test split and vacuity — no findings

- Baseline `apps/platform-web/src/mock/jobs.test.ts` and current `menus/analytics/src/jobs-population.test.ts` are byte-identical after the import section, including all four test bodies. Explicit positive job counts, version differences, and the dereferenced job fixture prevent an all-empty population from satisfying the suite.
- Every assertion from the baseline three `published-metrics` tests survives: catalog pointers in `menus/metrics/src/published-pointers.test.ts`, classification in app `src/published-metrics.test.ts`, and missing-version/default handling in `menus/analytics/src/resolve-metric.test.ts`. The §9 override was followed without assertion weakening.
- The three mock-only test files moved byte-identically. The new localStorage Map stub implements the operations exercised by the server; its `key()` always returning null is not used by these tests or the server. There is no assertion loss or newly vacuous test caused by this stub. Persistence across browser reloads remains untested, as before.
- Node-based menu tests exercise pure calculations/definitions, not browser rendering or storage. The imported server catches unavailable localStorage and defaults to engineer; these test assertions do not rely on persisted roles. This environment change does not make the existing assertions vacuous.
- Pointer equality alone would allow both arrays to be empty, but that assertion is unchanged, and the retained app classification test independently requires published cycle_time/occupancy_physical versions. This is not a Step 5 weakening.

## 5. Documentation findings

### D1 — nit: entry-point status still says 5b/5c remain

- **Location:** `docs/INDEX.md:83`.
- **Failure scenario:** a maintainer following the mandated INDEX entry point is told that 5b–5c are pending even though this commit contains both and `docs/integration/platform-packages.md:5` says Step 5 is complete. This can lead to redundant migration planning or an inaccurate handoff.
- **Suggested fix:** update the INDEX status to 5a–5c complete and only Step 6 pending, or link to the maintained status without duplicating it.
- **Regression test:** no runtime regression test; a documentation consistency check/manual review can demonstrate the contradiction.

### D2 — nit: importer and ownership summaries omit the approved integration test

- **Locations:** `apps/platform-web/AGENTS.md:21`; `packages/mock-server/AGENTS.md:18` (related stale ownership wording at lines 16 and 19).
- **Failure scenario:** these instructions claim mock usage is limited to menu facades, adapter injection and DevTools, so a reviewer following them literally flags the valid app `published-metrics.test.ts:3` import or tries moving it into an inappropriate layer. Both documents elsewhere describe that same retained test, and 5c §9 explicitly authorizes it. The mock-server instructions also still describe page-specific data/api work as app-owned after their move to menus.
- **Suggested fix:** distinguish runtime consumers from permitted app integration tests, explicitly name the retained test, and change the stale app-owned data/api wording to menu-owned paths.
- **Regression test:** no runtime regression test; a source-import/documentation inventory demonstrates the missing exception. Any future import lint must allow this app test while continuing to restrict menu tests to api.ts.

### D3 — nit: menu template omits the required CSS public entry

- **Location:** `docs/integration/platform-packages.md:113–119`.
- **Failure scenario:** a developer implementing the future generator literally follows `exports: "." only` and the template's omission of `styles.css`, then adds a page with Tailwind classes. They cannot wire the documented package stylesheet into the app without diverging from this template; omitting the source registration risks missing generated styles. The four implemented menu packages correctly expose the additional CSS entry, so this is documentation drift, not a current CSS defect.
- **Suggested fix:** document optional `./styles.css` export plus `@source "./"` and the app import for packages that contain class-bearing UI; keep manifest-only packages exempt. Replace the stale `MenuManifest[]` template annotation with the implemented `MenuEntry[]` while updating the example.
- **Regression test:** a future generator fixture/build test can prove that a class unique to a generated menu reaches output CSS. No current regression test fails because existing packages already implement the required wiring.

## Verification and limits

- `pnpm typecheck && pnpm test && pnpm build`: passed; initial typecheck/test results came from shared Turbo cache, build ran fresh.
- `pnpm exec turbo run typecheck test --force --output-logs=errors-only`: passed, **20 tasks, zero cached**; 14 typecheck tasks plus six suites comprising **67 tests** (kernel 13, components 3, mock-server 30, analytics 5, metrics 1, app 15). An initial unsupported `--output-logs=errors` invocation was rejected before running tasks, then corrected.
- Vite in-memory bundle inspection, 54-case export branch comparison, manifest/order comparison, import AST inventory, and lockfile declaration/link checks passed.
- Browser interaction/downloads, a fresh dependency installation, and baseline CSS selector diff were not run. Existing warning about the large main chunk is not evidence of a new eager-menu regression; the module inventory explicitly excludes menu pages/data from that chunk.
- No source changes, commits, pushes, or external review comments were made. No unresolved code blocker was found.
