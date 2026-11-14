/**
 * @ap/menu-tasks — tasks group manifests (operations console Task 관리: Task Requests, Tasks board, 내 Task, Milestones and the hidden Task 목록; ADR-0081, #763).
 * The feature operator Task screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`taskRequestsRoute`, `taskBoardRoute`, `myTasksRoute`, `milestonesRoute`, `taskListRoute`; pinned by the page tests),
 * and the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4). `focus` is the selected Task (06 §13).
 */
import { lazy } from 'react';
import { Flag, Inbox, ListTodo, User } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('tasks');
/** 내 Task is the one global personal screen this Consumer owns: it declares the global `myActivity` group; the app composition places it third (#1099c). */
const MY_ACTIVITY = groupId('myActivity');

export const manifests: MenuEntry[] = [
  {
    id: 'task-requests', group: GROUP, label: { ko: 'Task 요청', en: 'Task requests' },
    description: { ko: 'Task 요청 검토 · 승인 · 반려', en: 'Incoming Task requests · Review · Approval · Rejection' },
    path: '/flow/task-requests', icon: Inbox, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'reviewer', 'reviewerTeam', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureTaskRequests')),
  },
  {
    id: 'tasks', primary: true, group: GROUP, label: { ko: 'Task 보드', en: 'Task board' },
    description: { ko: '상태별 Task 보드 · 다음 상태 전환', en: 'Task board by status · Next-status transitions' },
    path: '/flow/tasks', icon: ListTodo, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'q', 'publicUpdate', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureTaskBoard')),
  },
  {
    id: 'my-tasks', group: MY_ACTIVITY, label: { ko: '내 Task', en: 'My Tasks' },
    description: { ko: '내게 배정된 Task 목록', en: 'Tasks assigned to me' },
    path: '/my-tasks', icon: User, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'q', 'area', 'status', 'statusGroup', 'overdue', 'publicUpdate', 'reporterUpdate', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureMyTasks')),
  },
  {
    id: 'milestones', group: GROUP, label: { ko: '마일스톤', en: 'Milestones' },
    description: { ko: 'Milestone 생성 · 진행 확인', en: 'Milestone creation · Progress review' },
    path: '/flow/milestones', icon: Flag, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureMilestones')),
  },
  {
    id: 'task-list', group: GROUP, label: { ko: 'Task 목록', en: 'Task list' }, navHidden: true, parent: 'tasks',
    description: { ko: '필터별 Task 목록', en: 'Task list by filter' },
    path: '/flow/task-list', icon: ListTodo, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'q', 'area', 'status', 'statusGroup', 'overdue', 'publicUpdate', 'reporterUpdate', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureTaskList')),
  },
];
