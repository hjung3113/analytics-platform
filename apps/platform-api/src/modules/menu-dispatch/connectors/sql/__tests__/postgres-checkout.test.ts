import { EventEmitter } from 'node:events';
import pg from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { TargetSecret } from '../../../bundle/secrets.js';
import { MenuUpstreamError } from '../../../forwarder.js';
import { TargetJudgmentTimeout, type ConnectorLeg } from '../../types.js';
import { createPostgresConnector } from '../postgres.js';

const leg: ConnectorLeg = { targetId: 'syn', site: null, rooms: [], call: { statement: 'SELECT 1', params: {} }, bindings: { params: {} } };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture(checkoutError = false) {
  vi.useFakeTimers();
  const started = Date.now();
  const controller = new AbortController();
  let fetch: () => Promise<{ rows: unknown[] }> = async () => ({ rows: [] });
  let statementBudget = 0;
  let checkoutThrown: unknown;
  const client = Object.assign(new EventEmitter(), {
    processID: 123, release: vi.fn(),
    query: vi.fn(async ({ text }: { text: string }) => {
      if (text.startsWith('SET LOCAL')) statementBudget = Number(text.split(' = ')[1]);
      if (text.startsWith('FETCH')) return fetch();
      return { rows: [] };
    }),
  });
  const pool = Object.assign(new EventEmitter(), {
    connect: vi.fn(() => new Promise((resolve) => {
      pool.emit('connect', client);
      // pg-pool resolves checkout synchronously, then pg-protocol can emit another
      // packet's error before any promise continuation attaches a checkout listener.
      resolve(client);
      if (checkoutError) {
        try { client.emit('error', new Error('syn-private-driver')); } catch (error) { checkoutThrown = error; }
      }
    })),
  });
  const cancel = Object.assign(new EventEmitter(), {
    connect: vi.fn(async () => {}), query: vi.fn(async () => ({ rows: [] })), end: vi.fn(async () => {}),
  });
  vi.spyOn(pg, 'Pool').mockImplementation(function () { return pool as unknown as pg.Pool; });
  vi.spyOn(pg, 'Client').mockImplementation(function () { return cancel as unknown as pg.Client; });
  const connector = createPostgresConnector({ kind: 'sql', dialect: 'postgres', connectionFile: '/synthetic', applicationName: 'syn-checkout' }, { kind: 'sql', connection: new TargetSecret('syn-private') });
  const iterator = connector.query(leg, { signal: controller.signal, deadlineMs: 10000, rowCap: 1 })[Symbol.asyncIterator]();
  return { client, cancel, controller, iterator, checkoutThrown: () => checkoutThrown, setFetch: (fn: typeof fetch) => { fetch = fn; }, elapsed: (offset = 0) => vi.setSystemTime(started + statementBudget + offset) };
}
it('C1 owns synchronous checkout errors before the await continuation', async () => {
  const f = fixture(true);
  const error = await f.iterator.next().catch((value: unknown) => value);
  expect(f.checkoutThrown()).toBeUndefined();
  expect(error).toEqual(new MenuUpstreamError('unavailable'));
  expect(error).not.toHaveProperty('cause');
  expect(f.client.release).toHaveBeenCalledOnce();
  expect(f.client.release).toHaveBeenCalledWith(new MenuUpstreamError('unavailable'));
  expect(f.client.query).not.toHaveBeenCalled();
  expect(() => f.client.emit('error', new Error('syn-private-late'))).not.toThrow();
});
it.each([0, -1])('C4 owns server 57014 before local timer fires at budget offset %s', async (offset) => {
  const f = fixture();
  f.setFetch(async () => {
    f.elapsed(offset); // Move the clock without executing the local timer callback.
    throw Object.assign(new Error('syn-private'), { code: '57014' });
  });
  const error = await f.iterator.next().catch((value: unknown) => value);
  expect(error).toEqual(new TargetJudgmentTimeout());
  expect(error).not.toHaveProperty('cause');
  expect(f.cancel.query).toHaveBeenCalled();
});
it('C4 external early 57014 remains unavailable even with spoofed timeout text', async () => {
  const f = fixture();
  f.setFetch(async () => { throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }); });
  expect(await f.iterator.next().catch((value: unknown) => value)).toEqual(new MenuUpstreamError('unavailable'));
});
it.each(['abort-first', 'rejection-first'] as const)('C4 core abort racing 57014 is timeout: %s', async (order) => {
  const f = fixture();
  f.setFetch(() => {
    f.elapsed();
    const error = Object.assign(new Error('syn-private'), { code: '57014' });
    if (order === 'abort-first') { f.controller.abort(); return Promise.reject(error); }
    const rejected = Promise.reject(error);
    queueMicrotask(() => f.controller.abort());
    return rejected;
  });
  expect(await f.iterator.next().catch((value: unknown) => value)).toEqual(new MenuUpstreamError('timeout'));
});
