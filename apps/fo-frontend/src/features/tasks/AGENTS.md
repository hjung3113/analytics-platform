# Tasks Feature Agent Guide

## Ownership

Tasks owns frontend route composition for Task Requests, Tasks, Milestones, Managed System-scoped task views, backlog, board, and task detail panels. Work Initiative grouping is future work and has no route yet.

It does not own reporter-facing VOC status or source evidence visibility rules.

## Route Boundary

- Owns `/tasks`, a single view-switching route (`?view=requests|backlog|board|my|inbox|milestones`; see `apps/fo-frontend/src/routes/_authed/tasks.tsx`). There is no `/tasks/initiatives` route.
- Task Requests are Tasks intake routes, not top-level routes.
- Managed Systems are scope/defaulting surfaces; they do not create per-Managed-System route trees.

## Invariants

- Task Request protects the backlog from unreviewed execution candidates.
- Task status and reporter-facing VOC status are separate.
- Released work creates a reporter-facing review candidate when required; it does not automatically resolve VOC.
- Standalone Tasks are valid and do not require source evidence.
- Task Board is execution work only; VOC owner assignment is not Task assignee/kanban assignment.
- Task Request review may be Admin or same Managed System Developer; self-approval is allowed and audited.

## Rules

- Use compact Linear-style list/detail and board behavior.
- Show evidence/source panels only when linked context exists and is visible or safely summarized.
- Managed System filters refine lists and defaults; they do not duplicate VOC, Survey, Task, or Integration navigation.
- Task creation from Finding must preserve pending, error, and linked context states.
- The Task Request hooks (`routes/task-requests/use*.ts`, `TaskRequestLinkedTask`) notify, navigate and link through the host seam (`lib/host/host-seam`), read through `client.ts` modules, and import no router, `sonner` or `@/lib/api` barrel (walked in `packages/fo-bridge` `fo-entry-graph.test.ts`).
- Task Request review reads Finding source defaults through `features/findings/hooks/useFindingDetail` (the bridge-mounted read; the rule is owned by `features/findings/AGENTS.md`).

## Key files

- `apps/fo-frontend/src/routes/_authed/tasks.tsx` — selects the Task view from URL state; the requests view renders `TaskRequestsRoute bindUrl`.
- `apps/fo-frontend/src/features/tasks/routes/task-search.ts` — router-free `/tasks` search schema, `validateTasksSearch` and `isTasksSearchValueValid` (the route file re-exports the first two; the platform bridge entry `operator-screens/tasks-search` exposes the last).
- `apps/fo-frontend/src/features/tasks/routes/TaskListScreen.tsx` — bridge-safe backlog / 내 Task list body (entry `operator-screens/task-list`): URL through the host seam (`useHostSearchWriter`), the host passes `renderDetail`; it never imports the Task detail tree.
- `apps/fo-frontend/src/features/tasks/routes/TaskListRoute.tsx` — standalone composition: `TaskListScreen` under a seam whose `useSearch` is the route props and whose `useNavigate` keeps TanStack functional `search` (boolean `overdue`, carried keys), with `TaskDetailPanel` as `renderDetail`.
- `apps/fo-frontend/src/features/tasks/routes/TaskBoardScreen.tsx` — bridge-safe Task board body (columns, DnD, status transition, keyboard focus, group-by/filter state, summary strip; entry `operator-screens/task-board`): `q`/`managedSystem`/`param`/`public_update` read and written through the host seam, 「Task Request 검토」 through `canLink`/`HostLink`, notices through `notifyError`; the Task detail comes from the host's `renderDetail`, rendered in place (never `null`: a `null` registrant would hide the host's drawer); it never imports the Task detail tree.
- `apps/fo-frontend/src/features/tasks/routes/TaskBoardRoute.tsx` — standalone composition: `TaskBoardScreen` under a seam whose `useSearch` is the route props and whose `useNavigate` reproduces the router writes (select literal push, close/link-missing/q replace, chip push, carried keys kept), with one standalone detail-slot registrant (`TaskDetailPanel`, `view="board"`) as `renderDetail`.
- `apps/fo-frontend/src/features/tasks/components/task-board/` — Task board cards, columns, and grouping
  control; the route retains URL state and DnD sensors.
- `apps/fo-frontend/src/features/tasks/hooks/useTaskBoardData.ts` — board reads: one paged query per
  status column (`['tasks','board',{…,status}]`), the open-set read for other groupings, and the
  three summary totals.
- `apps/fo-frontend/src/features/tasks/hooks/useTaskStatusTransition.ts` — per-column optimistic Task
  status writes (source/target pages and totals), per-invocation rollback, and stale-write handling.
- `apps/fo-frontend/src/features/tasks/hooks/useTaskPanelSelection.ts` — shared Task list and Task Request
  selection reconciliation, panel close, auto-selection (`autoSelect`, default on; off when a host owns the detail), and missing-link state; callers own detail queries,
  scope/filter checks, and focus return.
- `apps/fo-frontend/src/features/tasks/hooks/useTaskBoardKeyboardFocus.ts` — route-lifetime keyboard
  focus recovery and generation invalidation; status cache writes stay in `useTaskStatusTransition`.
- `apps/fo-frontend/src/features/tasks/adapters/taskDisplayAdapters.ts` — shared Managed System name
  lookup, assignment resolution, and priority-to-severity projection.
- `apps/fo-frontend/src/features/tasks/routes/TaskRequestsScreen.tsx` — bridge-safe Task Request queue (entry `operator-screens/task-requests`): `param`, `reviewer`, `reviewerTeam` and `managedSystem` read and written through the host seam (`useHostSearchWriter`); the panel is handed to the host as `TaskRequestPanelParts` through `renderDetail`, rendered in place (beside the `ListShell`, never as its `detailPanel`, which would register the host's node as slot content); `autoSelect` false leaves the selection to the URL `param`.
- `apps/fo-frontend/src/features/tasks/routes/TaskRequestsRoute.tsx` — the standalone composition: a route-local seam (`useSearch` from the props or, without `onReviewerChange`/`bindUrl`, local reviewer state; `useNavigate` diffs the href into `onReviewerChange`/`onSelectionChange` or, with `bindUrl`, writes TanStack's functional `search` keeping unknown keys) and one registrant in the detail slot framing the parts. `bindUrl` is passed only by `routes/_authed/tasks.tsx`; without it TanStack `useNavigate()` is never called (router-less tests).
- `apps/fo-frontend/src/features/tasks/routes/task-requests/TaskRequestPanelParts.tsx` — the panel as `ClosableDetailParts` (`buildTaskRequestPanelParts`, `TaskRequestPanelBody`, `TaskRequestPanelFrame`, copy link through the seam's `absoluteHref`); `TaskRequestPanel.tsx` is the frame over it. Tests that stub the panel replace `TaskRequestPanelBody` and `buildTaskRequestPanelParts` in this module.
- `apps/fo-frontend/src/features/tasks/routes/MilestonesScreen.tsx` — bridge-safe Milestone list (status tabs, list-state branches, the three dirty guards; platform ADR-0071, entry `operator-screens/milestones`): `param`/`managedSystem` read and written through the host seam, the detail and create panels handed to the host as parts through `renderDetail`, rendered in place.
- `apps/fo-frontend/src/features/tasks/routes/MilestonesRoute.tsx` — the standalone composition: feeds `MilestonesScreen` the props-driven URL through TanStack `useNavigate` and registers the standalone frame for the parts in the detail slot.
- `apps/fo-frontend/src/features/tasks/routes/task-requests/TaskRequestPanel.tsx` — Task Request panel
  composition, exactly-once decision callback, and dialog lifetime.
- `apps/fo-frontend/src/features/tasks/routes/task-requests/useTaskRequestPanelController.ts` — source Area
  defaults and canonical outcome reconciliation; section components render the view.
- `apps/fo-frontend/src/features/findings/hooks/useFindingDetail.ts` — bridge-safe Finding source read used for Task Request defaults.
- `apps/fo-frontend/src/features/tasks/components/TaskDetailParts.tsx` — bridge-safe Task detail parts (`useTaskDetailParts`, entry `operator-screens/task-detail`): reads, sections, links, notices and title go through the host seam.
- `apps/fo-frontend/src/features/tasks/components/TaskDetailPanel.tsx` — standalone frame around the Task detail parts.
- `apps/fo-frontend/src/features/tasks/components/MilestoneRow.tsx` — Milestone list row.
- `apps/fo-frontend/src/features/tasks/components/MilestoneDetailPanel.tsx` —
  compatibility exports for the Milestone panels.
- `apps/fo-frontend/src/features/tasks/components/milestone-detail/useMilestoneDetailParts.tsx` and `useMilestoneCreateParts.tsx` — the Milestone detail and create panels as `ClosableDetailParts` (`requestClose` carries the dirty guard); `MilestoneDetailPanel` / `MilestoneCreatePanel` are the standalone frames over them. The Finding source action goes through the host (`canLink`, `useHostNavigate`).
- `apps/fo-frontend/src/features/tasks/components/milestone-detail/` — Milestone
  panels, detail content, task row, and title/status edit hooks.
- `apps/fo-frontend/src/features/tasks/components/milestone-detail/useMilestoneChildTasks.ts` — one
  error-suppressed child Task projection shared by section rows and navigation count.
- `apps/fo-frontend/src/features/tasks/components/milestone-detail/MilestoneTitlePresenter.tsx` and
  `MilestonePropertiesPresenter.tsx` — render the title/property surfaces around the parent's
  coordinated edit hooks.
- `apps/fo-frontend/src/features/tasks/components/MilestoneStatusBadge.tsx` — Milestone status labels and badge styles.
- `packages/fo-ui/src/badges/InternalTaskBadge.tsx` — shared internal Task status labels and badge styles.
- `apps/fo-frontend/src/lib/copy/permission-reasons.ts` — shared blocked copy for Task and Milestone views.

## Verification

- Test Task Request review flows, backlog/board selected detail restore, Managed System filters, linked evidence summaries, and reporter-facing status review candidates when touched.

## Close-out contract (ADR-0067; implemented)

- ADR-0067 accepts assigned-reviewer Actor/team display/edit/filter distinct from
  actual decision Actor, and Task team assignee. Personal Home requests use reviewer=me;
  full authorized review remains available and assignment grants no self-approval.
- Explicit null opts out, omission requests defaults; preserve Backlog, source links and
  server validation/audit. Do not infer member assignment from a team label.

## Survey source defaults (ADR-0064; #739/#740 pending)

Survey-derived Finding/source summaries and Task Request draft defaults contain
metadata only after cutover. Approved text requires a fresh authorized highlight
projection, never a cached summary or private response/link/audit reconstruction.
Preserve ordinary source permissions and authored Task/Task Request prose; no
bulk history rewrite is authorized. Consume the existing owning-module seams.
