# Step 6a re-review — latest fix commit

Reviewed `git show HEAD`: `ab7eccf24732173143ac9b316be46ed4609c36af`, against parent `03be4c0d195a9b60c60e3c9d3e55b1993986ded4` and the findings in `6a-review.md`. Source remained read-only; this is the only authored workspace file.

**Verdict: changes requested for two P2 coverage issues below.** All original concrete bypass/false-positive probes now behave as requested, and the dismissal remount test passes. The replacement URL rule introduces three reproducible false negatives; the import fix leaves relative type-import syntax uncovered. No new P0/P1 finding.

## Original findings

| Finding | Status | Evidence |
| --- | --- | --- |
| F1 — dynamic import / import type / ordinary require bypass | **Partially fixed** | All original examples are now rejected, including the menu test's `import('@ap/mock-server')`, kernel `import('@ap/shell')`, contracts `import('react').ReactNode`, and relative `require` escape. Package-qualified type imports are covered, but relative `TSImportType` escapes remain unvisited: N2 below. |
| F2 — punctuation in builder data / localized text incorrectly rejected | **Fixed** | All three original `linkTo`/confirm cases now return zero diagnostics, including `q: '왜?'`, `q: 'R&D'`, and `confirm('이동할까요?')`. Direct literals, ordinary templates, concatenation, conditional arms, `as` expressions, and logical right-hand targets retain negative coverage. New URL-expression regressions are recorded separately as N1. |
| F3 — dismiss reset on leaving and returning home | **Fixed for the agreed SPA lifetime** | OperationsHome now uses the module store; `dismissed-notices.test.tsx` actually unmounts the first hook and remounts another, observing the dismissal. Immutable snapshot replacement, subscription cleanup, and duplicate suppression are sound for this use. It uses no browser storage. |
| Doc nit — stale CI Job / undecided ESLint wording | **Fixed** | `docs/integration/platform-packages.md:148–150` now says the lint step belongs to `platform-workspace`, calls ESLint Decided, and documents bounded syntax coverage. |
| Doc nit — 15 consumers plus config count | **Fixed** | Design line 93 now says 14 consumers plus config = 15 lint tasks; live forced lint executes exactly 15 tasks. |

F3's scope is precise: module state survives route changes, while a page reload resets it, as already accepted in the task design. The store does not observe authentication lifecycle or reset on an in-place login; its comment's “new login” claim is therefore not independently established. No login/logout flow was added here, so this is not presented as a newly demonstrated runtime regression. Do not generalize the passing remount test into proof of authentication-session semantics or browser-tab persistence.

## N1 — P2: URL expression traversal skips values that become the URL

**Locations:** `tooling/eslint/src/hand-built-url.js:20–28`, `:40–46`.

All three examples produce **zero messages at HEAD**, while running the same probes with the parent commit's config produces the expected query-string restriction:

```tsx
navigate((preferred ? '/equipment?x=1' : null) ?? linkTo('home'));
navigate(`/equipment${ok ? "?x=1" : ""}`);
navigate('/equipment?x=1' satisfies string);
```

These are direct expression-local constructions, not the deliberately accepted variable/dataflow or computed-member gaps:

- The left side of `??` or `||` can be the returned URL. Treating every logical left side as “not part of the URL” loses real target values.
- Template substitutions are raw string interpolation; JavaScript does not encode them. The comment that these expressions are “values the builder encodes” is incorrect for an ordinary template literal. A conditional query suffix is a realistic direct URL construction.
- `TSSatisfiesExpression` preserves the underlying value, just like the already-supported `TSAsExpression`; the default switch arm silently drops it.

**Suggested fix:** walk both value-producing sides of `??`/`||`, retaining the deliberate condition-only treatment of an `&&` left operand; recursively inspect template expressions with the same URL-expression walker; unwrap `TSSatisfiesExpression` (and the equivalent angle-bracket type assertion where TS syntax allows it). Keep approved builder calls as traversal stops so F2 stays fixed. This does not require alias resolution or dataflow analysis.

**Regression rows:** add the three examples as forbidden `ap/no-hand-built-url` fixtures. Add positive builder-containing templates and punctuated condition text to ensure the fix does not restore the original false positives.

## N2 — P2: Relative import types bypass both source rules

**Locations:** `tooling/eslint/src/import-source.js:64–66` and `tooling/eslint/src/relative-escape.js:91–96`.

At `menus/home/src/pages/x.tsx`, this resolves directly outside the menu into mock-server internals and returns **zero diagnostics**:

```ts
type X = typeof import('../../../../packages/mock-server/src/index');
```

The new source rule visits `TSImportType` but intentionally delegates relative paths to the relative-escape rule. That rule does not register `TSImportType`, so neither rule handles the source. This undermines the type-level boundary despite F1's package-qualified type-import example being fixed. The parent config also passed this example: it is a newly identified residual omission, not a regression introduced by this commit.

**Suggested fix:** add a `TSImportType` visitor to the relative rule, normalize its source (`source` / `argument` as appropriate for the parser) through the same literal/path handling, and preserve allowed relative imports within the package. Use the existing root-resolution logic rather than new path patterns.

**Regression rows:** the escaping example must fail with `ap/no-relative-package-escape`; `type X = typeof import('../api')` in the same page must pass.

Related result: `import x = require('../../../../packages/mock-server/src/index')` also passes because it is `TSImportEqualsDeclaration`/`TSExternalModuleReference`, not an ordinary CallExpression. It also passed the parent config. Cover that form alongside the visitor fix if supported; its immediate runtime relevance is lower in this ESNext workspace, where TypeScript can reject import-assignment syntax independently. The ordinary relative `require(...)` case specifically added in this commit now works correctly.

## Additional scope and regression checks

- All **24 original probes** were rerun from `/tmp/6a-review-probes.mjs` against HEAD, with output at `/tmp/6a-rereview-original.jsonl`.
- All original static `export *` / type re-export negatives remain rejected. Menu `src/api.test.ts` and nested `src/data/api.ts` remain outside the carve-out.
- Static deep imports remain rejected in menu api and app main/dev carve-outs. New fixture rows and extra probes confirm dynamic/require deep imports remain rejected there too, while allowed mock-server entry imports/type imports pass.
- Relative nested export/import/ordinary-require escapes are rejected. In-package imports remain allowed.
- `globalThis.location.href = ...` is now rejected, closing the previously noted residual gap.
- Previously accepted optional location calls and computed storage/location members remain gaps. The document now acknowledges these syntax limitations; they are not promoted to new blockers.
- ``import(`@ap/mock-server`)`` still passes because its source is a TemplateLiteral, not Literal. This is a pre-existing restriction of the literal-only implementation and the prior report's acknowledged template/nonliteral scope. No dynamic evaluation hardening is requested in this re-review.
- The source-rule options and api/app overrides preserve both import restrictions. No new cascade/config issue found.
- Fixture assertions still reject parse errors instead of passing vacuously. The new positive rows return genuinely empty diagnostics.
- The dismissal test verifies the hook's remount lifetime rather than a full routed UI, but OperationsHome's direct hook/dismiss wiring supports the claimed narrow fix. No browser behavior was observed.

## Documentation follow-up — nit

**Location:** `.agents/reports/step6/6a-design.md:10`, `:23`, `:117`, `:239`.

The two requested nits are fixed, but the partially amended design still says there is only one local rule, directs `useState<string[]>([])`, says home has no test, and specifies the old 74/141 test counts. The implementation now has three local rules, the hook store, 91 ESLint tests, and the new home test. Because this file is still used as the design reference and received current corrections, label the old sections as historical/superseded or update the affected rule/test descriptions. No runtime fixture is needed; this is documentation consistency, not a blocking functional finding.

## Verification

- `pnpm --filter @ap/eslint-config --filter @ap/menu-home test`: **91 ESLint tests + 1 home test passed**.
- `pnpm --filter @ap/eslint-config --filter @ap/menu-home typecheck`: **both passed**.
- `pnpm exec turbo run lint --force`: **15/15 tasks passed, 0 cached**; log `/tmp/6a-rereview-lint.log`.
- 24 original probes and 14 additional probes executed against HEAD. Additional script/output: `/tmp/6a-rereview-new.mjs`, `/tmp/6a-rereview-new.jsonl`.
- The same 14 extra probes ran against parent config files copied only under `/tmp`; comparison output `/tmp/6a-rereview-parent.jsonl`. This independently confirms N1 is introduced by the new walker and N2 predates the fix.
- Full workspace typecheck/tests, build, and rendered/browser checks were not rerun. No source edits, commits, pushes, or external submissions were made.
