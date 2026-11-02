import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import {
  COOKIE,
  CSRF,
  stubDb,
  stubSessionService,
  transportApp,
} from '../../../test-support/platform-route-stubs.js';
import {
  MENU_ACTION_REPLAY_MAX_BYTES,
  fitsReplayRecord,
  judgeActionShape,
  judgeIdempotencyKey,
} from '../action.js';
import { menuActionRoutes } from '../routes.js';
import { registryOf, testAction } from './test-declarations.js';

const key = randomUUID();
const base = { action: 'test.save', context: {}, input: { name: 'a' }, idempotencyKey: key };
const versioned = { ...base, expectedVersion: '1' };

describe('judgeIdempotencyKey (step 2)', () => {
  it('accepts a UUID', () => expect(judgeIdempotencyKey(key)).toBeNull());
  it.each([
    ['undefined', undefined, 'required'],
    ['null', null, 'required'],
    ['empty', '', 'required'],
    ['not a string', 7, 'malformed'],
    ['not a UUID', 'abc', 'malformed'],
    ['UUID with a suffix', `${key}x`, 'malformed'],
  ])('rejects %s with idempotencyKey/%s', (_name, value, code) => {
    expect(judgeIdempotencyKey(value)).toEqual({ path: ['idempotencyKey'], code });
  });
});

describe('judgeActionShape (step 1)', () => {
  const plain = registryOf([], [testAction().declaration]);
  const version = registryOf([], [testAction({ concurrency: 'version' }).declaration]);

  it('accepts the exact request, with or without a key (step 2 judges the key)', () => {
    expect(judgeActionShape(base, plain)).toMatchObject({ ok: true, expectedVersion: null });
    const { idempotencyKey: _key, ...noKey } = base;
    expect(judgeActionShape(noKey, plain)).toMatchObject({ ok: true });
    expect(judgeActionShape(versioned, version)).toMatchObject({ ok: true, expectedVersion: '1' });
  });

  it.each([
    ['null body', null, plain],
    ['array body', [], plain],
    ['unknown action', { ...base, action: 'test.gone' }, plain],
    ['extra top-level key', { ...base, extra: 1 }, plain],
    ['actor smuggled at top level', { ...base, actorId: 'x' }, plain],
    ['missing context', { action: base.action, input: base.input, idempotencyKey: key }, plain],
    ['missing input', { action: base.action, context: {}, idempotencyKey: key }, plain],
    ['context carries scopeId', { ...base, context: { scopeId: 'MEM' } }, plain],
    ['context not an object', { ...base, context: [] }, plain],
    ['input not an object', { ...base, input: null }, plain],
    ['expectedVersion on a none action', { ...base, expectedVersion: '1' }, plain],
    ['version action without expectedVersion', base, version],
    ['version action with a non-string expectedVersion', { ...base, expectedVersion: 1 }, version],
  ])('rejects %s as an error', (_name, body, registry) => {
    expect(judgeActionShape(body, registry)).toMatchObject({ ok: false });
  });
});

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(allow = true) {
  const { declaration, calls } = testAction({}, { allow });
  const stub = stubDb();
  const instance = await transportApp(async (scoped) => {
    await scoped.register(menuActionRoutes, {
      prefix: '/api/v1/menu-action',
      sessionService: stubSessionService(),
      workspaceId: '11111111-1111-4111-8111-111111111111',
      db: stub.db,
      registry: registryOf([], [declaration]),
    });
  }, null);
  app = instance;
  return { app: instance, calls };
}

const send = (
  instance: FastifyInstance,
  payload: unknown,
  headers: Record<string, string> = { ...COOKIE, 'x-csrf-token': CSRF },
) =>
  instance.inject({ method: 'POST', url: '/api/v1/menu-action', headers, payload: payload as never });

describe('POST /api/v1/menu-action (judgment before the transaction)', () => {
  it('answers 401 without a session, before the shape or CSRF', async () => {
    const { app: instance } = await build();
    expect((await send(instance, { nonsense: true }, {})).statusCode).toBe(401);
  });

  it.each([
    ['no CSRF header', COOKIE],
    ['a wrong CSRF token', { ...COOKIE, 'x-csrf-token': 'nope' }],
  ])('answers 403 csrf.invalid with %s, never reaching the handler', async (_name, headers) => {
    const { app: instance, calls } = await build();
    const res = await send(instance, base, headers);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'csrf.invalid' });
    expect(calls.handled).toBe(0);
  });

  it.each([
    ['unknown action', { ...base, action: 'test.gone' }],
    ['extra top-level key', { ...base, extra: 1 }],
    ['context key', { ...base, context: { scopeId: null } }],
  ])('judges %s as HTTP 200 error without a transaction', async (_name, payload) => {
    const { app: instance, calls } = await build();
    const res = await send(instance, payload);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'error', data: null, version: null, fieldErrors: [], replayed: false });
    expect(typeof res.json().correlationId).toBe('string');
    expect(calls.handled).toBe(0);
  });

  it('judges malformed JSON as an error answer, not a framework 4xx', async () => {
    const { app: instance } = await build();
    const res = await instance.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { ...COOKIE, 'x-csrf-token': CSRF, 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'error' });
  });

  it.each([
    ['missing', undefined, 'required'],
    ['empty', '', 'required'],
    ['not a UUID', 'abc', 'malformed'],
  ])('answers invalid idempotencyKey/%s before permission', async (_name, value, code) => {
    // The action is denied to everyone: invalid still wins, because step 2 precedes step 3.
    const { app: instance, calls } = await build(false);
    const { idempotencyKey: _key, ...rest } = base;
    const res = await send(instance, value === undefined ? rest : { ...rest, idempotencyKey: value });
    expect(res.json()).toMatchObject({
      outcome: 'invalid',
      fieldErrors: [{ path: ['idempotencyKey'], code }],
    });
    expect(calls.handled).toBe(0);
  });

  it('answers forbidden before any transaction when the action permission is missing', async () => {
    const { app: instance, calls } = await build(false);
    const res = await send(instance, base);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'forbidden', data: null, version: null });
    expect(calls.handled).toBe(0);
  });

  it('does not claim a sibling path', async () => {
    const { app: instance } = await build();
    const res = await instance.inject({
      method: 'POST',
      url: '/api/v1/menu-action/other',
      headers: { ...COOKIE, 'x-csrf-token': CSRF },
      payload: base,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('fitsReplayRecord (F4)', () => {
  it('accepts an answer within the replay bound and refuses one over it, counting UTF-8 bytes', () => {
    expect(fitsReplayRecord({ data: { text: 'x'.repeat(1000) } })).toBe(true);
    expect(fitsReplayRecord({ data: { text: 'x'.repeat(MENU_ACTION_REPLAY_MAX_BYTES) } })).toBe(false);
    // 3 bytes per char: under the limit by length, over it by bytes.
    expect(fitsReplayRecord({ data: '가'.repeat(MENU_ACTION_REPLAY_MAX_BYTES / 3) })).toBe(false);
  });
});
