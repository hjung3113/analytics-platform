import { describe, expect, it } from 'vitest';

import { seoulWallClock, seoulWallClockMinute } from '../seoul-clock.js';

describe('seoulWallClock', () => {
  it('formats Asia/Seoul wall-clock time at second precision', () => {
    expect(seoulWallClock(new Date('2026-10-29T00:00:59.999Z'))).toBe('2026-10-29T09:00:59');
  });

  it('rolls the date over at 15:00 UTC', () => {
    expect(seoulWallClock(new Date('2026-10-29T15:00:00Z'))).toBe('2026-10-30T00:00:00');
    expect(seoulWallClock(new Date('2026-12-31T14:59:59Z'))).toBe('2026-12-31T23:59:59');
  });

  it('keeps the bootstrap minute output truncated to :00', () => {
    expect(seoulWallClockMinute(new Date('2026-10-29T00:00:59.999Z'))).toBe('2026-10-29T09:00:00');
  });
});
