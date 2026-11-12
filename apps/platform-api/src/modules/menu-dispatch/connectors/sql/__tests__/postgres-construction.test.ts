import { EventEmitter } from 'node:events';
import pg from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { TargetSecret } from '../../../bundle/secrets.js';
import { MenuUpstreamError } from '../../../forwarder.js';
import { type ConnectorLeg } from '../../types.js';
import { createPostgresConnector } from '../postgres.js';

const leg: ConnectorLeg = { targetId: 'syn', site: null, rooms: [], call: { statement: 'SELECT 1', params: {} }, bindings: { params: {} } };
afterEach(() => { vi.restoreAllMocks(); });
it('C1 owns failed-connect clients from construction through late teardown errors without reuse', async () => {
  const RealPool = pg.Pool;
  const clients: EventEmitter[] = [];
  const query = vi.fn();
  const end = vi.fn((callback?: () => void) => { callback?.(); return Promise.resolve(); });
  const connectThrows: unknown[] = [];
  vi.spyOn(pg, 'Client').mockImplementation(function () {
    const client = Object.assign(new EventEmitter(), {
      query, end,
      connect: (callback: (error: Error) => void) => {
        // No pool connect event or idle listener exists at this point.
        try { client.emit('error', new Error('syn-private-connecting')); } catch (error) { connectThrows.push(error); }
        callback(new Error('syn-private-connect-failure'));
      },
    });
    clients.push(client);
    return client as unknown as pg.Client;
  });
  vi.spyOn(pg, 'Pool').mockImplementation(function (options) {
    // Exercise real pg-pool creation/failure/removal, with no network sockets.
    return new RealPool({ ...options, Client: options?.Client ?? pg.Client });
  });
  const connector = createPostgresConnector({ kind: 'sql', dialect: 'postgres', connectionFile: '/synthetic', applicationName: 'syn-construction', pool: { max: 1, concurrency: 1 } }, { kind: 'sql', connection: new TargetSecret('syn-private') });
  for (let attempt = 0; attempt < 2; attempt++) {
    const error = await connector.query(leg, { signal: new AbortController().signal, deadlineMs: 10000, rowCap: 1 })[Symbol.asyncIterator]().next().catch((value: unknown) => value);
    expect(error).toEqual(new MenuUpstreamError('unavailable'));
    expect(error).not.toHaveProperty('cause');
    expect(clients).toHaveLength(attempt + 1);
    for (const client of clients) {
      // First emission removes pg-pool's idle handler; ownership must survive it.
      expect(() => client.emit('error', new Error('syn-private-late'))).not.toThrow();
      expect(() => client.emit('error', new Error('syn-private-after-teardown'))).not.toThrow();
    }
    expect(connectThrows).toEqual([]);
  }
  expect(query).not.toHaveBeenCalled();
  expect(end).toHaveBeenCalled();
});
