# Frontend Agent Guide

Feature-folder guides under `src/features/` describe semantic screen intents. Runtime registration belongs to platform menus and `@ap/feature-bridge`; standalone routes and `*Route` compositions are retired (#597). Adapters under `src/test` are test-only.

**Frozen ([ADR-0133](../../../docs/adr/0133-feature-screens-frozen-new-screens-on-sdk.md)):** do not add new feature folders or screens here; new platform features go in `platform/<feature>/` as SDK consumers. Bug fixes and behaviour changes to existing screens stay here.

## Required docs

- `docs/design/features/README.md` — read before frontend changes.
- `packages/feature/screens/docs/ui-design-system.md` — component behavior and layout contracts.
- `packages/feature/screens/docs/component-inventory.md` — check before a new shared component.
- `packages/feature/screens/docs/routes-and-layout.md` — URL state, list/detail behavior, responsive navigation.
- `packages/feature/screens/docs/tokens.md` — raw token seed only.
- `packages/feature/screens/src/features/*/AGENTS.md` — route ownership before adding screens.

## Entry and host rules

- Public screen/core entries are libraries mounted by the platform bridge (#597, ADR-0097); there is no standalone runtime, generated route tree, login or app layout.
- `package.json` `exports` is the one list of bridge entries (exact keys, no wildcard: a new folder must not become public by existing). The boundary lint (`featureBridgeMenuPreset`), its fixtures and `feature-entry-graph.test.ts` read it, so adding an entry means adding one `exports` key; an entry that departs from the default graph assertions is listed in that test's `ENTRY_ALLOWANCES`.
- Test-local memory-router hosts live under `src/test`; private legacy feature components still using TanStack keep that dependency.
- Build every API path that carries a value with `apiPath` from `src/lib/api/path.ts`. Ids from the URL and from responses alike. A detail read checks the response `id` against the requested one (`withRequestedId`). A success response with `Content-Disposition: attachment` is refused by the client (#2049).
- Route ownership per feature: `docs/agents/feature-implementation.md` → Implementation Boundaries (canonical list, includes `voc-cluster`); Finding and Integration details in `features/findings/AGENTS.md` and `features/integration/AGENTS.md`.

## Lint

- When the same override or hard-coded value repeats, add a shared token, variant or component instead of repeating it.
- The root Radix rule (`@radix-ui/*` only in `@ap/ui`) is enforced here by `pnpm --filter @ap/platform-api-ops check:boundaries`.

## Design rules

- Light, compact, list-first visual model: no decorative cards, broad gradients, oversized hero sections, empty whitespace.
- One primary action per toolbar or panel; secondary actions in subtle buttons, menus or contextual rows.
- Keep reporter-facing status separate from internal workflow status, visually and structurally.
- Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error and permission-limited states distinct.
- Right detail panels preserve list context on desktop.
- Permission-limited content shows an approved summary or a request path, never a blank failure.
- Role Level labels: Admin, Developer, User; backend capability checks remain authoritative.
- Keep Public Update, Reporter Reply and Internal Comment as separate communication surfaces.
- `WorkbenchShell.toolbar` is optional: high-density screens (e.g. VOC Triage) may omit it and express route identity via an inline kicker as the first child of the route-owned toolbar; the inner toolbar must stay 50px (FO ADR-0020 §2; toolbar-kicker rule in FO ADR-0020 §Amendment).

## Component intake

- Build repeated UI patterns as feature-local components and compose them in screens, never directly in screens; before a new component check `packages/feature/screens/src/ui`, the feature's existing components and `docs/component-inventory.md`.
- Add new tokens or variants to docs before using them broadly.

## Verification

- When touched: test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, status badge separation.

## New surfaces and gaps

- The shipped UI is the reference for existing screens (`docs/agents/feature-implementation.md` → UI Authority, FO ADR-0060). New surfaces follow current platform contracts and the owner-confirmed prototype per the root `AGENTS.md`; historical standalone captures are reference only.
- Undecided behavior or visual questions: check `packages/feature/screens/docs/specs/`, `docs/product/features/` and the ADRs; if all are silent, ask — never fill the gap with framework defaults or personal taste. Record the resolution in the PR body.

## Visual verification

- Browser/E2E and platform captures belong to the conductor when the worker brief prohibits them.
