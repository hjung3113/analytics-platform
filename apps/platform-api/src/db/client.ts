// Postgres client factory. Two flavours coexist in this codebase:
//   * the runtime app client, connecting as platform_app (DATABASE_URL).
//   * operator scripts (seed, migrate, tests of role separation) connecting as
//     platform_migrate via DATABASE_URL_MIGRATE.
//
// The factory takes the URL explicitly so callers can't accidentally pick up
// the wrong role from process.env.

import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as core from './schema/core.js';
import * as permission from './schema/permission.js';

const schema = { ...core, ...permission };

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

/**
 * Runtime DB time budgets (#1266 b3). Passed explicitly by the runtime entry
 * point; operator/migrate/seed/test pools omit it and keep server defaults so
 * long migrations are never cut.
 */
export interface DbTimeBudgets {
  poolMax: number;
  acquireTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  idleInTransactionTimeoutMs: number;
}

export interface CreateDbOptions {
  budgets?: DbTimeBudgets;
  /**
   * Called for an error on an idle pooled client (e.g. the server restarted).
   * Without a listener Node would crash on the unhandled 'error' event; with
   * one the pool drops the client and carries on. Given only to runtime pools.
   */
  onPoolError?: (err: Error) => void;
}

export function createDb(url: string, opts: CreateDbOptions = {}): DbHandle {
  const { budgets, onPoolError } = opts;
  const pool = new pg.Pool({
    connectionString: url,
    ...(budgets
      ? {
          max: budgets.poolMax,
          connectionTimeoutMillis: budgets.acquireTimeoutMs,
          statement_timeout: budgets.statementTimeoutMs,
          lock_timeout: budgets.lockTimeoutMs,
          idle_in_transaction_session_timeout: budgets.idleInTransactionTimeoutMs,
        }
      : {}),
  });
  if (onPoolError) attachPoolErrorListener(pool, onPoolError);
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

/** Pool 'error' listener for pools built outside createDb (e.g. the self-approval pool). */
export function attachPoolErrorListener(pool: pg.Pool, onPoolError: (err: Error) => void): void {
  pool.on('error', (err) => {
    // A throwing listener would itself be an uncaught exception.
    try {
      onPoolError(err);
    } catch {
      // logging must never take the process down
    }
  });
}

export type { DrizzleTx, Tx } from './tx.js';
