# Conductor profile — analytics-platform

Repository-specific settings for the global `issue-wave-conductor` skill. Shared procedure lives in the skill. Work rules live in root `AGENTS.md`, which wins on conflict. `$CONDUCTOR` = this folder. `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`. Settings: [`conductor.json`](conductor.json). Multi-session rules: [`LANES.md`](LANES.md). Brief and worker traps: [`addenda/traps.md`](addenda/traps.md) — read it when writing a brief.

There is no database or login (mock adapter). Evidence comes from Playwright E2E (`apps/platform-e2e`) and the mock preview.

## Flow

- Base is `main`. Squash merge. Branch name is `feat/<n>-<slug>`. `$MAIN` = `AP_MAIN`. `WAVE_BRIEFS` = `$AP_MAIN/.review/wave/`.
- Run `git config workerops.protectedBases none` once per clone for `ship-pr.sh`.
- Update the issue's `.planning/README.md` line in the same PR.
- Merge grant: ask once at slice start (a lane session uses its brief's grant). Recommended answer: "merge after CI and review pass, then report". Ask the owner before tagging an app `v0.x`.

## Size and path (#1040)

Run `bash .agents/conductor/scripts/tier.sh origin/main <branch>` on the planned or actual diff. The same diff always gives the same answer.

| tier | When | Workers | Review | Fix rounds |
| --- | --- | --- | --- | --- |
| **full** | Non-test source under `packages/sdk/{kernel,components,shell,ui,contracts}`, `packages/adapters/*`, `apps/platform-web`, `apps/fo-backend`, `packages/fo-shared` — or the issue is `impl-complex` (below) | implementer + 1 `review-final` (+ `review-ux` if screens change) | 1 | ≤ 1. Re-review only after a permission or data-leak fix. |
| **light** | Everything else, plus pure renames (R100), moves, copy, docs, generator output, sample-menu changes | none — the lane edits directly | none — the host reads the diff and records `tier=light` plus `git diff --numstat` in VERIFY | — |

- **PR count:** at most 3 PRs per issue. Bundle mechanical work into one PR. Split only where a full-tier review needs isolation.
- **Copy-only edits under full paths:** the lead may mark the PR light with a numstat line ("copy only").
- **Brief check:** only for `impl-complex` briefs, plus a `review-quality` plan review when a brief changes 06 contracts, package boundaries or `sdk:api`. Do not add intermediate checks, fix-diff checks or separate doc-sync workers. The implementer updates the owning docs in the same PR ([`docs/AGENTS.md`](../../docs/AGENTS.md)).
- **Review findings:**
  - blocker or major → one fix round.
  - minor or nit → fix inline before merge if trivial, otherwise drop with one backlog line. Never open a follow-up PR just for minors.
- **Keep review reports:** `ship-pr.sh --archive-review` writes them to `$WAVE_BRIEFS/<n>/`, where the lead measures review hit rate per release.

`impl-complex` (route to that role) if any of these hold:
- A Kernel contract and its consumers change together, or 3+ packages change.
- Permissions, Scope, URL security boundaries (`safeReturnTo`, destination ID vs Context), or data-leak rules change.
- State or ordering logic changes: query lifecycle (cancel, generation, `ready` gate), history push/replace, page-key cleanup on Context change.

## Launch

- `python3 $ENGINE/launch-worker.py <n> <slug>` creates the Orca worktree from `origin/main`, runs `pnpm install`, merges [`addenda/`](addenda/) into `.review/00-IMPL-RULES.md` / `00-REVIEW-RULES.md`, and starts the runner.
  - Environment: `WAVE_STATE`, `WAVE_BRIEFS`, `AP_MAIN`.
  - Role: `WORKER_ROLE`. Overrides: `WORKER_MODEL`, `WORKER_EFFORT`.
- Capacity and slots: see [`LANES.md`](LANES.md) §Machine resources. Run issues in parallel only when their files do not overlap.
- FeedbackOps issues: `launch-worker.py <n> <slug> fo`.
  - `scripts/fo-prepare.sh` fills `.env` and creates the issue DB on 5439 (`verify-db.sh create <n>`).
  - Rules: `addenda/impl-rules-fo.md`.
  - Run `verify-db.sh up` once beforehand. Never use 5434.
  - After merge, run `verify-db.sh drop <n>`.

## Verify

Every step must exit 0 before commit.

1. Changed-package checks.
2. Root checks:
   - `verify=full`: run `bash .agents/conductor/scripts/verify-root.sh <log-dir>` (lint → typecheck → test+build under `heavy.lock`; exits 3 if capacity says `start=no`).
   - `verify=light`: run `verify-root.sh --light <log-dir>` (lint + typecheck). Test and build are left to PR CI.
   - Never use `--force` or diff filters. The turbo cache decides what reruns.
3. E2E, only when Kernel, shell, shared components or the mock server change. Run the new describe first, then the brief's "Impact" describes with `-g "A|B"`. Never run full `pnpm e2e` locally, except to reproduce a CI failure.
4. If menu manifests, `menus.ts`, contract menu types or `tooling/gen-menu` change: run `node tooling/gen-menu/scripts/probe.ts`, never in a worktree with a live preview.
5. FeedbackOps gates, only when `.github/workflows/feedbackops.yml` `paths` are touched:
   - `bash ops/feedbackops/scripts/ci/gate.sh static --base origin/main` and `unit`.
   - Integration: `FEEDBACKOPS_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @fops/backend test:integration`. Never use `gate.sh integration`, because it truncates the source DB.
6. Hygiene: `python3 $ENGINE/worker-hygiene.py <worktree>`.
7. Gates that run only in CI — run them locally when their inputs change:
   - Public SDK types change → `pnpm build`, then `pnpm sdk:api` (on intended changes, `--update` plus one line in `docs/integration/sdk-git-tag-consumption.md`).
   - SDK files move or are renamed → `pnpm sdk:pack --out <d> && pnpm sdk:consumer-check <d>`.
   - A CSS rule is removed → add the `css-removal-ok` label and wait for the rerun before ship.

Fix design-lint errors with the token, variant or component the message names.

- **Fix round:** run changed packages, root lint/typecheck/test (cached), affected `-g` E2E, affected FO gates, hygiene, and step 7 if its inputs changed. No build, full E2E or probe unless a build input changed.
- **Final head:** run only hygiene. Run the fix-round checks again only after a rebase conflict.

## Browser evidence

- UX reviewers drive the branch and baseline previews themselves:
  - Start: `$ENGINE/app-preview.py start <checkout> --name <n>-branch` (baseline: `<n>-main`, installed with `--frozen-lockfile`). Ports are 5180–5199.
  - Stop the preview in the same turn.
- Use `ego-browser`. If it is blocked, use a one-off Playwright capture from `apps/platform-e2e` and record the substitution in VERIFY.
- Before merge, a PR that changes behavior (state, request shape, response fields) gets one real-server check by the conductor (issue DB + `dev:real`) recorded in VERIFY.

## Review

- Plan: `python3 $ENGINE/review-plan.py <checkout> [--base origin/main]` (rules in `conductor.json` `review_plan`). The tier table above caps what it returns.
- Flags:
  - `permission` / `instructions` → global skill 7a.
  - `e2e` → confirm Verify step 3.
  - `submodule` → confirm the FO gates.
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
- **Viewport:** 1440×900, plus 1280 with a detail slot open.
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
  - boundary leaks (Kernel, components or shell know about menus or mocks; reverse imports; menus using `@ap/*` internals; FO primitives outside `@ap/ui`; the frontend treated as the permission authority)
  - wrong commonization
  - missing `$TURBO_ROOT$` turbo inputs
  - dead code (including `?variant=` leftovers)
  - doc drift
- **Release blocker:** only boundary, 06 or permission violations that produce wrong behavior or data.

## Fold scope

A PR may also touch, outside the issue diff, only the changed menu's `menus/<space>/<group>/src/` and the i18n dictionary.

## Slice close

The release order is in [`LANES.md`](LANES.md) §Lead.
- Quality review scope: `<last tag>...origin/main`. Add a `review-ux` walk-through on the `origin/main` preview if screens changed.
- Use the full SHA: `SHA=$(git rev-parse origin/main)` and `gh release create --target "$SHA"`.
- `$ENGINE/app-preview.py status` must show no tracked previews before handoff.

## Tools

Shared assets come from conductor-engine `install.sh`. Run `install.sh --check` if a warning says the install is stale.

| Tool | Purpose |
| --- | --- |
| `$ENGINE/launch-worker.py <n> <slug> [fo]` | See Launch |
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
