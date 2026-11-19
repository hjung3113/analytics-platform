# platform/ — built-in feature consumers

One-level `platform/<feature>/` packages assemble the built-in home, activity, notice, administration and platform feature (VOC, survey, task, finding) menus. They are Consumer-tier packages, never SDK packages ([ADR-0097](../docs/adr/0097-platform-features-and-role-based-names.md); placement authority: [platform-packages §3](../docs/integration/platform-packages.md)). Domain-system consumers stay at `menus/<system>/<group>/` ([rules](../menus/AGENTS.md)).

## Placement and wiring

- Read each feature's space only from `GROUPS`. Directory placement does not determine space: null-space and named-space features coexist here. Check group ownership and duplicates across both consumer roots.
- Declare only `manifests` here. Reusable screen/bridge runtime lives in `packages/feature/screens`, `packages/feature/bridge` and `packages/feature/shared`; consume their permitted public entry points. The `featureBridgeMenuPreset` ESLint preset enforces the exact bridge exceptions.
- App wiring uses the shared marker regions in `menus.ts`, `style.css`, app `package.json` and `dev/mock-assembly.tsx`. Match actual imports with their spreads; never derive bindings from package names (`@ap/menu-dashboard` uses `dashboard`, `@ap/menu-feature-admin` uses `featureAdmin`).
- Add the `GROUPS` row before `pnpm gen:menu <group> --platform …`. Null-space groups use this root automatically. Keep an explicit `/platform/<feature>/` CODEOWNERS entry. The package rules in [menus/AGENTS.md](../menus/AGENTS.md) (public exports, mock boundaries, versions, CHANGELOG) also apply here.

## Runtime identities and URLs (ADR-0097/0100/0110)

- Menu IDs are the former `fo-*` IDs without the prefix, except `survey-management` and `permission-request-review` (the personal menus keep `surveys` and `permission-requests`).
- Canonical URLs: 업무 흐름 menus live in the `flow` space at `/flow/<menu id>`. No old `/feedbackops/…` paths or aliases exist.

## Common rules for bridge menus

Every operator-screen menu below follows these unless its entry says otherwise.

- Lift the feature screen through the bridge entry `@ap/feature-screens/operator-screens/<name>`; permission is `features:access`; page keys equal the route tables in `@ap/feature-bridge` plus `returnTo` (carry-only, hand-over information; 06 §22).
- Validate address values before mount with the feature's search-schema check; reject and preserve a wrong value with a `값 지우기` warning and make no feature request.
- Under the mock adapter the screen shows `실서버 필요`.
- Pass `renderDetail` as always `undefined` when the page draws the detail itself in the shell detail slot (so the screen's `ListShell` never draws detail outside `FeatureBridge`); when the screen supplies detail parts through `renderDetail`, draw them in place with `FeatureDetailDrawer` and route closing through the screen (`requestClose`).
- ADR-0081 is the reason for the bridge shape.

## Packages

Two pairs of names look alike but are different features (folder names stay as they are):

- `voc` = 업무 흐름 `VOC 처리` (operator inbox, triage, clusters); `notice-voc` = the `소통` notices and FAQ places (the user-side VOC and surveys of `소통` are declared by `my-activity`).
- `admin` = 운영 콘솔 `플랫폼 관리` (access directory, audit, usage, registry catalog); `feature-admin` = 업무 흐름 `설정` (managed systems, analytics areas, flow policy).

### `@ap/menu-home`

- Screen: OperationsHome. `./launcher` is private app configuration, imported only by `apps/platform-web/src/menus.ts`; the root exports manifests only.
- Home `내 할 일` arrives only through the Kernel slot `homeTodo`. Home imports neither the feature package set (`tooling/eslint/src/feature-packages.js`) nor any other menu.

### `@ap/menu-notice-voc`

- Declares the notice and FAQ places of the `소통` group (every logged-in user, no space, ADR-0110). The same group's VOC and surveys are declared by `@ap/menu-my-activity`; the personal Task list by `@ap/menu-tasks`.
- Notices: list plus reading pane; ended notices sit in a collapsed «종료됨» group. Reading needs `notice:view`; create/edit/delete show only with `console:access` and the server decides. Use only the Kernel adapter ports `listNotices`, `saveNotice`, `deleteNotice` (ADR-0098). Page key `focus`; an unknown value is rejected and preserved with a `값 지우기` warning. The real server returns only global (`scopeId: null`) notices.
- Faq: one «준비 중» notice without content, plus a VOC link when `voc` can be opened.

### `@ap/menu-my-activity`

- It is a bridge menu: the session runtime (QueryClient, `FeatureBridge`, `hostLinks`, `feature-api`, slot values) is owned by `@ap/feature-bridge`; this package imports its root and the exact feature entries (`@ap/feature-screens/global-screens`, `/core`). This is the package-boundary rule 8 exception, and the other feature consumers under `platform/` follow it too.
- Notifications: feature `InboxPanel` lifted through `@ap/feature-screens/global-screens`; `실서버 필요` under mock (ADR-0071). Slot `notifications-slot` feeds the rail bell and platform-menu badge.
- MyVoc / VocDetail (소통 › VOC): feature `PublicVocListScreen` / `VocReadingPane`; permission is Kernel `voc:view`.
  - `/voc` lists in-scope VOCs (`GET /vocs/public`); page keys `mine`, `system`, `q`, plus a reading pane keyed by `focus` on the same screen. The old `status` and `sort` keys are rejected and preserved (warning and `값 지우기`); reopen when the list API supports them.
  - `/voc/:vocId` is `navHidden` under `VOC`.
  - The reading pane first asks the public detail (`/vocs/public/:id`) whether the caller owns the VOC. `mine` renders `ReporterVocDetail` (conversation and Reporter Reply input); otherwise `PublicVocDetail` renders the public part only. Never call reporter or operator paths for someone else's VOC.
  - Only users with `canOpen('inbox')` get the «업무 흐름에서 처리» link.
- Surveys: feature `SurveyParticipationScreen` / `RespondSurveyScreen`; `/survey/:surveyId/respond` (the old `/surveys…` is an alias) is `navHidden` under `설문`.
- Permission requests: feature `PermissionRequestsScreen` (request, own-request status, withdraw); `실서버 필요` under mock; permission `platform:view` (ADR-0070).
- Home `내 할 일`: slot `home-todo-slot`, feature `HomeTodoPanel`. Render only when the session is `ready`; under mock, before the session and after a 401 render nothing.

### `@ap/menu-dashboard`

- Page keys `managedSystem` and `returnTo` (carry set `features` `pageKeys`; `returnTo` is the return-line information, carried only). A wrong (non-UUID or empty) `managedSystem` is rejected and preserved by `RejectedPage` from `@ap/feature-bridge` before mount, with no request. Header action `새로고침` (ko/en).
- The sidebar `시스템` selector is the `@ap/feature-bridge/scope-control` slot.

### `@ap/menu-voc`

- Page keys (`focus`, `managedSystem`, …) and the carry-only `returnTo` equal the `@ap/feature-bridge` route tables `inboxRoute`, `triageRoute`, `clustersRoute`. Clusters reads screen `managedSystem=all` as no scope and does not store it.
- Detail drawing:
  - Triage's selection panel stays inside the screen.
- Before mount, check address values with `isVocSearchValueValid` (`voc-search` entry; Clusters: `isVocClustersSearchValueValid` from `voc-clusters`); reject and preserve wrong values (`focus` must be a UUID) with the `값 지우기` warning and make no feature request (ADR-0071 decision 9, 06 §6.4).

### `@ap/menu-findings`

- Evidence draws the screen-supplied parts (selected by `focus`) in place with `FeatureDetailDrawer`; closing goes through the screen (`requestClose`).
- Findings draws detail for `focus` (`useFindingDetailParts`, `finding-detail` entry) with `FeatureDetailDrawer` in the shell detail slot, inside `FeatureBridge`. The screen gets `renderDetail` always `undefined` (even its rejected and empty list states draw no detail). Close and not-found buttons clear `focus`.
- Check address values with `isFindingsSearchValueValid` (`findings-search` entry) before mount; reject and preserve wrong values.

### `@ap/menu-integration`

- The dashboard draws screen-supplied parts (selected by `focus`) in place with `FeatureDetailDrawer`, closes through the screen (`requestClose`), and passes `renderRecoveryRequestAccess`. Coverage and 연결 관계 have no detail.
- All three check address values with the `integration-search` entry's functions before mount; reject and preserve wrong values. 연결 관계 `managedSystem` is any string, as in the feature schema.

### `@ap/menu-surveys`

- List `focus` selects a Survey; the page draws it with `SurveyDetailDrawer` in `FeatureDetailDrawer` (screen `renderDetail` always `undefined`).
- A child screen whose `:surveyId` is not a UUID shows not-found with no request. Follow-up `focus` selects a response (the screen controls it, no auto-select).
- Never alias the reporter `설문` paths `/surveys` and `/surveys/:id/respond`.

### `@ap/menu-feature-admin`

- The screen's `PermissionGate` is a display hint and the backend decides.
- Page keys equal `managedSystemsRoute`, `analyticsAreasRoute`, `settingsRoute`, plus the `managedSystem` and `returnTo` the space carries. Group id `flowSettings` turns off the `ScopeControl` `시스템` selector, and the screen ignores a carried `managedSystem`. Analytics Area's own filter is `system`.
- Selection is `focus` (no auto-select; detail in `FeatureDetailDrawer`). Settings `section=coverage` scrolls to the coverage section. A screen draws no title row when `hostOwnsTitle`.
- Never alias `/admin/*` (owned by 플랫폼 관리).

### `@ap/menu-tasks`

- The list and 내 Task draw Task detail for `focus` (`useTaskDetailParts`, `task-detail` entry) with `FeatureDetailDrawer` in the shell detail slot, inside `FeatureBridge` (`renderDetail` always `undefined`, `autoSelect={false}`).
- The board, Task 요청 and 마일스톤 draw screen-supplied parts (including Milestone creation) in place with `FeatureDetailDrawer`; closing goes through the screen (`requestClose`).
- All five pages check address values with `isTasksSearchValueValid` (`tasks-search` entry) before mount, and `focus` (the screen `param`, a request path segment) must be a UUID; reject and preserve wrong values with the `값 지우기` warning and make no feature request (ADR-0071 decision 9, 06 §6.4).

### `@ap/menu-systems`

- 운영 콘솔 `시스템` group: `시스템` (`/operations/systems`, group primary, read-only). One table shows, per business system (space), the tracked Managed System and its link state (`연결됨` / `연결 끊김` when the space withdrew its declaration), the «플랫폼» system, and systems registered by hand without a space (marked `플랫폼 밖`).
- Loading, error (retry) and empty states use `LoadingBlock` and `StateMessage` (ADR-0110 decision 5).

### `@ap/menu-improvement-items`

- Permission: read `platform:view`, write `improvement:manage`; the screen's `can()` is a hint and the server action decides.
- Use the menu's own query/action transport (`endpoints.ts`), not the feature REST bridge. Read Quest references through the menu reads `improvement.quest` and `improvement.questSearch`.
