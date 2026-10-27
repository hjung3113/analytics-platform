# Agent Operations Reference

This document records operational traps and workarounds from running sessions. These are reference notes, not rules. Work rules are in the root `AGENTS.md`; open work is in [`.planning/README.md`](../../.planning/README.md).

## Worker (Codex) Sandbox

Workers launched with `codex … -s workspace-write` cannot perform the following actions. The coordinator handles them.

| Worker cannot | Coordinator action |
| --- | --- |
| Use the network (`gh`, package registries) | Provide the issue body in a file such as `.review/<n>-issue.md`. The coordinator installs dependencies first when installation changes the lockfile. |
| Write to `.git` outside the worktree → commit | The coordinator commits. |
| Open ports → start dev servers, E2E, or capture screens | The coordinator runs Playwright. |
| Write to `.agents/` | The coordinator edits these files. |

- Assign workers only `pnpm --config.verify-deps-before-run=false --filter <pkg> run <script>`. Delete `.pnpm-store/` if a worker creates it.
- Follow the global `issue-wave-conductor` skill for the full process of assigning an issue. This repository's part is in the [conductor profile](../../.agents/conductor/PROFILE.md) and [`conductor.json`](../../.agents/conductor/conductor.json). The shared tools (`launch-worker`, `review-plan`, `worker-hygiene`, `wave-status`) and shared implementation-worker and code-reviewer rules are in the global skill (`~/.agents/skills/issue-wave-conductor/{scripts,templates}`). Repository additions are in [`.agents/conductor/addenda/`](../../.agents/conductor/addenda/). The combined rules go to workers as `.review/00-IMPL-RULES.md` (#394).
- Worker-authored E2E tests often fail on their first run because of missing mock values, assumptions about primitive defaults, or Radix behavior. Run only the new tests first: `cd apps/platform-e2e && pnpm exec playwright test -g "<describe name>"`.
- In a test-fix round, also run `pnpm --filter <pkg> typecheck`; vitest does not check types.
- Provide the ADR format in the specification (for example, give an English example to copy). The format is in [`docs/adr/README.md`](../adr/README.md).
- Start a read-only reviewer with the first prompt and no dispatch: `orca terminal create --worktree path:<repo> --command "codex --model <m> -c model_reasoning_effort=<e> -s workspace-write -a never 'Read .review/<n>-review-spec.md and follow it exactly.'"`. Confirm the model and effort in the status bar. Run `worker-wait.sh` in the background to wait for both the report sentinel and worker-process exit; do not wait for the sentinel alone (LANES §Machine resources (16 GB)). If GitHub status is needed, provide a snapshot of the `gh` result in `.review/`; the sandbox has no network access.

## Memory (16 GB Machine)

- Limit Vitest to 2 workers with these environment variables: `VITEST_MAX_WORKERS=2`, `VITEST_MAX_FORKS=2`, `VITEST_MAX_THREADS=2`, `VITEST_MIN_FORKS=1`, and `VITEST_MIN_THREADS=1`. This protects a 16 GB machine from memory pressure: without a cap, a run can start 9 jsdom workers using about 19 GiB. The variables are set in `~/.zshenv` and by the worker runner `workerops.py`. Set the environment variables to change the count. When they are set, the `--maxWorkers` flag is ignored; without them, a flag after `--` is treated as a file filter and ignored, as in `pnpm run test -- --maxWorkers=2`.
- Root `pnpm test` already runs two packages concurrently through `"concurrency": "2"` in the root `turbo.json` (2 packages × 2 workers). Do not add `--concurrency=2`; the configured cap is sufficient and repeating the same value is harmless (#166, #945). Turbo uses strict environment mode, so add these variables to `turbo.json` `globalPassThroughEnv`; otherwise the root `pnpm test` loses the cap.
- Workers run package-scoped checks only. The coordinator runs root `pnpm test`, `build`, and `e2e` once each, in order.
- If a worker exits or the Orca runtime restarts, find and clean up leftover vitest processes (parent PID 1): `pgrep -fl vitest`, `lsof -a -p <pid> -d cwd`.
- Stop only your own checks: use the background job ID or `$!`, or a PID whose cwd is your worktree (`lsof -a -p <pid> -d cwd`). Do not stop by command name with `pkill -f "turbo run"`; that can also stop checks in other sessions on the same machine.

## New Worktrees and pnpm

- `orca worktree create --setup run|skip` does not install dependencies → run `pnpm install --frozen-lockfile --config.optimistic-repeat-install=false`. Close the default shell tab.
- With pnpm 11, changing only `pnpm-workspace.yaml` makes `pnpm install` skip with `Already up to date` → run `pnpm install --config.optimistic-repeat-install=false`.
- FeedbackOps (`apps/fo-*`, `packages/fo-*`) is part of the root workspace (ADR-0066, #642): one root `pnpm install` also installs FeedbackOps, and there is one lockfile. Root `lint`, `typecheck`, `test`, and `build` exclude FeedbackOps with `--filter='!@fops/*' --filter='!feedbackops'` ([repository structure](../integration/repository-layout.md)). The guard `.github/scripts/check-platform-turbo-scope.mjs` checks that `@fops/*` packages are not in the root task graph. The script-free `transit` task propagates dependency hashes (#390). Do not use `--only`: it also clears dependency hashes, so the local cache cannot match CI (#388).
- Run the documentation-link check directly with `node .github/scripts/check-doc-links.mjs` if needed (`products/` is excluded from the check).

## macOS Shell (zsh and BSD)

The shared list is rule 8 in the global worker rules, `templates/impl-rules.md` (`sed -i ''`, no `\|`, no `head -n -N`, zsh `$pipestatus`, quote path variables, and use `<<'EOF'` for multiline or backtick text).

- zsh does not split an unquoted variable into words. `${T:+--terminal $T}` is passed as one word and causes `unrecognized arguments` → use `$( [ -n "$T" ] && echo --terminal "$T" )` or an array.
- If a hook blocks one command in a multi-command call, the whole call does not run. Rerun the remaining commands.

## Git and PRs

- A hook blocks force-pushes. If an already-pushed branch conflicts with main, use `git merge origin/main` instead of rebasing; rebase only before the first push.
- Parallel PRs often conflict in `05`, `06`, `DESIGN.md`, the i18n dictionary, and E2E helpers. Merge them one at a time to resolve conflicts.
- For CSS selector CI, removing an intended class requires the PR label `css-removal-ok` and a reason comment. Adding the label triggers reevaluation.
- The app's `src/style.css` imports `tailwindcss` without specifying sources, so Tailwind scans Markdown under `apps/platform-web/`. Text such as `z-30` or `wide:pr-[32rem]` in a document can generate CSS. Deleting or editing such a document can make CSS selector comparison fail with "removed"; use `git grep` to confirm the class is absent from source code, then add `css-removal-ok` (#220).
- When combining a branch into one commit, use `git reset --soft $(git merge-base HEAD origin/main)`. Worktrees share `origin/*`; if another worktree's fetch advances `origin/main`, `reset --soft origin/main` can create a commit that reverts PRs merged in the meantime. After committing, check that `git diff origin/main --stat` shows only this PR's files.
- Tailwind also reads class-like strings in tests (for example, `'row-1'` becomes `.row-1`). Do not use Tailwind utility-shaped strings in test IDs or URL values; CSS selector comparison can fail with "added".
- A comment line beginning with `// eslint-disable…` is parsed as a directive even if it contains an explanation, and errors when no rule name is present. Do not start a line with that text.
- Immediately after creating a PR, `gh pr checks <n> --watch --required` can exit with "no required checks reported" (exit 1) because the required checks are not registered yet. Wait about 1 minute or check `gh pr checks <n> --required` after completion and confirm both required checks show `pass` before merging.
- Wait for PR checks by CI completion and the time limit only. A review bot may not review a new commit again. If `Closes #n` does not close an issue promptly, check once after merge and close it manually.

## Browser Checks and Captures

- Use `ego-browser` by default for browser checks. If it does not respond (`ego-browser nodejs -e 'console.log(1)'`), say that you are substituting `apps/platform-e2e` Playwright.
- Put capture scripts under `apps/platform-e2e` and run them there so `@playwright/test` resolves; delete them when finished.
- Use a different dev-server port per worktree: `pnpm exec vite --host 127.0.0.1 --port 517x --strictPort`. E2E defaults to 4190; change it with `E2E_PORT` when running concurrently.
- Mock state is in memory, so select the DevTools response scenario again whenever you open a page. The role is `localStorage platform:role`.
- In zsh, run a command list repeatedly with `eval "$c"` because variables are not split into words. Pass a function to Playwright `page.evaluate` as a string: `` `(${fn})()` ``.

Frequent capture URLs:

| What to inspect | URL or condition |
| --- | --- |
| Productivity KPI | `kpi=cycleTime` (or `occupancy`, `dwell`, `throughput`) |
| Compare | Productivity cycle-time detail (Compare is disabled in the productivity overview manifest) |
| Access directory | As an administrator, `/admin/roles?v=1&focus=engineer` |
| Detail panel | `/equipment?v=1&scopeId=MEM&focus=MEM-PHOTO-0103` |
| Equipment Maker mock values | AMX / ASM / LRC / TEL |

## Generator and Mock Registration

- When changing the generator (`tooling/gen-menu`), run `node tooling/gen-menu/scripts/probe.ts` on a clean tree.
- The mock registry is only `apps/platform-web/src/dev/mock-assembly.tsx` (`MOCK_ENDPOINTS`). Add sample values to `src/server-conformance.test.ts` `PARAMS` for each endpoint that declares params; tests fail if a sample is missing.

## Tests That Fail Only Under Load

- If root `pnpm test` fails with `Unable to find role …` only under Turbo parallelism, but the file passes alone, first suspect the default 1000 ms wait of the first `findBy*`. In that package, apply CPU load with `while :; do :; done` in `ncpu×2` background processes, then run the file 8–16 times and count failures. Compare before and after the fix under the same load, and compare the original code (with the change reverted) under the same load to tell whether the change caused the result. Always stop load processes with `pkill`. For `*.compact-action.test.tsx`, use `{ timeout: 8000 }` on the first `findByRole` (#434, #437).
- Do not conclude that a sibling file with the same structure is unaffected from one measurement. Run the same load loop for each sibling (#434, #437).
- Turbo `test` stops the remaining tasks after the first failure. A root `pnpm test` run that ends on a failure has not checked the remaining packages or `build`; rerun from the beginning after the fix.
- In a worktree without `node_modules`, `pnpm docs:links` fails during dependency checking. Running `node .github/scripts/check-doc-links.mjs` directly performs the same check. For a new file, use `git add -N` to avoid the "untracked" error.

## E2E Ports and Code Migration PRs

- `pnpm e2e` uses port 4190 by default (change it with `E2E_PORT`; the base-path port defaults to 4191 with `E2E_BASE_PATH_PORT`) and sets `reuseExistingServer:false`. If another session is running E2E, the command fails with `http://127.0.0.1:4190 is already used`. This is an environment conflict: find the PID with `lsof -nP -iTCP:4190 -sTCP:LISTEN` and check its owner with `lsof -a -p <PID> -d cwd`. Do not touch another session's process; choose another port, such as `E2E_PORT=4290 pnpm e2e`.
- Moving source code can reduce the files scanned by `@source` and make CSS selector comparison fail with "N selector(s) removed". First confirm that these classes belong only to the moved code and are not used by platform code; then add the PR label `css-removal-ok` (#450). If `ship-pr.sh` stops at "CI failed" because of an older failure record, check whether all checks pass for the current head with `gh pr view --json statusCheckRollup`, then use `gh pr merge --squash --match-head-commit <sha>` (conductor-engine#25).
- Before moving a package, check for `patchedDependencies` and floating-version dependencies. Keep dependency resolution aligned with `pnpm-lock.yaml`. If changing pnpm configuration (`patchedDependencies` or `overrides`) is followed by `pnpm install` reporting `Already up to date`, delete `node_modules/.pnpm-workspace-state-v1.json` and install again.
- CI turbo cache (#1019): workspace checks restore `.turbo/cache` (key `turbo-<os>-node26.7.0-<static|test>-<sha>`), so only changed packages and their dependents run. Only `main` pushes save the cache; PRs only restore. A task that reads files outside its package must declare `$TURBO_ROOT$` inputs in `turbo.json`, otherwise a stale cache returns a false green.
