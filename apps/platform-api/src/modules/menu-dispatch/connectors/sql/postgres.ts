import pg from 'pg';

import { sqlPlaceholderOccurrences, sqlPlaceholders } from '../../bundle/sql-placeholders.js';
import type { Target } from '../../bundle/targets.js';
import type { TargetSecrets } from '../../bundle/secrets.js';
import { MenuUpstreamError } from '../../forwarder.js';
import { TargetJudgmentTimeout, type Connector } from '../types.js';
import { createConcurrencyGate } from './shared.js';

type SqlTarget = Extract<Target, { kind: 'sql' }>;
// pg 8.13 supports queryMode; the pinned older @types/pg omits that field.
const extended = (text: string, values?: unknown[]): pg.QueryConfig & { queryMode: 'extended' } => ({ text, ...(values ? { values } : {}), queryMode: 'extended' });
const templates = new Map<string, { text: string; names: string[] }>();
/** Use the existing dialect lexer for both names and each candidate's lexical position. */
export function rewriteStatement(statement: string, params: Readonly<Record<string, unknown>>): { text: string; values: unknown[] } {
  let template = templates.get(statement);
  if (!template) {
    const names = sqlPlaceholders(statement, 'postgres');
    const live = new Set(sqlPlaceholderOccurrences(statement, 'postgres').map((found) => found.offset));
    const text = statement.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (whole: string, name: string, offset: number) => {
      if (statement[offset - 1] === ':' || !live.has(offset)) return whole;
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
  // Keep sanitized ownership from construction through socket destruction.
  const lifetimes = new WeakMap<pg.ClientBase, { failed: boolean; notify: (() => void) | undefined }>();
  const ownClient = (data: pg.ClientBase) => {
    let state = lifetimes.get(data);
    if (!state) {
      state = { failed: false, notify: undefined };
      lifetimes.set(data, state);
      const lifetime = state;
      data.on('error', () => { lifetime.failed = true; lifetime.notify?.(); });
    }
    return state;
  };
  class OwnedClient extends pg.Client {
    constructor(config?: pg.ClientConfig) {
      super(config);
      ownClient(this);
    }
  }
  const pool = new pg.Pool({
    Client: OwnedClient, connectionString, max, application_name: target.applicationName,
    connectionTimeoutMillis: 1000, idleTimeoutMillis: 1000, allowExitOnIdle: true,
    types: { getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
      if (format !== 'binary' && [20, 1700, 1114, 1082].includes(oid)) return (value: string) => value;
      return format === 'binary' ? pg.types.getTypeParser(oid, 'binary') : pg.types.getTypeParser(oid, 'text');
    }) as typeof pg.types.getTypeParser },
  });
  // Idle errors must never enter pg's default unhandled-error path with driver diagnostics.
  pool.on('error', () => {});
  // Idempotent fallback for injected pools that supply clients without our constructor.
  pool.on('connect', ownClient);
  const gate = createConcurrencyGate(concurrency);
  return {
    query(leg, { signal, deadlineMs, rowCap }): AsyncIterableIterator<unknown> {
      let returning = false;
      let interrupt = () => {};
      const rows = (async function* () {
      if (leg.site !== null && leg.rooms.length === 0) return;
      if (!('statement' in leg.call) || !Number.isSafeInteger(rowCap) || rowCap <= 0) throw new MenuUpstreamError('unavailable');
      if (signal.aborted) throw new MenuUpstreamError('timeout');
      if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new TargetJudgmentTimeout();
      const expires = Date.now() + deadlineMs;
      let client: pg.PoolClient | undefined;
      let pid: number | undefined;
      let lifetime: ReturnType<typeof ownClient> | undefined;
      let cancelSent = false;
      let statementStarted: number | undefined;
      let statementBudget = 0;
      let cursor = false;
      let transaction = false;
      let completed = false;
      let release: (() => void) | undefined;
      const releaseCapacity = () => release?.();
      let failure: Error | undefined;
      let cleaning: Promise<void> | undefined;
      let rejectStop: (error: Error) => void = () => {};
      const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
      // Attach immediately, including while the iterator is suspended at yield.
      void stopped.catch(() => {});
      let broken = false;
      let released = false;
      let rejectClient: (error: Error) => void = () => {};
      const clientFailed = new Promise<never>((_resolve, reject) => { rejectClient = reject; });
      void clientFailed.catch(() => {});
      const onClientError = () => {
        broken = true;
        const error = new MenuUpstreamError('unavailable');
        rejectClient(error);
        stop(error);
      };
      const cleanup = (cancel: boolean): Promise<void> => {
        if (cleaning) return cleaning;
        // An acquisition that loses the stop race is released by the pending callback.
        if (!client) return Promise.resolve();
        const data = client;
        cleaning = (async () => {
          let canceller: pg.Client | undefined;
          let bound: ReturnType<typeof setTimeout> | undefined;
          let rejectControl: (error: Error) => void = () => {};
          const controlFailed = new Promise<never>((_resolve, reject) => { rejectControl = reject; });
          const onControlError = () => { broken = true; rejectControl(new MenuUpstreamError('unavailable')); };
          const work = async () => {
            if (broken) throw new MenuUpstreamError('unavailable');
            if (cancel) {
              if (!Number.isSafeInteger(pid) || !pid || pid <= 0) throw new MenuUpstreamError('unavailable');
              canceller = new OwnedClient({ connectionString, application_name: target.applicationName, connectionTimeoutMillis: 1000, query_timeout: 1000 });
              ownClient(canceller).notify = onControlError;
              await canceller.connect();
              if (broken) throw new MenuUpstreamError('unavailable');
              if (released) return;
              cancelSent = true;
              await canceller.query(extended('SELECT pg_cancel_backend($1)', [pid]));
            }
            if (released) return;
            try {
              if (cursor) await data.query(extended('CLOSE ap_rows'));
              if (released) return;
              if (transaction || cancel) await data.query(extended(completed ? 'COMMIT' : 'ROLLBACK'));
            } catch {
              // CLOSE in an aborted transaction fails; ROLLBACK must still run.
              if (!released) await data.query(extended('ROLLBACK'));
            }
          };
          try {
            // One bound includes sending cancellation AND waiting for CLOSE/ROLLBACK.
            await Promise.race([work(), clientFailed, controlFailed, new Promise<never>((_resolve, reject) => {
              bound = setTimeout(() => reject(new MenuUpstreamError('unavailable')), 1000);
            })]);
          } catch { broken = true; }
          finally {
            clearTimeout(bound);
            // end() destroys an active control socket; never let its promise hold capacity.
            if (canceller) {
              ownClient(canceller).notify = undefined;
              void canceller.end().catch(() => {});
            }
            released = true;
            data.release(broken ? new MenuUpstreamError('unavailable') : undefined);
            // Drop the checkout closure; the creation-time listener remains for life.
            if (lifetime) lifetime.notify = undefined;
            releaseCapacity();
          }
        })();
        return cleaning;
      };
      const stop = (error: Error) => {
        failure ??= error; rejectStop(failure);
        void cleanup(true);
      };
      interrupt = () => stop(new MenuUpstreamError('timeout'));
      const onAbort = () => stop(new MenuUpstreamError('timeout'));
      signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => stop(new TargetJudgmentTimeout()), Math.min(deadlineMs, 2147483647));
      const run = async (text: string, values?: unknown[]) => {
        if (failure) throw failure;
        if (!client) throw new MenuUpstreamError('unavailable');
        return Promise.race([client.query(extended(text, values)), stopped]);
      };
      try {
        release = await gate.acquire(stopped);
        if (failure) throw failure;
        const pending = pool.connect();
        void pending.then((late) => { if (failure && !client) late.release(true); }, () => {});
        client = await Promise.race([pending, stopped]);
        lifetime = ownClient(client);
        lifetime.notify = onClientError;
        if (lifetime.failed) onClientError();
        // pg sets processID from BackendKeyData before resolving pool.connect().
        // The pinned @types/pg predates this runtime field.
        pid = (client as pg.PoolClient & { processID?: number }).processID;
        await run('BEGIN READ ONLY'); transaction = true;
        const remaining = Math.max(1, Math.floor(expires - Date.now()));
        statementBudget = remaining;
        statementStarted = Date.now();
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
        if (returning) return;
        if (signal.aborted) throw new MenuUpstreamError('timeout');
        // Classify from our state, independent of timer/rejection callback ordering.
        // One millisecond allows for the integer statement budget's rounding.
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '57014') {
          if (cancelSent) throw new MenuUpstreamError('unavailable');
          if (statementStarted !== undefined && Date.now() - statementStarted >= statementBudget - 1) throw new TargetJudgmentTimeout();
          throw new MenuUpstreamError('unavailable');
        }
        if (failure) throw failure;
        throw new MenuUpstreamError('unavailable');
      } finally {
        clearTimeout(timer); signal.removeEventListener('abort', onAbort);
        await cleanup(!completed);
        releaseCapacity();
      }
      })();
      return {
        [Symbol.asyncIterator]() { return this; },
        next: () => rows.next(),
        return: async () => {
          returning = true;
          interrupt();
          return rows.return(undefined);
        },
      };
    },
  };
}
