# Frontend Agent Guide

Feature-folder guides under `src/features/` describe semantic screen intents. Runtime registration belongs to platform menus and `@ap/feature-bridge`; standalone routes and `*Route` compositions are retired (#597). Adapters under `src/test` are test-only.

## Required docs

- `docs/design/features/README.md` — read before frontend changes.
- `apps/feature-screens/docs/ui-design-system.md` — component behavior and layout contracts.
- `apps/feature-screens/docs/component-inventory.md` — check before a new shared component.
- `apps/feature-screens/docs/routes-and-layout.md` — URL state, list/detail behavior, responsive navigation.
- `apps/feature-screens/docs/tokens.md` — raw token seed only.
- `apps/feature-screens/src/features/*/AGENTS.md` — route ownership before adding screens.
- Traps before editing tests or shared UI: [frontend tests](../../.claude/rules/feature-screens-tests.md), [`@ap/ui` and `@ap/feature-ui`](../../.claude/rules/feature-ui.md).

## Entry and host rules

- Public screen/core entries are libraries mounted by the platform bridge (#597, ADR-0097); there is no standalone runtime, generated route tree, login or app layout.
- Public screens navigate and notify only through `lib/host` (`log-lifecycle` receives Kernel menu-query/action hooks from its native menu host); never import TanStack Router, test adapters or the `@/lib/api` barrel into their reachable graph.
- Test-local memory-router hosts live under `src/test`; private legacy feature components still using TanStack keep that dependency.
- New endpoints use `apiRequest(method, path, parser, opts)` with a response schema from `@ap/feature-shared`; legacy unparsed calls are tracked in `src/lib/api/api-unparsed-allowlist.txt`.
- Route ownership per feature: `docs/agents/feature-implementation.md` → Implementation Boundaries (canonical list, includes `voc-cluster`); Finding and Integration details in `features/findings/AGENTS.md` and `features/integration/AGENTS.md`.

## Lint

The root design-lint rules apply here; package specifics:

- `pnpm --filter @ap/feature-screens lint` = ESLint `featureScreensPreset` (ADR-0062): the `@shadcn/lint` design rules plus correctness, React Hooks and accessibility over `src`, tests and config files (`--max-warnings 0`; tests exempt from the design rules only).
  - It checks restyled `@ap/ui`/`@ap/feature-ui` components, raw colors, arbitrary values and inline styles.
  - Preset and old-rule table: `docs/integration/platform-packages.md` §6. Biome does not cover this package.
- Same exception policy as root: only `// eslint-disable-next-line <rule> -- <reason>` directly above the finding (an unused directive fails). When the same override or hard-coded value repeats, add a shared token, variant or component instead of repeating it.
- The root Radix rule (`@radix-ui/*` only in `@ap/ui`) is enforced here by `pnpm --filter @ap/platform-api-ops check:boundaries`.

## Design rules

- Semantic tokens only (`--text-primary`, `--surface-detail`, `--border-selected`); no hard-coded hex colors in screens.
- Light, compact, list-first visual model: no decorative cards, broad gradients, oversized hero sections, empty whitespace.
- One primary action per toolbar or panel; secondary actions in subtle buttons, menus or contextual rows.
- Reuse before screen-specific variants: `ObjectRow`, `DetailPanelHeader`, `PermissionBlockedPanel`, `RichEditor` (`@ap/ui`) plus the feature-owned list in `packages/feature-ui/src/index.ts` (`ReporterStatusBadge`, `InternalTaskBadge`, `SeverityBadge`, `LinkedEntityTrail`, …).
- Components stay feature-local until a second real feature needs them; then promote stable reusable components to `packages/feature-ui`.
- Keep reporter-facing status separate from internal workflow status, visually and structurally.
- Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error and permission-limited states distinct.
- Right detail panels preserve list context on desktop and become drill-in panels on mobile.
- Permission-limited content shows an approved summary or a request path, never a blank failure.
- Role Level labels: Admin, Developer, User; backend capability checks remain authoritative.
- Keep Public Update, Reporter Reply and Internal Comment as separate communication surfaces.
- `WorkbenchShell.toolbar` is optional: high-density screens (e.g. VOC Triage) may omit it and express route identity via an inline kicker as the first child of the route-owned toolbar; the inner toolbar MUST remain 50px (ADR-0020 §2; toolbar-kicker rule in ADR-0020 §Amendment).

## Component intake

- Build repeated UI patterns as feature-local components and compose them in screens, never directly in screens; before a new component check `packages/feature-ui`, the feature's existing components and `docs/component-inventory.md`.
- Import shared parts (shadcn primitives, panel/toolbar/forms/feedback/layout shells, rich content, `cn`) from `@ap/ui`; feature-owned components (badges, pickers, `LinkedEntityTrail`, `useDetailPanelSlot`) from `@ap/feature-ui`, which no longer re-exports `@ap/ui` names (#713q). Never import shadcn/Radix primitives directly.
- The detail slot is `@ap/ui`'s (bundle 2b); there is no `DetailPanelSlotContext`.
  - The consuming host wraps its frame in `DetailPanelSlotProvider` and hosts the panel through `useDetailPanelSlotHost()`.
  - Shells forward `detailPanel` with `useDetailPanelSlot(node)` (`@ap/feature-ui`) = `@ap/ui`'s `useDetailPanelContent` (`undefined` clears, `null` closes). Tests rendering a shell with `detailPanel` mount `DetailPanelSlotProvider` plus a host element.
- Use installed libraries, shadcn/Radix wrappers and `lucide-react` before hand-rolling interaction behavior, accessibility primitives, icons, popovers, menus, tabs, dialogs or form controls; icon-only controls need accessible labels.
- Add new tokens or variants to docs before using them broadly.

## Verification

- When touched: test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, status badge separation.
- Desktop 1440 only (root capture scope); tablet and mobile are OOS until responsive lands.

## New surfaces and gaps

- The shipped UI is the reference for existing screens (`docs/agents/feature-implementation.md` → UI Authority, FO ADR-0060). New surfaces follow current platform contracts and the owner-confirmed prototype per the root `AGENTS.md`; historical standalone captures are reference only.
- Undecided behavior or visual questions: check `apps/feature-screens/docs/specs/`, `docs/product/features/` and the ADRs; if all are silent, ask — never fill the gap with framework defaults or personal taste. Record the resolution in the PR body.
- Layout-changing screens: capture the actual platform host at desktop 1440 and attach the intended before/after under the repository visual workflow.

## Visual verification

- The standalone Playwright visual harness is retired (#597); do not restore standalone capture scripts or treat unit tests as visual evidence. Platform visual reinforcement is unimplemented (`.planning/backlog.md` #954, with its reopen condition).
- Browser/E2E and platform captures belong to the conductor when the worker brief prohibits them.
