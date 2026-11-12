import { EventEmitter } from 'node:events';
import pg from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { TargetSecret } from '../../../bundle/secrets.js';
import type { ConnectorLeg } from '../../types.js';
import { TargetJudgmentTimeout } from '../../types.js';
import { MenuUpstreamError } from '../../../forwarder.js';
import { createPostgresConnector, rewriteStatement } from '../postgres.js';

async function collect(source: AsyncIterable<unknown>): Promise<unknown[]> {
  const rows: unknown[] = []; for await (const row of source) rows.push(row); return rows;
}
const target = { kind: 'sql', dialect: 'postgres', connectionFile: '/synthetic/secret', applicationName: 'syn-reader', pool: { max: 3, concurrency: 2 } } as const;
const secret = { kind: 'sql', connection: new TargetSecret('syn-connection-private') } as const;
const leg: ConnectorLeg = { targetId: 'syn', site: 'SITE-A', rooms: ['RA1'], call: { statement: 'SELECT :site::text, :rooms::text[]', params: { site: 'scope.site', rooms: 'scope.rooms' } }, bindings: { params: { site: 'SITE-A', rooms: ['RA1'] } } };
const options = () => ({ signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 });
afterEach(() => vi.restoreAllMocks());
function fake(errorAt?: string, code = '42501') {
  const commands: { text: string; values?: unknown[] }[] = [];
  const release = vi.fn();
  let fetches = 0;
  const query = vi.fn(async (config: { text: string; values?: unknown[] }) => {
    commands.push(config);
    if (config.text.startsWith(errorAt ?? 'NEVER')) throw Object.assign(new Error('syn-private-statement-value'), { code });
    return { rows: config.text.startsWith('FETCH') ? [{ value: ++fetches }] : config.text === 'SELECT pg_backend_pid() AS pid' ? [{ pid: 123 }] : [] };
  });
  const data = Object.assign(new EventEmitter(), { query, release, processID: 123 });
  const pool = { connect: vi.fn(async () => data), on: vi.fn() };
  const cancel = Object.assign(new EventEmitter(), { connect: vi.fn(async () => {}), query: vi.fn(async () => ({ rows: [] })), end: vi.fn(async () => {}) });
  const pools = vi.spyOn(pg, 'Pool').mockImplementation(function () { return pool as unknown as pg.Pool; });
  vi.spyOn(pg, 'Client').mockImplementation(function () { return cancel as unknown as pg.Client; });
  return { commands, release, query, pool, pools, cancel };
}
it('rewrites only live placeholders using the dialect tokenizer and binds arrays once', () => {
  expect(rewriteStatement("SELECT :a::text, :a, ARRAY[:b], ':x', $$:y$$ /* :z */ -- :q\n", { a: ['syn'], b: 7 })).toEqual({ text: "SELECT $1::text, $1, ARRAY[$2], ':x', $$:y$$ /* :z */ -- :q\n", values: [['syn'], 7] });
});
it('uses read-only transaction, local budget and cursor; stops exactly at rowCap and closes', async () => {
  const f = fake(); const connector = createPostgresConnector(target, secret);
  expect(await collect(connector.query(leg, options()))).toEqual([{ value: 1 }, { value: 2 }]);
  expect(f.commands.map((q) => q.text)).toEqual(['BEGIN READ ONLY', expect.stringMatching(/^SET LOCAL statement_timeout = \d+$/), 'DECLARE ap_rows NO SCROLL CURSOR FOR SELECT $1::text, $2::text[]', 'FETCH FORWARD 1 FROM ap_rows', 'FETCH FORWARD 1 FROM ap_rows', 'CLOSE ap_rows', 'COMMIT']);
  expect(f.commands[2]?.values).toEqual(['SITE-A', ['RA1']]); expect(f.release).toHaveBeenCalledOnce();
});
it('does not acquire or send an empty scoped room list', async () => {
  const f = fake(); expect(await collect(createPostgresConnector(target, secret).query({ ...leg, rooms: [] }, options()))).toEqual([]); expect(f.pool.connect).not.toHaveBeenCalled();
});
it('iterator return cancels backend, closes cursor, rolls back and releases', async () => {
  const f = fake(); const iterator = createPostgresConnector(target, secret).query(leg, options())[Symbol.asyncIterator]();
  await iterator.next(); await iterator.return?.();
  expect(f.cancel.query).toHaveBeenCalledWith({ text: 'SELECT pg_cancel_backend($1)', values: [123], queryMode: 'extended' });
  expect(f.commands.slice(-2).map((q) => q.text)).toEqual(['CLOSE ap_rows', 'ROLLBACK']); expect(f.release).toHaveBeenCalledOnce();
});
it('abort cancels and releases even while consumer is paused at a yielded row', async () => {
  const f = fake(); const controller = new AbortController();
  const iterator = createPostgresConnector(target, secret).query(leg, { ...options(), signal: controller.signal })[Symbol.asyncIterator]();
  await iterator.next(); controller.abort(); await new Promise((resolve) => setTimeout(resolve, 0));
  expect(f.cancel.query).toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  await expect(iterator.next()).rejects.toEqual(new MenuUpstreamError('timeout'));
});
it.each([['FETCH', '57014', new MenuUpstreamError('unavailable')], ['DECLARE', '42601', new MenuUpstreamError('unavailable')], ['BEGIN', '42501', new MenuUpstreamError('unavailable')]])('sanitizes %s / %s without cause or source text', async (stage, code, expected) => {
  fake(stage, code); const result = collect(createPostgresConnector(target, secret).query(leg, options()));
  await expect(result).rejects.toEqual(expected); await result.catch((error: Error) => { expect(error.cause).toBeUndefined(); expect(JSON.stringify(error) + error.message).not.toContain('syn-private'); });
});
it('sanitizes connection failure', async () => {
  const f = fake(); f.pool.connect.mockRejectedValue(new Error('syn-private-connection'));
  await expect(collect(createPostgresConnector(target, secret).query(leg, options()))).rejects.toEqual(new MenuUpstreamError('unavailable'));
});
it('scopes precision and wall-clock text parsers to the pool', () => {
  const f = fake(); const globalParser = pg.types.getTypeParser(1114); createPostgresConnector(target, secret);
  const config = f.pools.mock.calls[0]?.[0];
  expect(config).toMatchObject({ max: 3, application_name: 'syn-reader' });
  for (const oid of [20, 1700, 1114, 1082]) expect(config?.types?.getTypeParser(oid)('2026-11-01 12:00:00')).toBe('2026-11-01 12:00:00');
  expect(pg.types.getTypeParser(1114)).toBe(globalParser);
});
it('pool acquisition consumes judgment budget and releases late arrivals', async () => {
  const f = fake(); let arrive: (client: Awaited<ReturnType<typeof f.pool.connect>>) => void = () => {};
  f.pool.connect.mockImplementation(() => new Promise((resolve) => { arrive = resolve; }));
  const result = collect(createPostgresConnector(target, secret).query(leg, { ...options(), deadlineMs: 10 }));
  await expect(result).rejects.toEqual(new TargetJudgmentTimeout());
  arrive(Object.assign(new EventEmitter(), { query: f.query, release: f.release, processID: 123 })); await Promise.resolve();
  expect(f.release).toHaveBeenCalledWith(true);
});
it('extended protocol is used even when no values are bound', async () => {
  const f = fake();
  await collect(createPostgresConnector(target, secret).query({ ...leg, call: { statement: 'SELECT 1', params: {} }, bindings: { params: {} } }, options()));
  expect(f.commands.find((q) => q.text.startsWith('DECLARE'))).toMatchObject({ queryMode: 'extended', values: [] });
});
