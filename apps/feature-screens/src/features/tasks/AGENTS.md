# Tasks Feature Agent Guide

## Ownership

Tasks owns frontend route composition for Task Requests, Tasks, Milestones, Managed System-scoped task views, backlog, board, and task detail panels. Work Initiative grouping is future work and has no route yet. It does not own reporter-facing VOC status or source evidence visibility rules.

## Route Boundary

- Owns `/tasks`, a single view-switching route (`?view=requests|backlog|board|my|inbox|milestones`; see `test/screen-host/routes/_authed/tasks.tsx`). There is no `/tasks/initiatives` route.
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
- Task Request hooks (`routes/task-requests/use*.ts`, `TaskRequestLinkedTask`) notify, navigate and link through the host seam (`lib/host/host-seam`), read through `client.ts` modules, and import no router, `sonner` or `@/lib/api` barrel (walked in `packages/adapters/feature-bridge` `feature-entry-graph.test.ts`).
- Task Request review reads Finding source defaults through `features/findings/hooks/useFindingDetail` (the bridge-mounted read; rule owned by `features/findings/AGENTS.md`).

## Key files

Paths are relative to `apps/feature-screens/src/` (one `packages/` entry is absolute).

Default shape, stated once: screens under `features/tasks` are bridge-safe bodies — URL reads/writes and navigation only through the host seam (`useHostSearchWriter`, `HostLink`, `notifyError`); detail/create panels are handed to the host as parts through `renderDetail` and rendered in place; no import of the Task detail tree or any router.

Files under `test/screen-host` and `test/host-adapters` are test-only compositions and frames of those bodies.

- `test/screen-host/routes/_authed/tasks.tsx` — selects the Task view from URL state; the requests view renders `TaskRequestsRoute bindUrl`.
- `features/tasks/routes/task-search.ts` — router-free `/tasks` search schema, `validateTasksSearch`, `isTasksSearchValueValid`; the bridge entry `operator-screens/tasks-search` exposes the validators.
- `features/tasks/routes/TaskListScreen.tsx` — backlog / 내 Task list body; entry `operator-screens/task-list`.
- `test/screen-host/features/tasks/routes/TaskListRoute.tsx` — seam `useSearch` = route props; `useNavigate` keeps TanStack functional `search` (boolean `overdue`, carried keys); `TaskDetailPanel` is `renderDetail`.
- `features/tasks/routes/TaskBoardScreen.tsx` — board body (columns, DnD, status transition, keyboard focus, group-by/filter state, summary strip; entry `operator-screens/task-board`); 「Task Request 검토」 through `canLink`/`HostLink`; the host's `renderDetail` detail is rendered in place, never `null` (a `null` registrant would hide the host's drawer).
- `test/screen-host/features/tasks/routes/TaskBoardRoute.tsx` — `useNavigate` reproduces the router writes (select literal push, close/link-missing/`q` replace, chip push, carried keys kept); one standalone detail-slot registrant (`TaskDetailPanel`, `view="board"`) as `renderDetail`.
- `features/tasks/components/task-board/` — board cards, columns, grouping control; the route retains URL state and DnD sensors.
- `features/tasks/hooks/useTaskBoardData.ts` — one paged query per status column (`['tasks','board',{…,status}]`), the open-set read for other groupings, the three summary totals.
- `features/tasks/hooks/useTaskStatusTransition.ts` — per-column optimistic status writes (source/target pages and totals), per-invocation rollback, stale-write handling.
- `features/tasks/hooks/useTaskPanelSelection.ts` — selection reconciliation, panel close, auto-selection (`autoSelect`, default on; off when a host owns the detail), missing-link state; callers own detail queries, scope/filter checks and focus return.
- `features/tasks/hooks/useTaskBoardKeyboardFocus.ts` — route-lifetime keyboard focus recovery and generation invalidation; status cache writes stay in `useTaskStatusTransition`.
- `features/tasks/adapters/taskDisplayAdapters.ts` — shared Managed System name lookup, assignment resolution, priority-to-severity projection.
- `features/tasks/routes/TaskRequestsScreen.tsx` — Task Request queue; entry `operator-screens/task-requests`; `param`/`reviewer`/`reviewerTeam`/`managedSystem` through `useHostSearchWriter`; `autoSelect` false leaves the selection to the URL `param`; the panel is `TaskRequestPanelParts` beside the `ListShell` — never its `detailPanel`, which would register the host's node as slot content.
- `test/screen-host/features/tasks/routes/TaskRequestsRoute.tsx` — test-only composition with a route-local seam and one registrant framing the parts.
  - `useSearch` from the props or, without `onReviewerChange`/`bindUrl`, local reviewer state; `useNavigate` diffs the href into `onReviewerChange`/`onSelectionChange`, or with `bindUrl` writes TanStack functional `search` keeping unknown keys.
  - `bindUrl` is passed only by the test-local Tasks host; without it TanStack `useNavigate()` is never called (router-less tests).
- `features/tasks/routes/task-requests/TaskRequestPanelParts.tsx` — the panel as `ClosableDetailParts` (`buildTaskRequestPanelParts`, `TaskRequestPanelBody`, `TaskRequestPanelFrame`, copy link through the seam's `absoluteHref`); `TaskRequestPanel.tsx` is the frame over it; tests stub `TaskRequestPanelBody`/`buildTaskRequestPanelParts` in this module.
- `features/tasks/routes/MilestonesScreen.tsx` — Milestone list (status tabs, list-state branches, the three dirty guards; platform ADR-0071); entry `operator-screens/milestones`.
- `test/screen-host/features/tasks/routes/MilestonesRoute.tsx` — props-driven URL through TanStack `useNavigate`; registers the standalone frame for the parts in the detail slot.
- `test/host-adapters/features/tasks/routes/task-requests/TaskRequestPanel.tsx` — panel composition, exactly-once decision callback, dialog lifetime.
- `features/tasks/routes/task-requests/useTaskRequestPanelController.ts` — source Area defaults and canonical outcome reconciliation; section components render the view.
- `features/tasks/components/TaskDetailParts.tsx` — Task detail parts (`useTaskDetailParts`; entry `operator-screens/task-detail`): reads, sections, links, notices and title through the host seam.
- `test/host-adapters/features/tasks/components/MilestoneDetailPanel.tsx` — compatibility exports for the Milestone panels.
- `features/tasks/components/milestone-detail/useMilestoneDetailParts.tsx` / `useMilestoneCreateParts.tsx` — Milestone detail and create panels as `ClosableDetailParts` (`requestClose` carries the dirty guard); `MilestoneDetailPanel`/`MilestoneCreatePanel` are the standalone frames over them; the Finding source action goes through the host (`canLink`, `useHostNavigate`).
- `features/tasks/components/milestone-detail/useMilestoneChildTasks.ts` — one error-suppressed child Task projection shared by section rows and navigation count.
- `features/tasks/components/milestone-detail/MilestoneTitlePresenter.tsx` / `MilestonePropertiesPresenter.tsx` — render title/property surfaces; the parent owns the coordinated edit hooks.
- `packages/feature-ui/src/badges/InternalTaskBadge.tsx` — shared internal Task status labels and badge styles.
- `lib/copy/permission-reasons.ts` — shared blocked copy for Task and Milestone views.

## Verification

- When touched: Task Request review flows, backlog/board selected detail restore, Managed System filters, linked evidence summaries, reporter-facing status review candidates.

## Close-out contract (FO ADR-0067)

- FO ADR-0067 accepts assigned-reviewer Actor/team display/edit/filter distinct from actual decision Actor, and Task team assignee. Personal Home requests use reviewer=me; full authorized review remains available and assignment grants no self-approval.
- Explicit null opts out, omission requests defaults; preserve Backlog, source links and server validation/audit. Do not infer member assignment from a team label.

## Survey source defaults (FO ADR-0064; #739/#740 pending)

Survey-derived Finding/source summaries and Task Request draft defaults contain metadata only after cutover. Approved text requires a fresh authorized highlight projection, never a cached summary or private response/link/audit reconstruction. Preserve ordinary source permissions and authored Task/Task Request prose; no bulk history rewrite is authorized. Consume the existing owning-module seams.
