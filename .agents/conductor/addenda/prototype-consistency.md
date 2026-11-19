# Platform-consistency check for prototypes and screen PRs

Rule 1 applies to all screen work. Rules 2–3 and the checklist apply to every `?variant=` prototype before its confirmation Artifact and to slice reviews (PROFILE §Review).

## Rules

1. The brief names the existing components and classes the new UI must reuse (for example the sidebar `NavItem` row, the shell section title, `@ap/ui` `SearchInput`, `DrillPath`), found with `rg` in the area being changed.
2. A reviewer who did not build it compares every capture with the `*-current` capture of the same screen at the same size and fills the checklist below. Findings join the one fix round.
3. The Artifact puts each variant next to `*-current` and carries the filled checklist table. An unchecked line is a blocker for sending.

## Checklist (9 lines)

1. Sidebar changes only: the current item is the selected surface + `font-semibold` + one rounded 2px bar (inset-y-2); no extra outline or shadow.
2. Font sizes are token classes only (`text-sm`, `text-xs`, `text-caption`, `t-*`); zero raw px.
3. Sidebar changes only: section titles use the existing group-title class and are not larger or heavier than sibling groups.
4. Sidebar changes only: no white surfaces (`surface-card`, white ghost hover) or row dividers inside the sidebar.
5. Controls are shared `@ap/ui` variants (inputs `toolbar`; buttons `icon-xs`, `icon-sm`, `toolbar`), and one control per job on a screen.
6. Tooltips appear only on truncated labels or collapsed icons; nothing auto-focuses or opens a tooltip on load.
7. Korean copy has `break-keep`; the capture shows no break inside a word.
8. One scroll layer; no fixed height that leaves empty space.
9. Prototype explanation text lives in the variant switcher or the Artifact, not on the screen; every capture has its `*-current` pair.
