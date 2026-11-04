// In-process admission of the heavy import work (#1195 b3): at most two parses and at most two apply runs at a time
// per process, shared by the HTTP routes and the menu actions. A caller that finds no free slot is told to retry at
// once; nobody waits while holding a transaction or a pool connection.

import pg from 'pg';

export interface Slots {
  /** Takes a slot, or `null` when all are busy. The returned function gives it back (idempotent). */
  tryTake(): (() => void) | null;
}

export function createSlots(max: number): Slots {
  let taken = 0;
  return {
    tryTake() {
      if (taken >= max) return null;
      taken += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        taken -= 1;
      };
    },
  };
}

export const IMPORT_PARSE_CONCURRENCY = 2;
export const IMPORT_APPLY_CONCURRENCY = 2;

/** One per process: the upload route and `importPaste` share it. */
export const parseSlots = createSlots(IMPORT_PARSE_CONCURRENCY);
/** One per process: the apply route and `importApply` share it. */
export const applySlots = createSlots(IMPORT_APPLY_CONCURRENCY);

/**
 * The runner pool of `importApply` (#1195 b3 FIX1 C1). The menu engine holds a command-pool connection for the whole
 * action (idempotency record + the (actor, key) advisory lock), so a runner that took its connection from the same
 * pool could wait on connections that only its own action, or same-key followers parked on its lock, can free.
 * This separate pool is sized to the apply slots (each run pins one connection, at most `IMPORT_APPLY_CONCURRENCY`
 * runs at once, including the route's, which never needs more than a slot) and inherits the runtime time budgets of
 * the command pool, tightened to the apply budget: a connection is acquired within a third of the budget (500 ms to
 * 5 s) and no statement runs longer than the budget (at least 1 s). The apply route keeps the command pool: it holds
 * no outer connection, so it has no cycle, and its single-connection regression pins that.
 */
export function createApplyRunnerPool(base: pg.PoolConfig, budgetMs: number): pg.Pool {
  const statementCap = Math.max(1_000, budgetMs);
  return new pg.Pool({
    ...base,
    max: IMPORT_APPLY_CONCURRENCY,
    connectionTimeoutMillis: Math.min(5_000, Math.max(500, Math.floor(budgetMs / 3))),
    statement_timeout: Math.min(typeof base.statement_timeout === 'number' ? base.statement_timeout : statementCap, statementCap),
  });
}
