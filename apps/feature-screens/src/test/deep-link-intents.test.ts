import { validatePermissionRequestsSearch } from '@/features/admin/permissions/permission-requests-search';
import { validateFindingsSearch } from '@/features/findings/routes/findings-search';
import { validateSurveysSearch } from '@/features/surveys/routes/surveys-search';
import { validateTasksSearch } from '@/features/tasks/routes/task-search';
import { validateVocSearch } from '@/features/voc/routes/voc-search';
import {
  DASHBOARD_ACTIONABLE_FINDINGS_ROUTE,
  DASHBOARD_HOP_ROUTES,
  DASHBOARD_OUTCOME_SURVEYS_ROUTE,
  DASHBOARD_RELEASED_TASKS_ROUTE,
} from '@fops/shared';
import { describe, expect, it } from 'vitest';
const validators: Record<string, (raw: unknown) => unknown> = {
  '/findings': validateFindingsSearch,
  '/vocs': validateVocSearch,
  '/tasks': validateTasksSearch,
  '/surveys': validateSurveysSearch,
  '/admin/permissions/requests': validatePermissionRequestsSearch,
};
describe('retained dashboard and recovery source intents (#597)', () => {
  it('keeps the filtered recovery destinations', () => {
    expect(DASHBOARD_ACTIONABLE_FINDINGS_ROUTE).toBe('/findings?execution=none');
    expect(DASHBOARD_RELEASED_TASKS_ROUTE).toBe('/tasks?view=backlog&reporter_update=needed');
    expect(DASHBOARD_OUTCOME_SURVEYS_ROUTE).toBe('/surveys?follow_up=needed');
  });
  it.each(Object.values(DASHBOARD_HOP_ROUTES))('keeps all declared filters in %s', (href) => {
    const url = new URL(href, 'http://localhost');
    const raw = Object.fromEntries(url.searchParams);
    const validate = validators[url.pathname];
    expect(validate, href).toBeTypeOf('function');
    expect(validate?.(raw)).toEqual(expect.objectContaining(raw));
  });
  it('rejects an invalid tab without dropping the valid inbox intent', () => {
    expect(validateVocSearch({ view: 'inbox', tab: 'not-a-voc-tab' })).toEqual({ view: 'inbox' });
  });
});
