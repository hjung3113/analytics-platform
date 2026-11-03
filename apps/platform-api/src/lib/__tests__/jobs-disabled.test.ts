import { beforeEach, describe, expect, it, vi } from 'vitest';

const bossInstances: Array<{ options: Record<string, unknown>; start: ReturnType<typeof vi.fn> }> =
  [];
vi.mock('pg-boss', () => ({
  PgBoss: class {
    options: Record<string, unknown>;
    start = vi.fn(async () => undefined);
    on = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      bossInstances.push(this);
    }
  },
}));

import type { JobLog } from '../job-log.js';
import { initBoss, registerJobsUnlessDisabled } from '../jobs.js';

const log = (): JobLog & { info: ReturnType<typeof vi.fn> } => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

beforeEach(() => {
  bossInstances.length = 0;
});

describe('JOBS_DISABLED (#1266 restore verification)', () => {
  it('starts pg-boss without the supervisor and the cron scheduler', async () => {
    await initBoss({ connectionString: 'postgres://x', log: log(), jobsDisabled: true });
    expect(bossInstances[0]?.options).toMatchObject({ supervise: false, schedule: false });
    expect(bossInstances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it('keeps supervision and cron on by default', async () => {
    await initBoss({ connectionString: 'postgres://x', log: log() });
    expect(bossInstances[0]?.options).toMatchObject({ supervise: true, schedule: true });
  });

  it('registers no worker and no schedule, and logs one line', async () => {
    const logger = log();
    const registrars = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    await registerJobsUnlessDisabled(true, logger, registrars);
    for (const registrar of registrars) expect(registrar).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('jobs disabled');
  });

  it('runs every registrar in order when jobs are enabled', async () => {
    const order: number[] = [];
    const logger = log();
    await registerJobsUnlessDisabled(false, logger, [
      async () => void order.push(1),
      async () => void order.push(2),
    ]);
    expect(order).toEqual([1, 2]);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
