import pg from 'pg';

import { sqlPlaceholders } from '../../bundle/sql-placeholders.js';
import type { Target } from '../../bundle/targets.js';
import type { TargetSecrets } from '../../bundle/secrets.js';
import { MenuUpstreamError } from '../../forwarder.js';
import { TargetJudgmentTimeout, type Connector } from '../types.js';

type SqlTarget = Extract<Target, { kind: 'sql' }>;
// pg 8.13 supports queryMode; the pinned older @types/pg omits that field.
const extended = (text: string, values?: unknown[]): pg.QueryConfig & { queryMode: 'extended' } => ({ text, ...(values ? { values } : {}), queryMode: 'extended' });
const templates = new Map<string, { text: string; names: string[] }>();
/** Use the existing dialect lexer for both names and each candidate's lexical position. */
export function rewriteStatement(statement: string, params: Readonly<Record<string, unknown>>): { text: string; values: unknown[] } {
  let template = templates.get(statement);
  if (!template) {
    const names = sqlPlaceholders(statement, 'postgres');
    let probe = '__ap_probe';
    while (statement.includes(probe)) probe += '_';
    const text = statement.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (whole: string, name: string, offset: number) => {
      if (statement[offset - 1] === ':' || !sqlPlaceholders(`${statement.slice(0, offset)}:${probe}`, 'postgres').includes(probe)) return whole;
      return `$${names.indexOf(name) + 1}`;
    });
    template = { text, names };
    templates.set(statement, template);
  }
  if (template.names.some((name) => !Object.hasOwn(params, name))) throw new MenuUpstreamError('unavailable');
  return { text: template.text, values: template.names.map((name) => params[name]) };
}

/** Native DECLARE/FETCH is a server cursor; FETCH 1 bounds pulls without altering the source SQL. */
export function createPostgresConnector(target: SqlTarget, secrets: TargetSecrets | undefined): Connector {
  if (secrets?.kind !== 'sql') throw new MenuUpstreamError('unavailable');
  const connectionString = secrets.connection.reveal().trim();
  const max = target.pool?.max ?? 4;
  const concurrency = Math.min(max, target.pool?.concurrency ?? 2);
  const pool = new pg.Pool({
    connectionString, max, application_name: target.applicationName,
    connectionTimeoutMillis: 1000, idleTimeoutMillis: 1000, allowExitOnIdle: true,
    types: { getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
      if (format !== 'binary' && [20, 1700, 1114, 1082].includes(oid)) return (value: string) => value;
      return format === 'binary' ? pg.types.getTypeParser(oid, 'binary') : pg.types.getTypeParser(oid, 'text');
    }) as typeof pg.types.getTypeParser },
  });
  // Idle errors must never enter pg's default unhandled-error path with driver diagnostics.
  pool.on('error', () => {});
  let active = 0;
  const waiters = new Set<() => void>();
  return {
    async *query(leg, { signal, deadlineMs, rowCap }) {
      if (leg.site !== null && leg.rooms.length === 0) return;
      if (!('statement' in leg.call) || !Number.isSafeInteger(rowCap) || rowCap <= 0) throw new MenuUpstreamError('unavailable');
      if (signal.aborted) throw new MenuUpstreamError('timeout');
      if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new TargetJudgmentTimeout();
      const expires = Date.now() + deadlineMs;
      let client: pg.PoolClient | undefined;
      let pid: number | undefined;
      let cursor = false;
      let transaction = false;
      let completed = false;
      let acquired = false;
      let failure: Error | undefined;
      let cleaning: Promise<void> | undefined;
      let wake: (() => void) | undefined;
      let rejectStop: (error: Error) => void = () => {};
      const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
      // Attach immediately, including while the iterator is suspended at yield.
      void stopped.catch(() => {});
      const cleanup = (cancel: boolean): Promise<void> => {
        if (cleaning) return cleaning;
        cleaning = (async () => {
          if (!client) return;
          let destroy = false;
          if (cancel && pid !== undefined) {
            const canceller = new pg.Client({ connectionString, application_name: target.applicationName, connectionTimeoutMillis: 1000, query_timeout: 1000 });
            try {
              await canceller.connect();
              await canceller.query(extended('SELECT pg_cancel_backend($1)', [pid]));
            } catch { destroy = true; }
            finally { await canceller.end().catch(() => {}); }
          }
          try {
            if (!destroy) {
              if (cursor) await client.query(extended('CLOSE ap_rows'));
              if (transaction || cancel) await client.query(extended(completed ? 'COMMIT' : 'ROLLBACK'));
            }
          } catch {
            // CLOSE in an aborted transaction fails; ROLLBACK must still run.
            try { await client.query(extended('ROLLBACK')); } catch { destroy = true; }
          } finally { client.release(destroy); }
        })();
        return cleaning;
      };
      const stop = (error: Error) => {
        failure ??= error; rejectStop(failure); wake?.();
        void cleanup(true);
      };
      const onAbort = () => stop(new MenuUpstreamError('timeout'));
      signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => stop(new TargetJudgmentTimeout()), Math.min(deadlineMs, 2147483647));
      const run = async (text: string, values?: unknown[]) => {
        if (failure) throw failure;
        if (!client) throw new MenuUpstreamError('unavailable');
        return Promise.race([client.query(extended(text, values)), stopped]);
      };
      try {
        while (active >= concurrency) {
          await Promise.race([new Promise<void>((resolve) => { wake = resolve; waiters.add(resolve); }), stopped]);
          if (wake) waiters.delete(wake);
        }
        if (failure) throw failure;
        active++; acquired = true;
        const pending = pool.connect();
        void pending.then((late) => { if (failure && !client) late.release(true); }, () => {});
        client = await Promise.race([pending, stopped]);
        const backend = await run('SELECT pg_backend_pid() AS pid');
        pid = backend.rows[0]?.pid as number | undefined;
        await run('BEGIN READ ONLY'); transaction = true;
        const remaining = Math.max(1, Math.floor(expires - Date.now()));
        await run(`SET LOCAL statement_timeout = ${remaining}`);
        const statement = rewriteStatement(leg.call.statement, leg.bindings.params ?? {});
        await run(`DECLARE ap_rows NO SCROLL CURSOR FOR ${statement.text}`, statement.values); cursor = true;
        for (let count = 0; count < rowCap; count++) {
          const result = await run('FETCH FORWARD 1 FROM ap_rows');
          if (failure) throw failure;
          if (!result.rows.length) break;
          yield result.rows[0];
        }
        if (failure) throw failure;
        completed = true;
      } catch (error) {
        if (failure) throw failure;
        if (error && typeof error === 'object' && 'code' in error && error.code === '57014') throw new TargetJudgmentTimeout();
        throw new MenuUpstreamError('unavailable');
      } finally {
        clearTimeout(timer); signal.removeEventListener('abort', onAbort);
        if (wake) waiters.delete(wake);
        await cleanup(!completed);
        if (acquired) { active--; for (const waiter of waiters) waiter(); }
      }
    },
  };
}
