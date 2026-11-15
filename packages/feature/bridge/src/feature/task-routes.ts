import { operatorRoute, routeHere, routeSearch } from './operator-route';

/**
 * Task route tables (#763 s, #595 4e): the feature screens' `/tasks?view=…` → the five platform Task menus and back. `param` is the platform `focus` (06 §13);
 * `managedSystem=all` is screen's "no scope", so it maps to an explicit clear. `returnTo` and `platformReturn` are never mapped (the platform carries `returnTo` itself),
 * so a link carrying either stays unlinked. `operatorHostLinks` (`operator-links.ts`) wires all seven tables (#763 p1, p2).
 */
const SCOPE_ALL = { managedSystem: 'all' } as const;

/** 요청 검토: `TaskRequestsRoute` reads the scope, the selection and the reviewer pair (`tasks.tsx` requests branch). */
export const taskRequestsRoute = operatorRoute({
  screenPath: '/tasks',
  screenFixed: { view: 'requests' },
  menuId: 'task-requests',
  keys: { param: 'focus', reviewer: 'reviewer', reviewerTeam: 'reviewerTeam', managedSystem: 'managedSystem' },
  screenAbsent: SCOPE_ALL,
});

/** Task 보드: `TaskBoardRoute` reads the scope, the selection, `q` and the `public_update=missing` preset. */
export const taskBoardRoute = operatorRoute({
  screenPath: '/tasks',
  screenFixed: { view: 'board' },
  menuId: 'tasks',
  keys: { param: 'focus', q: 'q', public_update: 'publicUpdate', managedSystem: 'managedSystem' },
  screenAbsent: SCOPE_ALL,
});

/** 마일스톤: `MilestonesRoute` reads the scope and the selection only. */
export const milestonesRoute = operatorRoute({
  screenPath: '/tasks',
  screenFixed: { view: 'milestones' },
  menuId: 'milestones',
  keys: { param: 'focus', managedSystem: 'managedSystem' },
  screenAbsent: SCOPE_ALL,
});

/** The keys `TaskListRoute` reads (`FILTER_KEYS` and its scope and selection); the list, 내 Task and the two list aliases share this one set. */
const LIST_KEYS = {
  param: 'focus',
  managedSystem: 'managedSystem',
  q: 'q',
  'filter.analytics_area': 'area',
  status: 'status',
  status_group: 'statusGroup',
  overdue: 'overdue',
  public_update: 'publicUpdate',
  reporter_update: 'reporterUpdate',
} as const;

/** Task 목록: `/tasks?view=backlog`; the canonical list table (its inverse, hooks and presets). */
export const taskListRoute = operatorRoute({
  screenPath: '/tasks',
  screenFixed: { view: 'backlog' },
  menuId: 'task-list',
  keys: LIST_KEYS,
  screenAbsent: SCOPE_ALL,
});

/** 내 Task: `/tasks?view=my`; `TaskListRoute` takes the same filters for `my` and only adds `assignee: 'me'`. */
export const myTasksRoute = operatorRoute({
  screenPath: '/tasks',
  screenFixed: { view: 'my' },
  menuId: 'my-tasks',
  keys: LIST_KEYS,
  screenAbsent: SCOPE_ALL,
});

/** Link target only: screen also reaches the list as `?view=inbox` (the route treats it as the backlog). */
export const taskListInboxAlias = operatorRoute({
  screenPath: '/tasks',
  screenFixed: { view: 'inbox' },
  menuId: 'task-list',
  keys: LIST_KEYS,
  screenAbsent: SCOPE_ALL,
});

/** Link target only: a `/tasks` href without `view` is the list too (VOC detail's `/tasks?param=<id>`). `view` is not a key here, so `?view=board…` stays `null`. */
export const taskListBareAlias = operatorRoute({
  screenPath: '/tasks',
  screenFixed: {},
  menuId: 'task-list',
  keys: LIST_KEYS,
  screenAbsent: SCOPE_ALL,
});

/** Module-level hooks: `FeatureBridge` memoizes its seam on their identities. */
export const useTaskRequestsSearch = routeSearch(taskRequestsRoute);
export const useTaskRequestsHere = routeHere(taskRequestsRoute);
export const useTaskBoardSearch = routeSearch(taskBoardRoute);
export const useTaskBoardHere = routeHere(taskBoardRoute);
export const useMilestonesSearch = routeSearch(milestonesRoute);
export const useMilestonesHere = routeHere(milestonesRoute);
export const useTaskListSearch = routeSearch(taskListRoute);
export const useTaskListHere = routeHere(taskListRoute);
export const useMyTasksSearch = routeSearch(myTasksRoute);
export const useMyTasksHere = routeHere(myTasksRoute);

/** The seven targets; no table shadows another (each fixes its own `view`, and the bare alias leaves `view` unmapped), so the order is only a reading order. */
export const taskOperatorTargets = [
  taskRequestsRoute.target,
  taskBoardRoute.target,
  milestonesRoute.target,
  taskListRoute.target,
  myTasksRoute.target,
  taskListInboxAlias.target,
  taskListBareAlias.target,
];
