import { describe, expect, it } from 'vitest';
import { timeInputIn } from '../timeInput';

describe('lifecycle instant input adapter (#2587)', () => {
  it.each([
    ['Europe/Berlin', '2026-11-07T09:30', '2026-11-07T08:30:00.000Z'],
    ['Asia/Kathmandu', '2026-11-07T15:15', '2026-11-07T09:30:00.000Z'],
    ['America/St_Johns', '2026-11-07T06:00', '2026-11-07T09:30:00.000Z'],
  ])('%s reads %s as %s and shows it back', (zone, local, instant) => {
    const input = timeInputIn(zone);
    expect(input.fromLocal(local)).toEqual({ ok: true, instant });
    expect(input.toLocal(instant)).toBe(local);
  });
  it.each([
    ['2026-03-29T02:30', 'gap'],
    ['2026-10-25T02:30', 'fold'],
  ] as const)('refuses Berlin %s as a DST %s instead of moving or guessing', (local, reason) => {
    expect(timeInputIn('Europe/Berlin').fromLocal(local)).toEqual({ ok: false, reason });
  });
  it('shows an offset instant in the zone and refuses an unknown zone', () => {
    expect(timeInputIn('Europe/Berlin').toLocal('2026-11-07T09:30:00+09:00')).toBe('2026-11-07T01:30');
    expect(timeInputIn('Not/AZone').fromLocal('2026-11-07T09:30')).toEqual({ ok: false, reason: 'zone' });
    expect(timeInputIn('Not/AZone').toLocal('2026-11-07T09:30:00Z')).toBeNull();
  });
});
