// The router-free /tasks search module (#763 s): the per-key validator the platform bridge asks before mounting a Task menu.
import { describe, expect, test } from 'vitest';

import { isTasksSearchValueValid, tasksSearchSchema } from '@/features/tasks/routes/task-search';
import { tasksSearchSchema as routeSchema, validateTasksSearch } from '@/routes/_authed/tasks';

const ID = '99999999-9999-4999-8999-999999999901';

describe('isTasksSearchValueValid', () => {
  test.each([
    ['view', 'board', true],
    ['view', 'roadmap', false],
    ['param', 'anything', true],
    ['managedSystem', ID, true],
    ['managedSystem', 'all', true],
    ['managedSystem', 'nope', false],
    ['filter.analytics_area', ID, true],
    ['filter.analytics_area', 'unset', true],
    ['filter.analytics_area', 'nope', false],
    ['status', 'doing', true],
    ['status', 'nope', false],
    ['status_group', 'in-flight', true],
    ['status_group', 'all', false],
    ['overdue', 'true', true],
    ['overdue', 'false', false],
    ['reporter_update', 'needed', true],
    ['reporter_update', 'x', false],
    ['public_update', 'missing', true],
    ['public_update', 'x', false],
    ['reviewer', 'me', true],
    ['reviewer', ID, true],
    ['reviewer', 'you', false],
    ['reviewerTeam', ID, true],
    ['reviewerTeam', 'me', false],
    ['q', 'pump', true],
    ['q', '  pump  ', true],
    ['q', 'a'.repeat(100), true],
    ['q', 'a'.repeat(101), false],
    ['returnTo', '/integration/coverage', true],
    ['returnTo', '/vocs?view=inbox', false],
    ['returnTo', 'https://example.com/x', false],
    ['unknown', 'x', false],
    ['toString', 'x', false],
  ])('%s=%s → %s', (key, value, valid) => {
    expect(isTasksSearchValueValid(key, value)).toBe(valid);
  });
});

describe('route file re-exports', () => {
  test('keeps the same schema and validator for existing importers', () => {
    expect(routeSchema).toBe(tasksSearchSchema);
    expect(validateTasksSearch({ view: 'board', overdue: 'true' })).toEqual({
      view: 'board',
      overdue: true,
    });
  });
});
