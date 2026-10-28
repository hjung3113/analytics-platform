# Home Feature Agent Guide

#597: paths below describe semantic screen intents. Runtime registration belongs to platform menus and `@ap/fo-bridge`; standalone routes and `*Route` compositions are retired. Adapters under `src/test` are test-only.

## Ownership

Home owns the landing action queue surface for the current actor, workspace, and Managed System scope.

Home is not a chart-only dashboard and must not duplicate source-system workflow logic.

## Route Boundary

- Owns `/home`. The standalone `HomeScreen` is retired; its retained dashboard body is `DashboardScreen`, which the platform bridge mounts through `src/operator-screens/dashboard` (platform ADR-0071, ADR-0081).
- Standalone `/` and login redirects are retired; the platform owns entry and identity.
- May deep-link into VOC, Tasks, Surveys, Integration, or Admin routes with action intent.
- Must preserve AppShell and permission-aware summaries for direct route access.

## Rules

- Prioritize backend-provided next actions over decorative metrics.
- Show only queues and summaries allowed for the actor.
- Include source object type, source object id, target route, selected object, and action intent in next-action links.

## Key files

- `apps/fo-frontend/src/test/screen-host/routes/_authed/home.tsx` — Home route and URL state.
- `apps/fo-frontend/src/features/home/DashboardScreen.tsx` — bridge-safe dashboard body (queues, assigned work, coverage, open permission requests, answerable surveys, reporter layout) and `refreshDashboard(client, managedSystemId)`; props `managedSystemId` only, no title/tabs/head buttons/recovery queue (recovery queue targets belong to 연동, #763). Needs a `HostSeamProvider`; links via `HostLink`, toasts via the seam; reads through `useMeBridge` and the direct `lib/api/*` modules, never the `@/lib/api` barrel. Its import graph is pinned by `packages/adapters/fo-bridge/src/fo-entry-graph.test.ts`. `DashboardBody` (also takes the standalone `recoveryQueue`) is not exported through the entry. `href.ts` is the retained scope-preserving link helper; the legacy helper survives only in test support.
- `apps/fo-frontend/src/features/home/AnswerableSurveysSection.tsx` — the survey panel body over a link prop (default `HostLink`); its router-bound test adapter is under `src/test/host-adapters`.
- `apps/fo-frontend/src/features/home/InboxPanel.tsx` — notification inbox list, filters, and empty/error states. Also mounted by the platform bridge (`src/global-screens`, platform ADR-0071) through the `lib/host` seam. `variant="recent"` is the platform bell popover body (platform ADR-0071): latest 10, no filter, no load-more.
- `apps/fo-frontend/src/features/home/permission-requests/PermissionRequestsScreen.tsx` — requester page (request form, own requests with status, withdraw), mounted only by the platform bridge (`src/global-screens`, platform ADR-0071), no FO route; admin review stays `features/admin/permissions`. Its calls live in `lib/api/permission-requests.ts` (bridge-safe, `permissions.ts` re-exports them).
- `apps/fo-frontend/src/features/home/todo/HomeTodoPanel.tsx` — the platform home `내 할 일` (surveys to answer, my VOCs with an unread public update, permission requests); bridge-only (`src/global-screens`), no FeedbackOps route, platform ADR-0070 decision 8.
- `apps/fo-frontend/src/lib/copy/home.ts` — Home, queue, coverage, and notification inbox copy. The platform bridge loads `InboxPanel` lazily through its own entry `global-screens/inbox-panel` (#820), not `global-screens/core`; the platform `check:lazy-chunks` marker (the value of `HOME_INBOX_COPY.filterLabel`) fails if the panel leaks back into the main chunk. Anything `core` reaches still lands in the main chunk, so copy for a lazily loaded bridge screen goes in its own module (`lib/copy/permission-requests.ts`, `lib/copy/home-todo.ts`; #657 hit this twice).

## Verification

- Test Role Level-specific Home content, Managed System filtering, permission-limited summaries, and deep links when touched.

## Permission close-out contract

- ADR-0066 accepts owner-scoped Permission Request detail from Home open-request rows (`OwnerPermissionRequestDialog`): same-ID pending edit, needs_more_info supplementation with the latest Admin question, and requester-only `요청 철회`.
- Render server allowed actions/scope candidates and send expected_revision. Preserve unsaved input and focus on stale/error responses; form closing is not withdrawal.
- Closing or Escape never sends withdrawal. Reopening waits for a fresh selected read; stale reconciliation preserves the draft and requires explicit confirmation against latest values.
- Withdrawal removes only the affected open row; refresh relevant mine/check/scope queries. Requester detail must not expose Admin risk/deny internals or email.

## Close-out contract (ADR-0067; 56-I implemented)

- ADR-0067's recovery item UI is consumed through Integration's explicit public
  `features/integration/public.ts` seam; Home includes only personally actionable items,
  scope-wide totals remain operational.
- Personal pending Task Requests use actual assigned-reviewer `me` filtering, not all pending
  rows. Do not infer team membership. Show last successful server computation time/stale state.
- Recovery registers `PageShell.detailPanel` only on Dashboard; Inbox/unmount unregisters
  the slot and retains URL selection. Late PATCH completion only refreshes caches.
