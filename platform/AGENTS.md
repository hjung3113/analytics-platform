# platform/ — built-in feature consumers

One-level `platform/<feature>/` packages assemble the built-in home, activity, notice, administration and platform feature (VOC, survey, task, finding) menus. They are Consumer-tier packages, never SDK packages ([ADR-0097](../docs/adr/0097-platform-features-and-role-based-names.md); placement authority: [platform-packages §3](../docs/integration/platform-packages.md)). Domain-system consumers stay at `menus/<system>/<group>/` ([rules](../menus/AGENTS.md)).

## Placement and wiring

- Read each feature's space only from `GROUPS`. Directory placement does not determine space: null-space and named-space features coexist here. Check group ownership and duplicates across both consumer roots.
- Declare only `manifests` here. Reusable screen/bridge runtime lives in `apps/feature-screens`, `packages/adapters/feature-bridge`, `packages/feature-ui` and `packages/feature-shared`; consume their permitted public entry points. The `featureBridgeMenuPreset` ESLint preset enforces the exact bridge exceptions.
- SDK packages must not import either consumer root. The dependency direction stays `contracts → ui/kernel → components → shell → apps`; these consumers sit on the app side.
- App wiring uses the shared marker regions in `menus.ts`, `style.css`, app `package.json` and `dev/mock-assembly.tsx`. Match actual imports with their spreads; never derive bindings from package names (`@ap/menu-dashboard` uses `dashboard`, `@ap/menu-feature-admin` uses `featureAdmin`).
- Add the `GROUPS` row before `pnpm gen:menu <group> --platform …`. Null-space groups use this root automatically. Keep an explicit `/platform/<feature>/` CODEOWNERS entry. The package rules in [menus/AGENTS.md](../menus/AGENTS.md) (public exports, mock boundaries, versions, CHANGELOG) also apply here.

## Screens

Before adding or changing a screen, read and follow the [`ap-sdk-consumer`](../.agents/skills/ap-sdk-consumer/SKILL.md) skill. It has the steps and the intent table for finding SDK pieces that already exist.

## Runtime identities and URLs (ADR-0097/0100/0110)

- Group IDs: `dashboard`, `voc`, `findings`, `tasks`, `integration`, `surveys`, `flowSettings` (업무 흐름 `설정` group), `access` (운영 콘솔 `권한` group), `systems` (운영 콘솔 `시스템` group).
- Menu IDs are the former `fo-*` IDs without the prefix, except `survey-management` and `permission-request-review` (the personal menus keep `surveys` and `permission-requests`).
- Canonical URLs: 업무 흐름 menus live in the `flow` space at `/flow/<menu id>`. 운영 콘솔 (`operations` space) holds only 플랫폼 관리 (`admin`), 권한 (`access`) and 시스템 (`systems`), at `/operations/<menu id>` (ADR-0093). No old `/feedbackops/…` paths or aliases exist; check values in `apps/platform-web/src/__tests__/links/canonical-paths.test.ts` and the Registry.
- `my-tasks` is declared by `@ap/menu-tasks` in the global `myActivity` group (`/my-tasks`, F only). The app composition (`menus.ts`) orders the 내 활동 entries.

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


| Package | Folder | Group |
| --- | --- | --- |
| `@ap/menu-home` | `platform/home` | `overview` |
| `@ap/menu-notice-voc` | `platform/notice-voc` | `noticeVoc` |
| `@ap/menu-my-activity` | `platform/my-activity` | `myActivity` · `noticeVoc` |
| `@ap/menu-dashboard` | `platform/dashboard` | `dashboard` |
| `@ap/menu-voc` | `platform/voc` | `voc` |
| `@ap/menu-findings` | `platform/findings` | `findings` |
| `@ap/menu-integration` | `platform/integration` | `integration` |
| `@ap/menu-surveys` | `platform/surveys` | `surveys` |
| `@ap/menu-feature-admin` | `platform/feature-admin` | `flowSettings` |
| `@ap/menu-tasks` | `platform/tasks` | `tasks` |
| `@ap/menu-admin` | `platform/admin` | `admin` |
| `@ap/menu-access` | `platform/access` | `access` |
| `@ap/menu-systems` | `platform/systems` | `systems` |
| `@ap/menu-improvement-items` | `platform/improvement-items` | `improvementItems` |

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

- FeatureDashboard (업무 흐름 `대시보드`, `/flow/dashboard`) lifts `DashboardScreen` via `@ap/feature-screens/operator-screens/dashboard`.
- Page keys `managedSystem` and `returnTo` (carry set `features` `pageKeys`; `returnTo` is the return-line information, carried only). A wrong (non-UUID or empty) `managedSystem` is rejected and preserved by `RejectedPage` from `@ap/feature-bridge` before mount, with no request. Header action `새로고침` (ko/en).
- The sidebar `시스템` selector is the `@ap/feature-bridge/scope-control` slot.

### `@ap/menu-voc`

- 업무 흐름 `VOC 처리` group: `VOC 처리함` (`/flow/inbox`), `분류` (`/flow/triage`), `반복 VOC` (`/flow/clusters`), lifting `InboxScreen`, `TriageScreen`, `ClusterListScreen` via `operator-screens/voc-inbox|voc-triage|voc-clusters`.
- Page keys (`focus`, `managedSystem`, …) and the carry-only `returnTo` equal the `@ap/feature-bridge` route tables `inboxRoute`, `triageRoute`, `clustersRoute`. Clusters reads screen `managedSystem=all` as no scope and does not store it.
- Detail drawing:
  - Inbox draws VOC detail (`useVocDetailParts` from the `voc-detail` entry) for `focus` into the shell detail slot `DetailDrawer`, inside `FeatureBridge`.
  - Clusters draws Cluster detail (`useClusterDetailParts`) in the same `DetailDrawer`.
  - Both pass `renderDetail` as always `undefined`.
  - Triage's selection panel stays inside the screen.
- Before mount, check address values with `isVocSearchValueValid` (`voc-search` entry; Clusters: `isVocClustersSearchValueValid` from `voc-clusters`); reject and preserve wrong values (`focus` must be a UUID) with the `값 지우기` warning and make no feature request (ADR-0071 decision 9, 06 §6.4).

### `@ap/menu-findings`

- 업무 흐름 `Finding` group: `전체 Finding` (`/flow/findings`, group primary) and `근거` (`/flow/evidence`), lifting `FindingsScreen` and `EvidenceScreen` via `operator-screens/findings|evidence`. Page keys equal `findingsRoute`, `evidenceRoute` plus `returnTo`.
- Evidence draws the screen-supplied parts (selected by `focus`) in place with `FeatureDetailDrawer`; closing goes through the screen (`requestClose`).
- Findings draws detail for `focus` (`useFindingDetailParts`, `finding-detail` entry) with `FeatureDetailDrawer` in the shell detail slot, inside `FeatureBridge`. The screen gets `renderDetail` always `undefined` (even its rejected and empty list states draw no detail). Close and not-found buttons clear `focus`.
- Check address values with `isFindingsSearchValueValid` (`findings-search` entry) before mount; reject and preserve wrong values.

### `@ap/menu-integration`

- 업무 흐름 `연동` group: `연동 대시보드` (`/flow/integration`, group primary), `연결 관계` (`/flow/entity-links`), `커버리지` (`/flow/coverage`), lifting `IntegrationDashboardScreen`, `LinksScreen`, `CoverageScreen` via `operator-screens/integration-dashboard|entity-links|coverage`. Page keys equal `integrationDashboardRoute`, `entityLinksRoute`, `coverageRoute` plus `returnTo`. The sidebar has no feature `연동 › Findings` row.
- The dashboard draws screen-supplied parts (selected by `focus`) in place with `FeatureDetailDrawer`, closes through the screen (`requestClose`), and passes `renderRecoveryRequestAccess`. Coverage and 연결 관계 have no detail.
- All three check address values with the `integration-search` entry's functions before mount; reject and preserve wrong values. 연결 관계 `managedSystem` is any string, as in the feature schema.

### `@ap/menu-surveys`

- 업무 흐름 `설문 운영` group: `설문 관리` (`/flow/survey-management`, group primary) plus sidebar-less `navHidden` children with `parent: survey-management`: `설문 빌더` (`/flow/survey-builder/:surveyId`), `설문 결과` (`/flow/survey-results/:surveyId`), `설문 후속 조치` (`/flow/survey-follow-up/:surveyId`).
- Lifts `SurveysScreen`, `useSurveyDetailParts`, `SurveyBuilderScreen`, `SurveyResultsScreen`, `SurveyFollowUpScreen` via `operator-screens/surveys|survey-detail|survey-builder|survey-results|survey-follow-up`. Page keys equal `surveysRoute`, `surveyBuilderRoute`, `surveyResultsRoute`, `surveyFollowUpRoute` plus `returnTo`.
- List `focus` selects a Survey; the page draws it with `SurveyDetailDrawer` in `FeatureDetailDrawer` (screen `renderDetail` always `undefined`).
- A child screen whose `:surveyId` is not a UUID shows not-found with no request. Follow-up `focus` selects a response (the screen controls it, no auto-select).
- Never alias the reporter `설문` paths `/surveys` and `/surveys/:id/respond`.

### `@ap/menu-feature-admin`

- 업무 흐름 `설정` group: `시스템` (`/flow/managed-systems`, group primary), `분석 영역` (`/flow/analytics-areas`), `흐름 정책` (`/flow/settings`), lifting `ManagedSystemsAdminPage`, `AnalyticsAreasAdminPage`, `WorkspaceSettingsScreen` via `operator-screens/managed-systems|analytics-areas|settings`.
- Permission is `console:access` AND `features:access` (`additionalPermissions`); the screen's `PermissionGate` is a display hint and the backend decides.
- Page keys equal `managedSystemsRoute`, `analyticsAreasRoute`, `settingsRoute`, plus the `managedSystem` and `returnTo` the space carries. Group id `flowSettings` turns off the `ScopeControl` `시스템` selector, and the screen ignores a carried `managedSystem`. Analytics Area's own filter is `system`.
- Selection is `focus` (no auto-select; detail in `FeatureDetailDrawer`). Settings `section=coverage` scrolls to the coverage section. A screen draws no title row when `hostOwnsTitle`.
- Never alias `/admin/*` (owned by 플랫폼 관리).

### `@ap/menu-tasks`

- 업무 흐름 `Task` group: `Task 요청` (`/flow/task-requests`), `Task 보드` (`/flow/tasks`, group primary), `마일스톤` (`/flow/milestones`), and sidebar-less `Task 목록` (`/flow/task-list`, `navHidden`, parent `Task 보드` so the shell marks `Task 보드` current). Global `내 활동` adds FeatureMyTasks (`내 Task`, `/my-tasks`, permission F); its system scope is the page-filter-area Managed System selector `ListScope` from `@ap/feature-bridge`.
- Lifts `TaskRequestsScreen`, `TaskBoardScreen`, `MilestonesScreen`, `TaskListScreen` via `operator-screens/task-requests|task-board|milestones|task-list`. Page keys equal `taskRequestsRoute`, `taskBoardRoute`, `myTasksRoute`, `milestonesRoute`, `taskListRoute` plus `returnTo`.
- The list and 내 Task draw Task detail for `focus` (`useTaskDetailParts`, `task-detail` entry) with `FeatureDetailDrawer` in the shell detail slot, inside `FeatureBridge` (`renderDetail` always `undefined`, `autoSelect={false}`).
- The board, Task 요청 and 마일스톤 draw screen-supplied parts (including Milestone creation) in place with `FeatureDetailDrawer`; closing goes through the screen (`requestClose`).
- All five pages check address values with `isTasksSearchValueValid` (`tasks-search` entry) before mount, and `focus` (the screen `param`, a request path segment) must be a UUID; reject and preserve wrong values with the `값 지우기` warning and make no feature request (ADR-0071 decision 9, 06 §6.4).

### `@ap/menu-admin`

- Screens: AccessDirectory (permission/role lookup, read-only), AuditTrail (change audit), UsageOverview, RegistryCatalog.

### `@ap/menu-access`

- 운영 콘솔 `권한` group: `권한 요청 검토` (`/operations/permission-request-review`, group primary) and `부여 목록` (`/operations/permission-grants`), lifting `PermissionRequestsScreen` and `PermissionGrantsScreen` via `operator-screens/permission-requests|permission-grants`.
- Permission is `console:access` AND `features:access` (`additionalPermissions`). `실서버 필요` under mock.

### `@ap/menu-systems`

- 운영 콘솔 `시스템` group: `시스템` (`/operations/systems`, group primary, read-only). One table shows, per business system (space), the tracked Managed System and its link state (`연결됨` / `연결 끊김` when the space withdrew its declaration), the «플랫폼» system, and systems registered by hand without a space (marked `플랫폼 밖`).
- Data comes from the bridge's `useSystemsOverview` (`GET /managed-systems/space-links` and `GET /managed-systems?include_archived=true`, both read to the end by `limit`/`offset`, including names of archived disconnected systems). Row computation is the pure `system-rows.ts`.
- Permission is `console:access` only; a link grants no permission (ADR-0068 decision 1). No page keys. `실서버 필요` under mock; no mock endpoint is registered.
- Loading, error (retry) and empty states use `LoadingBlock` and `StateMessage` (ADR-0110 decision 5).

### `@ap/menu-improvement-items`

- Global top-level group `개선 아이템`: `/improvement-items` (primary) and `/improvement-items/:itemId` (`navHidden`, parent `improvement-items`, page key `returnTo`). Screens: list, detail (effect-check section: `beforeAfterPeriods` comparison link and judgment save), create drawer (ADR-0106).
- Page keys: `view`, `q`, `filter` (repeat, hidden), `page`, `sort`, `focus`, `origin`, `originPage` (hidden; origin page keys as JSON, kept separate from the create control keys).
- Permission: read `platform:view`, write `improvement:manage`; the screen's `can()` is a hint and the server action decides.
- Use the menu's own query/action transport (`endpoints.ts`), not the feature REST bridge. Read Quest references through the menu reads `improvement.quest` and `improvement.questSearch`.
- Subpaths: `./home-todo-slot` (home owned-count card; imported only by the app's `src/main.tsx`), `./analysis-actions` (analysis-header `⋯` entry; the app injects it as the `analysisActions` slot in `src/main.tsx`), `./mock` (mock responses).
