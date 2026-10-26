# UI Package Agent Guide

## Allowed Content

- UI primitives and wrappers.
- Product primitives such as lists, panels, badges, toolbars, and blocked states.
- Domain display components when they are pure presentation.
- Semantic token implementation.

## Forbidden Content

- API calls.
- Imports from `@fops/shared` or `apps/*` (ADR-0016, enforced by `pnpm --filter @fops/ops check:boundaries`); mirror the constant locally, as `src/rich-content/allowlist-local.ts` does.
- Backend permission decisions as truth.
- Domain mutation orchestration.
- Feature-specific route state.
- Hard-coded screen workflows.

## Design Rules

- Use semantic tokens, not raw hex values, outside token implementation files.
- Bundle 1 (tokens, motion utilities, and shadcn primitives) is sourced from
  the workspace `@ap/ui` (`packages/ui`, `workspace:*` since #642). The local `src/index.ts` preserves the
  `@fops/ui` API; `src/components/shadcn/*` and selected `src/utils/*`
  files are compatibility re-exports only. Do not add implementation there.
- Bundle 2a (panel, toolbar, forms, and feedback components) is sourced from
  the workspace `@ap/ui`. The matching files under `src/{panel,toolbar,forms,
  feedback}` and their entries in `src/index.ts` are compatibility re-exports;
  keep the FeedbackOps tests local. `src/panel/useJumpGuard.ts` remains local
  because the SDK does not export that private helper, and its existing test
  imports the helper directly.
- Bundle 2b (layout shells and the detail slot) is sourced from the workspace
  `@ap/ui`. `src/layout/*` are compatibility re-exports. `useDetailPanelSlot(node)`
  is `@ap/ui`'s `useDetailPanelContent` under the FeedbackOps name (`undefined`
  clears, `null` registers a closed registrant). `DetailPanelSlotContext` is gone:
  `AppFrame` wraps its frame in `DetailPanelSlotProvider` and renders the host
  through `useDetailPanelSlotHost()`, and the provider owns the expanded state
  (toggle, Esc, reset on key change) and `DetailPanelFullscreenContext`. Tests that
  render a shell with `detailPanel` mount `DetailPanelSlotProvider` plus a host div.
  Overlapping registrants log the SDK's `[DetailPanelSlot] Multiple registrants; the last registrant wins.`
- Bundle 3a (`ObjectRow`, `UserAvatar`, `UserChip`, `ProgressMeter`,
  `SeverityIndicator`, `PermissionBlockedPanel`, and `StatusBadgeFrame`) is sourced
  from the workspace `@ap/ui`, per the SDK ownership decisions in upstream ADR-0050 and ADR-0052.
  Their matching files under `src/{data,identity,indicators,permissions,badges}` are
  compatibility re-exports. Keep FeedbackOps tests local. `SEVERITY_LABELS` stays
  in the local `SeverityIndicator` module because `@ap/ui` does not expose that
  value from its package entry and the local `SeverityBadge` uses it.
- FeedbackOps-owned product/domain components remain local under
  `src/{badges,data,entity,identity,indicators,permissions}`.
  `src/internal/useHorizontalOverflow.ts` also remains local. Rich-content uses
  TipTap per ADR-0011; its editor, renderer, attach button, and extensions are
  sourced from the workspace `@ap/ui` per upstream ADR-0052. `RichEditor.tsx`,
  `RichContentRenderer.tsx`, `toolbar/AttachButton.tsx`,
  `extensions/attachmentRef.ts`, and `extensions/mention.ts` under
  `src/rich-content/` are compatibility re-exports; keep FeedbackOps tests local.
  The allowlist original stays in `packages/shared`. The local
  `allowlist-local.ts`, `sanitizeClient.ts`, and `fixtures-local.ts` stay as the
  drift anchor. The ADR-0016 package boundary still keeps `@fops/ui` from
  importing `@fops/shared`.
  Keep `DetailPanelFullscreenContext` sourced from `@ap/ui` for all consumers.
- The frontend declares `@ap/ui` (`workspace:*`) directly so its stylesheet
  resolver can reach bundle-1 CSS. It imports
  `@ap/ui/styles/{tokens,semantic,theme,compat}.css` in that order, then
  `@ap/ui/styles/sources.css`.
  Preserve `layer(base)` on the token and semantic imports. Do not use
  `@ap/ui/styles.css`, which adds the platform extension layer.
- `@ap/ui` is the workspace package (`workspace:*` in `packages/ui/package.json` and
  `apps/frontend/package.json`, #642): a change under the repository's `packages/ui`
  reaches FeedbackOps at once and runs the FeedbackOps CI. Keep index export parity
  and the consumer CSS contract when either side changes. Keep TipTap at 3.23.5 and
  `@formkit/auto-animate@0.10.0` with its root workspace patch unless a separate
  decision changes those constraints.
- A new Tailwind theme key must also be registered in the `@ap/ui` theme and
  its `cn` merge configuration. tailwind-merge knows only Tailwind's default
  scales, so an unregistered `text-caption` reads as a text color and `cn`
  drops it next to `text-text-muted` (#782).
- `components.json` here only points `@shadcn/lint` at the app's Tailwind
  entry (ADR-0062). It is not a shadcn CLI config; use the intake guidance in
  `docs/tech-stack/component-stack.md`.
- Follow `docs/frontend/tokens.md` tokens for light surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/ui`.
- Promote from feature-local code only after a second real consumer proves reuse.
- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
- Icon-only controls require accessible labels and tooltips.
