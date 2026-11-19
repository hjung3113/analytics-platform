# Tasks Feature Agent Guide

## Ownership

Tasks owns frontend route composition for Task Requests, Tasks, Milestones, Managed System-scoped task views, backlog, board, and task detail panels. Work Initiative grouping is future work and has no route yet. It does not own reporter-facing VOC status or source evidence visibility rules.

## Route Boundary

- Owns `/tasks`, a single view-switching route. There is no `/tasks/initiatives` route.
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

## Key files

Default shape, stated once: screens under `features/tasks` are bridge-safe bodies — URL reads/writes and navigation only through the host seam (`useHostSearchWriter`, `HostLink`, `notifyError`); detail/create panels are handed to the host as parts through `renderDetail` and rendered in place; no import of the Task detail tree or any router.

- `TaskBoardScreen` renders the host's `renderDetail` in place, never `null` (a `null` registrant would hide the host's drawer).
- `TaskRequestsScreen` renders `TaskRequestPanelParts` beside the `ListShell`, never through its `detailPanel`, which would register the host's node as slot content.
- `bindUrl` is passed only by the test-local Tasks host; without it TanStack `useNavigate()` is never called (router-less tests).

## Verification

- When touched: Task Request review flows, backlog/board selected detail restore, Managed System filters, linked evidence summaries, reporter-facing status review candidates.

## Close-out contract (FO ADR-0067)

- FO ADR-0067 accepts assigned-reviewer Actor/team display/edit/filter distinct from actual decision Actor, and Task team assignee. Personal Home requests use reviewer=me; full authorized review remains available and assignment grants no self-approval.
- Explicit null opts out, omission requests defaults; preserve Backlog, source links and server validation/audit. Do not infer member assignment from a team label.

## Survey source defaults (FO ADR-0064; #739/#740 pending)

Survey-derived Finding/source summaries and Task Request draft defaults contain metadata only after cutover. Approved text requires a fresh authorized highlight projection, never a cached summary or private response/link/audit reconstruction. Preserve ordinary source permissions and authored Task/Task Request prose; no bulk history rewrite is authorized. Consume the existing owning-module seams.
