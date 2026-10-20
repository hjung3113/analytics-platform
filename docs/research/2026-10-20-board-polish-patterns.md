# 보드 다듬기 사례 조사 (#536, 2026-10-20)

## Analysis board UI research: patterns for the three problems

### 1. Fixed-height panes in a 2×2 grid with long content

- **Bounded container, scroll inside each pane (MUI X Data Grid, AG Grid).** The grid has no height of its own. It scrolls inside a parent with a fixed height or a `maxHeight`. `autoHeight` (MUI) and `domLayout:'autoHeight'` (AG Grid) grow with the content, which is our current bug, and both turn off virtualization. AG Grid notes that rendering gets slow above about 1,000 rows. https://mui.com/x/react-data-grid/layout/ · https://www.ag-grid.com/react-data-grid/grid-size/
- **User-resizable splitters (VS Code editor groups, shadcn Resizable, JupyterLab).** VS Code has preset layouts under View > Editor Layout (two columns, 2×2 grid) and a draggable divider (the "sash") between groups. shadcn wraps react-resizable-panels and says it supports the keyboard. The W3C (WAI-ARIA APG) splitter pattern is `role="separator"` with `aria-valuenow/min/max`, `aria-controls` pointing to the primary pane, and a label. Arrow keys move it, Enter collapses or restores, and Home/End and F6 (cycle panes) are optional. The pattern is still marked "under review". https://code.visualstudio.com/docs/configure/custom-layout · https://ui.shadcn.com/docs/components/resizable · https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/
- **Maximize one pane, then restore.** VS Code: "Toggle Maximize Editor Group" (⌘K ⌘M) or double-click a tab. Grafana: `v` toggles a panel full screen and `Esc` exits. Kibana: Maximize in the panel menu, and a share link opens that same panel maximized. Power BI focus mode keeps the filters pane open and has a "Back to report" button. JupyterLab "Simple Interface" shows one document and restores the old layout when turned off. https://grafana.com/docs/grafana/latest/dashboards/use-dashboards/ · https://www.elastic.co/docs/explore-analyze/dashboards/arrange-panels · https://learn.microsoft.com/en-us/power-bi/consumer/end-user-focus · https://jupyterlab.readthedocs.io/en/stable/user/interface.html
- **Fixed row height or "fill screen" (Grafana auto grid).** Auto grid sets a uniform row height and a minimum column width. A "Fill screen" toggle makes a panel the height of the viewport. Kibana lets you resize panels from the keyboard: Enter or Space, then arrow keys, then Esc to cancel. https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/create-dashboard/
- **One column at narrow widths (react-grid-layout).** Named breakpoints (lg 1200 down to xxs 0), each with its own column count and its own layout. https://github.com/react-grid-layout/react-grid-layout
- **Accessibility of a scrolling pane.** Axe rule `scrollable-region-focusable`: the scroll container, or static content inside it, must be focusable (`tabindex="0"`). Adrian Roselli's markup is `role="region"` + `aria-labelledby` + `tabindex="0"`. His 2026 update says a role may no longer be required. https://dequeuniversity.com/rules/axe/4.8/scrollable-region-focusable · https://adrianroselli.com/2020/11/under-engineered-responsive-tables.html
- **Not verified:** scroll shadows, sticky headers inside panes, and short-viewport behaviour. None of the sources I fetched document these.

### 2. Empty state and where state is saved

- **PatternFly empty state.** "State what isn't there, and then give the user a next step." First use gets the extra-large variant, one primary call to action and secondary links. https://www.patternfly.org/components/empty-state/design-guidelines
- **Carbon.** A short, positive title, a body that explains the next step, and either a primary button or a pointer to the relevant UI element. https://carbondesignsystem.com/patterns/empty-states-pattern/
- **NN/g.** Show system status (don't show "No records" while loading), give learning cues ("Star your favorites to list them here"), and link straight to the key task. https://www.nngroup.com/articles/empty-state-interface-design/
- **Layout presets as the next step (VS Code View > Editor Layout).** Named presets like "Two Columns" and "Grid (2×2)". This suggests putting icon buttons for 1×1, 1×2, 2×1 and 2×2 directly in the empty board.
- **Where state lives (Figma offline).** Changes are "saved locally to your browser's IndexedDB, and can't be accessed from another computer or device." Figma shows icons for "saving" and "offline", a notice at the bottom of the screen, and an unsynced icon in the file list. https://help.figma.com/hc/en-us/articles/360040328553
- **Primer on autosave.** A saved indicator can be mistaken for a validation status, and Primer advises against toasts because of accessibility issues. https://primer.style/product/ui-patterns/saving/
- **Not verified:** wording from Excalidraw or Google Docs. I found no primary docs. draw.io offers a "Browser" storage option but its docs give no warning about it.

### 3. Chips overflowing a narrow header

- **Fit to width, then "+N" (Ant Design Select).** `maxTagCount="responsive"` collapses chips by measured width (Ant warns this costs render performance). `maxTagPlaceholder(omitted)` renders the "+N", and `maxTagTextLength` truncates each chip. https://ant.design/components/select
- **Primer LabelGroup.** `visibleChildCount="auto"` fits to the container. `overflowStyle` is `overlay` (all chips in a popover on top) or `inline` (expands in place). https://primer.style/product/components/label-group/
- **PatternFly LabelGroup.** Shows 3 by default (`numLabels`). The overflow label reads "${remaining} more" and toggles to "Show Less". Each chip has `textMaxWidth` truncation with a tooltip showing the full text. https://www.patternfly.org/components/label/
- **Spectrum TagGroup.** `maxRows` adds a button that expands to show every tag. React Aria TagGroup gives keyboard navigation and `aria-label`/`aria-labelledby`. https://react-spectrum.adobe.com/TagGroup · https://react-aria.adobe.com/TagGroup/useTagGroup
- **Priority+.** Show as many items as fit in priority order and put the rest behind a "More" toggle. Applied to us: chips that differ from other panes go first. https://css-tricks.com/the-priority-navigation-pattern/
- **Not verified:** keyboard and ARIA details for the overflow button. The pages I fetched link to separate accessibility pages that I did not read.

### Variants worth prototyping

1. **Pane sizing**
   - (a) Fit the board to the viewport and scroll each pane on its own (`tabindex=0`, labelled region).
   - (b) The same, plus keyboard-accessible splitters to the APG separator pattern.
   - (c) Pane heights grow with content, with a per-pane maximize button (`Esc` to restore) and a one-column layout at a breakpoint.
2. **Empty board**
   - (a) A large empty state with four layout-icon buttons as the primary action.
   - (b) Each empty pane is its own empty state with "Add screen" inside the cell.
   - (c) Either of these plus a persistent "Saved in this browser only" status with an info popover, written in the Figma IndexedDB style.
3. **Header chips**
   - (a) Priority+: chips that differ from other panes first, then "+N" opening a popover.
   - (b) Show the value without its key label (PHOTO, not "process=PHOTO") and truncate with a tooltip, plus "+N".
   - (c) Expand inline to a second row, Primer `inline` or Spectrum `maxRows` style.
