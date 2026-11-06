Lead reads: §Flow, §Size and path, §Launch, §Verify
Lane sessions read only those sections (SKILL §0 full read does not apply; this profile wins). Reviewers read only their lens section.

# Conductor profile — analytics-platform

Repository-specific settings for the global `issue-wave-conductor` skill. Shared procedure lives in the skill. Work rules live in root `AGENTS.md`, which wins on conflict. `$CONDUCTOR` = this folder. `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`. Settings: [`conductor.json`](conductor.json). Multi-session rules: [`LANES.md`](LANES.md). Brief and worker traps: §Traps.

There is no database or login (mock adapter). Evidence comes from Playwright E2E (`apps/platform-e2e`) and the mock preview.

## Flow

- Base is `main`. Squash merge. Branch name is `feat/<n>-<slug>`. `$MAIN` = `AP_MAIN`. `WAVE_BRIEFS` = `$AP_MAIN/.review/wave/`.
- Run `git config workerops.protectedBases none` once per clone for `ship-pr.sh`.
- Update the issue's `.planning/README.md` line in the same PR.
- Merge grant: a lane session uses its brief's grant. Ask the owner before tagging an app `v0.x`.

## Size and path

The lead writes the planned tier in the assignment comment (`tier=full|light`). Before ship, the lane runs `bash .agents/conductor/scripts/tier.sh origin/main HEAD` on the committed branch. If it says `tier=full` but the issue was planned light, run one `review-final` before merge.

| tier | When (any of) | Workers | Review | Fix rounds |
| --- | --- | --- | --- | --- |
| **full** | non-test, non-`.md` source under `packages/sdk/{kernel,components,shell,ui,contracts}`, `packages/adapters/*`, `apps/platform-web`, `apps/platform-api`, `apps/feature-screens`, `packages/feature-shared` (either side of a rename); `review-plan.py` `flags.permission`; `ux=required`; the issue is `impl-complex` | ≤ 3 per PR: implementer + `review-final` (+ `review-ux` when screens change) + one fix | 1 | 1 (round cap: see below). Re-review only after a permission or data-leak fix. |
| **light** | everything else: pure renames (R100), moves, docs, copy, generator output, sample-menu changes without permission or URL/Context logic | none — the lane edits directly | none — the host reads the diff and records `tier=light` plus `git diff --numstat` in VERIFY | — |

- Do not widen `light` without a new replay measurement (#1041).
- **PR count:** at most 3 PRs per issue. Bundle mechanical work into one PR. Split only where a full-tier review needs isolation.
- **Copy-only edits under full paths:** the lead may mark the PR light with a numstat line ("copy only"), unless `flags.permission` fires.
- **Round cap (the only place; replaces global skill step 7f):** the full row allows one fix round; a blocker or major still open after it sends the second round to `impl-complex` with a fix-diff check. More than 2 `review-final` runs on one issue need an `over-cap: <reason>` line in VERIFY (`ship-check.sh` blocks without it); the lane asks `질문 #n 한도 <rounds>`. A minor or nit never starts a round past the cap.
- Before merge, run `bash .agents/conductor/scripts/ship-check.sh <issue> <worktree>` on both merge paths ([addenda/merge.md](addenda/merge.md)): it fails when a full-tier diff has no `review-plan:` line or review-final record in VERIFY, or a `ux=required` diff has no UX record and no existing `ux-skip:` evidence path.
- **Brief check:** only for `impl-complex` briefs, plus a `review-quality` plan review when a brief changes 06 contracts, package boundaries or `sdk:api`. No separate doc-sync workers; the implementer updates the owning docs in the same PR ([`docs/AGENTS.md`](../../docs/AGENTS.md)).
- **Review findings:** blocker or major → the fix round. Minor or nit → fixed inline before merge if trivial, otherwise one backlog line.
- **Keep review reports:** `ship-pr.sh --archive-review` writes them to `$WAVE_BRIEFS/<n>/`.

## Complexity

Route to `impl-complex` (always full) if any of these hold:
- A Kernel contract and its consumers change together, or 3+ packages change.
- Permissions, Scope, URL security boundaries (`safeReturnTo`, destination ID vs Context), or data-leak rules change.
- State or ordering logic changes: query lifecycle (cancel, generation, `ready` gate), history push/replace, page-key cleanup on Context change.

## Launch

- `python3 $ENGINE/launch-worker.py <n> <slug>` creates the worktree, installs, merges [`addenda/`](addenda/) into `.review/00-IMPL-RULES.md` / `00-REVIEW-RULES.md` and starts the runner. Environment: `WAVE_STATE`, `WAVE_BRIEFS`, `AP_MAIN`. Role: `WORKER_ROLE`; overrides `WORKER_MODEL`, `WORKER_EFFORT`.
- Capacity, slots and waiting: [`LANES.md`](LANES.md) §Machine resources. Run issues in parallel only when their files do not overlap. Parallelism otherwise follows SKILL §Loop; here only local root test/build/E2E is serial (`heavy.lock`).
- **Stacking:** a node whose dependencies are committed on an in-flight branch starts on it (`orca worktree create --base-branch <branch>`, then `launch-worker.py --reuse`). Its brief names the base branch's in-flight files it must not edit; it rebases onto `main` after the base merges, and only after its own worker or reviewer has finished.
- **Visual-judgment floor:** work that decides how a screen looks (layout, spacing, hierarchy, new component visuals, `?variant=` prototypes, screen-shape fix rounds, `site/` design) runs on role `impl-complex-sol` at effort `high`. Plain coding stays on the routing default. Split an issue so only its visual part goes to that worker. Reason: lower models code fine but make the UI ugly.
- Feature issues: `launch-worker.py <n> <slug> feature`; rules in `addenda/impl-rules-feature.md`.
  - `scripts/feature-prepare.sh` fills `.env` and creates the issue DB on 5439 (`verify-db.sh create <n>`). Never use 5434.
  - Run `verify-db.sh up` once beforehand (`cp ops/platform-api/.env.example ops/platform-api/.env` first if `.env` is missing).
  - A branch that adds a migration: `verify-db.sh drop <n>` → `verify-db.sh create <n> --migrate-from <worktree>` before integration tests.
  - After merge, `verify-db.sh drop <n>`; at wave end, `verify-db.sh down`.

## Verify

Every step must exit 0 before commit.

1. Changed-package checks.
2. Root checks:
   - `verify=full`: `bash .agents/conductor/scripts/verify-root.sh <log-dir>` (lint → typecheck → test+build under `heavy.lock`; exits 3 if capacity says `start=no`, 75 if `heavy.lock` is held). Only a summary with `step=test` and `step=build` counts.
   - `verify=light`: `verify-root.sh --light <log-dir>` (lint + typecheck); test and build are left to PR CI. `tier.sh` gives `verify=full` for any change under the full paths, tests included.
3. E2E, only when Kernel, shell, shared components or the mock server change. Run the new describe first, then the brief's Impact describes with `-g "A|B"`. Never run full `pnpm e2e` locally, except to reproduce a CI failure. PR and main-push CI run only the affected specs (`.github/scripts/select-e2e.mjs`), so a green PR is not a full E2E record; the release `full=true` run is.
4. Menu manifests, `menus.ts`, contract menu types or `tooling/gen-menu` changed: `node tooling/gen-menu/scripts/probe.ts`, never in a worktree with a live preview.
5. Feature gates, when feature packages or `.github/workflows/ci.yml` change:
   - `bash ops/platform-api/scripts/ci/gate.sh static-extra`; `unit` only for suites the root test does not cover.
   - Integration: `PLATFORM_API_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @ap/platform-api test:integration`, not `gate.sh integration` (it truncates the source DB). A migration node runs the full suite on its recreated DB. One issue DB serves one run at a time: wait for the worker to end first.
6. Hygiene: `python3 $ENGINE/worker-hygiene.py <worktree>`.
7. Gates that run only in CI — run them locally when their inputs change:
   - Public SDK types or exports change → `pnpm build`, then `pnpm sdk:api` (intended changes: `--update` plus one line in `docs/integration/sdk-git-tag-consumption.md`), `pnpm sdk:test`.
   - SDK files move or are renamed → `pnpm sdk:pack --out <d> && pnpm sdk:consumer-check <d>`.
   - A CSS rule is removed → add the `css-removal-ok` label and wait for the rerun before ship.

- **Fix round:** changed packages, root lint/typecheck/test (cached), affected `-g` E2E, affected screen gates, hygiene, and step 7 if its inputs changed. No build, full E2E or probe unless a build input changed.
- **Final head:** hygiene only; rerun the fix-round checks only after a rebase conflict.

## Browser evidence

- UX reviewers drive the previews themselves: `$ENGINE/app-preview.py start <checkout> --name <n>-branch` (baseline `<n>-main`). Ports 5180–5199. Stop the preview in the same turn and close the ego tabs (LANES §Machine resources).
- Browser control is `ego-browser`; if it is blocked, use a one-off Playwright capture from `apps/platform-e2e` and record the substitution in VERIFY.
- A PR that changes behavior (state, request shape, response fields) gets one real-server check by the conductor, recorded in VERIFY: `verify-db.sh create <n>`, then `python3 ops/platform-api/conductor/scripts/app-preview.py start <checkout> --backend --env $WAVE_STATE/env.verify.<n> --seed --name <n>-real`, and `stop <n>-real` in the same turn.
- Worker briefs take the mock app start command from `conductor.json` `app_preview.command`; never hardcode one.

## Review

- Plan: `python3 $ENGINE/review-plan.py <checkout> [--base origin/main]` (rules in `conductor.json` `review_plan`). Light tier gets no reviewers. `flags.permission` and `ux=required` always make the PR full.
- UX skip: when `ux=required` but no `review-ux` runs, record the skip reason and the substitute browser evidence in the PR body and add `ux-skip: <evidence path>` to VERIFY (reason on another line); `ship-check.sh` blocks without it.
- Impeccable check: a PR with a new screen, new component visuals or a layout change gets a separate `impl-complex-sol` run at effort `high` (never the implementer judging its own work) doing `impeccable critique` + `audit` on the branch preview (1440×900), alongside review-final and before the PR opens; its findings join the one fix round. VERIFY: `impeccable: <report path>` or the skip reason. `?variant=` prototypes get one critique pass on all variants; apply its fixes, then capture, and name the report in the confirmation Artifact and question. Reason: review-ux checks flow, not visual craft.
- Flags: `permission` / `instructions` → SKILL 7a. `e2e` → Verify step 3. `submodule` → the screen gates. `contract` → give the changed 06 sections and ADRs to the code reviewer.
- Code reviewers use the global `templates/review-rules.md` + [`addenda/review-rules.md`](addenda/review-rules.md). UX and quality reviewers use the global personas plus the lenses below. `review-perf` only after a measured regression.
- Conflict order: SKILL 7f repo invariants = permission and data-leak rules, then 06 contracts.
- Every brief has an **Impact** section: consumers found with `rg`, docs that must change, regression risks with the test that catches each (UI, shell, Kernel or shared-component changes name the E2E describe).

## Review lens: UX

Reports are in Korean.

- **Preview:** mock assembly only. Set the role in localStorage `platform:role` as a JSON string (`"admin"`). Pick loading, empty and error states in mock DevTools each time a page opens.
- **Viewport:** root `AGENTS.md` desktop scope: 1440×900, plus 1280 with a detail slot open.
- **References:** root `AGENTS.md`, `DESIGN.md`; `GLOSSARY.md` only to look up a term; `docs/contract/platform-ui-contract.md` (shell §7, detail slot §13, charts §16, status §19, cross-menu links §22, plus the issue's sections and ADRs); the owner-confirmed `?variant=` prototype — if the implementation differs, raise `owner-question`.
- **Checks:**
  - URL: refresh, back/forward and copied links give the same screen. Context bar changes keep or clear page values per 06 §6.4.
  - Keyboard: 06 §26.
  - Copy: Korean, existing i18n wording, `GLOSSARY.md` terms.
  - Visuals: 50px page header, tokens, `@ap/ui`/`@ap/components`.
- **Severity:** blocker = data from another Scope is visible. major = 06 violation.

## Review lens: quality

Reports are in Korean.

- **Scope:** `<last tag>...origin/main`.
- **References:** root and `packages/AGENTS.md` and the touched folders' `AGENTS.md`; `docs/integration/platform-packages.md` §3; 06 §24; `docs/AGENTS.md`.
- **Look for:** boundary leaks (Kernel, components or shell know about menus or mocks; reverse imports; menus using `@ap/*` internals; screen primitives outside `@ap/ui`; the frontend treated as the permission authority), wrong commonization, missing `$TURBO_ROOT$` turbo inputs, dead code (including `?variant=` leftovers), doc drift.
- **Release blocker:** only boundary, 06 or permission violations that produce wrong behavior or data.

## Fold scope

A PR may also touch, outside the issue diff, only the changed consumer's `menus/<space>/<group>/src/` or `platform/<feature>/src/` and the i18n dictionary.

## Deferrals

Every item not done now — a `minor`/`nit` outside the touched area, an accepted limit, an owner "not now" — is recorded the same day as one row in [`.planning/backlog.md`](../../.planning/backlog.md): item, reason, reopen condition. The PR body lists it under **Deferred** with a link to the row. Reason: a deferral with no recorded home is lost at session end.

## Slice close

Release order: [`LANES.md`](LANES.md) §Lead. Quality review scope `<last tag>...origin/main`, plus a `review-ux` walk-through on the `origin/main` preview if screens changed. Tag with the full SHA (`git rev-parse origin/main`, `gh release create --target "$SHA"`). `app-preview.py status` must show no tracked previews at the end.

## Tools

Engine tools are listed in SKILL §0; run `install.sh --check` if a warning says the install is stale. Repo scripts (in `scripts/`):

| Tool | Purpose |
| --- | --- |
| `tier.sh [<base>] [<head>]` | Tier, verify and merge mode for a diff |
| `capacity.sh` | Machine capacity stage |
| `with-lock.sh <lock> "<purpose>" -- <cmd>` | Take a lock or slot for the command's lifetime |
| `verify-root.sh [--light] <log-dir>` | Verify step 2 |
| `lock-audit.sh` | Find locks left by finished work |
| `lead-check.sh` | Lead resume and 2-hour check (LANES §Lead) |
| `ship-check.sh <issue> <worktree>` | Pre-merge record gate |
| `merge-precheck.sh [--main-fix] <pr> <branch> <sha>` | Pre-merge main-CI and shared-path gate |
| `main-ci-watch.sh <sha>` | Watch the main push CI after a merge; writes or clears the `main-red` marker |
| `board.py {init\|add\|set\|show\|ready\|check}` | Lane board at `$AP_MAIN/.review/lanes/board.json` (`--help` has the schema) |
| `bash tooling/scripts/next-adr.sh` | Next ADR number; reservation rule in §Traps |

## Traps

[`addenda/traps.md`](addenda/traps.md): read it when you write a brief and when its topic comes up. Append new traps there, one bullet each.
