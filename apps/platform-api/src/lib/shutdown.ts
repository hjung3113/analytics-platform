// Graceful shutdown orchestration (FO ADR-0009, #1266 b3).
//
// Order: mark draining (readiness turns 503 so the load balancer stops sending
// traffic) → pg-boss drains (jobs may still need the HTTP path) → Fastify
// closes → the DB pool closes. The whole sequence is bounded: when the deadline
// passes the process logs and exits 1 instead of waiting for the orchestrator's
// SIGKILL. Single-shot: later signals are ignored.

/** Injectable draining state shared by shutdown and the health routes (no module global). */
export interface DrainState {
  isDraining(): boolean;
  beginDraining(): void;
}

export function createDrainState(): DrainState {
  let draining = false;
  return {
    isDraining: () => draining,
    beginDraining: () => {
      draining = true;
    },
  };
}

/** Total shutdown budget; the compose `stop_grace_period` (45 s) must exceed it. */
export const SHUTDOWN_DEADLINE_MS = 40_000;
/** Share of the budget pg-boss may use to drain; the rest covers app.close() + pool close. */
export const SHUTDOWN_BOSS_TIMEOUT_MS = 30_000;

export interface ShutdownLog {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface ShutdownDeps {
  drain: DrainState;
  log: ShutdownLog;
  stopBoss(opts: { timeoutMs: number }): Promise<void>;
  closeApp(): Promise<void>;
  closePool(): Promise<void>;
  exit(code: number): void;
  deadlineMs?: number;
  bossTimeoutMs?: number;
}

export function createShutdown(deps: ShutdownDeps): (signal: string, code?: number) => Promise<void> {
  const deadlineMs = deps.deadlineMs ?? SHUTDOWN_DEADLINE_MS;
  const bossTimeoutMs = deps.bossTimeoutMs ?? SHUTDOWN_BOSS_TIMEOUT_MS;
  let started = false;
  let finished = false;

  return async function shutdown(signal, code = 0) {
    if (started) return;
    started = true;
    deps.drain.beginDraining();
    deps.log.info({ signal }, 'shutting down');

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      deps.log.error({ signal, deadlineMs }, 'shutdown deadline exceeded; forcing exit');
      deps.exit(1);
    }, deadlineMs);
    timer.unref();

    try {
      await deps.stopBoss({ timeoutMs: bossTimeoutMs });
      await deps.closeApp();
      await deps.closePool();
    } catch (err) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      deps.log.error({ err }, 'error during shutdown');
      deps.exit(1);
      return;
    }
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    deps.exit(code);
  };
}
