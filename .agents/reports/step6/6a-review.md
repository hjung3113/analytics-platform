# Step 6a review — PR #29

Reviewed `origin/main...HEAD` on `hjung3113/step6a-boundary-lint`:

- HEAD: `03be4c0d195a9b60c60e3c9d3e55b1993986ded4`
- Local origin/main: `da5d4d36be362794df5a50c64ae39a4a01555459`
- Authority: `docs/integration/platform-packages.md` §3 rules 1–6, §6, §8; implementation design `.agents/reports/step6/6a-design.md`.
- Source remained read-only. No fetch, commit, push, or external review submission. This report is the only authored workspace file.

**Verdict: changes requested.** One P1 and two P2 findings; two documentation nits. No P0. Most implementation matches the design, but the design itself has an import-coverage omission, an overbroad URL selector, and an incorrect dismissal-lifetime assumption.

## F1 — P1: Literal dynamic imports bypass the package boundary

**Location:** `tooling/eslint/src/index.js:153`; related `tooling/eslint/src/relative-escape.js:77`.

`no-restricted-imports` handles static imports/re-exports, but the only additional import visitor checks relative paths. Consequently these parseable probes return **zero messages**:

```ts
// menus/home/src/api.test.ts — mock-server is already a dependency of this package
const mock = await import('@ap/mock-server');
// packages/kernel/src/x.ts
await import('@ap/shell');
// packages/contracts/src/x.ts
 type X = import('react').ReactNode;
```

The first is a realistic test setup pattern and directly defeats rules 3 and 6 without aliasing, dataflow, or unusual syntax. Lazy imports can likewise reverse a layer dependency. `TSImportType` escapes the promised type-level boundary; `types: []` prevents ambient inclusion, not explicit imported types when a module is resolvable. These gaps are not listed among the design's accepted optional-chain/dataflow gaps.

**Suggested fix:** apply the same layer/deep-subpath/React restrictions and precise api/app carve-outs to literal `ImportExpression` and `TSImportType` sources, sharing the restriction data to prevent drift. Also handle ordinary literal `require(...)` calls, or explicitly ban that form in this ESM workspace. Do not globally ban dynamic import: legitimate menu `lazy(() => import('./pages/X'))` must remain legal.

**Regression fixture:** yes. Add the three examples above as negative rows, permitted dynamic `@ap/contracts` and relative lazy imports as positive rows, and dynamic mock-server imports in `src/api.ts` / app carve-outs as positive rows. Include a dynamic deep-subpath negative inside each carve-out.

**Related require result:** `require('@ap/mock-server')` and `require('../../../../../packages/contracts/src/url')` also return zero messages. This is lower immediate browser risk because ordinary `require` is not an ESM browser primitive and may fail typecheck/runtime, but it is a real lint omission in Node-enabled tests/tooling. By contrast TypeScript `import mock = require('@ap/mock-server')` is already rejected by the installed core rule. Do not conflate these forms.

## F2 — P2: Query selectors reject ordinary data passed through the approved URL builder

**Location:** `tooling/eslint/src/index.js:102` and `:110` (also the template/member variants through line 123).

The descendant selectors examine every literal anywhere beneath an href/navigate expression. They cannot distinguish hand-built URLs from values encoded by `linkTo`, or from unrelated localized UI text evaluated inside the argument. All of these produce `no-restricted-syntax`:

```tsx
navigate(linkTo('home', { page: { q: '왜?' } }));
<a href={linkTo('home', { page: { q: 'R&D' } })} />;
navigate(confirm('이동할까요?') ? linkTo('home') : linkTo('equipment'));
```

`LinkOptions.page` is a `Record<string, string>` (`packages/kernel/src/platform.tsx:15`), so punctuation in builder input is legitimate; the builder is responsible for encoding it. The confirm example requires no new route parameter contract and demonstrates the i18n false positive directly. Ordinary `const label = '왜?'` outside those ancestors correctly passes.

**Suggested fix:** inspect the expressions that actually construct the URL, exempt arguments/data underneath the approved builder calls, and avoid descending into condition tests or unrelated nested call arguments. Preserve negative coverage for direct string literals, templates, and concatenated URL strings. This needs a design correction as well as an implementation change; the current code faithfully implements the overbroad selectors in the design.

**Regression fixture:** yes. Make the examples above positive rows (use a registered searchable destination for any runtime test); retain the existing direct URL negatives.

## F3 — P2: Dismissal now lasts only until the home page unmounts

**Location:** `menus/home/src/pages/OperationsHome.tsx:18`, `:41–42`; inaccurate design statement `.agents/reports/step6/6a-design.md:23`.

Concrete scenario: open home with an ICH notice, dismiss it, navigate to another menu, then return home within the same SPA session. The notice reappears because `dismissed` is component-local state initialized to `[]`. `packages/shell/src/RouteOutlet.tsx:29–31` renders the selected page type with a menu-specific key, so leaving home unmounts this state. Previously sessionStorage preserved it across that transition.

This is more than the explicitly accepted loss on reload. The design says “Dismiss still lasts for the SPA session,” but the component state does not. The unchanged Korean/English accessible label (“이번 세션 동안 닫기” / “Dismiss for this session”) is inaccurate. The authoritative wireframe also explicitly decides session persistence (`docs/08_operations_overview_wireframe.md:86`, `:110`, `:132`), and describes home as a frequently revisited anchor rather than a permanently mounted page.

**Suggested fix:** resolve the design conflict before merging. Preserve dismissal for the intended session using state whose lifetime survives route unmounting and whose ownership respects the storage boundary; no direct menu storage allowlist. If the intended product behavior is instead mount-only dismissal, explicitly approve that contract change and update both the label and wireframe/design. A copy-only change would not satisfy the current Decided contract. This review does not authorize a new kernel store or decide reload/login semantics.

**Regression fixture:** an ESLint row cannot demonstrate runtime lifetime. Add a component/integration regression that dismisses a notice, navigates away, returns, and asserts the notice remains absent in the same session. Source tracing establishes the reset; browser/component execution was not performed in this read-only review.

## Requested hole matrix and acceptable limits

The probes used actual installed ESLint and presets, with package-root cwd and absolute virtual TS/TSX filenames; no repository fixture files were added.

| Probe | Observed result | Assessment |
| --- | --- | --- |
| `export * from '@ap/shell'` in kernel | Rejected | No findings |
| `export type { X } from '@ap/shell'` in kernel | Rejected | No findings |
| Static/type re-export of mock-server in menu page or test | Rejected | No findings |
| Literal `import('@ap/mock-server')` in menu test | Allowed | Real gap, F1 |
| `type X = import('react').ReactNode` in contracts | Allowed | Real gap, F1 |
| Ordinary literal `require` | Allowed | F1; lower immediate risk in browser ESM |
| TS `import x = require(...)` | Rejected | No findings |
| Nested-directory relative escape via static export or string dynamic import | Rejected | No findings; lexical owner-root resolution works |
| Relative require escape | Allowed | F1 |
| `src/data/api.ts` static mock-server import | Rejected | Correct: only exact `src/api.ts` is exempt |
| `window?.location?.assign('/x')` | Allowed | Explicit accepted design gap; not a new blocker |
| `window['sessionStorage'].getItem('x')` | Allowed | Computed-access limitation; treat as documented syntax scope, not complete storage enforcement |
| `window.location['assign']('/x')` | Allowed | Computed-location limitation, consistent with design's non-computed scope |
| `globalThis.location.href = '/x'` | Allowed | Residual scope gap: equivalent navigation outside the named window/bare-location selectors; document or add a targeted selector, no dataflow analysis needed |
| `window?.sessionStorage.getItem('x')` | Rejected | Optional chaining is not a universal storage escape |
| URL assembled in a variable before `href={u}` | Allowed | Explicit accepted dataflow gap |

Computed/static-property forms and `globalThis.location` remain genuine ways to violate the underlying contract; accepting this bounded syntax lint is a tooling coverage decision, not permission for consumer code to use them. No blanket hardening of aliases, symlinks, or dataflow is requested here. Relative resolution is intentionally lexical; nonliteral/template dynamic sources are outside the literal-source visitor.

## Config, integration, and cache — no findings

- **Flat-config cascade:** `src/api.ts` swaps only `no-restricted-imports`; `importRestrictions(...)` includes `deepSubpathBan` again. A combined api probe reports both the forbidden `@ap/mock-server/src/server` import and sessionStorage use, demonstrating that deep-import and contract rules survive. App `src/main.tsx` and nested `src/dev/...` also reject the deep subpath. The app's allowed mock entry does not open its internals.
- **Globs/cwd:** consumers export the right shared preset and run `eslint .` in their own package via Turbo/pnpm. Exact `src/api.ts` and app carve-out paths work there; nested `api.ts` and `api.test.ts` do not accidentally match. Arbitrary root-level ESLint invocation is not the supported entrypoint; there is deliberately no root config.
- **Turbo:** `turbo.json:5` has `dependsOn: ["^lint"]`; every consumer declares `@ap/eslint-config` as a workspace devDependency, and that package has its own lint task. Live dry-run output includes config sources in `@ap/eslint-config#lint` inputs and that task among consumer dependencies. In a `/tmp` source mirror, appending only a comment to `tooling/eslint/src/index.js` changed the hashes of all 15 actual lint tasks, including home (`7d5a3ab32be53b76` → `1ffe889ddaad684a`). An additional consumer `$TURBO_ROOT$/tooling/eslint/**` input is unnecessary for this graph. No source was edited in the real worktree for that experiment.
- **CI:** frozen install → lint → typecheck → test → build within the existing platform-workspace job. Correct order, no new job, Node version retained.
- **Prefix:** runtime pattern/message construction derives from `src/prefix.js`; 74-test suite includes the JS literal scan. Package/dependency/import strings and test samples are the intended exceptions.
- **Comment conversions:** the three components changes are comment-only and remove directives for an uninstalled react-hooks rule. They do not change hook dependencies or runtime behavior. No findings within this PR's scope.

## Fixture validity — no findings

`tooling/eslint/src/boundaries.test.ts:150–163` requires at least one matching rule/message and then requires every message to have the expected ruleId. A fatal parse error has no matching ruleId and fails these assertions; it cannot make a forbidden case pass vacuously. Allowed rows require exactly `[]`, so parse and ignored-file diagnostics fail them too. The mapped package cwd and TS/TSX extensions activate the presets for all existing rows. All 74 tests actually ran and passed.

The missing forms in F1 and F2 are coverage omissions, not vacuous success in existing rows. The helper's `results[0]?.messages ?? []` is unnecessary defensive fallback, but normal `lintText` behavior for the supplied paths does not produce a demonstrated empty-result success. No finding based on that hypothetical alone.

## Documentation accuracy

- **F3 applies to design line 23:** “SPA session” lifetime is false. Correct it together with the behavior/contract decision.
- **nit — stale tool/CI description:** `docs/integration/platform-packages.md:148–150` still describes a separate “lint Job” and ESLint as “결정 필요” / a proposal, while §8 has decided ESLint and new §7 says the implementation uses a step in `platform-workspace`. This wording predates the PR, but the updated completion claim leaves the same document internally inconsistent. Fix those two descriptions in the docs follow-up; no runtime regression fixture applies.
- **nit — package count:** `.agents/reports/step6/6a-design.md:93` says “15 consumers + this package.” Actual opt-in is 14 consumers (6 platform packages, 7 menus, 1 app) plus eslint-config = 15 lint tasks. The 16th workspace package is source-free tsconfig, with no lint script. Correct the count; a manifest-inventory assertion could demonstrate it, but a fixture row cannot and a new test is unnecessary.
- Updated AGENTS/INDEX completion language otherwise matches the delivered structure and leaves 6b unfinished. Broad claims of full import enforcement should be read with F1 unresolved and the explicitly bounded syntax limitations above.

## Verification performed and limits

- `pnpm --filter @ap/eslint-config test`: **74 passed**.
- `pnpm exec turbo run lint --force`: **15/15 tasks passed**, zero cached tasks; no errors/warnings reported by ESLint.
- 24 additional read-only `ESLint.lintText` probes: results summarized above; temporary script/output at `/tmp/6a-review-probes.mjs` and `/tmp/6a-review-probes.jsonl`.
- `pnpm exec turbo run lint --dry=json`: live graph inspected; `/tmp/6a-turbo-dry.json`.
- Cache mutation experiment restricted to `/tmp/6a-cache-review-o2oc4dtb`, using Turbo 2.11.4. Mirror emitted a local-install warning, but used the same installed binary version and package/lock/config source graph; both snapshots were taken in that same mirror.
- Full typecheck, full workspace tests, build, and rendered/browser behavior were **not rerun**. No claim of those gates or live CI acceptance is made. The narrow executed checks are sufficient to reproduce the lint findings; F3 is source/lifecycle evidence, not a browser observation.
