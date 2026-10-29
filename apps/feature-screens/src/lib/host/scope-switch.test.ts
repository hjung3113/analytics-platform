import { describe, expect, it } from 'vitest';

import { findingsSearchSchema } from '@/features/findings/routes/findings-search';
import {
  evidenceSearchSchema,
  integrationCoverageSearchSchema,
  integrationDashboardSearchSchema,
  integrationLinksSearchSchema,
} from '@/features/integration/routes/integration-search';
import { tasksSearchSchema } from '@/features/tasks/routes/task-search';
import { vocSearchSchema } from '@/features/voc/routes/voc-search';

import { scopeSwitchClears } from './scope-switch';

const SYSTEM = '11111111-1111-4111-8111-111111111111';

describe('scopeSwitchClears', () => {
  it.each([
    // nextSystem, area, declaresArea, declaresCursor -> area, cursor
    [SYSTEM, 'area-1', true, true, true, true],
    [SYSTEM, 'unset', true, true, false, true],
    [SYSTEM, undefined, true, true, true, true],
    [undefined, 'area-1', true, true, false, true],
    [undefined, 'unset', true, true, false, true],
    [SYSTEM, 'area-1', false, true, false, true],
    [SYSTEM, 'area-1', true, false, true, false],
    [SYSTEM, 'area-1', false, false, false, false],
    [undefined, undefined, false, false, false, false],
  ])(
    'system %s, area %s, declares area %s / cursor %s clears area %s, cursor %s',
    (nextSystem, area, declaresArea, declaresCursor, clearsArea, clearsCursor) => {
      expect(scopeSwitchClears({ nextSystem, area, declaresArea, declaresCursor })).toEqual({
        area: clearsArea,
        cursor: clearsCursor,
      });
    },
  );
});

describe('which screen searches declare the scope-bound keys', () => {
  it.each([
    ['evidence', evidenceSearchSchema, true],
    ['coverage', integrationCoverageSearchSchema, true],
    ['dashboard (/integration, /home)', integrationDashboardSearchSchema, true],
    ['links', integrationLinksSearchSchema, false],
    ['vocs', vocSearchSchema, false],
    ['tasks', tasksSearchSchema, false],
    ['findings', findingsSearchSchema, false],
  ])('%s declares cursor: %s', (_name, schema, declares) => {
    expect('cursor' in schema.shape).toBe(declares);
  });
});
