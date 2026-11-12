import { EventEmitter } from 'node:events';
import pg from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { TargetSecret } from '../../../bundle/secrets.js';
import { MenuUpstreamError } from '../../../forwarder.js';
import { TargetJudgmentTimeout, type ConnectorLeg } from '../../types.js';
import { createPostgresConnector } from '../postgres.js';

const target = { kind: 'sql', dialect: 'postgres', connectionFile: '/synthetic/secret', applicationName: 'syn-lifecycle', pool: { max: 1, concurrency: 1 } } as const;
const secret = { kind: 'sql', connection: new TargetSecret('syn-private') } as const;
const leg: ConnectorLeg = { targetId: 'syn', site: null, rooms: [], call: { statement: 'SELECT 1', params: {} }, bindings: { params: {} } };
const privateError = () => new Error('syn-private-server-text');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture(stall = 'NEVER') {
  vi.useFakeTimers();
  let busy = false;
  const client = Object.assign(new EventEmitter(), {
    processID: 123,
    release: vi.fn(),
    query: vi.fn(async ({ text }: { text: string }) => {
      if (busy || text.startsWith(stall)) { busy = true; return new Promise<pg.QueryResult>(() => {}); }
      return { rows: text.startsWith('FETCH') ? [{ value: 1 }] : [] };
    }),
  });
  const cancel = Object.assign(new EventEmitter(), {
    connect: vi.fn(async () => {}), query: vi.fn(async () => ({ rows: [{ cancelled: true }] })), end: vi.fn(async () => {}),
  });
  vi.spyOn(pg, 'Pool').mockImplementation(function () { return { on: vi.fn(), connect: vi.fn(async () => client) } as unknown as pg.Pool; });
  vi.spyOn(pg, 'Client').mockImplementation(function () { return cancel as unknown as pg.Client; });
  const controller = new AbortController();
  const connector = createPostgresConnector(target, secret);
  const iterator = connector.query(leg, { signal: controller.signal, deadlineMs: 10000, rowCap: 1 })[Symbol.asyncIterator]();
  return { client, cancel, controller, connector, iterator };
}
it.each(['pending', 'yielded'])('C1 sanitizes checked-out client error while %s and destroys it', async (phase) => {
  const f = fixture(phase === 'pending' ? 'FETCH' : 'NEVER');
  const pull = f.iterator.next(); const result = pull.catch((error: unknown) => error);
  if (phase === 'yielded') await pull; else await flush();
  expect(() => f.client.emit('error', privateError())).not.toThrow();
  await vi.advanceTimersByTimeAsync(1100);
  const error = phase === 'yielded' ? await f.iterator.next().catch((value: unknown) => value) : await result;
  expect(error).toEqual(new MenuUpstreamError('unavailable'));
  expect(error).not.toHaveProperty('cause');
  expect(f.client.release).toHaveBeenCalledWith(expect.any(Error));
  expect(f.client.release).toHaveBeenCalledOnce();
});
it('C1 owns cancellation-client error events and destroys the data client', async () => {
  const f = fixture('FETCH');
  f.cancel.connect.mockImplementation(() => new Promise(() => {}));
  const result = f.iterator.next().catch((error: unknown) => error); await flush();
  f.controller.abort(); await flush();
  expect(() => f.cancel.emit('error', privateError())).not.toThrow();
  await vi.advanceTimersByTimeAsync(1100);
  expect(await result).toEqual(new MenuUpstreamError('timeout'));
  expect(f.cancel.end).toHaveBeenCalled();
  expect(f.client.release).toHaveBeenCalledWith(expect.any(Error));
});
it.each(['BEGIN', 'FETCH'])('C2 cancels stalled %s using processID and restores capacity within cleanup bound', async (stage) => {
  const f = fixture(stage);
  const result = f.iterator.next().catch((error: unknown) => error); await flush();
  f.controller.abort(); await flush();
  expect(f.cancel.query).toHaveBeenCalledWith({ text: 'SELECT pg_cancel_backend($1)', values: [123], queryMode: 'extended' });
  await vi.advanceTimersByTimeAsync(1100);
  expect(f.client.release).toHaveBeenCalledWith(expect.any(Error));
  expect(await result).toEqual(new MenuUpstreamError('timeout'));
  f.client.query.mockResolvedValue({ rows: [] });
  const next = f.connector.query(leg, { signal: new AbortController().signal, deadlineMs: 10000, rowCap: 1 })[Symbol.asyncIterator]().next();
  await flush(); expect(await next).toEqual({ done: true, value: undefined });
});
it('C2 destroys data client if cancellation connection stalls', async () => {
  const f = fixture('FETCH'); f.cancel.connect.mockImplementation(() => new Promise(() => {}));
  const result = f.iterator.next().catch((error: unknown) => error); await flush();
  f.controller.abort(); await vi.advanceTimersByTimeAsync(1100);
  expect(f.client.release).toHaveBeenCalledWith(expect.any(Error));
  expect(await result).toEqual(new MenuUpstreamError('timeout'));
});
it('C3 return eagerly interrupts pending FETCH without an aborted signal', async () => {
  const f = fixture('FETCH');
  const result = f.iterator.next().catch((error: unknown) => error); await flush();
  const returned = f.iterator.return?.(); await flush();
  expect(f.cancel.query).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1100);
  expect(await returned).toEqual({ done: true, value: undefined });
  expect(await result).toEqual({ done: true, value: undefined });
  expect(f.controller.signal.aborted).toBe(false);
  expect(f.client.release).toHaveBeenCalledWith(expect.any(Error));
});
it.each(['BEGIN', 'FETCH'])('C4 unrelated 57014 at %s is unavailable regardless of message', async (stage) => {
  const f = fixture();
  const normal = f.client.query.getMockImplementation();
  f.client.query.mockImplementation(async (config) => {
    if (config.text.startsWith(stage)) throw Object.assign(privateError(), { code: '57014', message: 'canceling statement due to statement timeout' });
    return normal?.(config) ?? { rows: [] };
  });
  const error = await f.iterator.next().catch((value: unknown) => value);
  expect(error).toEqual(new MenuUpstreamError('unavailable')); expect(error).not.toHaveProperty('cause');
});
it('C4 owned judgment mechanism produces TargetJudgmentTimeout with no driver text', async () => {
  const f = fixture('FETCH'); const result = f.iterator.next().catch((error: unknown) => error); await flush();
  await vi.advanceTimersByTimeAsync(11100);
  expect(await result).toEqual(new TargetJudgmentTimeout());
});
