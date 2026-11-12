// Forwarder tests (plan node 1729f): DB-free, plugin level. `app.inject` of `menuQueryDispatchRoutes`
// with a synthetic declaration whose `handle` forwards through a fake upstream `fetch`; the identity
// token is verified with `jose` (devDependency). Loopback HTTP verifies native fetch; no database.

import { generateKeyPairSync } from 'node:crypto';
import { createServer, type RequestListener } from 'node:http';

import cookie from '@fastify/cookie';
import { jwtVerify } from 'jose';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { defined } from '../../../test-support/defined.js';
import { ACTOR, COOKIE, WORKSPACE, stubSessionService } from '../../../test-support/platform-route-stubs.js';
import { createMenuForwarder, type MenuUpstreamFetch } from '../forwarder.js';
import { createIdentityTokenSigner } from '../identity-token.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { menuQueryDispatchRoutes } from '../routes.js';
import { testEndpoint } from './test-declarations.js';

const CORRELATION_ID = 'fwd-test-corr-1';
const PATH = '/owner/marts/test.rows';
const BASE_URL = 'http://upstream.test';
const ENVELOPE = { outcome: 'ok', data: null, assessments: [], trust: null, correlationId: CORRELATION_ID } as const;
const ASSESSMENT = {
  kind: 'collection', state: 'confirmed', statusSource: 'owner', observedAt: '2026-11-12T00:00:00Z',
  reason: 'check_failed', explainsEmpty: false, detail: 'owner assessment',
} as const;
const TRUST = {
  updatedAt: '2026-11-12T00:00:00Z', dataThrough: null, coverage: 0, metricVersion: 'v1',
  sourceLogicVersions: ['owner-v1'], provisional: false, source: 'owner',
};

/** Independent loopback origins; close even when the regression assertion fails. */
async function origin(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

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
async function forwarderApp(upstream: ReturnType<typeof fakeUpstream>, timeoutMs = 5000, scoped = false, client?: AbortSignal,
  config: { baseUrl?: string; path?: string; fetch?: MenuUpstreamFetch; errors?: Error[] } = {},
) {
  const forwarder = createMenuForwarder({ baseUrl: config.baseUrl ?? BASE_URL, timeoutMs, signer, fetch: config.fetch ?? upstream.fetch });
  const { declaration } = testEndpoint(scoped ? { requiresScope: true } : {});
  declaration.handle = (args) => forwarder.forward({ endpointId: 'test.rows', path: config.path ?? PATH, args });
  app = Fastify({ logger: false, genReqId: () => CORRELATION_ID });
  app.addHook('onError', async (_req, _reply, error) => { config.errors?.push(error); });
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
    { ...ENVELOPE, data: [{ id: 1 }], assessments: [ASSESSMENT], trust: TRUST },
    { ...ENVELOPE, outcome: 'error', data: false, message: 'upstream judgment' },
    { ...ENVELOPE, outcome: 'too_large', data: 0 },
    { ...ENVELOPE, outcome: 'timeout', data: '' },
    { ...ENVELOPE, outcome: 'empty' },
    { ...ENVELOPE, outcome: 'forbidden', assessments: [ASSESSMENT], message: 'no scope' },
  ])('passes the upstream $outcome envelope through unchanged', async (envelope) => {
    const upstream = fakeUpstream(() => ({ status: 200, body: envelope }));
    const response = await send(await forwarderApp(upstream));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(envelope);
  });

  it.each([301, 302, 303, 307, 308])('rejects a native %s redirect without contacting the second origin', async (status) => {
    const destinationCalls: unknown[] = [];
    const destination = await origin((req, res) => {
      destinationCalls.push({ headers: req.headers, method: req.method });
      req.resume();
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ENVELOPE));
    });
    let ownerCalls = 0;
    const owner = await origin((req, res) => {
      ownerCalls++;
      req.resume();
      res.writeHead(status, { location: `${destination.url}/escaped` }).end();
    });
    try {
      const upstream = fakeUpstream(() => 'network');
      const response = await send(await forwarderApp(upstream, 5000, false, undefined, { baseUrl: owner.url, fetch }));
      expect(ownerCalls).toBe(1);
      expect(destinationCalls).toEqual([]);
      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ code: 'upstream.unavailable', message: 'menu-query upstream is unavailable', correlationId: CORRELATION_ID });
    } finally {
      await Promise.all([owner.close(), destination.close()]);
    }
  });

  it('signs the final pathname including the base prefix seen by the upstream', async () => {
    let wirePath: string | undefined;
    let identity: string | undefined;
    const owner = await origin((req, res) => {
      wirePath = req.url;
      identity = req.headers['x-internal-identity'] as string;
      req.resume();
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ENVELOPE));
    });
    try {
      const upstream = fakeUpstream(() => 'network');
      const response = await send(await forwarderApp(upstream, 5000, false, undefined, {
        baseUrl: `${owner.url}/internal`, path: '/owner/query', fetch,
      }));
      expect(response.statusCode).toBe(200);
      expect(wirePath).toBe('/internal/owner/query');
      const { payload } = await jwtVerify(defined(identity), publicKey, { algorithms: ['EdDSA'] });
      expect(payload.htu).toBe(wirePath);
    } finally {
      await owner.close();
    }
  });

  it.each([
    'owner/query', '/owner/../query', '/../query', '/owner/..', '/owner/./query',
    '/owner/query#fragment', '/owner/query?x=1', '/owner\\query',
    '/owner/%2e%2e/query', '/owner/%2E./query', '/owner/.%2e/query', '/owner/%2e/query',
  ])('rejects invalid owner path %s before contacting upstream', async (path) => {
    const upstream = fakeUpstream(() => ({ status: 200, body: ENVELOPE }));
    const errors: Error[] = [];
    const response = await send(await forwarderApp(upstream, 5000, false, undefined, { path, errors }));
    expect(response.statusCode).toBe(500);
    expect(defined(errors[0]).message).toContain('Invalid menu upstream owner path');
    expect(upstream.calls).toEqual([]);
  });

  it('posts the owner path with correlation id, identity token claims and the original body shape', async () => {
    const upstream = fakeUpstream(() => ({ status: 200, body: ENVELOPE }));
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
    const upstream = fakeUpstream(() => ({ status: 200, body: ENVELOPE }));
    const response = await send(await forwarderApp(upstream, 5000, true), { scopeId: 'mills' });
    expect(response.statusCode).toBe(200);
    expect(upstream.last().body).toEqual({ endpoint: 'test.rows', context: { scopeId: 'mills' }, params: { q: 'x' } });
    const { payload } = await jwtVerify(defined(upstream.last().headers['x-internal-identity']), publicKey, { algorithms: ['EdDSA'] });
    expect(payload.scopes).toEqual(SCOPES.map((grant) => JSON.stringify(grant)));
    expect(payload.sv).toBe('sv-9');
    expect(payload.htu).toBe(PATH);
  });

  it.each([
    ['a non-2xx status', { status: 500, body: ENVELOPE }],
    ['a redirect response', { status: 307, body: ENVELOPE }],
    ['a non-JSON body', { status: 200, raw: '<html>upstream exploded</html>' }],
    ['an invalid outcome', { status: 200, body: { ...ENVELOPE, outcome: 'made_up' } }],
    ['an unknown envelope key', { status: 200, body: { ...ENVELOPE, extra: 'x' } }],
    ['invalid assessments', { status: 200, body: { ...ENVELOPE, assessments: 'invalid' } }],
    ['a null assessment', { status: 200, body: { ...ENVELOPE, assessments: [null] } }],
    ['a missing assessment state', { status: 200, body: { ...ENVELOPE, assessments: [{ kind: 'collection' }] } }],
    ['an invalid assessment kind', { status: 200, body: { ...ENVELOPE, assessments: [{ ...ASSESSMENT, kind: 'freshness' }] } }],
    ['an invalid assessment timestamp', { status: 200, body: { ...ENVELOPE, assessments: [{ ...ASSESSMENT, observedAt: 'today' }] } }],
    ['an unknown assessment field', { status: 200, body: { ...ENVELOPE, assessments: [{ ...ASSESSMENT, extra: 1 }] } }],
    ['non-object trust', { status: 200, body: { ...ENVELOPE, trust: 42 } }],
    ['missing trust fields', { status: 200, body: { ...ENVELOPE, trust: { source: 'owner' } } }],
    ['invalid nested trust', { status: 200, body: { ...ENVELOPE, trust: { ...TRUST, provisional: 'false' } } }],
    ['an invalid trust timestamp', { status: 200, body: { ...ENVELOPE, trust: { ...TRUST, updatedAt: 'today' } } }],
    ['duplicate source versions', { status: 200, body: { ...ENVELOPE, trust: { ...TRUST, sourceLogicVersions: ['v1', 'v1'] } } }],
    ['empty source versions', { status: 200, body: { ...ENVELOPE, trust: { ...TRUST, sourceLogicVersions: [] } } }],
    ['an unknown trust field', { status: 200, body: { ...ENVELOPE, trust: { ...TRUST, extra: 1 } } }],
    ['mismatched correlationId', { status: 200, body: { ...ENVELOPE, correlationId: 'upstream-cid' } }],
    ['non-string correlationId', { status: 200, body: { ...ENVELOPE, correlationId: 42 } }],
    ['a non-object body', { status: 200, body: 'plain text' }],
    ...['outcome', 'data', 'assessments', 'trust', 'correlationId'].map((field) => [
      `missing ${field}`, { status: 200, body: Object.fromEntries(Object.entries(ENVELOPE).filter(([key]) => key !== field)) },
    ] as const),
  ] as const)('maps %s to 502 without upstream text', async (_name, plan) => {
    const upstream = fakeUpstream(() => plan);
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
