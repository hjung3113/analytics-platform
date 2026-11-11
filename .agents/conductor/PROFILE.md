Lanes read: §Flow, §Size and path, §Lanes, §Launch, §Verify
Lane sessions read only those sections (SKILL §0 full read does not apply; this profile wins). The lead reads this whole file. Reviewers read only their lens section.

# Conductor profile — analytics-platform

Repository-specific settings for the global `issue-wave-conductor` skill. Shared procedure lives in the skill. Work rules live in root `AGENTS.md`, which wins on conflict. `$CONDUCTOR` = this folder. `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`. Settings: [`conductor.json`](conductor.json). Multi-session procedure: the global `issue-wave-conductor` skill's `references/lanes.md` (`$LANES` there = the lane tools). Repo values the tools read: `conductor.json` `lanes`. Brief and worker traps: §Traps.

The mock-adapter app has no database or login; its evidence comes from Playwright E2E (`apps/platform-e2e`) and the mock preview. The core server (`apps/platform-api`) has both, and its checks follow §Verify and §Browser evidence.

## Flow

- Base is `main`. Squash merge. Branch name is `feat/<n>-<slug>`. `$MAIN` = `AP_MAIN`. `WAVE_BRIEFS` = `$AP_MAIN/.review/wave/`.
- Run `git config workerops.protectedBases none` once per clone for `ship-pr.sh`.
- The lead updates `.planning/README.md` once, in the release-docs PR. Mid-slice progress is `board.py` output.
- Merge grant: a lane session uses its brief's grant. App `v0.x` tags: At slice start ask once: 'tag when cold CI is green?'. If yes, tag when the cold CI of the tag SHA succeeds and no `bug` issue is open. If not chosen, ask once, alone, just before the tag. Record the answer on the release issue.

## Size and path

Tiers, PR count, round cap, brief check and ship-check: the global `issue-wave-conductor` skill's `references/lanes.md` §Size and path. Full-tier paths are `lanes.tier_full_regex`. AP specifics:

- **Domain-noun docs (`review-doc` terms):** a light PR that adds domain nouns under `docs/design/**`, a new ADR, `docs/product/**`, a new API contract file or `GLOSSARY.md` gets one `review-doc` terms run (persona `doc-steward`). Design PRs of the same domain opened the same day share one run. Skip it when the changed lines add no bold term outside the glossary, no new enum/table/capability name and no new menu label. Reason: terms caught before code avoid renames that need migrations; sharing a run keeps the cost at one run per design batch.
- **Plan review:** the `review-quality` plan review applies when a brief changes 06 contracts, package boundaries or `sdk:api`. Owning docs follow [`docs/AGENTS.md`](../../docs/AGENTS.md).

## Lanes

| Label | Owns | Main paths | E2E port |
| --- | --- | --- | --- |
| `lane:sdk` | Public package contracts and parts, analysis workspace, SDK quality | `packages/sdk/*`, `tooling/sdk/`, `docs/contract/`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | App assembly, mock/real adapters, server conformance, sample menus, in-house rollout | `apps/platform-web`, `packages/adapters/{mock-server,http-adapter,server-conformance}`, `menus/*`, `platform/{admin,home,my-activity,notice-voc}` (not screen bridge consumers) | 4590 |
| `lane:arch` | Refactors, folder structure, glossary, boundary lint, CI, doc structure | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `docs/INDEX.md`, `docs/AGENTS.md`, `GLOSSARY.md` | 4690 |
| `lane:features` | Platform feature screens and core-server feature domains | `apps/platform-api`, `apps/feature-screens`, `packages/feature-{shared,ui}`, `packages/adapters/feature-bridge`, `ops/platform-api`, `platform/{dashboard,voc,findings,tasks,integration,surveys,feature-admin}`, feature bridges in `platform/{home,my-activity,notice-voc}`; `docs/{product/features,architecture/platform-api,design/features,user-guide/features}` | 4390 |
| `lane:ev` | equipment-visualization, AP side: EV packages, Studio, EV docs | `packages/eqv/*`, `tools` space, host-module fixtures, `docs/design/features/equipment-visualization/`, `docs/adr/history/eqv/` (frozen), `.agents/skills/reference-to-semantic-topview` | 4490 |
| `lane:site` | Intro site | `site/` | 4790 |
| `lane:ops` | Conductor profile, agent assets, owner-requested reports | `.agents/` (not this file), `docs/agents/` | 4990 |
| lead | Assignment, conflicts, release, board | `.planning/`, release notes, this file | 4890 |

Run E2E with `E2E_PORT=<port>` and base-path E2E with `E2E_BASE_PATH_PORT=<port+1>`.

## Request classification

Take the first match:

1. **Kernel duty** (06 §4 list, `packages/sdk/kernel/AGENTS.md`): contracts/runtime → `lane:sdk`; wiring into the app → `lane:platform`. Changing an 06 contract is an owner decision.
2. **SDK piece:** if the rest is a domain-free part another menu could use once menu-specific parts become menu declarations → `lane:sdk` ([ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md)).
3. **Menu share:** sample menu → `lane:platform` (touch only what the platform contract needs). Feature consumer/bridge → `lane:features`. EV module → `lane:ev`. In-house menus are not built here: point to `docs/integration/in-house-rollout.md` §5 and close the issue.

- **Mixed request:** split it by class. The SDK issue goes first.
- **Bugs:** go to the lane that owns the confirmed cause, not the symptom.
- **Promotion candidates:** go in `.planning/backlog.md` with their current consumers. Promote when 2–3 real consumers exist.

## Start coordination paths

Procedure: the global `issue-wave-conductor` skill's `references/lanes.md` §Start coordination paths. The paths:

- Public API of `packages/sdk/{contracts,kernel,components,shell}`
- `apps/platform-web/src/menus.ts`, 06 contract docs
- Root `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.github/workflows`
- `apps/platform-e2e`
- The "next release" row in `packages/sdk/CHANGELOG.md`, the `docs/adr/README.md` table, ADR numbers (reservation: [`addenda/traps.md`](addenda/traps.md))
- `addenda/traps.md`, `docs/agents/operations.md` (append only)
- The four screen bridge entry lists ([`addenda/traps.md`](addenda/traps.md))
- `.planning/README.md`: the lead updates it once, in the release-docs PR.

## Owner gates

On top of the shared list in `references/lanes.md` §Lane session: 06 contract changes and 3+ new menu screens.

## Heavy steps

`heavy.lock` also covers: Root `pnpm test` and `build`, `probe.ts`, screen integration, and a full local `pnpm e2e` (only to reproduce a CI failure — send `<lane>: E2E` at start and end). Narrowed E2E (`-g`) and package checks take no lock.

## Complexity

Route to `impl-complex` (always full) if any of these hold:
- A Kernel contract and its consumers change together, or 3+ packages change.
- Permissions, Scope, URL security boundaries (`safeReturnTo`, destination ID vs Context), or data-leak rules change.
- State or ordering logic changes: query lifecycle (cancel, generation, `ready` gate), history push/replace, page-key cleanup on Context change.

## Launch

- `python3 $ENGINE/launch-worker.py <n> <slug>` creates the worktree, installs, merges [`addenda/`](addenda/) into `.review/00-IMPL-RULES.md` / `00-REVIEW-RULES.md` and starts the runner. Environment: `WAVE_STATE`, `WAVE_BRIEFS`, `AP_MAIN`. Role: `WORKER_ROLE`; overrides `WORKER_MODEL`, `WORKER_EFFORT`.
- Capacity, slots and waiting: `references/lanes.md` §Machine resources. Run issues in parallel only when their files do not overlap. Parallelism otherwise follows SKILL §Loop; here only local root test/build/E2E is serial (`heavy.lock`).
- **Stacking:** a node whose dependencies are committed on an in-flight branch starts on it (`orca worktree create --base-branch <branch>`, then `launch-worker.py --reuse`). Its brief names the base branch's in-flight files it must not edit; it rebases onto `main` after the base merges, and only after its own worker or reviewer has finished.
- **Visual-judgment floor:** work that decides how a screen looks (layout, spacing, hierarchy, new component visuals, `?variant=` prototypes, screen-shape fix rounds, `site/` design) runs on role `impl-complex-sol` at effort `high`. Plain coding stays on the routing default. Split an issue so only its visual part goes to that worker. Captures and non-visual fixes never use this role. Reason: lower models code fine but make the UI ugly.
- Feature issues: `launch-worker.py <n> <slug> feature`; rules in `addenda/impl-rules-feature.md`.
  - `scripts/feature-prepare.sh` fills `.env` and creates the issue DB on 5439 (`verify-db.sh create <n>`). Never use 5434.
  - Run `verify-db.sh up` once beforehand (`cp ops/platform-api/.env.example ops/platform-api/.env` first if `.env` is missing).
  - A branch that adds a migration: `verify-db.sh drop <n>` → `verify-db.sh create <n> --migrate-from <worktree>` before integration tests.
  - After merge, `verify-db.sh drop <n>`; at wave end, `verify-db.sh down`.

## Verify

Every step must exit 0 before commit.

1. Changed-package checks.
2. Root checks:
   - `verify=full`: `bash $LANES/verify-root.sh <log-dir>` (lint → typecheck → test+build under `heavy.lock`; exits 3 if capacity says `start=no`, 75 if `heavy.lock` is held). Only a summary with `step=test` and `step=build` counts.
   - `verify=light`: `verify-root.sh --light <log-dir>` (lint + typecheck); test and build are left to PR CI. `tier.sh` gives `verify=full` for any change under the full paths, tests included, except `tier=small`.
3. E2E, only when Kernel, shell, shared components or the mock server change, except `tier=small`: PR CI's selected specs stand in. Run the new describe first, then the brief's Impact describes with `-g "A|B"`. Never run full `pnpm e2e` locally, except to reproduce a CI failure. PR and main-push CI run only the affected specs (`.github/scripts/select-e2e.mjs`), so a green PR is not a full E2E record; the release `full=true` run is.
4. Menu manifests, `menus.ts`, contract menu types or `tooling/gen-menu` changed: `node tooling/gen-menu/scripts/probe.ts`, never in a worktree with a live preview.
5. Feature gates, when feature packages or `.github/workflows/ci.yml` change:
   - `bash ops/platform-api/scripts/ci/gate.sh static-extra`; `unit` only for suites the root test does not cover.
   - Integration: `PLATFORM_API_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @ap/platform-api test:integration`, not `gate.sh integration` (it truncates the source DB). A migration node runs the full suite on its recreated DB. One issue DB serves one run at a time: wait for the worker to end first.
6. Hygiene: `python3 $ENGINE/worker-hygiene.py <worktree>`.
7. Gates that run only in CI — run them locally when their inputs change:
   - Public SDK types or exports change → `pnpm build`, then `pnpm sdk:api` (intended changes: `--update` plus one line in `packages/sdk/CHANGELOG.md`), `pnpm sdk:test`.
   - SDK files move or are renamed → `pnpm sdk:pack --out <d> && pnpm sdk:consumer-check <d>`.
   - A CSS rule is removed → add the `css-removal-ok` label and wait for the rerun before ship.

- **Fix round:** changed packages, root lint/typecheck/test (cached), affected `-g` E2E, affected screen gates, hygiene, and step 7 if its inputs changed. No build, full E2E or probe unless a build input changed.
- **Final head:** hygiene only; rerun the fix-round checks only after a rebase conflict.

## Browser evidence

- UX reviewers drive the previews themselves: `$ENGINE/app-preview.py start <checkout> --name <n>-branch` (baseline `<n>-main`). Ports 5180–5199. Stop the preview in the same turn and close the ego tabs (`references/lanes.md` §Machine resources).
- Browser control is `ego-browser`; if it is blocked, use a one-off Playwright capture from `apps/platform-e2e` and record the substitution in VERIFY.
- A PR that changes behavior (state, request shape, response fields) gets one real-server check by the conductor, recorded in VERIFY: `verify-db.sh create <n>`, then `python3 ops/platform-api/conductor/scripts/app-preview.py start <checkout> --backend --env $WAVE_STATE/env.verify.<n> --seed --name <n>-real`, and `stop <n>-real` in the same turn.
- Worker briefs take the mock app start command from `conductor.json` `app_preview.command`; never hardcode one.

## Review

- Plan: `python3 $ENGINE/review-plan.py <checkout> [--base origin/main]` (rules in `conductor.json` `review_plan`). Light tier gets no reviewers. `flags.permission` always makes the PR full; `ux=required` only picks the reviewers of a full PR.
- UX skip: when a full PR has `ux=required` but no `review-ux` runs, record the skip reason and the substitute browser evidence in the PR body.
- Impeccable check: a PR with a new screen gets one separate `impl-complex-sol` run at effort `high` (never the implementer judging its own work) doing `impeccable critique` + `audit` on the branch preview (1440×900), alongside review-final and before the PR opens; its findings join the one fix round. VERIFY: `impeccable: <report path>` or the skip reason. Reason: review-ux checks flow, not visual craft.
- Platform-consistency check: every `?variant=` prototype and every new-screen PR passes [`addenda/prototype-consistency.md`](addenda/prototype-consistency.md) (a non-builder reviewer comparing each capture with `*-current`, the filled checklist in the Artifact) before the Artifact is sent or the PR opens. VERIFY: `consistency: <report path>`. Its rules 1–2 apply to all screen work. Reason: prototypes drifted from the platform look while every other gate passed.
- Prototypes: offer 2–3 variants only when there are real placement alternatives; otherwise one variant plus the current screen. Captures run on role `research`. Follow-up checks, polish and fixes on a prototype are one fix round.
- `conflict` terms from `review-doc`: no dependent implementation node (screen copy, new table names) starts until the owner list is answered. Reason: a name that reaches schema or API contracts costs a migration to change.
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

## Review lens: docs

Reports are in Korean.

- **Authority:** `GLOSSARY.md` (bold entries, `_Avoid_`, Flagged Ambiguities); `docs/AGENTS.md` (status words, single ownership, no process history); `docs/agents/domain.md` (glossary changes); `docs/INDEX.md` (a new owner document needs a row).
- **Code names:** `apps/platform-api/src/db/schema/*`, `docs/architecture/platform-api/api/*`, menu manifests and i18n labels under `menus/*/*/src`, capability names.
- **`conflict` examples:** a menu's own "project" or "task" noun beside the glossary's 과제(Quest), Finding or Task; the Korean "워크스페이스" where the glossary bans it; "게시" where the glossary says 발행; a term that blurs a permission or security boundary.
- **Modes:** `terms` for a design PR (report path and PR number from the task file); `release-audit` follows [`addenda/doc-audit.md`](addenda/doc-audit.md).
- **Out of scope:** `site/`, `.agents/`, `docs/agents/`, `archive/`, `docs/*/history/`; link and anchor checks (`pnpm docs:links`); screen copy against the glossary (`review-ux` Copy).

## Review lens: quality

Reports are in Korean.

- **Scope:** `<last tag>...origin/main`.
- **References:** root and `packages/AGENTS.md` and the touched folders' `AGENTS.md`; `docs/integration/platform-packages.md` §3; 06 §24; `docs/AGENTS.md`.
- **Look for:** boundary leaks (Kernel, components or shell know about menus or mocks; reverse imports; menus using `@ap/*` internals; screen primitives outside `@ap/ui`; the frontend treated as the permission authority), wrong commonization, missing `$TURBO_ROOT$` turbo inputs, dead code (including `?variant=` leftovers), doc drift.
- **Release blocker:** only boundary, 06 or permission violations that produce wrong behavior or data.

## Fold scope

A PR may also touch, outside the issue diff, only the changed consumer's `menus/<space>/<group>/src/` or `platform/<feature>/src/` and the i18n dictionary.

## Deferrals

Every item not done now — an owner "not now", an accepted limit, a `major` or worse finding below the cut line — is recorded the same day as one row in [`.planning/backlog.md`](../../.planning/backlog.md): item, reason, reopen condition. The PR body lists it under **Deferred** with a link to the row. Reason: a deferral with no recorded home is lost at session end.

## Slice close

Release order:

  1. Run the slice-close `review-quality` (plus a `review-ux` walk-through if screens changed).
  2. Draft the release-docs PR. Do steps 1–2 alongside the last PRs' reviews. In it, set consumer packages in `menus/` and `platform/` `ap.sdk` and the gen-menu `SDK_RANGE` to the new SDK range (`menus/AGENTS.md`, `platform/AGENTS.md`); (nothing else updates them).
  3. Run a one-off doc audit with [addenda/doc-audit.md](addenda/doc-audit.md) (`review-doc`, persona doc-steward, as its work order says). Fold its findings into the release-docs PR.
  4. Run the real-server suite (`pnpm --filter @ap/platform-e2e run e2e:real`) on a throwaway database, by the procedure in [`apps/platform-e2e/AGENTS.md`](../../apps/platform-e2e/AGENTS.md#procedure), and post the pass/fail counts on the release issue. A failing spec is diagnosed (product defect or stale test, [expected-behavior](../../docs/product/expected-behavior/README.md#판단-기준) «판단 기준») before the tag. Reason: CI does not run it, so stale real specs went unnoticed until a full check (#1660 answer 3).
  5. Run a full cold CI on the SHA to tag: `gh workflow run ci.yml --ref main -f full=true`. PR and main-push CI run only what changed (turbo cache; E2E specs picked by `.github/scripts/select-e2e.mjs`), so this run is the only whole, cold gate. Take the run id from `gh run list --workflow ci.yml --event workflow_dispatch --limit 1 --json databaseId` and require `headSha` = tag SHA and `success`. Rerun it if the SHA moves.
  6. Tag `sdk-v*` with the tarballs and a GitHub Release; at tag time also run `pnpm sdk:schemas --version X.Y.Z --out <empty-or-absent-schemas-dir>` and `gh release upload sdk-vX.Y.Z <schemas-dir>/contract-schemas-X.Y.Z.tgz <schemas-dir>/SHA256SUMS-schemas`. App `v0.x` tags: At slice start ask once: 'tag when cold CI is green?'. If yes, tag when the cold CI of the tag SHA succeeds and no `bug` issue is open. If not chosen, ask once, alone, just before the tag. Record the answer on the release issue. For an app release, the site lane updates `site/`.

- **Gate table:** before tagging, the lead posts the table of the global `references/lanes.md` §Gate measurement on the release issue, with three rows: impeccable, platform consistency, and `tier=small` (count and findings of major or worse).
- **Impeccable and consistency re-measure (next release):** in their rows, count runs and the findings of major or worse that `review-ux` and `review-final` did not also report. With at least 5 runs, a gate with at least one such finding stays at its scope and a gate with none is removed; with fewer than 5 runs it stays one more release and the row says so.
- **SDK release timing:** a lane adds only the "next release" row in `packages/sdk/CHANGELOG.md`. The lead releases the SDK when that row exists and main CI is green, and at once if a lane is waiting for it.
- **Site PR timing:** merge the site PR before tagging. If it merges later, run `pages.yml` by hand after the tag's Pages deploy ends. Reason: the tag-triggered deploy publishes the tagged tree.

Tag with the full SHA (`git rev-parse origin/main`, `gh release create --target "$SHA"`). `app-preview.py status` must show no tracked previews at the end.

## Tools

Lane tools: `~/.agents/skills/issue-wave-conductor/scripts/lanes/` (`references/lanes.md`). Repo script: `bash tooling/scripts/next-adr.sh` (next ADR number; reservation rule in §Traps).

## Traps

[`addenda/traps.md`](addenda/traps.md): read it when you write a brief and when its topic comes up. Append new traps there, one bullet each.
