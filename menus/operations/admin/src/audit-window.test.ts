import { describe, expect, it } from 'vitest';
import { instantToLocalField, localFieldToInstant } from './audit-window';

describe('audit window local field (#305)', () => {
  it('round-trips a Seoul local time through a zoned instant', () => {
    expect(localFieldToInstant('2026-09-26 11:00:00', 'Asia/Seoul')).toEqual({
      ok: true,
      instant: '2026-09-26T02:00:00.000Z',
    });
    expect(instantToLocalField('2026-09-26T02:00:00.000Z', 'Asia/Seoul')).toBe('2026-09-26 11:00:00');
  });

  it('rejects an impossible calendar value', () => {
    const result = localFieldToInstant('2026-02-30 00:00:00', 'Asia/Seoul');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('calendar');
  });

  it('rejects a New York spring gap and an autumn fold instead of picking an instant', () => {
    expect(localFieldToInstant('2026-03-08 02:30:00', 'America/New_York')).toEqual({ ok: false, reason: 'gap' });
    expect(localFieldToInstant('2026-11-01 01:30:00', 'America/New_York')).toEqual({ ok: false, reason: 'fold' });
    // Neighbors of the transition are unique and must still convert.
    expect(localFieldToInstant('2026-03-08 01:30:00', 'America/New_York')).toEqual({ ok: true, instant: '2026-03-08T06:30:00.000Z' });
    expect(localFieldToInstant('2026-03-08 03:30:00', 'America/New_York')).toEqual({ ok: true, instant: '2026-03-08T07:30:00.000Z' });
    expect(localFieldToInstant('2026-11-01 00:30:00', 'America/New_York').ok).toBe(true);
    expect(localFieldToInstant('2026-11-01 02:30:00', 'America/New_York').ok).toBe(true);
  });

  it('shows a fractional instant in the same local second, without rounding up', () => {
    expect(instantToLocalField('2026-09-26T02:00:00.500Z', 'Asia/Seoul')).toBe('2026-09-26 11:00:00');
  });

  it('round-trips years below 100 without the Date.UTC 1900 shift and pads the year to four digits', () => {
    expect(localFieldToInstant('0001-01-01 00:00:00', 'UTC')).toEqual({ ok: true, instant: '0001-01-01T00:00:00.000Z' });
    expect(instantToLocalField('0001-01-01T00:00:00.000Z', 'UTC')).toBe('0001-01-01 00:00:00');
    expect(instantToLocalField('0999-01-01T00:00:00Z', 'UTC')).toBe('0999-01-01 00:00:00');
  });
});
