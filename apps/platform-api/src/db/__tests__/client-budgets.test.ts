import { EventEmitter } from 'node:events';

import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachPoolErrorListener, createDb } from '../client.js';

const URL = 'postgres://u:p@127.0.0.1:1/none';

describe('createDb time budgets (#1266 b3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies the budgets to the pool options, which derived pools spread', async () => {
    const handle = createDb(URL, {
      budgets: {
        poolMax: 7,
        acquireTimeoutMs: 1_111,
        statementTimeoutMs: 2_222,
        lockTimeoutMs: 3_333,
        idleInTransactionTimeoutMs: 4_444,
      },
    });
    expect(handle.pool.options as unknown as Record<string, unknown>).toMatchObject({
      max: 7,
      connectionTimeoutMillis: 1_111,
      statement_timeout: 2_222,
      lock_timeout: 3_333,
      idle_in_transaction_session_timeout: 4_444,
    });
    await handle.close();
  });

  it('leaves operator pools on server defaults without opts', async () => {
    const handle = createDb(URL);
    const options = handle.pool.options as unknown as Record<string, unknown>;
    expect(options.statement_timeout).toBeUndefined();
    expect(options.lock_timeout).toBeUndefined();
    expect(options.idle_in_transaction_session_timeout).toBeUndefined();
    expect(options.connectionTimeoutMillis).toBeUndefined();
    expect(handle.pool.listenerCount('error')).toBe(0);
    await handle.close();
  });

  it("a pool 'error' event is logged and the process keeps running", async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const onPoolError = vi.fn();
    const handle = createDb(URL, { onPoolError });
    const err = Object.assign(new Error('terminating connection'), { code: '57P01' });
    expect(() => handle.pool.emit('error', err)).not.toThrow();
    expect(onPoolError).toHaveBeenCalledWith(err);
    expect(exit).not.toHaveBeenCalled();
    await handle.close();
  });

  it('attachPoolErrorListener survives a throwing logger', async () => {
    const handle = createDb(URL);
    attachPoolErrorListener(handle.pool, () => {
      throw new Error('logger down');
    });
    expect(() => handle.pool.emit('error', new Error('x'))).not.toThrow();
    await handle.close();
  });

  it('refuses to attach once the pool already has clients', () => {
    const lateBound = { totalCount: 1, on: vi.fn() } as unknown as pg.Pool;
    expect(() => attachPoolErrorListener(lateBound, vi.fn())).toThrow(/before the pool creates/);
    expect(lateBound.on).not.toHaveBeenCalled();
  });

  it('reports one disconnect once per client', async () => {
    const onPoolError = vi.fn();
    const handle = createDb(URL, { onPoolError });
    const client = new EventEmitter() as unknown as pg.PoolClient;
    handle.pool.emit('connect', client);
    handle.pool.emit('acquire', client);
    const first = Object.assign(new Error('terminating'), { code: '25P03' });
    client.emit('error', first);
    client.emit('error', new Error('Connection terminated unexpectedly'));
    expect(onPoolError).toHaveBeenCalledTimes(1);
    expect(onPoolError).toHaveBeenCalledWith(first);
    // another client is reported independently
    const other = new EventEmitter() as unknown as pg.PoolClient;
    handle.pool.emit('connect', other);
    handle.pool.emit('acquire', other);
    other.emit('error', new Error('x'));
    expect(onPoolError).toHaveBeenCalledTimes(2);
    await handle.close();
  });
});
