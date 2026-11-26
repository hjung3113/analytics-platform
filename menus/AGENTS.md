# menus/ — menu Consumer packages

Holds only business-system menu Consumer packages: `menus/<system>/<group>/` (two levels), one package per Registry group (`@ap/menu-<group>`). Platform features (home, my activity, notices, operations console, feature screens) live one level down in `platform/<feature>/` ([`platform/AGENTS.md`](../platform/AGENTS.md)). The rules below apply to `@ap/menu-*` packages under both roots.

## Rules

- A behaviour or screen change adds `changes/<issue>.md` in that package (first line `bump: patch` or `bump: minor`, then `- ` bullets in the CHANGELOG voice without `(#n)`) and leaves `version` and `CHANGELOG.md` alone. Reason: two open PRs would pick the same next version; the release-docs PR folds the fragments once.
- `src/index.ts` exports only `manifests: MenuEntry[]`. Do not re-export pages or aggregates (`METRICS`, `resolveMetric`, …): the app must be able to import `manifests` alone without breaking route lazy-loading.
  - Config the app must inject into a menu goes through a separate subpath, not the index (for example `@ap/menu-<g>/mock`).
- Cross-menu navigation goes through the Kernel link API only (06 §22): `linkTo(menuId)` for a destination the package owns or declares in `linkTargets.required`.
- A link to another menu branches on `resolveLink(...).kind` (`none` = this assembly lacks it: draw no entry); never search `registry.menus` for it. The manifest may declare the target in `linkTargets` (06 §22, ADR-0158).
- Take period math `periodHours` and `bucketStart` from `@ap/contracts` (`period.ts`); take display constants from the menu's own `src/endpoints.ts`.
- Pure contracts shared by screen and server (codecs, metric-version resolution) live in `src/endpoints.ts`.
- Reject malformed page keys (`sort`, `trend`, `row`, table `filter`, …) with SDK `usePageKeyRules` / `PageKeyWarning` (tables: `TableUrlWarning`). Do not silently repair them.
- `@ap/menu-analytics` is the reference implementation of the query pattern (`productivity-overview` = apply path, `execution-detail` = every Context `reference`).
- `PlatformDataTable` owns table export and copy ([components/AGENTS.md](../packages/sdk/components/AGENTS.md), 06 §15). Menus provide only `exportRows`, `exportNote`, `exportFilterSummary`, and declare the export endpoint in `src/endpoints.ts` as a row array with `limits.maxRows`. Never read the full list through a render gate.
- Do not hang a screen on a `component`-less entry: adding a screen needs a separate request and verification (06 §5, §29).
- For Analysis manifest defaults and opt-outs, see [query declaration, Kernel §5](../docs/contract/kernel.md#5-menu-extension-contract) and [saved views, §21](../docs/contract/kernel.md#21-saved-view-contract).
- Before adding or changing a screen, read and follow the [`ap-sdk-consumer`](../.agents/skills/ap-sdk-consumer/SKILL.md) skill. It has the steps and the intent table for finding SDK pieces that already exist.

## New group package

1. A human first adds the `GROUPS` row (`apps/platform-web/src/menus.ts`, id via `groupId('…')`). Do not edit the contracts package (ADR-0072).
   - The package writes its group and permissions in one place: `const GROUP = groupId('…')` and `menuPermission('…')`. Declare a new permission in the app's `PERMISSIONS` too.
2. Run `pnpm gen:menu <group> --label-ko … --label-en …`, then `pnpm install` (outputs and wiring: [tooling/AGENTS.md](../tooling/AGENTS.md)).
   - `platform/` does not set a space by folder name. The `SPACES` list is managed at the app assembly point; a new space follows the app checklist [«Adding a space»](../apps/platform-web/AGENTS.md#adding-a-space).
3. The result is a skeleton, not Domain Done. Do not generate several menus at once. `overview` is owned by `platform/home`.

## Next

Screen authoring is [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙); the menu declaration contract is 06 §5.
