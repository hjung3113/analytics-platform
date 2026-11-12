# apps/platform-e2e — automated platform contract checks (E2E)

Boots the assembled app (`apps/platform-web`, mock adapter) in a browser and checks the **platform contract** (#44), never menu-screen requirements. Menu screens are only windows onto the contract.

## What is checked

- `tests/contract-<area>.spec.ts` (shell, context-links, components, chart, board, features): a `describe` is a contract area, a `test` is one report line. Do not copy the list here; the specs and `contract-report/README.md` (run output, also in the CI Job summary) are the source. Shared helpers are in `tests/contract-helpers.ts`. A new area's `describe` title names its 06 section.
- Prove that a check really guards the contract by breaking the Kernel guard on purpose and seeing it fail (PR body "mutation check"). Do the same when you fix or add a check.
- **Known gap:** server-side menu-permission denial is checked by the mock-server unit test (`packages/adapters/mock-server/src/__tests__/menu-permission.test.ts`). The client route gate renders first, so the UI cannot show a server denial; the "direct URL denied" check observes the client gate. Space-entry denial (§9.1) has the same gap: E2E observes the `RouteOutlet` client gate.

## Rules

- Black box: do not import `@ap/*` packages (lint preset `tooling` blocks it). Drive only the screen and dev tools.
- Roles via `signInAs` (localStorage `platform:role`, set before load); response scenarios via the dev-tools popover (`tests/support.ts`).
- Selectors use roles and accessible names (Korean UI); update them when copy changes.
- Attach evidence screenshots with `evidence(page, testInfo, name)` at the moment the contract is visible (right after a transition).
- Default viewport is desktop 1440×900 (05 Decided). Only width-dependent contracts (ADR-0013 detail slot, ADR-0015 Context bar) use `setViewportSize` (1280, 1920, …) in their `test`.
- `layout="fill"` pages (cycle time) start with the head collapsed (#680). Before touching head controls (page filters, chip row) call `expandPageHead(page)` from `tests/support.ts`; clear the memory key `platform:page-head-collapsed:<menuId>` before load when it must not persist.
- Fixed-URL `page` must be inside the real range for that filter combination (#314: `page=2` on a table filtered to 1 row fails).
- A new page starts at `about:blank`, so `history.length` is not 1. Assert replace as "one Back leaves the app (`about:blank`)".
- Reproduce local-pass/CI-fail with CPU throttling (`Emulation.setCPUThrottlingRate` 8) and compare with main.
- Temporary captures: `bash tooling/scripts/capture-page.sh <name> <route> [--variant <value>] [--role <engineer|admin|viewer>] [--ready <selector>]`. Run the Playwright command it prints, then `bash tooling/scripts/capture-page.sh --clean <name>` moves the spec to trash. Default selector `main h1`; it captures the 1440×900 viewport only, into `.review/<name>-shots/`.

### Wheel and drag checks (#700, #705)

- A wheel goes to the nearest scroll container under the pointer. To observe outer scroll, first create a container with scroll room (inject height into `#platform-main`) and assert which element moved.
- A `has:` locator matches inside the outer element, so start it with a relative selector.
- Compare zoom on the stable horizontal-axis tick strip at the same pointer position, not on the whole plot (hover tooltips mix in).
- Before continuing after scrolling a table to the end, wait until row height is stable (two equal reads 300 ms apart).
- To drag after zoom: move the pointer to an empty spot over the figure first, wheel-zoom (a pointer outside the figure does not zoom), drag with press → several move steps → release, then compare the tick strip at the same spot.
- Drag-and-drop: move like a person (press → several steps → a few small moves over the target → release; dock board `dragTab`), never `locator.dragTo`. `dragTo` moves only once at the target; if a query finishes mid-drag and the element under the pointer changes, the browser ends the drag without a drop (reproduced on main CI at CPU throttle 6–8, 5–6 of 20 runs). Before dragging, also wait until the drop target's content is fully drawn (`panesLoaded`: indicator visible and zero `aria-busy` skeletons); otherwise a skeleton replaced by real content right before the drop makes the simulated mouse send no dragover to the new element and the drop vanishes (5 of 60 runs failed before the wait, 0 after).
- Workspace height mode (#686): wait for stored state (`platform:workspace:v1:…` `mode`/`rows`) with `expect.poll` on the stored value, never a fixed sleep (saving is debounced 300 ms). A narrow panel can still fix row px, so assert the stored `rows`, not the width. To test stacking in a board cell, seed the sheet as `2x1` (width is needed).
- Sequential Tab loops use a generous cap (300) plus a reach assertion. On failure, read the error-context snapshot for the focus position first (#356).

## Running and reporting

- Run only the related specs locally: `pnpm exec playwright test -g "<describe>"` in `apps/platform-e2e`. Run the whole `pnpm e2e` locally only to reproduce a CI failure (root `AGENTS.md` §Verification). Without a browser, run `pnpm --filter @ap/platform-e2e e2e:install` (Playwright default cache; run uses the same cache). If you set `PLAYWRIGHT_BROWSERS_PATH`, give the same value to install and run. Never reuse an old browser folder from another path: a folder lacking the revision the current Playwright wants fails every test at browser launch (#608).
- The dev server starts on port 4190 itself (`reuseExistingServer: false`). To run beside another checkout or session, change the port (`E2E_PORT=4290 pnpm e2e`; base-path config `E2E_BASE_PATH_PORT`, default 4191; integers 1–65535 only, config load throws otherwise). If the port is taken, find the PID with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, check ownership with `lsof -a -p <PID> -d cwd`, and never kill another checkout's server; pick another port. CI sets no env, so it uses 4190/4191.
- No retries (`retries: 0`): an intermittent violation is a violation. If you pass `--retries` locally, the reporter marks pass-after-retry as "flaky" and keeps every attempt's errors and evidence.
- A failed check's evidence is Playwright's failure screenshot (`screenshot: 'only-on-failure'`).
- Reports: `contract-report/README.md` (per-item pass/flaky/fail table) + `evidence/` (screenshots) + `results.json`; failure traces in `playwright-report/`. None goes into git.
- CI Job `Platform contracts (E2E)` puts the table in the Job summary and uploads the `platform-contract-report` artifact.
- CI sharding (#666):
  - A full run splits the suite into 4 shard Jobs (`Platform contracts (E2E shard i/4)`, `pnpm e2e --shard=i/4 --reporter=list,blob`). The merge Job `Platform contracts (E2E)` merges the blobs with `pnpm --filter @ap/platform-e2e e2e:merge` (`playwright.merge.config.ts`) into one report and issues the verdict from the shard results.
  - `fullyParallel: true` makes shards split by test, not file; with one worker the execution order is unchanged.
  - To reproduce one shard run `pnpm e2e --shard=2/4`; never put `--` before the argument (Playwright reads it as a file filter).
  - `e2e:base-path` runs once, in the last shard.
  - PRs and main pushes run only affected specs (`.github/scripts/select-e2e.mjs`): chosen specs go to one shard (`i/1`) by file path (`tests/<x>.spec.ts`), so `contract-report` is a partial report of those specs. With no affected spec, shard Jobs are skipped and the merge Job decides.
  - A full run (8 shards) happens on `workflow_dispatch` `full=true` (the required cold full gate before release), manual `full=false`, PR/push changing `menus/**`, `packages/**`, `apps/**`, tooling, workflows or unclassified paths, and when selection or base-SHA computation fails (fail-safe). Changing non-spec files under `tests/` (`contract-helpers.ts`, `support.ts`), config or `package.json` also runs full.
- Lint and typecheck are part of root `pnpm lint` / `pnpm typecheck`, not of `pnpm test`.

## Start-kit browser check (#1702)

- `playwright.kit.config.ts` drives `tests-kit/*.spec.ts` against an installed kit outside the repository. Like the other specs, it imports no `@ap/*`; the kit installs release tarballs only.
- Prepare with `pnpm sdk:pack --out <empty-directory>`, then `AP_SDK_KIT_DIR_FILE=<path-file> pnpm sdk:consumer-check <directory>`. On success the file contains the installed kit directory, which is retained for the browser run. Export that path as `AP_SDK_KIT_DIR`, then run `pnpm --filter @ap/platform-e2e exec playwright test --config playwright.kit.config.ts`. Remove the retained kit and tarball directory when finished.
- `E2E_KIT_PORT` defaults to 4192, separate from app 4190 and base-path 4191; Vite uses `strictPort` and never reuses a listener. Desktop only, no retries. Screenshots and traces go to the kit report uploaded as `platform-start-kit-browser-report`.
- CI runs the named `Start kit browser check` step once in the Playwright shard job. `select-e2e.mjs` selects it conservatively with every full selection, including kit, app-host, mock-server and SDK changes. The static job runs the workflow pin tests in `tests-kit/*.test.mjs`.
- This gate proves **mock 통과** only. It does not prove a real-server assembly.

## Real-server contract E2E (#593)

CI runs the default mock E2E config only; no CI job executes real specs or the real assembly browser flow. Covered contracts and the unavailable-on-real table: [`real-server-checklist.md`](../../docs/integration/real-server-checklist.md).

### Layout and guards

- Real specs live in `tests-real/*.real.spec.ts`; `playwright.real.config.ts` uses `src/real/http-assembly.tsx` through Vite `--mode real`. The default config stays mock-only and must not discover `tests-real`.
- Run from a caller-created throwaway database with `pnpm --filter @ap/platform-e2e run e2e:real`. The main config validates both database URLs before migration, core seed, and each rate-limit reset. It accepts only `platform_app` / `platform_migrate` roles on `localhost:5439`, both naming the same `platform_<name>` database, and refuses the `platform` template, other hosts/ports, URL query/fragment, URL overrides and mismatches. Use `verify-db.sh create <name>`; never use `SEED_MODE=personas` (the seed is fixed to `SEED_MODE=core`); never bypass the validation to point at a local or remote DB.
- The harness seeds core actors only (`mock-admin-1`, `mock-user-1`), logs them in through Vite `/auth/mock-login`, and saves separate `storageState`s. It adds no grants, except where no HTTP surface can create them:
  - `log-rules.admin.real.spec.ts` creates its own synthetic system Actor and that Actor's `validation.catalog.report` grant.
  - `log-datasets.admin.real.spec.ts` creates its worker system Actor and the Admin's `dataset.baseline.approve` grant.
- Before each test, `tests-real/support.ts` revalidates both URLs and deletes only `core.rate_limits` through the `platform_migrate` connection (`log-rules.admin.real.spec.ts` also on each screen re-entry within one test). Direct SQL is limited to that cleanup and to fixtures HTTP cannot create (`migrateSql`). Any browser response with status 429 fails the test.
- Do not treat a shell heading as bridge success. Register the expected feature GET before navigation, require its 2xx response, and assert the screen's loaded rows or explicit valid empty state.
- The usage table reads once per mount, so poll authenticated `GET /api/v1/platform/usage-summary?preset=all` directly when checking persisted visit deltas.
- The platform home Todo slot hides its whole section when every group is empty. Home checks assert the survey, notification and own-permission-request GETs succeeded and the business-system cards rendered.
- `E2E_PORT` selects the Vite port (default `4190`); `E2E_REAL_BACKEND_PORT` the backend port (default `3011`); avoid ports other sessions use. `e2e:real` runs the backend-down screen in a separate Vite-only config (no DB) after the healthy-backend specs, even when those fail, and fails if either config fails (#1796).
- Backend readiness uses `/health` (liveness). `/health/ready` also requires attachment storage, which this harness does not use.
- Focused database safety checks (`node --test apps/platform-e2e/tests-real/database-safety.test.ts`) run in `gate.sh static-extra`; they do not connect to a database.

### Spec contracts

- Audit target-type filter ([#1091](https://github.com/hjung3113/analytics-platform/issues/1091), ADR-0101): `console.admin.real.spec.ts` covers `filter=targetType:equals:equipment&filter=targetId:equals:<missing UUID>` → HTTP 200 `empty` + explicit empty state, `targetType:equals:voc` without `Invalid audit filter`, and a preserved well-formed unknown type. Exact seeded identities and the excluded-subject privacy cases belong to the platform-api integration tests.
- `notices.admin.real.spec.ts` (describe `공지 서버와 Home 배너 (#1106)`): creates, edits and deletes notices over real cookie + CSRF HTTP, then navigates normally and checks the Home DOM and the `POST /api/v1/menu-query` 200 envelope. No notice CRUD screen exists, so refresh-without-reload is proven by `apps/platform-web/src/notice-invalidation.test.tsx`. Workers do not run E2E; report this spec as not run.
- `log-rules.admin.real.spec.ts` (describe `검증 규칙 통합: 토큰 보고에서 커버리지까지`): issues a service token over HTTP, posts synthetic catalog reports with it, and checks the rule list, the declared target as reported, computed coverage, the not-computable state of a report without requirement ids, and the refresh by a new report.
  - Requirement ids use the normalized spec key spelling (`ALPHA/START`).
  - The token travels only in a plain Node `fetch` (a failed Playwright request logs its headers into the HTML report); recording is off for the file (credential guard); the Actor's tokens are revoked after the test.
  - Needs a throwaway database whose catalog has no other source; otherwise it fails with that message.
- `log-datasets.admin.real.spec.ts` (describe `테스트 데이터셋 통합: 합성 Dataset에서 비교까지`): runs the dataset chain over real cookie + CSRF HTTP: Dataset → Revision → Baseline draft → approve (the Admin gets `dataset.baseline.approve` by SQL; there is no Admin bypass) → Suite → `suiteRun` twice with one key (one `suite_run`) → a test-local reference worker (system Actor with a `validation.worker` service token; claim/heartbeat/result in plain Node `fetch`, result replay) → `logDataset.comparison` classes and the comparison screen DOM.
  - The Source stays unverified (no Source port): screens must show «원본 확인 불가» and never «원본 확인됨».
  - Needs a throwaway database holding no other queued validation request (the claim must return this run's request). Recording is off (credential guard); the Actor's tokens are revoked after the test.

### Procedure

1. Prepare the local env template and the throwaway DB container. Read an existing `ops/platform-api/.env` and leave it; copy `.env.example` only when absent. `up` creates the `platform-verify` container on port 5439 (memory cap default 2g, adjust with `VERIFY_DB_MEMORY`) and migrates the template DB. Record whether this call created the container. Use a container that was already running (possibly another session's) but never stop it.

   ```sh
   [ -f ops/platform-api/.env ] || cp ops/platform-api/.env.example ops/platform-api/.env
   export WAVE_STATE=/path/to/wave-scratch
   docker inspect platform-verify >/dev/null 2>&1 && CREATED_CONTAINER=0 || CREATED_CONTAINER=1
   bash ops/platform-api/conductor/scripts/verify-db.sh up
   ```

2. Create a named throwaway DB. The helper clones `platform_<name>`, writes `$WAVE_STATE/env.verify.<name>` and migrates that DB. Load the generated env, then set the core workspace ID and ports.

   ```sh
   bash ops/platform-api/conductor/scripts/verify-db.sh create 593-real
   set -a
   . "$WAVE_STATE/env.verify.593-real"
   set +a
   export WORKSPACE_ID=00000000-0000-0000-0000-000000000001
   export E2E_PORT=4190 E2E_REAL_BACKEND_PORT=3011
   ```

3. The harness accepts only the DB URL shape the helper generates; use the helper's generated passwords as they are. `DATABASE_URL` uses role `platform_app`, `DATABASE_URL_MIGRATE` uses `platform_migrate`, both on `localhost:5439` and the same `platform_<name>`. Port 5434 or any other port is refused.

   ```text
   DATABASE_URL=postgres://platform_app:platform_app@localhost:5439/platform_<name>
   DATABASE_URL_MIGRATE=postgres://platform_migrate:platform_migrate@localhost:5439/platform_<name>
   WORKSPACE_ID=00000000-0000-0000-0000-000000000001  # repo core workspace ID; any standard UUID is also accepted
   ```

4. Build and run against the real production build.

   ```sh
   pnpm --filter @ap/platform-web run build:real-prod
   pnpm --filter @ap/platform-e2e run e2e:real
   ```

5. Clean up as soon as the run ends, whatever the result: drop the named DB, and `down` the container only if this run created it (`CREATED_CONTAINER=1`).

   ```sh
   bash ops/platform-api/conductor/scripts/verify-db.sh drop 593-real
   [ "$CREATED_CONTAINER" = 1 ] && bash ops/platform-api/conductor/scripts/verify-db.sh down
   ```
