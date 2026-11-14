# menus/ — menu Consumer packages

Holds only business-system menu Consumer packages: `menus/<system>/<group>/` (two levels). One package per Registry group (`@ap/menu-<group>`). A menu declares `manifests`; the app (`apps/platform-web/src/menus.ts`) concatenates them and registers them with the Kernel. Menu screens are Consumers that verify the five platform areas (root `AGENTS.md`). Platform features (home, my activity, notices, operations console, feature screens) live one level down in `platform/<feature>/` ([`platform/AGENTS.md`](../platform/AGENTS.md)). The rules below apply to `@ap/menu-*` packages under both roots.

- **Products, not samples:** `menus/log-dev/log-knowledge` is built for real use (epic #1192); its [`AGENTS.md`](log-dev/log-knowledge/AGENTS.md) says what that changes. Every other menu here is a sample Consumer.
- Group ownership is recorded per system/group folder in `.github/CODEOWNERS`; add the line when you create a group folder (ADR-0090 D4).
- `menus/_global/`, `menus/feedbackops/` and `menus/operations/` do not exist; those packages live in `platform/` ([ADR-0097](../docs/adr/0097-platform-features-and-role-based-names.md)).
- `ls menus/*/*` lists the packages. Groups without screens (for example `master-data`, `rcc`, `mcc`, `wpt`, `configuration`, `log-my-work`, `log-cross`) own their group through planned-menu manifests only.

## Rules

- When menu behaviour or a screen changes, bump the internal minor or patch version and add one line to the same PR's CHANGELOG. Do not publish or tag. The expected SDK tag range lives in `package.json` `ap.sdk`. When the SDK tag is raised, update every menu's `ap.sdk` and the generator's `SDK_RANGE` together.
- `src/index.ts` exports only `manifests: MenuEntry[]`. Do not re-export pages or aggregates (`METRICS`, `resolveMetric`, …): the app must be able to import `manifests` alone without breaking route lazy-loading.
  - Config the app must inject into a menu goes through a separate subpath, not the index (for example `@ap/menu-<g>/mock`).
  - Origin subpaths and the `@ap/feature-bridge` subpaths `feature-api`, `notifications-slot`, `voc-compose-slot`, `home-todo-slot` (Kernel slot values that import the bridge) are imported only by app `main.tsx`.
  - `/mock` is imported only by the app mock assembly `src/dev/mock-assembly.tsx` (`pnpm gen:menu` registers it in the `MOCK_ENDPOINTS` marker region). The server conformance test reads that `MOCK_ENDPOINTS`.
  - Lint enforces these; none of them ship in the production build.
- Other restricted subpaths, each imported only by the named file:
  - `@ap/menu-improvement-items/analysis-actions`: app `src/main.tsx`, injected through `analysisActions` for analysis-page overflow actions.
  - `@ap/menu-improvement-items/home-todo-slot`: app `src/main.tsx`, composed with the feature bridge in the existing Kernel `homeTodo` slot. Home imports neither consumer.
  - `@ap/menu-home/launcher`: `apps/platform-web/src/menus.ts`. It is a private home configuration entry; its root stays manifest-only and its screen stays lazy.
  - `@ap/menu-log-analysis/view` (`RoundSourceView`, read-only, namespaced `source*` keys): `apps/platform-web/src/main.tsx` only. It is the Round tab body (ADR-0128).
  - `@ap/menu-log-models/round-source-slot` (`setRoundSourceView`): filled by `main.tsx`. The Round detail «원본/시퀀스» tab does not render when the slot is unset (ADR-0128).
  - `@ap/menu-log-knowledge/model-topview-slot` (`setModelTopView`): filled by `main.tsx` with `@ap/menu-topview/model-topview` (`ModelTopView`, read-only). The model profile Top View section shows the pointer and «이 화면에서는 Top View를 표시할 수 없습니다» when the slot is unset (ADR-0128).
- Never import one `@ap/menu-*` from another. Cross-menu navigation goes through the Kernel link API only (06 §22): `linkTo(menuId)` for a destination the package owns or declares in `linkTargets.required`.
- A link to another menu branches on `resolveLink(...).kind` (`none` = this assembly lacks it: draw no entry); never search `registry.menus` for it. The manifest may declare the target in `linkTargets` (06 §22, ADR-0158).
- The table engine (the four `@tanstack/*` packages) is internal to `@ap/components`. Menus use only `PlatformColumn<T>` and `PageSort[]` (lint `TABLE_ENGINE_PACKAGES`, including `src/mock/**`).
- Pages may import `@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui` (public entry points only) and their own `src/endpoints.ts`. Never import apps (`apps/*`) or other `@ap/menu-*` (package boundary §3).
  - Take period math `periodHours` and `bucketStart` from `@ap/contracts` (`period.ts`); take display constants from the menu's own `src/endpoints.ts`.
- Menu `src/mock/**` holds the mock handlers. It imports only `@ap/mock-server`, `@ap/contracts` and the menu's own `src/endpoints.ts` (no react; relative imports only to its own `src/mock/**` and `src/endpoints`). Lint `ap/no-menu-mock-import` enforces this, and tests (`*.test.ts`) are not exempt.
  - Pure contracts shared by screen and server (codecs, metric-version resolution) live in `src/endpoints.ts`.
  - The app's `src/dev/mock-assembly.tsx` (`MOCK_ENDPOINTS`, generator marker) registers the handlers via `@ap/menu-<g>/mock`. They are excluded from the production build (ADR-0009).
- Reject malformed page keys (`sort`, `trend`, `row`, table `filter`, …) with SDK `usePageKeyRules` / `PageKeyWarning` (tables: `TableUrlWarning`). Do not silently repair them.
- `@ap/menu-analytics` is the reference implementation of the query pattern (`productivity-overview` = apply path, `execution-detail` = every Context `reference`).
- `PlatformDataTable` owns table export and copy ([components/AGENTS.md](../packages/sdk/components/AGENTS.md), 06 §15). Menus provide only `exportRows`, `exportNote`, `exportFilterSummary`, and declare the export endpoint in `src/endpoints.ts` as a row array with `limits.maxRows`. Never read the full list through a render gate.
- A group without screens still owns its group through planned-menu manifests. Do not hang a screen on a `component`-less entry: adding a screen needs a separate request and verification (06 §5, §29).
- `@ap/menu-hw-time`: the four menus share the query declarations (`hwTime.levelRows`, `trend`, `tableRows`, `exportRows`, owned by `hw-time-steps`) and `src/shared/panels/`.
- `@ap/menu-log-knowledge` permissions: read `platform:view`, catalog management `knowledge:catalog-manage`, Item write `knowledge:item-publish`, spec/concept write `knowledge:spec-publish`. Screen contract: [`log-dev/log-knowledge/docs/search.md`](log-dev/log-knowledge/docs/search.md). API source: [`docs/architecture/platform-api/api/log-knowledge.md`](../docs/architecture/platform-api/api/log-knowledge.md).
- `@ap/menu-topview-studio` (`menus/tools/topview-studio`) and `@ap/menu-topview` (`menus/tools/topview`, the Top View and Focus viewer: group `topview`, menus `eqv:topview`/`eqv:focus`, permission `eqv:view`) are EV's own menus and the only menus allowed to import `@eqv/*` (exactly `@eqv/core`, `@eqv/renderer`, `@eqv/replay`, `@eqv/views`, `@eqv/editor`, `@eqv/ui`, `eqvMenu` lint preset): [`docs/integration/platform-packages.md`](../docs/integration/platform-packages.md) owns the rule. The studio's menu permission is `eqv-studio:view`; the viewer's is `eqv:view` (declared in the app's `PERMISSIONS`); both read with `eqv:view`.
- Before adding or changing a screen, read and follow the [`ap-sdk-consumer`](../.agents/skills/ap-sdk-consumer/SKILL.md) skill. It has the steps and the intent table for finding SDK pieces that already exist.

## New group package

1. A human first adds the `GROUPS` row (`apps/platform-web/src/menus.ts`, id via `groupId('…')`). Do not edit the contracts package (ADR-0072).
   - The package writes its group and permissions in one place: `const GROUP = groupId('…')` and `menuPermission('…')`. Declare a new permission in the app's `PERMISSIONS` too.
2. Run `pnpm gen:menu <group> --label-ko … --label-en …`, then `pnpm install` (outputs and wiring: [tooling/AGENTS.md](../tooling/AGENTS.md)).
   - The generator places the package by the `GROUPS` row's `space`: `menus/<space>/<group>/`. With `space: null` or `--platform` it creates `platform/<group>/` (platform feature, `platform/AGENTS.md`).
   - `repo-invariants` checks that the `menus/` folder space equals `GROUPS` `space` ([ADR-0031](../docs/adr/0031-menu-folders-by-space.md)). `platform/` does not set a space by folder name. The `SPACES` list is managed at the app assembly point; a new space follows the app checklist [«Adding a space»](../apps/platform-web/AGENTS.md#adding-a-space).
3. The result is a skeleton, not Domain Done. Do not generate several menus at once. `overview` is owned by `platform/home`.

## Verification

- Narrow with `pnpm --filter @ap/menu-<group> test`, then run the root checks (root `AGENTS.md`). Every menu package has a `test` script except those with planned menus only (`master-data`, `rcc`, `mcc`, `wpt`, `configuration`, `log-my-work`, `log-cross`).
- When a screen changes, check it in the browser with `pnpm dev`.

Next: screen authoring is [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙); the menu declaration contract is 06 §5.
