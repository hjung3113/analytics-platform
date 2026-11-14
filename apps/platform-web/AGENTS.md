# apps/platform-web — assembly point

The app assembles the platform packages (dev and tests inject the mock adapter). Menu screens live in [`menus/*/*`](../../menus/AGENTS.md) and [`platform/*`](../../platform/AGENTS.md) packages; the app only assembles (root `AGENTS.md`).

## Rules

- Write menu screens by [README "페이지 작성 가이드"](README.md#페이지-작성-가이드-consumer-규칙), the source. Summary: top-level `PlatformPage`; menu data via `useMenuQuery(endpoint, params)` + `QueryView` (only the operations console's Kernel store queries use `usePlatformQuery`, ADR-0019); navigation via `linkTo()`; page state only through registered `pageKeys`.
- Pages never modify `packages/*`. When a common part is missing, report the need and raise it as platform work.
- Declare a new menu in the `manifests` of its group package (`menus/<space>/<group>/src/index.ts` or `platform/<feature>/src/index.ts`) and check 06 §5 (Menu Extension Contract) and §29 (Platform Done).
- Screens must not import `@ap/mock-server` directly ([menus/AGENTS.md](../../menus/AGENTS.md)); `check:prod-graph` keeps it out of production builds.
- Do not import design-system CSS (`@ap/ui` `styles/*`) individually: `src/style.css` `@import`s only `@ap/ui/styles.css` ([packages/sdk/ui/AGENTS.md](../../packages/sdk/ui/AGENTS.md)). Menu styles, the viewer's included (`@ap/menu-topview/styles.css`, which brings the `--eqv-*` theme), sit in the generator region.

## Assembly (`src/main.tsx`, `@ap/app-host`)

- Tree: `I18nProvider` → `AppRoot` (`PlatformProvider adapter registry slots` → `AppShell` + `RouteOutlet`). Assemble only.
- `main.tsx` never imports mock or `src/dev/**` ([ADR-0009](../../docs/adr/0009-production-assembly-injection.md)). Take the adapter and rail tools from `createAssembly({ registry })` of `#platform-assembly` (contract type `src/platform-assembly.d.ts`). `createAssembly` may return a `Promise` and may return `{ redirect }` or `{ screen }` to choose a redirect or notice screen instead of rendering; `startAppHost` (`@ap/app-host`) awaits it before mounting; `main.tsx` supplies `createAssembly`, the joins and `children`.
- Put the assembly's `featureApi` (real-server assembly only; mock otherwise) into `@ap/feature-bridge/feature-api` (ADR-0071).
- `vite.config.ts` picks the assembly by mode:
  - dev server, `--mode mock`, vitest → `src/dev/mock-assembly.tsx`.
  - `--mode real` (`pnpm --filter @ap/platform-web dev:real`) → `src/real/http-assembly.tsx`, the real-server assembly. It waits for the `@ap/http-adapter` bootstrap and returns one of: adapter, login redirect, connection-failure screen, or request-limit (`throttled`, 429) screen ([transport §3](../../docs/integration/http-adapter-contract.md#3-부트스트랩과-동기-메서드)). The dev server proxies `/api/features/` (prefix stripped to the feature path, ADR-0071), `/api`, `/auth` in that order to env `AP_BACKEND_ORIGIN` (default `http://127.0.0.1:3011`) via `scripts/real-dev-proxy.ts`. No mock, no DevTools.
  - otherwise (production) → env `AP_PLATFORM_ASSEMBLY`; the build fails without it.
- `@ap/http-adapter` is imported only by `src/real/**` and its tests (boundary lint).

### Slots

- `src/slots.ts` `appSlots(notifications, vocCompose, homeTodo, scopeControl, navCounts, spaceNavSection, analysisActions, accessRequest)` builds the app's slots: `features`, `plannedSpaces` and the injected slot objects. The Host (`startAppHost`) supplies `contextBar`, `topBarTools` and the header `⋯` `boardEntry` under them.
- `main.tsx` injects:
  - `analysisActions` from `@ap/menu-improvement-items/analysis-actions` (`improvementAnalysisActions`).
  - `notificationsSlot`, `homeTodoSlot`, `scopeControlSlot`, `navCountsSlot`, `savedViewsSlot` from `@ap/feature-bridge/notifications-slot|home-todo-slot|scope-control|nav-counts|saved-views`.
  - `vocCompose` from `/voc-compose-slot` as `vocComposeSlot(managedSystemFor)`.
  - `accessRequestSlot` from `/access-request-slot` (blocked-place request entry, ADR-0154 decision 6). `useAppSlots` passes it only when the assembly has a `featureApi`; mock gets none, so every blocked place renders as without it.
- The `features` slot comes from `featureSlot()` in `src/feature-systems.ts` (ADR-0045, ADR-0110 decision 5). The space → Managed System link lives on the server and is received by the `src/space-systems.ts` store:
  - Source: `Assembly.spaceSystems` (real: feature API `GET /managed-systems/space-links`; mock: same-shape data from `src/dev/mock-space-systems.ts`; absent means no links). Read once per session.
  - `entriesFor` and `managedSystemFor` read the store synchronously and return `null` until ready, so the Kernel slot contract and `/bootstrap` are unchanged.
  - Only `declared` links make entries (withdrawn or unlinked spaces get no block). `managedSystemFor(null)` (spaceless screens: home, 소통, 내 활동) is the «플랫폼» system.
  - The store is observable: `useAppSlots` (`src/slots.ts`, called by `@ap/app-host` in the root's render) subscribes and rebuilds the slots on each completion, failure and refresh (the `vocCompose` slot object and an open form stay). `src/space-systems-session.tsx` clears old links at once when the session (adapter, revision, user) changes, reads the new session, and drops late results of a previous session or a superseded refresh.
  - Rail `VOC 등록` blocks submit until `useComposeDefaultStatus()` is `ready` (the form still opens); after a failure it re-reads on the next open.
  - Every entry is a shell menu with no all-link. The block shows only to `features:access` holders.

## Files

- `src/menus.ts` — declares IA spaces (`SPACES`, `satisfies readonly SpaceDef[]` to keep id literals), groups (`GROUPS`, each row has `space`; `hideLabelWhenSingle` is an optional sidebar declaration), and the app's menu permissions (`PERMISSIONS`) via `groupId`, `spaceId`, `menuPermission`; links every `@ap/menu-*` package's `manifests` under `menus/*/*` (`MENUS`); calls `createRegistry({ …, permissions: PERMISSIONS, reservedRoots: APP_RESERVED_ROOTS })` (ADR-0072).
  - `reservedRoots` are the paths the app serves outside the Registry: `home`, `survey`, `voc`, `notifications`, `notices`, `permission-requests`, `my-tasks`, `faq`, `tokens`. They stop a space id from capturing them. The Kernel knows only `board`, `api`, `auth` (06 §6.4).
  - Package links (import and spread) are `gen:menu` marker regions written by `pnpm gen:menu`. Write `SPACES` and `GROUPS` by hand. Each menu package owns its lazy screen imports.
  - The private `@ap/menu-home/launcher` entry is allowed only here, outside generator markers; test files render the configured home through `registry`.
- `src/dev/mock-assembly.tsx` — mock assembly. Register menu mock endpoints in the single `export const MOCK_ENDPOINTS` (`createMockAdapter` and the server conformance test read the same list) by spreading each menu's `<g>Mock` array from `@ap/menu-<g>/mock`. The `/mock` imports and spreads sit in the `// <gen:menu-mock-imports>` / `// <gen:menu-mock-spreads>` marker regions written by `pnpm gen:menu` (analytics mock included); never register by hand there, and wire outside the regions by hand.
  - Mock actions (ADR-0054): `MOCK_ACTIONS` and `MOCK_WRITE_SAMPLES` have their own marker regions (`mock-action-imports`, `mock-action-spreads`, `mock-sample-entries`); `pnpm gen:menu` wires a menu's `<g>ActionsMock` and `<g>WriteSamples` there. All write-capable menus export their full action-id samples from their mock and are registered in these regions (#2010).
  - The `platform:mock-menu-query` performance mark counts E2E requests: it carries only the endpoint name, never Context.
  - It hands `@eqv/core`'s Sample Window import check and Inventory build (re-exported by `@ap/menu-topview/mock-data`) to the 설비 온보딩 mock with `setSampleWindowImport`, because menu mock code may not import `@eqv/core`. Proof: `src/dev/__tests__/eqv-onboarding-import.test.ts`.
- `src/dev/DevTools.tsx` — role switch and response-scenario simulator (`topBarTools` slot, below the rail). Not production code.
- The viewer (Top View, Focus) is the menu package `@ap/menu-topview` (`menus/tools/topview`), an ordinary `GROUPS` row `topview` plus `manifests` (ADR-0132; it replaced the host-module mount in `src/modules.ts`, #1659). `eqv:view` is declared in `PERMISSIONS`; `apps/platform-e2e/tests/eqv.spec.ts` keeps a copy of the paths.
- The mock for the three EV reads (`eqv.equipment-options`, `eqv.topview-context`, `eqv.topview-events`) is `topviewMock` of `@ap/menu-topview/mock` (`mart: false`), registered in the `MOCK_ENDPOINTS` marker like every menu mock. The assembly hands it the synthetic fixture of `@ap/menu-topview/mock-data` with `setTopviewMockSource`, because menu mock code may not import `@eqv/core`.
  - The EV declarations themselves are `mergeTimeDomain: false` (#1661), so the mock uses them as is; there is no mock-only copy.
  - `@ap/menu-topview/mock-data` is imported only by `src/dev/**` and `src/__tests__/query/server-conformance.test.ts` (lint `app` preset); `check:prod-graph` (`scripts/prod-graph.ts` `FORBIDDEN`) guards the production graph.
- `src/real/endpoint-invalidation.ts` (the mounting bridge is `EndpointInvalidationBridge` in `@ap/app-host`) — refresh the Home banner after a notice write ([ADR-0098](../../docs/adr/0098-adapter-preferences-people-notices-ports.md) §4).
  - The real assembly wraps `saveNotice`/`deleteNotice` once; after `ok`, `conflict`, `unknown` (or a throw) it emits the app-declared `home.notices` through `Assembly.invalidation`.
  - `startAppHost` mounts one `EndpointInvalidationBridge` under `PlatformProvider`; it calls `refreshEpochs.bump` for that query only (not the full `adapter.subscribe` invalidation; the Kernel knows no menu names).
  - Create the decorated adapter once per bootstrap, never per render. Proof: `src/__tests__/slots/notice-invalidation.test.tsx`.
- `src/query-history-store.ts` — current-browser local implementation of the SDK history port (06 §11), injected by `main.tsx`. It owns tuple keys, schema validation, Web Locks serialization and the 20-entry merge/retention. A storage exception is rejected with a fixed non-sensitive error; content never goes to instrumentation.
- The browser-local mock of the SDK saved-view port (`createLocalSavedViewStore`, 06 §21) lives in `@ap/mock-server` (`packages/adapters/mock-server/src/saved-view/`); `src/dev/mock-assembly.tsx` injects it as `PlatformProvider savedViews`. It simulates server ACL only (no server storage, audit or `PlatformAdapter` extension).
  - Current user comes from the `platform:role` session role; user ID equals the mock session `user.id` (`engineer|admin|viewer`). Menu permission is judged by a lookup `main.tsx` injects from the Registry (unregistered menu denied).
  - An edit to an official registered view is kept as a pending-approval change set separate from the approved copy. Per-object capability, approval/group transitions, conflict and the people directory are computed only here.
  - Keys are user·menu JSON tuples (`platform:saved-views:v1:`, `…-default:v1:`, `…-groups:v1:`). Serialize mutations with one Web Lock; without locks, fail closed. The seed (fictional people; out-of-permission, stale and pending views) is the package's default seed, replaceable whole through the store's `seed` option.

## Adding a space

A new business system (space) needs these app edits beyond its menu packages (`menus/AGENTS.md`: `GROUPS`, `PERMISSIONS`, CODEOWNERS, `pnpm install`). Each step names the test that fails without it.

1. `src/menus.ts`: a `SPACES` row and its `GROUPS` rows (hand-written, see Files).
2. `src/menus.ts` `HOME_LAUNCHER_GROUPS`: put the space in one home category ([ADR-0102](../../docs/adr/0102-home-launcher-app-groups.md)). `src/__tests__/slots/home-launcher.test.tsx` «classifies every declared space exactly once»; the rendered cards follow the declaration, so nothing else changes there.
3. A space with `feedbackTracking: true` (a Managed System of the feature server):
   - run `pnpm gen:platform-systems` and commit `platform-systems.json` (`src/__tests__/space-systems/platform-systems.test.ts` reports it stale);
   - add its row to `src/dev/mock-space-systems.ts` with a new synthetic v4 uuid (`src/__tests__/space-systems/feature-systems.test.ts` names the missing space).
4. `src/__tests__/assembly/workspace-assembly.test.tsx` «registers … the decided group order» pins the whole `GROUPS` and `SPACES` order on purpose (the owner decides the composition): update both lists in the same change.


- Menu screens and their screen-only synthetic data (`data.ts`) live in `menus/<space>/<group>/src/pages/` (platform features: `platform/<feature>/src/pages/`); computation of migrated screens is in `src/mock/`.
- The server stand-in is `packages/adapters/mock-server`. The app keeps `src/dev/mock-assembly.tsx`, `src/dev/DevTools.tsx` and integration tests `src/*.test.ts` that use the real Registry and contracts (file name = subject).
- `src/__tests__/query/server-conformance.test.ts` reads `MOCK_ENDPOINTS` as it is (lint allows only that import). An endpoint that declares params needs a sample in this test's `PARAMS` table. Every registered action needs a write sample: each menu exports `<g>WriteSamples` from its `./mock` (`Record<fullActionId, () => input>`, wired into `MOCK_WRITE_SAMPLES` by `pnpm gen:menu`). Both `gets every registered action sample from its menu mock (#2010)` and `gives a write sample to every action the app registers` fail with any missing action ids. EV `eqv.topview-events` declares `limits.maxHours: 8`, so each case passes a `context` using the fixture's 30-minute window. The role vocabulary is `registry.permissions`.

## Verification

Narrow with `pnpm --filter @ap/platform-web test`, then run the root checks (root `AGENTS.md`), and check screens on `pnpm dev` (http://127.0.0.1:5173) with the role switch and scenario simulator.

- Every non-mock build (`build:prod`, `build:real-prod`, `vite build --mode real`) also writes `dist/menu-declarations.snapshot.json` from `src/menus.ts` `declarations` and the menu `endpoints.ts` files (`scripts/menu-declaration-snapshot.ts`, ADR-0156); the core server checks its declaration bundle against it. `check:prod-graph` skips it.
- `build` is the mock demo (`--mode mock`; CI and CSS selector comparison use it). `build:prod` fails without `AP_PLATFORM_ASSEMBLY` and type-checks the assembly module with `scripts/typecheck-assembly.ts`. `check:prod-graph` confirms the production module graph has no mock or `src/dev` (CI also runs it with `--force-mock` and `--force-mock-build` to confirm the check still bites). Reasons: [ADR-0009](../../docs/adr/0009-production-assembly-injection.md), [checklist §1](../../docs/integration/real-server-checklist.md).
- Lint: `@ap/mock-server` may be imported only from `src/dev/**`, `src/__tests__/query/server-conformance.test.ts`, `src/__tests__/query/published-metrics.test.ts`, `src/__tests__/saved-view/saved-view-assembly.test.tsx`; a menu `/mock` subpath only from `src/dev/**`; `src/main.tsx` may not import mock or `./dev`. Source: `tooling/eslint/src/index.js` (`app` preset). Lint cannot see `import.meta.glob('./dev/*')`; `check:prod-graph` catches it.
