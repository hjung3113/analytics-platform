import { describe, expect, it } from 'vitest';
import { surveyTarget } from './survey-links';
import { UUID_PATTERN, isUuid } from './uuid';

describe('isUuid', () => {
  it.each(['33333333-3333-4333-8333-333333333333', 'ABCDEF01-2345-6789-abcd-ef0123456789'])('accepts %s', value => {
    expect(isUuid(value)).toBe(true);
    expect(UUID_PATTERN.test(value)).toBe(true);
  });
  it.each(['', 'not-a-uuid', '33333333-3333-4333-8333-33333333333', '33333333-3333-4333-8333-3333333333333', ' 33333333-3333-4333-8333-333333333333'])('rejects %j', value => {
    expect(isUuid(value)).toBe(false);
  });

  it('keeps the survey respond path to one uuid', () => {
    expect(surveyTarget('/surveys/33333333-3333-4333-8333-333333333333/respond')?.params).toEqual({ surveyId: '33333333-3333-4333-8333-333333333333' });
    expect(surveyTarget('/surveys/x/respond')).toBeNull();
  });
});
