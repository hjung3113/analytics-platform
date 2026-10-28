import {
  validateSurveyDetailSearch,
  validateSurveysSearch,
} from '@/features/surveys/routes/surveys-search';
import { validateTasksSearch } from '@/features/tasks/routes/task-search';
import { validateVocSearch } from '@/features/voc/routes/voc-search';
import { describe, expect, it } from 'vitest';

// #597: the standalone `platformReturn` search key (FO ADR-0071) is retired. The host search schemas are strict, so the key
// is dropped whether its value was once valid or not, and the other fields of the same URL still parse.
const PLATFORM_URL = 'https://platform.example.com/analytics?x=1';

describe('retired platformReturn search key', () => {
  it.each([
    ['/tasks', validateTasksSearch],
    ['/vocs', validateVocSearch],
    ['/surveys', validateSurveysSearch],
    ['/surveys/$surveyId', validateSurveyDetailSearch],
  ] as const)('%s drops platformReturn and keeps the rest', (_path, validate) => {
    expect(validate({ platformReturn: PLATFORM_URL })).toEqual({});
    expect(validate({ platformReturn: 'javascript:alert(1)' })).toEqual({});
    expect(validate({ platformReturn: PLATFORM_URL, managedSystem: 'all' })).toEqual(
      validate({ managedSystem: 'all' }),
    );
  });
});
