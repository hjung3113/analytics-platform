import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { DbHandle } from '../db/client.js';

interface Statement {
  text: string;
  params: readonly unknown[];
}

interface Capture {
  statements: Statement[];
  poolStatements: Statement[];
  drizzleStatements: Statement[];
}

/** Use with an isolated test pool and one operation at a time, including Fastify inject. */
export function recordStatements(handle: DbHandle) {
  let active: Capture | undefined;
  const clients = new WeakSet<pg.PoolClient>();

  function wrap(target: pg.Pool | pg.PoolClient, channel: 'poolStatements' | 'statements') {
    const query = target.query;
    target.query = function (this: typeof target, ...args: unknown[]) {
      const [input, values] = args;
      if (active && (typeof input === 'string' || (typeof input === 'object' && input !== null && 'text' in input))) {
        const config = input as pg.QueryConfig;
        active[channel].push({
          text: typeof input === 'string' ? input : config.text,
          params: Array.isArray(values) ? values : (config.values ?? []),
        });
      }
      return Reflect.apply(query, this, args);
    } as typeof query;
  }

  wrap(handle.pool, 'poolStatements');
  handle.pool.on('acquire', (client) => {
    if (clients.has(client)) return;
    clients.add(client);
    // Pool and Drizzle calls both reach the client, so count here once.
    wrap(client, 'statements');
  });

  const db = drizzle(handle.pool, {
    schema: handle.db._.fullSchema,
    logger: { logQuery: (text, params) => void active?.drizzleStatements.push({ text, params }) },
  });

  return {
    handle: { ...handle, db },
    async capture<T>(request: () => Promise<T>) {
      if (active) throw new Error('statement recorder already has an active capture');
      const recorded: Capture = { statements: [], poolStatements: [], drizzleStatements: [] };
      active = recorded;
      try {
        return { result: await request(), ...recorded };
      } finally {
        active = undefined;
      }
    },
  };
}
