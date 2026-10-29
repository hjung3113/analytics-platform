import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import {
  COOKIE,
  WORKSPACE,
  stubCheckService,
  stubDb,
  stubSessionService,
  transportApp,
} from '../../../test-support/platform-route-stubs.js';
import { menuQueryRoutes } from '../routes.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(rows: unknown[] = [], workspaceId = WORKSPACE) {
  const stub = stubDb(rows);
  const instance = await transportApp(async (scoped) => {
    await scoped.register(menuQueryRoutes, {
      prefix: '/api/v1/menu-query',
      sessionService: stubSessionService(workspaceId),
      checkService: stubCheckService(false),
      workspaceId: WORKSPACE,
      db: stub.db,
      now: () => new Date('2026-10-29T00:00:00Z'),
    });
  }, null);
  app = instance;
  return { app: instance, ...stub };
}

const send = (
  instance: FastifyInstance,
  payload: unknown,
  headers: Record<string, string> = COOKIE,
) =>
  instance.inject({
    method: 'POST',
    url: '/api/v1/menu-query',
    headers,
    payload: payload as never,
  });

const query = { endpoint: 'home.notices', context: {}, params: { targetScopeId: null } };

describe('POST /api/v1/menu-query (served: home.notices)', () => {
  it('is served as a route, with no-store, not the documented 404', async () => {
    const { app: instance } = await build();
    const res = await send(instance, query);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({
      outcome: 'empty',
      data: null,
      assessments: [],
      trust: null,
    });
    expect(typeof res.json().correlationId).toBe('string');
  });

  it('returns only the projected Home fields, ok', async () => {
    const row = {
      id: '33333333-3333-4333-8333-333333333333',
      titleKo: '제목',
      titleEn: 'Title',
      contentKo: 'secret content',
      contentEn: 'secret content',
      scopeId: null,
      until: '2026-12-31 23:59:59',
      revision: 4,
      authorActorId: 'author',
      createdAt: new Date(),
      updatedAt: new Date(),
      workspaceId: WORKSPACE,
    };
    const { app: instance } = await build([row]);
    const body = (await send(instance, query)).json();
    expect(body.outcome).toBe('ok');
    expect(body.data).toEqual([
      {
        id: row.id,
        title: { ko: '제목', en: 'Title' },
        scopeId: null,
        until: '2026-12-31T23:59:59',
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/secret|author|version|revision|createdAt/);
  });

  it('answers 401 with no session cookie, before judging the shape', async () => {
    const { app: instance, reads } = await build();
    const res = await send(instance, { nonsense: true }, {});
    expect(res.statusCode).toBe(401);
    expect(reads()).toBe(0);
  });

  it('answers 403 for a session bound to another workspace', async () => {
    const { app: instance } = await build([], '99999999-9999-4999-8999-999999999999');
    expect((await send(instance, query)).statusCode).toBe(403);
  });

  it.each([
    ['unknown endpoint', { ...query, endpoint: 'productivity.summary' }],
    ['context key', { ...query, context: { scopeId: null } }],
    ['extra top-level key', { ...query, extra: 1 }],
    ['unknown param', { ...query, params: { targetScopeId: null, x: 1 } }],
    ['bad param value', { ...query, params: { targetScopeId: 3 } }],
  ])('judges %s as HTTP 200 error with null data and never reads', async (_name, payload) => {
    const { app: instance, reads } = await build();
    const res = await send(instance, payload);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'error', data: null });
    expect(reads()).toBe(0);
  });

  it('judges malformed JSON as an error envelope, not a framework 4xx', async () => {
    const { app: instance } = await build();
    const res = await instance.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { ...COOKIE, 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'error', data: null });
  });

  it('does not claim other paths: a sibling path keeps the default 404', async () => {
    const { app: instance } = await build();
    const res = await instance.inject({
      method: 'POST',
      url: '/api/v1/menu-query/other',
      headers: COOKIE,
      payload: query,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).not.toMatchObject({ code: 'not_found', message: 'route not found' });
  });
});
