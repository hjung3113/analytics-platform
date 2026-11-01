# Conductor profile — analytics-platform

Repository-specific settings for the global `issue-wave-conductor` skill. Shared procedure lives in the skill. Work rules live in root `AGENTS.md`, which wins on conflict. `$CONDUCTOR` = this folder. `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`. Settings: [`conductor.json`](conductor.json). Multi-session rules: [`LANES.md`](LANES.md). Brief and worker traps: §Traps.

There is no database or login (mock adapter). Evidence comes from Playwright E2E (`apps/platform-e2e`) and the mock preview.

## Flow

- Base is `main`. Squash merge. Branch name is `feat/<n>-<slug>`. `$MAIN` = `AP_MAIN`. `WAVE_BRIEFS` = `$AP_MAIN/.review/wave/`.
- Run `git config workerops.protectedBases none` once per clone for `ship-pr.sh`.
- Update the issue's `.planning/README.md` line in the same PR.
- Merge grant: ask once at slice start (a lane session uses its brief's grant). Recommended answer: "merge after CI and review pass, then report". Ask the owner before tagging an app `v0.x`.

## Size and path (#1040)

The lead writes the planned tier in the assignment comment (`tier=full|light`). Before ship, the lane runs `bash .agents/conductor/scripts/tier.sh origin/main HEAD` on the committed branch. The same diff always gives the same answer. If it says `tier=full` but the issue was planned light, run one `review-final` before merge.

| tier | When (any of) | Workers | Review | Fix rounds |
| --- | --- | --- | --- | --- |
| **full** | non-test, non-`.md` source under `packages/sdk/{kernel,components,shell,ui,contracts}`, `packages/adapters/*`, `apps/platform-web`, `apps/platform-api`, `apps/feature-screens`, `packages/feature-shared` (either side of a rename); `review-plan.py` `flags.permission`; `ux=required`; the issue is `impl-complex` | ≤ 3 per PR: implementer + `review-final` (+ `review-ux` when screens change) + one fix | 1 | 1. If a blocker or major is still open after it, a second round goes to `impl-complex` and gets a fix-diff check. Re-review only after a permission or data-leak fix. |
| **light** | everything else: pure renames (R100), moves, docs, copy, generator output, sample-menu changes without permission or URL/Context logic | none — the lane edits directly | none — the host reads the diff and records `tier=light` plus `git diff --numstat` in VERIFY | — |

- **Measured (heuristic, PR #1041 review):** the paths-only first draft was replayed on the last 250 merges with archived reviews. 19 of 50 "light" merges had a blocker or major. Most were in `apps/feature-screens` or hit `flags.permission`, and both are now full. The current rule has not been re-measured, so do not widen light without new data.
- **PR count:** at most 3 PRs per issue. Bundle mechanical work into one PR. Split only where a full-tier review needs isolation.
- **Copy-only edits under full paths:** the lead may mark the PR light with a numstat line ("copy only"), unless `flags.permission` fires.
- The fix-diff rule in the full row (one fix round; a still-open blocker or major sends the second round to `impl-complex` with a fix-diff check) replaces global skill step 7f — this profile owns that rule.
- Before merge, run `bash .agents/conductor/scripts/ship-check.sh <issue> <worktree>` on both merge paths ([addenda/merge.md](addenda/merge.md)): it fails when a full-tier diff has no `review-plan:` line or review-final record in VERIFY, or a `ux=required` diff has no UX record and no existing `ux-skip:` evidence path.
- **Brief check:** only for `impl-complex` briefs, plus a `review-quality` plan review when a brief changes 06 contracts, package boundaries or `sdk:api`. No other intermediate checks and no separate doc-sync workers. The implementer updates the owning docs in the same PR ([`docs/AGENTS.md`](../../docs/AGENTS.md)).
- **Review findings:**
  - blocker or major → the fix round.
  - minor or nit → fixed inline before merge if trivial, otherwise one backlog line. No follow-up PR only for minors.
- **Keep review reports:** `ship-pr.sh --archive-review` writes them to `$WAVE_BRIEFS/<n>/`, where the lead measures review hit rate per release.

## Complexity

Route to `impl-complex` (always full) if any of these hold:
- A Kernel contract and its consumers change together, or 3+ packages change.
- Permissions, Scope, URL security boundaries (`safeReturnTo`, destination ID vs Context), or data-leak rules change.
- State or ordering logic changes: query lifecycle (cancel, generation, `ready` gate), history push/replace, page-key cleanup on Context change.

## Launch

- `python3 $ENGINE/launch-worker.py <n> <slug>` creates the Orca worktree from `origin/main`, runs `pnpm install`, merges [`addenda/`](addenda/) into `.review/00-IMPL-RULES.md` / `00-REVIEW-RULES.md`, and starts the runner.
  - Environment: `WAVE_STATE`, `WAVE_BRIEFS`, `AP_MAIN`.
  - Role: `WORKER_ROLE`. Overrides: `WORKER_MODEL`, `WORKER_EFFORT`.
- Capacity and slots: see [`LANES.md`](LANES.md) §Machine resources. Run issues in parallel only when their files do not overlap.
- **Parallelism checkpoint.** At every wake (a worker finished, a wait was armed, a node is blocked, before a local root verify) the progress message names the independent work that could start now and starts it, or says what blocks it (memory slot, file overlap, dependency). Candidates:
  - review-final, review-ux (when the review plan says `ux=required`) and the host root verify start together on the first implementation commit; their findings go into one fix round, and review-ux re-checks only the fixed items. Reason: a review-ux run after the fix round adds a second fix round.
  - A graph node whose dependencies are already committed on an in-flight branch starts stacked on that branch (`orca worktree create --base-branch <branch>`, then `launch-worker.py --reuse`); its brief names the base branch's in-flight files it must not edit, and it is rebased onto `main` after the base merges. Reason: waiting for the base's review rounds idles the slot.
  - Research and plans for the next issue (read-only) run while workers implement.
  - Only local root test/build/E2E runs are serial (memory); worker runs and reviews are not.
- Feature issues: `launch-worker.py <n> <slug> feature`.
  - `scripts/feature-prepare.sh` fills `.env` and creates the issue DB on 5439 (`verify-db.sh create <n>`).
  - Rules: `addenda/impl-rules-feature.md`.
  - Run `verify-db.sh up` once beforehand (in that checkout, `cp ops/platform-api/.env.example ops/platform-api/.env` first if `.env` is missing). Never use 5434.
  - A branch that adds a migration: `verify-db.sh drop <n>` → `verify-db.sh create <n> --migrate-from <worktree>` before integration tests (the worker brief says the conductor does this).
  - After merge, run `verify-db.sh drop <n>`. At wave end, run `verify-db.sh down`.

## Verify

Every step must exit 0 before commit.

1. Changed-package checks.
2. Root checks:
   - `verify=full`: run `bash .agents/conductor/scripts/verify-root.sh <log-dir>` (lint → typecheck → test+build under `heavy.lock`; exits 3 if capacity says `start=no`).
   - `verify=light`: run `verify-root.sh --light <log-dir>` (lint + typecheck). Test and build are left to PR CI. `tier.sh` gives `verify=full` for any change under the full paths, tests included (root `AGENTS.md` §검증).
   - Never use `--force` or diff filters. The turbo cache decides what reruns.
3. E2E, only when Kernel, shell, shared components or the mock server change. Run the new describe first, then the brief's "Impact" describes with `-g "A|B"`. Never run full `pnpm e2e` locally, except to reproduce a CI failure. PR and main-push CI run only the affected specs (`.github/scripts/select-e2e.mjs`: all for `menus/**`, `platform/**`, `packages/**` and anything it cannot narrow; none for docs-only; just that spec for a spec-only change). A green PR is therefore not a full E2E record; the release `full=true` run is.
4. If menu manifests, `menus.ts`, contract menu types or `tooling/gen-menu` change: run `node tooling/gen-menu/scripts/probe.ts`, never in a worktree with a live preview.
5. Feature gates, when feature package or folded CI inputs change (`.github/workflows/ci.yml`):
   - `bash ops/platform-api/scripts/ci/gate.sh static-extra`; run `unit` only for package suites not already covered by the successful unified root test. Root lint already runs bounded committed changed-file Biome and root typecheck covers feature packages.
   - Integration: `PLATFORM_API_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @ap/platform-api test:integration`. Never use `gate.sh integration`, because it truncates the source DB.
6. Hygiene: `python3 $ENGINE/worker-hygiene.py <worktree>`.
7. Gates that run only in CI — run them locally when their inputs change:
   - Public SDK types change → `pnpm build`, then `pnpm sdk:api` (on intended changes, `--update` plus one line in `docs/integration/sdk-git-tag-consumption.md`).
   - SDK files move or are renamed → `pnpm sdk:pack --out <d> && pnpm sdk:consumer-check <d>`.
   - A CSS rule is removed → add the `css-removal-ok` label and wait for the rerun before ship.

Fix design-lint errors with the token, variant or component the message names.

- **Fix round:** run changed packages, root lint/typecheck/test (cached), affected `-g` E2E, affected screen gates, hygiene, and step 7 if its inputs changed. No build, full E2E or probe unless a build input changed.
- **Final head:** run only hygiene. Run the fix-round checks again only after a rebase conflict.

## Browser evidence

- UX reviewers drive the branch and baseline previews themselves:
  - Start: `$ENGINE/app-preview.py start <checkout> --name <n>-branch` (baseline: `<n>-main`, installed with `--frozen-lockfile`). Ports are 5180–5199.
  - Stop the preview in the same turn.
- Use `ego-browser`. If it is blocked, use a one-off Playwright capture from `apps/platform-e2e` and record the substitution in VERIFY.
- Before merge, a PR that changes behavior (state, request shape, response fields) gets one real-server check by the conductor recorded in VERIFY: `verify-db.sh create <n>`, then `python3 ops/platform-api/conductor/scripts/app-preview.py start <checkout> --backend --env $WAVE_STATE/env.verify.<n> --seed --name <n>-real` (the platform assembly in real mode on the checkout's own backend), and `stop <n>-real` in the same turn.
- Worker briefs take the mock app start command from `conductor.json` `app_preview.command` — never hardcode a preview command in a brief.

## Review

- Plan: `python3 $ENGINE/review-plan.py <checkout> [--base origin/main]` (rules in `conductor.json` `review_plan`). For light tier, it sets no reviewers. `flags.permission` and `ux=required` always make the PR full.
- UX skip: when `review-plan.py` says `ux=required` but no `review-ux` runs, record the skip reason and the substitute browser evidence in the PR body, and add an `ux-skip: <evidence path>` line to VERIFY — `ship-check.sh` blocks the merge without it. Unit-test mock servers and `focusManager` toggles do not prove the real-server path.
- Flags:
  - `permission` / `instructions` → global skill 7a.
  - `e2e` → confirm Verify step 3.
  - `submodule` → confirm the screen gates.
  - `contract` → give the changed 06 sections and ADRs to the code reviewer.
- Rules: code reviewers use global `templates/review-rules.md` + [`addenda/review-rules.md`](addenda/review-rules.md). UX and quality reviewers use the global personas plus the lenses below.
- `review-perf` only after a measured regression.
- Conflict order: permission and data-leak rules → ADRs, 06 contracts, recorded owner decisions.
- Every brief has an **Impact** section. It lists:
  - consumers found with `rg`
  - docs that must change
  - regression risks, each with the test or E2E describe that catches it (name the describe for UI, shell, Kernel or shared-component changes; write "not covered" and add a test where none exists)
- Changes to skills, engine, templates or personas → `$ENGINE/upstream-file.sh` (conductor-engine issue).

## Review lens: UX

Reports are in Korean.

- **Preview:** mock assembly only. Ports have separate localStorage. Set the role in localStorage `platform:role` as a JSON string (`"admin"`). Pick loading, empty and error states in mock DevTools each time a page opens.
- **Viewport:** Follow root `AGENTS.md`'s desktop capture scope: 1440×900, plus 1280 with a detail slot open.
- **References:**
  - root `AGENTS.md`, `DESIGN.md`, `GLOSSARY.md`
  - `docs/contract/platform-ui-contract.md`: shell §7, detail slot §13, charts §16, status §19, cross-menu links §22, plus the issue's sections and ADRs
  - the owner-confirmed `?variant=` prototype — if the implementation differs, raise `owner-question`
- **Checks:**
  - URL: refresh, back/forward and copied links give the same screen. Context bar changes keep or clear page values per 06 §6.4.
  - Keyboard: 06 §26.
  - Copy: Korean, existing i18n wording, `GLOSSARY.md` terms.
  - Visuals: 50px page header, tokens, `@ap/ui`/`@ap/components`.
- **Severity:** blocker = data from another Scope is visible. major = 06 violation.

## Review lens: quality

Reports are in Korean.

- **Scope:** `<last tag>...origin/main`.
- **References:** root and `packages/AGENTS.md` and the touched folders' `AGENTS.md`; `docs/integration/platform-packages.md` §3; 06 §24 (promote after 2–3 real consumers); `docs/AGENTS.md`.
- **Look for:**
  - boundary leaks (Kernel, components or shell know about menus or mocks; reverse imports; menus using `@ap/*` internals; screen primitives outside `@ap/ui`; the frontend treated as the permission authority)
  - wrong commonization
  - missing `$TURBO_ROOT$` turbo inputs
  - dead code (including `?variant=` leftovers)
  - doc drift
- **Release blocker:** only boundary, 06 or permission violations that produce wrong behavior or data.

## Fold scope

A PR may also touch, outside the issue diff, only the changed consumer's `menus/<space>/<group>/src/` or `platform/<feature>/src/` and the i18n dictionary.

## Deferrals

- Every item not done now — a `minor`/`nit` outside the touched area, an accepted limit, an owner "not now" — is recorded the same day as one row in [`.planning/backlog.md`](../../.planning/backlog.md): item, reason, reopen condition. The PR body lists it under **Deferred** with a link to the row; a PR body is never the only record. Reason: a deferral with no recorded home is lost at session end.

## Slice close

The release order is in [`LANES.md`](LANES.md) §Lead.
- Quality review scope: `<last tag>...origin/main`. Add a `review-ux` walk-through on the `origin/main` preview if screens changed.
- Use the full SHA: `SHA=$(git rev-parse origin/main)` and `gh release create --target "$SHA"`.
- `$ENGINE/app-preview.py status` must show no tracked previews before handoff.

## Tools

Shared assets come from conductor-engine `install.sh`. Run `install.sh --check` if a warning says the install is stale.

| Tool | Purpose |
| --- | --- |
| `$ENGINE/launch-worker.py <n> <slug> [feature]` | See Launch |
| `$ENGINE/review-plan.py` | Review plan |
| `$ENGINE/wave-status.py [--json] [--prs] [--state-dir <d>]` | Read-only snapshot of workers, previews, worktrees and PR CI |
| `$ENGINE/worker-hygiene.py <worktree>` | Verify step 6 |
| `$ENGINE/app-preview.py start\|stop\|status` | Mock preview. `stop` checks ownership and skips with `ownership unclear`. |
| `bash tooling/scripts/next-adr.sh` | Next ADR number (reserve on #598) |
| `scripts/tier.sh [<base>] [<head>]` | Tier, verify and merge mode for a diff |
| `scripts/capacity.sh` | Machine capacity stage |
| `scripts/with-lock.sh <lock> "<purpose>" -- <cmd>` | Take a lock or slot for the command's lifetime |
| `scripts/verify-root.sh [--light] <log-dir>` | Verify step 2 |
| `scripts/lock-audit.sh` | Find locks left by finished work |
| `scripts/lead-check.sh` | Lead resume and 2-hour check (LANES §Lead) |
| `scripts/ship-check.sh <issue> <worktree>` | Pre-merge record gate |
| `python3 scripts/board.py {init\|add\|set\|show\|check}` | Lane board at `$AP_MAIN/.review/lanes/board.json` |

## Traps

The list is in [`addenda/traps.md`](addenda/traps.md). Read it when you write a brief and when its topic comes up. Append new traps there, one bullet each.
