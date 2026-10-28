import { describe, expect, it } from 'vitest';
import {
  isEvidenceSearchValueValid,
  isIntegrationCoverageSearchValueValid,
  isIntegrationDashboardSearchValueValid,
  isIntegrationLinksSearchValueValid,
  validateIntegrationDashboardSearch,
} from './integration-search';

const ID = '11111111-1111-4111-8111-111111111111';
const ITEM = `r1_${'a'.repeat(23)}`;

describe('isIntegrationDashboardSearchValueValid', () => {
  it.each([
    ['category', 'unassigned-voc', true],
    ['category', 'permission-requests-pending', true],
    ['category', 'coverage_gap', false],
    ['selected', ITEM, true],
    ['selected', `r1_${'a'.repeat(22)}`, false],
    ['selected', ID, false],
    ['presentation', 'visible', true],
    ['presentation', 'hidden', true],
    ['presentation', 'other', false],
    ['history', 'true', true],
    ['history', 'false', false],
    ['cursor', 'c', true],
    ['cursor', '', false],
    ['cursor', 'x'.repeat(4097), false],
    ['returnTo', '/integration?history=true', true],
    ['returnTo', '/vocs', false],
    ['managedSystem', ID, true],
    ['managedSystem', 'all', true],
    ['managedSystem', 'nope', false],
    ['unknown', 'x', false],
  ])('%s=%s → %s', (key, value, expected) => {
    expect(isIntegrationDashboardSearchValueValid(key, value)).toBe(expected);
  });
});

describe('validateIntegrationDashboardSearch', () => {
  it('reads the string "true" as history and "visible" as absent presentation', () => {
    expect(validateIntegrationDashboardSearch({ history: 'true' }).history).toBe(true);
    expect(validateIntegrationDashboardSearch({ history: true }).history).toBe(true);
    expect(validateIntegrationDashboardSearch({ history: false }).history).toBeUndefined();
    expect(
      validateIntegrationDashboardSearch({ presentation: 'visible' }).presentation,
    ).toBeUndefined();
  });
});

describe('isEvidenceSearchValueValid', () => {
  it.each([
    ['managedSystem', ID, true],
    ['managedSystem', 'all', true],
    ['managedSystem', 'nope', false],
    ['source', 'voc', true],
    ['source', 'survey_response', true],
    ['source', 'note', true],
    ['source', 'task', false],
    ['q', 'abc', true],
    ['q', 'x'.repeat(201), false],
    ['selected', ID, true],
    ['selected', ITEM, false],
    ['cursor', 'c', true],
    ['cursor', '', false],
    ['unknown', 'x', false],
  ])('%s=%s → %s', (key, value, expected) => {
    expect(isEvidenceSearchValueValid(key, value)).toBe(expected);
  });
});

describe('isIntegrationCoverageSearchValueValid', () => {
  it.each([
    ['view', 'areas', true],
    ['view', 'systems', false],
    ['filter.analytics_area', ID, true],
    ['filter.analytics_area', 'unset', true],
    ['filter.analytics_area', 'nope', false],
    ['cursor', 'c', true],
    ['cursor', '', false],
    ['managedSystem', ID, true],
    ['managedSystem', 'all', true],
    ['managedSystem', 'nope', false],
    ['unknown', 'x', false],
  ])('%s=%s → %s', (key, value, expected) => {
    expect(isIntegrationCoverageSearchValueValid(key, value)).toBe(expected);
  });
});

describe('isIntegrationLinksSearchValueValid', () => {
  it.each([
    ['status', 'active', true],
    ['status', 'stale', true],
    ['status', 'detached', true],
    ['status', 'revoked', true],
    ['status', 'other', false],
    ['type', 'related_to', true],
    ['type', 'other', false],
    ['managedSystem', ID, true],
    ['managedSystem', 'anything', true],
    ['unknown', 'x', false],
  ])('%s=%s → %s', (key, value, expected) => {
    expect(isIntegrationLinksSearchValueValid(key, value)).toBe(expected);
  });
});
