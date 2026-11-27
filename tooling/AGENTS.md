# tooling/ — shared development tool configuration

Configuration packages shared by workspace packages. Hold no runtime code.

## Rules

- A config change spreads to every package: run the root checks after it.
- Write the package prefix (`@ap/`, provisional) in config in one constant only (package boundary §8).
- Change root workspace files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`) and CI (`.github/workflows/ci.yml` job `platform-workspace`) together with the rules here. The CI step order is owned by the CI row of [package boundary §6](../docs/integration/platform-packages.md#6-경계-강제와-도구).
- When the SDK tag is raised, update every menu's `ap.sdk` and `SDK_RANGE` in `gen-menu/src/templates.ts` together.

## eslint/ (`@ap/eslint-config`)

Package-boundary and contract lint (ESLint flat config). Boundary rule source: [package boundary §3](../docs/integration/platform-packages.md#3-패키지-구성).

- `hostModule` is for modules of other repositories and allows only `@ap/contracts` and `@ap/ui`. Never apply it to this repo's packages; use `hostModuleDir(dir)` only on the shell's fixed module fixture directory (ADR-0053).
- Do not mix feature source presets with other presets. Mapping from the old Biome rules: [package boundary §6](../docs/integration/platform-packages.md#6-경계-강제와-도구).
  - The theme is read from the root `components.json` `tailwind.css` (the app `style.css`; packages have no Tailwind entry CSS, so without it platform utilities such as `t-mono` are unknown). Components are recognised by `@ap/ui` / `@ap/components` imports.
  - The platform contracts that features lack are the four accessibility floors (ADR-0023 amendment).

## gen-menu/ (`@ap/gen-menu`, `pnpm gen:menu`)

- When you create a group folder, add its group line to `.github/CODEOWNERS` yourself; `repo-invariants` catches a missing line and a line pointing at a missing folder. The generator adds no sidebar group.
- Never edit generator marker regions by hand.
- Change the `--page-type` slots (`PAGE_SLOTS`) together with 06 §12.

## sdk/ tools

- Use HTTP for the SDK consumer check: a `file:` install hides #806.
- See the [CI workflow](../.github/workflows/ci.yml) for the `SDK release tarballs and outside consumer` and `Start kit browser check` conditions.
- Change the start-kit README «둘째 메뉴» steps and `addSecondMenu` together.

## scripts/quality-report.mjs (`pnpm quality:report`)

- Lists every site of six patterns as `path:line` rows (jscpd clones, string-literal unions declared more than once, catches that return a default or swallow, Web Storage keys, `toLocale*` calls, files over 500 lines) for the slice-close `review-quality` to cite (#2181). `--only <ids>`, `--json`, `--out <file>`.
- Hand runs and main push only; never add it or its test (`node --test tooling/scripts/quality-report.test.mjs`) to PR CI (#2181). A new pattern is one finder plus one `SECTIONS` row and its test.

## changes/ (`pnpm menu:changelog`)

- `fragments.mjs` owns the per-issue fragment file rules for the SDK and menu packages (name `<issue>.md`, non-empty, deleted after the release fold); `sdk/sdk-changelog.mjs` and `menus.mjs` own their row formats. Change a file rule here once, not per caller.
