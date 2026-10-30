# ADR-0103: Compact analysis and native snap Dock previews

- Status: **Decided** (2026-10-30)
- Decision maker: owner, approved actual-app variant B (#1141)

## Decision

Declare visual density once on `PlatformPage`, with comfortable defaults and an internal React context for SDK descendants. In compact pages, workspace panels remove duplicate chart/table card chrome while standalone cards remain framed. Keep page density separate from width-based workspace admission. Consumers retain domain-specific composition: the four HWT pages opt into compact and their StackPanel/TrendPanel choose gentle transient emphasis through a generic Frame prop.

Use the current native Dock engine's group/half previews and stable theme/options for both boards and menu workspaces. Persistent chart selection, data semantics, keyboard controls, stored layouts and engine version remain unchanged.

## Alternatives and reasons

Independent public density/chrome props on every component would allow inconsistent spacing within one page and enlarge the public API without a present consumer need. A page declaration plus the existing workspace panel context expresses the composition coherently. Global CSS selectors, chart-ID conventions and menu-aware SDK conditions would couple reusable pieces to one application and are rejected. Changing all chart defaults would alter unrelated consumers, so gentle emphasis is explicit and additive. A second drag engine would duplicate native layout, focus and persistence behavior; native theme/options provide the approved footprints.

## Owning contracts

- [Layout §12](../contract/layout.md#12-canonical-page-archetypes): density and embedded chrome.
- [Chart §16](../contract/chart.md#16-analysis-chart-contract): transient emphasis versus selection.
- [Analysis board](../design/analysis-board.md): native Dock previews.
- [DESIGN.md](../../DESIGN.md#compact-analysis--decided-1141): visual composition.

The operational capture scope is owned by [root AGENTS.md](../../AGENTS.md#검증).
