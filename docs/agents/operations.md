# Agent Operations Reference

Operational traps and workarounds, not rules. Work rules are in the root `AGENTS.md`; open work is in [`.planning/README.md`](../../.planning/README.md). Workflow: the global `issue-wave-conductor` skill plus [`PROFILE.md`](../../.agents/conductor/PROFILE.md); worker rules reach workers as `.review/00-IMPL-RULES.md` from [`addenda/`](../../.agents/conductor/addenda/).

## Worker (Codex) Sandbox

Workers launched with `codex … -s workspace-write` cannot use the network, write `.git` outside the worktree, open ports, or write `.agents/`. The coordinator commits, runs Playwright and servers, edits `.agents/`, and provides issue text as a file such as `.review/<n>-issue.md`.

- Assign workers only `pnpm --config.verify-deps-before-run=false --filter <pkg> run <script>`. Delete `.pnpm-store/` if a worker creates it.
- Worker-authored E2E tests often fail on a first run (missing mock values, primitive defaults, Radix behavior). Run only the new describe: `cd apps/platform-e2e && pnpm exec playwright test -g "<describe name>"`.
- Give the ADR format in the spec with an English example to copy ([`docs/adr/README.md`](../adr/README.md)).
- Reviewers start through `worker-launch.sh --role`, not by hand. GitHub status a reviewer needs goes into `.review/` as a snapshot.

## Memory (16 GB Machine)

- Vitest caps come from env vars in `~/.zshenv` (and `workerops.py`); they must stay in `turbo.json` `globalPassThroughEnv`. Without the caps a run starts 9 jsdom workers (~19 GiB); with them `--maxWorkers` is ignored, and after `--` it becomes a file filter.
- Root `pnpm test` already runs two packages at once (`"concurrency": "2"`). Do not add `--concurrency`.
- Workers run package-scoped checks only; root checks are the coordinator's.
- After a worker exit or Orca restart, find orphaned vitest processes (parent PID 1): `pgrep -fl vitest`, `lsof -a -p <pid> -d cwd`.
- Stop only your own checks (job ID, `$!`, or a PID whose cwd is your worktree). Never `pkill -f "turbo run"`.

## New Worktrees and pnpm

- `orca worktree create --setup run|skip` does not install → `pnpm install --frozen-lockfile --config.optimistic-repeat-install=false`. Close the default shell tab.
- With pnpm 11, a change only in `pnpm-workspace.yaml` (or `patchedDependencies`/`overrides`) makes `pnpm install` print `Already up to date` → rerun with `--config.optimistic-repeat-install=false`; if still stale, delete `node_modules/.pnpm-workspace-state-v1.json`.
- Feature packages share the root workspace, lockfile and all four root tasks. The uncached ops lint leaf needs committed history and `FEATURE_LINT_BASE` (default `origin/main`) and fails without that base. Do not use `--only`: it clears dependency hashes, so the local cache cannot match CI.
- `pnpm docs:links` fails in a worktree without `node_modules`; `node .github/scripts/check-doc-links.mjs` runs the same check. For a new file use `git add -N` to avoid the "untracked" error.
- Before moving a package, check `patchedDependencies` and floating-version dependencies; keep resolution aligned with `pnpm-lock.yaml`.

## macOS Shell (zsh and BSD)

Shared list: rule 8 of the global worker rules.

- zsh does not split an unquoted variable: `${T:+--terminal $T}` is one word → use an array or `$( [ -n "$T" ] && echo --terminal "$T" )`; to loop over commands use `eval "$c"`. Pass a function to Playwright `page.evaluate` as a string: `` `(${fn})()` ``.
- If a hook blocks one command in a multi-command call, the whole call does not run; rerun the rest.

## Git and PRs

- No hand-run force-push or rebase of a pushed branch; to pull main into it by hand, use `git merge origin/main`. The one exception is the ship path (`ship-pr.sh`, the engine skill's `references/lane-merge.md`), which rebases and pushes with `--force-with-lease` under a session's merge grant.
- Parallel PRs conflict in `06`, `DESIGN.md`, the i18n dictionary and E2E helpers; merge them one at a time.
- Removing an intended CSS class fails CSS selector CI: add the PR label `css-removal-ok` and a reason comment (adding the label re-evaluates).
- `apps/platform-web/src/style.css` imports `tailwindcss` without sources, so Tailwind scans Markdown under `apps/platform-web/` and class-like strings in tests (`'row-1'` becomes `.row-1`). Deleting such a document can fail selector comparison with "removed", and utility-shaped test IDs fail it with "added". Confirm with `git grep` that the class is absent from source, then add `css-removal-ok`. Moving source code can fail it the same way; confirm the classes belong only to the moved code.
- Squashing a branch: `git reset --soft $(git merge-base HEAD origin/main)`, never `reset --soft origin/main` (worktrees share `origin/*`; another fetch can make a commit that reverts merged PRs). After committing, `git diff origin/main --stat` shows only this PR's files.
- A comment line starting with `// eslint-disable…` is parsed as a directive and errors without a rule name; do not start a line with it.
- `Closes #n` can lag: check once after merge and close manually. A review bot may not review a new commit again.
- CI wait procedure: [`traps.md`](../../.agents/conductor/addenda/traps.md) (`gh pr checks --watch` exits early on queued runs).
- CI turbo cache: workspace checks restore `.turbo/cache` (key `turbo-<os>-node26.7.0-<static|test>-<sha>`); only `main` pushes save it. A task reading files outside its package declares `$TURBO_ROOT$` inputs in `turbo.json`, or a stale cache returns a false green.

## Browser Checks and Captures

- Browser control is `ego-browser`; on failure (`ego-browser nodejs -e 'console.log(1)'`) say you substitute `apps/platform-e2e` Playwright.
- Capture scripts live under `apps/platform-e2e` (so `@playwright/test` resolves) and are deleted when finished.
- One dev-server port per worktree: `pnpm exec vite --host 127.0.0.1 --port 517x --strictPort`. E2E defaults to 4190 (`E2E_PORT`; base path 4191, `E2E_BASE_PATH_PORT`) with `reuseExistingServer:false`; "already used" is an environment conflict: pick another port (PROFILE §Lanes), never touch the other session's process.
- Mock state is in memory: reselect the DevTools response scenario on each page open. The role is `localStorage platform:role`.
- Real-server previews (`pnpm --filter @ap/platform-api run dev` + `dev:real`): set `HOST=127.0.0.1` in the worktree's `ops/platform-api/.env` first (`.env.example` binds `0.0.0.0`, the file wins over an exported `HOST`, and `AUTH_PROVIDER=mock` would accept LAN logins). Confirm with `lsof -nP -iTCP:3011 -sTCP:LISTEN` showing `127.0.0.1:3011`.

Frequent capture URLs:

| What to inspect | URL or condition |
| --- | --- |
| Productivity KPI | `kpi=cycleTime` (or `occupancy`, `dwell`, `throughput`) |
| Compare | Productivity cycle-time detail (disabled in the overview manifest) |
| Access directory | As an administrator, `/admin/roles?v=1&focus=engineer` |
| Detail panel | `/equipment?v=1&scopeId=MEM&focus=MEM-PHOTO-0103` |
| Equipment Maker mock values | AMX / ASM / LRC / TEL |

## Generator and Mock Registration

- Changing `tooling/gen-menu`: run `node tooling/gen-menu/scripts/probe.ts` on a clean tree.
- The mock registry is only `apps/platform-web/src/dev/mock-assembly.tsx` (`MOCK_ENDPOINTS`). Add sample values to `src/server-conformance.test.ts` `PARAMS` for each endpoint that declares params; tests fail otherwise.

## Tests That Fail Only Under Load

- Root `pnpm test` failing with `Unable to find role …` only under Turbo parallelism, while the file passes alone: suspect the 1000 ms default of the first `findBy*`. Apply CPU load (`while :; do :; done` in `ncpu×2` background processes), run the file 8–16 times, count failures, and compare before/after the fix and against the original code under the same load; check each sibling file the same way. Stop load with `pkill`. For `*.compact-action.test.tsx` use `{ timeout: 8000 }` on the first `findByRole` (#434, #437).
- Turbo `test` stops the remaining tasks after the first failure: a failed root run has not checked the rest or `build`; rerun from the beginning.
