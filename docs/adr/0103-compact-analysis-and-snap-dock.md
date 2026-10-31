# ADR-0103: Compact analysis and native snap Dock previews

- Status: **Decided** (2026-10-30)
- Decision maker: owner, approved actual-app variant B (#1141)

## Decision

Declare visual density once on `PlatformPage`, with comfortable defaults and an internal React context for SDK descendants. Duplicate chart/table card chrome is removed wherever the container owns the border, at any density — see the amendment below — while standalone cards remain framed. Keep page density separate from width-based workspace admission. Consumers retain domain-specific composition: the four HWT pages opt into compact and their StackPanel/TrendPanel choose gentle transient emphasis through a generic Frame prop.

Use the current native Dock engine's group/half previews and stable theme/options for both boards and menu workspaces. Persistent chart selection, data semantics, keyboard controls, stored layouts and engine version remain unchanged.

## Alternatives and reasons

Independent public density/chrome props on every component would allow inconsistent spacing within one page and enlarge the public API without a present consumer need. A page declaration plus the existing workspace panel context expresses the composition coherently. Global CSS selectors, chart-ID conventions and menu-aware SDK conditions would couple reusable pieces to one application and are rejected. Changing all chart defaults would alter unrelated consumers, so gentle emphasis is explicit and additive. A second drag engine would duplicate native layout, focus and persistence behavior; native theme/options provide the approved footprints.

## Owning contracts

- [Layout §12](../contract/layout.md#12-canonical-page-archetypes): density and embedded chrome.
- [Chart §16](../contract/chart.md#16-analysis-chart-contract): transient emphasis versus selection.
- [Analysis board](../design/analysis-board.md): native Dock previews.
- [DESIGN.md](../../DESIGN.md#compact-analysis--decided-1141): visual composition.

The operational capture scope is owned by [root AGENTS.md](../../AGENTS.md#검증).

## Amendment (#1166, 2026-10-31): embedded chrome no longer depends on density

Decision: a chart frame or table drops its own card border, radius and outer padding whenever the container around it owns the border — a `PanelWorkspace` panel or a board pane — at any page density. Page density keeps only spacing (gaps, toolbar height). Before, the conjunction `compact density && in a panel` hid the border, so a comfortable-density panel showed two borders and board panes showed a card inside the pane frame.

Mechanism: the existing panel context carries `true` (panel) or `'pane'` (board pane). Both mean "the container owns the border"; only a panel hides card titles (its tab shows the name). A panel or a pane chains the table wheel to the page (`PlatformDataTable`: `inPanel || screenMode === 'pane'`). A pane keeps visible titles. The shell wraps a pane's screen in the exported `EmbeddedPane`. No second context and no per-component chrome prop. Alternative rejected: a boolean for panes only, because `Panel`/`AnalysisLayout` section titles inside a pane would become `sr-only`.

## Amendment (#1166, 2026-10-31): Analysis pages declare compact; page-level rows follow density

Decision (owner): the SDK default stays `comfortable` (no breaking change); every page of a menu with `pageType: 'analysis'` (06 §12.2) declares `density="compact"`, and the `gen-menu` analysis template does too. The analytics Overview that leads into them (MARS 생산성 개요) declares it too, per the owner's approval of that capture; other Overview pages (home, work queues), Management, Catalog and Workflow pages stay comfortable. Detailed page spacing and alignment follow [Layout §12](../contract/layout.md#12-canonical-page-archetypes); table header behavior follows [Components §15](../contract/components.md#15-platform-data-table-contract), with density values owned by [DESIGN Tables](../../DESIGN.md#tables).
