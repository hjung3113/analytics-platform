// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { myTasksRoute, taskBoardRoute, taskListRoute } from '@ap/fo-bridge';
import { manifests } from './index';

const AUTHED = fileURLToPath(new URL('../../../../products/feedbackops/apps/frontend/src/routes/_authed.tsx', import.meta.url));
const NAV_TREE = readFileSync(AUTHED, 'utf8');
const ROUTES = { 'fo-tasks': taskBoardRoute, 'fo-my-tasks': myTasksRoute, 'fo-task-list': taskListRoute };
/** The `NAV_TREE.tasks` label of the entry with this `href`. */
const navLabel = (href: string) => {
  const at = NAV_TREE.indexOf(`href: '${href}'`);
  return at === -1 ? null : /label: '([^']+)'/.exec(NAV_TREE.slice(NAV_TREE.lastIndexOf('{', at), at))?.[1] ?? null;
};
const menu = (id: string) => manifests.find(entry => entry.id === id)!;

describe('Tasks manifests', () => {
  it('declares the three menus in sidebar order', () => {
    expect(manifests.map(entry => entry.id)).toEqual(['fo-tasks', 'fo-my-tasks', 'fo-task-list']);
  });

  it.each(Object.entries(ROUTES))('%s declares its route table page keys plus returnTo, and the space permission', (id, route) => {
    // `returnTo` is navigation state the FO space carries (#760), not a route-table filter key.
    expect([...menu(id).pageKeys!].sort()).toEqual([...route.pageKeys, 'returnTo'].sort());
    expect(menu(id)).toMatchObject({ permission: 'feedbackops:access', requiresScope: false, pageType: 'management' });
    expect(menu(id).navViews).toBeUndefined();
  });

  it('serves the paths of the plan, the board being the primary', () => {
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['fo-tasks']);
    expect(manifests.map(entry => entry.path)).toEqual(['/feedbackops/tasks', '/feedbackops/my-tasks', '/feedbackops/tasks/list']);
  });

  it('keeps the ko labels equal to the FeedbackOps NAV_TREE.tasks entries', () => {
    expect(menu('fo-tasks').label.ko).toBe(navLabel('/tasks?view=board'));
    expect(menu('fo-my-tasks').label.ko).toBe(navLabel('/tasks?view=my'));
  });

  it('hides Task 목록 under Tasks (FeedbackOps has no sidebar row for it)', () => {
    expect(menu('fo-task-list')).toMatchObject({ navHidden: true, parent: 'fo-tasks', label: { ko: 'Task 목록', en: 'Task list' } });
  });
});
