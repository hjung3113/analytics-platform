# Conductor profile — analytics-platform

The global `issue-wave-conductor` skill (`~/.agents/skills/issue-wave-conductor/SKILL.md`) uses this repository-specific profile. Shared procedures live in the global skill; this file records only repository-specific differences. The root `AGENTS.md` is the source of work rules; if it conflicts with this file, follow `AGENTS.md`. `$CONDUCTOR` is this directory (`.agents/conductor/`).

Compared with the FeedbackOps source profile: there is no database or login (mock adapter). Visual evidence comes from Playwright E2E (`apps/platform-e2e`) and the mock preview. There are no visual baselines, biome, nav-perf, or temporary Postgres.

## Flow

- There is one `<base>`: `main` (no develop). Merge with squash. Release order and ownership are in [`LANES.md`](LANES.md) §Lead, Releases.
- Branches are `feat/<n>-<slug>`. `$MAIN` is `AP_MAIN` (the main checkout path); find the worktree by its name (`<n>-<slug>`) at the location chosen by Orca.
- Shared tools (`launch-worker`, `review-plan`, `worker-hygiene`, `wave-status`) are part of the global engine: `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`. Repository settings are in [`conductor.json`](conductor.json) (base, branches, installation, review rules, flags, hygiene, and preview decisions); template addenda are in [`addenda/`](addenda/). Change the settings when changing a rule. The engine source and tests are in the provider's canonical checkout `~/orca/projects/conductor-engine` (installation is under Tools).
- `WAVE_BRIEFS` is `$AP_MAIN/.review/wave/` (`.review/` is in `.git/info/exclude`).
- To use `ship-pr.sh`, run `git config workerops.protectedBases none` once in this clone (the PR base is `main`).
- Update the corresponding `.planning/README.md` line in the same PR.
- For concurrent sessions, `lane:*` assignment, shared paths, E2E ports, and release ownership are in [`LANES.md`](LANES.md).
- Ask for merge authorization once at slice start. A flow session uses the authorization in its instructions without asking ([`LANES.md`](LANES.md) §Flow sessions). The recommended choice is “Merge after CI and review pass, then report.” Follow [`LANES.md`](LANES.md) for when to ask about tags and GitHub Releases: the lead reports after publishing an SDK; ask before tagging an app `v0.x`. Do not ask again for each PR.

## Launch

- `python3 $ENGINE/launch-worker.py <n> <slug>` performs the following, as configured by `launch`:
  - Creates an Orca worktree from `origin/main`, finds it by name, and renames its branch.
  - Runs `pnpm install`. FeedbackOps (`apps/fo-*`, `packages/fo-*`) is part of the root workspace, so this install covers it (ADR-0066, #642).
  - Closes the configuration shell.
  - Adds [`addenda/`](addenda/) to the global `impl-rules.md` and `review-rules.md`, writing worktree files `.review/00-IMPL-RULES.md` and `.review/00-REVIEW-RULES.md`. The first line of `.review/W-<n>-TASK.md` points to the implementation rules.
  - Calls the shared runner.
- Required environment variables: `WAVE_STATE`, `WAVE_BRIEFS`, `AP_MAIN`. Set the role with `WORKER_ROLE`; override it with `WORKER_MODEL` and `WORKER_EFFORT`.
- On a 16 GB machine, `scripts/capacity.sh` sets the concurrent worker count (1–7: green 7, yellow 3, red 1; stages are in LANES §Machine resources (16 GB)). Run issues in parallel only when their files do not overlap (see `docs/agents/operations.md`). This is the machine-wide limit; locks for slots and heavy stages are in [`LANES.md`](LANES.md) §Machine resources (16 GB).
- **Launch FeedbackOps issues in `fo` mode:** `python3 $ENGINE/launch-worker.py <n> <slug> fo`.
  - FeedbackOps (apps and packages `apps/fo-*`, `packages/fo-*`; tools `ops/feedbackops/` = `@fops/ops`) is part of the root workspace and uses Node 26.7 and pnpm 11 with the root. The launcher's root install handles setup (#642).
  - The mode hook `scripts/fo-prepare.sh` does not install dependencies. It fills `.env`, then creates the issue database (5439) with FeedbackOps `verify-db.sh create <n>`.
  - The rule addendum is `addenda/impl-rules-fo.md`.
  - **Prerequisite:** The verify container must be running. In a checkout with FeedbackOps installed and `ops/feedbackops/.env` present, run `bash ops/feedbackops/conductor/scripts/verify-db.sh up` once. Do not use the 5434 development database.
  - `.env` is not in git. If absent, `fo-prepare.sh` creates it from `.env.example`. In the checkout where you run `up`, manually run `cp ops/feedbackops/.env.example ops/feedbackops/.env`.
  - After merge, run `verify-db.sh drop <n>`; at wave end, run `down`.

## Complexity

Classify an issue as `impl-complex` if any of these apply:

- It changes a Kernel contract and its consumers (components, shell, or menus) together, or touches at least three packages.
- It touches permissions, Scope, URL security boundaries (`safeReturnTo`, separation of destination ID and Context), or data-leak rules.
- It handles state or ordering logic: query lifecycle (cancellation, generation, `ready` gate), history push/replace, or page-key cleanup when Context changes.

## Verify

Run checks in order. All must exit 0 before commit.

1. Check the changed packages.
2. Run the root checks once with `bash .agents/conductor/scripts/verify-root.sh <log-dir>`. The order is `pnpm lint` → `pnpm typecheck` (without a lock) → `pnpm test` → `pnpm build`; run test and build together under `heavy.lock`. After lint and typecheck, immediately before test and build, if `capacity.sh` returns `start=no`, do not acquire the lock and exit with code 3. Write `<log-dir>/<step>.log` for each stage (last line `exit=<code>`); stop at the first failure and return that stage's code. Finish with a `step=<name> exit=<n> seconds=<s>` summary. The root `turbo.json` `concurrency` setting limits concurrent test packages; CI uses the same setting ([operations.md](../../docs/agents/operations.md)). Do not add `--concurrency` or worker-count flags to the script. Worktrees share the turbo cache, so do not use `--force`, `--affected`, `...[ref]`, or similar git-diff filters: changed task inputs and their dependents rerun by hash; diff filters select files rather than inputs. Root `package.json` scripts (`lint`, `typecheck`, `test`, `build`) already include `--filter='!@fops/*'`; do not add it in the script. Otherwise the FeedbackOps root tool `@fops/ops` may run with the platform biome configuration and fail. Tests that read files outside their package need `$TURBO_ROOT$` inputs declared in `turbo.json` for reliable caching.
   - **Light nodes (O2):** If the node diff does not touch Kernel, shell, shared components (`packages/sdk/{kernel,components,shell,ui,contracts}`), mock server, or `apps/platform-web` assembly (menus, docs, tools, scripts, and moves outside those paths), run only changed-package checks and `verify-root.sh --light <log-dir>` locally (lint and typecheck only, without `heavy.lock`); leave test and build to PR CI. Nodes that touch those paths use the full checks above. Shared-path PRs (the five groups from root `AGENTS.md` work flow: public APIs (`tooling/sdk/api/` and `exports`), root `package.json`/lockfile/`turbo.json`, `.github/workflows`, and `apps/platform-e2e`) always run the full `verify-root.sh`, regardless of paths, because CI failures hold the whole lane under `merge.lock`. Decide from the node diff paths and record one line in VERIFY (“Light node: paths …; test and build are in CI”).
7. Only when inputs change, run locally checks absent from the four root checks and run only in CI:
   1. If public types in `packages/sdk/contracts` or an SDK package change, run `pnpm sdk:api` after build. In a fix round, first run `pnpm --filter <pkg> build` for the changed package; `sdk:api` reads built dist declarations (`tooling/sdk/sdk-api-snapshot.mjs`). For an intended change, use `--update` and add one change-record line to `docs/integration/sdk-git-tag-consumption.md`.
   2. If files in SDK packages (`packages/sdk/{contracts,ui,kernel,components,shell}`) move or are renamed, run `pnpm sdk:pack --out <dir> && pnpm sdk:consumer-check <dir>`.
   3. If the diff removes a CSS rule, create the PR, apply the `css-removal-ok` label before ship, wait for reruns to finish with `gh pr checks <n> --watch`, then ship.
3. If Kernel, shell, shared components, or mock server changed, run E2E. First run only the new describe (`cd apps/platform-e2e && pnpm exec playwright test -g "<describe>"`), then run only the describes listed in the brief's “Impact” section with `-g "A|B"`. Do not run full local `pnpm e2e`; PR CI runs the full suite, and local full runs are only for reproducing CI failures.
5. **Run FeedbackOps stages only when changes touch `.github/workflows/feedbackops.yml` `paths`** (the path list is defined in that workflow: `docs/feedbackops/**`, `apps/fo-*/**`, `packages/fo-*/**`, `ops/feedbackops/**`, `packages/sdk/{ui,contracts}/**`·`packages/adapters/{http-adapter,server-conformance,fo-bridge}/**`, root manifests, lockfile, `.nvmrc`, etc.). If touched, run `bash ops/feedbackops/scripts/ci/gate.sh static --base origin/main`, `unit`, and integration from the repository root. Do not run integration with `gate.sh integration`: it migrates and truncates the `feedbackops` database on the `CI_PG_ADMIN_URL` server, which is the source copied into issue databases by the verify container (5439). Instead, run the full integration suite against the issue database: `FEEDBACKOPS_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @fops/backend test:integration`. If the branch adds a migration, recreate the database first with `verify-db.sh drop <n>` → `create <n> --migrate-from <worktree>` (repository-root checkout). Do not use 5434. Platform root checks do not cover FeedbackOps. CI catches any omitted stage. Before commit, format new files with `ops/feedbackops/node_modules/.bin/biome format --config-path=ops/feedbackops --write <file>`.
4. If menu manifests, `menus.ts`, contract menu types, or `tooling/gen-menu` change, run `node tooling/gen-menu/scripts/probe.ts` (generate → full checks → revert). Root checks and CI do not include it. Do not run it in a worktree with a live preview (see Traps).
6. Run `python3 $ENGINE/worker-hygiene.py <worktree>`: fail for unjustified new `eslint-disable` comments or increases in `eslint-suppressions.json`; report whitespace-only changes.
  
Fix design lint errors with the tokens, variants, or components named in the message; do not add violations to suppressions. Mechanical fixes may also include missing mock registration (`MOCK_ENDPOINTS`, `PARAMS` in `server-conformance.test.ts`).

### Fix round

A round that fixes review findings or host failures does not repeat all checks above. Run changed-package checks; root `lint`, `typecheck`, and `test` (using cache; for light nodes in step 2, only lint and typecheck); E2E only for affected describes with `-g`; affected FeedbackOps stages; and hygiene (step 6). If the round changes an input to step 7 (public types, SDK file moves/renames, or CSS rule removals), also run step 7. Do not run `build`, full E2E, or `probe.ts`, except when the round changes a build input (configuration, public exports, or `tooling/gen-menu`). PR CI reruns the full suite (workspace checks restore the turbo cache, so only changed parts run).

### Final head (before ship)

After the last fix round, run only hygiene (step 6) before ship. Run the Fix round checks above only if `ship-pr.sh` rebase has conflicts. Without conflicts, CI records the final head (turbo-cache scope: changed packages and dependents). The whole, cold record is the manual `ci.yml` `workflow_dispatch full=true` run before a release tag. Tag a release on a SHA whose `main` CI is green and whose `full=true` run is green.

## Browser evidence

- The default UX review evidence is the reviewer directly operating the branch and baseline previews. If ego-browser fails, follow global skill 7d for retries or alternatives. If switching to host capture and evidence review, record that in VERIFY.
- Use `ego-browser` for review. If blocked, substitute a one-off Playwright capture from `apps/platform-e2e` and report the substitution.
- Start previews with `$ENGINE/app-preview.py start <checkout> --name <n>-branch` (baseline name: `<n>-main`). The mock-assembly Vite server uses an available port from 5180–5199; there is no backend.
- Install the baseline worktree with `pnpm install --frozen-lockfile`.
- Capture after chart canvases and table rows render. Run `stop` in the same turn.

## Review

- Plan with `python3 $ENGINE/review-plan.py <checkout> [--base origin/main]`. Rules are in `conductor.json` `review_plan`, pinned by this repository's engine case (`engine/tests/ap/test-review-plan.py`).
- Handle flags as follows:
  - Follow global skill 7a for `flags.permission` and `flags.instructions`.
  - If `flags.e2e` is present, confirm Verify step 3 was run. If `flags.submodule` is present (changes in `docs/feedbackops/`, `apps/fo-*`, `packages/fo-*`, or `ops/feedbackops/`), confirm the FeedbackOps gates (`bash ops/feedbackops/scripts/ci/gate.sh static|unit|integration` from the repository root; CI is `.github/workflows/feedbackops.yml`).
  - If `flags.contract` is present, include changed 06 contract sections and ADRs in the code-reviewer assignment.
- Reviewer rules:
  - Code reviewers use global `templates/review-rules.md` plus [`addenda/review-rules.md`](addenda/review-rules.md) (combined as `.review/00-REVIEW-RULES.md` in worker worktrees). Brief checks use global `templates/brief-check.md` plus [`addenda/brief-check.md`](addenda/brief-check.md).
  - UX and quality reviewers use global `~/.agents/agents/review-ux.md` and `review-quality.md`; this profile's two Review lens sections define repository-specific criteria.
- **Review reductions:** keep them together.
  - A mechanical or copy-only diff (moves, renames, generator output, or copy changes only) may skip `review-final` if VERIFY includes one line of `git diff --numstat` evidence and “Mechanical diff, review-final skipped.” The global skill 7g already allows this; lead checks are in [`LANES.md`](LANES.md) §Lead, Flow checks.
  - If review results contain only minor or nit findings and no blocker or major, and the diff is small (≲150 changed lines; the lead's judgment is reversible, not an owner decision; mechanical or copy-only diffs, including generator output, count as small regardless of size), merge without a pre-merge fix round. Always record findings that day in `.planning/backlog.md` or a bundled issue and link them (Deferrals rules); remove the backlog line when a later PR fixes it. This profile takes precedence over global skill 7f for minor and nit handling. If any blocker or major exists, follow the existing rules.
- Performance: There is no measurement tool. Launch `review-perf` only when a regression was actually measured; otherwise include a performance perspective in the code-reviewer assignment.
- Resolve conflicts in this order: permission and data-leak rules → ADRs, 06 contracts, and recorded owner decisions.
- **Large-scope plan review:** Before launching a worker, have the `review-quality` persona review briefs classified `impl-complex` or briefs changing 06 contracts, package boundaries, or the SDK public API (`sdk:api`), in addition to the brief check. Use the criteria under Review lens: quality: SDK/platform/menu responsibility boundaries, dependency direction, commonization, public API shape, and code quality. Add findings to the brief before work starts. This remains the rule until the engine step exists (`conductor-engine#80`).
- **Impact and regression risk** (all briefs): include this section in every brief. Keep the review shallow and the scope broad.
  - List affected consumers: use `rg` to find menus, shell, boards, and app assembly using the changed component or contract.
  - List 06 sections, ADRs, and documents that must change with the implementation.
  - List regression risks in descending order, with the test or E2E describe that catches each risk. If a change touches UI, shell, Kernel, shared components, or mock server and needs E2E, **name the E2E describe**; a brief listing only unit tests is incomplete. Local E2E runs only the listed describes with `-g`, so the list is the safety net. If no coverage exists, say “not covered” and add a test to the brief.
  - Before launching a brief touching `packages/*`, shell, `@ap/contracts`, or more than one menu, assign one broad-impact reviewer to check this section. Use the same `review-check` role as the brief check, in parallel with plan review. The reviewer scans the repository shallowly (imports, Registry, E2E describes, document ownership) and returns missing impact and regression checks.
  - This remains the rule until the engine adds a dedicated `review-impact` role and brief section (`conductor-engine#91`).
- **Pre-merge documentation stage:** After the last fix round and before merge, for each issue or bundle:
  1. A documentation-sync worker follows the diff into its owning documents (ownership is defined in [`docs/AGENTS.md`](../../docs/AGENTS.md)): 06 contract sections, ADRs, `docs/integration/*`, requirements and screen documents, `GLOSSARY.md`, folder `AGENTS.md` files, and `.planning/README.md` and `backlog.md`; fix any drift. The report records the code-to-document connections checked.
  2. A `review-check` reviews the documentation diff for code alignment, single contract ownership, terminology, and links (`pnpm docs:links`). Documentation-only PRs get this review too.
  
  This remains the rule until the engine has the step and role (`conductor-engine#81`).
- File issues in conductor-engine for changes to skills, the engine, templates, or personas, using `$ENGINE/upstream-file.sh`.

## Review lens: UX

The global `review-ux` persona reads this section first. Write reports in Korean.

- **Preview:** Both `branch` and `main` (baseline) use the mock-assembly Vite server. There is no backend, login, or database; the different ports have separate localStorage. UI writes remain only in mock memory.
- **Role:** Set each preview origin's role in localStorage `platform:role` (for example, administrator or regular user). The value must be a JSON string (`"admin"`; unquoted `admin` is ignored). Use mock DevTools response scenarios for loading, empty, and error states; select them again each time you open a page.
- **Viewport:** 1440×900 (`page.cdp("Emulation.setDeviceMetricsOverride", …)`); also inspect screens with an open detail slot at 1280.
- **Reference documents:**
  - Root `AGENTS.md` (the platform is the product; menu screens are examples), `DESIGN.md` (visual rules follow the FeedbackOps design system), and `GLOSSARY.md` (terminology).
  - Relevant sections of `docs/contract/platform-ui-contract.md`: shell §7, detail slot §13, charts §16, status indicators §19, cross-menu links §22, plus the sections and ADRs named by the issue.
  - The owner-approved prototype selected from `?variant=` variants on the real app. If the implementation differs, raise `owner-question`.
  - Use general guidance only where the project is silent: `web-design-guidelines` and `interface-design` skills.
- **Additional checks:**
  - **URL contract:** Does refresh, back/forward, or a copied link open the same screen? When the Context bar changes, does the page value persist or clear according to contract 06 §6.4?
  - **Keyboard standard:** Input requirements in 06 §26 (Windows, keyboard and mouse together).
  - **Copy:** Korean UI copy, reuse existing i18n expressions, and use `GLOSSARY.md` terminology (for example, use EquipmentID rather than an equipment name).
  - **Consistency:** 50px page header, tokens instead of raw colors, and `@ap/ui`/`@ap/components` components instead of one-off implementations.
- **Severity examples:** `blocker` includes data visible from another Scope; `major` includes a violation of contract 06.

## Review lens: quality

The global `review-quality` persona reads this section first. Write reports in Korean.

- **Scope:** `<last release tag>...origin/main` (see Slice close above).
- **Reference documents:** Root `AGENTS.md` (purpose, dependency direction, commonization criteria, verification), `packages/AGENTS.md`, and `AGENTS.md` files in changed paths; `docs/integration/platform-packages.md` (package boundaries §3), `docs/contract/platform-ui-contract.md` §24 (commonization after verification in 2–3 actual consumers), and `docs/AGENTS.md` (one owning document per contract).
- **Boundary leaks:** Kernel, shared components, or shell know about menus or mocks; reverse imports; menus import `@ap/*` internals rather than public entry points; FeedbackOps primitives are used outside `@ap/ui`; or the frontend enforces permissions as truth.
- **Commonization:** A pattern with a single consumer promoted to a shared package, or a pattern repeated in 2–3 places left in a menu.
- **Cache inputs:** Do tests or linting that read files outside their package declare `$TURBO_ROOT$` inputs in `turbo.json`? Otherwise turbo may miss changed inputs.
- **Dead code:** Include leftover prototype (`?variant=`) code.
- **Documentation drift:** Include 06 sections, ADRs, and the `.planning/README.md` line.
- **Release blocker:** Only package-boundary, contract 06, or permission violations that emit incorrect behavior or data.

## Fold scope

Only two locations outside an issue diff may be folded in: the changed menu folder's `menus/<space>/<group>/src/` and the i18n dictionary. Do not fold changes to `packages/sdk/ui`, `packages/sdk/kernel`, `packages/sdk/contracts`, the shell, or another menu.

## Slice close

- Quality review scope is `<last tag>...origin/main`.
- For a slice that changes the UI, use `review-ux` on the `origin/main` preview to inspect the user flow.
- The next steps, including documentation checks and introduction-site updates, are defined in [`LANES.md`](LANES.md) §Lead, Releases. Ask the owner for the next slice when finished. Start the release command with `SHA=$(git rev-parse origin/main)` and pass the full SHA to `gh release create --target "$SHA"` (`target_commitish is invalid` for short SHAs).
- Pre-tag step: a full run (`gh workflow run ci.yml --ref main -f full=true`) on the SHA to tag must pass. Check the run you started (its id from `gh run list --workflow ci.yml --event workflow_dispatch --limit 1 --json databaseId`; `gh run view <id> --json headSha,conclusion` must show the tag SHA and `success`), not any dispatch at that SHA: a `full=false` dispatch also passes on cache hits. A moved SHA needs a new full run.
- Before handoff, `$ENGINE/app-preview.py status` must show no tracked previews.

## Tools

Shared assets (`issue-wave-conductor`, `orca-dispatch-recipes`, and `session-handoff` skills, reviewer personas, workflow hooks) are installed by conductor-engine's `install.sh` and are not copied into this repository. The session-start context shows the installed commit. If a warning says the installation is out of date, run `install.sh --check` from the provider checkout.

| Tool | Purpose | Fixed test |
| --- | --- | --- |
| `$ENGINE/launch-worker.py <n> <slug>` | See Launch | Engine repository `test-launch-worker.py` |
| `$ENGINE/review-plan.py <checkout> [--base origin/main] [--head HEAD]` | Review plan | Engine repository `engine/tests/ap/` |
| `$ENGINE/wave-status.py [--json] [--prs] [--state-dir <dir>]` | Read-only snapshot: workers and reviewers, previews (ownership determined by engine `app-preview.py`), worktrees, and CI for open PRs when `--prs` is set. If `$WAVE_STATE` is unset, reads this repository's most recent session `wave/` directory (within one day). | Engine repository `engine/tests/ap/` |
| `$ENGINE/worker-hygiene.py <worktree>` | See Verify step 6 | Engine repository `engine/tests/ap/` |
| `$ENGINE/app-preview.py start <checkout> [--name <label>]` / `stop <label>\|--all` / `status` | Mock preview (engine tool; this repository's settings are in `conductor.json` `app_preview`) | Engine repository `engine/tests/test-app-preview.py` |
| Global `templates/brief-check.md` + `addenda/brief-check.md` | Brief check items | — |
| `bash tooling/scripts/next-adr.sh` | Assign an ADR number | — |
| `bash .agents/conductor/scripts/with-lock.sh <lock> "<purpose>" -- <command…>` | Acquire a machine-resource lock (`heavy.lock`, `browser.lock`, `merge.lock`, `worker-slot-N`) and release it with the child process lifetime. Release requires matching owner (`ORCA_TERMINAL_HANDLE`/`WITH_LOCK_OWNER`) and `token`. Append `, pid <wrapper PID>, pgid <child group>` to the end of purpose (LANES §Machine resources (16 GB)). | — |
| `bash .agents/conductor/scripts/verify-root.sh [--light] <log-dir>` | Verify step 2 (root lint → typecheck → test → build; test and build under `heavy.lock`) | — |
| `bash .agents/conductor/scripts/lock-audit.sh` | Find locks from completed work (30-minute lock audit; releases nothing) | — |

`app-preview.py` behavior:

- `status` shows tracked previews and other people's Vite processes. It labels other people's processes `untracked` and does not touch them.
- `stop` confirms ownership before sending a signal. It checks the recorded pgid, the parent's start time, and the command.
- If the parent is gone, accept only a Vite process in that group started by the recorded checkout, in either form:
  - `node …/vite/bin/vite.js` (resolve relative paths from the process cwd read by lsof), or the checkout's `node_modules/.bin/vite`;
  - with an exact matching `--port` and `--strictPort`.
- If ownership is unclear, leave the state file and skip with `ownership unclear`.

Repository-specific conductor tools are in `scripts/` (the table's `with-lock.sh`, `verify-root.sh`, `lock-audit.sh`, and `capacity.sh`; see LANES §Machine resources (16 GB)). Global engine tests, including `app-preview.py`, run in the engine repository (`bash engine/scripts/test.sh`, `conductor-engine#18`).

## Traps

- If a PR changes behavior (state, request shape, or response fields), the conductor inspects the changed flow once on the real server (issue database + `app-preview.py`/`dev:real`) with ego-browser before merge, even if UX review is skipped, and records it in VERIFY. If `review-plan.py` marks UX as `required`, record the skip reason and substitute browser evidence in the PR body. Unit-test mock servers and `focusManager` toggles do not prove the real-server path — they exercise different paths.
- Use [`docs/agents/operations.md`](../../docs/agents/operations.md) for worker setup pitfalls: new worktree installation, pnpm 11, CSS selector CI, captures, and mock registration.
- A baseline worktree created with plain `git worktree add` cannot host an Orca terminal reviewer; run previews there only — the Orca terminal is unavailable.
- Write an ADR number only after commenting `ADR-NNNN 예약` on #598. Before reserving, check both `origin/main` and open PRs. A reservation does not stop another session from using the same number: recheck `origin/main`'s `docs/adr` before ship.
- If `gh pr merge` rejects a merge by recommending `--auto`, check state with `gh pr view <n> --json state` before deleting the remote branch — deleting it closes the PR.
- Before final checks, run `pnpm install --frozen-lockfile` in the main checkout — `node_modules` can become stale as merges accumulate.
- Resolve relative `addenda/` paths from `$CONDUCTOR`, not the repository root — otherwise they resolve to “No such file.”
- If a task has no issue number, `launch-worker.py` cannot create a worktree because `--issue` requires a number. Create one manually: `orca worktree create --setup skip` (without `--issue`) → install → close the configuration shell → write TASK → shared runner.
- Do not edit source in a worktree while host root tests or E2E are running — Vite HMR may cause spurious E2E failures. If a change is needed, wait for the checks to finish, edit, and rerun them.
- E2E uses `--strictPort` and defaults to port 4190 (`E2E_PORT`; base path defaults to 4191 via `E2E_BASE_PATH_PORT`). Use the flow-specific port in [`LANES.md`](LANES.md) when another session uses the same port; do not touch another session's process. Find the PID with `lsof -nP -iTCP:<port> -sTCP:LISTEN`, then check cwd with `lsof -a -p <PID> -d cwd`. LANES.md says whom to notify about full E2E runs.
- If `ship-pr.sh --issue` fails with `Could not close the issue` because the PR's `Closes #n` already closed the issue, verify merge with `gh pr list --head <branch> --state all`, manually archive the worktree's `.review/`, then remove the worktree — the script skips `--worktree` cleanup and `--archive-review`, and omits `merged` from JSON ([conductor-engine#58](https://github.com/hjung3113/conductor-engine/issues/58)).
- After applying `css-removal-ok`, wait for reruns to finish with `gh pr checks <n> --watch`. `ship-pr.sh --ci` may still report `ci_failed` (exit 21) for an earlier run on the same head after checks finish. Confirm every check passes with `gh pr checks <n> --json name,bucket`, then merge with `gh pr merge <n> --squash` under `merge.lock` ([conductor-engine#144](https://github.com/hjung3113/conductor-engine/issues/144)); see Verify step 7.
- Do not run file-writing commands such as `node tooling/gen-menu/scripts/probe.ts` in a reviewer preview worktree; stop the preview first because transient file changes can make Vite show import errors.
- Put “Do not read the clipboard” near the start of UX review briefs. `navigator.clipboard.readText()` transfers control of the Ego Lite task space to the user; judge link copying from its success toast and the address bar.
- Before launching a worker, resolve any item in a brief-check patch marked “coordinator decision before start” by recording the decision in the brief — otherwise the worker may stop on an open policy question.
- Start `worker-wait.sh` with `run_in_background` in the same turn that launches workers and reviewers — without a wait, completion notifications do not arrive.
- If a shared component is wrong or missing, the conductor files an `upstream` issue with the provider's `engine/scripts/upstream-file.sh`; record any local workaround here with that issue link instead of putting it only in memory or `HANDOFF.md`.
- Include a `?variant=` value in menu `pageKeys` so changing the address redraws the screen — otherwise the previous variant can remain visible.
- For conductor-host Playwright captures, import `@playwright/test` from `apps/platform-e2e` and add `v=1&scopeId=MEM` to the URL. Without Scope, the page shows only “Scope를 선택하세요” and the canvas wait times out.
- Compare domain hierarchies and groupings in briefs with `GLOSSARY.md` first (for example, “Maker → Module”) — use the glossary and the root `AGENTS.md` principle “SDK provides general-purpose building blocks.”
- Commit only when the test command's exit code passes. Do not use `vitest … | grep 'Tests ' && git commit`; grep can succeed even when tests fail.
- For IA and menu-structure prototype captures, capture each space rail section; the sidebar shows only the selected section's menus. Clear that origin's localStorage and sessionStorage before each variant so recent visits do not contaminate captures.
- Wait for the 200ms fade-in of popovers and menus to finish before capture or visual review — an intermediate frame can look like a transparency defect.
- When public types (including union extensions) in `@ap/contracts` or SDK packages change, also run `pnpm sdk:api` after root checks. For intended changes, use `--update` and add one change-record line to `docs/integration/sdk-git-tag-consumption.md` — root checks do not cover this gate.
- Do not close slice or wave Epics during release cleanup; close only issues named by the PR body's `Closes` — cleanup may otherwise close an Epic.
- `launch-worker.py <n>` requires the brief report and sentinel to be `.review/W-<n>-REPORT.md` and `<!-- W-<n>-DONE -->`. Use the same names for a second stage in a new worktree; names such as `-STEP1-DONE` are rejected.
- After `app-preview.py stop --all`, confirm with `status`; if a preview remains, stop it by label ([conductor-engine#63](https://github.com/hjung3113/conductor-engine/issues/63)).
- Do not switch branches in a checkout where `ship-pr.sh` is running, especially `$MAIN`; run ship from a `git worktree add` for that branch — otherwise concurrent branch creation can include unmerged commits.
- Do not pipe `ship-pr.sh` through `| tail -1`; write output to a file and check the exit code separately. Re-run root checks from the beginning after resolving a rebase conflict, since tests may have changed on the newly merged branch ([conductor-engine#64](https://github.com/hjung3113/conductor-engine/issues/64)). Exit code 20 may otherwise be reduced to `{"pr": null, "merged": false}`.
- For UX reviews on the real server (`dev:real` + issue database), specify a Context-capable screen and a persona able to open it in advance. Seed personas (Mock User and Mock Admin) lack analytics-space access, so the analysis menu shows “이 메뉴에 대한 권한이 없습니다”; the operations console's “변경 감사” (actor filter + time range) has Context. Platform “로그아웃” is inactive, so switch users by selecting again at `/auth/login`.
- Do not put platform typography classes `t-card-title` or `t-section-title` in FeedbackOps frontend briefs (`apps/fo-frontend/**`); FO `lint:design` (`no-unknown-classes`) rejects them. For 14px/600 use FO `text-base font-semibold`; FO `text-sm` is 13px.
- The real-server assembly (`dev:real` + issue database) cannot show the zero-space home: the log-dev space menu requires only `platform:view`, so every logged-in user has a space. Verify the zero-space state with the home unit test and do not specify a “zero-space persona” in UX briefs.
- Run the FeedbackOps visual harness from the repository root with `bash ops/feedbackops/conductor/scripts/visual.sh run`. It finds the checkout root from git and reads the app path from `ops/feedbackops/paths.sh`.
- If observed behavior differs from an assertion, compare the brief and contracts (06, ADR) before weakening the assertion — if they conflict, fix the code to match the contract.
- Verify release and tag state remotely with `gh release list`, then `git fetch --tags` and `git tag`; local tags may be stale.
- Before merging factual PRs (introduction site, docs, status tables), rebase on `origin/main` and recheck every issue number in the PR body with `gh issue view <n> --json state` — issue status may change during review.
- If a site capture (`site/scripts/shots.mjs`) is described as showing asynchronously loaded content, wait for that content in the capture preparation step — `go()`'s `aria-busy` wait does not wait for it.
- A test may pass locally while a delayed timer runs after the test in CI and calls an API missing from jsdom, causing vitest to exit 1 after all tests pass. When stubbing a global absent from jsdom, leave the stub installed if there was no original value; treat CI `Unhandled Errors` as failures.
- UX rechecks after changing `PanelWorkspace` presets or ratios: values persisted in `platform:workspace:v1:*<persistKey>*` by earlier reviews hide the new preset (the persisted value wins, per contract). Put in the recheck brief: “before measuring, press `기본 배치` at each stage or clear that key”. The shell sidebar default also depends on width (collapsed below 1440, `packages/sdk/shell/src/frame/AppShell.tsx`): record the measured viewport width in the brief.
- When adding a FeedbackOps bridge entry, update all four shared locations: `apps/fo-frontend/package.json` `exports`, `tooling/eslint/src/index.js` `FO_BRIDGE_ENTRIES`, the entry array in `tooling/eslint/src/boundaries.test.ts`, and the describe in `packages/adapters/fo-bridge/src/fo-entry-graph.test.ts`. After rebase, preserve main's lines and add only this node's lines and describes; verify the describe count is main plus this node — manual block merging can truncate a describe.
- In briefs for code that rewrites URL keys, specify each key's type. Do not prescribe `String(previous[key]) === value ? previous[key] : value` to preserve types; if reusing a previous value is required, start with `previous[key] !== undefined &&`.
- To review another persona alongside a reviewer on `dev:real`, open the same Vite server at `http://[::1]:5186` — Vite binds to `localhost`, not `127.0.0.1`. Cookies are host-specific, so this does not change the UX reviewer's `localhost` login.
- Before accepting worker results, compare `git status --short | wc -l` with the report's changed-file count. Put in every brief and fix brief: “`biome check --write <changed file paths>` — never pass a directory or `.`” (a wider run rewrites unrelated files).
- Worktrees created before the FeedbackOps directory merge have a `products/feedbackops/` submodule checkout that overlaps tracked files, so `git checkout origin/main` stops with “untracked … would be overwritten”. If the submodule has no changes → `git submodule deinit -f products/feedbackops` → `trash products/feedbackops` → checkout.
- Checkouts that installed FeedbackOps nested before the root-workspace merge keep old installs in `products/feedbackops/node_modules` and the `node_modules` under `apps/fo-*` and `packages/fo-*`; `turbo` then resolves to 2.3.3 inside the FeedbackOps directory. If present → `trash products/feedbackops/node_modules apps/fo-*/node_modules packages/fo-*/node_modules`, then run root `pnpm install --frozen-lockfile`.
- The FeedbackOps visual harness (`apps/fo-frontend/tests/visual`) is darwin-only and is absent from CI and `gate.sh`. Before merging changes to FO screens or shared `packages/sdk/{ui,shell,kernel,components}`, run `bash ops/feedbackops/conductor/scripts/visual.sh run <filter>` from the repository root on the host. The worker sandbox cannot launch Chromium; the conductor runs it, reviews diff images for intent, regression, or flake, and uses `update` only for intended changes.
- For moves or renames in SDK packages (`packages/sdk/{contracts,ui,kernel,components,shell}`), run `pnpm sdk:pack --out <dir> && pnpm sdk:consumer-check <dir>` on the host in addition to the four root checks — CI runs this gate, but the root checks do not.

