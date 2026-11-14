# packages/ — common rules for platform packages

Home of the implementation of the five platform areas (root `AGENTS.md`). Menu screens do not live here (`menus/<space>/<group>` and `platform/<feature>` packages hold them).

The source of boundaries and dependency direction is [package boundary](../docs/integration/platform-packages.md) §3. This file is a summary; on conflict follow that document.

## Packages and dependency direction

Folders are grouped one level (ADR-0090): `app-host/` sits directly under `packages/`; the five SDK packages and the unpublished `contract-schemas` are in `sdk/`, the four adapter/consumer-side packages in `adapters/`, and the feature package set (`tooling/eslint/src/feature-packages.js`) `feature-shared/` and `feature-ui/` directly under `packages/`. Package names (`@ap/*`) and public APIs do not depend on the folder. The relative path from inside a package to the repo root is `../../../`.

| Package | Role | May import |
| --- | --- | --- |
| `sdk/contracts/` (`@ap/contracts`) | URL codec, manifest metadata types, response/Trust envelope, `PlatformAdapter` port | nothing |
| `sdk/contract-schemas/` (`@ap/contract-schemas`) | Contract schema source (Zod), JSON Schema 2020-12 outputs and `endpoints.json` (ADR-0096). A Release asset of `pnpm sdk:schemas`, not a tarball; no consumers (not in `SDK_PACKAGES`) | runtime `zod` only (tests only: `contracts`) |
| `sdk/ui/` (`@ap/ui`) | Tokens, Tailwind theme, shadcn primitives, `Button`, `StatusBadge`, `cn` | external libraries only |
| `sdk/kernel/` (`@ap/kernel`) | Registry runtime, `PlatformProvider`, global Context/URL/Scope state, request lifecycle (internal engine `@tanstack/react-query`, ADR-0086), i18n | `contracts` + external `@tanstack/react-query` (internal only) |
| `sdk/components/` (`@ap/components`) | `PlatformPage`, table, drawer, audit, trust indicators, state screens, chart frame | `contracts`, `kernel`, `ui` |
| `sdk/shell/` (`@ap/shell`) | AppShell, AppRail, AppSidebar, ScopeSelector, CommandPalette, GlobalContextBar, RouteOutlet | `contracts`, `kernel`, `components`, `ui` |
| `app-host/` (`@ap/app-host`) | Host assembly function `startAppHost` (+ `buildRegistry`, `AppRoot`, `StartupFailure`): mounts injected registry declarations, adapter assembly, slots and axes ([host contract](../docs/design/host-entry-contract.md) §3). Release unit 2, not in `SDK_PACKAGES`. Domain-free: no menu, bridge, EV, mock or http client | `contracts`, `kernel` (+ `kernel/host`), `components`, `ui`, `shell`; imported only by apps and out-of-repo assemblies |
| `adapters/feature-bridge/` (`@ap/feature-bridge`) | Feature-screen bridge runtime (session singleton, `FeatureBridge`, `hostLinks`, `feature-api`, Kernel slot values; ADR-0071, 0081). Consumer side, not SDK. Bridge menus and app files import the root; only app `main.tsx` imports the slot and API subpaths | `contracts`, `kernel`, `components`, `ui` + `@ap/feature-screens/global-screens/core` |
| `adapters/mock-server/` (`@ap/mock-server`) | Dev server stand-in (menu query engine `serveEndpoint`, `defineMockEndpoint`, `createMockAdapter`). The app injects it; each menu's `src/mock/` owns its handlers. No Tailwind | `contracts` |
| `adapters/http-adapter/` (`@ap/http-adapter`) | Real-server client (`bootstrapHttpAdapter` → `PlatformAdapter`, [wire format](../docs/integration/http-adapter-contract.md)). Only the app's production assembly `src/real/**` imports it | `contracts` |
| `adapters/server-conformance/` (`@ap/server-conformance`) | Server-boundary conformance suite including port methods. Independent of the adapter implementation: judges mock and real adapters by the same bar. App integration tests run it | `contracts` (+ vitest) |
| `eqv/` (`@eqv/*`) | Equipment visualization Consumer packages absorbed by ADR-0132; rules in [`eqv/AGENTS.md`](eqv/AGENTS.md) | see `eqv/AGENTS.md` |

## Rules for every package

- No reverse imports. The only road to the server is `PlatformAdapter` ([package boundary](../docs/integration/platform-packages.md) §3-§4); do not add menu-vocabulary methods to the port.
- No platform package imports the feature package set (`tooling/eslint/src/feature-packages.js`) (boundary lint). The only exception is the bridge `@ap/feature-bridge` (`@ap/feature-screens/global-screens/core`, plus `global-screens` for `src/pages/` that slots open lazily; ADR-0071).
- `@ap/ui` owns tokens and primitives; other platform code uses its public exports ([ADR-0043](../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [0046](../docs/adr/0046-design-system-source-moves-to-platform-whole-package.md)).
- Import another package only through the public entry points of its `package.json` `exports` (`@ap/kernel`, `@ap/ui/styles.css`). No deep paths like `@ap/x/src/...`.
- In workspace development a package exports TS source directly; `build` produces `dist` for release tarballs ([ADR-0056](../docs/adr/0056-sdk-release-github-release-tarballs.md)). Vite bundles the app.
- A package that uses Tailwind classes registers its own source with `@source` in `styles.css`, and the app `src/style.css` imports it. Add both when creating a package. A package without Tailwind (`mock-server`) has no `styles.css`.
- New tests go in the `__tests__/` folder of the feature folder they test ([ADR-0090](../docs/adr/0090-repo-structure-by-branch.md)).
- Test-only entry points are exported as `exports["./testing"]` (ADR-0040, extended #413). Import them only from test files (`*.test.ts(x)`, `test-support.ts(x)`, `test-setup.ts`); lint blocks production sources.
  - `@ap/kernel/testing`: `testAdapter`, `testSession`, `testSpace`, `noContext`, `memoryStorage`, `ToastProbe`, `useToastsForTest`, `settleQueries`. Build adapter stubs with `testAdapter({ … })`, never by hand.
  - `@ap/components/testing`: `stubCompactTableGeometry` (table geometry stub); components' own tests use `./testing`.
  - `@ap/components/testing/engines`: `mockEchartsCanvas`, `probeDockEngine` (engine seams registered with `vi.doMock` from inside the package, so tests outside it never import `echarts` or `dockview-react`). Call as `await vi.hoisted(async () => (await import('@ap/components/testing/engines')).fn())`.
  - `@ap/feature-bridge/testing`: `createFeatureMenuHarness` (registry and `mountAt` harness for bridge menus). Only bridge menus (`featureBridgeMenuPreset`) tests and `test-support` import it; the root does not re-export it.
  - `@ap/server-conformance` sees only `@ap/contracts`, in production and tests.
- Host-only entry `@ap/components/dock` (controlled `DockLayout`, layout schema, pure commands; ADR-0067) is exported as `exports["./dock"]`, not from `src/index.ts`. Only shell and app production code import it (lint gate); no `dockview-*` engine is imported outside `@ap/components`.
- Host-only entry `@ap/kernel/host` (`useHostPlatform`, `HostPlatform` and shell-only symbols, [ADR-0076](../docs/adr/0076-kernel-host-entry-narrow-menu-platform.md)) is exported as `exports["./host"]`. Shell, common components and the app import it; lint blocks menus, menu mocks and host modules. Menus use only root `usePlatform()` (`MenuPlatform`).
- Export every new public API explicitly from `src/index.ts`. A general-purpose piece without domain knowledge goes in the SDK regardless of consumer count (ADR-0052); a pattern born inside a menu is promoted after 2–3 menus repeat it (06 §24). §4 Kernel duties are outside this criterion.
- The `@ap/` prefix is provisional. Never put it in runtime strings (localStorage keys, event names).

## Verification

- For public API changes, follow [SDK change notes and release baselines](sdk/AGENTS.md). After a build, read the diff with `pnpm sdk:api --report` (it reads each package's built `dist`).
- Narrow with `pnpm --filter @ap/<package> test`, then run the root checks (root `AGENTS.md`). CI `CSS selectors (build diff)` compares the built CSS selector sets of move/refactor PRs automatically; label `css-removal-ok` only for intended removals ([tooling/AGENTS.md](../tooling/AGENTS.md)).
- When you touch the release shape (package `exports`, CSS `@source`, `tsconfig.build.json`, a new file kind), run `pnpm sdk:pack --out <temp folder>` then `pnpm sdk:consumer-check <same folder>`. The first builds the five packages to `dist` and makes tarballs and `SHA256SUMS`; the second has a clean external consumer install them and run `tsc`, a Vite build, CSS class checks and Vitest (CI runs the same order, ADR-0056).

Next: the `AGENTS.md` of the package you edit — SDK [contracts](sdk/contracts/AGENTS.md)·[contract-schemas](sdk/contract-schemas/AGENTS.md)·[ui](sdk/ui/AGENTS.md)·[kernel](sdk/kernel/AGENTS.md)·[components](sdk/components/AGENTS.md)·[shell](sdk/shell/AGENTS.md); adapters [mock-server](adapters/mock-server/AGENTS.md)·[http-adapter](adapters/http-adapter/AGENTS.md)·[server-conformance](adapters/server-conformance/AGENTS.md)·[feature-bridge](adapters/feature-bridge/AGENTS.md); feature [feature-shared](feature-shared/AGENTS.md)·[feature-ui](feature-ui/AGENTS.md).
