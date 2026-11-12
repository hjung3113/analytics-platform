// Every Date in this file must be judged in a non-UTC zone (wall clock may not shift).
process.env.TZ = 'Asia/Seoul';

import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

import { routedBundle } from '../../../__tests__/bundle-fixtures.js';
import type { CheckService } from '../../../../permissions/check-service.js';
import { declaredContribution } from '../../../declared-endpoints.js';
import type { DeclarationBundle } from '../../../declarations-file.js';
import { TargetSecret } from '../../../bundle/secrets.js';
import { MenuUpstreamError } from '../../../forwarder.js';
import { TargetJudgmentTimeout, type ConnectorLeg } from '../../types.js';
import {
  createMssqlConnector, installExactNumericReader, markExactConnection, MSSQL_MAX_PARAMETERS, mssqlCallProblems,
  rewriteMssqlStatement, silenceDriverDiagnostics, type MssqlColumn, type MssqlDriver,
} from '../mssql.js';

const T = Object.fromEntries(['NVarChar', 'BigInt', 'Float', 'Bit', 'Int', 'DateTime', 'DateTime2', 'SmallDateTime', 'Date', 'Time', 'DateTimeOffset', 'Decimal', 'Numeric', 'Money', 'SmallMoney', 'Binary', 'VarBinary', 'Image', 'UDT', 'Variant'].map((name) => [name, { name }]));
interface Script { columns?: MssqlColumn[]; rows?: unknown[][]; error?: unknown; hang?: boolean; second?: boolean }
class FakeRequest extends EventEmitter {
  stream = false; arrayRowMode = false; paused = false; ended = false; cancels = 0;
  inputs: unknown[][] = []; calls: string[][] = [];
  #flow = () => {};
  constructor(readonly parent: unknown, readonly overrides: { requestTimeout: number }, readonly script: Script) { super(); }
  input(name: string, type: unknown, value: unknown) { this.inputs.push([name, type, value]); }
  query(text: string) { this.calls.push(['query', text]); this.#start(); }
  execute(name: string) { this.calls.push(['execute', name]); this.#start(); }
  pause() { this.paused = true; }
  resume() { this.paused = false; setImmediate(() => this.#flow()); }
  cancel() {
    this.cancels++;
    if (this.ended) return;
    this.ended = true;
    setImmediate(() => { this.emit('error', Object.assign(new Error('Canceled. syn-private-cancel'), { code: 'ECANCEL' })); this.emit('done'); });
  }
  #start() {
    const rows = this.script.rows ?? [];
    let next = 0;
    setImmediate(() => {
      this.emit('recordset', this.script.columns ?? [{ name: 'room', type: T.NVarChar }]);
      if (this.script.second) this.emit('recordset', [{ name: 'other', type: T.NVarChar }]);
      this.#flow = () => {
        while (!this.paused && !this.ended && next < rows.length) this.emit('row', rows[next++]);
        if (!this.ended && next >= rows.length && !this.script.hang) {
          this.ended = true;
          if (this.script.error) this.emit('error', this.script.error);
          this.emit('done');
        }
      };
      this.#flow();
    });
  }
}
function fake(script: Script = { rows: [['RA1'], ['RA1'], ['RA1']] }) {
  const requests: FakeRequest[] = [];
  const pools: { config: Record<string, unknown>; connect: ReturnType<typeof vi.fn> }[] = [];
  const connect = vi.fn(async () => ({}));
  const driver = {
    ...T,
    ConnectionPool: class {
      static parseConnectionString(text: string) {
        if (text.includes('broken')) throw new Error(`syn-private-parse ${text}`);
        return { server: 'syn-host.invalid', database: 'syn', options: { encrypt: true, useUTC: false } };
      }
      connect = connect;
      constructor(readonly config: Record<string, unknown>) { pools.push(this); }
      on() { return this; }
    },
    Request: class extends FakeRequest {
      constructor(parent: unknown, overrides: { requestTimeout: number }) { super(parent, overrides, script); requests.push(this); }
    },
  } as unknown as MssqlDriver;
  return { driver, requests, pools, connect };
}
async function collect(source: AsyncIterable<unknown>): Promise<unknown[]> {
  const rows: unknown[] = []; for await (const row of source) rows.push(row); return rows;
}
const target = { kind: 'sql', dialect: 'mssql', connectionFile: '/synthetic/secret', applicationName: 'syn-reader', pool: { max: 3, concurrency: 1 } } as const;
const secret = { kind: 'sql', connection: new TargetSecret('Server=syn-host.invalid;Database=syn;User Id=syn;Password=syn-private-password') } as const;
const statementLeg: ConnectorLeg = { targetId: 'syn', site: 'SITE-A', rooms: ['RA1', 'RA2'], call: { statement: 'SELECT room FROM syn.rows WHERE site = :site AND room IN (:rooms)', params: { site: 'scope.site', rooms: 'scope.rooms' } }, bindings: { params: { site: 'SITE-A', rooms: ['RA1', 'RA2'] } } };
const procedureLeg: ConnectorLeg = { targetId: 'syn', site: 'SITE-A', rooms: ['RA1', 'RA2'], call: { procedure: 'syn.read_rows', args: { rooms: 'scope.rooms', q: 'params.q' }, listJoin: { rooms: '|' } }, bindings: { args: { rooms: ['RA1', 'RA2'], q: 'syn-q' } } };
const options = (over: Partial<{ signal: AbortSignal; deadlineMs: number; rowCap: number }> = {}) => ({ signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2, ...over });
const sanitized = async (result: Promise<unknown>, expected: Error) => {
  const error = await result.then(() => undefined, (value: unknown) => value);
  expect(error).toEqual(expected);
  expect((error as Error).cause).toBeUndefined();
  expect(JSON.stringify(error) + (error as Error).message).not.toMatch(/syn-private|SELECT|syn\.read_rows|RA1|syn-q/);
};

it('rewrites live placeholders with the mssql lexer, expanding list placeholders in order and binding each value once', () => {
  expect(rewriteMssqlStatement("SELECT :a, [:x], ':y' /* :z */ -- :q\nFROM t WHERE r IN (:rooms) AND a = :a AND c = x::y", { a: 'A', rooms: ['R1', 'R2', 'R3'] })).toEqual({
    text: "SELECT @p1, [:x], ':y' /* :z */ -- :q\nFROM t WHERE r IN (@p2, @p3, @p4) AND a = @p1 AND c = x::y",
    values: [['p1', 'A'], ['p2', 'R1'], ['p3', 'R2'], ['p4', 'R3']],
  });
});
it('caps expanded parameters and never expands an empty list', () => {
  const list = (count: number) => Array.from({ length: count }, (_, index) => `R${index}`);
  expect(rewriteMssqlStatement('SELECT 1 WHERE r IN (:rooms)', { rooms: list(MSSQL_MAX_PARAMETERS) }).values).toHaveLength(MSSQL_MAX_PARAMETERS);
  expect(() => rewriteMssqlStatement('SELECT 1 WHERE r IN (:rooms)', { rooms: list(MSSQL_MAX_PARAMETERS + 1) })).toThrow(new MenuUpstreamError('unavailable'));
  expect(() => rewriteMssqlStatement('SELECT 1 WHERE r IN (:rooms)', { rooms: [] })).toThrow(new MenuUpstreamError('unavailable'));
});
it('refuses an over-cap statement before acquiring a connection', async () => {
  const f = fake(); const rooms = Array.from({ length: MSSQL_MAX_PARAMETERS + 1 }, (_, index) => `R${index}`);
  await sanitized(collect(createMssqlConnector(target, secret, f.driver).query({ ...statementLeg, rooms, bindings: { params: { site: 'SITE-A', rooms } } }, options())), new MenuUpstreamError('unavailable'));
  expect(f.connect).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
});
it('does not acquire or send an empty scoped room list', async () => {
  const f = fake();
  expect(await collect(createMssqlConnector(target, secret, f.driver).query({ ...statementLeg, rooms: [], bindings: { params: { site: 'SITE-A', rooms: [] } } }, options()))).toEqual([]);
  expect(f.connect).not.toHaveBeenCalled(); expect(f.requests).toHaveLength(0);
});
it('streams a statement with typed parameters and cancels the request at rowCap', async () => {
  const f = fake();
  expect(await collect(createMssqlConnector(target, secret, f.driver).query(statementLeg, options()))).toEqual([{ room: 'RA1' }, { room: 'RA1' }]);
  const [request] = f.requests;
  expect(request?.calls).toEqual([['query', 'SELECT room FROM syn.rows WHERE site = @p1 AND room IN (@p2, @p3)']]);
  expect(request?.inputs).toEqual([['p1', T.NVarChar, 'SITE-A'], ['p2', T.NVarChar, 'RA1'], ['p3', T.NVarChar, 'RA2']]);
  expect(request).toMatchObject({ stream: true, arrayRowMode: true, cancels: 1, ended: true });
  expect(request?.overrides.requestTimeout).toBeGreaterThan(0); expect(request?.overrides.requestTimeout).toBeLessThanOrEqual(1000);
});
it('calls a procedure through the RPC path with args bound by name and lists joined by listJoin', async () => {
  const f = fake({ rows: [['RA1']] });
  expect(await collect(createMssqlConnector(target, secret, f.driver).query(procedureLeg, options()))).toEqual([{ room: 'RA1' }]);
  const [request] = f.requests;
  expect(request?.calls).toEqual([['execute', 'syn.read_rows']]);
  expect(request?.inputs).toEqual([['rooms', T.NVarChar, 'RA1|RA2'], ['q', T.NVarChar, 'syn-q']]);
  // No statement text is built for a procedure: the only call is the RPC execute.
  expect(request?.calls.some(([kind]) => kind === 'query')).toBe(false);
});
it('refuses a procedure list arg without listJoin before sending anything', async () => {
  const f = fake(); const call = { procedure: 'syn.read_rows', args: { rooms: 'scope.rooms', q: 'params.q' } } as const;
  await sanitized(collect(createMssqlConnector(target, secret, f.driver).query({ ...procedureLeg, call }, options())), new MenuUpstreamError('unavailable'));
  expect(f.requests).toHaveLength(0);
});
it('abort while the consumer is paused at a row cancels the request and releases the connection slot', async () => {
  const f = fake(); const connector = createMssqlConnector(target, secret, f.driver); const controller = new AbortController();
  const iterator = connector.query(statementLeg, options({ signal: controller.signal, rowCap: 3 }))[Symbol.asyncIterator]();
  await iterator.next(); controller.abort(); await new Promise((resolve) => setTimeout(resolve, 5));
  expect(f.requests[0]?.cancels).toBe(1);
  // concurrency is 1: a second query can only start once the aborted one released its slot.
  expect(await collect(connector.query(statementLeg, options({ rowCap: 1 })))).toEqual([{ room: 'RA1' }]);
  await expect(iterator.next()).rejects.toEqual(new MenuUpstreamError('timeout'));
});
it('iterator return cancels the request and waits for its release', async () => {
  const f = fake(); const iterator = createMssqlConnector(target, secret, f.driver).query(statementLeg, options({ rowCap: 3 }))[Symbol.asyncIterator]();
  await iterator.next(); await iterator.return?.();
  expect(f.requests[0]?.cancels).toBe(1); expect(f.requests[0]?.ended).toBe(true);
});
it('maps the driver request timeout to TargetJudgmentTimeout', async () => {
  const f = fake({ error: Object.assign(new Error('Timeout: Request failed to complete in 5ms syn-private-statement'), { code: 'ETIMEOUT' }) });
  await sanitized(collect(createMssqlConnector(target, secret, f.driver).query(statementLeg, options())), new TargetJudgmentTimeout());
});
it('the judgment budget includes acquisition: a hung request is cancelled as TargetJudgmentTimeout', async () => {
  const f = fake({ hang: true });
  await sanitized(collect(createMssqlConnector(target, secret, f.driver).query(statementLeg, options({ deadlineMs: 20 }))), new TargetJudgmentTimeout());
  expect(f.requests[0]?.cancels).toBe(1);
  const slow = fake(); slow.connect.mockImplementation(() => new Promise(() => {}));
  await sanitized(collect(createMssqlConnector(target, secret, slow.driver).query(statementLeg, options({ deadlineMs: 20 }))), new TargetJudgmentTimeout());
});
it.each([
  ['login', { connect: Object.assign(new Error("Login failed for user 'syn-private-user'"), { code: 'ELOGIN' }) }],
  ['connect', { connect: Object.assign(new Error('Failed to connect to syn-private-host:1433'), { code: 'ESOCKET' }) }],
  ['syntax', { error: Object.assign(new Error("Incorrect syntax near 'syn-private-statement'"), { code: 'EREQUEST', number: 102 }) }],
  ['unknown procedure', { error: Object.assign(new Error("Could not find stored procedure 'syn.read_rows'"), { code: 'EREQUEST', number: 2812 }) }],
  ['permission denied', { error: Object.assign(new Error('The EXECUTE permission was denied on syn-private-object'), { code: 'EREQUEST', number: 229 }) }],
])('sanitizes %s failure to a fixed unavailable error', async (_name, failure) => {
  const f = fake('error' in failure ? { error: failure.error } : undefined);
  if ('connect' in failure) f.connect.mockRejectedValue(failure.connect);
  await sanitized(collect(createMssqlConnector(target, secret, f.driver).query(procedureLeg, options())), new MenuUpstreamError('unavailable'));
});
it('refuses a second result set and duplicate column names', async () => {
  await sanitized(collect(createMssqlConnector(target, secret, fake({ rows: [['RA1']], second: true }).driver).query(statementLeg, options())), new MenuUpstreamError('unavailable'));
  const duplicate = fake({ columns: [{ name: 'room', type: T.NVarChar }, { name: 'room', type: T.NVarChar }], rows: [['RA1', 'RA2']] });
  await sanitized(collect(createMssqlConnector(target, secret, duplicate.driver).query(statementLeg, options())), new MenuUpstreamError('unavailable'));
});
it('scopes pool settings to the target: pool size, appName, useUTC and the exact-number marker', () => {
  const f = fake(); createMssqlConnector(target, secret, f.driver);
  expect(f.pools[0]?.config).toMatchObject({ pool: { max: 3, min: 0 }, options: { encrypt: true, useUTC: true, appName: 'syn-reader' }, beforeConnect: markExactConnection });
  const plain = fake(); createMssqlConnector({ kind: 'sql', dialect: 'mssql', connectionFile: '/synthetic/secret' }, secret, plain.driver);
  expect(plain.pools[0]?.config).toMatchObject({ pool: { max: 4 } });
  expect((plain.pools[0]?.config.options as Record<string, unknown>).appName).toBeUndefined();
  let error: unknown;
  try { createMssqlConnector(target, { kind: 'sql', connection: new TargetSecret('broken syn-private-password') }, fake().driver); } catch (value) { error = value; }
  expect(error).toEqual(new MenuUpstreamError('unavailable')); expect(JSON.stringify(error) + (error as Error).message).not.toContain('syn-private');
});

// Real tedious value parser: exact precise numbers on registered connections only.
const valueParser = createRequire(createRequire(import.meta.url).resolve('mssql'))('tedious/lib/value-parser.js') as { readValue: (buf: Buffer, offset: number, metadata: unknown, options: object) => { value: unknown; offset: number } };
const le = (value: bigint, bytes: number) => { const out = Buffer.alloc(bytes); for (let i = 0; i < bytes; i++) out[i] = Number((value >> BigInt(8 * i)) & 0xffn); return out; };
it('decodes decimal(38,10), money and bigint exactly on a registered connection, and leaves other connections unchanged', () => {
  expect(installExactNumericReader(valueParser)).toBe(true); expect(installExactNumericReader(valueParser)).toBe(true);
  const registered = { useUTC: true }; markExactConnection({ config: { options: registered } });
  const decimal = (sign: number) => Buffer.concat([Buffer.from([17, sign]), le(12345678901234567890123456780123456789n, 16)]);
  const meta = { type: { name: 'DecimalN' }, precision: 38, scale: 10 };
  expect(valueParser.readValue(decimal(1), 0, meta, registered)).toEqual({ value: '1234567890123456789012345678.0123456789', offset: 18 });
  expect(valueParser.readValue(decimal(0), 0, meta, registered).value).toBe('-1234567890123456789012345678.0123456789');
  expect(valueParser.readValue(Buffer.from([5, 1, 5, 0, 0, 0]), 0, { type: { name: 'NumericN' }, precision: 9, scale: 3 }, registered).value).toBe('0.005');
  expect(valueParser.readValue(Buffer.from([0]), 0, meta, registered).value).toBeNull();
  const moneyBytes = (value: bigint) => { const out = Buffer.alloc(8); out.writeInt32LE(Number(BigInt.asIntN(32, value >> 32n)), 0); out.writeUInt32LE(Number(value & 0xffffffffn), 4); return out; };
  expect(valueParser.readValue(Buffer.concat([Buffer.from([8]), moneyBytes(922337203685477_5807n)]), 0, { type: { name: 'MoneyN' } }, registered).value).toBe('922337203685477.5807');
  expect(valueParser.readValue(moneyBytes(-12345n), 0, { type: { name: 'Money' } }, registered).value).toBe('-1.2345');
  const big = Buffer.alloc(9); big[0] = 8; big.writeBigInt64LE(9007199254740993n, 1);
  expect(valueParser.readValue(big, 0, { type: { name: 'IntN' } }, registered).value).toBe('9007199254740993');
  // An unregistered connection keeps the driver's own (lossy) number.
  expect(typeof valueParser.readValue(decimal(1), 0, meta, { useUTC: true }).value).toBe('number');
});
it('emits precise numbers as strings and date/time columns as wall-clock text under a non-UTC process zone', async () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-540);
  // datetime2(7) 2026-11-01 12:34:56.1234567 through the real parser with useUTC.
  // TDS date: days since 0001-01-01; 2000-01-01 is day 730119.
  const epochDays = BigInt((Date.UTC(2026, 10, 1) - Date.UTC(2000, 0, 1)) / 86400000) + 730119n;
  const time = (12n * 3600n + 34n * 60n + 56n) * 10000000n + 1234567n;
  const parsed = valueParser.readValue(Buffer.concat([Buffer.from([8]), le(time, 5), le(epochDays, 3)]), 0, { type: { name: 'DateTime2' }, scale: 7 }, { useUTC: true }).value as Date;
  const columns: MssqlColumn[] = [
    { name: 'amount', type: T.Decimal }, { name: 'total', type: T.BigInt }, { name: 'at', type: T.DateTime2, scale: 7 },
    { name: 'day', type: T.Date }, { name: 'legacy', type: T.DateTime }, { name: 'small', type: T.SmallDateTime },
  ];
  const f = fake({ columns, rows: [['1234567890123456789012345678.0123456789', '9007199254740993', parsed, new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 10, 1, 23, 59, 59, 997)), new Date(Date.UTC(2026, 10, 1, 23, 59))]] });
  expect(await collect(createMssqlConnector(target, secret, f.driver).query(statementLeg, options()))).toEqual([{
    amount: '1234567890123456789012345678.0123456789', total: '9007199254740993', at: '2026-11-01 12:34:56.1234567',
    day: '2026-11-01', legacy: '2026-11-01 23:59:59.997', small: '2026-11-01 23:59:00',
  }]);
});
it.each([
  ['a lossy driver number in a decimal column', { name: 'amount', type: T.Decimal }, 1.5],
  ['datetimeoffset', { name: 'at', type: T.DateTimeOffset }, new Date(0)],
  ['binary', { name: 'blob', type: T.VarBinary }, Buffer.from('syn-private')],
])('refuses %s with a fixed message', async (_name, column, value) => {
  await sanitized(collect(createMssqlConnector(target, secret, fake({ columns: [column], rows: [[value]] }).driver).query(statementLeg, options())), new MenuUpstreamError('unavailable'));
});
it.each(['lineNames', 'roomNames', 'prcGroups', 'selection', 'lotIds', 'recipeIds'])('boot: context.%s is a list and needs listJoin; scalar context fields do not', (field) => {
  const call = (listJoin?: Record<string, string>) => ({ procedure: 'syn.read_rows', args: { ids: `context.${field}`, ppid: 'context.ppid', from: 'context.from' }, ...(listJoin ? { listJoin } : {}) });
  expect(mssqlCallProblems(call())).toEqual(['sql procedure arg ids binds a list and needs listJoin on dialect mssql']);
  expect(mssqlCallProblems(call({ ids: ',' }))).toEqual([]);
});
it('keeps the tedious packet/data/payload/token debug options off, whatever the connection string says', () => {
  const f = fake({});
  createMssqlConnector(target, secret, f.driver);
  expect(f.pools[0]?.config.options).toMatchObject({ debug: { packet: false, data: false, payload: false, token: false } });
});
it('silences mssql:* diagnostics on the given debug copy and reports failure when they stay on', () => {
  let namespaces = 'syn-other:*';
  const lib = (stays: boolean) => ({
    disable: () => { const current = namespaces; namespaces = ''; return current; },
    enable: (next: string) => { namespaces = next; },
    enabled: (name: string) => (stays ? true : !namespaces.split(',').includes('-mssql:*') && name.startsWith('mssql:')),
  });
  expect(silenceDriverDiagnostics(lib(false))).toBe(true);
  expect(namespaces).toBe('syn-other:*,-mssql:*');
  expect(silenceDriverDiagnostics(lib(true))).toBe(false);
});
it('boot: a list arg needs listJoin on mssql; statements, joined lists and a missing applicationName boot', () => {
  const procedure = (listJoin?: Record<string, string>) => ({ procedure: 'syn.read_rows', args: { rooms: 'scope.rooms', tags: 'params.tags', fixed: { const: ['A'] }, q: 'params.q' }, ...(listJoin ? { listJoin } : {}) });
  const types = { tags: { type: 'string[]' as const }, q: { type: 'string' as const } };
  expect(mssqlCallProblems(procedure(), types)).toEqual(['rooms', 'tags', 'fixed'].map((name) => `sql procedure arg ${name} binds a list and needs listJoin on dialect mssql`));
  expect(mssqlCallProblems(procedure({ rooms: ',', tags: ',', fixed: ',' }), types)).toEqual([]);
  expect(mssqlCallProblems({ statement: 'SELECT 1 WHERE r IN (:rooms)', params: { rooms: 'scope.rooms' } }, types)).toEqual([]);
  const base = routedBundle();
  const bundle = { ...base, targets: { 'tgt-1': { kind: 'sql', dialect: 'mssql', connectionFile: '/synthetic/secret' } },
    endpointOwners: { 'syn.rows': { ...base.endpointOwners['syn.rows'], call: { procedure: 'syn.read_rows', args: { rooms: 'scope.rooms', q: 'params.q' }, listJoin: { rooms: ',' } } } } };
  expect(() => declaredContribution({ bundle: bundle as unknown as DeclarationBundle, checkService: {} as CheckService })).not.toThrow();
});
