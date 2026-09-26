# Step 6b final check

2026-09-27. Reviewed `35a5da3e96b50305e7cc1ed5ce14454915dc4e4f` and `fe9a288070ba615a010d75c260e59a087df39013` (current HEAD), against R1–R5 in `6b-rereview.md`. Initial Git status was clean. Source is unchanged; this report is the only workspace edit.

**Result: R1–R5 are fixed for their exact reported reproductions. No new P0/P1 finding in this narrow check.** This is not a claim of exhaustive failure recovery or a new full-workspace/probe certification.

## Executed verification

- All generator subprocesses used explicit `--root` under `/tmp`; all fixture processes used `TMPDIR=/tmp`.
- Reused the original external preload `/tmp/6b-rereview-writefault.mjs` for the exact R1 partial-write fault, rather than relying only on the new implementation's test seam.
- `TMPDIR=/tmp pnpm --filter @ap/gen-menu test`: **16 test files, 75 tests passed**, fresh Vitest execution. Log: `/tmp/6b-final-tests.log`.
- Original reproduction outputs: `/tmp/6b-final-repros.log`.
- Did not run `scripts/probe.ts`. R5 uses only the exported preflight/write helpers against a temporary root. Did not rerun full-workspace lint/typecheck/test/build for this narrow source-read-only check.

## Finding dispositions

| Finding | Result | Reproduction evidence |
| --- | --- | --- |
| R1 — failed partial writes excluded from rollback | **fixed** | Original one-shot ENOSPC preload writes 17 CSS bytes then throws. Generate (`/tmp/gen-menu-test-lxZnc8`) exits 1, restores all three app files byte-for-byte, and removes the package. Remove (`/tmp/gen-menu-test-BSBn7a`) exits 1, restores all three app files byte-for-byte, and preserves the package. Both report the injected error. |
| R2 — AST ignores overriding spreads/re-exports | **fixed** | Original trailing object spread overriding `/safe` with `/gen-probe` is refused (`/tmp/gen-menu-test-R9BrV6`), exit 1, app snapshots unchanged, no package created. Original re-export is also refused (`/tmp/gen-menu-test-bkIyZA`), now with a real `manifest.ts` supplying the colliding route; exit 1, no writes. |
| R3 — import markers hidden in a block comment | **fixed** | Original pair of import markers inside `/* ... */`, with existing imports active below, is refused as zero standalone occurrences (`/tmp/gen-menu-test-nPo3i8`), exit 1. App snapshots stay identical and no package appears. |
| R4 — blank line before closing brace leaves trailing comma | **fixed** | Original JSON fixture with a blank line after final `menu-aaa` dependency (`/tmp/gen-menu-test-XuRjGQ`): generate exits 0, remove exits 0, resulting JSON parses, and all app-file snapshots match their original bytes exactly. |
| R5 — dangling reserved probe-test symlink | **fixed** | Original dangling reserved path points to nonexistent `/tmp/6b-final-link-b34hB1/valuable.ts` from `/tmp/gen-menu-test-oD1SaO`. Preflight now throws “reserved probe path already exists”; the external target remains absent and the original symlink is preserved. The write helper is consequently never reached. |

The code changes match those outcomes: attempted app writes are recorded before invoking the writer; unsupported manifest object spreads/computed properties and absent local exports refuse; marker scanning excludes comment-contained text and proposed wiring is checked in the AST; comma repair skips blank lines and validates JSON; reserved probe paths use `lstat`.

## Lower-severity observation — no change request

**P2, `tooling/gen-menu/src/remove.ts:194-212`:** one-shot EBUSY on the first package deletion restores app wiring, then the retry deletes the package, leaving dangling wiring with exit 1 (`/tmp/gen-menu-test-Y79xsh`); this error-path residual state is recorded only, per the requested severity cutoff.

No source files, existing reports, or Git history were changed, and no real-worktree generator or probe execution occurred.
