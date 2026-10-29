// DB-free stubs for platform route unit tests: a session service that knows one cookie, a permission
// check that grants `workspace.admin` to chosen actors, and a database whose reads resolve to `rows`.
// Nothing here replaces the DB-backed integration suites; it only reaches the code before the database.

import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Db } from '../db/client.js';
import type { SessionService } from '../modules/auth/session-service.js';
import type { CheckService } from '../modules/permissions/check-service.js';
import { installPlatformTransport } from '../modules/platform-port/transport.js';

export const WORKSPACE = '11111111-1111-4111-8111-111111111111';
export const ACTOR = '22222222-2222-4222-8222-222222222222';
export const CSRF = 'csrf-token-1';
export const COOKIE = { cookie: 'fops_session=session-1' };

export function stubSessionService(workspaceId = WORKSPACE): SessionService {
  const loaded = {
    session: { id: 'session-1', actorId: ACTOR, workspaceId, roleLevel: 'admin' },
    actor: {
      id: ACTOR,
      workspaceId,
      externalId: 'x',
      email: 'a@b.c',
      displayName: 'A',
      roleLevel: 'admin',
      actorType: 'human',
    },
  };
  return {
    loadAndTouch: async (value: string) => (value === 'session-1' ? loaded : null),
    loadActive: async (value: string) => (value === 'session-1' ? loaded : null),
    getCsrfToken: async (value: string) => (value === 'session-1' ? CSRF : null),
  } as unknown as SessionService;
}

export function stubCheckService(admin: boolean): CheckService {
  return { checkCapability: async () => ({ allow: admin }) } as unknown as CheckService;
}

/** A drizzle-shaped read chain that resolves to `rows`, recording that the database was reached. */
export function stubDb(rows: unknown[] = []): { db: Db; reads: () => number } {
  let reads = 0;
  const select = () => {
    reads += 1;
    const chain: Promise<unknown[]> & { from: () => unknown } = Object.assign(
      Promise.resolve(rows),
      {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        for: () => chain,
      },
    );
    return chain;
  };
  const db = {
    select,
    transaction: async () => {
      throw new Error('transaction reached: the request should have been judged earlier');
    },
  } as unknown as Db;
  return { db, reads: () => reads };
}

/**
 * A bare app with cookies. `transport` installs the platform transport policy the way
 * `platformPortRoutes` does for its children; `null` leaves it to the plugin under test.
 */
export async function transportApp(
  register: (app: FastifyInstance) => Promise<void>,
  transport: { notFound: boolean } | null = { notFound: true },
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(async (scoped) => {
    if (transport) installPlatformTransport(scoped, transport);
    await register(scoped);
  });
  await app.ready();
  return app;
}
