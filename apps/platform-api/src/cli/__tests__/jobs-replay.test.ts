import { describe, expect, it, vi } from 'vitest';

import { type ReplayOptions, replayFailedJobs, runReplay } from '../jobs-replay.js';

const options: ReplayOptions = {
  queue: 'notifications.dispatch',
  state: 'failed',
  limit: 10,
  apply: true,
};

function db(ids: string[]) {
  return {
    query: vi.fn().mockResolvedValue({ rows: ids.map((id) => ({ id })) }),
  } as never;
}

describe('jobs-replay', () => {
  it('closes both pools and rejects when boss.start() throws', async () => {
    const pool = { query: vi.fn(), end: vi.fn().mockResolvedValue(undefined) };
    const bossPool = { end: vi.fn().mockResolvedValue(undefined) };
    const boss = {
      start: vi.fn().mockRejectedValue(new Error('schema mismatch')),
      stop: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn(),
    };
    await expect(runReplay(options, { pool, bossPool, boss } as never)).rejects.toThrow(
      'schema mismatch',
    );
    expect(bossPool.end).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled();
    expect(boss.retry).not.toHaveBeenCalled();
  });

  it('reports retried from the affected count, not the selection', async () => {
    const boss = { retry: vi.fn().mockResolvedValue({ jobs: [], requested: 2, affected: 1 }) };
    const summary = await replayFailedJobs(db(['a', 'b']), boss, options);
    expect(summary).toMatchObject({ selected: 2, retried: 1, job_ids: ['a', 'b'] });
  });

  it('fails instead of guessing when retry returns no affected count', async () => {
    const boss = { retry: vi.fn().mockResolvedValue(undefined) };
    await expect(replayFailedJobs(db(['a']), boss, options)).rejects.toThrow(/affected/);
  });
});
