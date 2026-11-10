# tooling/ — shared development tool configuration

Configuration packages shared by workspace packages. Hold no runtime code.

## Rules

- A config change spreads to every package. After changing one, run the root checks (root `AGENTS.md`); narrow the generator first with `pnpm --filter @ap/gen-menu test`.
- Write the package prefix (`@ap/`, provisional) in config in one constant only (package boundary §8).
- Change root workspace files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`) and CI (`.github/workflows/ci.yml` job `platform-workspace`) together with the rules here. The CI step order is owned by the CI row of [package boundary §6](../docs/integration/platform-packages.md#6-경계-강제와-도구).
- When the SDK tag is raised, update every menu's `ap.sdk` and `SDK_RANGE` in `gen-menu/src/templates.ts` together.
- SDK tools and snapshots live in `tooling/sdk/` (snapshots in `tooling/sdk/api/`); `tooling/scripts/` holds non-SDK tools only.

## eslint/ (`@ap/eslint-config`)

Package-boundary and contract lint (ESLint flat config). Each consumer takes its per-package preset (`contracts`, `kernel`, `menu`, `app`, `httpAdapter`, `featureBridgePreset`, `featureBridgeMenuPreset`, `hostModule`, …) in one `eslint.config.js` line. Prefix constants and rule sources are in `tooling/eslint/src/`. Boundary rule source: [package boundary §3](../docs/integration/platform-packages.md#3-패키지-구성).

- Feature package set (`tooling/eslint/src/feature-packages.js`): every package, `@ap/ui` included, is forbidden to import it (ADR-0046). The only exception is the bridge: `featureBridgePreset` in `@ap/feature-bridge` and `featureBridgeMenuPreset` in bridge menus (rule 8).
- `hostModule` is for modules of other repositories and allows only `@ap/contracts` and `@ap/ui`. Never apply it to this repo's packages; use `hostModuleDir(dir)` only on the shell's fixed module fixture directory (ADR-0053).
- EV boundary (`tooling/eslint/src/eqv-packages.js`, #1612, ADR-0132): EV packages live in `packages/eqv/<name>` and keep the names `@eqv/*`. The seven identities `core|renderer|replay|ui|views|editor|platform-adapter` are an exact list, not a namespace (`@eqv-extra/x` and `@eqv/uix` do not match). Every other preset (SDK, adapters, menus, feature packages, including `.js`/`.mjs`) forbids `@eqv/*`; only `app` allows `@eqv/platform-adapter`, `/manifest` and `/mock-data` (the mock-data rule is unchanged).
- `eqvCore` (`core`, `renderer`) imports no `@ap/*` (static, dynamic, type) and no `@eqv/*` except `@eqv/core`; it is design-system-free. `eqvUi` (`ui`, `replay`, `views`, `editor`) allows `@ap/ui` (theme and CSS subpaths included) from the SDK and `@eqv/*` siblings. `eqvHost` (`platform-adapter`) is `hostModule` plus `@eqv/*` siblings. `ap/no-relative-package-escape` finds the owning `packages/eqv/<name>/package.json`, so a relative import cannot leave the package.
- Feature source presets `featureServerPreset`, `featureSharedPreset`, `featureUiPreset` (`feature.js`) and `featureScreensPreset` (`featureUiPreset` plus `no-restyle` and `require-static-classes`) are feature-only. Do not mix them with other presets. Mapping from the old Biome rules: [package boundary §6](../docs/integration/platform-packages.md#6-경계-강제와-도구).
  - Only the four package-root `eslint.config.js` files that use these presets may import `@ap/eslint-config` (exception in `ops/platform-api/scripts/check-boundaries.mjs`).
- UI-drawing presets (`ui`, `components`, `shell`, `menu`, `app`) turn the six `@shadcn/lint` rules on as errors.
  - The theme is read from the root `components.json` `tailwind.css` (the app `style.css`; packages have no Tailwind entry CSS, so without it platform utilities such as `t-mono` are unknown). Components are recognised by `@ap/ui` / `@ap/components` imports.
  - Rule options are sourced in `tooling/eslint/src/index.js` `RESTYLE_CONTRACTS` and `DESIGN_SYSTEM_RULES` (FO ADR-0062 options kept).
  - Screens give a component layout classes only; containers (`*Content`, `*Header`, `*Footer`, …) may also get spacing; the 50px headers (`DetailPanelHeader`, `ShellHeader`, `ListToolbar`) get no height.
  - Arbitrary values allow layout only. `no-raw-colors` and `no-arbitrary-values` also read constant strings (`scanAllStrings`).
  - Only `packages/sdk/ui`, which defines the primitives, turns `no-restyle` and `require-static-classes` off.
  - `packages/sdk/components` assembles on primitives (06 §13), so it may not override an imported primitive's look. Its own markup (relative imports are not components) is styled freely with tokens (pinned by `boundaries.test.ts`).
  - Consumer overrides allowed by `RESTYLE_CONTRACTS`: `border-border-control` on `Input`/`SelectTrigger`/`Checkbox`, the `aria-disabled:` disabled look on `Button`, the `focus-visible:ring-*` keyboard focus ring on `DropdownMenu*Item`. The tab selection marker is defined by `packages/sdk/ui`, so it has no consumer lint contract.
  - The platform contracts that features lack are the four accessibility floors (ADR-0023 amendment).
  - Mark a false positive on a non-class string or an intended one-off on that line with `eslint-disable-next-line shadcn/<rule> -- <reason>`.
  - The design-system rules skip test files (`**/*.test.{ts,tsx}`) and generated files (`**/*.generated.ts`).

## gen-menu/ (`@ap/gen-menu`, `pnpm gen:menu`)

Creates the menu package skeleton (`src/endpoints.ts`, `src/mock/`, `useMenuQuery` pages — the menu-query pattern) for a group already in the app's `GROUPS` (`apps/platform-web/src/menus.ts`). Management and Analysis skeletons use layout slot components; other archetypes use dashed slots.

- Placement: a `GROUPS` row with `space: null` always goes to `platform/<group>/` (there is no menu `_global` path). A named space goes to `menus/<space>/<group>/`; `--platform` also places that group in `platform/<group>/`. Location and space are separate: only `GROUPS` sets the space.
- `--remove <group>` finds generated packages in both roots through `.gen-menu.json` and rejects generate-only flags (`--platform`, …). Metadata holds `placement` (`menus`|`platform`); records without the field read as `menus`. Trust a metadata path only when it matches the found folder's root, depth and folder.
- `repo-invariants` reads both roots and checks: group ownership; duplicate menu ids, path shapes and package names; app wiring (import/spread pairs are checked by the actual lines in the app marker region, never derived from package name or folder); `menus/` folder space equals `GROUPS`; rejection of one-level `menus/<x>` and nested `platform/<x>/<y>`.
- When you create a group folder, add its group line to `.github/CODEOWNERS` yourself; `repo-invariants` catches a missing line and a line pointing at a missing folder. The generator adds no sidebar group.
- The generator writes six app wiring lines (`menus.ts` import/spread, `style.css`, app `package.json` dependency, the `<gen:menu-mock-*>` markers in `dev/mock-assembly.tsx`), and `--remove` reverts them byte for byte. Never edit marker regions by hand.
- After changing the generator, the coordinator runs `node tooling/gen-menu/scripts/probe.ts` once on a clean tree (it creates and reverts both `menus/` and `platform/` placements in one run).
- Change the `--page-type` slots (`PAGE_SLOTS`) together with 06 §12.

## sdk/ tools

- `sdk/sdk-api-snapshot.mjs` (`pnpm sdk:api`) snapshots the built declarations and the CSS/JSON export paths of the five SDK packages. Each entry is `name | kind | definition` (`kind` is `type-only <kind>` for an `export type` of a runtime value). `# reachable types` records SDK types a signature references that have no export entry. SDK references print as `@ap/<pkg>[/<entry>]#Name`, not `dist` paths. `--update` refreshes the snapshot; `--self-test` checks fixtures.
- `sdk/sdk-pack.mjs`, `sdk-consumer-check.mjs`, `sdk-finalize-dist.mjs` (`pnpm sdk:pack --version X.Y.Z --out <dir>`, `pnpm sdk:consumer-check <dir>`): build and pack the five SDK release tarballs and gate them with a clean external consumer (ADR-0056).
  - `sdk-pack` puts `dist` and the release manifest in a temp folder outside the repo and runs `pnpm pack` (tracked files untouched). `--out` must be missing or empty (otherwise it fails and deletes nothing); the five tarballs and `SHA256SUMS` move there only after every step succeeds.
  - Sibling `@ap/*` in a tarball are exact-version `peerDependencies`; `dependencies` entries fail the pack (#806).
  - `sdk-consumer-check` serves the tarball folder over `127.0.0.1` HTTP and installs as a real consumer by direct URL dependency: no `@ap/*` overrides, `blockExoticSubdeps: true`, `strictPeerDependencies: true`, a different URL path per run to avoid the pnpm URL cache (a `file:` install hides #806). It fails when a package has more than one tarball. The browser `tsc` sees app sources only (a self-check confirms it rejects Node-only declarations), and the check confirms the built JS has no Button dev-only throw.
  - `sdk-finalize-dist` is the second step of each package `build` (copies CSS/JSON, adds `.js` to relative imports). Root `turbo.json` `build` depends on `^build` so sibling `dist` exists first.
  - ESLint presets globally ignore `dist/**` (build output carries inline directives copied from source comments).

## Other tools

- `scripts/check-lazy-chunks.mjs` (`pnpm check:lazy-chunks`, `--self-test`): reads the built `apps/platform-web/dist` entry script of `index.html` and its static import closure, and fails if a chunk contains a marker string of a heavy engine that only lazy screens may use (`LAZY_ENGINES`: Dockview, the two rich-text editor parts, echarts, tanstack virtual, Excel export, analysis board screen, notification panel). It also fails when no chunk has any marker, because then the check proves nothing. Add a new engine to `LAZY_ENGINES`. CI `platform-workspace` runs it right after `pnpm build`, before `sdk:pack` empties `dist`.
- `tsconfig/` (`@ap/tsconfig`): `base.json`, extended by the platform packages and apps `tsconfig.json`. The feature packages (`apps/platform-api`, `packages/feature-shared`, `packages/feature-ui`) extend `ops/platform-api/tsconfig.base.json` instead.
- `css-selectors/` (`@ap/css-selectors`): CLI that extracts selector sets from built CSS and diffs two sets. CI (`.github/workflows/css-selectors.yml`) compares the PR head build with the merge-base build, writes a Markdown report to the Job summary, and fails when a selector is removed. A PR that removes selectors on purpose carries the `css-removal-ok` label (toggling the label reruns only this workflow). Local: `node tooling/css-selectors/src/cli.ts <base.css> <head.css> [--summary <file>] [--allow-removal]`; tests: `pnpm --filter @ap/css-selectors test`.
