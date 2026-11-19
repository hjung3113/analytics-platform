# Feature UI Guide (`src/ui`, merged from the former `src/ui` package)

## Allowed Content

- UI primitives and wrappers; product primitives such as lists, panels, badges, toolbars, and blocked states.
- Domain display components when they are pure presentation.
- Semantic token implementation.

## Forbidden Content

- Backend permission decisions as truth; domain mutation orchestration; feature-specific route state; hard-coded screen workflows.

## `@ap/ui` vs `src/ui`

- SDK-owned parts are imported from the workspace `@ap/ui` (`packages/sdk/ui`, ADR-0090) directly, not through `src/ui` (#713q).

## Detail slot (ADR-0126)

- `DetailPanelSlotProvider` owns the expanded state (toggle, Esc, inheritance on open replacement; reset on close, clear, or pause) and `DetailPanelFullscreenContext`; both portal and content registrants receive it.
- The provider also accepts controlled `expanded`/`onExpandedChange`; feature shells keep the uncontrolled path. Do not introduce feature-owned expansion state.

## Rich content

- Rich-content uses TipTap per FO ADR-0011. The allowlist original stays in `packages/feature/shared`; its local mirror and drift anchors (`allowlist-local.ts`, `sanitizeClient.ts`, `fixtures-local.ts`) live in `packages/sdk/ui/src/rich-content/`.

## CSS and tokens

- Preserve `layer(base)` on the token and semantic imports; do not use `@ap/ui/styles.css`, which adds the platform extension layer.
- `@ap/ui` is a workspace package: a change under the repository's `packages/sdk/ui` reaches feature at once and runs the feature CI. Keep the consumer CSS contract when either side changes. Keep TipTap at 3.23.5 and `@formkit/auto-animate@0.10.0` with its root workspace patch unless a separate decision changes those constraints.
- A new Tailwind theme key must also be registered in the `@ap/ui` theme and its `cn` merge configuration: tailwind-merge knows only Tailwind's default scales, so an unregistered `text-caption` reads as a text color and `cn` drops it next to `text-text-muted` (#782).
- `components.json` here only points `@shadcn/lint` at the app's Tailwind entry (FO ADR-0062). It is not a shadcn CLI config; use the intake guidance in `packages/feature/screens/docs/component-stack.md`.
- Follow `packages/feature/screens/docs/tokens.md` tokens for light surfaces, spacing, typography, and density; do not introduce a new visual theme from `packages/sdk/ui`.

## Component rules

- Every reusable component must define loading, empty, error, disabled, focus-visible, and permission-limited behavior when applicable.
- Icon-only controls require tooltips.
