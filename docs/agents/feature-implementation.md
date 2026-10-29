# Feature Implementation Guide

DB/role identity: `platform` database and `platform_*` roles. Fresh or uncut clusters use `ops/platform-api/scripts/db/cutover-0076-platform-identity.sh`; see `docs/architecture/platform-api/04-database-and-migrations.md` for the staged procedure.

## Operating Rules

- State assumptions when the request can be read in more than one way.
- Prefer the smallest change that satisfies the request. Do not add speculative flexibility.
- Match existing docs and implementation patterns before inventing new structure.
- Every changed line must trace to a user request, a documented invariant, or a failing verification.
- If domain rules conflict with generic framework habits, follow the domain rules.
- The standalone runtime is retired (#597, platform ADR-0097). Preserve the 36 `@ap/feature-screens` public entries, backend and bridge seams; the platform owns navigation/session/layout. ADR-0097 and ADR-0100 own current names, identity and navigation.
- Paths are repository-root relative. Root `AGENTS.md` owns repository conduct; this on-demand guide covers feature domains only.

## Finish Line And Stops

- **Finish line for an issue:** the touched behavior has passing tests, the [gate](#verification) is green, docs affected by the change are updated in the same PR, and a PR to `main` is open. Merge and close the issue only when auto-merge was granted in this session; otherwise the user merges. For other multi-step work, state the success criteria up front and verify them before claiming completion.
- **Keep going** through steps that don't need the user. **Stop and report** on a documentation conflict that no tiebreak covers ([Source Of Truth](#source-of-truth)), and before any merge, push, or release the user has not authorized in this session.

## UI Authority

The shipped UI is the reference for existing surfaces (FO ADR-0060): the components in `apps/feature-screens` and `packages/feature-ui`, the copy modules in `apps/feature-screens/src/lib/copy/*`, and their actual platform host. Behavior and acceptance criteria come from the specs and ADRs.

- **Changing an existing screen:** reuse its shared components and current pattern, subject to the root prototype approval rule.
- **Building a new surface:** start from the current platform contracts and owner-confirmed prototype. Historical standalone captures do not define current navigation or permissions.
- **Copy:** UI chrome (labels, buttons, headers, microcopy) is Korean; domain nouns (`VOC`, `Finding`, `Task`, `Task Request`, `Survey`, `Cluster`, `Managed System`, `Analytics Area`, `Milestone`, `Evidence`, `Triage`) and Task workflow statuses stay English (FO ADR-0057 A2, amended by #675). Reuse existing strings in `lib/copy` before writing new ones.
- **Three-shell taxonomy (FO ADR-0020).** Every screen is `PageShell`, `ListShell`, or `WorkbenchShell`. Special pages extend the three — never a new shell.
- **Do NOT port from the prototype:** hash routing, `window` globals, `document.execCommand`, synthetic local data, draft-only API intent panels. The platform owns routing and feature screens use the host seam; rich text is TipTap (FO ADR-0002 / FO ADR-0011).
- Visual changes follow root `AGENTS.md`: current-app prototypes and an Artifact checkpoint before implementation, except bug fixes or an already confirmed appearance.

Frontend specifics (visual baselines): `apps/feature-screens/AGENTS.md`.

## Git Workflow

- **Branches and PRs follow the root analytics-platform `AGENTS.md`:** `feat/<n>-<slug>` from `main`, PR to `main`, issues on `hjung3113/analytics-platform`. The FeedbackOps repository is frozen at `c73c55c5` and retires (#597).
- **Hooks.** The standalone repository's `.githooks/` was removed in 713p1; the platform repo sets no `core.hooksPath`.

## Monorepo Boundaries

- No source code at the repo root. Cross-app code in `packages/*` only when both apps need it.
- Product systems (VOC, Finding/Insight, Task, Survey, Dashboard, Permission, Entity Linking, Core Platform) are bounded contexts inside the app shells — not separate deployable apps. Do not create `systems/{system}/frontend|backend`.
- Backend implementation lives under `apps/platform-api/src/modules/*`. Frontend route composition lives under `apps/feature-screens/src/features/*`.

## Required Reading

Before implementation, read every applicable `AGENTS.md` on the path from the repo root to the target directory and the authorities for every touched subject under [Source Of Truth](#source-of-truth). Cross-system workflow changes also require `docs/product/features/10-cross-system-workflows.md`; product-system behavior changes require the matching `docs/product/features/*` contract.

## Source Of Truth

Authority follows subject; there is no universal conflict ladder.

**Authority by subject:**

- `AGENTS.md` (root + per-directory) — agent conduct and repository/ownership boundaries
- `GLOSSARY.md` (root) — domain vocabulary and stable domain invariants
- `docs/adr/*.md` — current platform architectural decisions, including ADR-0097/0100. `docs/adr/history/feedbackops/*.md` preserves the distinct FO ADR decisions; current platform decisions supersede standalone identity and navigation where stated.
- `docs/architecture/platform-api/*.md` and `docs/product/features/*.md` — detailed contracts

**Tiebreaks — apply, do not escalate:**

- An ADR supersedes any other document — `docs/architecture/platform-api/*`, `docs/product/features/*`, `GLOSSARY.md`, `docs/design/history/feedbackops-prototype/`, on the architectural decision it made; repository conduct remains owned by root `AGENTS.md`. Note stale docs and fix them in the same chunk.
- `GLOSSARY.md` owns vocabulary and stable domain invariants, not architecture.
- Root `AGENTS.md` wins when a folder guide conflicts with it; read every applicable folder guide for technical-layer rules.

**Stop and report:** A disagreement between detailed contracts (`docs/architecture/platform-api/*` vs `docs/product/features/*`) stops by design: neither is a decision record, so no tiebreak can pick a winner without fabricating a decision. A grill-locked Q collision, or any contradiction no tiebreak above covers → report which doc must reopen. Never resolve unilaterally.

**USER-FACING COPY (labels, headers, buttons, microcopy) — when a source is silent, in order:**

1. `apps/feature-screens/src/lib/copy/*` and the wording the shipped screen already uses.
2. The owner-confirmed current prototype for a new surface; historical captures are reference only.
3. `docs/design/features/specs/*.md`.
4. `GLOSSARY.md`.

Shipped user-facing strings are implemented in `apps/feature-screens/src/lib/copy/*`; update the matching module when canonical wording changes.

**Per-domain pointers:** endpoint behavior → `docs/architecture/platform-api/03-api-contracts.md` and `docs/architecture/platform-api/api/`; DB + migrations → `04-database-and-migrations.md`; module ownership → `02-domain-module-boundaries.md`; permissions → `05-permission-policy.md`; entity links → `06-entity-linking-contract.md`; background jobs → `docs/adr/history/feedbackops/0009-background-jobs-with-pg-boss.md`; frontend routes → `docs/design/features/routes-and-layout.md`; component contracts → `docs/design/features/ui-design-system.md` + `component-inventory.md`. Visual token seed: `docs/design/features/tokens.md` (Pack 17 light tokens / FO ADR-0021 supersede Pack 20 prototype dark tokens for impl).

## Product Invariants

- VOC is AD-authenticated internal user-submitted voice; never create VOC from Survey Response.
- Finding is the bridge from evidence to execution.
- Task Request protects the Task backlog from unreviewed execution candidates.
- Task status and reporter-facing VOC status are separate state machines.
- Dashboard is an action queue surface, not a chart-only reporting page.
- Analytics Area is managed analytics-menu context, not a forced mirror of routes or code modules.
- Managed System is the MVP scope/filter/defaulting/Developer permission context; do not duplicate VOC, Survey, Task, Finding, Dashboard, or Integration trees per Managed System.
- Cross-system history is canonical through `entity_links`, not convenience columns.

## Implementation Boundaries

- Backend controllers parse HTTP and map responses only.
- Backend application services own transactions, permissions, audits, idempotency, and cross-system commands.
- Repositories write only tables owned by their module.
- Source-shaped routes do not grant write ownership to the source module.
- Frontend screens compose typed API hooks and shared components; they do not enforce backend permissions as truth.
- Frontend feature folders follow these ownership boundaries: `home`, `my-work`, `voc`, `findings`, `voc-cluster`, `surveys`, `tasks`, `cross-system`, `integration`, `admin`.
- Findings feature code lives in `features/findings/` and is mounted at top-level `/findings`. Integration owns the Evidence, Coverage, and Links UI boundaries. Evidence, Coverage, and Links routes stay under `/integration/*` (FO ADR-0065). VOC Clusters are implemented in `features/voc-cluster/` and mounted at the top-level `/voc-clusters` route.
- Managed System Registry, Analytics Areas, Permission Requests, and workspace settings live under Admin routes.
- `packages/feature-shared` must not import either app. `packages/feature-ui` must not call APIs or own domain mutations.

## Verification

- **For feature behavior changes, the subject gates are `pnpm --filter @ap/platform-api test:integration` + `pnpm --filter @ap/platform-api-ops feature:typecheck` + `pnpm --filter @ap/platform-api-ops check:boundaries` + `pnpm --filter @ap/platform-api-ops gate:db-migration-drift` + `pnpm --filter @ap/platform-api-ops gate:fe-typecheck` + `pnpm --filter @ap/platform-api-ops gate:fe-lint` + `pnpm --filter @ap/platform-api-ops lint:design`**. For changed screens, use the retained platform host for the repository browser/E2E and capture workflow; the standalone visual harness is retired (#597). `pnpm test` / `pnpm --filter @ap/platform-api test` alone is **not** the gate: the backend integration suites are env-gated and all skip without a database, so a green there covers only the unit path (#204). The integration command loads `.env` and **truncates + re-seeds the target database** before the run — point it at a throwaway database, never the dev database on 5434 (recipe: `apps/platform-api/AGENTS.md` → Verification, provisioning a throwaway database). See `apps/platform-api/AGENTS.md` → Verification for the env, the reset contract, and the `ALLOW_SKIPPED_INTEGRATION=1` opt-out.
- **Where to run.** Run the gate commands from the repository root (FeedbackOps is part of the root pnpm workspace: root Node 26.7, pnpm 11 and `pnpm-lock.yaml`; install once at the repository root). The feature operating scripts (`feature:typecheck`, `check:boundaries`, `gate:*`, `lint:design`, …) belong to the workspace package `@ap/platform-api-ops` in `ops/platform-api/`: run them as `pnpm --filter @ap/platform-api-ops <script>`.
- **CI.** `.github/workflows/ci.yml` owns unified root lint/typecheck/test/build, additional feature static gates, and disposable Postgres integration/conformance. Its required workspace status includes every gate. `ops/platform-api/scripts/ci/gate.sh static --base <ref>`, `unit`, and `integration` remain explicit operating commands; CI reuses root suites and runs only `static-extra` plus integration separately. The root backend test is DB-free: it removes the three reset inputs and opts out of skipped integration; `test:integration` clears that opt-out. `platform-api`, `feature-shared` and `feature-ui` lint with ESLint over their full source (package `lint`, #1102 a); root ops lint keeps the boundary check, the screens design lint and changed-file Biome (screens, docs, ops only) without caching; provide committed history and `FEATURE_LINT_BASE`. Screens ESLint migration (#1102 b) and platform visual reinforcement #954 remain not implemented in `.planning/backlog.md`.
- **Lint scope (#1102 a done, b pending).** ESLint over the whole package, tests and config files included (`dist`, `coverage` and similar output excluded), with `--max-warnings 0`: `pnpm --filter @ap/platform-api lint` (`foServer`), `@ap/feature-shared` (`foShared`), `@ap/feature-ui` (`foUi`, plus React, Hooks, accessibility and the `@shadcn/lint` design rules); presets in `tooling/eslint/src/feature.js`. These packages are not passed to Biome or Oxlint. The residual Biome scope (`FO_BIOME_SCOPE` in `ops/platform-api/paths.mjs`) is `ops/platform-api`, `apps/feature-screens` and the documentation roots in `FO_DOCS`; Oxlint design lint still targets `apps/feature-screens/src`. `apps/feature-screens` moves to ESLint in #1102 b (not implemented). Focused tests (`describe`/`it`/`test`.only) fail lint. Old-rule correspondence, compiler-covered rules and the deliberate gaps (`noExportsInTest`, `noImplicitAnyLet`, others): `docs/integration/platform-packages.md` §6.
- The FE lint gate diffs committed history against a base ref — pass `--base origin/main`. The standalone route-tree generator is retired and is not a prerequisite. Read `ops/platform-api/scripts/gates/AGENTS.md` before running them or touching their baselines/allowlists.
- For behavior changes and bug fixes, write or update the failing test first, then make the smallest change that passes it. If TDD is not practical, state why and still add verification for the touched behavior.
- Add or update tests for product invariants touched by the change.
- For frontend work, verify desktop 1440 states when layout or interaction changes (see `apps/feature-screens/AGENTS.md` → New Surfaces And Gaps and Visual Verification).
- For backend work, verify permissions, entity link side effects, and audit behavior when touched.
- If verification cannot run, report the exact command and blocker.
- Docs-only changes (Markdown under `docs/`, `AGENTS.md`/`CLAUDE.md`, and `.claude/**/*.md`) need no gate run; confirm instead that every path, script, and symbol they name exists. Scripts and settings under `.claude/` are code: run them or say why not.

### Test Discipline

Test code is a liability. Fewer, sharper tests beat more tests.

- Test behavior, not implementation. No asserts on private methods, internal state, or mock call counts/order (external side effects excepted).
- Before adding a test, grep for existing coverage. Do not duplicate at a lower level when an integration test already covers it.
- One test = one concept. Parameterize variants via `it.each`, not N copies.
- Do not test trivial passthrough (className, data-attr), getters/setters, framework behavior, or chase 100% coverage.
- Pruning: produce a deletion candidate list with one-line reason per file → wait for user approval → run the suite before/after → small batches, never bulk-delete.

## Workflow Operations

The root `AGENTS.md`, global `issue-wave-conductor` skill and `.agents/conductor/PROFILE.md` own workflow, verification size, review tier, merge authorization and cleanup. The former feature-only conductor assets in `ops/platform-api/conductor/` are operating helpers, not a second repository policy. Any integration test uses a throwaway database, never development port 5434.

## PR Review Priorities

When reviewing a PR, prioritize product invariant violations, ownership boundary violations, missing verification, accidental root source files, mismatches between docs and nested agent guides, and frontend changes that break the dense list-first operational UI model.

## Agent Skills

- **Issue tracker.** GitHub issues on `hjung3113/analytics-platform` with the successor label `area:platform-features` (lead-managed rename from `area:feedbackops`), via the `gh` CLI (the old `hjung3113/FeedbackOps` tracker is frozen, #592); external PRs are not a request surface. See `docs/agents/issue-tracker.md`.
- **Triage labels.** Canonical defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- **Domain docs.** Root `GLOSSARY.md` owns the domain glossary and stable invariants; platform ADRs and the separate FO ADR history own architectural decisions; per-directory `AGENTS.md` owns technical-layer rules. See `docs/agents/domain.md`.
- **Skills.** Workflow and general-purpose skills (the `mattpocock/skills` set, `session-handoff`, `issue-wave-conductor`, `orca-dispatch-recipes`, …) are user-level in `~/.agents/skills/`, one copy for every repo; this repo keeps only its stack skills. `/code-review` resolves to the Claude Code built-in. `shadcn` is vendored from `shadcn-ui/ui` (`skills/shadcn`, MIT). `impeccable` (external, `pbakaus/impeccable`) is installed once at user level, shared with other repos: `~/.agents/skills/impeccable` plus the agents `~/.agents/agents/impeccable-*` (#1280); its engine binary downloads on first run. Its edit/stop hooks stay disabled: after an update, check that it added no hook to `~/.claude/settings.json` or `.claude/settings.local.json`.

## Unified workspace integration

Feature code is ordinary repository code, not a submodule (platform ADR-0066). The root workspace includes `@ap/platform-api`, `@ap/feature-screens`, `@ap/feature-shared`, `@ap/feature-ui`, `@ap/feature-bridge` and `@ap/platform-api-ops`. They share Node 26.7.0, pnpm 11.1.1 and the root lockfile. Runtime/browser boundaries and dependency direction remain governed by root and package guides. Root test is DB-free and permits integration skips; actual integration evidence requires `test:integration` against an isolated database. Never truncate the source/development database.

Operating aggregates: `pnpm --filter @ap/platform-api-ops feature:build|feature:dev|feature:test|feature:typecheck`. Feature package membership is defined by `tooling/eslint/src/feature-packages.js`. Integration/CI structure is owned by `docs/integration/repository-layout.md`; a conflict with the platform integration contract must be reported.
