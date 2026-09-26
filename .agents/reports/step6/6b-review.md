# Step 6b review

Reviewed `origin/main...HEAD`, branch `hjung3113/step6b-gen-menu`, HEAD `34ebdcad3bcca92614d0a52370d91b18389fed64`, on 2026-09-27. Source is unchanged; this report is the only workspace edit. D1 is preserved: humans add `GroupId` and `GROUPS`; the generator must not add sidebar groups.

**Verdict: changes requested.** No P0. Two P1 findings and seven P2 findings below, plus two nits. The ordinary skeleton respects the 6a import boundaries, but successful generation does not currently guarantee a passing workspace or safe reversal.

## Verification and evidence boundary

- Before review, Git status was clean. Existing-tree `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all passed: respectively 16/16, 16/16, 23/23, and 1/1 Turbo tasks. Most lint/typecheck/test tasks were cached; build was not. Logs: `/tmp/step6b-review-{lint,typecheck,test,build}.log`.
- Ran actual CLI generation/removal with explicit `--root` against temporary fixtures. The reproductions cited below are under `/tmp`. **Execution deviation:** the first fixture batch used the repository helper's default macOS `os.tmpdir()` (`/var/folders/.../T`) before I noticed that it was not `/tmp`; I repeated those cases with `TMPDIR=/tmp`. No generator invocation targeted this worktree, and no existing user data was used in those temporary fixtures.
- Copied real app wiring, contracts menu union, existing menu indexes, and the generator package into `/tmp/6b-real-ioejalud`; manually added `reviewDemo` to the union and GROUPS; CLI generation returned 0. Generator tests against that copy returned **4 failed / 26 passed**. Used `pnpm --config.verify-deps-before-run=false test` to reuse installed tooling; the initial plain `pnpm test` attempted pnpm's dependency verification and stopped because this deliberately partial copy lacks other workspace packages. The successful test invocation, not that setup failure, establishes F1/F2. Log: `/tmp/step6b-review-generated-tests.log`.
- Did **not** run `scripts/probe.ts`, install a generated package in the source worktree, or run a full generated-workspace build. No browser/UI verification was needed for this source review. Probe findings are static control-flow analysis, explicitly distinguished from executed reproductions.

## Findings

### F1 — P1: ordinary use of the generator makes the required test gate fail

**Locations:** `tooling/gen-menu/src/repo.test.ts:33`, `:39`, `:46`, `:72`; masking workaround at `tooling/gen-menu/scripts/probe.ts:97`.

After following D1 and generating any genuinely new group, these tests still require exactly seven spreads/groups/union members and exactly four CSS imports. They read the working filesystem, despite being named “committed wiring locks.” Thus a correctly retained new menu cannot pass root `pnpm test`. The probe explicitly excludes this entire package while the generated menu exists, and only tests it after removing the menu, so it cannot establish the advertised full gate for future consumers.

**Reproduced:** `reviewDemo` in `/tmp/6b-real-ioejalud`: spread, union and CSS locks fail; a fourth failure is F2. The failure does not depend on using the reserved probe name.

**Fix:** assert extensible invariants against actual declarations (matching union/GROUPS/ownership/wiring, unique entries and valid marker placement). Move exact historical-byte preservation checks to before/after temporary-fixture tests. Run the generator tests while the generated consumer is present instead of excluding them.

**Regression:** yes; retain a non-probe new group in a real-wiring fixture and run the complete generator suite. This is a design defect in §4's fixed locks as well as an implementation defect; keep D1, revise the lock design.

### F2 — P2: dependency insertion compares an absolute line offset to a block length

**Location:** `tooling/gen-menu/src/generate.ts:119`.

`at` starts at the first menu dependency's file line index, but the loop checks `at < menuIdx.length`. In the real app, the block starts after line 17 and contains seven entries, so the loop never runs. Every new dependency is inserted before `menu-admin`, regardless of its name. This violates the explicit lexicographic insertion contract and its own real-repo test.

**Reproduced:** real package.json with `genProbe` puts `menu-gen-probe` before `menu-admin` (`/tmp/gen-menu-test-ldDshp`). `reviewDemo` produces the fourth failing test above. JSON remains valid; the defect is ordering and the resulting test failure.

**Fix:** iterate through the actual `menuIdx` entries, or compare the absolute index to `last`; include the terminal dependency case rather than assuming every existing entry ends with a comma.

**Regression:** yes; copy the actual app dependency block with its preceding lines, and insert before, within, and after the block. The current tiny fixture generates `gen-probe` before `home`, accidentally expecting the very first slot and missing the bug.

### F3 — P1: rollback aborts on the same write failure and leaves a partial package

**Locations:** `tooling/gen-menu/src/remove.ts:41-47`; caller `tooling/gen-menu/src/cli.ts:106-110`.

Rollback reads and rewrites every app file even when it was never changed. If generation fails writing `style.css`, rollback restores `menus.ts`, retries the same unwritable CSS, throws, and never reaches package deletion. On retry the remaining package causes “already owned”; `--remove` refuses because the app inserts are missing. A failure during package creation can also prevent cleanup because rollback needlessly touches unrelated unwritable app files. A partial/truncated write has no saved original bytes to restore.

**Reproduced:** chmod only the temporary fixture's CSS to `0444`, generate, observe exit 1/EACCES and a surviving `menus/gen-probe` (`/tmp/gen-menu-test-O68O3n`). Restored the temporary file's permissions afterward.

**Fix:** capture original bytes before mutation; stage writes, track only completed mutations, and independently attempt every cleanup action so one failure does not suppress the rest. Preserve the original error and report any unrecovered paths. Do not claim full rollback unless verified.

**Regression:** yes; inject a failure at each package/app write and each rollback write. Assert exact app bytes and package absence where restoration is possible, and explicit residual-state reporting otherwise.

### F4 — P2: removal finds a substring globally, then deletes the first exact line globally

**Locations:** `tooling/gen-menu/src/remove.ts:87-90`, `:117-122`; `tooling/gen-menu/src/generate.ts:125-130`.

The ownership check is `includes(ins.line)` anywhere in the file, whereas deletion uses the first exact matching line anywhere. Neither operation is constrained to the generator marker region. A human's identical line earlier in a block comment is deleted instead of the generated CSS import; the generated import remains, but the package is deleted, breaking the next build. Alternatively, adding indentation to an insert passes `includes` but causes `removeLine` to do nothing, again leaving wiring to a deleted package. The same helper also affects rollback.

**Reproduced:** prepend a valid CSS block comment containing the identical import, then remove. Exit 0, human comment content removed, actual marked CSS import retained, package deleted (`/tmp/gen-menu-test-TxKAQ6`).

**Fix:** require exactly one expected full line inside its owned marker range and remove only that occurrence. For package.json, identify the dependency property structurally with a byte-preserving edit. Refuse ambiguous/edited state before any write.

**Regression:** yes; duplicate in a preceding comment, duplicate outside the owned block, indentation edits, and missing exact lines must preserve human content and either remove the actual owned line or refuse without changes.

### F5 — P2: valid CLI identifiers can generate invalid module bindings

**Locations:** `tooling/gen-menu/src/generate.ts:165-174`, `:243-245`; `tooling/gen-menu/src/templates.ts:113-117`.

Two concrete cases pass validation:

- New group `eval` (also `arguments`) creates `import { manifests as eval } ...`, forbidden in strict ES modules. The reserved-word table does not cover strict binding restrictions.
- `genProbe --menu platform-page` creates a page that imports `PlatformPage` and declares `function PlatformPage()` in the same scope. `--menu query-view` similarly collides with `QueryView`.

The app binding check also only recognizes existing `manifests as ...` imports, not other top-level declarations; e.g. new group `registry` conflicts with the app's existing exported `registry` binding.

**Reproduced:** CLI returns 0 for `eval` and `platform-page`; syntax checks report “Unexpected eval or arguments in strict mode” and “Identifier 'PlatformPage' has already been declared” (`/tmp/gen-menu-test-YvA00y`, `/tmp/gen-menu-test-vFbOIt`; the latter checked after TypeScript JSX transpilation).

**Fix:** use stable non-colliding page-local aliases/names, and validate or safely allocate app import bindings against all module bindings, including strict-mode restrictions.

**Regression:** yes; exercise `eval`, `arguments`, `registry`, `createRegistry`, `platform-page`, and `query-view`, then parse/typecheck generated modules. Do not only compare output to the same renderer.

### F6 — P2: collision checks depend on quote/spacing style and use a different route normalizer

**Locations:** `tooling/gen-menu/src/generate.ts:222-240`, `:49`; compare `packages/kernel/src/registry.ts:33-34`, `:63`.

Valid existing manifests using double-quoted strings (or `path : '...'`) are invisible to these regexes. A new menu can therefore duplicate an ID, claim an already-owned group, or collide with a route shape, while CLI exits 0. The generated manifest test only loads its own one-menu fixture and cannot catch the app-level conflict. Also, the kernel normalizes entire parameter segments and removes empty/trailing segments; `pathShape` only replaces alphanumeric parameter names and does not normalize slashes. Existing `/metrics/:metric_id` or `/metrics/` therefore has a different generator shape from the equivalent kernel route.

**Reproduced:** change only an existing fixture index's single quotes to double quotes; generate `/metrics/:other` against existing `/metrics/:metricId`; CLI returns 0 (`/tmp/gen-menu-test-wF0JS7`). Kernel source unambiguously rejects those identical shapes at registry construction.

**Fix:** parse static declarations independent of formatting (without executing menu modules) and mirror the kernel's route-shape semantics. Explicitly refuse unsupported declaration forms rather than silently treating them as no collisions.

**Regression:** yes; double quotes, whitespace variants, trailing slash, underscore parameter names, and duplicate primary ownership, with app-composed registry assertions. The design's textual scan describes the implementation but no menu or lint rule requires this exact formatting, so it does not make the missed collisions safe.

### F7 — P2: moved markers can produce syntactically broken app code with success status

**Locations:** `tooling/gen-menu/src/generate.ts:96-101`, `:201-206`, `:252-257`.

Marker validation only checks substring presence, and insertion targets the first matching trimmed line. It does not check uniqueness, pair ordering, or whether the spread marker remains inside `MENUS`. Move the closing spread marker below the closing `];` and generation appends `...genProbe,` as a top-level statement, returns 0, and leaves invalid TypeScript.

**Reproduced:** `/tmp/gen-menu-test-LG1kED`, generated tail is `...home,` / `];` / `...genProbe,` / closing marker.

**Fix:** validate unique, correctly ordered markers and their containing import/array/CSS context before planning edits; parse the proposed TypeScript before writing as an additional guard.

**Regression:** yes; move end markers outside containers, reverse pairs, duplicate markers, and put apparent markers inside comments; all invalid layouts must refuse without writes.

### F8 — P2: probe dirty-tree check fails open on Git errors and hidden untracked files

**Locations:** `tooling/gen-menu/scripts/probe.ts:25-27`, `:53-54`, `:75`, `:88`.

`gitPorcelain()` discards spawn errors, exit status and stderr; missing/unusable Git or repository access errors return empty stdout and are treated as a clean tree. It also does not force `--untracked-files=all`, so `status.showUntrackedFiles=no` can hide dirty untracked files. An existing untracked `apps/platform-web/src/gen-probe.test.ts` can then be overwritten and deleted by `finally`. A clean tracked file with that same name is likewise not protected by a path-existence preflight.

**Evidence:** static control-flow review only; probe was not executed. These cases reach unconditional `writeFileSync(PROBE_TEST, ...)` and `rmSync(PROBE_TEST)` without a saved original or ownership flag.

**Fix:** fail closed on any Git command failure; explicitly inspect untracked files; preflight every reserved probe path and refuse collisions. Track only files actually created by this run and restore saved originals for existing files.

**Regression:** yes; isolated Git fixtures with hidden untracked files, an existing tracked probe path, and mocked Git failure. Verify no mutation starts on refusal.

### F9 — P2: filesystem checks do not enforce a real-path workspace boundary

**Locations:** `tooling/gen-menu/src/generate.ts:228`, `:274-281`; `tooling/gen-menu/src/remove.ts:56`, `:121-122`.

Paths are checked lexically with `join`; symlink ancestors are followed. If `root/menus` points outside `root`, generation creates the package outside the requested workspace and `--remove` recursively deletes that external package. App file symlinks similarly direct wiring writes into an external file. This is a physical-boundary gap, not evidence that leaf symlinks cause recursive target deletion.

**Reproduced:** temporary `root/menus` symlink to `/tmp/6b-outside-Z5Ml6M/menus`; generation and removal both return 0, and the externally located generated directory is gone (`/tmp/gen-menu-test-aoeQjj`). All involved data was disposable test data.

**Fix:** establish the allowed real root and validate existing ancestors/targets before mutation, or explicitly refuse symlinked package/app-edit paths. Keep metadata-derived render paths inside the generated directory as well.

**Regression:** yes; symlinked `menus` ancestor, package root, app file, and generated file. Assert no external bytes change. Ordinary `rmSync` of a leaf symlink does not recursively delete its target; do not replace this finding with that incorrect claim.

## Nits and area-specific conclusions

### N1 — nit: CRLF and terminal menu dependencies are rejected unnecessarily

**Location:** `tooling/gen-menu/src/generate.ts:108`.

The dependency regex requires exactly a comma followed by end-of-line. CRLF package.json produces “no menu dependency block”; a sole last dependency without a trailing comma produces the same error. Reproduced in `/tmp/gen-menu-test-7fC4Wd` and `/tmp/gen-menu-test-XK2nMx`, both exit 1 before writes. A multi-entry terminal block's final comma-less menu entry is ignored. I did not reproduce malformed JSON/trailing-comma corruption: current code's placement/refusal avoids that specific failure, but does not support the requested layout generally. Preserve line endings, recognize the final property, and adjust commas when inserting. Regression fixtures are straightforward.

### N2 — nit: docs overstate probe validation and move the domain-component directory

**Locations:** `docs/integration/platform-packages.md:124`, `:185`.

The package tree moves `components/` out of `src/`, although this PR introduces no such code-layout change and the TypeScript include remains `src`. Restore `src/components/` unless the relocation is intentional and separately specified. The “root four commands passed” probe statement also omits that the test gate excludes the generator while its menu exists (F1); qualify the evidence until the full generated-tree test gate passes. Regression: documentation/tree check for the first; integration-test evidence for the second. I did not independently verify an earlier coordinator probe run, so this is not a claim that no historical probe execution occurred.

### Coverage of the requested areas

1. **Generated package / 6a / registry:** no additional findings in ordinary template imports. Index exports only `manifests`; page is lazy; mock-server is imported only by `src/api.ts`; page imports `../api`; kernel/components/contracts use public entries; no menu-to-menu import, storage access or hand-built URL. A fresh group gets one primary and `pageKeys: []`, which avoids global-key conflicts. Full app correctness still depends on F5/F6; full workspace test fails under F1/F2. A parameterized primary path passes `createRegistry`; navigation behavior was not established by the generated one-menu test.
2. **CLI validation / rollback / idempotency:** F3/F5/F6. No additional injection finding for ordinary quoted labels: apostrophe, backslash, CR and LF are rejected; double quotes and Unicode in labels are safe inside the emitted single-quoted literals. Group/menu/path regexes reject Unicode IDs, path traversal, backslashes/Windows-style route paths, query/hash and empty segments. Platform-native `--root` behavior is separate from route validation; no Windows-host test was run. Existing tests establish repeated generation and repeated removal refuse without overwriting; dry run avoids writes.
3. **Remove safety / symlinks:** F4/F9. The deletion directory is derived from validated group, not metadata.folder, so metadata.folder traversal alone does not change the recursive deletion target. Byte-edited generated files and unknown source files are refused. Top-level artifact directories are intentionally exempt; arbitrary content placed under those exempt names is deleted, which should remain an explicitly documented disposal policy. `applyRemove` is itself sequential and has no transactional restoration if a later app-file write fails; the transactional approach in F3 should cover removal as well.
4. **Markers / CRLF / EOF / commas:** F7/N1. No finding for missing trailing newline: generated and removed a fixture with no final newline and verified original menus.ts bytes restored (`/tmp/gen-menu-test-NoaoAU`). Missing markers are refused. CRLF marker lines themselves are found with `trim`, but app dependency matching refuses CRLF before any write.
5. **Probe restoration:** F8 plus F3 inherited through generation. `finally` is reached for ordinary synchronous exceptions inside the try; it is not an unconditional restoration guarantee. `revert()` can throw at its first failed read/write, failed remove, or install and skip subsequent recovery/verification. It removes the manually added group before trying `--remove`, so a refusal leaves a partly de-wired probe package. `pnpm install` reconciles dependencies rather than restoring a saved lockfile byte-for-byte. Use snapshots/ownership tracking and independently attempted cleanup, retain the original failure, and report remaining paths. Signals/forced process termination are not covered by `finally`. No probe run was performed.
6. **Tests:** F1/F2/F5/F6. Byte equality against the same `renderFiles` function checks emission consistency, not template validity; malformed bindings can pass those checks. The generated manifest test is meaningful for its own single menu, but does not validate the app composition or load/typecheck the lazy page. Existing CLI rejection/idempotency/remove tests are non-vacuous, but there are no write-fault, marker-relocation, duplicate-line, or symlink regression cases. The copied suite's 4 failures demonstrate the real-repo locks' brittleness.
7. **Docs:** D1, the skeleton scope, package prefix location, emitted file list, and default import/API pattern agree with implementation. N2 and the consumer gate problem in F1 remain. No additional documentation findings.

## Suggested repair order

Fix recovery/removal ownership first (F3/F4/F8/F9), then generated-code and collision validation (F5/F6/F7), then extensible gates and insertion order (F1/F2). Add narrow regressions for each and run all four gates with a retained temporary generated consumer. Keep source changes and any design updates in the implementation owner's work; this review made none.
