# Step 6b re-review

2026-09-27. Reviewed `34ebdcad..89837e76559c365c8e29fb69c318f32703886635` on `hjung3113/step6b-gen-menu`: `159d565`, `067e797`, `f9f43dd`, and `89837e7`. Initial Git status was clean. Source is read-only; this report is the only workspace change.

**Verdict: changes still requested.** The original happy-path regressions are substantially repaired, including a retained new group's test gate and the probe's remove-before-group-restore order. Five remaining findings are demonstrated below: one P1 and four P2. They make F3, F6, F7, F8, and N1 partial fixes. No P0.

## Verification

- Every generator subprocess used explicit `--root` under `/tmp`; fixture processes used `TMPDIR=/tmp`. Did not run `scripts/probe.ts` anywhere. Invoked exported probe-support helpers against temporary roots only.
- Fresh `TMPDIR=/tmp pnpm --filter @ap/gen-menu test`: **14 files, 59 tests passed**, with actual Vitest execution rather than a Turbo replay. Log: `/tmp/6b-rereview-tests.log`.
- Repeated the real-wiring retained-consumer experiment: copied generator, real app wiring, GroupId, menu indexes and CSS files to `/tmp/6b-rereview-real-cyij0o0m`; added `reviewDemo` by hand; generated with the current CLI. Generation exit 0, then `pnpm --config.verify-deps-before-run=false test` in the copied generator package: **14 files, 59 tests passed** without `GEN_MENU_PROBE`. Installed tooling was reused via a node_modules symlink; this was not a full installed app copy. Log: `/tmp/6b-rereview-generated-tests.log`.
- Source-tree `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` returned success: 16/16, 16/16, 23/23 and 1/1 tasks respectively. **All four were Turbo cache hits**, not fresh compilation/build evidence. Logs: `/tmp/6b-rereview-{lint,typecheck,root-test,build}.log`.
- Original CLI reproductions and outputs are recorded in `/tmp/6b-rereview-repros.log`. Additional fault injection and helper results are described with their temporary paths below. No source injection or source edits were used.

## Disposition of every original finding

| ID | Disposition | Current evidence |
| --- | --- | --- |
| F1 — fixed seven-group locks | **fixed** for the reported scenario | `src/repo.test.ts:15-28` delegates to extensible invariants. Retained `reviewDemo` now passes all 59 generator tests, compared with the original four failures. `scripts/probe.ts:123` runs root `pnpm test`, including gen-menu; only the explicit probe-name check is bypassed. |
| F2 — absolute line offset versus block length | **fixed** | `src/generate.ts:263-277` iterates dependency entries. In `/tmp/gen-menu-test-JHx043`, the real app package.json places `menu-gen-probe` after equipment and before home. Retained `reviewDemo` also passes the sorting invariant. |
| F3 — rollback aborts and leaves partial state | **partially fixed** | Original read-only CSS case now exits 1, restores all app bytes and removes the package (`/tmp/gen-menu-test-kTpuyF`). However, a write which changes bytes and then throws is not added to the completed-write set, so its damaged file is never restored: R1. |
| F4 — global first-line removal | **fixed** for the reported ownership bug | `src/remove.ts:64-84` and `:128-133` require a unique full line in its owned region. Original CSS comment duplicate is preserved while the actual marked import is removed; removal returns 0 (`/tmp/gen-menu-test-QGRgYP`). The test suite also covers edited/duplicate owned lines. |
| F5 — invalid/colliding module bindings | **fixed** | Re-ran `eval`, `arguments`, `registry`, `createRegistry`, `--menu platform-page`, and `--menu query-view`: all refuse with exit 1 before generation. Strict bindings are in `src/generate.ts:27`; app bindings are checked at `:456`; page import names at `:380-382`. |
| F6 — format-sensitive collisions / route shapes | **partially fixed** | Double-quoted literals, `path :` spacing, underscore parameters and trailing-slash equivalents now refuse the collision (`/tmp/gen-menu-test-3GG5dt`, `hQ9ZOa`, `I1Ffy6`). `pathShape` matches kernel normalization. The new AST scanner still silently ignores overriding object spreads and missing local declarations: R2. |
| F7 — invalid marker context | **partially fixed** | Moving spread-end below `];` now refuses (`/tmp/gen-menu-test-MsuuFa`). Uniqueness/order checks exist. Import markers inside a block comment still accept generation and comment out the new import: R3. |
| F8 — fail-open Git / hidden untracked / reserved paths | **partially fixed** | Helper execution now throws on non-repository exit 128, sees untracked files despite `status.showUntrackedFiles=no`, and refuses an existing regular probe-test file. `src/probe-support.ts:12-33` fixes the original cases. `existsSync` still misses a dangling reserved-path symlink: R5. |
| F9 — external symlink ancestors | **fixed** for the reported mutation boundary | The original symlinked `menus` ancestor is rejected before generation (`/tmp/gen-menu-test-43NvYy` → `/tmp/6b-rereview-outside-f0s9QB/menus`); no external package appears. `src/generate.ts:406-409` and `src/remove.ts:31-33` check real-path containment for the package/app targets. This does not make the separate probe support path safe; see R5. |
| N1 — CRLF / comma-less last dependency | **partially fixed** | CRLF generation/removal restores exact app bytes (`/tmp/gen-menu-test-wKsPh1`). Appending after a comma-less last dependency also restores exact bytes (`/tmp/gen-menu-test-YY03cD`). A blank line before the closing brace leaves an invalid trailing comma on remove: R4. |
| N2 — docs layout / gate overstatement | **fixed** | `docs/integration/platform-packages.md:124` puts components back under src. The step-6b description at `:185` now describes the probe and explicitly includes gen-menu's tests, matching the current command. This review did not independently certify the coordinator's earlier full probe execution. |
| Coordinator's probe revert-order finding | **fixed** for ordering | `src/probe-support.ts:111-116` executes deleteProbeTest → remove → restoreHandEdits; remove failure selects fallbackRestore. `scripts/probe.ts:47-55` connects those callbacks to actual removal before restoring GroupId/GROUPS snapshots. Direct helper invocation produced that order, and all three ordering/failure tests passed. No full probe was run by this reviewer. |

## Remaining findings

### R1 — P1: failed partial writes are excluded from rollback

**Locations:** `tooling/gen-menu/src/generate.ts:509-510`, `:519`; `tooling/gen-menu/src/remove.ts:161-162`, `:169`.

A `writeFileSync` can truncate or partially write a file before throwing (e.g. ENOSPC). Both transactions record the path only after the call returns successfully, then restore only recorded paths. Thus the most important file to restore—the failed write's target—is skipped even though a valid pre-operation snapshot exists.

**Executed reproduction:** a temporary Node preload `/tmp/6b-rereview-writefault.mjs` patches builtin `writeFileSync`, synchronizes ESM builtin exports, writes the first 17 bytes of the CSS payload, then throws a one-shot ENOSPC error. Subsequent writes are allowed, so recovery is possible. Invoked the real CLI using `node --import ... cli.ts --root <temporary root>`.

- Generate in `/tmp/gen-menu-test-ZA5OW0`: exit 1, package removed, CSS remains exactly `@import "tailwind` instead of its original bytes.
- Remove in `/tmp/gen-menu-test-8fKL90`: exit 1, package remains, CSS is identically truncated. Other completed writes are rolled back.
- Both report only the injected original error; neither reports that CSS was left damaged.

**Fix:** track a write as attempted before calling it; on any failure compare every possibly touched target to its snapshot and restore it if different. A denied write whose bytes are unchanged does not require a retry. Staged/atomic replacement can reduce the damage window. Report every unrecovered path. Preserve independent cleanup attempts.

**Regression test:** the existing chmod tests fail before any bytes change and cannot demonstrate this. Add a one-shot partial-write fault for each app target in generate and remove; assert all snapshots are restored when subsequent I/O succeeds.

**Related limitation:** `applyRemove`'s final recursive deletion at `remove.ts:183` is outside its recovery block. A deletion failure can leave removed app wiring and a surviving/partially removed package. This is static evidence, not a separately executed deletion-fault finding; the same transaction work should define and report that residual state.

### R2 — P2: AST parsing still treats unsupported runtime manifests as safe literals

**Locations:** `tooling/gen-menu/src/generate.ts:109-115`, `:121-124`.

The new scanner skips every non-PropertyAssignment and every unrecognized/computed property name. A spread or computed property occurring later can override a literal which the scanner recorded. Also, if a source exports manifests via a re-export rather than a local variable declaration, the function returns an empty array instead of refusing an unsupported form. Both contradict the new helper's documented “refused, never skipped” contract.

**Executed reproduction:** existing index:

```ts
export const manifests = [
  { id: 'old', group: 'metrics', path: '/safe', ...{ path: '/gen-probe' } },
];
```

Generate the default `/gen-probe` in `/tmp/gen-menu-test-cllj3l`: exit **0**. The effective existing route is `/gen-probe`; the scanner reports `/safe`, so the assembled registry has a same-shape conflict. In a separate fixture (`/tmp/gen-menu-test-4XJo7m`), `export { manifests } from './manifest';` is silently accepted as no entries; that case demonstrates scanner acceptance, not successful runtime resolution of the re-export fixture.

**Fix:** reject object spread assignments/computed properties that could override the checked keys, or statically resolve them safely. Require exactly one supported manifests declaration; missing/re-exported/unsupported forms must not mean “zero collisions.” Consider reusing the parser in repo invariants, whose ownership checks remain single-quote regexes.

**Regression test:** trailing object spread overriding id/group/path, computed `['path']`, and re-export with a real colliding source module; require refusal before writes or correctly detected collision. Array-level spreads are already tested, but object-level spreads are not.

### R3 — P2: comment-contained import markers create an inactive import

**Locations:** `tooling/gen-menu/src/generate.ts:174-194`, `:215-235`, `:470-475`.

The import-region validator scans lines without checking lexical comment context. Move both import markers into a block comment before the actual imports, leaving all existing imports active:

```ts
/*
// <gen:menu-imports>
// </gen:menu-imports>
*/
// existing real imports remain below
```

**Executed reproduction:** `/tmp/gen-menu-test-zpVaPr`: generation returns **0**, inserts `import { manifests as genProbe } ...` inside that block comment, and adds active `...genProbe,` to MENUS. The new binding is not imported, so typecheck/runtime fails. `transpileModule` parse diagnostics cannot detect an undefined identifier, because the resulting code is syntactically valid.

**Fix:** verify markers are actual standalone comment trivia in the intended top-level context, not text nested inside another comment/string. Verify the planned AST contains the intended active import binding and spread. The same principle should apply to markers inside array strings/nested expressions rather than only character-range containment.

**Regression test:** run the above initially valid marker arrangement and assert a no-write refusal. The original out-of-array end-marker case is fixed, but this comment case was part of the original requested regression coverage too.

### R4 — P2: remove leaves invalid JSON when whitespace separates the final dependency from `}`

**Location:** `tooling/gen-menu/src/remove.ts:135-142`.

The comma repair only examines the immediately following physical line. A blank line before the dependencies object's closing brace is legal JSON. Generation correctly adds the comma to the former last property, but removal fails to take it back if the closing brace is not the very next line.

**Executed reproduction:** initial app package.json in `/tmp/gen-menu-test-CjYU6x`:

```json
{
  "dependencies": {
    "@ap/menu-aaa": "workspace:*"

  }
}
```

Generate genProbe → exit 0; remove genProbe → exit **0**; result keeps `"@ap/menu-aaa": "workspace:*",` followed by the blank line and `}`. `JSON.parse` fails with `Expected double-quoted property name ... line 5 column 3`. The generator has deleted its package and claims successful removal while leaving the app manifest unusable.

**Fix:** locate the next non-whitespace JSON token when repairing the comma, ideally through a parsed property range with byte-preserving edits. Parse the planned result before committing it.

**Regression test:** blank/whitespace-only lines after the final menu property, under LF/CRLF and with/without EOF newline; generate/remove must restore exact bytes and valid JSON.

### R5 — P2: probe reserved-path preflight ignores dangling symlinks

**Locations:** `tooling/gen-menu/src/probe-support.ts:31-34`, `:58`; `tooling/gen-menu/scripts/probe.ts:45`.

`existsSync` follows a symlink and reports false when its target is absent. A dangling `apps/platform-web/src/gen-probe.test.ts` link is therefore treated as a path owned by this run. `writeRegistryTest` follows it and creates the target outside the workspace, and cleanup removes the link. A clean repository can contain such a tracked link, so the now-correct dirty-tree check does not eliminate the case.

**Executed helper reproduction, no probe script:** create that reserved path as a symlink to a nonexistent `/tmp/6b-probe-link-WDMvKG/valuable.ts`, run `preflightReservedPaths`, then `writeRegistryTest`. Preflight returns normally and the external target is created. Root: `/tmp/gen-menu-test-lM0djQ`. The test did not create a tracked Git fixture; the clean tracked-symlink scenario follows directly from Git tracking the link itself and the helper's observed behavior.

**Fix:** use `lstat`/directory-entry existence for reserved paths so dangling symlinks count as present, and refuse any existing reserved entry before mutation. Validate real-path boundaries for probe writes too, rather than relying only on generator-side checks.

**Regression test:** dangling reserved test-file and package-directory symlinks, with external target absence/bytes unchanged after refusal. Keep the existing fail-closed Git tests.

## Probe ordering and verification limits

The coordinator's ordering repair is correctly connected: removal runs while the temporary group is still declared, then handwritten group files are restored. Remove refusal invokes a fallback that independently attempts the four source-file restores and package deletion; later install/clean-tree/test steps still run and failures are retained. This is materially stronger than the previous sequence.

It is still not a universal restoration guarantee: the successful-remove `restoreHandEdits` callback restores contracts then menus sequentially, so a failure restoring contracts suppresses menus restoration inside that callback. `pnpm install` reconciles rather than restores a saved lockfile snapshot. These are visible limitations; this review did not run or claim a full probe fault matrix. The five executed findings above are the actionable remaining review findings.

No additional direct-import boundary violation was introduced by the fixes. TypeScript is already a tooling devDependency, and the parser does not execute menu code. D1 remains intact. No commits, pushes, source changes, or real-worktree generator/probe runs were made by this re-review.
