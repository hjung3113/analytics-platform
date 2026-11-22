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

- Touch a menu screen only as far as the platform contract it verifies. Do not polish the screen itself. Exception: menus marked as products in [`menus/AGENTS.md`](menus/AGENTS.md) (now the `log-dev` group) are built to their product scope.
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
| Dividing flows across sessions, owner questions, release order, request classification (Kernel, SDK piece, menu share) | [`PROFILE.md`](.agents/conductor/PROFILE.md) (lane sessions on the Mac and the desktop host; the lead assigns). Lead only: [`lead.md`](.agents/conductor/lead.md). Engine procedure: the skill's `references/lanes.md`, where `PROFILE.md` overrides it |

**When you take on or inherit the lead role,** before any HANDOFF checklist, read [`lead.md`](.agents/conductor/lead.md) to the end plus [`PROFILE.md`](.agents/conductor/PROFILE.md) §Flow, §Size and path and §Owner gates and questions.

If the folder you work in has an `AGENTS.md` (each with a `CLAUDE.md` symlink), follow it too; the root wins on conflict. Feature domain work also reads [feature implementation](docs/agents/feature-implementation.md) and its subject contracts.

## Code

- Commands run from the root (`pnpm install|dev|lint|typecheck|test|build|e2e`).
- Dependency direction is enforced by the boundary lint (`docs/integration/platform-packages.md` §3). Feature packages consume primitives only through `@ap/ui`.
- Kernel, common components and the shell know nothing of menus or mocks. The app injects the menu list through the Registry and the server through `PlatformAdapter`.

## Verification

- **Desktop capture scope:** Screenshots and visual QA cover desktop viewports only. Mobile and tablet support is not currently planned; skip those captures and responsive checks unless the owner revises this scope.

- Local checks before a PR, fix rounds and rebases: [`PROFILE.md`](.agents/conductor/PROFILE.md) §Verify. Root `test` and `build` are PR CI's. During work, `pnpm --filter <pkg> …` is enough; use the shared turbo cache, without `--force`.
- The record of checks is PR CI. The full cold run (`full=true` of `workflow_dispatch`) runs once a week by hand; a release tags on the main-push CI of its SHA — [`lead.md`](.agents/conductor/lead.md) §Slice close.
- Until production, PR CI stays minimal at about 10 minutes of wall clock; the owner names the go-live date (#1931). Release-only checks (SDK upgrade gate, backend images) run on main push and manual runs, never on a PR; the SDK tarball and kit check also runs on a PR that changes SDK code. A new check goes to main push or release first. Which check runs per PR, per slice or pre-go-live: [`PROFILE.md`](.agents/conductor/PROFILE.md) §Pre-go-live. Reason: the PR wait was the bottleneck, and a red `main` stops all work while visual craft can be fixed before go-live.
- When a screen changes, check it in the browser. Run E2E only narrowed, in `apps/platform-e2e` with `pnpm exec playwright test -g "<describe>"`; the whole `pnpm e2e` runs locally only to reproduce a CI failure ([`PROFILE.md`](.agents/conductor/PROFILE.md) §Verify 3).
- `main` requires `Platform workspace (pnpm monorepo)` and `Platform contracts (E2E)`; force pushes and deletion are blocked; the branch need not be up to date. `Platform workspace` includes the PR guard ([`PROFILE.md`](.agents/conductor/PROFILE.md) §Size and path).
- `pnpm lint` includes the design-system rules; fix as the message says. The only exception is an `eslint-disable-next-line` with a reason.
- If you changed only documents, run only `pnpm docs:links`.

## Workflow

- Feature and bug work starts from GitHub issues; one PR closes one issue or a bundle (`Closes #a #b`, one commit per issue). Typos, document cleanup and small fixes may go without an issue. Limits, bundles and work found along the way: [`PROFILE.md`](.agents/conductor/PROFILE.md) §Size and path and §Fold scope.
- The procedure for merges, CI and a broken `main` is the global `issue-wave-conductor` skill's `references/lane-merge.md`. When fixing a behaviour bug, add a regression test that fails before the fix.
- The lead updates `.planning/README.md` once, in the release-docs PR; mid-slice progress is `board.py` output. When a contract changes, fix that contract's owning document (ownership: `docs/AGENTS.md`).
- The user owns the composition of spaces and menus. Even if an issue states a prerequisite such as "agreement with the domain owner", do not leave it as an external wait; bring a recommendation and a real-app prototype to the user (#252).
- A decision a person must answer follows [`PROFILE.md`](.agents/conductor/PROFILE.md) §Owner gates and questions (the one home for that rule).

## UI

A `?variant=` prototype and owner confirmation by Artifact link are required only if test A or B holds. Otherwise the PR goes without a prototype and without asking the owner: it attaches one before/after capture and records the call under **Decisions** in the PR body; the lead checks the capture before merge and passes the link to the owner after it. The owner reverses by saying so.

Exception: a change to how a menu screen presents its information needs 2–3 variants and the owner's pick first, whatever tests A and B say ([`PROFILE.md`](.agents/conductor/PROFILE.md) §Owner gates, menu look gate).

**A. New:** adds a screen or route, a Page Archetype, a shell region, a new visual component exported from `@ap/ui` or `@ap/components`, a new token family, or a new `DESIGN.md` direction.

**B. Critical or hard to undo:** changes every screen at once, judged by path: a token value in `packages/sdk/ui/src/styles/*.css` or `packages/sdk/ui/src/theme/theme-tokens.json`, the shell frame in `packages/sdk/shell/src/frame/`, or a Page Archetype default in `packages/sdk/components/src/archetypes/` (tests excluded); changes a public SDK prop or default that menus must adapt to; changes stored or linkable state (URL keys, persisted layout, saved views); moves or renames spaces or menus; or removes a user-visible function.

**In doubt:** if reverting this one PR restores the previous behaviour for users and for menus, it is not B.

Bug fixes and moving an already confirmed look are exempt. A confirmed variant is the spec; a departure needs the owner's OK in the PR body. Discard prototype code and keep the decision in the issue or ADR.

The procedure for designing a new screen (Requirements → IA → Screen Spec → Wireframe → Open Decisions) is `.agents/skills/analysis-platform-wireframe/SKILL.md`.

## Agent assets

- A new folder guide is `AGENTS.md` plus `ln -s AGENTS.md CLAUDE.md`.
- The sources of skills, commands and external design references are `.agents/skills`, `.agents/commands` and `.agents/references` (usage in `.agents/README.md`). External skills and references do not override product contracts.
- Issue tracker setup (GitHub Issues, `area:*` labels, milestones): `docs/agents/issue-tracker.md`. The five triage labels: `docs/agents/triage-labels.md`. Domain document layout: `docs/agents/domain.md`.
- Vendored skills (`fastapi`, `supabase-postgres-best-practices`) stay in `.agents/skills-off/` until #155.
