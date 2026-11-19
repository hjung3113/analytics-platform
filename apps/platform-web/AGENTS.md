# apps/platform-web — assembly point

The app assembles the platform packages (dev and tests inject the mock adapter). Menu screens live in [`menus/*/*`](../../menus/AGENTS.md) and [`platform/*`](../../platform/AGENTS.md) packages; the app only assembles (root `AGENTS.md`).

## Rules

- Write menu screens by [README "페이지 작성 가이드"](README.md#페이지-작성-가이드-consumer-규칙), the source. Summary: top-level `PlatformPage`; menu data via `useMenuQuery(endpoint, params)` + `QueryView` (only the operations console's Kernel store queries use `usePlatformQuery`, ADR-0019); navigation via `linkTo()`; page state only through registered `pageKeys`.
- Pages never modify `packages/*`. When a common part is missing, report the need and raise it as platform work.
- Declare a new menu in the `manifests` of its group package (`menus/<space>/<group>/src/index.ts` or `platform/<feature>/src/index.ts`) and check 06 §5 (Menu Extension Contract) and §29 (Platform Done).
- Import the design-system CSS through `@ap/ui/styles.css` ([packages/sdk/ui/AGENTS.md](../../packages/sdk/ui/AGENTS.md)). Menu styles sit in the generator region.

## Assembly (`src/main.tsx`, `@ap/app-host`)

- Tree: `I18nProvider` → `AppRoot` (`PlatformProvider adapter registry slots` → `AppShell` + `RouteOutlet`). Assemble only.
- Put the assembly's `featureApi` (real-server assembly only; mock otherwise) into `@ap/feature-bridge/feature-api` (ADR-0071).

### Slots

- The `features` slot comes from `featureSlot()` in `src/feature-systems.ts` (ADR-0045, ADR-0110 decision 5). The space → Managed System link lives on the server and is received by the `src/space-systems.ts` store:
  - Only `declared` links make entries (withdrawn or unlinked spaces get no block). `managedSystemFor(null)` (spaceless screens: home, 소통, 내 활동) is the «플랫폼» system.
  - Rail `VOC 등록` blocks submit until `useComposeDefaultStatus()` is `ready` (the form still opens); after a failure it re-reads on the next open.
  - Every entry is a shell menu with no all-link. The block shows only to `features:access` holders.

## Files

- `reservedRoots` stop a space id from capturing paths the app serves outside the Registry (06 §6.4).
- Package links (import and spread) are `gen:menu` marker regions written by `pnpm gen:menu`. Write `SPACES` and `GROUPS` by hand. Each menu package owns its lazy screen imports.
- `src/dev/mock-assembly.tsx` — mock assembly. Register menu mock endpoints in the single `export const MOCK_ENDPOINTS` (`createMockAdapter` and the server conformance test read the same list) by spreading each menu's `<g>Mock` array from `@ap/menu-<g>/mock`. The `/mock` imports and spreads sit in the `// <gen:menu-mock-imports>` / `// <gen:menu-mock-spreads>` marker regions written by `pnpm gen:menu` (analytics mock included); never register by hand there, and wire outside the regions by hand.
  - The `platform:mock-menu-query` performance mark counts E2E requests: it carries only the endpoint name, never Context.
  - It hands `@eqv/core`'s Sample Window import check and Inventory build (re-exported by `@ap/menu-topview/mock-data`) to the 설비 온보딩 mock with `setSampleWindowImport`, because menu mock code may not import `@eqv/core`. Proof: `src/dev/__tests__/eqv-onboarding-import.test.ts`.
- The mock for the three EV reads (`eqv.equipment-options`, `eqv.topview-context`, `eqv.topview-events`) is `topviewMock` of `@ap/menu-topview/mock` (`mart: false`), registered in the `MOCK_ENDPOINTS` marker like every menu mock. The assembly hands it the synthetic fixture of `@ap/menu-topview/mock-data` with `setTopviewMockSource`, because menu mock code may not import `@eqv/core`.
- `src/real/endpoint-invalidation.ts` (the mounting bridge is `EndpointInvalidationBridge` in `@ap/app-host`) — refresh the Home banner after a notice write ([ADR-0098](../../docs/adr/0098-adapter-preferences-people-notices-ports.md) §4).
  - The real assembly wraps `saveNotice`/`deleteNotice` once; after `ok`, `conflict`, `unknown` (or a throw) it emits the app-declared `home.notices` through `Assembly.invalidation`.
  - `startAppHost` mounts one `EndpointInvalidationBridge` under `PlatformProvider`; it calls `refreshEpochs.bump` for that query only (not the full `adapter.subscribe` invalidation; the Kernel knows no menu names).
  - Create the decorated adapter once per bootstrap, never per render. Proof: `src/__tests__/slots/notice-invalidation.test.tsx`.
- `src/query-history-store.ts` — current-browser local implementation of the SDK history port (06 §11), injected by `main.tsx`. It owns tuple keys, schema validation, Web Locks serialization and the 20-entry merge/retention. A storage exception is rejected with a fixed non-sensitive error; content never goes to instrumentation.
- The browser-local mock of the SDK saved-view port (`createLocalSavedViewStore`, 06 §21) lives in `@ap/mock-server` (`packages/host/mock-server/src/saved-view/`); `src/dev/mock-assembly.tsx` injects it as `PlatformProvider savedViews`. It simulates server ACL only (no server storage, audit or `PlatformAdapter` extension).
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

## Verification

Narrow with `pnpm --filter @ap/platform-web test`, then run the root checks (root `AGENTS.md`), and check screens on `pnpm dev` (http://127.0.0.1:5173) with the role switch and scenario simulator.

- Production assembly and module graph: [ADR-0009](../../docs/adr/0009-production-assembly-injection.md), [checklist §1](../../docs/integration/real-server-checklist.md).
