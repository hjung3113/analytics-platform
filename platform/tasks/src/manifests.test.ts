// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { milestonesRoute, myTasksRoute, taskBoardRoute, taskListRoute, taskRequestsRoute } from '@ap/feature-bridge';
import { manifests } from './index';

const ROUTES = { 'task-requests': taskRequestsRoute, 'tasks': taskBoardRoute, 'my-tasks': myTasksRoute, 'milestones': milestonesRoute, 'task-list': taskListRoute };
const menu = (id: string) => manifests.find(entry => entry.id === id)!;

describe('Tasks manifests', () => {
  it('declares the five menus in sidebar order', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['task-requests', 'tasks', 'my-tasks', 'milestones', 'task-list']);
  });

  it('puts 내 Task in the global myActivity group and every other menu in tasks (#1099c)', () => {
    expect(menu('my-tasks').group).toBe('myActivity');
    expect(manifests.filter(entry => entry.id !== 'my-tasks').every(entry => entry.group === 'tasks')).toBe(true);
    // Retained: 내 Task stays a carry-set member with F only (no console grant), so a filtered list's managedSystem follows it.
    expect(menu('my-tasks')).toMatchObject({ permission: 'features:access', carrySet: 'features' });
    expect(menu('my-tasks').additionalPermissions).toBeUndefined();
  });

  it.each(Object.entries(ROUTES))('%s declares its route table page keys plus returnTo, and the space permission', (id, route) => {
    // `returnTo` is navigation state the screen space carries (#760), not a route-table filter key.
    expect([...menu(id).pageKeys!].sort()).toEqual([...route.pageKeys, 'returnTo'].sort());
    expect(menu(id)).toMatchObject({ permission: 'features:access', requiresScope: false, pageType: 'management' });
    expect(menu(id).navViews).toBeUndefined();
  });

  it('serves the paths of the plan, the board being the primary', () => {
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['tasks']);
    expect(manifests.map(entry => entry.path)).toEqual(['/operations/task-requests', '/operations/tasks', '/my-tasks', '/operations/milestones', '/operations/task-list']);
  });

  it('keeps the approved ko labels in sidebar order', () => {
    const shown = manifests.filter(entry => entry.navHidden !== true).map(entry => entry.label.ko);
    expect(shown).toEqual(['Task Requests', 'Tasks', '내 Task', 'Milestones']);
  });

  it('hides Task 목록 under Tasks (feature has no sidebar row for it)', () => {
    expect(menu('task-list')).toMatchObject({ navHidden: true, parent: 'tasks', label: { ko: 'Task 목록', en: 'Task list' } });
  });
});
