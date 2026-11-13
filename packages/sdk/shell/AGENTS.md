# @ap/shell

App Shell (06 §8–9, screen design [07](../../../docs/design/app-shell.md)). Read the menu list from the injected Registry; read choices and session from the adapter.

## Rules

- Import only `@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui`. Never import the app, mocks or menu screens. Never write a specific menu, group or space id in code (lint `ap/no-shell-id-literal-comparison`, `no-group-id-literals.test.ts`).
- Do not compute domain choices (equipment, room, condition lists) in the shell. Display what the adapter returns, already filtered by session permission.
- Keep dev-only tools (role switch, response scenarios) out of the shell. The app injects them through `slots.topBarTools`, rendered below the rail (keep the slot name, ADR-0009).
- Layout dimensions and IA changes are 07/06 §9 changes. The workspace layer (06 §9.1) is built here and in the Registry.
- The shell owns the detail aside: width zero when closed, shared width clamped to §7 when docked. Docked detail leaves the body available (ADR-0013, §13). Expansion follows "Detail expansion" below.
- Resolve sidebar slots `scopeControl`, `navCounts` and `spaceNavSection` only when the matched route passes `canOpen`. Refuse them before mount on denied menus, including grant revocation. An unmatched route keeps the null-menu fallback.

## Frame

- `AppShell.tsx` — rail (52px), light sidebar (240/56px), scrolling main, full-height right detail aside (06 §13, ADR-0013). No top bar.
  - `/board` (a platform screen) gets no sidebar and no `메뉴로 건너뛰기` link (that link renders only with a sidebar). Registry screens outside a space (`space: null`: home, my activity, notices) get `PlatformSidebar` instead of the business sidebar (ADR-0070).
  - Sidebar collapse state, the `platform:sidebar-collapsed` storage key and the `[` shortcut are shared by both sidebars; keep the default-collapsed state below 1440px.
  - Toasts: `Toasts` sits `absolute` at a height-0 `relative` anchor (`data-toast-anchor`) on the bottom edge of the content column (`data-shell-content`), outside the detail aside and VOC drawer. Never give the column itself `relative`: `absolute` elements inside main (sr-only and the like) would then overflow the column instead of being clipped by main.
  - The stack is one list regardless of tone, newest at the bottom (`data-toast-item`, no live semantics). Announcement uses two visually hidden persistent polite/assertive regions that receive tone name and body once when a toast appears (not on dismiss or layout change).
  - Board undo notices (8s `durationMs`) and hints use this stack; the board has no `Toaster` and no `lifted` offset (06 Toast).
  - Toasts belong to one session generation (#2075, test `AppShell.toast-session.test.tsx`): the Kernel drops the list on a new generation and `Toasts` empties both sr-only regions on the same `useSessionKey()` change (the regions stay mounted). A re-render or endpoint refresh keeps them.
  - Toast text exists twice (visible item and sr-only copy), so tests search inside `[data-toast-item]` (Playwright `getByText` matches substrings and would hit both).
- `AppRail.tsx` — top to bottom:
  - `SystemSwitcher`, divider.
  - Section buttons of the current system (`useSystemSections` in `systemSections.ts`): only when `currentSpace` equals the sidebar space; one per group; `aria-current="true"` on the current menu's group; clicking the current section does nothing; another section navigates by Kernel link to that group's first visible menu.
  - Command palette.
  - `분석 보드` directly below menu search, only when an openable menu declares board support (`board/boardMenus.ts`).
  - `VOC 등록` (see VocDrawer), between `분석 보드` and `알림`.
  - `알림` bell (`NotificationsBell.tsx`) when `slots.notifications` exists and its menu is openable. The shell owns button, popover frame, badge and accessible name; the slot supplies count and body. On open, focus goes to the dialog; Esc returns to the bell; `모두 보기` navigation leaves focus to the arrival title.
  - `MenuUnread` (`unread.tsx`) puts the same count as a badge on the switcher platform link and the platform sidebar `NavItem`.
  - Below that: `slots.topBarTools`, divider, help and user menu. The user menu keeps language selection; choosing a language does not close the menu. The standalone `기능 전체` external entry and `features.overall` slot are retired (ADR-0097).
  - Do not copy the space last-screen resume rule here: [06 §9.1](../../../docs/contract/kernel.md#91-워크스페이스-decided-2026-09-26); verified by Kernel `src/platform.space-resume.test.tsx`.
- `SystemSwitcher.tsx` — business system switcher at the top of the rail (15 §3.2, ADR-0042).
  - A path space not in `accessibleSpaces` is not "current": button name, icon and current-card mark all render "no current system" (same as outside business systems), so the rail never names a denied space even when the sidebar falls back to another space.
  - `@ap/ui` Popover (modal, focus trap). Cards = `accessibleSpaces` ∧ has `spaceEntry` (subtext `이어서`/`시작` from `entry.menuId`/`resumed`). `slots.plannedSpaces` render as display-only rows.
  - The `플랫폼 메뉴` section under the title (`usePlatformMenu` in `platformMenu.ts`: `space: null` groups in group order, judging only each menu's permission and openability; `registry.platformHome` is `홈`) is text links above the cards, does not count as a card, and renders even with zero accessible spaces.
  - Initial focus on open: current card → first card → first platform link → empty notice.
  - Navigate by closing the popover first and running the move in `onCloseAutoFocus` (after the trap releases), so Kernel arrival focus (ADR-0032) stays on the new title. Re-selecting the current card, Esc and outside click return focus to the switcher button.
  - Arrivals while the popover is open (back/forward) are guarded by the same Kernel focus gate as the palette (`switcherSession`); a pending navigation is dropped on unmount or Provider session replacement.
- `PlatformSidebar.tsx` — sidebar for Registry screens outside a space (ADR-0070): `홈`, `내 활동` (notifications, surveys, permission requests …) and `공지` in `usePlatformMenu` group order. Header 50px (`분석 플랫폼` + collapse); collapse state comes from `AppShell`. No Scope selector, favorites, recents or feature block. Items use `AppSidebar`'s `NavItem`.
- `AppSidebar.tsx` — renders nothing for global screens or with zero accessible spaces. Top to bottom:
  - Space header (50px: space name + current section name, one line when equal) and collapse.
  - Scope selector: when the space has `scopePresentation: 'hidden'`, only the `scopeControl` component (no `ScopeSelector` fallback, nothing if absent). Never write a space id in code.
  - Only the permission-allowed menus of the current section (group). The group title is omitted because it equals the section name; an unregistered path or a denied-space-entry fallback shows all groups as they are.
  - Favorites and recents (expanded mode only).
  - Feature block below the scroll area: shown only when the drawn `sidebarSpace` is in `accessibleSpaces`, the route is a menu of that space, and `can(permission)` holds when the slot has `permission`; content is `entriesFor(sidebarSpace.id)`.
    - Entries have one shape: `menuId` and optional `page`. Render the same-tab `PlatformLink` only when `resolveLink(menuId, { global: emptyGlobal, page, returnTo: true })` is allowed.
    - Keep space/slot/menu permission gates, Context separation and internal `returnTo`. No outbound href, new-tab or disabled-external branch exists (ADR-0097).
    - Empty, denied or unregistered destinations render no block. Collapsed mode uses the injected icon (`key` is only a React key, ADR-0072).
  - Group display follows only Registry `GroupDef` (`hideLabelWhenSingle`).
  - Accessible names and landmark structure are pinned by `AppShell.test.tsx`. Menu search is the palette only.
  - Scope presentation test: `AppShell.scopePresentation.test.tsx`.
- `frame/SidebarHierarchy.tsx` mounts the menu-declared `navTree` in both `AppSidebar` and `PlatformSidebar`, after that group's fixed menu rows.
  - Gate visibility/`canOpen` before mounting Source.
  - Expanded `role=group` uses the local group-title paragraph; collapsed mode keeps the parent link plus a separate FolderTree popover.
  - Per-menu/user/revision state is shared and survives expanded/popover reopening.
  - Close only on successful Kernel navigation; do not move focus on deep-link load.
  - Existing rows use the `@ap/ui` shared grammar without changing class output.
- `CommandPalette.tsx` — menu-search navigation (row subline `<system> › <section> › <menu>`, consecutive equal names once). Closing returns focus to the opener. Choosing a menu on another pathname passes Kernel's `page` request after Dialog close autofocus so focus lands on the new screen title (06 §26). Use only `paletteSession`'s `claim(owner)`/`release(owner)`/`isCurrent()`, not generation numbers. Defer unmount release with `setTimeout(0)` after FocusScope's passive cleanup.
- `RouteErrorBoundary.tsx` — contains menu render failures in the content slot (06 §4).
  - Shows the client error ID (`usePlatform().reportError`) as `추적 번호` / `Trace ID`, with a quiet `Button variant="link"` report entry beside it and recovery controls on the next visual row. Recovery precedes reporting in DOM/tab order.
  - `HomeLink` resolves the accessible platform home, then the accessible sidebar-space home, or renders nothing.
  - Menu/params/server-revision changes reset the boundary; retry reloads after a lazy chunk failure. Event-handler and async errors are outside this boundary.
  - `voc/useErrorReport.ts` (`{ status, open, submitted }`) opens the existing VOC drawer with trace/menu chips through the shell-wide `VocDrawerContext`. Unavailable reporting restores manual ID guidance and describes the disabled entry; submission fills a persistent polite status region below recovery. The submitted entry uses guarded `aria-disabled` and leaves sequential tab order while staying focusable for drawer focus return.
- `frame/ShellBoundary.tsx` (internal) — contains a render failure of one region the shell mounts outside the menu screen (#1876): the lazy board host, the lazy sidebar hierarchy nav, each menu's `navTree.Source`, and the slots `scopeControl`, `navCounts` (falls back to the list without counts), `spaceNavSection`, `features`, `notifications` (bell and `MenuUnread`). Reports through Kernel `reportShellError` (host-only; the `reportError` payload without cancelling a healthy screen's pending arrival focus); each slot's `For` selector runs inside its own boundary; sidebar boundaries are keyed by space so one space's failure never hides the next; also contained: `topBarTools`, the VOC `Compose` form and the access-request `Dialog`/`Pending`. A floating board that fails keeps the retry line (only a minimized one draws nothing). Fallback is one `hierarchyError` line with `다시 시도` (reload after a chunk failure, as `RouteErrorBoundary`) or nothing where a line does not fit (rail, collapsed sidebar, hidden board). A new user or revision clears it. Test: `AppShell.boundaries.test.tsx`, `AppShell.chunkFailure.test.tsx`.
- `VocDrawer.tsx`, `vocContext.ts` — docked drawer opened by the rail `VOC 등록` (06 §8, ADR-0070 decision 5); the button exists only when `slots.vocCompose` does. `AppShell` holds state through `useVocDrawer`.
  - Freeze the Context only while there is no draft (`freezeVocContext`: pure; chip ids `menu`, `page:<key>`, `period`, `global:<field>`; `href` rebuilt from the remaining chips' original Context/page pair).
  - `Compose` stays mounted while hidden. When the detail slot's `activation` increases, hide only the drawer (keep the draft) and show the detail aside in the same render, so the detail's first focus reaches the visible aside. Close the hidden Compose's transient portals with `TransientOverlayScope`.
  - A changed Kernel session or a vanished slot drops frozen Context, draft and confirmation state and restarts closed.
  - The rail button gets the controller through `VocDrawerContext` (shell-internal, unpublished), so `AppRail()` keeps a no-argument signature.
  - Closing (button, Esc, rail, `onCancel`) with a dirty draft asks `작성 중인 내용을 버릴까요?` in an in-drawer `alert`. Esc counts only when its target is a DOM node inside the aside.
  - Tests: `vocContext.test.ts`, `AppShell.vocDrawer.test.tsx`.
- `ModuleScreen.tsx` — renders a module screen as `{ params, host }` (ADR-0053).
  - An outer owner holds `status` (`ready`/`auth_required`/`identity_mismatch`/`unavailable`); the inner ready instance calls `useModuleHost`. A non-ready state unmounts the instance (= disposal) and renders `StateMessage` with `다시 시도`, which mounts a new instance. Calls to `status`, `detail` and `focusTarget` from a disposed instance are ignored.
  - The outer owner renders `PlatformPage` (header, Context bar, Scope gate; title/description from the entry) once around both branches, so status changes and retry change only the body.
  - `detail` (when `detailSlot` is declared) renders in `DetailDrawer` (title = label, one tab `상세`; closing clears only shell state and does not notify the module) and is cleared on dismissal, status change, key change and unmount.
  - `PlatformPage` alone owns arrival focus: pass the registered `focusTarget` as `arrivalTarget`, else the title (h1). A module screen cannot choose `layout="fill"`.
  - The fixed fixture module (`optional: ['detailSlot', 'write']`) lives in `src/__fixtures__/module-fixture/`: not a package, not mounted in the app, imports only `@ap/contracts`, `@ap/ui` and its own directory (`hostModuleDir` in `eslint.config.js`).
  - Test: `ModuleScreen.test.tsx`.
- `RouteOutlet.tsx` — `ScreenOutlet` and `RouteOutlet`.
  - `ScreenOutlet` renders the menu the nearest screen state points to, through the same gate order (inside a board pane's `PaneScreenProvider`: that pane's menu, permission and space judgment). States: menu screen, or unregistered / contract error / no permission / unimplemented. Every menu screen (ordinary page and module screen, main and pane) and its `RouteErrorBoundary` are keyed `menu id+params|` + the session key (`frame/sessionKey.ts` `useSessionKey()`: adapter identity, revision, user id — the Kernel's query generation inputs): a new session generation (a change notice, or any adapter swap, which restarts the revision count at 0 even for the same user) remounts the screen and drops its local state (refs, caches, selections, open dialogs); URL state survives (#2075, test `ScreenOutlet.session-remount.test.tsx`). A module menu (`moduleScreen`) renders through `ModuleScreen`; module menus count as implemented, so sidebar and palette show no "planned" mark. In a pane, `ModuleScreen` (`PlatformPage` pane mode) draws no header, Context bar or arrival focus.
  - `RouteOutlet` (main screen) places the general `ScreenOutlet` and the board as siblings. The board mounts lazily when `/board` is reached or `board/boardPresentation.ts` is `live`; while minimized (a non-`/board` path) the same instance is only hidden via `data-board-host` (`hidden` + `inert` + `aria-hidden`). `BoardScreen` receives `Outlet={ScreenOutlet}` and `visible`. The app uses only `RouteOutlet` (ADR-0087).
  - Keep the general `ScreenOutlet` in its own `Suspense` boundary, separate from the board: sharing one boundary makes React hide the board with `display:none` when a lazy screen suspends, cleaning up and re-running layout effects so ECharts is rebuilt.
  - `board/boardPresentation.ts` (per-user module store: `live`, `returnHref`, last sheet, focus before hiding; `useBoardPresentation` open/restore/minimize/close transitions are all replace) and `board/BoardRestoreChip.tsx` (one-line chip under main while minimized, plus status live region) are in the startup chunk, so they must not import the board engine.
  - The rail `분석 보드` has three accessible names (closed/open/minimized) and a minimized mark.
  - Test: `ScreenOutlet.pane.test.tsx` (including module screens).

## Context bars

- `GlobalContextBar.tsx` — shows/edits period, room_name, Condition, Selection and carried Context. Optional board-only props: `label` (replaces the bar's display and accessible name with the pane name) and `whenEmpty` (what to draw where the bar is empty).
  - Condition uses the injected axes' display names with the existing single-axis/pair editors; any other map offers only summary and clear-all.
  - URL-carried Line and PRC groups offer only summary and removal; Condition and PRC groups pass their membership basis (`membershipBasis`).
  - Fetch choices with `useAdapterRequest`; on failure show the error and retry.
  - Selection evaluation (`evaluateSelection`) has one bar-level query owner that shares results with the actual, measuring and inline/overflow editors.
- `ContextBarLayout.tsx` — one-line priority overflow (06 §7, ADR-0015). Owns the ResizeObserver of the bar and the intrinsic probe, the request-free inert measuring layer (`MeasuringContext`), the fixed-key priority, and the edit draft and focus return across inline/overflow.
- `ScopeSelector.tsx` — selects Scope (`session.scopes`) and shows validation state and room grant count. `layout="bar"` is the 32px one-line variant for the board Context bar. In state `error`, re-picking the current Scope calls `retryScope()` (no Kernel action in other states) and shows 'Scope 다시 확인' (also for a Scope not in the list). A collapsed sidebar keeps name, state/room description (aria-describedby) and Tooltip. Only status is announced, in a polite live region.
- `QueryBar.tsx`, `QueryHistoryControl.tsx` — in the Apply menu, `GlobalContextBar` mounts `QueryBar` before the existing metadata effect. It uses the Kernel draft/selection ports and the components' summary/expansion metadata, and never imports menu axes or parsers.
  - Editing is inline on the main screen and a fixed panel inside the existing 48px row for board panes.
  - `historySlot` connects the history control; the summary shows only actual values of validated rows. Selecting a recent condition restores only the draft; deletion, clear-all confirmation and keyboard focus are provided (06 §11).
  - When the menu declares a Condition preset (`useConditionPreset()`), put a `조건 묶음` `SegmentedRadio` on the first line of `설비 조건` and draw only the active preset's axes (switching = `setDraftPage`, one polite status sentence). Values outside the preset stay in the carried condition line as `<묶음>에서 미적용`. The summary uses the draft preset for in-edit text and the applied preset for applied text (ADR-0083, 06 §11).
  - The `조회 조건` collapse button is a `secondary` toolbar button with an `aria-hidden` chevron; its accessible name stays `조회 조건 접기/펼치기`.
  - Toolbar button names state their target: `초안 되돌리기` = the in-edit draft, `조건 초기화` = empties the condition, `저장본으로 되돌리기` = the view selected in the save menu.
  - `viewSlot` places `saved-view/SavedViewControl.tsx` (view picker + `수정됨` + save menu + request-style `뷰 관리`, 06 §21) in the same toolbar group beside `historySlot`. Draw it only when a store is injected, `features.savedView` is on, the menu declares support, and the surface is not a board pane; change state only after the store succeeds.
  - Route every store write through Kernel `useSavedViews`; `Ready` receives only store reads. Keep presentation, confirmation and migration patch derivation in the shell, including `apply()` exception handling.
  - `SavedViewControl` is replaced when the hook's generation inputs (store, session, revision, Scope id, user, menu, support) change, and a surface that is gone raises no toast or state from a write it still awaits.
  - Tests: `QueryBar.test.tsx`, `QueryBar.preset.test.tsx`, `saved-view/SavedViewControl.test.tsx`; keep the live fixture.
- `context/ShareControl.tsx`, `context/shareLink.ts` — the `링크 복사` split button on both Context bars (`LiveContextBar` right end, `QueryBar` action row): main button `현재 조건 공유` plus a `링크 복사 방식 선택` menu (`현재 조건 공유` / `메뉴 주소 복사`, kernel.md §11), and its pure serializer.
  - The payload is only the applied `global`/`page`; draft, `returnTo` and extras are excluded.
  - Failures (no path params, serialization, over 4000 chars) are never truncated or replaced by a bare path; a rejected write shows intent-specific text and a read-only link field.
  - `vocContext.ts` uses the same `buildShareLink` (no length cap).
  - Tests: `shareLink.test.ts`, `ShareControl.test.tsx`.

## Board (`board/`, docs/16)

- Screens and ownership:
  - `BoardScreen` is the URL adapter: it reads `/board?sheet=`, picks the sheet, turns sheet-switch commands into address moves (unknown value → replace; match → update `activeSheetId`), and maximizes panes.
  - `BoardSurface` does not read the address. It takes `sheetId`, `onSheetChange`, `arrivalKey` and `Outlet`, and owns arrival focus, undo and the group `+`.
  - `boardSession.ts` is the module-level external store holding each user's board (`useBoardSession`, `readBoardSession`, `updateBoardSession`, `reloadBoardSession`); it lives only while it has subscribers.
  - Layout: header 50px, layout picker, Context bar row 48px, grid, bottom sheet strip. Undo notices go to the shell toast stack; clearing a pane, deleting a sheet and shrinking a layout are undoable.
  - `Sheet.gridMemory` (stored model V2) remembers per-layout column/row ratios and collapse state. The grid reads the tree through `gridOf(sheet)` and adjusts boundaries with `PaneSplitter`.
  - The board knows no menus or mocks; `ScreenOutlet` is passed in as props by `RouteOutlet`.
- `BoardPane` — pane header `PaneHeader` on one line:
  - `칸 N 선택` button, system chip, menu name (shrinks to a 64px minimum when overflowing).
  - `키 값` chips only for keys differing from the other panes of the same sheet (`paneSignals` in `paneActions.ts`; compares only mountable panes whose address is readable; overflow folds into `+N` via ResizeObserver).
  - `같음 N` / `조건 N` (Popover of that pane's whole condition, `Context 바에서 편집`).
  - `이전 화면` (one step, the pane slot's `previous`).
  - `⋯` `칸 N 동작`: `이 조건을 시트의 모든 칸에 적용`, `본 화면에서 열기`, `바꾸기` (PanePicker → confirm AlertDialog, first focus `취소`), `복제`, `비우기`. After the menu closes, hand focus over with `afterMenuClose`.
  - Root has `data-pane-id` and `tabIndex=-1`. Focus, press or header action inside a pane selects that pane first.
  - A stored screen must pass `admitPaneScreen` before mounting through `PaneScreenProvider`. Each pane has its own Suspense boundary, so a pane loading a menu chunk shows a skeleton only in that pane (test `BoardPane.suspense.test.tsx`).
  - The detail panel caption inside a pane is passed via `PaneScreenProvider paneLabel` (`칸 N · menu`).
- `BoardContextBar` — inside a second `PaneScreenProvider` (`countUsage={false}`) that reads the selected pane: `칸 N` badge, Scope selector (`layout="bar"`, the board's only Scope selector), `GlobalContextBar`. If the pane is empty or not openable (unregistered, permission/space-entry denied, contract error), draw an inactive row of the same 48px; judged by `canMountPaneScreen`.
- `SheetTabs` — tablist; ←/→ move focus, Enter opens; rename by double-click or menu; reorder by drag or `왼쪽/오른쪽으로 이동`; max 20 sheets; the sheet action menu includes the `이 시트 조건을 다른 시트에 복사` submenu.
- `PanePicker` (`분석 화면 넣기`); `boardMenus.ts` holds the list rule and pane-screen admission check shared by the rail entry and `분석 화면 넣기`.
- `boardModel.ts` — pure state, validation and undo operations for stored model V2 `Board { v: 2 | 3 }` / `Sheet { panes: PaneSlot[], selectedPaneId, tree, gridMemory? }`.
  - `parseBoard` validates (`parseBoardV2` is its old name). `v:2` allows ≤4 panes per sheet, `v:3` ≤8, both ≤4 display groups (`MAX_TABS`, `MAX_GROUPS`, `MAX_PANES`, ADR-0089).
  - Pane operations take an index (= pane number − 1). Undo restores only when the state is exactly what that action left, else returns null. `normalizeBoard` guarantees post-conditions.
  - `setTree` validates with `isValidDockTree`, then selection follows the active tab. `selectPaneActive` also moves a group's active tab (dock only); `selectPane` never touches the tree, because in the grid a collapsed column's group `active` is the expanded pane.
  - `addPane` (with 4 display groups, adds a tab to the selected pane's group instead of a new group) / `closePane` / `restoreClosedPane` (`칸 추가`, empty-pane `칸 닫기` and its undo); `resetTree` (`기본 배치`).
  - A pane's Kernel id is `${sheetId}.${slot.id}` in both renderers (slot, not position). The user-visible pane number is order + 1.
  - Shared pieces: `boardTypes.ts` (V2 types, layout validation), `boardGrid.ts` (`gridOf`/`withGrid`), `boardMigrate.ts` (`parseBoardV1`, pure `migrateV1`).
- `boardStore.ts` — localStorage `platform:board:v2:${userId}`.
  - Missing V2 key: migrate from the V1 key `platform:board:${userId}` in memory and write V2 on first save. Never write or delete the V1 key; copy its raw text once to `platform:board:v1-backup:${userId}`.
  - A newer version (`v>3`) is read-only (`storageNotice: 'newer'`). Save as `v:3` if any sheet exceeds 4 panes, else `v:2`.
  - An unreadable value is copied to `platform:board:corrupt-backup:v1|v2:${userId}`, then falls back (`'corrupt'`).
  - Do not write before an edit. Re-read when the user changes. On read restore the stored selected pane and group active tab (a selection that is not a pane → first pane; a mismatch with the group's active tab → follow the active tab; `asStored`). `writeStoredBoard` returns false when it cannot write.
- `layout.ts` — `PANE_MIN_WIDTH` 340px, `STACKED_PANE_MIN_HEIGHT` 400px, `GRID_GAP`, `drawnColumns`, `effectiveTracks`, `useGridHeight`: stacking and track calculation by grid container width.
- `layoutEngine.ts` — browser setting `platform:board-layout-engine` = `dock` | `grid`. The default `dock` lives in one place (`BOARD_LAYOUT_ENGINE_DEFAULT`); `grid` is the alternative renderer. `BoardScreen` reads it once per visit.
- `BoardDock.tsx` (dock renderer) — puts the sheet tree on `DockLayout` from `@ap/components/dock`, one `BoardPane` per panel.
  - Tab = `칸 N` badge (`PaneBadge`, filled when selected) + ellipsized name + X for panes with content (`비우기`; accessible name from the engine, `칸 N · menu name`). Tab Delete = `비우기` (focus stays on that tab); X clears on press.
  - The active pane's `PaneHeader` is drawn with `createPortal` into the group strip's right slot (`HeadSlot`). Pane state (menus, picker, confirm) stays in `BoardPane`; background-tab panes have no header.
  - One `칸 N 동작` menu chains the content group and then the layout group (`layoutMenu`: maximize, split, `칸 M 묶음으로 옮기기`).
  - For a workspace pane, `PaneHeader` draws each radio group (preset, `높이 방식`; label = the command's `groupLabel`, supplied by the producer) via `radioGroupsOf` as one group with one check (06 §12.8, ADR-0077). The board keeps percentage boundaries; the pane body scrolls.
  - Focus: after un-maximizing → the maximize toggle; after `칸 추가` → the new pane's tab.
  - `PaneHeader variant="dock"` omits number, menu name and collapse; it holds system chip, difference chip, `같음 N`, `이전 화면`, maximize toggle and `⋯` as `role=group` `칸 N 머리`. Narrowing order by strip width and tab count (`fitChips`, `useVisibleChips`): fold chips → compact background tabs from the back one by one to badge only (`compactTabCount`, tab `data-dock-tab-compact`, header count `data-dock-compact`) → second row `data-dock-wrap`.
  - Tests: `BoardDock.test.tsx`, `boardDockTree.test.ts`, `layoutEngine.test.ts`.
- `boardDockTree.ts` — pure `toDockTree`/`fromDockTree`, `reconcileSelection`, default layout tree. Its name differs from `BoardDock.tsx` only by case; keep the names distinct so they do not collide in the same folder.
- `text.ts` — board copy (ko/en); board copy lives here, not in the Kernel dictionary.
- `paneActions.ts` — pure computation for pane Context comparison, bulk apply, cross-sheet position copy and replace (apply only through Kernel `withPaneContext`; pane-number text `1–3` / `1, 3`).
- `OpenInBoardAction.tsx` — the shell-exported `분석 보드에 열기…` item and dialog, passed by the app as `slots.boardEntry`. The dialog uses `useHeaderOverflowDialog` from `@ap/components` so it survives the page header `⋯` closing. Save only through `boardSession` and model functions (`reloadBoardSession` just before confirm, then confirm, change and save in one update). Write nothing before confirm; if the write fails (newer-version value) show `boardNotSaved` and do not close.
- Test: `board/*.test.ts(x)`.

## Detail expansion (ADR-0126)

`AppShell` controls the UI slot provider from host `detailExpanded`/`setDetailExpanded`; `/board` uses local state. VOC and detail share that value and the shared UI toggle/Escape rules.

- Only an open-to-closed surface transition clears expansion; an initially empty slot keeps a restored key for late registration.
- Expanded detail/VOC stay mounted and leave the flex row to cover the content box below the actual sticky page header. Observe content/header resize and remeasure on scroll/resize; do not hard-code a 50px top edge.
- Geometry uses CSS custom properties and the shared token-class constant. PlatformPage owns covered-body inert.
- Existing docked classes and VOC draft/close confirmation semantics stay intact.

## Verification

Narrow with `pnpm --filter @ap/shell test` (boundary unit tests), then run the root checks (root `AGENTS.md`). Also check by hand with `pnpm dev`: sidebar, rail, Context bar, and menu exposure after a role switch.
