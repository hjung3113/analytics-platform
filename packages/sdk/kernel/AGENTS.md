# @ap/kernel

Platform Kernel runtime (contract/kernel.md §4). It knows neither the menu list nor the server implementation; the app injects both.

## Rules

- Keep the exact `@tanstack/react-query` pin `5.62.7` in step with `@ap/feature-bridge` (ADR-0086).
- Reach the server and session only through `adapter`. A session is a synchronous snapshot plus `subscribe`; on a change notice raise the revision to hide earlier results. `adapter.test.tsx` pins this invalidation contract: change the test first.
- When changing Registry validation, add a failing case to `registry.test.ts`. Tests use fixture Registries only and never import real menus (a test needing real menus is an app integration test).
- When adding a port method, fix the test adapter defaults here in the same PR.
- Add a slot to `PlatformSlots` only when [Shell Slots §8](../../../docs/contract/layout.md#8-shell-slots) grounds it.

## Registry (`registry.ts`, `module.ts`, `module-host.ts`)

- `opensObject` declares which object kinds a menu opens (들어오는 연결; not the `platform-inbound-link` codec); `subjectLinks` opts into header lists. Registry validates both and builds `objectDestinations(kind)` once; screen-bound `objectLinks` reuses `resolveLink` with returnTo/page/global (06 §22).
- Registry contract: [contract/kernel.md §6.4](../../../docs/contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate).

- Dynamic sidebar (`PlatformMenuEntry.navTree`, contract/kernel.md §5): owns the stable render-prop `Source`, label and optional mode/icons/current-node resolver. It is absent from JSON `MenuMeta`. The shell gates Source mounting before menu code runs.
- Carry sets: `createRegistry({ carrySets })` validates set IDs/keys, member declarations and navView exclusions; `carrySetOf(menu)` is independent of spaces. Internal space entry/resume resolution never borrows current set state. Favorites clear destination set keys explicitly; recents keep stored clean URLs. A carry set listing `returnTo` retains it across member links regardless of space.
- Menu permissions ([contract/kernel.md §5](../../../docs/contract/kernel.md)): every access check uses `menuPermissions(menu).every(can)` from `@ap/contracts`; never add primary-only readers.
- `useModuleHost(entry, params, ports)` (ADR-0053, no UI) builds one screen instance's `ModuleHost` from `useHostPlatform()`; the shell-only `status`·`focusTarget`·`detail` arrive through `ports`.
  - The host is a snapshot, a new object whenever URL/session/language changes; screens depend on the values they read, not host identity.
  - `setPage` throws `RangeError` before navigating for an undeclared page key; `page(key)` gives `null`.
  - `href`/`navigate` resolve only registered menus via `resolveLink`; `{screen}` is valid only for `<module>:<screen>` whose entry's `module` is this module (nested modules sharing a prefix and platform menu ids are rejected). Unknown → `null`/`false`. Never build URLs from module strings. `navigate` requests arrival focus `page` when the pathname changes.
  - `context()` maps `apply`/`reference` keys to GlobalContext fields (time→from/to, lot→lotIds, recipe→recipeIds, metric→metricId+metricVersion), returns `unsupported` key names separately, and carries `scopeId` only on `requiresScope` screens.
  - `act` exists only if the module declares `write` and the host provides it. It uses the same `actionRequest`/`launchWrite`, one slot per (instance, `spec.id`); a released instance sends nothing and throws `AbortError`; pending waits for re-setup like `query` but does not apply the applied-Context rule (writes do not project analysis Context).
  - `query` exists only on screens declaring the `query` feature and uses the same request path as `menu-query` (non-hook `menuRequest` in `query.ts`). Each call captures revision, user and `projectContext` at start; release or a change of those (applied-Context changes included, reference-only changes excluded) rejects with `AbortError` even if the adapter ignores cancellation or never settles, and validity is rechecked before delivering success.
  - Unmount aborts the `signal` already handed out in layout cleanup, rejects pending calls and clears subscriptions. Until the owner's setup returns (StrictMode replays descendants' layout setup before the owner's) the host is pending: a new `query` waits without adapter work and starts at setup. If no setup follows after the commit's synchronous work (microtask), release is final and pending calls reject with `AbortError`. A pending host's `signal` is already aborted, and passing it to a pending `query` does not count as caller abort.
  - Tests: `module-host.test.tsx`.
- Panel lending ([contract/kernel.md §5 «패널 빌려주기»](../../../docs/contract/kernel.md#패널-빌려주기-s2-2490), ADR-0171): `registry/lent-panels.ts` validates `MenuMeta.lentPanels` bindings inside `createRegistry` (source panel exists, required inputs bound, `display` names JSON-only and not page/drill/Context keys) and resolves each binding to a verdict (permission AND of receiver, source menu and source endpoints; `denied` carries the source menu and panel names). `registry/LentPanel.tsx` is the mount boundary: it rechecks both menus' `canOpen` and the session Scope, then renders the source component under `LentPanelPlatformContext`.
  - Writes are off inside a lent panel: a new write hook (URL, session draft, saved view) must check `LentPanelPlatformContext` and do nothing there, as `hooks.tsx`, `useSessionDraft.ts`, `useSavedViews.tsx` and `useSavedViewSupport.ts` do.

## Platform provider (`platform/`)

Behavior is pinned by `adapter.test.tsx` and `platform.*.test.tsx`: change the test first.

- **Context writes.**
  - `setGlobal`/`resetContext`: when the value really changes, clear the current menu's `contextResetKeys` in the same navigation (§6.4). `dropResetKeys` (`paneContext.ts`, internal) is the only rule clearing `contextResetKeys` from page pairs on a Context write.
  - `pageParam`/`setPage`: a patch that changes a drill level key also clears the current menu's `drill.resetKeys` in the same write (panes the same per pane). A reset key value given directly in the patch wins. `setGlobal` and Back/Forward do not apply it.
- `linkTo` is for guaranteed destinations only (ADR-0158).
- **Return.** `returnTarget`/`returnOrigin` expose, for an accepted openable `returnTo`: menu name, continued drill values, reverted global Context entries (`revertedContext`, Scope included), `accepted` (true only when adopted, false for fallback) and `spaceLabel` (origin menu's space name, else null). When absent or rejected, fall back in order: openable parent → openable `registry.platformHome` → openable `sidebarSpace.homeMenuId` → `/` (exception guard).
- **Misc state.** Scope state (`scope`·`retryScope`; the Provider masks frames of a changed session), favorites/recents, `reportError`. `reportError` sends identifying fields only to the adapter; never `Error.message`, URL or Context values.
- **Toasts per session generation.** The toast list, its timers and actions belong to `gen`: a new generation empties the list in the same render and retires the old timers in a layout effect. The list state carries its `gen` and each update carries the issuing `gen`; an update of another generation is a no-op and only the current generation's list reaches `ToastsContext` (an old screen's layout cleanup runs in the swap commit after the dropping render). `toast` from an older generation (a change notice already counted, a generation the Provider already replaced, or an adapter released by a swap or unmount) shows nothing and returns `-1`. The Provider's layout cleanup only suspends the adapter (StrictMode replay), and release is final at the microtask, as in `module-host.ts`, so a current-generation layout effect replayed under StrictMode still raises its toast. A toast the new generation raises while mounting stays. Tests: `platform.toast-session.test.tsx`, shell `AppShell.toast-session.test.tsx`.
- **Render isolation** (ADR-0049, ADR-0076 addendum). `PlatformProvider` holds app-wide state (session, permissions, favorites, `slots`) in one `useMemo`d value. Frequently changing shell state (recent visits, toasts, palette, switcher) sits in separate per-concern contexts (`useRecentVisits()`·`useToastList()`·`useOverlayState()`, `HostPlatform.readRecent()`) so menus, tables and charts are not woken. `useScreenState`'s `screen`·`queryPolicy` and members keep the same reference when content is equal; `MainScreenProvider` is `memo`. Test: `platform.render-count.test.tsx`.
- **Screens.** `useScreenState` builds the URL-bound **main screen** (route, Context, page, Scope, writes, links, return, `reportError`, utilization dwell). `PaneScreenProvider paneId screen={{ menuId, params, query }} onChange onLeave` (`PaneScreen`) builds **one pane's screen** by the same rules and binds descendants' `useHostPlatform()` to the pane; its address is `pathFor(menu, params) + query` and the pane's `url`/`pathname` are that virtual address.
  - `useHostPlatform()` merges app-wide fields, main-screen-bound shell fields (`visibleMenus`·`sidebarSpace`·`spaceResume`·`spaceEntry`·`switchSpace`) and the nearest screen state, plus `screenMode`·`paneId`. Shell outside panes (rail, sidebar, switcher, palette, feature links) always reads the main screen.
  - Pane writes (`setGlobal`·`setPage`·`resetContext`·drill·default period/metric-version materialize) go only through `onChange(next, 'push'|'replace')` and ignore permissions and `features.board`.
  - `navigate`/`PlatformLink`/return: another `features.board` menu that is `canOpen` → `onChange(…, 'push')` (same pane address keeps the `replace` option); otherwise `onLeave(href)`; external, absolute or same address → false.
  - Materialize merges period and metric version into one `replace` and never repeats the same input/output proposal (`onChange` may not apply immediately).
  - Only the main screen handles popstate, recents, `space-last`, `lastScope` and `#platform-main` scroll. A pane validates its own Scope and counts utilization as `source: 'board'` + `stayId` (admission key includes `paneId`).
  - A pane write's menu, params and current address come from the rendered screen (descendant layout-effect writes target the new screen). Pane consumers do not re-render on main-screen Scope/toast/palette changes (pane-only Context; the main bundle is memoized) and re-render once, following `mainBound`, when the main address changes.
  - Precondition (caller, board): a registered `menuId` with all path params, validation of saved screens, and the "cannot open" state for missing/disabled menus — shell `board/boardMenus.ts` `admitPaneScreen` guards this.
  - A second Provider reading the same pane (board Context bar) uses `countUsage={false}` so utilization is not double-counted. Tests: `platform.pane.test.tsx`.
- **Platform screen** ([analysis board §7](../../../docs/design/analysis-board.md)). When the main path is `/board` (trailing slash allowed), `useHostPlatform().platformScreen` is `'board'` (null elsewhere and inside panes), `route` and `contractError` are null and main Context is empty (the Context codec does not run). This screen is not cancelled as an unregistered path (the arrival-focus request stays for the board to consume) and does not feed recents, space-last or menu utilization. It is read-only; `hasDotSegment`·`isBoardPath`·`BOARD_PATH` are public for the shell. Tests: `platform.board.test.tsx`, `registry.test.ts`.
- **Detail expansion URL boundary** (ADR-0126). `links/detail-expansion.ts` owns stripping and writing the internal reserved key. `useScreenState` exposes `detailExpanded`/`setDetailExpanded` on HostPlatform only; keep `expand` off MenuPlatform and page/query/share data.
  - `expand=1` is removed before query parsing, draft identity and saved-view comparison; `setPage` and Registry declarations reject it. Old preference addresses are stripped on read.
  - Same-screen writes and materialization retain it; host toggles always replace, without changing guard semantics.
  - Cross-menu navigation, return origins, links/carry sets, favorites, recents and space-last/resume do not carry it.
  - Board and pane host setters are no-ops: presentation lives in memory in the slot owner.
  - Test: `platform.detail-expansion.test.tsx`.

## Navigation and URL helpers

- `returnTo` is navigation info, not screen state, so space-last (`writeSpaceLast`) and recents (`recordVisit`) strip it before storing and query history strips it before normalizing.
- Hidden return state fails closed: storage errors mean no hidden pairs; a return whose write failed is not restored.
- `pageNavigation.ts` — after-navigation focus requests held by the Provider (`PageFocus`: `drill`·`return`·`page`, §26).
  - Only explicit navigation makes requests: `PlatformLink` and palette when the pathname changes, Back/Forward popstate between menus when the pathname changes (`page`), and `switchSpace`. `PlatformPage` consumes a request only when generation and pathname match.
  - `PageNavigation` offers `requestReturn`·`consume`·`subscribe`·`claimsDetailFocus`. `claimsDetailFocus` is false for URL arrival (`page`·`return`, first-load `focus=`) and true when `focus` appears on the same screen or for `drill` (ADR-0032).
  - The palette connects only through the injected `isBlocked()` and release notice `notify()`, and a blocked `page` request is preserved.
  - Screens read requests only through host `useArrivalFocus(arrive, { enabled?, rereadKey? })` (`useArrivalFocus.ts`; `PlatformPage`, `BoardSurface`, the shell's blocked screens): it consumes for the current pathname now and on every `notify()`, and subscribes with one owner per screen instance, so a kept arrival survives that screen's re-subscription. `arrive` picks the target. Test: `useArrivalFocus.test.tsx`.
  - `cancel(true)` (a mounted blocked main screen, #1893) keeps a `page` request for the owners subscribed at that moment (`subscribe(listener, owner?)`; default owner = the listener). The same owner subscribing again (StrictMode replay, pathname-equal rewrite) keeps it; when it is read while none of those owners is subscribed, it expires, so a different screen in their place never inherits it. Test: `pageNavigation.test.ts`.
- `paletteFocus.ts` — owns palette open/close, generation, Dialog instance ownership, render state and cleanup on Provider session replacement. Opening cancels the previous navigation request; the shell gets session-bound `claim(owner)`·`release(owner)`·`isCurrent()` handles. Only the current owner releases the block, in the deferred release after Dialog close autofocus or FocusScope cleanup. Pinned by `paletteFocus.test.ts` (transitions), `packages/sdk/shell/src/routing/__tests__/CommandPalette.test.tsx`, `packages/sdk/components/src/archetypes/__tests__/DrillLayout.test.tsx` and E2E `메뉴 이동 포커스 (06 §26)` (focus results).
- `navigationGuard.ts` — Kernel-internal store of the unsaved-navigation guard (ADR-0115, §6.4): `createNavigationGuard()` plus `history.state.apIdx` helpers.
  - One registration = one dirty hook; main-screen registrations hold navigation; the innermost (latest) `message` shows. On confirm, run `onDiscard` of the blocking registrations newest first once, then `proceed` once. One pending request: it is dropped without confirmation when the blocking registrations vanish or the session generation changes. One `beforeunload` listener while dirty; accepted Back/Forward is signalled by `onTraversal`.
  - Opt-in `useSessionDraft(key, initial, { ready?, isEqual? })` preserves only same-user unsaved input across session remounts, in memory; gate item access with `ready`, call `discard()` after save. Ordinary unmount and user changes clear it.
  - Public names: root `useUnsavedGuard(dirty, { message?, leaves?, onDiscard? })`·`UnsavedGuardOptions` (`hooks.tsx`); host `useLeaveRequest()`·`LeaveRequest`.
  - It blocks in exactly two places: `MainScreenProvider.commit` (push, or a host `replace` passing `guard: true` (board open, #2061), that is not a redirect, materialize or `bypassGuard`; returns `false` when blocked) and the stable popstate listener (corrects with `history.go(-delta)` from the `apIdx` difference; on confirm `go(delta)`; if it cannot be undone, pass through + `reportError`).
  - `useSavedViews` judges selection release by `onTraversal`, not raw popstate. Panes (`PaneScreenProvider`) register as internal `unloadOnly` entries: they protect document unload, while main-screen and pane navigation exclude them from blockers and discard callbacks. Tests: `navigationGuard.test.ts`, `platform.nav-guard.test.tsx`.

## Query lifecycle (`query/`)

- `PlatformProvider` keeps one client for its whole life. The session generation `gen = adapterEpoch:revision:userId` (`adapterEpoch` rises when the adapter prop changes) is the second element of every key; on change, queries of other generations are removed in the same commit.
- `query.ts` — `useQueryLifecycle` on the engine (ADR-0086; lifecycle contract owner: §19). Key `[kind, gen, …identity, idle]`. An open instance shows the key's result (`refreshing` while fetching); a closed instance shows only results it accepted. When closed, or when every open observer leaves, the `startQueryEngine` subscription runs `cancelQueries` (no per-hook effect). `refetch`/`refreshEpoch` use `refetch({ cancelRefetch: false })` so they never open a closed gate.
  - Cancellation is judged only by Kernel's own `signal.aborted`; an adapter-timeout `AbortError` is an error. The decision rules are owned by §19 and [checklist §3](../../../docs/integration/real-server-checklist.md), pinned by `menu-query.test.tsx`.

- `condition-preset.ts` — Condition presets (ADR-0083, §6.4).
  - Do not narrow `host.context()`, `withPaneContext`, the URL or the global Condition.

- `query-history.ts` — `useQueryHistory` and the logical draft-owned history state. From the first render after a session/revision/Scope change it hides earlier rows and provides values only after the existing Scope / room grant / resolveSelection validation. Restore replaces the whole draft atomically; an occurrence is recorded only at Apply address confirmation (§11). The returned object is `useMemo`d; methods close over the current render input and reject stale calls through `current()`; masked rows keep the same reference while enabled, rows and permissions are equal. Tests: `query-history.test.tsx`, `platform.pane.test.tsx`.
- `action.ts` — screen side of the write port (ADR-0054). Non-hook core `actionRequest(spec, input, expectedVersion, inputs)`:
  - A version-rule violation throws `RangeError` synchronously before sending. An unmet Scope gate returns a `not_ready` error with no adapter call and no `retry`.
  - Each call builds the request once with a `randomUuidV4()` key and a `structuredClone`d input; every `retry` resends that object.
  - It never passes a release signal to the adapter (a sent write cannot be undone); a throw becomes `unknown` (`message: String(error)`). Only `error` and `unknown` get `retry`.
  - On `ok`, `conflict` or `unknown`, raise the refresh epochs of `spec.invalidates` whether or not anyone awaits the response.
  - `launchWrite(flight, send)` is the owner's (hook or host instance) flow control: single-flight per slot (`run` and host `act` share one promise; a `retry` joins only its own request: behind another request it waits for that one to settle, then sends its original request and key); `valid()` just before delivery (release or generation change → `AbortError`; a sent write still completes); `retry` is recursively wrapped in the same control (a `retry` held after release or generation change is not sent and gives `AbortError`).
  - Tests: `action.test.tsx` (two panes included); host side `module-host.test.tsx`.

## Host entry and shared helpers

- Root `usePlatform()` narrows the same runtime value to the menu surface `MenuPlatform` (a `Pick` in `platform.tsx`). When a menu needs a `HostPlatform` field, promote that field to `MenuPlatform`; never grant host import. `adapter` stays on the menu surface (console and audit ports, my-activity session generation).
- `useSavedViews.tsx` — host saved-view hook (`@ap/kernel/host`, §21), the single gateway for shell store writes. Keep the write lifecycle and selected-version policy here; the hook JSDoc defines the behavior. `update` forwards a raw patch and `expectedVersion`; `saveToSelected` captures applied conditions and keeps the stored fields and page keys the menu does not support, plus an unchanged relative period (`overwritePatch` in `restore.ts`). Test: `__tests__/useSavedViews.test.tsx`.
- Copy rule: [components §23](../../../docs/contract/components.md#23-design-tokens), #2174.

## Verification

App integration tests (`@ap/platform-web`) verify Registry and URL with real menus.
