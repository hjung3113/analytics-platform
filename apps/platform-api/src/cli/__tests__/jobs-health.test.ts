import { describe, expect, it } from 'vitest';

import { cronPeriodMs } from '../jobs-health.js';

describe('scheduled-job cadence', () => {
  it.each([
    ['* * * * *', 60_000],
    ['*/5 * * * *', 300_000],
    ['*/10 * * * *', 600_000],
    ['*/15 * * * *', 900_000],
    ['0 * * * *', 3_600_000],
    ['15 * * * *', 3_600_000],
    ['30 * * * *', 3_600_000],
    ['30 3 * * *', 86_400_000],
    ['45 3 * * *', 86_400_000],
    ['*/7 * * * *', 420_000],
  ])('derives %s from its expression', (cron, period) => {
    expect(cronPeriodMs(cron)).toBe(period);
  });

  it.each(['bad', '0 25 * * *', '*/0 * * * *', '0 0 * * 1'])('fails closed for unsupported cron %s', (cron) => {
    expect(() => cronPeriodMs(cron)).toThrow();
  });
});
