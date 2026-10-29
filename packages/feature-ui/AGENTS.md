# UI Package Agent Guide

## Allowed Content

- UI primitives and wrappers.
- Product primitives such as lists, panels, badges, toolbars, and blocked states.
- Domain display components when they are pure presentation.
- Semantic token implementation.

## Forbidden Content

- API calls.
- Imports from `@ap/feature-shared` or `apps/{platform-api,feature-screens}` (ADR-0016, enforced by `pnpm --filter @ap/platform-api-ops check:boundaries`); mirror the constant locally, as `src/rich-content/allowlist-local.ts` does.
- Backend permission decisions as truth.
- Domain mutation orchestration.
- Feature-specific route state.
- Hard-coded screen workflows.

## Design Rules

- Use semantic tokens, not raw hex values, outside token implementation files.
- SDK-owned parts are imported from the workspace `@ap/ui` (`packages/sdk/ui`, `workspace:*` since #642) directly,
  not through `@ap/feature-ui` (#713q, ADR-0090). That covers the shadcn primitives, tokens and motion
  utilities (`cn`, `prefersReducedMotion`, ...), the panel, toolbar, forms, feedback and layout
  shells, the detail slot (`DetailPanelSlotProvider`, `useDetailPanelSlotHost`,
  `DetailPanelFullscreenContext`), `ObjectRow`, `UserAvatar`, `UserChip`, `ProgressMeter`,
  `SeverityIndicator`, `PermissionBlockedPanel`, `StatusBadgeFrame`, and the rich-content editor,
  renderer, attach button and extensions (upstream ADR-0050, ADR-0052). The compatibility re-export
  files that Bundles 1, 2a, 2b and 3a once kept here were removed: `src/index.ts` exports only the
  FeedbackOps-owned names below, and `@ap/feature-ui` must not re-export an `@ap/ui` name again. Import a
  shared component from `@ap/ui` and a FeedbackOps component from `@ap/feature-ui`; one import
  statement never mixes the two. A test that replaces a shared component (`ListShell`,
  `RichEditor`, ...) mocks `@ap/ui`; a test that replaces a FeedbackOps name mocks `@ap/feature-ui`. A
  `@ap/ui` mock that spreads the real module reads every export, so a test that also mocks
  `sonner` must give that mock a `Toaster`.
- What `@ap/feature-ui` still exports: the FeedbackOps badges (`SeverityBadge`, `ReporterStatusBadge`,
  `InternalTaskBadge`, `UnassignedBadge`, `ManagedSystem*`, `OutlineBadge`, `EntityIconBadge`),
  `LinkedEntityTrail`, the pickers (`ManagedSystemPicker`, `AnalyticsAreaPicker`), `SEVERITY_LABELS`,
  and the FeedbackOps-named aliases of `@ap/ui` parts: `useDetailPanelSlot(node)` is `@ap/ui`'s
  `useDetailPanelContent` under the FeedbackOps name (`undefined` clears, `null` registers a closed
  registrant), `TabsList`/`TabsTrigger` are `@ap/ui`'s unwrapped `TabsListBase`/`TabsTriggerBase`,
  and `TipTapEditor` is the TipTap `Editor` type. `SEVERITY_LABELS` stays in the local
  `SeverityIndicator` module because `@ap/ui` does not expose that value and the local
  `SeverityBadge` uses it. `src/panel/useJumpGuard.ts` stays local because the SDK does not export
  that private helper.
- The detail slot is `@ap/ui`'s: `AppFrame` wraps its frame in `DetailPanelSlotProvider` and renders
  the host through `useDetailPanelSlotHost()`, and the provider owns the expanded state (toggle, Esc,
  reset on key change) and `DetailPanelFullscreenContext`. Tests that render a shell with
  `detailPanel` mount `DetailPanelSlotProvider` plus a host div. Overlapping registrants log the
  SDK's `[DetailPanelSlot] Multiple registrants; the last registrant wins.`
- `src/internal/useHorizontalOverflow.ts` and the rich-content drift anchors stay local. Rich-content
  uses TipTap per ADR-0011. The allowlist original stays in `packages/feature-shared`; the local
  `allowlist-local.ts`, `sanitizeClient.ts`, and `fixtures-local.ts` stay as the drift anchor. The
  ADR-0016 package boundary still keeps `@ap/feature-ui` from importing `@ap/feature-shared`.
- The frontend declares `@ap/ui` (`workspace:*`) directly so its stylesheet
  resolver can reach bundle-1 CSS. It imports
  `@ap/ui/styles/{tokens,semantic,theme,compat}.css` in that order, then
  `@ap/ui/styles/sources.css`.
  Preserve `layer(base)` on the token and semantic imports. Do not use
  `@ap/ui/styles.css`, which adds the platform extension layer.
- `@ap/ui` is the workspace package (`workspace:*` in `packages/sdk/ui/package.json` and
  `apps/feature-screens/package.json`, #642): a change under the repository's `packages/sdk/ui`
  reaches FeedbackOps at once and runs the FeedbackOps CI. Keep the consumer CSS contract
  when either side changes. Keep TipTap at 3.23.5 and
  `@formkit/auto-animate@0.10.0` with its root workspace patch unless a separate
  decision changes those constraints.
- A new Tailwind theme key must also be registered in the `@ap/ui` theme and
  its `cn` merge configuration. tailwind-merge knows only Tailwind's default
  scales, so an unregistered `text-caption` reads as a text color and `cn`
  drops it next to `text-text-muted` (#782).
- `components.json` here only points `@shadcn/lint` at the app's Tailwind
  entry (ADR-0062). It is not a shadcn CLI config; use the intake guidance in
  `docs/architecture/platform-api/tech-stack/component-stack.md`.
- Follow `docs/design/features/tokens.md` tokens for light surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/sdk/ui`.
- Promote from feature-local code only after a second real consumer proves reuse.
- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
- Icon-only controls require accessible labels and tooltips.
