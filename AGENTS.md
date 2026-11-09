# AGENTS.md — analytics-platform

## Purpose of this repository

The goal is not to build menus such as equipment management, master data, productivity analysis, metrics, notices or VOC. The goal is **the platform those menus sit on**. The platform provides the five areas below, and the menu screens in this repo are only samples (Consumers) that verify those areas. The real menus are built in-house.

| Area | Content | Source |
| --- | --- | --- |
| Kernel functions | Menu Registry, global Context, deep link/URL contract, permissions and Scope, Audit | `docs/contract/kernel.md` §4–6 |
| Common components | PlatformDataTable, DetailDrawer, AuditTimeline, DataTrustIndicator and others | `docs/contract/components.md` §13 |
| Chart contract | Chart Frame + common Zoom/Brush/Compare/Annotate interaction | `docs/contract/chart.md` §16 |
| Layout | Five Page Archetypes: Overview/Analysis Workspace/Management/Catalog/Workflow | `docs/contract/layout.md` §12 |
| Cross-menu links | Cross-menu Context Link, destination ID kept separate from analysis Context | `docs/contract/cross-menu-links.md` §22 |

The detailed sources are `docs/contract/platform-ui-contract.md` (the index) and the per-area documents its "section → document" table points to (Platform Done §29, commonization criteria §24).

**The SDK provides general-purpose building blocks.** When a request comes in, do not look for the part that completes that one menu. Look for **general-purpose pieces** from which the menu itself can assemble that function and the next similar one. The test is not size but whether other menus can use it as is: if it is general-purpose, the SDK provides even a complex function whole (promotion criteria in the list below). What differs per menu, such as hierarchy and step count, row names and the drill-down gesture (click, double-click, button), is declared by the menu, and the SDK takes that declaration and acts on it. Constraints the SDK imposes (limits, fixed gestures, single-choice policies) exist only for reasons such as security, data integrity or accessibility, and the contract states the reason. Check the domain terms in a request against `GLOSSARY.md` before mapping them to pieces. Example: an equipment → module → operation drill is assembled from two pieces, "drill by the steps the menu declared" and "category rows of a horizontal bar" ([ADR-0063](docs/adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md)).

- Touch a menu screen only as far as the platform contract it verifies. Do not polish the screen itself.
- There is one promotion criterion. A general-purpose piece with no domain knowledge goes in the SDK regardless of the number of consumers ([ADR-0052](docs/adr/0052-rich-content-stays-in-the-sdk.md)). "No menu needs it yet" is not a reason to postpone an SDK piece. Add it as an option that does not change the default behaviour, so existing consumers are unaffected. A pattern that arose inside a menu is promoted to common only after 2–3 real consumers confirm it (§24). Kernel duties (§4: instrumentation, audit, Registry and so on) are outside this criterion.
- When a menu requirement conflicts with a common contract (deep link keys, wall-clock time, URL security boundaries and so on), fit the menu to the contract. If the contract itself must change, raise it with the user.
- Before building three or more new menu screens in a row, confirm the scope with the user.

## Where to start

| What you want to know | Document |
| --- | --- |
| Remaining work, what is next, decisions waiting | [`.planning/README.md`](.planning/README.md) |
| Design and contract documents and per-task reading paths | [`docs/INDEX.md`](docs/INDEX.md) |
| Domain terms | [`GLOSSARY.md`](GLOSSARY.md) |
| Visual rules | [`DESIGN.md`](DESIGN.md) |
| Decisions and their reasons | [`docs/adr/`](docs/adr/) |
| Agent operations notes (worker sandbox, worktrees, capture traps) | [`docs/agents/operations.md`](docs/agents/operations.md) |
| Dividing flows across sessions, request classification (Kernel, SDK piece, menu share), release order | [`PROFILE.md`](.agents/conductor/PROFILE.md). The lead and lane procedure is the engine skill's `references/lanes.md` |

**When you take on or inherit the lead role,** before any HANDOFF checklist, resume in the order of the global `issue-wave-conductor` skill's `references/lanes.md` §Lead «Lead rotation», and read [`PROFILE.md`](.agents/conductor/PROFILE.md) to the end.

If the folder you work in has an `AGENTS.md`, follow it too (table below). If a folder guide conflicts with the root, the root wins.

## Code

- Root pnpm workspace: `apps/*`, `packages/*` (features `feature-*`), `packages/sdk/*`, `packages/adapters/*`, `menus/*/*`, `platform/*`, `tooling/*`. Node 26.7.0, pnpm 11.1.1. Commands run from the root: `pnpm install|dev|lint|typecheck|test|build|e2e`.
- The dependency direction is `contracts → ui/kernel → components → shell → apps`; reverse imports are forbidden (enforced by the boundary lint, source `docs/integration/platform-packages.md` §3). Feature packages consume primitives only through `@ap/ui`.
- Kernel, common components and the shell know nothing of menus or mocks. The app injects the menu list through the Registry and the server through `PlatformAdapter`.

## Verification

- **Desktop capture scope:** Screenshots and visual QA cover desktop viewports only. Mobile and tablet support is not currently planned; skip those captures and responsive checks unless the owner revises this scope.

- Before an issue's first implementation commit: when the node diff is `verify=full` in `tier.sh`, `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must all end with 0 (`verify-root.sh`); when it is `verify=light`, run only `lint` and `typecheck` (and the changed-package checks) and leave `test` and `build` to PR CI. The path list is `lanes.tier_full_regex` in `conductor.json`; the fix-round and pre-ship rules are owned by [`PROFILE.md`](.agents/conductor/PROFILE.md) §Verify. Use the worktree-shared turbo cache, without `--force`. During work, `pnpm --filter <pkg> …` is enough.
- The record of checks is PR CI. Full and cold runs (`full=true` of `workflow_dispatch`) run only before a release tag — [`PROFILE.md`](.agents/conductor/PROFILE.md) §Slice close.
- When a screen changes, check it in the browser. When Kernel, the shell, common components or the mock server change, except `tier=small`: PR CI's selected specs stand in, run only the related E2E in `apps/platform-e2e` with `pnpm exec playwright test -g "<describe>"`. Do not run the whole `pnpm e2e` locally (only to reproduce a CI failure). Which specs CI runs, and why a green PR is not a full E2E record, is in [`PROFILE.md`](.agents/conductor/PROFILE.md) §Verify 3. Per-item reports are in `apps/platform-e2e/contract-report/`.
- `main` is protected by the ruleset `main: required CI` (#670 D2). The two checks `Platform workspace (pnpm monorepo)` and `Platform contracts (E2E)` must pass to merge, and force pushes and deletion are blocked. The branch need not be up to date (not strict).
- `pnpm lint` also checks the design-system rules (`@shadcn/lint`, #228). The error message names the token, variant or component to use instead, so fix it as told. Class strings in `.ts` files are checked too. There is no exception-list file — the only exception is an `eslint-disable-next-line` with a reason, and a disable comment that blocks nothing is an error. Only `@ap/ui` imports `@radix-ui/*`.
- If you changed only documents, run only `pnpm docs:links` (the document link check).
- Do not report a check you did not run as done.

## Workflow

- Feature and bug work starts from a GitHub issue, and the PR body says `Closes #n`. Typos, document cleanup and small fixes may go without an issue. Separate work found along the way follows [`PROFILE.md`](.agents/conductor/PROFILE.md) §Fold scope and the fold, file and note rules of `issue-wave-conductor`.
- The procedure for merges, CI and a broken `main` is the global `issue-wave-conductor` skill's `references/lane-merge.md`. When fixing a behaviour bug, add a regression test that fails before the fix.
- Issues given to workers follow the global `issue-wave-conductor` skill's procedure; this repo's part is [`.agents/conductor/PROFILE.md`](.agents/conductor/PROFILE.md). The review tier (`tier.sh`), reviews, fix rounds and re-review conditions are owned by that skill's `references/lanes.md` §Size and path.
- The lead updates `.planning/README.md` once, in the release-docs PR; mid-slice progress is `board.py` output. When a contract changes, fix that contract's owning document (ownership: `docs/AGENTS.md`).
- The user owns the composition of spaces and menus. Even if an issue states a prerequisite such as "agreement with the domain owner", do not leave it as an external wait; bring a recommendation and a real-app prototype to the user (#252).
- A decision a person must answer goes to the lead as `질문 #n`; add `ready-for-human` to the issue only when the session hands over without an answer. Nothing that relies on that decision is implemented before the answer. A decision chosen among real alternatives is recorded as an ADR in `docs/adr/`.

## UI

A `?variant=` prototype and owner confirmation by Artifact link are required only if test A or B holds. Otherwise the lane ships without a prototype and without asking, attaches one before/after capture, and records the call under **Decisions** in the PR body. The owner reverses by saying so.

**A. New:** adds a screen or route, a Page Archetype, a shell region, a new visual component exported from `@ap/ui` or `@ap/components`, a new token family, or a new `DESIGN.md` direction.

**B. Critical or hard to undo:** changes every screen at once (a global token value, the shell frame, a Page Archetype default); changes a public SDK prop or default that menus must adapt to; changes stored or linkable state (URL keys, persisted layout, saved views); moves or renames spaces or menus; or removes a user-visible function.

**In doubt:** if reverting this one PR restores the previous behaviour for users and for menus, it is not B.

Bug fixes and moving an already confirmed look are exempt. A confirmed variant is the spec; a departure needs the owner's OK in the PR body. Discard prototype code and keep the decision in the issue or ADR.

The procedure for designing a new screen (Requirements → IA → Screen Spec → Wireframe → Open Decisions) is `.agents/skills/analysis-platform-wireframe/SKILL.md`.

## Folder guides

| Folder | Role |
| --- | --- |
| [`docs/`](docs/AGENTS.md) | Design contract sources, status-word and ownership rules |
| [`apps/platform-web/`](apps/platform-web/AGENTS.md) | Assembly point (GROUPS and Registry assembly, adapter injection), dev tools |
| [`apps/platform-e2e/`](apps/platform-e2e/AGENTS.md) | Automated platform contract checks (Playwright, black box) and per-item reports |
| [`menus/`](menus/AGENTS.md) | Business-system menu Consumer packages (`menus/<system>/<group>`, `@ap/menu-<group>`, per-group manifest and screens) |
| [`platform/`](platform/AGENTS.md) | Platform feature Consumer packages (`platform/<feature>`, one level, not SDK. Spaces are set only by `GROUPS`. Home, my activity, notices, operations console, and feature (VOC, surveys, Task, Finding) menu assembly) |
| [`packages/`](packages/AGENTS.md) | Common platform package rules and dependency direction → each package's `AGENTS.md` |
| [`tooling/`](tooling/AGENTS.md) | Shared tsconfig, boundary lint, menu generator (`pnpm gen:menu`), CSS selector comparison |
| [`ops/platform-api/`](ops/platform-api/scripts/gates/AGENTS.md) | Core-server and feature operations tools (compose, DB and backup scripts) and static check gates |
| [`site/`](site/AGENTS.md) | Intro page (static, outside the workspace) and Pages assembly |
| [`archive/`](archive/AGENTS.md) | Pre-integration Kernel unit prototypes and old operating profiles (preserved, no new features) |
| [`apps/platform-api/`](apps/platform-api/AGENTS.md) · [`apps/feature-screens/`](apps/feature-screens/AGENTS.md) | Core-server and feature-screen ownership; for feature domain work, read [feature implementation](docs/agents/feature-implementation.md) and its subject contracts. |

## Agent assets

- The source of guidance is each folder's `AGENTS.md`, and the `CLAUDE.md` in the same folder is a relative symlink to it. Link a new folder guide with `ln -s AGENTS.md CLAUDE.md` as well.
- The sources of skills, commands and external design references are `.agents/skills`, `.agents/commands` and `.agents/references` (usage in `.agents/README.md`). External skills and references do not override product contracts.
- Issue tracker setup (GitHub Issues, `area:*` labels, milestones): `docs/agents/issue-tracker.md`. The five triage labels: `docs/agents/triage-labels.md`. Domain document layout: `docs/agents/domain.md`.
- Vendored skills (`fastapi`, `supabase-postgres-best-practices`) stay in `.agents/skills-off/` until #155. Sources and priority are in `.agents/README.md`. General skills such as `prototype`, `diagnosing-bugs`, `vercel-react-best-practices` and `shadcn` are global (`~/.agents/skills`).
