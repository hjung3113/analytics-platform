import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHUTDOWN_BOSS_TIMEOUT_MS, SHUTDOWN_DEADLINE_MS, createDrainState, createShutdown } from '../shutdown.js';

function harness(overrides: { stopBoss?: () => Promise<void>; closeApp?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  const drain = createDrainState();
  const log = { info: vi.fn(), error: vi.fn() };
  const exit = vi.fn();
  const stopBoss = vi.fn(async (_opts: { timeoutMs: number }) => {
    calls.push(`boss(draining=${drain.isDraining()})`);
    await overrides.stopBoss?.();
  });
  const closeApp = vi.fn(async () => {
    calls.push('app');
    await overrides.closeApp?.();
  });
  const closePool = vi.fn(async () => {
    calls.push('pool');
  });
  const shutdown = createShutdown({ drain, log, stopBoss, closeApp, closePool, exit });
  return { calls, drain, log, exit, stopBoss, closeApp, closePool, shutdown };
}

describe('createShutdown (#1266 b3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not draining until the first signal, then drains before pg-boss stops', async () => {
    const h = harness();
    expect(h.drain.isDraining()).toBe(false);
    await h.shutdown('SIGTERM');
    expect(h.calls[0]).toBe('boss(draining=true)');
  });

  it('stops pg-boss, then Fastify, then the pool, with the 30 s boss budget, and exits 0', async () => {
    const h = harness();
    await h.shutdown('SIGTERM');
    expect(h.calls).toEqual(['boss(draining=true)', 'app', 'pool']);
    expect(h.stopBoss).toHaveBeenCalledWith({ timeoutMs: SHUTDOWN_BOSS_TIMEOUT_MS });
    expect(SHUTDOWN_BOSS_TIMEOUT_MS).toBe(30_000);
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(0);
  });

  it('is single-shot: a second signal does nothing', async () => {
    const h = harness();
    await h.shutdown('SIGTERM');
    await h.shutdown('SIGINT');
    expect(h.stopBoss).toHaveBeenCalledTimes(1);
    expect(h.closePool).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when a step throws', async () => {
    const h = harness({
      closeApp: async () => {
        throw new Error('close failed');
      },
    });
    await h.shutdown('SIGTERM');
    expect(h.closePool).not.toHaveBeenCalled();
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.log.error).toHaveBeenCalled();
  });

  it('logs and exits 1 when the 40 s deadline passes with a step still running', async () => {
    const h = harness({ stopBoss: () => new Promise<never>(() => {}) });
    void h.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(SHUTDOWN_DEADLINE_MS - 1);
    expect(h.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(SHUTDOWN_DEADLINE_MS).toBe(40_000);
    expect(h.exit).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineMs: SHUTDOWN_DEADLINE_MS }),
      expect.stringContaining('deadline'),
    );
    expect(h.closeApp).not.toHaveBeenCalled();
  });

  it('a clean shutdown cancels the deadline timer', async () => {
    const h = harness();
    await h.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(SHUTDOWN_DEADLINE_MS * 2);
    expect(h.exit).toHaveBeenCalledTimes(1);
  });
});
