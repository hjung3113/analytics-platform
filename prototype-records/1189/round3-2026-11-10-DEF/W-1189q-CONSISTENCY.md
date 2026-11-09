Verdict: FIXES

## Summary
1. P1 F · `home-F`, `home-F-merged` · The hero's only detail line is raw ISO (lane 8, confirmed). In `HomePrototype.tsx:41` use `formatPeriod(from, to, lang)` from `@ap/contracts`, and drop the raw `key: value` extras on line 42.
2. P1 F · `nav-F`, `collapsed-F` · The trigger is a fake field, and an identical `메뉴 검색` field opens under it (lane 6, confirmed; also breaks DESIGN "Search icon only on search fields"). Make the trigger `Button variant="secondary" size="toolbar"` with `이동 ▾`, no Search icon and no placeholder (`prototype1189q.tsx:55-57`). The popover keeps the only `SearchInput`.
3. P1 E, F · all `home-*`, `nav-*` · Stacked bars cost 64 CSS px on every screen, so E and F are compared unfairly with D (lane 4, confirmed; the real stack is 114 CSS px against 50). In `PrototypeTopbar` change `min-h-16` to `h-[50px]` and the F control to 32px. On E/F home, drop the title row, which holds only `플랫폼 홈`, star and ⋯.
4. P1 D · `home-D`, `home-D-merged` · The sidebar and page list the same menus, and `분석` heads the sidebar under a `플랫폼 홈` page (lanes 2 and 10, confirmed). In `AppShell`, render `PrototypeStageSidebar` collapsed on the platform-home route, so the flow owns the screen and the head label goes away.
5. P1 E · `home-E`, `home-E-merged` · No focal point, and `내 할 일` and notices sit entirely below the board (lane 5, confirmed; 66 links, not about 100). Move `{todo}{notices}` to the top of the left column. Split the board into an analysis band (`t-section-title`) above an other-destinations band (`t-card-title`).
6. P1 D · `home-D`, `nav-D` · `BRAVO` wraps alone (lane 1, confirmed; short by about 1 CSS px, estimated) and the control is the wrong one: Button toggles with a white selected surface instead of a shared single-select. Replace with a one-line toolbar dropdown `출처 전체 ▾` in the Context-bar chip grammar; `SegmentedRadio` needs about 225 px and does not fit (estimated). Minimum fix: container `px-3` to `px-2` (`prototype1189q.tsx:166`).
7. P1 D · no capture · The owner cannot see "a missing menu stays visible and inactive", the core of D today. Capture `nav-D` with source `CLAS`. First replace `opacity-50` on those rows (`:170`, banned by DESIGN for required text) with `text-text-disabled` and `aria-disabled`.
8. P2 D · `home-D`, `nav-D` · Sidebar scrollbar beside the page scrollbar. Set `space-y-5` to `space-y-3` on `:167` so the rail fits once the filter is one line (lane 3, see line 20).
9. P2 D · `nav-D`, `collapsed-D` · The current row has no 2px bar. Add `{active && <NavCurrentMarker />}` in `:170`, as `NavItem` does.
10. P2 D · `home-D`, `nav-D` · Group titles are darker than siblings and the chevron is off-grammar. Use `SIDEBAR_GROUP_TITLE` instead of `t-nav-group text-text-secondary` (`:167`) and add `text-text-muted` to the collapse button (`:163`).
11. P2 D, E · `home-D`, `collapsed-D`, `home-E` · A Home icon sits on controls that are not home, beside the rail's real Home. Use a distinct Lucide icon for `분석` and `메뉴` (`:56`).
12. P2 F · `home-F` vs `nav-F` · `이동` shifts about 240 CSS px between home and work screens. Render the F top bar above sidebar and content. Also set `px-6` to `px-4` so `i-MAP` aligns with the page's 16px inset (E, F).
13. P2 D, E, F · `nav-*` · Popovers show no current position, while `nav-current` has `✓ 현재`. Pass `active` to `navRowVariants` in `MenuRow` and add it to the destination row in `link()`.
14. P2 F · `home-F` · `CLAS · 최근 방문`, `CLAS`, then `CLAS` first in 최근 방문. Under F drop the lead from `recentRows`, and seed the capture so the last visit is not CLAS.
15. P2 D, F · `home-D`, `home-F` · The Todo card aligns to no grid edge and is the only white card on a quieted page. Place `{todo}` in the favorites/recents grid as a third column; on D this also pulls the page above the fold.
16. P2 E · `home-E`, `home-E-merged` · `운영 개요 › 플랫폼 홈` links to itself, and `내 활동`, `소통`, `도구` sit under `지표 분석`. Filter `registry.platformHome` from the board; the bands in item 5 fix the mixing.
17. P2 F, E · `home-F`, `nav-F`, `home-E` · Rail search duplicates the job (lane 7, confirmed; E has three searches: rail, inline, popover). Under F and E hide the rail search button and keep the shortcut.
18. P2 E · `home-E`, `nav-E` · The grouping toggle is `Button` pairs; use `SegmentedRadio` from `@ap/components` (ADR-0023).
19. P2 D, F · `home-D`, `home-F` · The notice is the loudest row (lane 9, confirmed; markup unchanged from the shipped home). Under `variant` use `border-t border-border-subtle`, no fill and a `text-text-muted` megaphone, with `공지` as a `t-card-title` and `공지 목록` on its right.
20. Lane corrections: 3 is partly rejected: the page-edge scrollbar is baseline (`home-current`, `nav-current`) and F home has none; D's fold overrun is about 22 CSS px, E's about 280 today and 410 merged (estimated from scrollbar thumbs).
21. Variant opinion: D is the strongest answer, because `home-D` and `home-D-merged` differ only by the filter and origin tags, so the boundary disappearing is visibly a non-event and the relearning is paid once. F changes its home least, but its merged work screen keeps the MARS-shaped sidebar under an `분석` label and never shows the analysis order the merge exists for. E relearns little but shows a directory, which research point 4 says a merged home stops being. The owner would most likely reject D for making every user relearn navigation now, before any merge has happened, on a draft mapping that reads as a lopsided 2/9/1/1.

## Details

Method limits: all 26 PNGs were opened and read at display scale (2419 wide, factor 1.19 to device pixels). Pixel measurement was not possible (the Bash call that attempted a check was denied), so scroll overruns come from scrollbar thumb geometry and control widths from text widths; both are marked estimated. No app was started and nothing except this report was written.

### Lane findings

| # | Verdict | Evidence |
| --- | --- | --- |
| 1 | Confirmed | `home-D`, `home-empty-D`, `nav-D`: `BRAVO` alone on row 2. Four buttons need about 215.5 CSS px against about 215 available (estimated). |
| 2 | Confirmed | `home-D`: same stage names and rows in sidebar and flow; only `기준 정보` is sidebar-only. Flow columns carry 2/9/1/1 rows and leave most of the band empty. |
| 3 | Partly rejected | Page-edge bar is present in `home-current`, `home-empty-current`, `nav-current`, so it is not new. Absent in `home-F`, `home-F-merged`, `home-empty-F`, `home-empty-D`. New in D is the sidebar bar at x≈476 (`home-D`, `home-empty-D`, `nav-D`); merged has none. D overrun about 22 CSS px (thumb ends ≈1475 of 1512). |
| 4 | Confirmed, number corrected | 64 + 50 = 114 CSS px against 50. "About 190" was the downscaled viewer value (226 device px). On work screens the chart starts 64 CSS px lower in F (`nav-F` ≈780 against `nav-current` ≈675 display px). |
| 5 | Confirmed, number corrected | 66 menu links by row count in `home-E` and `home-E-merged`, plus favorites and recents. Column bottoms sit near the fold, so the overrun is mostly Todo and notices. |
| 6 | Confirmed | `nav-F`: trigger y≈20–85 and input y≈110–185 with the same icon and placeholder. Raw `<button>`, `h-10`, `border-border-default`. |
| 7 | Confirmed | `AppRail` keeps search under F. E adds a third search on home. |
| 8 | Confirmed | `home-F`, `home-F-merged`: `MEM · 2026-09-25T09:00:00 — 2026-09-26T09:00:00`. `formatPeriod` already serves the Context bar. |
| 9 | Confirmed, not a regression | Class string `border-accent-primary/30 bg-accent-primary-soft` is identical to the shipped home. `text-muted` on `accent-primary-soft` is not in DESIGN's allowed-pairs table. |
| 10 | Confirmed, narrowed | The `분석` h2 itself exists on `home-current`. The new conflict is the sidebar head `분석` on a `플랫폼 홈` page. |

### Checklist

| Line | D | E | F |
| --- | --- | --- | --- |
| 1 Sidebar rows | Fail: enabled rows use `navRowVariants`, but inactive rows add `opacity-50`, and that state has no capture | N/A: no sidebar | N/A: existing `NavItem` unchanged |
| 2 Current item | Fail: selected surface and `font-semibold`, no bar (`nav-D` y≈429, `collapsed-D` y≈300; `nav-F` has it) | N/A | N/A: unchanged, bar visible |
| 3 Font tokens | Pass: `text-sm`, `text-xs`, `text-caption`, `t-*` | Pass | Pass |
| 4 Section titles | Fail: `t-nav-group text-text-secondary` (11px, darker, `px-3`) instead of `SIDEBAR_GROUP_TITLE` (12px, muted, `mx-2`) | N/A | N/A: unchanged |
| 5 No white in sidebar | Fail: `전체` is white `Button variant="secondary"` (`home-D` 108–175 × 217–270) | N/A | N/A: unchanged |
| 6 Shared controls, one per job | Fail: Button toggles for single-select; raw 36px trigger; collapse button lacks `text-text-muted` | Fail: Button toggles for single-select; three searches | Fail: raw field-styled trigger; three routes for one job |
| 7 Tooltips, no autofocus on load | Pass: none in captures; focus moves only on popover open | Pass | Pass |
| 8 `break-keep` | Pass: on prototype roots; no mid-word breaks; `BRAVO` wraps whole | Pass | Pass |
| 9 One scroll layer, no empty fixed height | Fail today: sidebar and page bars together (`home-D`, `nav-D`). Merged passes the sidebar part | Pass: page scroll only; popover bounded by `max-h-[80vh]` | Pass: no bar on home |
| 10 No explanation on screen, `*-current` pairs | Fail: filtered source state has no capture. Explanatory footer correctly hidden | Pass: collapsed legitimately N/A | Pass |

### Other evidence

- Design-system compliance is otherwise good. Prototype code imports `@ap/ui` and uses token classes, no new CSS files, and `navRowVariants` on all rows. Rows, type scale and surfaces read as the existing product in every variant.
- Item 2 fix: `PopoverAnchor` exists in `shadcn/popover` but is not exported from `@ap/ui`, so a real input on the bar would need that export first. The compact Button avoids it. If F must keep a wide bar, use a real `SearchInput` and add the export.
- `i-MAP` appears only in E and F, hard-coded. GLOSSARY confirms the name, so it is not a defect; `home-current` still shows `분석 플랫폼`, and D shows no product name.
- `collapsed-D` puts the expand chevron on its own row (y≈120) where `collapsed-F` keeps it in the 50px head (y≈41), pushing Scope down about 43 CSS px. Minor; applies only if D's head is reworked.
- `collapsed-*` captures all have a popover open, which hides part of the collapsed sidebar. The `-current` pair does too, so the comparison is fair.

<!-- W-1189q-CONSISTENCY-DONE -->
