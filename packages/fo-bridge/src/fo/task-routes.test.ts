import { describe, expect, it } from 'vitest';
import { operatorHostLinks } from './operator-links';
import {
  milestonesRoute,
  myTasksRoute,
  taskBoardRoute,
  taskListBareAlias,
  taskListInboxAlias,
  taskListRoute,
  taskOperatorTargets,
  taskRequestsRoute,
} from './task-routes';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const AREA = '55555555-5555-4555-8555-555555555555';
const TEAM = '88888888-8888-4888-8888-888888888888';
const TASK = '99999999-9999-4999-8999-999999999999';

const query = (to: string) => Object.fromEntries(new URLSearchParams(to.slice(to.indexOf('?') + 1)));
const sorted = (keys: readonly string[]) => [...keys].sort();

describe('canonical Task tables', () => {
  it.each([
    ['requests detail', taskRequestsRoute, 'fo-task-requests', `/tasks?view=requests&param=${TASK}`, { focus: TASK }],
    ['requests reviewer', taskRequestsRoute, 'fo-task-requests', `/tasks?view=requests&reviewer=me&reviewerTeam=${TEAM}&managedSystem=${SYSTEM}`, { reviewer: 'me', reviewerTeam: TEAM, managedSystem: SYSTEM }],
    ['requests scoped', taskRequestsRoute, 'fo-task-requests', `/tasks?view=requests&managedSystem=${SYSTEM}`, { managedSystem: SYSTEM }],
    ['board', taskBoardRoute, 'fo-tasks', '/tasks?view=board', {}],
    ['board selection', taskBoardRoute, 'fo-tasks', `/tasks?view=board&param=${TASK}`, { focus: TASK }],
    ['board public update', taskBoardRoute, 'fo-tasks', '/tasks?view=board&public_update=missing', { publicUpdate: 'missing' }],
    ['board search', taskBoardRoute, 'fo-tasks', `/tasks?view=board&q=a&managedSystem=${SYSTEM}`, { q: 'a', managedSystem: SYSTEM }],
    ['milestones', milestonesRoute, 'fo-milestones', `/tasks?view=milestones&param=m-1&managedSystem=${SYSTEM}`, { focus: 'm-1', managedSystem: SYSTEM }],
    ['list reporter update', taskListRoute, 'fo-task-list', '/tasks?view=backlog&reporter_update=needed', { reporterUpdate: 'needed' }],
    ['list linked task', taskListRoute, 'fo-task-list', `/tasks?view=backlog&param=${TASK}`, { focus: TASK }],
    ['list every key', taskListRoute, 'fo-task-list', `/tasks?view=backlog&param=${TASK}&managedSystem=${SYSTEM}&q=a&filter.analytics_area=${AREA}&status=doing&status_group=in-flight&overdue=true&public_update=missing&reporter_update=needed`,
      { focus: TASK, managedSystem: SYSTEM, q: 'a', area: AREA, status: 'doing', statusGroup: 'in-flight', overdue: 'true', publicUpdate: 'missing', reporterUpdate: 'needed' }],
    ['my tasks', myTasksRoute, 'fo-my-tasks', `/tasks?view=my&status=todo&overdue=true&managedSystem=${SYSTEM}`, { status: 'todo', overdue: 'true', managedSystem: SYSTEM }],
  ])('maps the %s link to its menu and back to the same FO search', (_name, route, menuId, to, page) => {
    const target = route.target(to);
    expect(target).toEqual({ menuId, page });
    expect(route.toFoSearch(target!.page!)).toEqual(query(to));
  });

  it('reads managedSystem=all as an explicit clear on every table', () => {
    for (const [route, view] of [[taskRequestsRoute, 'requests'], [taskBoardRoute, 'board'], [milestonesRoute, 'milestones'], [taskListRoute, 'backlog'], [myTasksRoute, 'my']] as const) {
      expect(route.target(`/tasks?view=${view}&managedSystem=all`)?.page).toEqual({ managedSystem: null });
    }
  });

  it('pins the page keys of each table', () => {
    expect(sorted(taskRequestsRoute.pageKeys)).toEqual(['focus', 'managedSystem', 'reviewer', 'reviewerTeam']);
    expect(sorted(taskBoardRoute.pageKeys)).toEqual(['focus', 'managedSystem', 'publicUpdate', 'q']);
    expect(sorted(milestonesRoute.pageKeys)).toEqual(['focus', 'managedSystem']);
    expect(sorted(taskListRoute.pageKeys)).toEqual(['area', 'focus', 'managedSystem', 'overdue', 'publicUpdate', 'q', 'reporterUpdate', 'status', 'statusGroup']);
  });

  it('gives the list, 내 Task and both aliases one key set (the aliases are link targets only)', () => {
    expect(myTasksRoute.pageKeys).toEqual(taskListRoute.pageKeys);
    expect(taskListInboxAlias.pageKeys).toEqual(taskListRoute.pageKeys);
    expect(taskListBareAlias.pageKeys).toEqual(taskListRoute.pageKeys);
  });

  it('adds the canonical fixed view when reading a page and ignores keys outside the table', () => {
    expect(taskListRoute.toFoSearch({ focus: TASK, returnTo: '/x' })).toEqual({ view: 'backlog', param: TASK });
    expect(taskBoardRoute.toFoSearch({ publicUpdate: 'missing' })).toEqual({ view: 'board', public_update: 'missing' });
  });
});

describe('list aliases', () => {
  it.each([
    ['no view', taskListBareAlias, `/tasks?param=${TASK}`],
    ['view=inbox', taskListInboxAlias, `/tasks?view=inbox&param=${TASK}`],
  ])('reads a %s href as fo-task-list with focus', (_name, route, to) => {
    expect(route.target(to)).toEqual({ menuId: 'fo-task-list', page: { focus: TASK } });
  });

  it('reads a bare /tasks as the list with no page keys', () => {
    expect(taskListBareAlias.target('/tasks')).toEqual({ menuId: 'fo-task-list', page: {} });
  });
});

describe('unlinked state is never dropped', () => {
  const lists = [taskListRoute, myTasksRoute, taskListInboxAlias, taskListBareAlias];

  it('keeps /tasks?view=board&q=a null for every list table', () => {
    for (const route of lists) expect(route.target('/tasks?view=board&q=a')).toBeNull();
  });

  it.each([
    ['returnTo', '&returnTo=%2Fvocs'],
    ['platformReturn', '&platformReturn=x'],
    ['an unknown key', '&unknown=1'],
    ['a duplicated key', `&param=${TASK}&param=${TASK}`],
  ])('leaves a link with %s unlinked on every table', (_name, extra) => {
    for (const [route, view] of [[taskRequestsRoute, 'requests'], [taskBoardRoute, 'board'], [milestonesRoute, 'milestones'], [taskListRoute, 'backlog'], [myTasksRoute, 'my']] as const) {
      expect(route.target(`/tasks?view=${view}${extra}`)).toBeNull();
    }
    expect(taskListInboxAlias.target(`/tasks?view=inbox${extra}`)).toBeNull();
    expect(taskListBareAlias.target(`/tasks?param=${TASK}${extra}`)).toBeNull();
  });

  it('leaves keys another view owns unlinked (reviewer on the board, public_update on requests)', () => {
    expect(taskBoardRoute.target('/tasks?view=board&reviewer=me')).toBeNull();
    expect(taskRequestsRoute.target('/tasks?view=requests&public_update=missing')).toBeNull();
    expect(taskListRoute.target('/tasks?view=backlog&reviewer=me')).toBeNull();
  });
});

describe('taskOperatorTargets', () => {
  it('resolves every FeedbackOps /tasks href to exactly one menu, no alias shadowing a table', () => {
    const menuOf = (to: string) => taskOperatorTargets.flatMap(target => target(to) ?? []).map(found => found.menuId);
    expect(taskOperatorTargets).toHaveLength(7);
    expect(menuOf('/tasks?view=board&param=')).toEqual(['fo-tasks']);
    expect(menuOf('/tasks?view=requests&param=')).toEqual(['fo-task-requests']);
    expect(menuOf('/tasks?view=milestones')).toEqual(['fo-milestones']);
    expect(menuOf('/tasks?view=my')).toEqual(['fo-my-tasks']);
    expect(menuOf('/tasks?view=backlog&reporter_update=needed')).toEqual(['fo-task-list']);
    expect(menuOf(`/tasks?param=${TASK}`)).toEqual(['fo-task-list']);
    expect(menuOf(`/tasks?view=inbox&param=${TASK}`)).toEqual(['fo-task-list']);
  });

  it('wires all seven Task tables into operatorHostLinks; Findings stay unlinked', () => {
    const { targetOf } = operatorHostLinks;
    expect(targetOf(`/tasks?param=${TASK}`)).toEqual({ menuId: 'fo-task-list', page: { focus: TASK } });
    expect(targetOf('/tasks?view=board&param=')).toEqual({ menuId: 'fo-tasks', page: {} });
    expect(targetOf('/tasks?view=backlog&reporter_update=needed')).toEqual({ menuId: 'fo-task-list', page: { reporterUpdate: 'needed' } });
    expect(targetOf(`/tasks?view=board&public_update=missing&managedSystem=${SYSTEM}`)).toEqual({ menuId: 'fo-tasks', page: { publicUpdate: 'missing', managedSystem: SYSTEM } });
    expect(targetOf('/tasks?view=inbox')).toEqual({ menuId: 'fo-task-list', page: {} });
    expect(targetOf('/tasks?view=my')?.menuId).toBe('fo-my-tasks');
    expect(targetOf('/tasks?view=requests&param=x')).toEqual({ menuId: 'fo-task-requests', page: { focus: 'x' } });
    expect(targetOf('/tasks?view=requests&reviewer=me')?.menuId).toBe('fo-task-requests');
    expect(targetOf('/tasks?view=milestones&param=m-1')).toEqual({ menuId: 'fo-milestones', page: { focus: 'm-1' } });
    expect(targetOf('/findings')).toBeNull();
    expect(targetOf('/findings')).toBeNull();
  });
});
