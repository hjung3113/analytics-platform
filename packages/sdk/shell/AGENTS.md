# @ap/shell

App Shell (06 §8–9, screen design [07](../../../docs/design/app-shell.md)). Read the menu list from the injected Registry; read choices and session from the adapter.

## Rules

- Do not compute domain choices (equipment, room, condition lists) in the shell. Display what the adapter returns, already filtered by session permission.
- Keep dev-only tools (role switch, response scenarios) out of the shell. The app injects them through `slots.topBarTools`, rendered below the rail (keep the slot name, ADR-0009).
- Layout dimensions and IA changes are 07/06 §9 changes. The workspace layer (06 §9.1) is built here and in the Registry.
- The shell owns the detail aside: width zero when closed, shared width clamped to §7 when docked. Docked detail leaves the body available (ADR-0013, §13). Expansion follows "Detail expansion" below.
- Resolve sidebar slots `scopeControl`, `navCounts` and `spaceNavSection` only when the matched route passes `canOpen`. Refuse them before mount on denied menus, including grant revocation. An unmatched route keeps the null-menu fallback.

## Frame

  - Toasts: `Toasts` sits `absolute` at a height-0 `relative` anchor (`data-toast-anchor`) on the bottom edge of the content column (`data-shell-content`), outside the detail aside and VOC drawer. Never give the column itself `relative`: `absolute` elements inside main (sr-only and the like) would then overflow the column instead of being clipped by main.
  - The stack is one list regardless of tone, newest at the bottom (`data-toast-item`, no live semantics). Announcement uses two visually hidden persistent polite/assertive regions that receive tone name and body once when a toast appears (not on dismiss or layout change).
  - Toasts belong to one session generation (#2075, test `AppShell.toast-session.test.tsx`): the Kernel drops the list on a new generation and `Toasts` empties both sr-only regions on the same `useSessionKey()` change (the regions stay mounted). A re-render or endpoint refresh keeps them.
  - Toast text exists twice (visible item and sr-only copy), so tests search inside `[data-toast-item]` (Playwright `getByText` matches substrings and would hit both).
  - Do not copy the space last-screen resume rule here: [06 §9.1](../../../docs/contract/kernel.md#91-워크스페이스-decided-2026-09-26); verified by Kernel `packages/sdk/kernel/src/platform/__tests__/platform.space-resume.test.tsx`.
- `SystemSwitcher.tsx` — business system switcher at the top of the rail (15 §3.2, ADR-0042).
  - A path space not in `accessibleSpaces` is not "current": button name, icon and current-card mark all render "no current system" (same as outside business systems), so the rail never names a denied space even when the sidebar falls back to another space.
  - Navigate by closing the popover first and running the move in `onCloseAutoFocus` (after the trap releases), so Kernel arrival focus (ADR-0032) stays on the new title. Re-selecting the current card, Esc and outside click return focus to the switcher button.
  - Arrivals while the popover is open (back/forward) are guarded by the same Kernel focus gate as the palette (`switcherSession`); a pending navigation is dropped on unmount or Provider session replacement.
- `AppSidebar.tsx` — renders nothing for global screens or with zero accessible spaces. Top to bottom:
  - Feature block below the scroll area: shown only when the drawn `sidebarSpace` is in `accessibleSpaces`, the route is a menu of that space, and `can(permission)` holds when the slot has `permission`; content is `entriesFor(sidebarSpace.id)`.
    - Render the same-tab `PlatformLink` only when `resolveLink(menuId, { global: emptyGlobal, page, returnTo: true })` is allowed.
    - Keep space/slot/menu permission gates, Context separation and internal `returnTo`. No outbound href, new-tab or disabled-external branch exists (ADR-0097).
    - Empty, denied or unregistered destinations render no block. Collapsed mode uses the injected icon (`key` is only a React key, ADR-0072).
- `frame/SidebarHierarchy.tsx` mounts the menu-declared `navTree` in both `AppSidebar` and `PlatformSidebar`, after that group's fixed menu rows.
  - Gate visibility/`canOpen` before mounting Source.
  - Close only on successful Kernel navigation; do not move focus on deep-link load.
  - Existing rows use the `@ap/ui` shared grammar without changing class output.
- `CommandPalette.tsx` — menu-search navigation (row subline `<system> › <section> › <menu>`, consecutive equal names once). Closing returns focus to the opener. Choosing a menu on another pathname passes Kernel's `page` request after Dialog close autofocus so focus lands on the new screen title (06 §26). Use only `paletteSession`'s `claim(owner)`/`release(owner)`/`isCurrent()`, not generation numbers. Defer unmount release with `setTimeout(0)` after FocusScope's passive cleanup.
- `RouteErrorBoundary.tsx` — contains menu render failures in the content slot (06 §4).
  - Menu/params/server-revision changes reset the boundary; retry reloads after a lazy chunk failure. Event-handler and async errors are outside this boundary.
  - `voc/useErrorReport.ts` (`{ status, open, submitted }`) opens the existing VOC drawer with trace/menu chips through the shell-wide `VocDrawerContext`. Unavailable reporting restores manual ID guidance and describes the disabled entry; submission fills a persistent polite status region below recovery. The submitted entry uses guarded `aria-disabled` and leaves sequential tab order while staying focusable for drawer focus return.
- `frame/ShellBoundary.tsx` (internal) — contains a render failure of one region the shell mounts outside the menu screen (#1876): the lazy board host, the lazy sidebar hierarchy nav, each menu's `navTree.Source`, and the slots `scopeControl`, `navCounts` (falls back to the list without counts), `spaceNavSection`, `features`, `notifications` (bell, `MenuUnread` and the popover body `Recent`, so a stale chunk keeps the bell and shows the retry inside the popover, #1981). Reports through Kernel `reportShellError` (host-only; the `reportError` payload without cancelling a healthy screen's pending arrival focus); each slot's `For` selector runs inside its own boundary; sidebar boundaries are keyed by space so one space's failure never hides the next; also contained: `topBarTools`, the VOC `Compose` form and the access-request `Dialog`/`Pending`. A floating board that fails keeps the retry line (only a minimized one draws nothing). Fallback is one `hierarchyError` line with `다시 시도` (reload after a chunk failure, as `RouteErrorBoundary`) or nothing where a line does not fit (rail, collapsed sidebar, hidden board). A new user or revision clears it. The chunk-failure matcher `isChunkLoadFailure` lives in `@ap/kernel/host`. Test: `AppShell.boundaries.test.tsx`, `AppShell.chunkFailure.test.tsx`.
- `VocDrawer.tsx`, `vocContext.ts` — docked drawer opened by the rail `VOC 등록` (06 §8, ADR-0070 decision 5); the button exists only when `slots.vocCompose` does. `AppShell` holds state through `useVocDrawer`.
  - `Compose` stays mounted while hidden. When the detail slot's `activation` increases, hide only the drawer (keep the draft) and show the detail aside in the same render, so the detail's first focus reaches the visible aside. Close the hidden Compose's transient portals with `TransientOverlayScope`.
  - A changed Kernel session or a vanished slot drops frozen Context, draft and confirmation state and restarts closed.
  - Closing (button, Esc, rail, `onCancel`) with a dirty draft asks `작성 중인 내용을 버릴까요?` in an in-drawer `alert`. Esc counts only when its target is a DOM node inside the aside.
- `ModuleScreen.tsx` — renders a module screen as `{ params, host }` (ADR-0053).
  - `PlatformPage` alone owns arrival focus: pass the registered `focusTarget` as `arrivalTarget`, else the title (h1). A module screen cannot choose `layout="fill"`.
- `RouteOutlet.tsx` — `ScreenOutlet` and `RouteOutlet`.
  - `ScreenOutlet` renders the menu the nearest screen state points to, through the same gate order (inside a board pane's `PaneScreenProvider`: that pane's menu, permission and space judgment). States: menu screen, or unregistered / contract error / no permission / unimplemented. Every menu screen (ordinary page and module screen, main and pane) and its `RouteErrorBoundary` are keyed `menu id+params|` + the session key (`frame/sessionKey.ts` `useSessionKey()`: adapter identity, revision, user id — the Kernel's query generation inputs): a new session generation (a change notice, or any adapter swap, which restarts the revision count at 0 even for the same user) remounts the screen and drops its local state (refs, caches, selections, open dialogs); URL state survives (#2075, test `ScreenOutlet.session-remount.test.tsx`). A module menu (`moduleScreen`) renders through `ModuleScreen`; module menus count as implemented, so sidebar and palette show no "planned" mark. In a pane, `ModuleScreen` (`PlatformPage` pane mode) draws no header, Context bar or arrival focus. The unregistered-route screen adds `메뉴 검색 (⌘K)` (opens the palette) beside `홈`; the menu-denied screen adds `권한 요청` only when `slots.accessRequest.Pending` gives a `statusHref` for the missing `permission` (the Shell never knows the request page; no slot or no address → no button; space-denied has neither).
  - The app uses only `RouteOutlet` (ADR-0087).
  - Keep the general `ScreenOutlet` in its own `Suspense` boundary, separate from the board: sharing one boundary makes React hide the board with `display:none` when a lazy screen suspends, cleaning up and re-running layout effects so ECharts is rebuilt.
  - `board/boardPresentation.ts` (per-user module store: `live`, `returnHref`, last sheet, focus before hiding; `useBoardPresentation` open/restore/minimize/close transitions are all replace) and `board/BoardRestoreChip.tsx` (one-line chip under main while minimized, plus status live region) are in the startup chunk, so they must not import the board engine.

## Context bars

  - Fetch choices with `useAdapterRequest`; on failure show the error and retry.
- `ScopeSelector.tsx` — selects Scope (`session.scopes`) and shows validation state and room grant count. `layout="bar"` is the 32px one-line variant for the board Context bar. In state `error`, re-picking the current Scope calls `retryScope()` (no Kernel action in other states) and shows 'Scope 다시 확인' (also for a Scope not in the list). A collapsed sidebar keeps name, state/room description (aria-describedby) and Tooltip. Only status is announced, in a polite live region. The sidebar selector (not `layout="bar"`) answers the Kernel host request `scopeSelector.open()` from a page's `Scope 선택` (#1938): it expands a collapsed sidebar through `onExpand`, opens the list with focus inside, and on a close without a pick returns focus to the requesting button; it never picks a Scope. Test: `AppShell.scopeGate.test.tsx`.
- `QueryBar.tsx`, `QueryHistoryControl.tsx` — in the Apply menu, `GlobalContextBar` mounts `QueryBar` before the existing metadata effect. It uses the Kernel draft/selection ports and the components' summary/expansion metadata, and never imports menu axes or parsers.
  - Toolbar button names state their target: `초안 되돌리기` = the in-edit draft, `조건 초기화` = empties the condition, `저장본으로 되돌리기` = the view selected in the save menu.
  - `viewSlot` places `saved-view/SavedViewControl.tsx` (view picker + `수정됨` + save menu + request-style `뷰 관리`, 06 §21) in the same toolbar group beside `historySlot`. Draw it only when a store is injected, `features.savedView` is on, the menu declares support, and the surface is not a board pane; change state only after the store succeeds.
  - Route every store write through Kernel `useSavedViews`; `Ready` receives only store reads. Keep presentation, confirmation and migration patch derivation in the shell, including `apply()` exception handling.
  - The payload is only the applied `global`/`page`; draft, `returnTo` and extras are excluded.
  - Failures (no path params, serialization, over 4000 chars) are never truncated or replaced by a bare path; a rejected write shows intent-specific text and a read-only link field.

## Board (`board/`, docs/16)

- A stored screen must pass `admitPaneScreen` before mounting through `PaneScreenProvider`. Each pane has its own Suspense boundary, so a pane loading a menu chunk shows a skeleton only in that pane (test `BoardPane.suspense.test.tsx`).
  - Missing V2 key: migrate from the V1 key `platform:board:${userId}` in memory and write V2 on first save. Never write or delete the V1 key; copy its raw text once to `platform:board:v1-backup:${userId}`.
  - Do not write before an edit. Re-read when the user changes. On read restore the stored selected pane and group active tab (a selection that is not a pane → first pane; a mismatch with the group's active tab → follow the active tab; `asStored`). `writeStoredBoard` returns false when it cannot write.
- `boardDockTree.ts` — pure `toDockTree`/`fromDockTree`, `reconcileSelection`, default layout tree. Its name differs from `BoardDock.tsx` only by case; keep the names distinct so they do not collide in the same folder.
- `text.ts` — board copy (ko/en); board copy lives here, not in the Kernel dictionary.
- Apply pane Context only through Kernel `withPaneContext`.
- `OpenInBoardAction.tsx` — the shell-exported `분석 보드에 열기…` item and dialog, passed by the app as `slots.boardEntry`. The dialog uses `useHeaderOverflowDialog` from `@ap/components` so it survives the page header `⋯` closing. Save only through `boardSession` and model functions (`reloadBoardSession` just before confirm, then confirm, change and save in one update). Write nothing before confirm; if a newer-version value blocks writing, show `boardNotSaved`; if storage throws, show `storageFailed`, retain the unsaved session and do not close or navigate.

## Detail expansion (ADR-0126)

`AppShell` controls the UI slot provider from host `detailExpanded`/`setDetailExpanded`; `/board` uses local state. VOC and detail share that value and the shared UI toggle/Escape rules.

- Only an open-to-closed surface transition clears expansion; an initially empty slot keeps a restored key for late registration.
- Expanded detail/VOC stay mounted and leave the flex row to cover the content box below the actual sticky page header. Observe content/header resize and remeasure on scroll/resize; do not hard-code a 50px top edge.
- Geometry uses CSS custom properties and the shared token-class constant. PlatformPage owns covered-body inert.
- Existing docked classes and VOC draft/close confirmation semantics stay intact.

## Verification

Narrow with `pnpm --filter @ap/shell test` (boundary unit tests), then run the root checks (root `AGENTS.md`). Also check by hand with `pnpm dev`: sidebar, rail, Context bar, and menu exposure after a role switch.
