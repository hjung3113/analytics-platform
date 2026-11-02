// DB time-budget errors → HTTP 503 (#1266 b3, ADR-0012 envelope).
//
// The runtime pool sets statement_timeout / lock_timeout /
// idle_in_transaction_session_timeout and a pool acquire timeout (db/client.ts).
// When one of them fires the request fails fast with a retryable 503
// `service.unavailable` instead of an opaque 500. Shared by the root error
// handler and the plugin-scoped platform transport handler.

import type { FastifyReply, FastifyRequest } from 'fastify';

import { statusForCode } from './errors.js';

/** Postgres SQLSTATEs raised by the budgets. */
const TIMEOUT_SQLSTATES: ReadonlySet<string> = new Set([
  '57014', // query_canceled (statement_timeout)
  '55P03', // lock_not_available (lock_timeout)
  '25P03', // idle_in_transaction_session_timeout
]);

/** pg-pool raises these without a code when `connectionTimeoutMillis` expires. */
const ACQUIRE_TIMEOUT_MESSAGES: ReadonlySet<string> = new Set([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
]);

/**
 * After PostgreSQL kills a checked-out session (25P03 etc.) the transaction's
 * ROLLBACK fails with one of these pg-client messages and replaces the original
 * reason; the original is reported by the client error listener (db/client.ts).
 */
const CONNECTION_LOST_MESSAGES: ReadonlySet<string> = new Set([
  'Client has encountered a connection error and is not queryable',
  'Connection terminated unexpectedly',
  'Connection terminated',
]);

export type DbTimeoutKind =
  | 'statement'
  | 'lock'
  | 'idle_in_transaction'
  | 'pool_acquire'
  | 'connection_lost';

const KIND_BY_SQLSTATE: Record<string, DbTimeoutKind> = {
  '57014': 'statement',
  '55P03': 'lock',
  '25P03': 'idle_in_transaction',
};

/** Classify `err` (or its `cause` chain) as a DB time-budget error, else null. */
export function dbTimeoutKind(err: unknown): DbTimeoutKind | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && TIMEOUT_SQLSTATES.has(code)) {
      return KIND_BY_SQLSTATE[code] ?? null;
    }
    if (ACQUIRE_TIMEOUT_MESSAGES.has(current.message)) return 'pool_acquire';
    if (CONNECTION_LOST_MESSAGES.has(current.message)) return 'connection_lost';
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Reply 503 `service.unavailable` when `err` is a DB time-budget error.
 * Returns the reply when handled, else null. The warn log carries the request
 * id (logger binding), the kind and the SQLSTATE only — never SQL text,
 * parameters, row data or the driver message.
 */
export function replyIfDbTimeout(
  err: unknown,
  req: FastifyRequest,
  reply: FastifyReply,
): FastifyReply | null {
  const kind = dbTimeoutKind(err);
  if (!kind) return null;
  const sqlstate = (err as { code?: unknown }).code;
  req.log.warn(
    { kind, ...(typeof sqlstate === 'string' ? { sqlstate } : {}) },
    'db time budget exceeded',
  );
  return reply.code(statusForCode('service.unavailable')).send({
    code: 'service.unavailable',
    message: 'service temporarily unavailable',
  });
}
