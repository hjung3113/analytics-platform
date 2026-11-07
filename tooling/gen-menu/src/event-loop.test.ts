import { afterAll, describe, expect, it } from 'vitest';
import { FIXTURE_GROUP, GEN_ARGS, makeFixture, removeFixture, runCli } from './fixture.ts';

/**
 * A synchronous spawn blocks the Vitest worker's event loop for the whole CLI run, which starves its onTaskUpdate RPC
 * heartbeat on a loaded runner and fails main CI with every test passing (#1433, same class as #771/#1311).
 */
describe('test-path spawns keep the worker event loop running (#1433)', () => {
  const keep: string[] = [];
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('runCli lets timers fire while the CLI runs', async () => {
    const root = makeFixture();
    keep.push(root);
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 20);
    try {
      const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
      expect(res.status, res.stderr).toBe(0);
    } finally {
      clearInterval(timer);
    }
    // A blocking spawn leaves ticks at 0 or 1 for a run of several hundred ms.
    expect(ticks).toBeGreaterThan(3);
  });
});
