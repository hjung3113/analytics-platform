/**
 * @ap/menu-tasks — foTasks group manifests (FeedbackOps space Tasks: Task Requests, Tasks board, 내 Task, Milestones and the hidden Task 목록; ADR-0081, #763).
 * The FeedbackOps operator Task screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`taskRequestsRoute`, `taskBoardRoute`, `myTasksRoute`, `milestonesRoute`, `taskListRoute`; pinned by the page tests),
 * and the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4). `focus` is the selected Task (06 §13).
 */
import { lazy } from 'react';
import { Flag, Inbox, ListTodo, User } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('foTasks');

export const manifests: MenuEntry[] = [
  {
    id: 'fo-task-requests', group: GROUP, label: { ko: 'Task Requests', en: 'Task Requests' },
    description: { ko: '들어온 Task 요청을 검토해 승인하거나 반려합니다', en: 'Review incoming Task requests and approve or reject them' },
    path: '/feedbackops/task-requests', icon: Inbox, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'reviewer', 'reviewerTeam', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoTaskRequests')),
  },
  {
    id: 'fo-tasks', primary: true, group: GROUP, label: { ko: 'Tasks', en: 'Tasks' },
    description: { ko: 'Task를 상태별 보드에서 보고 다음 상태로 옮깁니다', en: 'See Tasks on a status board and move them to the next status' },
    path: '/feedbackops/tasks', icon: ListTodo, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'q', 'publicUpdate', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoTaskBoard')),
  },
  {
    id: 'fo-my-tasks', group: GROUP, label: { ko: '내 Task', en: 'My Tasks' },
    description: { ko: '내게 배정된 Task를 목록에서 확인합니다', en: 'See the Tasks assigned to me in a list' },
    path: '/feedbackops/my-tasks', icon: User, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'q', 'area', 'status', 'statusGroup', 'overdue', 'publicUpdate', 'reporterUpdate', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoMyTasks')),
  },
  {
    id: 'fo-milestones', group: GROUP, label: { ko: 'Milestones', en: 'Milestones' },
    description: { ko: 'Milestone을 만들고 진행을 확인합니다', en: 'Create Milestones and follow their progress' },
    path: '/feedbackops/milestones', icon: Flag, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoMilestones')),
  },
  {
    id: 'fo-task-list', group: GROUP, label: { ko: 'Task 목록', en: 'Task list' }, navHidden: true, parent: 'fo-tasks',
    description: { ko: '필터로 좁힌 Task를 목록에서 확인합니다', en: 'See Tasks narrowed by filters in a list' },
    path: '/feedbackops/tasks/list', icon: ListTodo, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'q', 'area', 'status', 'statusGroup', 'overdue', 'publicUpdate', 'reporterUpdate', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoTaskList')),
  },
];
