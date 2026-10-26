import { describe, expect, it } from 'vitest';
import {
  getSafeVocReturnTo,
  isFindingsSearchValueValid,
  validateFindingsSearch,
} from './findings-search';

const ID = '11111111-1111-4111-8111-111111111111';

describe('isFindingsSearchValueValid', () => {
  it.each([
    ['q', 'abc', true],
    ['q', 'x'.repeat(101), false],
    ['filter.analytics_area', ID, true],
    ['filter.analytics_area', 'unset', true],
    ['filter.analytics_area', 'nope', false],
    ['status', 'active', true],
    ['status', 'closed', false],
    ['managedSystem', ID, true],
    ['managedSystem', 'all', true],
    ['managedSystem', 'nope', false],
    ['selected', ID, true],
    ['selected', 'nope', false],
    ['execution', 'none', true],
    ['execution', 'all', false],
    ['assignment', 'assigned', true],
    ['assignment', 'unassigned', true],
    ['assignment', 'me', false],
    ['returnTo', '/vocs?view=inbox', true],
    ['returnTo', `/${'x'.repeat(2048)}`, false],
    ['unknown', 'x', false],
    ['constructor', 'x', false],
  ])('%s=%s → %s', (key, value, expected) => {
    expect(isFindingsSearchValueValid(key, value)).toBe(expected);
  });
});

describe('validateFindingsSearch', () => {
  it('keeps valid keys and drops the rest', () => {
    expect(validateFindingsSearch({ selected: ID, status: 'bad', extra: 1 })).toMatchObject({
      selected: ID,
      status: undefined,
    });
  });
});

describe('getSafeVocReturnTo', () => {
  it('keeps a VOC list URL', () => {
    expect(getSafeVocReturnTo(`/vocs?view=inbox&selected=${ID}`)).toBe(
      `/vocs?view=inbox&selected=${ID}`,
    );
  });

  it.each([
    '/vocs?bad=1',
    '/tasks',
    '//evil',
    '/vocs?view=inbox#x',
    '/vocs?view=inbox&view=triage',
  ])('refuses %s', (value) => {
    expect(getSafeVocReturnTo(value)).toBeNull();
  });

  it('refuses an absent value', () => {
    expect(getSafeVocReturnTo(undefined)).toBeNull();
  });
});
