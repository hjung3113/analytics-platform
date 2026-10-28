// DB-free route checks: everything that must be refused before a query runs (session, CSRF, strict wire schema).
import cookiePlugin from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import type { SessionService } from '../../auth/session-service.js';
import type { CheckService } from '../../permissions/check-service.js';
import { platformSavedViewRoutes } from '../routes.js';

const WS = '11111111-1111-4111-8111-111111111111';
const queries: unknown[] = [];

// A session service that knows one cookie, so a refused request provably never reaches the database.
const sessionService = {
  loadAndTouch: async (cookie: string) =>
    cookie === 'good'
      ? {
          session: { id: 'good', workspaceId: cookie === 'good' ? WS : 'other' },
          actor: {
            id: '22222222-2222-4222-8222-222222222222',
            roleLevel: 'user',
            displayName: 'A',
          },
        }
      : cookie === 'foreign'
        ? {
            session: { id: 'foreign', workspaceId: '33333333-3333-4333-8333-333333333333' },
            actor: { id: 'x', roleLevel: 'user', displayName: 'X' },
          }
        : null,
  getCsrfToken: async (cookie: string) =>
    cookie === 'good' || cookie === 'foreign' ? 'tok' : null,
} as unknown as SessionService;
const db = {
  transaction: async () => {
    queries.push('tx');
    throw new Error('must not reach the database');
  },
} as unknown as Db;

describe('saved-view command route (DB-free refusals)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = Fastify();
    await app.register(cookiePlugin);
    await app.register(platformSavedViewRoutes, {
      prefix: '/api/v1/platform',
      sessionService,
      checkService: {} as CheckService,
      workspaceId: WS,
      db,
    });
    await app.ready();
  });
  afterAll(() => app.close());

  const post = (
    url: string,
    payload: unknown,
    headers: Record<string, string> = {},
    cookie = 'good',
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/platform${url}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'x-csrf-token': 'tok',
        ...headers,
      },
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });

  it('no cookie → 401, wrong csrf → 403 csrf.invalid, a foreign workspace session → 403; all no-store', async () => {
    const noCookie = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/saved-views/commands',
      payload: { version: 1, op: 'listGroups' },
    });
    expect(noCookie.statusCode).toBe(401);
    expect(noCookie.headers['cache-control']).toBe('no-store');
    const badCsrf = await post(
      '/saved-views/commands',
      { version: 1, op: 'listGroups' },
      { 'x-csrf-token': 'nope' },
    );
    expect(badCsrf.statusCode).toBe(403);
    expect(badCsrf.json()).toMatchObject({ code: 'csrf.invalid' });
    expect(badCsrf.headers['cache-control']).toBe('no-store');
    const foreign = await post(
      '/saved-views/commands',
      { version: 1, op: 'listGroups' },
      {},
      'foreign',
    );
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json()).toMatchObject({ code: 'auth.workspace_mismatch' });
  });

  it('people lookup is a read-only route: no CSRF needed, but still session + workspace bound and no-store', async () => {
    const send = (cookie?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/platform/people/lookup',
        headers: {
          ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ ids: ['a', 'a'] }),
      });
    // duplicate ids are refused by the schema (422) only after authentication succeeded and CSRF was not asked for.
    const noCsrf = await send('good');
    expect(noCsrf.statusCode).toBe(422);
    expect(noCsrf.headers['cache-control']).toBe('no-store');
    expect((await send()).statusCode).toBe(401);
    const foreign = await send('foreign');
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json()).toMatchObject({ code: 'auth.workspace_mismatch' });
    // Every saved-view command, reads included, still needs the token.
    const command = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/saved-views/commands',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=good`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ version: 1, op: 'listGroups' }),
    });
    expect(command.statusCode).toBe(403);
    expect(command.json()).toMatchObject({ code: 'csrf.invalid' });
  });

  it.each([
    ['unknown op', { version: 1, op: 'dropEverything' }],
    ['unknown version', { version: 2, op: 'listGroups' }],
    [
      'forged ownerId on save',
      {
        version: 1,
        op: 'save',
        draft: {
          schemaVersion: 1,
          kind: 'condition-set',
          name: 'x',
          context: {},
          ownerId: 'someone',
        },
      },
    ],
    ['forged userId in key', { version: 1, op: 'list', key: { menuId: null, userId: 'someone' } }],
    [
      'forged version on update',
      { version: 1, op: 'update', id: 'a', patch: { version: 9 }, expectedVersion: 1 },
    ],
    [
      'sharing smuggled into a draft',
      {
        version: 1,
        op: 'save',
        draft: {
          schemaVersion: 1,
          kind: 'condition-set',
          name: 'x',
          context: {},
          visibility: { kind: 'official' },
        },
      },
    ],
    ['non-object body', [1, 2]],
  ])('%s → 422 validation, no database access', async (_label, body) => {
    const res = await post('/saved-views/commands', body);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'validation.malformed_request' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(queries).toEqual([]);
  });

  it('malformed JSON, an over-deep body and an over-large body are validation failures, never a 500', async () => {
    expect((await post('/saved-views/commands', '{"version":1,')).statusCode).toBe(422);
    let deep: unknown = 'x';
    for (let i = 0; i < 40; i += 1) deep = { a: deep };
    const nested = await post('/saved-views/commands', {
      version: 1,
      op: 'save',
      draft: {
        schemaVersion: 1,
        kind: 'menu-view',
        name: 'n',
        menuId: 'm',
        menuSchemaVersion: 1,
        context: {},
        page: [],
        chartOptions: {},
        layout: deep,
        panels: null,
      },
    });
    expect(nested.statusCode).toBe(422);
    const big = await post('/saved-views/commands', {
      version: 1,
      op: 'save',
      draft: {
        schemaVersion: 1,
        kind: 'menu-view',
        name: 'n',
        menuId: 'm',
        menuSchemaVersion: 1,
        context: {},
        page: [],
        chartOptions: {},
        layout: 'x'.repeat(300_000),
        panels: null,
      },
    });
    expect(big.statusCode).toBe(422);
    expect(queries).toEqual([]);
  });

  it('a people lookup above 200 ids, duplicates, or empty ids is a validation failure', async () => {
    expect(
      (await post('/people/lookup', { ids: Array.from({ length: 201 }, (_, i) => `id-${i}`) }))
        .statusCode,
    ).toBe(422);
    expect((await post('/people/lookup', { ids: ['a', 'a'] })).statusCode).toBe(422);
    expect((await post('/people/lookup', { ids: [''] })).statusCode).toBe(422);
    expect((await post('/people/lookup', { ids: ['a'], extra: 1 })).statusCode).toBe(422);
    expect(queries).toEqual([]);
  });
});
