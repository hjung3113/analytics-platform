# Feature Implementation Guide

## Operating Rules

- The standalone runtime is retired (platform ADR-0097). Preserve the retained public entries of `@ap/feature-screens`, backend and bridge seams; the platform owns navigation/session/layout. ADR-0097 and ADR-0100 own current names, identity and navigation.
- Paths are repository-root relative. Root `AGENTS.md` owns repository conduct; this guide covers feature domains only. Workflow, tier, review and merge rules: [`PROFILE.md`](../../.agents/conductor/PROFILE.md).

## UI Authority

The shipped UI is the reference for existing surfaces (FO ADR-0060): the components in `apps/feature-screens` and `packages/feature-ui`, the copy modules in `apps/feature-screens/src/lib/copy/*`, and their actual platform host. Behavior and acceptance criteria come from the specs and ADRs.

- **Changing an existing screen:** reuse its shared components and current pattern, subject to the root prototype approval rule.
- **Building a new surface:** start from the current platform contracts and owner-confirmed prototype. Historical standalone captures do not define current navigation or permissions.
- **Copy:** UI chrome (labels, buttons, headers, microcopy) is Korean; domain nouns (`VOC`, `Finding`, `Task`, `Task Request`, `Survey`, `Cluster`, `Managed System`, `Analytics Area`, `Milestone`, `Evidence`, `Triage`) and Task workflow statuses stay English (FO ADR-0057 A2). Reuse existing strings in `lib/copy` before writing new ones.
- **Three-shell taxonomy (FO ADR-0020).** Every screen is `PageShell`, `ListShell`, or `WorkbenchShell`. Special pages extend the three — never a new shell.
- **Do NOT port from the prototype:** hash routing, `window` globals, `document.execCommand`, synthetic local data, draft-only API intent panels. The platform owns routing and feature screens use the host seam; rich text is TipTap (FO ADR-0002 / FO ADR-0011).
- Visual changes follow root `AGENTS.md` §UI.

Frontend specifics (visual baselines): `apps/feature-screens/AGENTS.md`.

## Git Workflow

Branches and PRs follow the root `AGENTS.md` (`feat/<n>-<slug>` from `main`, issues on `hjung3113/analytics-platform`). The old `hjung3113/FeedbackOps` repository is archived.

## Monorepo Boundaries

- No source code at the repo root. Cross-app code in `packages/*` only when both apps need it.
- Product systems (VOC, Finding/Insight, Task, Survey, Dashboard, Permission, Entity Linking, Core Platform) are bounded contexts inside the app shells — not separate deployable apps. Do not create `systems/{system}/frontend|backend`.
- Backend implementation lives under `apps/platform-api/src/modules/*`. Existing frontend route composition lives under `apps/feature-screens/src/features/*`, which is frozen for new screens (platform ADR-0133).

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
3. `apps/feature-screens/docs/specs/*.md`.
4. `GLOSSARY.md`.

Shipped user-facing strings are implemented in `apps/feature-screens/src/lib/copy/*`; update the matching module when canonical wording changes.

**Per-domain pointers:** endpoint behavior → `docs/architecture/platform-api/03-api-contracts.md` and `docs/architecture/platform-api/api/`; DB + migrations → `apps/platform-api/docs/04-database-and-migrations.md`; module ownership → `apps/platform-api/docs/02-domain-module-boundaries.md`; permissions → `05-permission-policy.md`; entity links → `06-entity-linking-contract.md`; background jobs → `docs/adr/history/feedbackops/0009-background-jobs-with-pg-boss.md`; frontend routes → `apps/feature-screens/docs/routes-and-layout.md`; component contracts → `apps/feature-screens/docs/ui-design-system.md` + `apps/feature-screens/docs/component-inventory.md`. Visual token seed: `apps/feature-screens/docs/tokens.md` (Pack 17 light tokens / FO ADR-0021 supersede Pack 20 prototype dark tokens for impl).

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
- Frontend feature folders follow these ownership boundaries: `home`, `my-work`, `voc`, `findings`, `voc-cluster`, `surveys`, `tasks`, `cross-system`, `integration`, `admin`, `api-tokens`, `log-lifecycle`, `log-datasets` (Kernel-hosted list, tab detail and regression comparison).
- Findings feature code lives in `features/findings/` and is mounted at top-level `/findings`. Integration owns the Evidence, Coverage, and Links UI boundaries. Evidence, Coverage, and Links routes stay under `/integration/*` (FO ADR-0065). VOC Clusters are implemented in `features/voc-cluster/` and mounted at the top-level `/voc-clusters` route.
- Managed System Registry, Analytics Areas, Permission Requests, and workspace settings live under Admin routes.
- `packages/feature-shared` must not import either app. `packages/feature-ui` must not call APIs or own domain mutations.

## Verification

- **Gates for feature behavior changes:** [`PROFILE.md`](../../.agents/conductor/PROFILE.md) §Verify step 5 (`gate.sh static-extra` + `test:integration` on a throwaway DB), plus `pnpm --filter @ap/feature-screens lint` and the `@ap/platform-api-ops` `feature:typecheck`, `check:boundaries`, `gate:db-migration-drift`, `gate:fe-typecheck`, `gate:fe-lint` scripts. `pnpm --filter @ap/platform-api test` alone is not the gate: the integration suites skip without a database. `test:integration` truncates and re-seeds its target database, so never point it at the dev database on 5434 (`apps/platform-api/AGENTS.md` → Verification: env, reset contract, throwaway-database recipe, `ALLOW_SKIPPED_INTEGRATION=1`). Changed screens use the platform host for browser/E2E and captures.
- **Where to run.** Run the gate commands from the repository root (the feature suite is part of the root pnpm workspace: root Node 26.7, pnpm 11 and `pnpm-lock.yaml`; install once at the repository root). The feature operating scripts (`feature:typecheck`, `check:boundaries`, `gate:*`, …) belong to the workspace package `@ap/platform-api-ops` in `ops/platform-api/`: run them as `pnpm --filter @ap/platform-api-ops <script>`.
- **CI.** `.github/workflows/ci.yml` owns unified root lint/typecheck/test/build, additional feature static gates, and disposable Postgres integration/conformance. Its required workspace status includes every gate. `ops/platform-api/scripts/ci/gate.sh static --base <ref>`, `unit`, and `integration` remain explicit operating commands; CI reuses root suites and runs only `static-extra` plus integration separately. The root backend test is DB-free: it removes the three reset inputs and opts out of skipped integration; `test:integration` clears that opt-out. `platform-api`, `feature-shared`, `feature-ui` and `feature-screens` lint with ESLint over their full source (package `lint`, #1102 a·b); root ops lint keeps the boundary check and changed-file Biome (docs and ops only) without caching; provide committed history and `FEATURE_LINT_BASE`. Platform visual reinforcement #954 remains not implemented in `.planning/backlog.md`.
- **Lint scope.** ESLint over each whole package (tests and config included, `--max-warnings 0`): `pnpm --filter <@ap/platform-api|@ap/feature-shared|@ap/feature-ui|@ap/feature-screens> lint`, presets in `tooling/eslint/src`; focused tests (`.only`) fail lint. These packages never go to Biome. The residual Biome scope (`FEATURE_BIOME_SCOPE` in `ops/platform-api/paths.mjs`) is `ops/platform-api` and `FEATURE_DOCS`. Screens CSS and JSON configs are covered by neither (not implemented). Old-rule correspondence and deliberate gaps: `docs/integration/platform-packages.md` §6.
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

Workflow, verification size, review tier and merge authorization: root `AGENTS.md` and [`PROFILE.md`](../../.agents/conductor/PROFILE.md). Helpers in `ops/platform-api/conductor/scripts/` are operating scripts, not a second policy. Any integration test uses a throwaway database, never port 5434.

## PR Review Priorities

When reviewing a PR, prioritize product invariant violations, ownership boundary violations, missing verification, accidental root source files, mismatches between docs and nested agent guides, and frontend changes that break the dense list-first operational UI model.

## Agent Skills

Issue tracker, triage labels and domain docs: [issue-tracker](issue-tracker.md), [triage-labels](triage-labels.md), [domain](domain.md). Skills are user-level (`~/.agents/skills/`) except the repo's stack skills ([`.agents/README.md`](../../.agents/README.md)); `impeccable` hooks stay disabled — after an update check that it added none to `~/.claude/settings.json` or `.claude/settings.local.json`.

## Unified workspace integration

Feature code is ordinary repository code, not a submodule (platform ADR-0066). The root workspace includes `@ap/platform-api`, `@ap/feature-screens`, `@ap/feature-shared`, `@ap/feature-ui`, `@ap/feature-bridge` and `@ap/platform-api-ops`. They share Node 26.7.0, pnpm 11.1.1 and the root lockfile. Runtime/browser boundaries and dependency direction remain governed by root and package guides. Root test is DB-free and permits integration skips; actual integration evidence requires `test:integration` against an isolated database. Never truncate the source/development database.

Operating aggregates: `pnpm --filter @ap/platform-api-ops feature:build|feature:dev|feature:test|feature:typecheck`. Feature package membership is defined by `tooling/eslint/src/feature-packages.js`. Integration/CI structure is owned by `docs/integration/repository-layout.md`; a conflict with the platform integration contract must be reported.
