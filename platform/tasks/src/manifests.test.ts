// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { milestonesRoute, myTasksRoute, taskBoardRoute, taskListRoute, taskRequestsRoute } from '@ap/feature-bridge';
import { manifests } from './index';

const ROUTES = { 'fo-task-requests': taskRequestsRoute, 'fo-tasks': taskBoardRoute, 'fo-my-tasks': myTasksRoute, 'fo-milestones': milestonesRoute, 'fo-task-list': taskListRoute };
const menu = (id: string) => manifests.find(entry => entry.id === id)!;

describe('Tasks manifests', () => {
  it('declares the five menus in sidebar order', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['fo-task-requests', 'fo-tasks', 'fo-my-tasks', 'fo-milestones', 'fo-task-list']);
  });

  it.each(Object.entries(ROUTES))('%s declares its route table page keys plus returnTo, and the space permission', (id, route) => {
    // `returnTo` is navigation state the FO space carries (#760), not a route-table filter key.
    expect([...menu(id).pageKeys!].sort()).toEqual([...route.pageKeys, 'returnTo'].sort());
    expect(menu(id)).toMatchObject({ permission: 'features:access', requiresScope: false, pageType: 'management' });
    expect(menu(id).navViews).toBeUndefined();
  });

  it('serves the paths of the plan, the board being the primary', () => {
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['fo-tasks']);
    expect(manifests.map(entry => entry.path)).toEqual(['/feedbackops/task-requests', '/feedbackops/tasks', '/feedbackops/my-tasks', '/feedbackops/milestones', '/feedbackops/tasks/list']);
  });

  it('keeps the approved ko labels in sidebar order', () => {
    const shown = manifests.filter(entry => entry.navHidden !== true).map(entry => entry.label.ko);
    expect(shown).toEqual(['Task Requests', 'Tasks', '내 Task', 'Milestones']);
  });

  it('hides Task 목록 under Tasks (FeedbackOps has no sidebar row for it)', () => {
    expect(menu('fo-task-list')).toMatchObject({ navHidden: true, parent: 'fo-tasks', label: { ko: 'Task 목록', en: 'Task list' } });
  });
});
