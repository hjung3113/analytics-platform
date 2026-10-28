# Frontend Agent Guide

## Required Docs

- Read `docs/feedbackops/frontend/README.md` before frontend changes.
- Use `docs/feedbackops/frontend/ui-design-system.md` for component behavior and layout contracts.
- Use `docs/feedbackops/frontend/component-inventory.md` before creating a new shared component.
- Use `docs/feedbackops/frontend/routes-and-layout.md` for URL state, list/detail behavior, and responsive navigation.
- Use `docs/feedbackops/frontend/tokens.md` only as the raw token seed.
- Use `apps/feature-screens/src/features/*/AGENTS.md` for route-specific ownership before adding screens.
- New endpoints must use `apiRequest(method, path, parser, opts)` with a response schema from `@ap/feature-shared`; legacy unparsed calls are tracked in `apps/feature-screens/src/lib/api/api-unparsed-allowlist.txt`.

## Design Consistency Rules

- All 36 public screen/core entries are libraries mounted by the platform bridge (#597, ADR-0097). Public screens navigate and notify only through `lib/host`; never import TanStack Router, test adapters or the `@/lib/api` barrel into their reachable graph. Test-local memory-router hosts live under `src/test`; private legacy feature components still using TanStack keep that dependency. There is no standalone runtime, generated route tree, login or app layout.
- Consume semantic tokens such as `--text-primary`, `--surface-detail`, and `--border-selected`; do not hard-code hex colors in screens.
- `pnpm --filter @ap/platform-api-ops lint:design` (`@shadcn/lint`, ADR-0062) checks restyled `@ap/ui` and `@ap/feature-ui` components, raw colors, arbitrary values, and inline styles. Do not add findings; its messages suggest a variant or token, which you verify before applying. When the same override or hard-coded value repeats, add a shared token, variant, or component instead of repeating it. Mechanics: `ops/platform-api/scripts/gates/AGENTS.md`.
- Keep the visual model light, compact, and list-first. Avoid decorative cards, broad gradients, oversized hero sections, and empty whitespace.
- Use one primary action per toolbar or panel. Secondary actions belong in subtle buttons, menus, or contextual rows.
- Reuse `ObjectRow`, `DetailPanelHeader`, `ReporterStatusBadge`, `InternalTaskBadge`, `SeverityBadge`, `PermissionBlockedPanel`, `RichEditor`, and `LinkedEntityTrail` (`ObjectRow`, `DetailPanelHeader`, `PermissionBlockedPanel`, `RichEditor` come from `@ap/ui`; the FeedbackOps-owned list is `packages/feature-ui/src/index.ts`) before making a screen-specific variant.
- Keep components feature-local until a second real feature needs the same behavior; then promote stable reusable components to `packages/feature-ui`.
- Separate reporter-facing status from internal workflow status visually and structurally.
- Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error, and permission-limited states distinct.
- Right detail panels preserve list context on desktop; they become drill-in panels on mobile.
- Permission-limited content must show an approved summary or a request path, not a blank failure.
- Top-level feature folders and route ownership follow root `AGENTS.md` → Implementation Boundaries (canonical list, includes `voc-cluster`).
- Finding and Integration route ownership: see root `AGENTS.md` → Implementation Boundaries, `apps/feature-screens/src/features/findings/AGENTS.md`, and `apps/feature-screens/src/features/integration/AGENTS.md`.
- Use Role Level labels: Admin, Developer, and User. Backend capability checks remain authoritative.
- Keep Public Update, Reporter Reply, and Internal Comment as separate communication surfaces.
- `WorkbenchShell.toolbar` is optional. High-density screens (e.g. VOC Triage) may omit it and express route identity via an inline kicker as the first child of the route-owned toolbar. When doing so, the inner toolbar MUST remain 50px (ADR-0020 §2 rhythm). See ADR-0020 §Amendment for the toolbar-kicker rule.

## Component Intake

- Do not build repeated UI patterns directly inside screens. Create or reuse a feature-local component first, then compose it in the screen.
- Before creating a new component, check `packages/feature-ui`, the feature's existing components, and `docs/feedbackops/frontend/component-inventory.md`.
- Import shared parts (shadcn primitives, panel/toolbar/forms/feedback/layout shells, rich content, `cn`) from `@ap/ui` and FeedbackOps-owned components (badges, pickers, `LinkedEntityTrail`, `useDetailPanelSlot`) from `@ap/feature-ui`; `@ap/feature-ui` no longer re-exports `@ap/ui` names (#713q). Never import shadcn/Radix primitives directly.
- The detail slot is `@ap/ui`'s (bundle 2b): the consuming host wraps its frame in `DetailPanelSlotProvider` and hosts the panel through `useDetailPanelSlotHost()`; shells forward `detailPanel` with `useDetailPanelSlot(node)` (from `@ap/feature-ui`), which is `@ap/ui`'s `useDetailPanelContent` (`undefined` clears, `null` closes). There is no `DetailPanelSlotContext`; tests that render a shell with `detailPanel` mount `DetailPanelSlotProvider` plus a host element.
- Never import `@radix-ui/*` in `apps/feature-screens` (enforced by `pnpm --filter @ap/platform-api-ops check:boundaries`); use the `@ap/ui` primitives.
- Use installed libraries, shadcn/Radix wrappers, and `lucide-react` before hand-rolling interaction behavior, accessibility primitives, icons, popovers, menus, tabs, dialogs, or form controls.
- Add new tokens or variants to docs before using them broadly.
- Use `lucide-react` icons and accessible labels for icon-only controls.

## Verification

- Test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, and status badge separation when touched.
- Desktop 1440 only; tablet and mobile are OOS until responsive lands.

## New Surfaces And Gaps

The shipped UI is the authority for existing screens (root `AGENTS.md` → UI Authority, ADR-0060). For a new surface, start from the closest shipped screen; if `docs/feedbackops/design-prototype/` drew that surface, use it as a reference.

- If neither the shipped UI nor the specs decide a behavior or visual question, check `docs/feedbackops/frontend/specs/`, `docs/feedbackops/design/`, and the ADRs. If all are silent, ask; do not fill the gap with framework defaults or personal taste. Record the resolution in the PR body.
- For layout-changing screens, capture the actual platform host at desktop 1440 and attach the intended before/after to the review under the repository visual workflow.

## Visual Verification

The standalone Playwright visual harness and 25 stale non-CI specs are retired (#597). Platform visual reinforcement is explicitly not implemented in `.planning/backlog.md` (#954), with its reopen condition. Do not restore standalone capture scripts or treat unit tests as visual evidence. Browser/E2E and platform captures belong to the conductor when the worker brief prohibits them.
