# @ap/components

Platform Component layer (06 §13), chart contract (§16) and page archetype skeletons (§12). Menus assemble these parts.

## Rules

- Components own the 06 §19 states, §18 Data Trust and the accessibility duties (keyboard, focus return, labels). Pages must not reimplement them.
- Never change the global Context silently from a chart click. Offer only explicit callbacks (`onPointClick`, "분석 구간 적용").

## Layout

### Matrix

- Reuse table size and page-bound registration. `TreeMatrix` has no built-in filter or toolbar (#2523): consumers build the filter line outside the matrix with `FilterLine` ([Components §13](../../../docs/contract/components.md#treematrix--서버-윈도-트리-행렬-decided-adr-0169-1768) «필터»). Keep `table/*` unchanged when extending the matrix. `MatrixLevelOrder` uses the table column-list primitives; the consumer stores its page key and the server regroups.
- `MatrixEmphasisBar`, the row editor and `sameValueRule` share transient typed rules. Only matching column ids survive window changes; change `generation` on session/Scope/query-order changes to clear these and pending focus. Never persist emphasis. Tests live in `matrix/__tests__/`.

## Table

### `table/PlatformDataTable.tsx` — server-paged table
- The selection column appears only with export, copy or `bulkActions`. The `rowAction` column is pinned right. When 128px does not fit but 72px does, `rowAction(row, { compact })` is called with `compact: true` and stays pinned as a 72px icon-only form (ADR-0037, 06 §15).
- `RowAction.tsx` owns the action control (`compact`, icon, accessible name, text; `onClick`, `link` child, `textLink`, `disabled` + `aria-describedby`; it knows no menu name). It renders the same element tree in both forms, so DOM nodes and focus survive compact ↔ regular switches (the tooltip opens only in compact). Menus return one `<RowAction compact={compact} …/>`; never switch element type with `compact ? A : B`.
- Memoize data-column definitions independent of action width so a width-boundary switch does not rebuild cell content.
- Optional `isRowMuted(row)` renders data cells of true rows `text-text-muted` (`text-text-secondary` on hover, selected or active) and sets `data-muted="true"`. `_select`, `_action` and cells with their own colour classes are unchanged. It is a visual effect only, so put the meaning in a visible cell such as a status badge (06 §15).
- Cancellation is decided by the table's own `controller.signal.aborted` alone (a timeout `AbortError` is shown as an error).
- `table/usePagedRows.ts`: page query lifecycle (Context reset → fetch effect order preserved). `dataVersion` (the `refreshOn` epoch or the `rows` counter) is appended to the request identity, never the Context identity; `JSON.parse(identity)[0]`/`[1]` stay Context and page. Optional `cacheKey` keeps answered pages in the Kernel engine through host `useKeptAnswers()` (key `[cacheKey, request identity, pageSize]`) and serves a kept answer before the load effect runs (#2380).
- Query identity (`usePagedRows`) and export header (`useTableTransfer`) take the global Context from Kernel `useQueryContext()` (narrowed by the applied Condition preset), never the raw `global` (06 §15, ADR-0083).

### Faceted set dialog (`filters/`)
- Remount with a caller session key when replacing an open session.
### Column filters
- `PlatformDataTable.tsx` only wires column filters.
- Keep declarations/validators memoized on their inputs. Contract: Components §15.

### URL warnings and recovery (`table/tableUrlWarning.tsx`)
Reject invalid URL values; never repair them (06 §6).

- All three recovery paths use one `RecoverButton({ onRecover, label? })` (`RecoverButton.tsx`); it calls `focusPageFallback` first because it disappears with the message.

### Quick search, toolbar, size, groups

- Draw only server `groups`; the table never groups or sums. "(이어서)" follows server `PageGroup.continued` only (never guess by count).

### Export and copy
**Table-owned export/copy ([ADR-0008](../../../docs/adr/0008-table-owned-export-fixed-toolbar.md), 06 §15).**
- Load XLSX (`write-excel-file/browser`) only through a dynamic `import()` on click, in a separate chunk.
- Accessibility and clipboard rules beyond the tests are in 06 §15 "표 내보내기·복사 구현 계약". When changing, fix the tests, 06 §15 and ADR-0008 first.

## Page archetypes

### `archetypes/PlatformPage.tsx` — page top level

- The body is identified by `data-platform-page-content` (excludes header, global Context, page extension; the Scope gate renders inside it). Contract checks use this stable hook, not style classes.

- In pane mode, do not mount the protected body while denied or validating.

### Other archetypes
- In `PageFilterBar`, Inputs and Selects use the 40px default height; never override it. The bar has no apply means of its own (ADR-0112).
- Keep the Outcome group registration hook before state branching and release the previous group.

## Detail drawer
- Use `DetailDrawer` only under AppShell or the same `DetailPanelSlotProvider`.

### Detail expansion (ADR-0126)
`DetailDrawer` consumes the existing UI slot context and shared toggle/Escape handler; do not add a second expansion owner or per-menu option. Contracts: components §13 and kernel §6.4.

## Charts
- Keep no module-global annotation store (06 §16).
- Do not re-create the renderer from an effect dependency.
- Memoize the overlay array (a new array redraws the overlay layer once).
- Empty ECharts series first: same-id series merge even under `replaceMerge`, leaving stale keys. The merge order keeps the inside-dataZoom pan controller and an in-progress Brush alive during mid-drag redraws.

## Hierarchy navigation (`hierarchy/`)
- Never cache hierarchy navigation state globally; never serialize expansion/search into URLs.

## Inspector, floating, saved views

- Section content owns no query; put the query above the Inspector.

## Dock and workspace
### `dock/` — host-only entry `@ap/components/dock`

- Zero remount: A new `layout` is fitted to the live engine with `fromJSON(…, { reuseExistingPanels: true })`; never call `clear()` or `close()`.
- When the size changes while maximized, the engine returns the hidden group's px sizes at old values (skewing ratios), so `DockEngine` re-applies the stored ratios on restore.
- Tests: jsdom has no engine geometry, so assert structure only; sizes are checked in E2E.

### `workspace/` — menu façade `PanelWorkspace` (root export, **Decided**, 06 §12.8, ADR-0067 decisions 18–22)
- Before changing edge collapse, peek or floating (#2435), read [components §13](../../../docs/contract/components.md#panelworkspace-edge-collapse-peek-and-float) for defaults, opt-outs, narrow projection and query ownership. `WorkspaceEdges` owns edge focus/tooltip; the internal `DockLayoutBase` floating capability leaves BoardDock unchanged.
