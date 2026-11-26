# menus/ — menu Consumer packages

Holds only business-system menu Consumer packages: `menus/<system>/<group>/` (two levels). One package per Registry group (`@ap/menu-<group>`). Menu screens are Consumers that verify the five platform areas (root `AGENTS.md`). Platform features (home, my activity, notices, operations console, feature screens) live one level down in `platform/<feature>/` ([`platform/AGENTS.md`](../platform/AGENTS.md)). The rules below apply to `@ap/menu-*` packages under both roots.

## Rules

- When a package under `menus/<group>/<menu>` changes behaviour or a screen, add `changes/<issue>.md` and do not edit `version` or `CHANGELOG.md` in that PR. The first line is `bump: patch` or `bump: minor`; each following line is a `- ` bullet in the CHANGELOG voice, with no `(#n)` prefix (the filename is the issue). Two open PRs would otherwise choose the same next version and conflict after the first merges. The release-docs PR folds every fragment once (`pnpm menu:changelog --release --date <day>`). Do not publish or tag. The expected SDK tag range stays in `package.json` `ap.sdk`. A `platform/<feature>` package still bumps `version` and adds its CHANGELOG line in the same PR: the fold tool does not scan that root.
- `src/index.ts` exports only `manifests: MenuEntry[]`. Do not re-export pages or aggregates (`METRICS`, `resolveMetric`, …): the app must be able to import `manifests` alone without breaking route lazy-loading.
  - Config the app must inject into a menu goes through a separate subpath, not the index (for example `@ap/menu-<g>/mock`).
- The Round detail «원본/시퀀스» tab does not render when the slot is unset (ADR-0128).
- The model profile Top View section shows the pointer and «이 화면에서는 Top View를 표시할 수 없습니다» when the slot is unset (ADR-0128).
- Cross-menu navigation goes through the Kernel link API only (06 §22): `linkTo(menuId)` for a destination the package owns or declares in `linkTargets.required`.
- A link to another menu branches on `resolveLink(...).kind` (`none` = this assembly lacks it: draw no entry); never search `registry.menus` for it. The manifest may declare the target in `linkTargets` (06 §22, ADR-0158).
- Take period math `periodHours` and `bucketStart` from `@ap/contracts` (`period.ts`); take display constants from the menu's own `src/endpoints.ts`.
- Pure contracts shared by screen and server (codecs, metric-version resolution) live in `src/endpoints.ts`.
- Reject malformed page keys (`sort`, `trend`, `row`, table `filter`, …) with SDK `usePageKeyRules` / `PageKeyWarning` (tables: `TableUrlWarning`). Do not silently repair them.
- `@ap/menu-analytics` is the reference implementation of the query pattern (`productivity-overview` = apply path, `execution-detail` = every Context `reference`).
- `PlatformDataTable` owns table export and copy ([components/AGENTS.md](../packages/sdk/components/AGENTS.md), 06 §15). Menus provide only `exportRows`, `exportNote`, `exportFilterSummary`, and declare the export endpoint in `src/endpoints.ts` as a row array with `limits.maxRows`. Never read the full list through a render gate.
- Do not hang a screen on a `component`-less entry: adding a screen needs a separate request and verification (06 §5, §29).
- For Analysis manifest defaults and opt-outs, see [query declaration, Kernel §5](../docs/contract/kernel.md#5-menu-extension-contract) and [saved views, §21](../docs/contract/kernel.md#21-saved-view-contract).
- `@ap/menu-hw-time`: one linked-panel analysis screen (`hw-time`, ADR-0078 partly superseded by ADR-0165): per-step panels and add/pin; `PanelWorkspace` owns layout commands and persistence, and raw rows keep paging/export. Its four former ids are retired into it in the app assembly (`RETIRED_MENUS`, #2330).
- Before adding or changing a screen, read and follow the [`ap-sdk-consumer`](../.agents/skills/ap-sdk-consumer/SKILL.md) skill. It has the steps and the intent table for finding SDK pieces that already exist.

## New group package

1. A human first adds the `GROUPS` row (`apps/platform-web/src/menus.ts`, id via `groupId('…')`). Do not edit the contracts package (ADR-0072).
   - The package writes its group and permissions in one place: `const GROUP = groupId('…')` and `menuPermission('…')`. Declare a new permission in the app's `PERMISSIONS` too.
2. Run `pnpm gen:menu <group> --label-ko … --label-en …`, then `pnpm install` (outputs and wiring: [tooling/AGENTS.md](../tooling/AGENTS.md)).
   - `platform/` does not set a space by folder name. The `SPACES` list is managed at the app assembly point; a new space follows the app checklist [«Adding a space»](../apps/platform-web/AGENTS.md#adding-a-space).
3. The result is a skeleton, not Domain Done. Do not generate several menus at once. `overview` is owned by `platform/home`.

## Verification

Next: screen authoring is [apps/platform-web README "페이지 작성 가이드"](../apps/platform-web/README.md#페이지-작성-가이드-consumer-규칙); the menu declaration contract is 06 §5.
