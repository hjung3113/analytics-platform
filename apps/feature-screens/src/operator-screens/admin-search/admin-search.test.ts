import { describe, expect, it } from 'vitest';
import {
  isAnalyticsAreasSearchValueValid,
  isPermissionGrantsSearchValueValid,
  isPermissionRequestsSearchValueValid,
} from './index';

const ID = '11111111-1111-4111-8111-111111111111';

describe('admin search entry', () => {
  it.each([
    ['managedSystem', ID, true],
    ['managedSystem', 'all', false],
    ['includeArchived', 'true', true],
    ['includeArchived', 'false', false],
    ['selected', ID, true],
    ['selected', 'nope', false],
    ['tab', 'denies', false],
  ])('analytics areas %s=%s → %s', (key, value, expected) => {
    expect(isAnalyticsAreasSearchValueValid(key, value)).toBe(expected);
  });

  it.each([
    ['tab', 'denies', true],
    ['tab', 'grants', false],
    ['selected', ID, true],
    ['selected', 'nope', false],
    ['unknown', 'x', false],
  ])('permission grants %s=%s → %s', (key, value, expected) => {
    expect(isPermissionGrantsSearchValueValid(key, value)).toBe(expected);
  });

  it.each([
    ['tab', 'needs_more_info', true],
    ['tab', 'approved', true],
    ['tab', 'rejected', true],
    ['tab', 'all', true],
    ['tab', 'pending', false],
    ['selected', ID, true],
    ['returnTo', '/home', true],
    ['returnTo', 'https://evil.example', false],
  ])('permission requests %s=%s → %s', (key, value, expected) => {
    expect(isPermissionRequestsSearchValueValid(key, value)).toBe(expected);
  });
});
