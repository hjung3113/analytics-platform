# 6a — boundary + contract lint (`@ap/eslint-config`)

Design only. 6b `gen:menu` is out of scope except the files it must emit. Do not lint `prototypes/`, `products/`, or CSS. Do not add formatting, `eslint:recommended`, `@typescript-eslint` recommended, or type-aware `projectService`. No new workflow job. Do not edit `HANDOFF.md`.

Current tree was read on `hjung3113/step6a-boundary-lint` (workspace after step 5). One live violation (F1) must be fixed in this PR. Do not allowlist it.

## Resolved

- **(a) per-package `lint` + one-line `eslint.config.js`.** Not one root config. Turbo already caches per package (`typecheck` / `test` / `build`); a root `eslint .` is one cache key and, worse, flat-config `files` are relative to the process cwd. `src/api.ts` and `src/dev/**` only match when cwd is that package. Each package owns its layer by importing one preset. 6b does not edit a central glob.
- **Built-ins plus one local rule.** `no-restricted-imports` (allowlist via `!` negation), `no-restricted-globals`, `no-restricted-syntax`. No `eslint-plugin-boundaries`, no `import-x`: a `../` pattern cannot mean "leaves this package" because legal depth depends on the file. The local rule is `ap/no-relative-package-escape` only.
- **ESLint `^10.11.0`** (flat config; eslintrc is gone; engines allow Node `>=24`, so 26.7.0 stays). **Parser `@typescript-eslint/parser@^8.70.1` only** — not the umbrella preset. Pinned in `@ap/eslint-config`. Each consumer also devDepends on `eslint@^10.11.0` so pnpm links the bin (same pattern as `typescript`). Consumers do not depend on the parser; the preset passes the parser **object**.
- **Config is ESM `.js`.** Node loads `eslint.config.js` with no build step. Tests are TS, run by Vitest.
- **§6 "lint Job"** is a step in the existing `platform-workspace` job, not a new job. The workflow comment already prefers one platform job and separate steps.
- **Rule 5's DOM ban stays typecheck** (`packages/contracts` `lib: ES2022`, `types: []`). ESLint only bans `@ap/*` and `react` / `react-dom` there. `URLSearchParams` in `globals.d.ts` is an ambient class, not an import.
- **Contract rules apply to `menus/**` only.** Kernel owns URL writes (`history.pushState` / `replaceState`) and `localStorage`. Shell, `PlatformDataTable`, and mock-server own their storage. App DevTools and URL tests are fixtures, not menu navigation.
- **`window.location.origin` reads are not writes.** `MetricDetail.tsx:80` and `GlobalContextBar.tsx:37` stay.
- **Prefix.** `export const PACKAGE_PREFIX = '@ap/'` lives only in `tooling/eslint/src/prefix.js`. Patterns are `` `${PACKAGE_PREFIX}*` ``, `` `${PACKAGE_PREFIX}*/*` ``, `` `${PACKAGE_PREFIX}${name}` ``. Package names and `import … from '@ap/eslint-config'` are the §8 exceptions (name / dependency / import). A test fails if any other `src/**/*.js` contains the characters `@ap/`.

## F1 — fix in this PR, do not allowlist

`menus/home/src/pages/OperationsHome.tsx:14` and `:44` call `sessionStorage` (`platform:notice-dismissed`). That is the only menu storage use. After the rule is on, `pnpm lint` is red until this is gone.

**Fix:** delete `DISMISS`, `readDismissed`, and `sessionStorage.setItem`. Keep `useState<string[]>([])`. ~~Dismiss still lasts for the SPA session~~ (wrong: component state resets when the route unmounts — review F3; fixed with a module-level store, `menus/home/src/pages/dismissed-notices.ts`); a reload shows the notice again. Do not add a kernel helper (06 §24, one caller). Do not change button copy. `@ap/menu-home` has no test for this. No other file change in menus.

If reload persistence is required, stop: that is a kernel-owned API, a separate decision, not an override.

## 1. `tooling/eslint/`

`package.json`: `"name": "@ap/eslint-config"`, `"type": "module"`, `"private": true`, `"exports": { ".": "./src/index.js" }`. Dependencies: `eslint@^10.11.0`, `@typescript-eslint/parser@^8.70.1`. Dev: `@ap/tsconfig`, `typescript@^5.9.3`, `vitest@^3.2.7`. Scripts: `"lint": "eslint ."`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.

`tsconfig.json`: extends `@ap/tsconfig/base.json`, `include: ["src"]` (tests only; JS is untyped). `vitest.config.ts`: `environment: 'node'`, no setup file, no jsdom.

`eslint.config.js`: `export { tooling as default } from '@ap/eslint-config';`

`src/prefix.js`: the one constant.

`src/relative-escape.js`: rule `ap/no-relative-package-escape`. For `ImportDeclaration`, `ExportNamedDeclaration` / `ExportAllDeclaration` with `source`, and `ImportExpression` whose source is a string starting with `.`: `path.resolve(dirname(context.filename), source)`, lexical `path.normalize` only (no realpath). Walk parents for the nearest `package.json` whose `name` starts with `PACKAGE_PREFIX`. Report when the resolved path is not that directory or a descendant. Missing package root is an error (bad `filePath` must not pass).

`src/index.js`: builds presets. Base on every preset:

- `ignores: ['dist/**', 'coverage/**']` (ESLint already ignores `node_modules`).
- `files: ['**/*.{ts,tsx}']`.
- `languageOptions.parser` = typescript-eslint parser, `ecmaVersion: 'latest'`, `sourceType: 'module'`, `ecmaFeatures.jsx: true`. No `parserOptions.project`.
- Plugin object `ap` with the one local rule (not a published plugin).
- `ap/no-relative-package-escape`: `error`.
- `no-restricted-imports`: `error`, patterns
  - `{ group: ['${PREFIX}*/*', '${PREFIX}*/*/**'], message: 'Import the package entry (@ap/name) or, in CSS only, @ap/name/styles.css. No @ap/*/src.' }`
  - layer allowlist below.
- No other rules. Severity is error only.

Allowlist helper: `group: ['${PREFIX}*', '!' + pkg(a), '!' + pkg(b), …]` plus, when `denyReact`, `paths` for exact `react` and `react-dom` and patterns `react/*`, `react-dom/*`. `*` does not cross `/`, so `!@ap/contracts` does not exempt `@ap/contracts/src/url`. `no-restricted-imports` covers `import type` and `export … from`.

| Preset | Export | Allow `@ap/` | React |
| --- | --- | --- | --- |
| `contracts` | `contracts` | none | deny |
| `ui` | `ui` | none | allow |
| `kernel` | `kernel` | `contracts` | allow |
| `components` | `components` | `contracts`, `kernel`, `ui` | allow |
| `shell` | `shell` | those + `components` | allow |
| `mockServer` | `mockServer` | `contracts` | deny |
| `menu` | `menu` | `contracts`, `kernel`, `components`, `ui` | allow |
| `app` | `app` | all `@ap/*` except subpaths | allow |
| `tooling` | `tooling` | none | deny |

**Menu mock-server carve-out.** Default menu preset adds pattern `{ group: [pkg('mock-server'), pkg('mock-server/*')], message: '@ap/mock-server is only legal in src/api.ts' }`. A later block `files: ['src/api.ts']` replaces `no-restricted-imports` with the same allowlist **including** `mock-server` (flat config replaces that rule id; other rules cascade). `src/api.test.ts` stays on the default. Not `**/*api*`.

**App mock-server carve-out (D2).** Default app preset has the same mock-server ban (deep-subpath ban stays). A later block turns the ban off only for `src/main.tsx`, `src/dev/**/*.{ts,tsx}`, `src/published-metrics.test.ts`. `src/menus.ts`, `src/url-contract.test.ts`, `src/return-to.test.ts` stay banned. Rule 6: no `ignores` for `**/*.test.*`.

**Menu contract rules** (menu preset only; not api.ts-specific):

`no-restricted-globals`: `localStorage`, `sessionStorage`. Message: menu code cannot touch web storage; kernel/shell/components own it.

`no-restricted-syntax` selectors (custom `message` so the test can see which one fired; `ruleId` stays `no-restricted-syntax`):

- Storage members: `MemberExpression[object.name=/^(window|globalThis)$/][property.name=/^(localStorage|sessionStorage)$/][computed=false]`.
- Location writes, non-optional, non-computed:
  - `AssignmentExpression[left.type='Identifier'][left.name='location']`
  - `AssignmentExpression[left.object.name='location']`
  - `AssignmentExpression[left.object.name='window'][left.property.name='location']`
  - `CallExpression[callee.object.name='location'][callee.property.name=/^(assign|replace)$/]`
  - `CallExpression[callee.object.object.name='window'][callee.object.property.name='location'][callee.property.name=/^(assign|replace)$/]`
  - Do **not** select every `.href =` or every `.replace(`. Downloads (`a.href = URL.createObjectURL(blob)`, `CycleTimeDrilldown.tsx:140`, `equipment/.../data.ts:49`, `MetricCatalog.tsx:204`) and `anchor.replace('T',' ')` must pass. `window.history.replaceState` is not `location.replace`.
- Hand-built query, direct position only. A string is "query-like" when a `Literal` value or `TemplateElement.value.raw` matches `/[?&]/`. Positions: descendant of `JSXAttribute[name.name='href']`, or of a `CallExpression` whose callee is `navigate` or `*.navigate`. Selectors:
  - `JSXAttribute[name.name='href'] Literal[value=/[?&]/]`
  - `JSXAttribute[name.name='href'] TemplateElement[value.raw=/[?&]/]`
  - `CallExpression[callee.name='navigate'] Literal[value=/[?&]/]`
  - `CallExpression[callee.name='navigate'] TemplateElement[value.raw=/[?&]/]`
  - `CallExpression[callee.property.name='navigate'] Literal[value=/[?&]/]`
  - `CallExpression[callee.property.name='navigate'] TemplateElement[value.raw=/[?&]/]`

  Not dataflow. `href={r.url}` (`OperationsHome.tsx:84`), `href={linkTo(...)}`, `href={returnTarget()}`, and `const u = '/x?v=1'; <a href={u} />` pass. Copy such as `Roles & access` (`menus/admin/src/index.ts`) is not an `href`. `contracts` `return '?' + params.toString()` is not under the menu preset. DevTools query strings (`apps/platform-web/src/dev/DevTools.tsx:59-66`) are app code and are passed as `navigate(l.url)` — out of scope. Optional `window?.location?.assign` is an accepted gap; fixture 73 must pass.

## 2. Opt-in (14 consumers + this package = 15 lint tasks)

One line, package `"type": "module"` already:

```js
export { kernel as default } from '@ap/eslint-config';
```

Use the export name from the table (`mockServer` for mock-server, `menu` for every `@ap/menu-*`, `app` for `@ap/platform-web`). `package.json` script `"lint": "eslint ."`. devDependencies `"@ap/eslint-config": "workspace:*"` and `"eslint": "^10.11.0"`. Do not add a `build` script. `tooling/tsconfig` has no source and no `lint` script. No root `eslint.config.js`.

## 3. Root, Turbo, CI

`package.json` scripts add `"lint": "turbo run lint"` next to `typecheck`. `turbo.json`:

```json
"lint": { "dependsOn": ["^lint"], "outputs": [] }
```

`.github/workflows/ci.yml` `platform-workspace`, after `pnpm install --frozen-lockfile` and before `pnpm typecheck`: `- run: pnpm lint`. Node stays `26.7.0`. `pnpm install` will change `pnpm-lock.yaml`; commit it.

## 4. Fixtures — `tooling/eslint/src/boundaries.test.ts`

`ESLint` from `eslint`, `{ overrideConfigFile: true, overrideConfig: <preset>, cwd: <package root> }`, then `lintText(code, { filePath })`. `filePath` is absolute under the real package (file need not exist; parent `package.json` must). Assert `messages.some(m => m.ruleId === expected)` or, for syntax, `message` contains the selector message. Allowed ⇒ `messages.length === 0`. Also assert no other rule id appears (zero noise).

`it.each` row = one Vitest test. 73 rows + 1 prefix scan = **74 tests**. Root total **67 + 74 = 141**.

cwd is the package named in the path. Preset is that layer.

| # | filePath under package | code (trimmed) | rule |
| --- | --- | --- | --- |
| 1 | `packages/contracts/src/x.ts` | `import type { X } from '@ap/kernel'` | F `no-restricted-imports` |
| 2 | same | `import type { ReactNode } from 'react'` | F |
| 3 | same | `export const n = 1` | A |
| 4 | `packages/ui/src/x.ts` | `import { x } from '@ap/contracts'` | F |
| 5 | same | `import * as React from 'react'` | A |
| 6 | same | `import { cn } from './utils/cn'` | A |
| 7 | `packages/kernel/src/x.ts` | `import { x } from '@ap/shell'` | F |
| 8 | same | `import { x } from '@ap/mock-server'` | F |
| 9 | same | `import { x } from '@ap/menu-home'` | F |
| 10 | same | `import { x } from '@ap/contracts'` | A |
| 11 | same | `import { x } from '@ap/contracts/src/url'` | F |
| 12 | `packages/components/src/x.ts` | `import { x } from '@ap/shell'` | F |
| 13 | same | `import { x } from '@ap/kernel'` | A |
| 14 | same | `import { cn } from '@ap/ui'` | A |
| 15 | `packages/shell/src/x.ts` | `import { x } from '@ap/mock-server'` | F |
| 16 | same | `import { x } from '@ap/components'` | A |
| 17 | `packages/mock-server/src/x.ts` | `import { x } from '@ap/kernel'` | F |
| 18 | same | `import type { X } from 'react'` | F |
| 19 | same | `import { x } from '@ap/contracts'` | A |
| 20 | `menus/home/src/pages/x.tsx` | `import { x } from '@ap/menu-equipment'` | F |
| 21 | same | `import { x } from '@ap/shell'` | F |
| 22 | same | `import { x } from '@ap/mock-server'` | F |
| 23 | `menus/home/src/api.test.ts` | `import { x } from '@ap/mock-server'` | F |
| 24 | `menus/home/src/api.ts` | `import { x } from '@ap/mock-server'` | A |
| 25 | same | `export { serve } from '@ap/mock-server'` | A |
| 26 | `menus/home/src/pages/x.tsx` | `import { x } from '@ap/components'` | A |
| 27 | same | `import { serve } from '../api'` | A |
| 28 | same | `import '@ap/ui/styles.css'` | F |
| 29 | `apps/platform-web/src/menus.ts` | `import { x } from '@ap/mock-server'` | F |
| 30 | `apps/platform-web/src/url-contract.test.ts` | same | F |
| 31 | `apps/platform-web/src/return-to.test.ts` | same | F |
| 32 | `apps/platform-web/src/main.tsx` | same | A |
| 33 | `apps/platform-web/src/dev/DevTools.tsx` | same | A |
| 34 | `apps/platform-web/src/published-metrics.test.ts` | same | A |
| 35 | `apps/platform-web/src/menus.ts` | `import { x } from '@ap/menu-home'` | A |
| 36 | same | `import { x } from '@ap/menu-home/src/index'` | F |
| 37 | `menus/home/src/pages/x.tsx` | `import { x } from '../../../../packages/contracts/src/url'` | F `ap/no-relative-package-escape` |
| 38 | `menus/home/src/index.ts` | `import { x } from '../equipment/src/index'` | F same |
| 39 | `menus/home/src/pages/x.tsx` | `import { x } from '../api'` | A |
| 40 | `packages/kernel/src/platform.tsx` | `import { x } from './registry'` | A |
| 41 | same | `import('../../menus/home/src/index')` | F escape |
| 42 | `menus/home/src/pages/x.tsx` | `<a href="/equipment?v=1" />` | F syntax query |
| 43 | same | `<a href={'/equipment?v=1&scopeId=ICH'} />` | F |
| 44 | same | `` <a href={`/equipment?v=${id}`} /> `` | F |
| 45 | same | `<a href={'/equipment' + '?' + 'v=1'} />` | F |
| 46 | same | `navigate('/equipment?v=1')` | F |
| 47 | same | `` navigate(`/equipment?v=${id}`) `` | F |
| 48 | same | `<a href={linkTo('home')} />` | A |
| 49 | same | `<a href={r.url} />` | A |
| 50 | same | `<a href="/equipment" />` | A |
| 51 | same | `const label = 'Roles & access'` | A |
| 52 | same | `navigate(linkTo('home'))` | A |
| 53 | same | `const u = '/equipment?v=1'; <a href={u} />` | A gap |
| 54 | `packages/contracts/src/x.ts` | `export const q = '?' + params.toString()` | A (rule off) |
| 55 | `packages/kernel/src/x.ts` | `navigate(pathname + buildQuery(global))` | A |
| 56 | `menus/home/src/pages/x.tsx` | `sessionStorage.getItem('k')` | F `no-restricted-globals` |
| 57 | same | `localStorage.setItem('k', 'v')` | F globals |
| 58 | same | `window.sessionStorage.getItem('k')` | F syntax storage |
| 59 | same | `globalThis.localStorage.setItem('k', 'v')` | F syntax storage |
| 60 | `packages/kernel/src/x.ts` | `localStorage.setItem('k', 'v')` | A |
| 61 | `packages/shell/src/x.ts` | `localStorage.getItem('k')` | A |
| 62 | `packages/components/src/x.ts` | `localStorage.setItem('k', 'v')` | A |
| 63 | `packages/mock-server/src/x.ts` | `localStorage.getItem('k')` | A |
| 64 | `menus/home/src/pages/x.tsx` | `window.location.href = '/x'` | F syntax location |
| 65 | same | `window.location.assign('/x')` | F |
| 66 | same | `window.location.replace('/x')` | F |
| 67 | same | `location.href = '/x'` | F |
| 68 | same | `window.location = '/x'` | F |
| 69 | same | `void window.location.origin` | A |
| 70 | same | `anchor.replace('T', ' ')` | A |
| 71 | same | `a.href = URL.createObjectURL(blob)` | A |
| 72 | `packages/kernel/src/x.ts` | `window.history.replaceState(null, '', next)` | A |
| 73 | `menus/home/src/pages/x.tsx` | `window?.location?.assign('/x')` | A gap |

74. Read `tooling/eslint/src/**/*.js` except `prefix.js`. Fail if `@ap/` occurs.

JSX rows need enough parseable TSX (`const id = 'a'; const blob = new Blob(); …`). No React import required.

## 5. Grep inventory (workspace TS/TSX, not prototypes)

| Hit | Decision |
| --- | --- |
| `menus/home/src/pages/OperationsHome.tsx:14,44` `sessionStorage` | **F1. Fix.** Not an allowlist. |
| `menus/metrics/src/pages/MetricDetail.tsx:80` `window.location.origin` | Read for clipboard. Allowed. |
| `packages/shell/src/GlobalContextBar.tsx:37` same read | Shell. Allowed. |
| `packages/kernel/src/platform.tsx:66,97` `window.location.pathname/search`; `:132` `history.pushState/replaceState`; `:60,63` `localStorage` | Kernel owns URL and session prefs. Allowed. |
| `packages/kernel/src/i18n.tsx:110,118` `localStorage` | Locale. Allowed. |
| `packages/kernel/src/adapter.test.tsx:57,86-87` `localStorage` stub | Kernel test. Allowed. |
| `packages/shell/src/Sidebar.tsx:9,22`, `AppShell.tsx:15,17` `localStorage` | Chrome prefs. Allowed. |
| `packages/components/src/PlatformDataTable.tsx:19,95` `localStorage` | Table prefs. Allowed. |
| `packages/mock-server/src/server.ts:15,24`, `test-setup.ts:4` `localStorage` | Role key `platform:role`. Allowed. |
| `packages/contracts/src/url.ts:184` `'?' + params` | Codec. Not a menu href. Allowed. |
| `apps/platform-web/src/dev/DevTools.tsx:59-66` literal `?`/`&` URLs | App dev probes via `navigate(l.url)`. Not menu syntax. Allowed. |
| `apps/platform-web/src/url-contract.test.ts`, `return-to.test.ts` | `parseQuery` / `safeReturnTo` fixtures. Allowed. Not mock-server importers. |
| Menu `linkTo` / `returnTarget` / `href={r.url}` | No hand-built query literal. Allowed. |
| Download `a.href =` in cycle drilldown, equipment `data.ts`, metric catalog | Not `location.href`. Allowed. |
| `@ap/mock-server` imports | Only the four `menus/*/src/api.ts`, `main.tsx`, `src/dev/DevTools.tsx`, `published-metrics.test.ts`. Matches the carve-outs. |
| Cross-menu and `@ap/*/src` | None in apps/packages/menus. |

No second finding.

## 6. Docs (wording, not a rewrite)

- `tooling/AGENTS.md`: move `eslint/` from 계획 to 현재 (`@ap/eslint-config`, boundaries only). Leave `gen-menu/` under 계획. Verification adds `pnpm lint`.
- `packages/AGENTS.md`, `menus/AGENTS.md`, `apps/platform-web/AGENTS.md`: verification line becomes `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Menus: one sentence that `src/api.ts` is the only mock-server file and tests are not exempt. App: one sentence that lint allows mock-server only in `main.tsx`, `src/dev/`, `published-metrics.test.ts` (D2).
- `docs/integration/platform-packages.md`: banner — 6a done, 6b left. §6 boundary row: point at `@ap/eslint-config` and per-package presets (this file). §7 item 6 split into 6a (this PR) and 6b (generator). Do not mark 6b done.
- `docs/INDEX.md:83`: "6a boundary lint done; 6b generator left."
- Root `AGENTS.md` code principles: add `pnpm lint` beside `pnpm typecheck` / `test` / `build` in the workspace sentence and the "변경마다" sentence.
- `packages/mock-server/AGENTS.md` already names the app test. No edit.

## 7. 6b must emit (do not implement)

For a new `menus/<group>`: `eslint.config.js` as `export { menu as default } from '@ap/eslint-config'`; `"lint": "eslint ."`; devDependencies `@ap/eslint-config` and `eslint@^10.11.0`. No allowlist edit. Template `src/index.ts` may import `@ap/contracts` and `@ap/kernel` only. `src/api.ts` is the only file that may import `@ap/mock-server`. No `sessionStorage`, no query-string `href`, no `window.location` writes.

## 8. Acceptance

From the repo root, Node 26.7.0: `pnpm install`, `pnpm lint` (0 errors, 0 warnings), `pnpm typecheck`, `pnpm test` (141), `pnpm build`.

Manual negative, then revert: in `menus/home/src/pages/OperationsHome.tsx` add `import { x } from '@ap/shell'`. `pnpm --filter @ap/menu-home lint` fails with `no-restricted-imports`. `pnpm --filter @ap/eslint-config test` is the committed negative.

## Open

Only F1's product effect: reload no longer remembers a dismissed notice. Default above is in-memory state. Do not implement a kernel store or an allowlist unless the coordinator overrides this design.
