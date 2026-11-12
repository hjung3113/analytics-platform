import { createRequire } from 'node:module';

import { menuQueryContextSchema } from '@ap/contract-schemas';

import type { Binding, ParamType } from '../../bundle/bindings.js';
import type { Call } from '../../bundle/calls.js';
import { sqlPlaceholders } from '../../bundle/sql-placeholders.js';
import type { Target } from '../../bundle/targets.js';
import type { TargetSecrets } from '../../bundle/secrets.js';
import { MenuUpstreamError } from '../../forwarder.js';
import { TargetJudgmentTimeout, type Connector } from '../types.js';

type SqlTarget = Extract<Target, { kind: 'sql' }>;
type Bound = readonly [name: string, value: unknown];

/** Under the server's 2100 RPC parameter limit, which sp_executesql's statement and declaration parameters share. */
export const MSSQL_MAX_PARAMETERS = 2000;

/** The part of the mssql 12 API this connector uses; the package ships no types. */
export interface MssqlColumn { name: string; type: unknown; scale?: number }
export interface MssqlRequest {
  stream: boolean;
  arrayRowMode: boolean;
  input(name: string, type: unknown, value: unknown): unknown;
  query(text: string): unknown;
  execute(procedure: string): unknown;
  pause(): unknown;
  resume(): unknown;
  cancel(): unknown;
  on(event: 'recordset', listener: (columns: MssqlColumn[]) => void): unknown;
  on(event: 'row', listener: (row: unknown[]) => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  on(event: 'done', listener: () => void): unknown;
}
export interface MssqlPool {
  connect(): Promise<unknown>;
  on(event: 'error', listener: (error: unknown) => void): unknown;
}
export interface MssqlDriver {
  ConnectionPool: { new (config: Record<string, unknown>): MssqlPool; parseConnectionString(text: string): Record<string, unknown> };
  Request: new (parent: MssqlPool, overrides: { requestTimeout: number }) => MssqlRequest;
  NVarChar: unknown; BigInt: unknown; Float: unknown; Bit: unknown;
  DateTime: unknown; DateTime2: unknown; SmallDateTime: unknown; Date: unknown; Time: unknown; DateTimeOffset: unknown;
  Decimal: unknown; Numeric: unknown; Money: unknown; SmallMoney: unknown;
  Binary: unknown; VarBinary: unknown; Image: unknown; UDT: unknown; Variant: unknown;
}

// --- Exact precise numbers -------------------------------------------------------------------------------------------
// tedious 20 turns decimal/numeric/money into a JS number (lossy above 15 digits) inside its value parser and has no
// option for it. The parser calls `readValue` through the module export with the connection's own options object, so
// one wrapper decodes those types exactly, but only for options objects this connector registered. Every other tedious
// connection in the process keeps the driver's behaviour.

interface TediousMetadata { type: { name: string }; scale?: number }
interface TediousResult { value: unknown; offset: number }
type ReadValue = (buf: Buffer, offset: number, metadata: TediousMetadata, options: object) => TediousResult;
const exactOptions = new WeakSet<object>();

function scaled(magnitude: bigint, negative: boolean, scale: number): string {
  const digits = magnitude.toString().padStart(scale + 1, '0');
  const text = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return negative && magnitude !== 0n ? `-${text}` : text;
}
const money = (buf: Buffer, at: number): string => {
  const value = (BigInt(buf.readInt32LE(at)) << 32n) + BigInt(buf.readUInt32LE(at + 4));
  return scaled(value < 0n ? -value : value, value < 0n, 4);
};
const smallMoney = (buf: Buffer, at: number): string => {
  const value = BigInt(buf.readInt32LE(at));
  return scaled(value < 0n ? -value : value, value < 0n, 4);
};
/** Re-reads the bytes tedious already consumed (start..end); null means a NULL value. */
export function exactNumericText(buf: Buffer, start: number, metadata: TediousMetadata): string | null | undefined {
  switch (metadata.type.name) {
    case 'NumericN': case 'DecimalN': {
      const length = buf.readUInt8(start);
      if (length === 0) return null;
      let magnitude = 0n;
      for (let i = length - 1; i >= 1; i--) magnitude = (magnitude << 8n) + BigInt(buf.readUInt8(start + 1 + i));
      return scaled(magnitude, buf.readUInt8(start + 1) !== 1, metadata.scale ?? 0);
    }
    case 'Money': return money(buf, start);
    case 'SmallMoney': return smallMoney(buf, start);
    case 'MoneyN': {
      const length = buf.readUInt8(start);
      if (length === 0) return null;
      return length === 4 ? smallMoney(buf, start + 1) : money(buf, start + 1);
    }
    default: return undefined;
  }
}
/** Idempotent; returns false when the hook point is missing, so the factory refuses instead of losing precision. */
export function installExactNumericReader(parser: { readValue?: unknown }): boolean {
  if (typeof parser.readValue !== 'function') return false;
  const current = parser.readValue as ReadValue & { apExact?: true };
  if (current.apExact) return true;
  const original = current;
  const wrapped: ReadValue & { apExact?: true } = (buf, offset, metadata, options) => {
    // The original call keeps tedious' own incomplete-buffer signalling and the end offset.
    const result = original(buf, offset, metadata, options);
    if (!exactOptions.has(options)) return result;
    const exact = exactNumericText(buf, offset, metadata);
    return exact === undefined ? result : { value: exact, offset: result.offset };
  };
  wrapped.apExact = true;
  parser.readValue = wrapped;
  return true;
}
export function markExactConnection(connection: unknown): void {
  const options = (connection as { config?: { options?: unknown } } | null)?.config?.options;
  if (typeof options === 'object' && options !== null) exactOptions.add(options);
}

// --- Driver diagnostics ----------------------------------------------------------------------------------------------
// With DEBUG enabling `mssql:*`, the driver writes statement text, procedure names and parameter values to stderr, past
// every sanitization here. Nothing else uses these namespaces, so they are excluded process-wide, on the same `debug`
// copy the installed driver resolves, and the factory refuses when that cannot be done.

/** Appends `-mssql:*` to the namespaces `debug` already has active; returns whether the driver's logger is now off. */
export function silenceDriverDiagnostics(debugLib: { disable(): string; enable(namespaces: string): void; enabled(namespace: string): boolean }): boolean {
  const current = debugLib.disable();
  debugLib.enable([current, '-mssql:*'].filter(Boolean).join(','));
  return !debugLib.enabled('mssql:tedi') && !debugLib.enabled('mssql:base');
}
const diagnosticsSilenced = (() => {
  try {
    const driverRequire = createRequire(createRequire(import.meta.url).resolve('mssql'));
    return silenceDriverDiagnostics(driverRequire('debug') as Parameters<typeof silenceDriverDiagnostics>[0]);
  } catch { return false; }
})();

let loaded: { driver: MssqlDriver; exact: boolean } | undefined;
function defaultDriver(): MssqlDriver {
  if (!diagnosticsSilenced) throw new MenuUpstreamError('unavailable');
  if (!loaded) {
    const require = createRequire(import.meta.url);
    const driver = require('mssql') as MssqlDriver;
    let exact = false;
    try { exact = installExactNumericReader(createRequire(require.resolve('mssql'))('tedious/lib/value-parser.js') as { readValue?: unknown }); } catch { exact = false; }
    loaded = { driver, exact };
  }
  if (!loaded.exact) throw new MenuUpstreamError('unavailable');
  return loaded.driver;
}

// --- Values ----------------------------------------------------------------------------------------------------------

const pad = (value: number, width = 2) => String(value).padStart(width, '0');
/** Under `useUTC: true` tedious stores the wall clock in the UTC fields; the process time zone is never consulted. */
export function wallClockText(date: Date, kind: 'datetime' | 'date' | 'time', scale: number): string {
  const day = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const units = date.getUTCMilliseconds() * 10000 + Math.round(((date as Date & { nanosecondsDelta?: number }).nanosecondsDelta ?? 0) * 1e7);
  const fraction = scale > 0 ? `.${String(units).padStart(7, '0').slice(0, Math.min(scale, 7))}` : '';
  const clock = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}${fraction}`;
  return kind === 'date' ? day : kind === 'time' ? clock : `${day} ${clock}`;
}
function convert(driver: MssqlDriver, column: MssqlColumn, value: unknown): unknown {
  if (value === null) return null;
  const type = column.type;
  if ([driver.Decimal, driver.Numeric, driver.Money, driver.SmallMoney].includes(type)) {
    if (typeof value !== 'string') throw new MenuUpstreamError('unavailable');
    return value;
  }
  if ([driver.DateTimeOffset, driver.Binary, driver.VarBinary, driver.Image, driver.UDT, driver.Variant].includes(type)) throw new MenuUpstreamError('unavailable');
  if (value instanceof Date) {
    if (type === driver.Date) return wallClockText(value, 'date', 0);
    if (type === driver.Time) return wallClockText(value, 'time', column.scale ?? 7);
    if (type === driver.SmallDateTime) return wallClockText(value, 'datetime', 0);
    if (type === driver.DateTime) return wallClockText(value, 'datetime', 3);
    if (type === driver.DateTime2) return wallClockText(value, 'datetime', column.scale ?? 7);
    throw new MenuUpstreamError('unavailable');
  }
  if (typeof value === 'object' || typeof value === 'function') throw new MenuUpstreamError('unavailable');
  return value;
}
function parameterType(driver: MssqlDriver, value: unknown): unknown {
  if (value === null || typeof value === 'string') return driver.NVarChar;
  if (typeof value === 'boolean') return driver.Bit;
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isSafeInteger(value) ? driver.BigInt : driver.Float;
  throw new MenuUpstreamError('unavailable');
}

// --- Calls -----------------------------------------------------------------------------------------------------------

const templates = new Map<string, { names: string[]; spans: { start: number; end: number; name: string }[] }>();
/** `:name` → `@pN` using the mssql lexer. A list value expands the placeholder count only; values stay parameters. */
export function rewriteMssqlStatement(statement: string, params: Readonly<Record<string, unknown>>): { text: string; values: Bound[] } {
  let template = templates.get(statement);
  if (!template) {
    const names = sqlPlaceholders(statement, 'mssql');
    let probe = '__ap_probe';
    while (statement.includes(probe)) probe += '_';
    const spans: { start: number; end: number; name: string }[] = [];
    for (const match of statement.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const offset = match.index;
      const name = match[1] ?? '';
      if (statement[offset - 1] === ':' || !sqlPlaceholders(`${statement.slice(0, offset)}:${probe}`, 'mssql').includes(probe)) continue;
      spans.push({ start: offset, end: offset + match[0].length, name });
    }
    template = { names, spans };
    templates.set(statement, template);
  }
  if (template.names.some((name) => !Object.hasOwn(params, name))) throw new MenuUpstreamError('unavailable');
  const values: Bound[] = [];
  const replacements = new Map<string, string>();
  for (const name of template.names) {
    const value = params[name];
    const items = Array.isArray(value) ? value : [value];
    if (!items.length || values.length + items.length > MSSQL_MAX_PARAMETERS) throw new MenuUpstreamError('unavailable');
    const placeholders = items.map((item) => { values.push([`p${values.length + 1}`, item]); return `@p${values.length}`; });
    replacements.set(name, placeholders.join(', '));
  }
  let text = '';
  let at = 0;
  for (const span of template.spans) { text += `${statement.slice(at, span.start)}${replacements.get(span.name) ?? ''}`; at = span.end; }
  return { text: text + statement.slice(at), values };
}
/** Procedure args bind by declared name; a list reaches a procedure only as one string joined by its listJoin. */
export function procedureArgs(call: Extract<Call, { procedure: string }>, args: Readonly<Record<string, unknown>>): Bound[] {
  return Object.keys(call.args).map((name) => {
    if (!Object.hasOwn(args, name)) throw new MenuUpstreamError('unavailable');
    const value = args[name];
    if (!Array.isArray(value)) return [name, value] as const;
    const separator = call.listJoin?.[name];
    if (separator === undefined || !value.length || value.some((item) => typeof item !== 'string' && typeof item !== 'number')) throw new MenuUpstreamError('unavailable');
    return [name, value.join(separator)] as const;
  });
}
/** Context wire fields that carry an ID set, read from the request Context schema so a new set field is covered. */
const contextListFields: ReadonlySet<string> = new Set(
  Object.entries(menuQueryContextSchema.shape).filter(([, field]) => field.safeParse(['id']).success).map(([name]) => name),
);
function isListBinding(binding: Binding, paramTypes: Readonly<Record<string, ParamType>> | undefined): boolean {
  if (typeof binding !== 'string') return Array.isArray(binding.const);
  if (binding === 'scope.rooms') return true;
  if (binding.startsWith('context.')) return contextListFields.has(binding.slice(8));
  return binding.startsWith('params.') && paramTypes?.[binding.slice(7)]?.type === 'string[]';
}
/** Boot checks for a call on an mssql target: MSSQL has no array parameter, so a list arg needs a declared join. */
export function mssqlCallProblems(call: Call, paramTypes?: Readonly<Record<string, ParamType>>): string[] {
  if (!('procedure' in call)) return [];
  return Object.entries(call.args).filter(([name, binding]) => isListBinding(binding, paramTypes) && call.listJoin?.[name] === undefined)
    .map(([name]) => `sql procedure arg ${name} binds a list and needs listJoin on dialect mssql`);
}

// --- Connector -------------------------------------------------------------------------------------------------------

/** Read-only rests on the target account alone on mssql (ADR-0153 decision 8); no transaction mode pretends otherwise. */
export function createMssqlConnector(target: SqlTarget, secrets: TargetSecrets | undefined, driver: MssqlDriver = defaultDriver()): Connector {
  if (secrets?.kind !== 'sql') throw new MenuUpstreamError('unavailable');
  let parsed: Record<string, unknown>;
  try { parsed = driver.ConnectionPool.parseConnectionString(secrets.connection.reveal().trim()); } catch { throw new MenuUpstreamError('unavailable'); }
  const max = target.pool?.max ?? 4;
  const concurrency = Math.min(max, target.pool?.concurrency ?? 2);
  const options = typeof parsed.options === 'object' && parsed.options !== null ? parsed.options : {};
  const pool = new driver.ConnectionPool({
    ...parsed,
    pool: { max, min: 0, idleTimeoutMillis: 1000 },
    options: { ...options, useUTC: true, debug: { packet: false, data: false, payload: false, token: false }, ...(target.applicationName ? { appName: target.applicationName } : {}) },
    stream: true, arrayRowMode: true,
    beforeConnect: markExactConnection,
  });
  // Pool and idle-connection errors carry driver diagnostics; they never reach the default unhandled path.
  pool.on('error', () => {});
  let connecting: Promise<unknown> | undefined;
  let active = 0;
  const waiters = new Set<() => void>();
  return {
    query(leg, { signal, deadlineMs, rowCap }): AsyncIterableIterator<unknown> {
      let returning = false;
      let interrupt = () => {};
      const rows = (async function* () {
        if (leg.site !== null && leg.rooms.length === 0) return;
        if (!('statement' in leg.call || 'procedure' in leg.call) || !Number.isSafeInteger(rowCap) || rowCap <= 0) throw new MenuUpstreamError('unavailable');
        if (signal.aborted) throw new MenuUpstreamError('timeout');
        if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new TargetJudgmentTimeout();
        const call = leg.call;
        const plan = 'statement' in call
          ? { run: 'query' as const, ...rewriteMssqlStatement(call.statement, leg.bindings.params ?? {}) }
          : { run: 'execute' as const, text: call.procedure, values: procedureArgs(call, leg.bindings.args ?? {}) };
        const types = plan.values.map(([, value]) => parameterType(driver, value));
        const expires = Date.now() + deadlineMs;
        let failure: Error | undefined;
        let wake: (() => void) | undefined;
        let rejectStop: (error: Error) => void = () => {};
        const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
        void stopped.catch(() => {});
        let request: MssqlRequest | undefined;
        let finished = false;
        let settle: () => void = () => {};
        const done = new Promise<void>((resolve) => { settle = resolve; });
        let cancelled = false;
        const cancel = () => {
          if (!request || finished || cancelled) return;
          cancelled = true;
          // A paused request must flow again for the driver to process the attention acknowledgement.
          try { request.cancel(); request.resume(); } catch { /* the driver reports through 'error'/'done' */ }
        };
        const stop = (error: Error) => { failure ??= error; rejectStop(failure); wake?.(); cancel(); };
        interrupt = () => stop(new MenuUpstreamError('timeout'));
        const onAbort = () => stop(new MenuUpstreamError('timeout'));
        signal.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => stop(new TargetJudgmentTimeout()), Math.min(deadlineMs, 2147483647));
        let acquired = false;
        const releaseCapacity = () => {
          if (acquired) { acquired = false; active--; for (const waiter of waiters) waiter(); }
        };
        const queue: unknown[][] = [];
        let columns: MssqlColumn[] | undefined;
        let received = 0;
        let capped = false;
        let driverError: unknown;
        let pending: (() => void) | undefined;
        const nudge = () => { const resume = pending; pending = undefined; resume?.(); };
        try {
          while (active >= concurrency) {
            await Promise.race([new Promise<void>((resolve) => { wake = resolve; waiters.add(resolve); }), stopped]);
            if (wake) waiters.delete(wake);
          }
          if (failure) throw failure;
          active++; acquired = true;
          connecting ??= pool.connect().catch((error: unknown) => { connecting = undefined; throw error; });
          await Promise.race([connecting, stopped]);
          // Acquisition consumed part of the budget; the driver's own limit is what remains.
          const remaining = Math.max(1, Math.floor(expires - Date.now()));
          const current = new driver.Request(pool, { requestTimeout: remaining });
          request = current;
          current.stream = true;
          current.arrayRowMode = true;
          plan.values.forEach(([name, value], index) => current.input(name, types[index], value));
          let recordsets = 0;
          current.on('recordset', (next) => {
            recordsets++;
            // Only one result set has a defined row shape; a second one is refused rather than mixed in.
            if (recordsets > 1) { driverError ??= new MenuUpstreamError('unavailable'); cancel(); nudge(); return; }
            columns = next;
          });
          current.on('row', (row) => {
            if (capped || failure || driverError) return;
            queue.push(row);
            received++;
            if (received >= rowCap) { capped = true; cancel(); } else current.pause();
            nudge();
          });
          current.on('error', (error) => { if (!capped && !driverError) driverError = error; nudge(); });
          // After a stop the driver has released its connection here, even while the consumer is paused at a yield.
          current.on('done', () => { finished = true; settle(); if (failure) releaseCapacity(); nudge(); });
          if (failure) throw failure;
          if (plan.run === 'query') current.query(plan.text); else current.execute(plan.text);
          for (let yielded = 0; yielded < rowCap;) {
            if (failure) throw failure;
            const row = queue.shift();
            if (row) {
              const shape = columns;
              if (!shape || shape.length !== row.length || new Set(shape.map((column) => column.name)).size !== shape.length) throw new MenuUpstreamError('unavailable');
              const record = Object.fromEntries(shape.map((column, index) => [column.name, convert(driver, column, row[index])]));
              yielded++;
              yield record;
              if (!queue.length && !capped && !finished) current.resume();
              continue;
            }
            if (driverError) throw driverError;
            if (finished || capped) break;
            await Promise.race([new Promise<void>((resolve) => { pending = resolve; }), stopped]);
          }
          if (failure) throw failure;
          if (driverError) throw driverError;
        } catch (error) {
          if (returning) return;
          if (signal.aborted) throw new MenuUpstreamError('timeout');
          if (failure) throw failure;
          if (error instanceof MenuUpstreamError) throw new MenuUpstreamError(error.kind);
          if (!cancelled && typeof error === 'object' && error !== null && 'code' in error && error.code === 'ETIMEOUT') throw new TargetJudgmentTimeout();
          throw new MenuUpstreamError('unavailable');
        } finally {
          clearTimeout(timer); signal.removeEventListener('abort', onAbort);
          if (wake) waiters.delete(wake);
          if (request && !finished) {
            cancel();
            // The driver returns the connection to its pool on 'done'; bound the wait like the postgres cleanup.
            let bound: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([done, new Promise<void>((resolve) => { bound = setTimeout(resolve, 1000); })]);
            clearTimeout(bound);
          }
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
