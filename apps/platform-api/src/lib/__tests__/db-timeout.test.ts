import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { installPlatformTransport } from '../../modules/platform-port/transport.js';
import { dbTimeoutKind } from '../db-timeout.js';
import { registerHttpErrorHandler } from '../http-error-handler.js';

const pgError = (code: string) =>
  Object.assign(new Error('canceling statement due to statement timeout'), { code });

describe('dbTimeoutKind', () => {
  it.each([
    [pgError('57014'), 'statement'],
    [pgError('55P03'), 'lock'],
    [pgError('25P03'), 'idle_in_transaction'],
    [new Error('timeout exceeded when trying to connect'), 'pool_acquire'],
    [new Error('Connection terminated due to connection timeout'), 'pool_acquire'],
    [new Error('wrapped', { cause: pgError('57014') }), 'statement'],
    [pgError('23505'), null],
    [new Error('boom'), null],
    ['57014', null],
  ])('%s → %s', (err, kind) => {
    expect(dbTimeoutKind(err)).toBe(kind);
  });
});

const SECRET_SQL = "select * from core.vocs where reporter_email = 'secret@example.com'";

type Logged = { level: number; msg?: string; [key: string]: unknown };

function build(kind: 'root' | 'platform'): { app: FastifyInstance; logs: Logged[] } {
  const logs: Logged[] = [];
  const stream = {
    write(line: string) {
      logs.push(JSON.parse(line) as Logged);
    },
  };
  const app = Fastify({ logger: { level: 'trace', stream } });
  if (kind === 'root') {
    registerHttpErrorHandler(app);
    app.get('/boom', async () => {
      throw Object.assign(new Error(SECRET_SQL), { code: '57014', query: SECRET_SQL });
    });
    app.get('/lock', async () => {
      throw pgError('55P03');
    });
    app.get('/plain', async () => {
      throw new Error('boom');
    });
  } else {
    void app.register(async (scope) => {
      installPlatformTransport(scope, { notFound: false });
      scope.get('/boom', async () => {
        throw Object.assign(new Error(SECRET_SQL), { code: '57014', query: SECRET_SQL });
      });
      scope.get('/lock', async () => {
        throw pgError('55P03');
      });
      scope.get('/plain', async () => {
        throw new Error('boom');
      });
    });
  }
  return { app, logs };
}

describe.each(['root', 'platform'] as const)('%s error handler maps DB timeouts', (kind) => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it('503 service.unavailable envelope with a sanitized warn log', async () => {
    const built = build(kind);
    app = built.app;
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      code: 'service.unavailable',
      message: 'service temporarily unavailable',
    });
    const warn = built.logs.find((l) => l.msg === 'db time budget exceeded');
    expect(warn).toMatchObject({ level: 40, kind: 'statement', sqlstate: '57014' });
    expect(warn?.reqId).toBeTruthy();
    expect(JSON.stringify(built.logs)).not.toContain('secret@example.com');
  });

  it('maps lock timeouts too, and leaves other errors as 500', async () => {
    const built = build(kind);
    app = built.app;
    const lock = await app.inject({ method: 'GET', url: '/lock' });
    expect(lock.statusCode).toBe(503);
    const plain = await app.inject({ method: 'GET', url: '/plain' });
    expect(plain.statusCode).toBe(500);
    expect(plain.json().code).toBe('internal.unexpected');
  });
});
