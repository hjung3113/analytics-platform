# UI Package Agent Guide

Read the measured traps before editing components or their tests: [`@ap/ui` and `@ap/feature-ui`](../../.claude/rules/feature-ui.md), [frontend tests](../../.claude/rules/feature-screens-tests.md).

## Allowed Content

- UI primitives and wrappers; product primitives such as lists, panels, badges, toolbars, and blocked states.
- Domain display components when they are pure presentation.
- Semantic token implementation.

## Forbidden Content

- API calls.
- Imports from `@ap/feature-shared` or `apps/{platform-api,feature-screens}` (FO ADR-0016, enforced by `pnpm --filter @ap/platform-api-ops check:boundaries`); the rich-content allowlist mirror lives in `@ap/ui` (`packages/sdk/ui/src/rich-content/allowlist-local.ts`).
- Backend permission decisions as truth; domain mutation orchestration; feature-specific route state; hard-coded screen workflows.

## Lint

- ESLint over the whole package: `pnpm --filter @ap/feature-ui lint` (`featureUiPreset`: correctness, React, Hooks, accessibility, and the `@shadcn/lint` design rules, `--max-warnings 0`). An intended exception names its ESLint rule and a concrete reason in the comment; an unused directive fails. Rule correspondence: `docs/integration/platform-packages.md` §6.

## `@ap/ui` vs `@ap/feature-ui`

- SDK-owned parts are imported from the workspace `@ap/ui` (`packages/sdk/ui`, ADR-0090) directly, not through `@ap/feature-ui` (#713q). That covers:
  - the shadcn primitives, tokens and motion utilities (`cn`, `prefersReducedMotion`, ...);
  - the panel, toolbar, forms, feedback and layout shells, and the detail slot (`DetailPanelSlotProvider`, `useDetailPanelSlotHost`, `DetailPanelFullscreenContext`);
  - `ObjectRow`, `UserAvatar`, `UserChip`, `ProgressMeter`, `SeverityIndicator`, `PermissionBlockedPanel`, `StatusBadgeFrame`;
  - the rich-content editor, renderer, attach button and extensions (platform ADR-0050, platform ADR-0052).
- `src/index.ts` exports only feature-owned names, and `@ap/feature-ui` must not re-export an `@ap/ui` name again. Import a shared component from `@ap/ui` and a feature component from `@ap/feature-ui`; one import statement never mixes the two.
- In tests, mock what you replace: a shared component (`ListShell`, `RichEditor`, ...) by mocking `@ap/ui`, a feature name by mocking `@ap/feature-ui`. A `@ap/ui` mock that spreads the real module reads every export, so a test that also mocks `sonner` must give that mock a `Toaster`.
- Feature-named aliases of `@ap/ui` parts:
  - `useDetailPanelSlot(node)` is `@ap/ui`'s `useDetailPanelContent` under the feature name (`undefined` clears, `null` registers a closed registrant);
  - `TabsList`/`TabsTrigger` are `@ap/ui`'s unwrapped `TabsListBase`/`TabsTriggerBase`, and `TipTapEditor` is the TipTap `Editor` type;
  - `SEVERITY_LABELS` stays in the local `SeverityIndicator` module because `@ap/ui` does not expose that value and the local `SeverityBadge` uses it.

## Detail slot (ADR-0126)

- `AppFrame` wraps its frame in `DetailPanelSlotProvider` and renders the host through `useDetailPanelSlotHost()`. The provider owns the expanded state (toggle, Esc, inheritance on open replacement; reset on close, clear, or pause) and `DetailPanelFullscreenContext`; both portal and content registrants receive it.
- The provider also accepts controlled `expanded`/`onExpandedChange`; feature shells keep the uncontrolled path. Do not introduce feature-owned expansion state.
- The shared toggle uses ghost/icon-sm Button with translated label props (Korean defaults remain compatible); the reading width is 48rem.
- Tests that render a shell with `detailPanel` mount `DetailPanelSlotProvider` plus a host div. Overlapping registrants log the SDK's `[DetailPanelSlot] Multiple registrants; the last registrant wins.`

## Rich content

- Rich-content uses TipTap per FO ADR-0011. The allowlist original stays in `packages/feature-shared`; its local mirror and drift anchors (`allowlist-local.ts`, `sanitizeClient.ts`, `fixtures-local.ts`) live in `packages/sdk/ui/src/rich-content/`.

## CSS and tokens

- The frontend declares `@ap/ui` (`workspace:*`) directly so its stylesheet resolver can reach bundle-1 CSS. It imports `@ap/ui/styles/{tokens,semantic,theme,compat}.css` in that order, then `@ap/ui/styles/sources.css`. Preserve `layer(base)` on the token and semantic imports; do not use `@ap/ui/styles.css`, which adds the platform extension layer.
- `@ap/ui` is a workspace package: a change under the repository's `packages/sdk/ui` reaches feature at once and runs the feature CI. Keep the consumer CSS contract when either side changes. Keep TipTap at 3.23.5 and `@formkit/auto-animate@0.10.0` with its root workspace patch unless a separate decision changes those constraints.
- Use semantic tokens, not raw hex values, outside token implementation files.
- A new Tailwind theme key must also be registered in the `@ap/ui` theme and its `cn` merge configuration: tailwind-merge knows only Tailwind's default scales, so an unregistered `text-caption` reads as a text color and `cn` drops it next to `text-text-muted` (#782).
- `components.json` here only points `@shadcn/lint` at the app's Tailwind entry (FO ADR-0062). It is not a shadcn CLI config; use the intake guidance in `apps/feature-screens/docs/component-stack.md`.
- Follow `apps/feature-screens/docs/tokens.md` tokens for light surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/sdk/ui`.

## Component rules

- Promote from feature-local code only after a second real consumer proves reuse.
- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
- Icon-only controls require accessible labels and tooltips.
