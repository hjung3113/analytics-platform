/**
 * @ap/menu-fo-tasks — foTasks group manifests (FeedbackOps space Tasks: Tasks board, 내 Task and the hidden Task 목록; ADR-0081, #763).
 * The FeedbackOps operator Task screens through the bridge; the page keys equal the route tables in `@ap/fo-bridge` (`taskBoardRoute`, `myTasksRoute`, `taskListRoute`; pinned by the page tests),
 * and the space carries `managedSystem` (ADR-0081 decision 4). `focus` is the selected Task (06 §13).
 */
import { lazy } from 'react';
import { ListTodo, User } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('foTasks');

export const manifests: MenuEntry[] = [
  {
    id: 'fo-tasks', primary: true, group: GROUP, label: { ko: 'Tasks', en: 'Tasks' },
    description: { ko: 'Task를 상태별 보드에서 보고 다음 상태로 옮깁니다', en: 'See Tasks on a status board and move them to the next status' },
    path: '/feedbackops/tasks', icon: ListTodo, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'q', 'publicUpdate', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoTaskBoard')),
  },
  {
    id: 'fo-my-tasks', group: GROUP, label: { ko: '내 Task', en: 'My Tasks' },
    description: { ko: '내게 배정된 Task를 목록에서 확인합니다', en: 'See the Tasks assigned to me in a list' },
    path: '/feedbackops/my-tasks', icon: User, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'q', 'area', 'status', 'statusGroup', 'overdue', 'publicUpdate', 'reporterUpdate', 'returnTo'],
    component: lazy(() => import('./pages/FoMyTasks')),
  },
  {
    id: 'fo-task-list', group: GROUP, label: { ko: 'Task 목록', en: 'Task list' }, navHidden: true, parent: 'fo-tasks',
    description: { ko: '필터로 좁힌 Task를 목록에서 확인합니다', en: 'See Tasks narrowed by filters in a list' },
    path: '/feedbackops/tasks/list', icon: ListTodo, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'q', 'area', 'status', 'statusGroup', 'overdue', 'publicUpdate', 'reporterUpdate', 'returnTo'],
    component: lazy(() => import('./pages/FoTaskList')),
  },
];
