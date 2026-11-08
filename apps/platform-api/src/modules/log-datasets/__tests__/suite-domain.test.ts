import { describe, expect, it } from 'vitest';

import { baselineDigest } from '../domain/suite-digest.js';
import { parseSuiteInput, validateSuiteInput } from '../domain/suite-input.js';
import { countRequestStates, deriveRunState, isActiveRun } from '../domain/suite-state.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const ID2 = '1f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const counts = (over: Record<string, number>) => ({ ...countRequestStates([]), ...over });

describe('suite run state is derived from request states (#1479)', () => {
  it.each([
    [{ queued: 2 }, 'queued'],
    [{ queued: 1, succeeded: 1 }, 'running'],
    [{ claimed: 1, queued: 1 }, 'running'],
    [{ succeeded: 2 }, 'succeeded'],
    [{ succeeded: 1, failed: 1 }, 'failed'],
    [{ succeeded: 1, expired: 1 }, 'failed'],
    [{ cancelled: 1, succeeded: 1 }, 'cancelled'],
    [{ failed: 1, cancelled: 1 }, 'failed'],
  ] as const)('%j is %s', (over, state) => {
    expect(deriveRunState(counts(over))).toBe(state);
  });
  it('counts only known state names; a run is active while it waits or runs', () => {
    expect(countRequestStates(['queued', 'queued', 'nope', '']).queued).toBe(2);
    expect(['queued', 'running'].every((s) => isActiveRun(s as 'queued'))).toBe(true);
    expect(isActiveRun('succeeded')).toBe(false);
  });
});

describe('suite action input (#1479)', () => {
  it('normalises ids to lower case and accepts a pinned item', () => {
    const r = parseSuiteInput('suiteCreate', { name: ' S ', items: [{ datasetId: ID.toUpperCase(), datasetRevisionId: ID2 }] });
    expect(r).toMatchObject({ ok: true, value: { name: 'S', items: [{ datasetId: ID, datasetRevisionId: ID2 }] } });
  });
  it.each([
    [{ name: 'S', items: [] }, ['items']],
    [{ name: 'S', items: [{ datasetId: ID }, { datasetId: ID }] }, ['items']],
    [{ name: 'S', items: [{ datasetId: ID, run: 'x' }] }, ['items', '0']],
    [{ name: '', items: [{ datasetId: ID }] }, ['name']],
    [{ name: 'S', items: [{ datasetId: ID }], requiredPin: { unknown: 1 } }, ['requiredPin']],
  ])('refuses %j', (input, path) => {
    const errors = validateSuiteInput('suiteCreate', input);
    expect(errors[0]?.path).toEqual(path);
  });
  it('the same dataset at two different revisions is allowed; a run needs a suite and a key', () => {
    expect(validateSuiteInput('suiteCreate', { name: 'S', items: [{ datasetId: ID, datasetRevisionId: ID }, { datasetId: ID, datasetRevisionId: ID2 }] })).toEqual([]);
    expect(validateSuiteInput('suiteRun', { suiteId: ID })).toEqual([{ path: ['idempotencyKey'], code: 'required' }]);
  });
});

describe('baseline digest (#1479)', () => {
  it('is the same whatever the key order and changes with the content', () => {
    const a = baselineDigest({ profilePin: { a: 1, b: 2 }, expectedScope: ['R'], expectations: [{ x: 1, y: 2 }] });
    expect(baselineDigest({ profilePin: { b: 2, a: 1 }, expectedScope: ['R'], expectations: [{ y: 2, x: 1 }] })).toBe(a);
    expect(baselineDigest({ profilePin: { a: 1, b: 2 }, expectedScope: ['R'], expectations: [{ x: 1, y: 3 }] })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
