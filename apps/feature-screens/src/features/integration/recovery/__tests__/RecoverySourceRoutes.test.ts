import { validatePermissionRequestsSearch } from '@/features/admin/permissions/permission-requests-search';
import { validateVocSearch } from '@/features/voc/routes/voc-search';
import { validateTasksSearch } from '@/test/screen-host/routes/_authed/tasks';
import { validateSurveyDetailSearch } from '@/test/surveys-host/detail';
import { expect, it } from 'vitest';

const ID = '11111111-1111-4111-8111-111111111111';
const returnTo = '/integration?category=unassigned-voc&cursor=page-two';
it.each([
  [validateVocSearch, { selected: ID, view: 'triage', managedSystem: ID }],
  [validateTasksSearch, { param: ID }],
  [validatePermissionRequestsSearch, { selected: ID }],
  [validateSurveyDetailSearch, {}],
])('preserves bounded recovery queue return context at a source route', (validate, search) => {
  expect(validate({ ...search, returnTo })).toMatchObject({ ...search, returnTo });
  expect(validate({ ...search, returnTo: '//foreign.example' }).returnTo).toBeUndefined();
});
