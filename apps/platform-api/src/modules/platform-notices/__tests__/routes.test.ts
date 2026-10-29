import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import {
  COOKIE,
  CSRF,
  WORKSPACE,
  stubCheckService,
  stubDb,
  stubSessionService,
  transportApp,
} from '../../../test-support/platform-route-stubs.js';
import { requireCsrf } from '../../platform-port/csrf.js';
import { createAuthenticator } from '../../platform-port/transport.js';
import { platformNoticeRoutes } from '../routes.js';

const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const create = {
  title: { ko: '제목', en: 'Title' },
  content: { ko: '내용', en: 'Content' },
  scopeId: null,
  until: '2026-12-31T23:59:59',
  idempotencyKey: KEY,
};
const write = { ...COOKIE, 'x-csrf-token': CSRF, 'idempotency-key': KEY };

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(options: { admin: boolean; rows?: unknown[] }) {
  const stub = stubDb(options.rows);
  const sessionService = stubSessionService();
  const instance = await transportApp(async (scoped) => {
    await scoped.register(platformNoticeRoutes, {
      db: stub.db,
      checkService: stubCheckService(options.admin),
      authenticate: createAuthenticator({ sessionService, workspaceId: WORKSPACE }),
      csrf: requireCsrf(sessionService),
    });
  });
  app = instance;
  return { app: instance, ...stub };
}

const post = (
  instance: FastifyInstance,
  url: string,
  payload: unknown,
  headers: Record<string, string> = write,
) => instance.inject({ method: 'POST', url, headers, payload: payload as never });

describe('notice write routes (judged before the database)', () => {
  it('keeps 401 without a cookie and 403 for a bad CSRF token', async () => {
    const { app: instance } = await build({ admin: true });
    expect((await post(instance, '/notices/save', create, {})).statusCode).toBe(401);
    const bad = await post(instance, '/notices/save', create, {
      ...COOKIE,
      'x-csrf-token': 'wrong',
    });
    expect(bad.statusCode).toBe(403);
    expect(bad.json()).toMatchObject({ code: 'csrf.invalid' });
  });

  it.each(['/notices/save', '/notices/delete'])(
    '%s answers forbidden (HTTP 200 ActionResponse) before looking at the body',
    async (url) => {
      const { app: instance } = await build({ admin: false });
      const res = await post(instance, url, { not: 'even valid' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.json()).toMatchObject({
        outcome: 'forbidden',
        data: null,
        version: null,
        fieldErrors: [],
        replayed: false,
      });
      expect(res.json()).not.toHaveProperty('assessments');
      expect(res.json()).not.toHaveProperty('trust');
    },
  );

  it('judges malformed JSON as an invalid ActionResponse, not 4xx', async () => {
    const { app: instance } = await build({ admin: true });
    const res = await post(instance, '/notices/save', '{nope', {
      ...write,
      'content-type': 'application/json',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      outcome: 'invalid',
      fieldErrors: [{ path: [], code: 'malformed' }],
    });
  });

  it.each([
    ['forged author', { ...create, author: 'someone' }, write, 'invalid'],
    ['missing body key', { ...create, idempotencyKey: undefined }, write, 'invalid'],
    ['missing key header', create, { ...COOKIE, 'x-csrf-token': CSRF }, 'invalid'],
    ['impossible date', { ...create, until: '2026-02-30T00:00:00' }, write, 'invalid'],
    ['site target', { ...create, scopeId: 'MEM' }, write, 'invalid'],
    [
      'key header differs from body',
      create,
      { ...write, 'idempotency-key': '3f2504e0-4f89-41d3-9a0c-0305e82c3302' },
      'error',
    ],
    ['If-Match on a create', create, { ...write, 'if-match': 'v1' }, 'error'],
  ])('%s is judged without reaching the transaction', async (_name, payload, headers, outcome) => {
    const { app: instance } = await build({ admin: true });
    const res = await post(instance, '/notices/save', payload, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome, data: null, replayed: false });
  });

  it('delete without If-Match is an error; a delete body with draft fields is invalid', async () => {
    const { app: instance } = await build({ admin: true });
    const del = { id: ID, expectedVersion: 'v1', idempotencyKey: KEY };
    expect((await post(instance, '/notices/delete', del)).json()).toMatchObject({
      outcome: 'error',
    });
    const extra = await post(
      instance,
      '/notices/delete',
      { ...del, title: create.title },
      { ...write, 'if-match': 'v1' },
    );
    expect(extra.json()).toMatchObject({
      outcome: 'invalid',
      fieldErrors: [{ path: ['title'], code: 'unknown_key' }],
    });
  });
});

describe('GET /notices', () => {
  it('answers 401 without a session and an empty envelope when there is nothing global', async () => {
    const { app: instance } = await build({ admin: false });
    expect((await instance.inject({ method: 'GET', url: '/notices' })).statusCode).toBe(401);
    const res = await instance.inject({ method: 'GET', url: '/notices', headers: COOKIE });
    expect(res.json()).toMatchObject({
      outcome: 'empty',
      data: null,
      assessments: [],
      trust: null,
    });
  });

  it('lists rows without author or timestamps, version as vN', async () => {
    const row = {
      id: ID,
      workspaceId: WORKSPACE,
      authorActorId: 'author-secret',
      titleKo: '제목',
      titleEn: 'Title',
      contentKo: '내용',
      contentEn: 'Content',
      scopeId: null,
      until: '2026-12-31 23:59:59',
      revision: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { app: instance } = await build({ admin: false, rows: [row] });
    const body = (
      await instance.inject({ method: 'GET', url: '/notices', headers: COOKIE })
    ).json();
    expect(body.outcome).toBe('ok');
    expect(body.data.items).toEqual([
      {
        id: ID,
        title: { ko: '제목', en: 'Title' },
        content: { ko: '내용', en: 'Content' },
        scopeId: null,
        until: '2026-12-31T23:59:59',
        version: 'v2',
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/author|createdAt|updatedAt/);
  });
});
