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

/**
 * Error handling for pools built outside createDb (e.g. the self-approval pool).
 *
 * Two layers, because pg-pool only covers idle clients: it removes its own
 * client 'error' listener while a client is checked out, and drizzle's
 * transaction client installs none. PostgreSQL terminating a checked-out
 * session (e.g. 25P03 after idle_in_transaction_session_timeout while the code
 * awaits non-DB work) would otherwise emit an unhandled 'error' and kill the
 * process. So:
 *   - pool 'error' covers idle clients;
 *   - a client-level listener, installed once per client on 'connect', covers
 *     the client's whole life. pg marks the errored client non-queryable, so
 *     pg-pool discards it on release instead of reusing it.
 * Each client is reported once (checked-out clients report here, idle ones via
 * the pool event). Must be called before the pool creates its first client
 * (throws otherwise); createDb does so at construction.
 */
export function attachPoolErrorListener(pool: pg.Pool, onPoolError: (err: Error) => void): void {
  // pg-pool emits 'connect' only for new clients, so a client that already
  // exists would never get the client-level listener (and idle clients are not
  // enumerable through the public API). Attach at construction, before first use.
  if (pool.totalCount > 0) {
    throw new Error('attachPoolErrorListener must be called before the pool creates any client');
  }
  // One disconnect → one report per client: the server error (e.g. 25P03) is
  // followed by the socket end ("Connection terminated unexpectedly").
  const reported = new WeakSet<object>();
  const report = (err: Error, client?: object): void => {
    if (client) {
      if (reported.has(client)) return;
      reported.add(client);
    }
    // A throwing listener would itself be an uncaught exception.
    try {
      onPoolError(err);
    } catch {
      // logging must never take the process down
    }
  };
  const checkedOut = new WeakSet<pg.PoolClient>();
  pool.on('acquire', (client) => checkedOut.add(client));
  pool.on('release', (_err, client) => checkedOut.delete(client));
  pool.on('connect', (client) => {
    client.on('error', (err: Error) => {
      if (checkedOut.has(client)) report(err, client);
    });
  });
  pool.on('error', (err, client) => report(err, client));
}

export type { DrizzleTx, Tx } from './tx.js';
