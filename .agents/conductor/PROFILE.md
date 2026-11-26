Workers read the sections their brief names (SKILL §0 full read does not apply; this profile wins). The lead reads [`lead.md`](lead.md) plus §Flow, §Size and path and §Owner gates and questions here. Reviewers read only their lens section. Review reports are in Korean.

# Conductor profile — analytics-platform

Repository-specific settings for the global `issue-wave-conductor` skill; root `AGENTS.md` wins on conflict. `$ENGINE` = `~/.agents/skills/issue-wave-conductor/scripts`, `$LANES` = `$ENGINE/lanes`. Settings: [`conductor.json`](conductor.json).

## Flow

- Base is `main`. Squash merge. Branch name is `feat/<n>-<slug>`. `$MAIN` = `AP_MAIN`. `WAVE_BRIEFS` = `$AP_MAIN/.review/wave/`.
- **Lanes on two hosts.** Lane sessions run on the Mac and the desktop host, one per area of the release scope, by the engine's `references/lanes-multisession.md`; the lead assigns issues, answers questions and releases. A lane runs at most 2 workers at once (reviewers included) and starts one only when `capacity.sh` on its host says `start=yes`; a newly paired host follows the engine's remote ramp. The same worker fixes its own review findings. Reason: the second host adds capacity only when work runs there, and per-host limits keep either machine from saturating.
- The lead merges, one PR at a time: the next merges only after `main` CI of the previous is green. Reason: independently green PRs met on `main` and turned it red. Merges never wait for a release tag; the tag SHA is the release-docs PR's merge commit ([`lead.md`](lead.md) §Slice close).

## Size and path

Tiers (`tier.sh` decides): the global `issue-wave-conductor` skill's `references/lanes.md` §Size and path. Full-tier paths are `lanes.tier_full_regex`. AP specifics:

- **PR cap:** aim for at most 400 lines and 40 files per PR. An issue expected to exceed it is split before work starts when it splits cleanly by surface (an SDK piece, one screen, or the server). Going over is the lead's call, not a stop: when the change is simple (mechanical, moves or renames, tests or docs making up much of it, one surface) or its regression risk is low, the work continues and the PR body carries `Size: lead — <reason>`; a lane that reaches the cap mid-work reports it and keeps going unless the lead says split. The owner is asked (`질문 #n`) only when the lead judges an over-cap change risky and it does not split. Reason: review rounds grow with PR size, but stopping simple work at a line count cost more than it saved.
- **Draft PR at the first review:** the lead opens the PR as a draft (`ship-pr.sh … --draft --no-rebase`, engine `references/ship.md` §Draft PR from the first review) at the commit the first review reads, pushes every fix round to it, and marks it ready only to merge. Reason: fix rounds that ran before the PR opened never reached the PR guard's round count.
- **Review rounds:** at most two code-review rounds; the second covers only the fix diff. A third round goes back to the lead, who picks revert, split or an owner question; if the findings come only from earlier fixes, revert. No third-round fix task is written before the lead answers. A commit that fixes round-2 findings (title `리뷰 2회차`) needs a `Round cap: lead — …` (or `owner — …`) line in the PR body; `PR guard` fails without it. Reason: findings after round two came from the fixes themselves.
- **Real server first:** permission and feature work attaches one real-server capture before the first review; the review task names its path, and a permission or feature review without one returns `CHANGES` ([`addenda/review-rules.md`](addenda/review-rules.md)). Reason: the mock and the real server answer differently on denial.
- **Mechanical caps (CI job `PR guard`; rules in the header of `.github/scripts/pr-guard.mjs`):** size (400 lines / 40 files; passed by a `Size: <lead|owner> — <reason>` line in the PR body or the owner label `owner-ok:size`); rounds (the fourth push of a branch, or any commit titled as a fix for review round 2 or later, needs a `Round cap: <lead|owner> — <revert | split | 질문 #n>` line in the PR body, written only after that choice); scope (every closed issue is in the newest release spec's `## 범위` on `main`; owner label `owner-ok:scope`, also for a PR that adds numbers there). Body lines (`Size:`, `Round cap:`) are read when CI runs: after editing the body, rerun the failed `PR guard` job. An `owner-ok:*` label goes on only with the owner's yes to that PR's `질문 #n`: the owner applies it, or the lead applies it after that yes and quotes it in the PR body under **Decisions**. The guard prints who applied one. Reason: a limit that only lives in text gets waived, and waiting for the owner to type the label stalled approved PRs.

- **Domain-noun docs (`review-doc` terms):** a light PR that adds domain nouns under `docs/design/**`, a new ADR, `docs/product/**`, a new API contract file or `GLOSSARY.md` gets one `review-doc` terms run (persona `doc-steward`). Design PRs of the same domain opened the same day share one run. Skip it when the changed lines add no bold term outside the glossary, no new enum/table/capability name and no new menu label. Reason: a term caught before code avoids a migration to rename it.
- **Bundles:** one PR may close up to 4 same-area issues: at most 400 changed source lines, one package, menu or contract document, one tier (the highest member's), one commit per issue. Never bundled: a `main` fix, a shared-path change (`lanes.shared_paths_regex`), an issue waiting on an owner prototype decision. If one issue blocks, drop its commit and ship the rest. Reason: a PR's fixed cost (a CI run, a review, a merge turn) outweighed its diff.
- **Plan review:** the `review-quality` plan review applies when a brief changes 06 contracts, package boundaries or `sdk:api`. Owning docs follow [`docs/AGENTS.md`](../../docs/AGENTS.md).

## Lanes

Each lane session owns one area of the table. Request classification ([`lead.md`](lead.md)) picks the area, and the lane's workers use its E2E port. Two lanes in one area on one host use the port +50.

| Label | Owns | Main paths | E2E port |
| --- | --- | --- | --- |
| `lane:sdk` | Public package contracts and parts, analysis workspace, SDK quality | `packages/sdk/*`, `tooling/sdk/`, `docs/contract/`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | App assembly, mock/real adapters, server conformance, sample menus, in-house rollout | `apps/platform-web`, `packages/host/` (release unit 2), `menus/*`, `platform/{admin,home,improvement-items,my-activity,notice-voc}` (not screen bridge consumers) | 4590 |
| `lane:arch` | Refactors, folder structure, glossary, boundary lint, CI, doc structure | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `docs/INDEX.md`, `docs/AGENTS.md`, `GLOSSARY.md` | 4690 |
| `lane:features` | Platform feature screens and core-server feature domains | `apps/platform-api`, `packages/feature/screens`, `packages/feature-{shared,ui}`, `packages/feature/bridge`, `ops/platform-api`, `platform/{access,dashboard,voc,findings,tasks,integration,surveys,systems,feature-admin}`, feature bridges in `platform/{home,my-activity,notice-voc}`; `docs/{product/features,architecture/platform-api,design/features,user-guide/features}` | 4390 |
| `lane:ev` | equipment-visualization, AP side: EV packages, Studio, EV docs | `packages/eqv/*`, `tools` space, host-module fixtures, `docs/design/features/equipment-visualization/`, `docs/adr/history/eqv/` (frozen), `.agents/skills/reference-to-semantic-topview` | 4490 |
| `lane:site` | Intro site | `site/` | 4790 |
| `lane:ops` | Conductor profile, agent assets, owner-requested reports | `.agents/` (not this file), `docs/agents/` | 4990 |
| lead | Assignment, conflicts, release, board | `.planning/`, release notes, this file | 4890 |

## Owner gates and questions

This is the repo's one home for owner questions; other files point here. Owner gates: the menu look gate below, root `AGENTS.md` §UI tests A and B, 06 contract changes, 3+ new menu screens, a new hierarchy or term, and any addition to the release scope.

**Menu look gate.** How a menu screen presents its information (which panels, what shows above a chart, where legends, notes and options sit, how dense it is) is the owner's taste, not a general rule. Before implementing such a change, the lead brings 2–3 variants (`?variant=` prototypes, or annotated captures or sketches when that is enough) as one Artifact and sends `질문 #n`; it implements only the chosen one. SDK pieces stay under the usual rules: the general piece and its default ship as decided, and the menu declares which level it uses. Reason: SDK pieces are general, but each menu follows the taste of whoever builds it.

- A decision only the owner can make goes to the owner as `질문 #n`, with the options and a recommendation; work on other items continues. Nothing that depends on the answer is implemented first.
- Owner awake: the lead asks one numbered question, once. It does not repeat the question or re-attach it to later reports; the open question lives in `board.py`.
- Owner away: owner decisions wait for the owner. Work that does not depend on the answer continues. No agent or reviewer answers an owner question or picks a variant. Reason: the owner reversed choices agents made overnight.
- Issues are opened with `gh issue create --template "작업 이슈"` (`.github/ISSUE_TEMPLATE/work.md`); its three checks are the rules below and in §Size and path. Issues carry decided content only. Quote the owner's words as the decision; mark the lead's own text «제안:». A new axis, hierarchy or term gets one line checking it against `GLOSSARY.md`, the lead's own wording included. Reason: a hierarchy the lead wrote into an issue body shipped as if the owner had decided it.
- One issue holds one problem; an audit report files one issue per finding. Reason: an issue that bundled five problems became a 99-file PR.
- Add `ready-for-human` to the issue only when the session hands over without an answer. A decision chosen among real alternatives is recorded as an ADR in `docs/adr/`.

Reason: repeated questions cost hours of waiting.

## Heavy steps

`heavy.lock` also covers: Root `pnpm test` and `build`, `probe.ts`, screen integration, and a full local `pnpm e2e` (only to reproduce a CI failure). Narrowed E2E (`-g`) and package checks take no lock.

## Complexity

Route to `impl-complex` (always full) if any of these hold:
- A Kernel contract and its consumers change together, or 3+ packages change.
- Permissions, Scope, URL security boundaries (`safeReturnTo`, destination ID vs Context), or data-leak rules change.
- State or ordering logic changes: query lifecycle (cancel, generation, `ready` gate), history push/replace, page-key cleanup on Context change.

## Launch

- Capacity, slots and waiting: `references/lanes.md` §Machine resources. Run issues in parallel only when their files do not overlap; only §Heavy steps are serial.
- **Visual-judgment floor:** work that decides how a screen looks (layout, spacing, hierarchy, new component visuals, `?variant=` prototypes, screen-shape fix rounds, `site/` design) runs on role `impl-complex-sol` with `--effort high`. Plain coding stays on the routing default. Split an issue so only its visual part goes to that worker. Captures and non-visual fixes never use this role. Reason: lower models code fine but make the UI ugly.
- Feature issues (verify container: `verify-db.sh up` once): `launch-worker.py <n> <slug> feature` runs `scripts/feature-prepare.sh`, which fills `.env` and creates the issue DB on 5439; rules in `addenda/impl-rules-feature.md`. A branch that adds a migration recreates the DB (`verify-db.sh drop <n>`, then `create <n> --migrate-from <worktree>`) before integration tests. Drop the DB after merge; `verify-db.sh down` when no feature work is left.

## Verify

Every step must exit 0 before commit.

1. Changed-package checks: each changed package's lint, typecheck and tests.
2. Root checks, every tier: `bash $LANES/verify-root.sh --light <log-dir>` (lint + typecheck). Root test and build are PR CI's, whatever `tier.sh` says for `verify`. Reason: package checks catch what root test and build would, and those hold `heavy.lock`.
3. E2E, when the diff touches app code: in `apps/platform-e2e`, run every describe the diff adds or changes, then the brief's Impact describes, with `pnpm exec playwright test -g "A|B"`. Never run full `pnpm e2e` locally, except to reproduce a CI failure. PR and main-push CI run only the specs `.github/scripts/select-e2e.mjs` picks, so a green PR is not a full E2E record; the weekly `full=true` run is ([`lead.md`](lead.md) §Slice close).
4. Menu manifests or `menus.ts` changed: `node tooling/gen-menu/scripts/probe.ts`.
5. Feature gates, when feature packages or `.github/workflows/ci.yml` change:
   - `bash ops/platform-api/scripts/ci/gate.sh static-extra`; `unit` only for suites the root test does not cover.
   - Integration: `PLATFORM_API_ENV_FILE=$WAVE_STATE/env.verify.<n> pnpm --filter @ap/platform-api test:integration`, not `gate.sh integration` (it truncates the source DB). A migration node runs the full suite on its recreated DB. One issue DB serves one run at a time: wait for the worker to end first.
6. Hygiene: `python3 $ENGINE/worker-hygiene.py <worktree>`.
7. Gates that run only in CI — run them locally when their inputs change:
   - Public SDK types or exports change → `pnpm build`, then `pnpm sdk:api --report` (read the diff; PR CI writes the same diff to its summary), `pnpm sdk:test`. Write the change as `packages/sdk/changes/<issue>.md` (`pnpm sdk:changelog --check`); never edit `packages/sdk/CHANGELOG.md` or run `sdk:api --update` in a PR. Reason: parallel PRs that each edited those two files conflicted on every rebase; the release folds them once.
   - A CSS rule is removed → add the `css-removal-ok` label and wait for the rerun before ship.
8. When several PRs are ready, push them one at a time: push the next only when the previous PR's CI has finished. Reason: one PR takes up to 18 of the repo's 20 concurrent jobs, so simultaneous pushes double each PR's wall clock.

- **Fix round:** steps 1–3 on what changed, affected screen gates, hygiene, and step 7 if its inputs changed. No build, full E2E or probe unless a build input changed. The whole round is one push of the branch as is (the engine's `ship-pr.sh --no-rebase`); never push a partial fix.
- **Rebase:** only when `merge-precheck` exits 3 or GitHub reports a conflict; then rerun the fix-round checks. Reason: squash merge under a non-strict ruleset needs no up-to-date branch, and each rebase costs a CI run and a turbo-cache miss.
- **Final head:** hygiene only.

## Browser evidence

- UX reviewers drive the previews themselves: `$ENGINE/app-preview.py start <checkout> --name <n>-branch` (baseline `<n>-main`). Stop the preview in the same turn and close the ego tabs (`references/lanes.md` §Machine resources).
- Browser control is `ego-browser`; if it is blocked, use a one-off Playwright capture from `apps/platform-e2e` and record the substitution in VERIFY.

## Review

- Plan: `python3 $ENGINE/review-plan.py <checkout>`. Light tier gets no reviewers. `flags.permission` always makes the PR full; `ux=required` marks the PR's screens for the slice walk-through (§Pre-go-live).
- Screen PR reviewers: `review-final` only, plus the lead's pre-merge capture check ([`lead.md`](lead.md) §Screen check). `review-ux`, Impeccable and platform consistency run per slice on the changed screens (§Pre-go-live).
- Prototype consistency: every `?variant=` prototype passes [`addenda/prototype-consistency.md`](addenda/prototype-consistency.md) before the Artifact is sent. Its rules 1–2 apply to all screen work. Reason: the owner decides from that Artifact.
- Prototypes: offer 2–3 variants only when there are real placement alternatives; otherwise one variant plus the current screen. The implementer takes its own captures (before/after, prototype, real server); no separate capture worker. Reason: a capture worker adds a launch and a hand-off per round and sees the screen without the implementer's context. Follow-up checks, polish and fixes on a prototype are one fix round.
- `conflict` terms from `review-doc`: no dependent implementation node (screen copy, new table names) starts until the owner list is answered. Reason: a name that reaches schema or API contracts costs a migration to change.
- Siblings: each blocker or major finding lists its sibling sites (`addenda/review-rules.md` «Siblings»); the fix round fixes them all or files one follow-up issue for the rest. Reason: the class was wider than the diff each time.
- Every brief has an **Impact** section: consumers found with `rg`, docs that must change, regression risks with the test that catches each (name the E2E describes).

## Review lens: UX

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

- **Authority:** `GLOSSARY.md` (bold entries, `_Avoid_`, Flagged Ambiguities); `docs/AGENTS.md` (status words, single ownership, no process history); `docs/agents/domain.md` (glossary changes); `docs/INDEX.md` (a new owner document needs a row).
- **Code names:** `apps/platform-api/src/db/schema/*`, `docs/architecture/platform-api/api/*`, menu manifests and i18n labels under `menus/*/*/src`, capability names.
- **`conflict` examples:** a menu's own "project" or "task" noun beside the glossary's 과제(Quest), Finding or Task; the Korean "워크스페이스" where the glossary bans it; "게시" where the glossary says 발행; a term that blurs a permission or security boundary.
- **Modes:** `terms` for a design PR (report path and PR number from the task file); `release-audit` follows [`addenda/doc-audit.md`](addenda/doc-audit.md).
- **Out of scope:** `site/`, `.agents/`, `docs/agents/`, `docs/*/history/`; link and anchor checks (`pnpm docs:links`); screen copy against the glossary (`review-ux` Copy).

## Review lens: quality

- **Scope:** `<last tag>...origin/main`.
- **References:** root and `packages/AGENTS.md` and the touched folders' `AGENTS.md`; `docs/integration/platform-packages.md` §3; 06 §24; `docs/AGENTS.md`.
- **Look for:** boundary leaks (Kernel, components or shell know about menus or mocks; reverse imports; menus using `@ap/*` internals; screen primitives outside `@ap/ui`; the frontend treated as the permission authority), wrong commonization, missing `$TURBO_ROOT$` turbo inputs, dead code (including `?variant=` leftovers), doc drift.
- **Release blocker:** only boundary, 06 or permission violations that produce wrong behavior or data.
- **Input:** `pnpm dlx fallow@3.48.0 architecture` (import cycles) and `pnpm dlx fallow@3.48.0 dupes` (copy-paste), config `.fallowrc.json`. Report only cycles and clones the slice added or touched; the main baseline on 2026-11-26 was 48 cycles, 21 of them one permissions ↔ voc/tasks barrel knot (#3033). Not a CI gate; no fallow skill, MCP or hook (#3032).

## Pre-go-live

Until production (go-live date: owner, [#1931](https://github.com/hjung3113/analytics-platform/issues/1931)) these checks run per slice or once before go-live, not per PR. Reason: root `AGENTS.md` §Verification.

- **Stays per PR:** §Verify, PR CI, `review-final` with the permission and data-leak rules, the red-`main` precheck, the lead's screen check.
- **Per slice** ([`lead.md`](lead.md) §Slice close step 1): the screens of the slice's `ux=required` PRs get one `review-ux` walk-through, one Impeccable `critique` + `audit` (role `impl-complex-sol`, effort `high`, 1440×900, never the implementer) and the [`addenda/prototype-consistency.md`](addenda/prototype-consistency.md) checklist. When those screens include `packages/feature/*` screens, the walk-through task also gives a real-server preview (`app-preview.py start <checkout> --backend --seed`); reason: the mock shows feature screens only as «실서버 필요». A major or worse finding is fixed in the slice or gets a §Deferrals row.
- **Per slice, web-platform scan:** `env DISABLE_TELEMETRY=1 npx -y modern-web-guidance@1.0.0 legacy-scan .`; file each finding as an issue or mark it a false positive. Not in PR CI: many false positives, and it sends telemetry by default.
- **Pre-go-live pass,** once on the release candidate before the go-live tag: full cold CI (`full=true`); `e2e:real` on a seeded database; a real-server check of each state, request or response change since the last pass (`app-preview.py start <checkout> --backend --env $WAVE_STATE/env.verify.<n> --seed`); `review-quality` of the accumulated diff with the permission and data-leak lens; the per-slice walk-through over every screen changed since the last pass; and a sweep of `.planning/backlog.md` rows with a reopen condition.

## Fold scope

A PR may also touch, outside the issue diff, only the changed consumer's `menus/<space>/<group>/src/` or `platform/<feature>/src/` and the i18n dictionary.

## Deferrals

Every item not done now — an owner "not now", an accepted limit, a `major` or worse finding below the cut line — is recorded the same day as one row in [`.planning/backlog.md`](../../.planning/backlog.md) (item, reason, reopen condition), linked from the PR body under **Deferred**.

## Slice close

Lead only: [`lead.md`](lead.md) §Slice close (release order, tag rule, weekly cold run).

## Tools

Lane tools: `~/.agents/skills/issue-wave-conductor/scripts/lanes/` (`references/lanes.md`). Repo script: `bash tooling/scripts/next-adr.sh` (next ADR number; reservation rule in §Traps).

## Traps

[`addenda/traps.md`](addenda/traps.md): read it when you write a brief and when its topic comes up. Append new traps there, one bullet each. Next ADR number: `bash tooling/scripts/next-adr.sh`.
