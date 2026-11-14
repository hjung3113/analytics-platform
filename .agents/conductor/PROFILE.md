Lanes read: §Flow, §Size and path, §Lanes, §Owner gates and questions, §Launch, §Verify
Lane sessions read only those sections and the ones a step names (SKILL §0 full read does not apply; this profile wins). The lead reads [`lead.md`](lead.md) plus §Flow, §Lanes and §Owner gates and questions here, not this whole file. Reviewers read only their lens section.

# Conductor profile — analytics-platform

Repository-specific settings for the global `issue-wave-conductor` skill. Shared procedure lives in the skill. Work rules live in root `AGENTS.md`, which wins on conflict. `$CONDUCTOR` = this folder. `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`. Settings: [`conductor.json`](conductor.json). Multi-session procedure: the global `issue-wave-conductor` skill's `references/lanes.md` (`$LANES` there = the lane tools). Repo values the tools read: `conductor.json` `lanes`. Brief and worker traps: §Traps.

The mock-adapter app has no database or login; its evidence comes from Playwright E2E (`apps/platform-e2e`) and the mock preview. The core server (`apps/platform-api`) has both, and its checks follow §Verify and §Browser evidence.

## Flow

- Base is `main`. Squash merge. Branch name is `feat/<n>-<slug>`. `$MAIN` = `AP_MAIN`. `WAVE_BRIEFS` = `$AP_MAIN/.review/wave/`.
- Run `git config workerops.protectedBases none` once per clone for `ship-pr.sh`.
- Merge grant: a lane session uses its brief's grant. Merges never wait for a release tag; the tag SHA is the release-docs PR's merge commit ([`lead.md`](lead.md) §Slice close).

## Size and path

Tiers, PR count, round cap, brief check and ship-check: the global `issue-wave-conductor` skill's `references/lanes.md` §Size and path. Full-tier paths are `lanes.tier_full_regex`. AP specifics:

- **Domain-noun docs (`review-doc` terms):** a light PR that adds domain nouns under `docs/design/**`, a new ADR, `docs/product/**`, a new API contract file or `GLOSSARY.md` gets one `review-doc` terms run (persona `doc-steward`). Design PRs of the same domain opened the same day share one run. Skip it when the changed lines add no bold term outside the glossary, no new enum/table/capability name and no new menu label. Reason: terms caught before code avoid renames that need migrations; sharing a run keeps the cost at one run per design batch.
- **Plan review:** the `review-quality` plan review applies when a brief changes 06 contracts, package boundaries or `sdk:api`. Owning docs follow [`docs/AGENTS.md`](../../docs/AGENTS.md).

## Lanes

| Label | Owns | Main paths | E2E port |
| --- | --- | --- | --- |
| `lane:sdk` | Public package contracts and parts, analysis workspace, SDK quality | `packages/sdk/*`, `tooling/sdk/`, `docs/contract/`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | App assembly, mock/real adapters, server conformance, sample menus, in-house rollout | `apps/platform-web`, `packages/adapters/{mock-server,http-adapter,server-conformance}`, `menus/*`, `platform/{admin,home,improvement-items,my-activity,notice-voc}` (not screen bridge consumers) | 4590 |
| `lane:arch` | Refactors, folder structure, glossary, boundary lint, CI, doc structure | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `docs/INDEX.md`, `docs/AGENTS.md`, `GLOSSARY.md` | 4690 |
| `lane:features` | Platform feature screens and core-server feature domains | `apps/platform-api`, `apps/feature-screens`, `packages/feature-{shared,ui}`, `packages/adapters/feature-bridge`, `ops/platform-api`, `platform/{access,dashboard,voc,findings,tasks,integration,surveys,systems,feature-admin}`, feature bridges in `platform/{home,my-activity,notice-voc}`; `docs/{product/features,architecture/platform-api,design/features,user-guide/features}` | 4390 |
| `lane:ev` | equipment-visualization, AP side: EV packages, Studio, EV docs | `packages/eqv/*`, `tools` space, host-module fixtures, `docs/design/features/equipment-visualization/`, `docs/adr/history/eqv/` (frozen), `.agents/skills/reference-to-semantic-topview` | 4490 |
| `lane:site` | Intro site | `site/` | 4790 |
| `lane:ops` | Conductor profile, agent assets, owner-requested reports | `.agents/` (not this file), `docs/agents/` | 4990 |
| lead | Assignment, conflicts, release, board | `.planning/`, release notes, this file | 4890 |

Run E2E with `E2E_PORT=<port>` and base-path E2E with `E2E_BASE_PATH_PORT=<port+1>`.

## Request classification

Lead only: [`lead.md`](lead.md) §Request classification.

## Start coordination paths

Procedure: the global `issue-wave-conductor` skill's `references/lanes.md` §Start coordination paths. The paths:

- Public API of `packages/sdk/{contracts,kernel,components,shell}`
- `apps/platform-web/src/menus.ts`, 06 contract docs
- Root `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.github/workflows`
- `apps/platform-e2e`
- The `docs/adr/README.md` table, ADR numbers (reservation: [`addenda/traps.md`](addenda/traps.md))
- `addenda/traps.md`, `docs/agents/operations.md` (append only)
- The screen bridge entry list (`apps/feature-screens/package.json` `exports`)
- `.planning/README.md`: the lead updates it once, in the release-docs PR.

## Owner gates and questions

This is the repo's one home for owner questions; other files point here. Owner gates on top of the shared list in `references/lanes.md` §Lane session: 06 contract changes and 3+ new menu screens.

- A lane sends a decision only the owner can make to the lead as `질문 #n`, with the options and its recommendation, and keeps working on other items. Nothing that depends on the answer is implemented first.
- Owner awake: the lead asks one numbered question, once. It does not repeat the question or re-attach it to later reports; the open question lives in `board.py`.
- Owner away (01:00–09:30 KST): a question with a recommendable, reversible option is decided by the `advisor` role; work continues, and the lead reports those decisions once in the morning report. Only what cannot be undone waits for the owner: anything published outside the repo, deletion, 06 contract docs, and the gates above.
- Add `ready-for-human` to the issue only when the session hands over without an answer. A decision chosen among real alternatives is recorded as an ADR in `docs/adr/`.

Reason: questions repeated at every report, or left for an owner who was asleep, cost 5–10 hour waits for answers that were usually the recommendation.

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
3. E2E, only when Kernel, shell, shared components or the mock server change, except `tier=small`: PR CI's selected specs stand in. Run the new describe first, then the brief's Impact describes with `-g "A|B"`. Never run full `pnpm e2e` locally, except to reproduce a CI failure. PR and main-push CI run only the specs `.github/scripts/select-e2e.mjs` picks; anything it cannot limit (most code PRs) runs all four shards, and a PR touching only `apps/platform-api/**` or `ops/platform-api/**` (not `ops/platform-api/tsconfig.base.json`) runs none, so a green PR is not a full E2E record; the weekly `full=true` run is ([`lead.md`](lead.md) §Slice close).
4. Menu manifests, `menus.ts`, contract menu types or `tooling/gen-menu` changed: `node tooling/gen-menu/scripts/probe.ts`, never in a worktree with a live preview.
5. Feature gates, when feature packages or `.github/workflows/ci.yml` change:
   - `bash ops/platform-api/scripts/ci/gate.sh static-extra`; `unit` only for suites the root test does not cover.
   - Integration: `PLATFORM_API_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @ap/platform-api test:integration`, not `gate.sh integration` (it truncates the source DB). A migration node runs the full suite on its recreated DB. One issue DB serves one run at a time: wait for the worker to end first.
6. Hygiene: `python3 $ENGINE/worker-hygiene.py <worktree>`.
7. Gates that run only in CI — run them locally when their inputs change:
   - Public SDK types or exports change → `pnpm build`, then `pnpm sdk:api --report` (read the diff; PR CI writes the same diff to its summary), `pnpm sdk:test`. Write the change as `packages/sdk/changes/<issue>.md` (`pnpm sdk:changelog --check`); never edit `packages/sdk/CHANGELOG.md` or run `sdk:api --update` in a PR. Reason: parallel PRs that each edited those two files conflicted on every rebase; the release folds them once.
   - SDK files move or are renamed → `pnpm sdk:pack --out <d> && pnpm sdk:consumer-check <d>`.
   - A CSS rule is removed → add the `css-removal-ok` label and wait for the rerun before ship.
8. PR CI budget: until production, PR CI stays minimal at about 10 minutes of wall clock; the owner names the go-live date (#1931). The SDK upgrade gate, SDK tarball and outside-consumer checks, the kit browser check and backend image builds run on main push and `workflow_dispatch` (the weekly `full=true` run), never on a PR, so run step 7's SDK checks locally when their inputs change. A new CI check goes to main push or release first; it joins PR CI only if the PR still fits the budget. Reason: the PR wait was the bottleneck.
   - After main moves, push rebased PRs one at a time: push the next only when the previous PR's CI has finished. Reason: the repo runs at most 20 jobs at once and one PR takes up to 18, so simultaneous pushes queue and each PR's wall clock doubles while the jobs themselves stay under 8 minutes ([#1931](https://github.com/hjung3113/analytics-platform/issues/1931#issuecomment-6844968461)).

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
- Screen PR reviewers: `review-final`, plus `review-ux` when `review-plan.py` says `ux=required`. The Impeccable and platform-consistency checks below run only when the PR holds root `AGENTS.md` §UI test A. Reason: four reviewers on one screen PR repeated about half of each other's findings, and `review-ux` covers the same items.
- Impeccable check: a PR that holds UI test A gets one separate `impl-complex-sol` run at effort `high` (never the implementer judging its own work) doing `impeccable critique` + `audit` on the branch preview (1440×900), alongside review-final and before the PR opens; its findings join the one fix round. VERIFY: `impeccable: <report path>` or the skip reason. Reason: review-ux checks flow, not visual craft.
- Platform-consistency check: every `?variant=` prototype and every PR that holds UI test A passes [`addenda/prototype-consistency.md`](addenda/prototype-consistency.md) (a non-builder reviewer comparing each capture with `*-current`, the filled checklist in the Artifact) before the Artifact is sent or the PR opens. VERIFY: `consistency: <report path>`. Its rules 1–2 apply to all screen work. Reason: prototypes drifted from the platform look while every other gate passed.
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
- **Out of scope:** `site/`, `.agents/`, `docs/agents/`, `docs/*/history/`; link and anchor checks (`pnpm docs:links`); screen copy against the glossary (`review-ux` Copy).

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

Lead only: [`lead.md`](lead.md) §Slice close (release order, tag rule, weekly cold run).

## Tools

Lane tools: `~/.agents/skills/issue-wave-conductor/scripts/lanes/` (`references/lanes.md`). Repo script: `bash tooling/scripts/next-adr.sh` (next ADR number; reservation rule in §Traps).

## Traps

[`addenda/traps.md`](addenda/traps.md): read it when you write a brief and when its topic comes up. Append new traps there, one bullet each.
