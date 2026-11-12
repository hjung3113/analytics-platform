// Forwarder tests (plan node 1729f): DB-free, plugin level. `app.inject` of `menuQueryDispatchRoutes`
// with a synthetic declaration whose `handle` forwards through a fake upstream `fetch`; the identity
// token is verified with `jose` (devDependency). No real network, no real database.

import { generateKeyPairSync } from 'node:crypto';

import cookie from '@fastify/cookie';
import { jwtVerify } from 'jose';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { defined } from '../../../test-support/defined.js';
import { ACTOR, COOKIE, WORKSPACE, stubSessionService } from '../../../test-support/platform-route-stubs.js';
import { createMenuForwarder } from '../forwarder.js';
import { createIdentityTokenSigner } from '../identity-token.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { menuQueryDispatchRoutes } from '../routes.js';
import { testEndpoint } from './test-declarations.js';

const CORRELATION_ID = 'fwd-test-corr-1';
const PATH = '/owner/marts/test.rows';
const BASE_URL = 'http://upstream.test';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const signer = createIdentityTokenSigner({ privateKeyPem, keyId: 'test-key-1' });

interface UpstreamCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
}

type UpstreamAnswer = { status: number; body?: unknown; raw?: string; hangBody?: boolean };
type UpstreamInit = { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal };

/** Records each POST; a hanging header/body read rejects when its signal aborts. */
function fakeUpstream(answer: (call: UpstreamCall) => UpstreamAnswer | 'hang' | 'network') {
  const calls: UpstreamCall[] = [];
  /** Resolves once the fake upstream has received a request (no wall-clock waits in tests). */
  let markReceived: (() => void) | undefined;
  const received = new Promise<void>((resolve) => { markReceived = resolve; });
  const fetch = async (url: string, init: UpstreamInit) => {
    const call = { url, headers: init.headers, body: JSON.parse(init.body) as unknown, signal: init.signal };
    calls.push(call);
    defined(markReceived, 'request receiver')();
    const planned = answer(call);
    const untilAbort = () => new Promise<never>((_resolve, reject) => {
      if (call.signal.aborted) reject(call.signal.reason);
      else call.signal.addEventListener('abort', () => reject(call.signal.reason), { once: true });
    });
    if (planned === 'network') throw new Error('private upstream diagnostics');
    if (planned === 'hang') return untilAbort();
    return {
      ok: planned.status >= 200 && planned.status < 300,
      status: planned.status,
      json: async () => {
        if (planned.hangBody) return untilAbort();
        if (planned.raw !== undefined) throw new Error(planned.raw);
        return planned.body;
      },
    };
  };
  return { fetch, calls, received, last: () => defined(calls[calls.length - 1], 'upstream call') };
}

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); });

const SCOPES = [{ site: 'mills', rooms: ['r1'] }, { site: 'labs', rooms: [] }];

/** An app whose one endpoint `test.rows` forwards to the fake upstream. */
async function forwarderApp(upstream: ReturnType<typeof fakeUpstream>, timeoutMs = 5000, scoped = false, client?: AbortSignal) {
  const forwarder = createMenuForwarder({ baseUrl: BASE_URL, timeoutMs, signer, fetch: upstream.fetch });
  const { declaration } = testEndpoint(scoped ? { requiresScope: true } : {});
  declaration.handle = (args) => forwarder.forward({ endpointId: 'test.rows', path: PATH, args });
  app = Fastify({ logger: false, genReqId: () => CORRELATION_ID });
  // Injection has no live client socket; destroy the raw reply to model a disconnect after POST consumption.
  if (client) app.addHook('onRequest', async (_req, reply) => {
    client.addEventListener('abort', () => reply.raw.destroy(), { once: true });
  });
  await app.register(cookie);
  await app.register(menuQueryDispatchRoutes, {
    sessionService: stubSessionService(),
    workspaceId: WORKSPACE,
    registry: createMenuDispatchRegistry([{ endpoints: [declaration] }], { scopeResolver: { resolve: async () => SCOPES } }),
    sessionVersionOf: async () => 'sv-9',
  });
  await app.ready();
  return app;
}

async function send(instance: FastifyInstance, context = {}) {
  const response = await instance.inject({ method: 'POST', url: '/', headers: COOKIE, payload: { endpoint: 'test.rows', context, params: { q: 'x' } } });
  expect(response.headers).not.toHaveProperty('x-internal-identity');
  expect(response.body).not.toContain('PRIVATE KEY');
  expect(response.body).not.toContain(privateKeyPem);
  const tokenHeader = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: 'test-key-1' })).toString('base64url');
  expect(response.body).not.toContain(`${tokenHeader}.`);
  return response;
}

describe('menu forwarder (1729f)', () => {
  it.each([
    ['ok', { outcome: 'ok', data: [{ id: 1 }], assessments: [{ kind: 'freshness' }], trust: { level: 'mart' }, correlationId: 'up-1' }],
    ['error', { outcome: 'error', data: false, assessments: [], trust: null, message: 'upstream judgment' }],
    ['too_large', { outcome: 'too_large', data: 0, assessments: [], trust: null }],
    ['timeout', { outcome: 'timeout', data: '', assessments: [], trust: null }],
    ['empty', { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'up-2' }],
    ['forbidden', { outcome: 'forbidden', data: null, assessments: [{ kind: 'scope' }], trust: null, message: 'no scope', correlationId: 'up-3' }],
  ] as const)('passes the upstream %s envelope through unchanged', async (_name, envelope) => {
    const upstream = fakeUpstream(() => ({ status: 200, body: envelope }));
    const response = await send(await forwarderApp(upstream));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      outcome: envelope.outcome,
      data: envelope.data,
      assessments: envelope.assessments,
      trust: envelope.trust,
      ...('message' in envelope ? { message: envelope.message } : {}),
      correlationId: CORRELATION_ID,
    });
  });

  it('posts the owner path with correlation id, identity token claims and the original body shape', async () => {
    const upstream = fakeUpstream(() => ({ status: 200, body: { outcome: 'ok', data: null, correlationId: 'up' } }));
    const response = await send(await forwarderApp(upstream));
    expect(response.statusCode).toBe(200);
    const call = upstream.last();
    expect(call.url).toBe(`${BASE_URL}${PATH}`);
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers['x-correlation-id']).toBe(CORRELATION_ID);
    expect(call.body).toEqual({ endpoint: 'test.rows', context: {}, params: { q: 'x' } });
    const { payload } = await jwtVerify(defined(call.headers['x-internal-identity']), publicKey, { algorithms: ['EdDSA'] });
    expect(payload).toMatchObject({
      sub: ACTOR,
      wid: WORKSPACE,
      sv: 'sv-9',
      cid: CORRELATION_ID,
      scopes: [],
      aud: 'analytics',
      htm: 'POST',
      htu: PATH,
    });
    expect((payload.exp as number) - (payload.iat as number)).toBe(30);
  });

  it('serializes each scope grant into the token scopes claim', async () => {
    const upstream = fakeUpstream(() => ({ status: 200, body: { outcome: 'ok', data: null } }));
    const response = await send(await forwarderApp(upstream, 5000, true), { scopeId: 'mills' });
    expect(response.statusCode).toBe(200);
    expect(upstream.last().body).toEqual({ endpoint: 'test.rows', context: { scopeId: 'mills' }, params: { q: 'x' } });
    const { payload } = await jwtVerify(defined(upstream.last().headers['x-internal-identity']), publicKey, { algorithms: ['EdDSA'] });
    expect(payload.scopes).toEqual(SCOPES.map((grant) => JSON.stringify(grant)));
    expect(payload.sv).toBe('sv-9');
    expect(payload.htu).toBe(PATH);
  });

  it.each([
    ['a non-2xx status', () => ({ status: 500, body: { outcome: 'ok' } })],
    ['a non-JSON body', () => ({ status: 200, raw: '<html>upstream exploded</html>' })],
    ['an invalid outcome', () => ({ status: 200, body: { outcome: 'made_up', data: null } })],
    ['an unknown envelope key', () => ({ status: 200, body: { outcome: 'ok', data: null, extra: 'x' } })],
    ['missing data', () => ({ status: 200, body: { outcome: 'ok' } })],
    ['invalid assessments', () => ({ status: 200, body: { outcome: 'ok', data: null, assessments: 'invalid' } })],
    ['a non-object body', () => ({ status: 200, body: 'plain text' })],
  ] as const)('maps %s to 502 without upstream text', async (_name, plan) => {
    const upstream = fakeUpstream(() => plan());
    const response = await send(await forwarderApp(upstream));
    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body).toEqual({ code: 'upstream.unavailable', message: 'menu-query upstream is unavailable', correlationId: CORRELATION_ID });
    expect(response.body).not.toContain('upstream exploded');
  });

  it('maps an upstream timeout to 504', async () => {
    const upstream = fakeUpstream(() => 'hang');
    const response = await send(await forwarderApp(upstream, 20));
    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({ code: 'upstream.timeout', message: 'menu-query upstream timed out', correlationId: CORRELATION_ID });
  });

  it('cancels the upstream request when the client aborts', async () => {
    const upstream = fakeUpstream(() => 'hang');
    const client = new AbortController();
    const instance = await forwarderApp(upstream, 5000, false, client.signal);
    const pending = send(instance);
    const rejected = expect(pending).rejects.toThrow();
    await upstream.received;
    const upstreamAborted = new Promise<void>((resolve) => upstream.last().signal.addEventListener('abort', () => resolve(), { once: true }));
    client.abort();
    await rejected;
    await upstreamAborted;
    expect(upstream.last().signal.aborted).toBe(true);
  });

  it('maps a network error to 502 without its diagnostics', async () => {
    const upstream = fakeUpstream(() => 'network');
    const response = await send(await forwarderApp(upstream));
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ code: 'upstream.unavailable', message: 'menu-query upstream is unavailable', correlationId: CORRELATION_ID });
    expect(response.body).not.toContain('private upstream diagnostics');
  });

  it('maps a timeout while reading the response body to 504', async () => {
    const upstream = fakeUpstream(() => ({ status: 200, hangBody: true }));
    const response = await send(await forwarderApp(upstream, 20));
    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({ code: 'upstream.timeout', message: 'menu-query upstream timed out', correlationId: CORRELATION_ID });
  });

  it('leaks no token or key material in any error response', async () => {
    const upstream = fakeUpstream(() => ({ status: 500, body: { outcome: 'ok' } }));
    const response = await send(await forwarderApp(upstream));
    const token = defined(upstream.last().headers['x-internal-identity']);
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain('PRIVATE KEY');
  });
});
