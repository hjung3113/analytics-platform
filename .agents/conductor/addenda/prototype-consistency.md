# Platform-consistency check for prototypes and screen PRs

Every `?variant=` prototype and every PR that changes how a screen looks passes this check before its confirmation Artifact or its PR opens (PROFILE §Review). Owner 2026-11-07: prototypes kept looking unlike the platform (fonts, colours, a "bubbly" feel), and the next ones must look native.

## Why styles drifted (2026-11-07, #1448 sidebar prototype, Opus review)

- The brief asked for variants but named no existing component to match, so the worker brought body-list grammar (bordered rows, white search box, outlined selection) into the shell sidebar.
- Prototype styles lived in raw `.css` files with px values; the design-system lint (`@shadcn/lint`) only reads class strings, so nothing flagged them.
- The only visual gate, `impeccable critique`, judges generic craft; its detector found 0 issues on a screen the owner found alien. It does not compare with the current app.
- Artifacts showed variants without the current screen next to them, so drift was visible only to the owner.

## Rules

1. The brief names the existing components and classes the new UI must reuse (for example the sidebar `NavItem` row, the shell section title, `@ap/ui` `SearchInput`, `DrillPath`), found with `rg` in the area being changed.
2. Prototype and screen code uses `@ap/ui`/`@ap/components` and token utility classes only. No new `.css` file with px sizes, colours or radii; a missing variant is added to `@ap/ui` as an optional prop with the default unchanged.
3. A reviewer who did not build it compares every capture with the `*-current` capture of the same screen at the same size and fills the checklist below. Findings join the one fix round.
4. The Artifact puts each variant next to `*-current` and carries the filled checklist table. An unchecked line is a blocker for sending.
5. `impeccable critique` still runs (PROFILE §Review); it does not replace this check.

## Checklist (10 lines)

1. Sidebar rows match the `NavItem` classes (32px, `rounded-md`, `px-3`, `text-sm text-text-secondary`, 16px icons).
2. The current item is the selected surface + `font-semibold` + one rounded 2px bar (inset-y-2); no extra outline or shadow.
3. Font sizes are token classes only (`text-sm`, `text-xs`, `text-caption`, `t-*`); zero raw px.
4. Section titles use the existing group-title class and are not larger or heavier than sibling groups.
5. No white surfaces (`surface-card`, white ghost hover) or row dividers inside the sidebar.
6. Controls are shared `@ap/ui` variants (inputs `toolbar`; buttons `icon-xs`, `icon-sm`, `toolbar`), and one control per job on a screen.
7. Tooltips appear only on truncated labels or collapsed icons; nothing auto-focuses or opens a tooltip on load.
8. Korean copy has `break-keep`; the capture shows no break inside a word.
9. One scroll layer; no fixed height that leaves empty space.
10. Prototype explanation text lives in the variant switcher or the Artifact, not on the screen; every capture has its `*-current` pair.
