import { describe, expect, it } from 'vitest';
import { beforeAfterPeriods, ContractError } from '@ap/contracts';

/** Asserts the call fails with the time parser's contract error and code, not just any throw. */
function expectInvalidTime(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ContractError);
    expect((error as ContractError).code).toBe('invalid_time');
    return;
  }
  throw new Error('expected the call to throw');
}

describe('beforeAfterPeriods (chart.md §16 Compare, wall-clock 06 §6.3, #1243)', () => {
  it('cuts one reference time into two adjacent half-open periods; the reference belongs to the after period', () => {
    expect(beforeAfterPeriods('2026-11-04T09:00:00', { before: { days: 7 }, after: { days: 7 } })).toEqual({
      before: { from: '2026-10-28T09:00:00', to: '2026-11-04T09:00:00' },
      after: { from: '2026-11-04T09:00:00', to: '2026-11-11T09:00:00' },
    });
  });

  it('takes independent lengths in hours or days (1 day = 24 h of wall-clock digits)', () => {
    expect(beforeAfterPeriods('2026-11-04T09:30:15', { before: { hours: 6 }, after: { days: 2 } })).toEqual({
      before: { from: '2026-11-04T03:30:15', to: '2026-11-04T09:30:15' },
      after: { from: '2026-11-04T09:30:15', to: '2026-11-06T09:30:15' },
    });
  });

  it('crosses month, year and leap-day boundaries by calendar digits, never by time zone', () => {
    expect(beforeAfterPeriods('2024-03-01T00:00:00', { before: { days: 1 }, after: { days: 1 } })).toEqual({
      before: { from: '2024-02-29T00:00:00', to: '2024-03-01T00:00:00' },
      after: { from: '2024-03-01T00:00:00', to: '2024-03-02T00:00:00' },
    });
    expect(beforeAfterPeriods('2026-01-01T00:00:00', { before: { days: 1 }, after: { days: 1 } }).before.from).toBe('2025-12-31T00:00:00');
    // A DST-observing local zone would skip or repeat an hour here; wall-clock digits do not.
    expect(beforeAfterPeriods('2026-03-29T12:00:00', { before: { hours: 24 }, after: { hours: 24 } }).before.from).toBe('2026-03-28T12:00:00');
  });

  it('cuts the after period at `until`, and returns null when nothing after the reference is queryable', () => {
    const windows = { before: { days: 7 }, after: { days: 7 } };
    expect(beforeAfterPeriods('2026-11-04T09:00:00', windows, { until: '2026-11-06T00:00:00' }).after).toEqual({ from: '2026-11-04T09:00:00', to: '2026-11-06T00:00:00' });
    expect(beforeAfterPeriods('2026-11-04T09:00:00', windows, { until: '2026-12-01T00:00:00' }).after?.to).toBe('2026-11-11T09:00:00');
    expect(beforeAfterPeriods('2026-11-04T09:00:00', windows, { until: '2026-11-04T09:00:00' }).after).toBeNull();
    expect(beforeAfterPeriods('2026-11-04T09:00:00', windows, { until: '2026-11-01T00:00:00' }).after).toBeNull();
    // `until` never touches the before period.
    expect(beforeAfterPeriods('2026-11-04T09:00:00', windows, { until: '2026-11-01T00:00:00' }).before.to).toBe('2026-11-04T09:00:00');
  });

  it.each([
    ['a date-only reference', '2026-11-04', { before: { days: 1 }, after: { days: 1 } }],
    ['a Z / offset reference', '2026-11-04T09:00:00Z', { before: { days: 1 }, after: { days: 1 } }],
    ['a non-calendar reference', '2026-02-30T09:00:00', { before: { days: 1 }, after: { days: 1 } }],
    ['a zero length', '2026-11-04T09:00:00', { before: { days: 0 }, after: { days: 1 } }],
    ['a negative length', '2026-11-04T09:00:00', { before: { days: 1 }, after: { hours: -3 } }],
    ['a fractional length', '2026-11-04T09:00:00', { before: { hours: 1.5 }, after: { days: 1 } }],
    ['a length with both units', '2026-11-04T09:00:00', { before: { hours: 1, days: 1 }, after: { days: 1 } }],
    ['a length with neither unit', '2026-11-04T09:00:00', { before: {}, after: { days: 1 } }],
  ])('rejects %s', (_label, at, windows) => {
    expectInvalidTime(() => beforeAfterPeriods(at, windows as never));
  });

  it('rejects an `until` that is not wall-clock', () => {
    expectInvalidTime(() => beforeAfterPeriods('2026-11-04T09:00:00', { before: { days: 1 }, after: { days: 1 } }, { until: '2026-11-05' }));
  });

  it('rejects fractional days on either side — the chosen unit value is validated before the ×24 conversion', () => {
    expectInvalidTime(() => beforeAfterPeriods('2026-11-04T09:00:00', { before: { days: 0.5 }, after: { days: 1 } }));
    expectInvalidTime(() => beforeAfterPeriods('2026-11-04T09:00:00', { before: { days: 1 }, after: { days: 1 / 24 } }));
  });

  it('keeps a valid `until` cut working at the year-9999 upper bound, and errors on a shift beyond it', () => {
    const windows = { before: { hours: 1 }, after: { days: 1 } };
    expect(beforeAfterPeriods('9999-12-31T12:00:00', windows, { until: '9999-12-31T18:00:00' })).toEqual({
      before: { from: '9999-12-31T11:00:00', to: '9999-12-31T12:00:00' },
      after: { from: '9999-12-31T12:00:00', to: '9999-12-31T18:00:00' },
    });
    // Without `until` the after shift itself lands in year 10000: an error, never `after: null` or malformed text.
    expectInvalidTime(() => beforeAfterPeriods('9999-12-31T12:00:00', windows));
  });

  it('errors when the before period crosses below year 0100, and keeps the boundary itself usable', () => {
    expectInvalidTime(() => beforeAfterPeriods('0100-01-01T00:00:00', { before: { days: 1 }, after: { days: 1 } }));
    expect(beforeAfterPeriods('0100-01-02T00:00:00', { before: { days: 1 }, after: { days: 1 } })).toEqual({
      before: { from: '0100-01-01T00:00:00', to: '0100-01-02T00:00:00' },
      after: { from: '0100-01-02T00:00:00', to: '0100-01-03T00:00:00' },
    });
  });
});
