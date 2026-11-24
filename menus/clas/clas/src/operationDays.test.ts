import { describe, expect, it } from 'vitest';
import { resolveOperationDays } from './endpoints';

describe('CLAS received date range', () => {
  const applied = { from: '2026-09-23T00:00:00', to: '2026-09-27T00:00:00' };

  it('includes both selected days in the year of the applied period', () => {
    expect(resolveOperationDays({ from: '09-24', to: '09-25' }, applied)).toEqual({
      from: '2026-09-24T00:00:00', to: '2026-09-26T00:00:00',
    });
  });

  it.each([
    ['12-31', '01-01', '2026-12-31T00:00:00', '2027-01-02T00:00:00'],
    ['01-01', '01-02', '2027-01-01T00:00:00', '2027-01-03T00:00:00'],
  ])('resolves %s through %s inside a period spanning New Year', (from, to, expectedFrom, expectedTo) => {
    expect(resolveOperationDays({ from, to }, { from: '2026-12-30T00:00:00', to: '2027-01-03T00:00:00' })).toEqual({
      from: expectedFrom, to: expectedTo,
    });
  });

  it.each([
    ['09-20', '09-21'], // wholly outside
    ['09-22', '09-24'], // starts outside
    ['09-25', '09-27'], // inclusive end begins at the applied exclusive end
    ['09-25', '09-24'], // reversed
    ['09-24', '09-31'], // invalid calendar date
    ['9-24', '09-25'], // invalid format
  ])('ignores %s through %s when invalid or outside the applied period', (from, to) => {
    expect(resolveOperationDays({ from, to }, applied)).toBeNull();
  });

  it('requires the full first and last day to fit even at a partial-day boundary', () => {
    expect(resolveOperationDays({ from: '09-23', to: '09-25' }, { ...applied, from: '2026-09-23T09:00:00' })).toBeNull();
  });
});
