import { describe, expect, it } from 'vitest';
import {
  isSurveyDetailSearchValueValid,
  isSurveysSearchValueValid,
  validateSurveyDetailSearch,
  validateSurveysSearch,
} from './surveys-search';

const ID = '11111111-1111-4111-8111-111111111111';

describe('isSurveysSearchValueValid', () => {
  it.each([
    ['managedSystem', ID, true],
    ['managedSystem', 'all', true],
    ['managedSystem', 'nope', false],
    ['selected', ID, true],
    ['selected', 'nope', false],
    ['filter.analytics_area', ID, true],
    ['filter.analytics_area', 'unset', true],
    ['filter.analytics_area', 'nope', false],
    ['status', 'open', true],
    ['status', 'closed', false],
    ['follow_up', 'needed', true],
    ['follow_up', 'done', false],
    ['platformReturn', 'https://platform.example/x', true],
    ['platformReturn', 'javascript:alert(1)', false],
    ['returnTo', '/home', false],
    ['builder', 'true', false],
    ['unknown', 'x', false],
  ])('%s=%s → %s', (key, value, expected) => {
    expect(isSurveysSearchValueValid(key, value)).toBe(expected);
  });
});

describe('isSurveyDetailSearchValueValid', () => {
  it.each([
    ['builder', 'true', true],
    ['builder', 'false', false],
    ['builder', '', false],
    ['returnTo', '/home', true],
    ['returnTo', 'https://evil.example', false],
    ['managedSystem', 'all', true],
    ['managedSystem', 'nope', false],
    ['filter.analytics_area', 'unset', true],
    ['status', 'open', true],
    ['status', 'closed', false],
    ['follow_up', 'needed', true],
    ['follow_up', 'x', false],
    ['selected', ID, false],
  ])('%s=%s → %s', (key, value, expected) => {
    expect(isSurveyDetailSearchValueValid(key, value)).toBe(expected);
  });
});

describe('validators', () => {
  it('drops an invalid value and keeps the rest', () => {
    expect(
      validateSurveysSearch({ status: 'closed', follow_up: 'needed', selected: ID }),
    ).toMatchObject({ follow_up: 'needed', selected: ID });
    expect(validateSurveysSearch({ status: 'closed' }).status).toBeUndefined();
  });

  it('reads the router-decoded boolean builder', () => {
    expect(validateSurveyDetailSearch({ builder: true }).builder).toBe(true);
    expect(validateSurveyDetailSearch({ builder: 'yes' }).builder).toBeUndefined();
  });
});
